import { promises as fs } from 'node:fs'
import { createHash, createDecipheriv, createCipheriv } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { store } from '../store'

/**
 * RPF tables of contents (and some files) are AES-256-ECB encrypted with a key
 * baked into GTA5.exe. We never ship the key: we scan the user's own executable
 * for the 32-byte block whose SHA-1 matches the well-known value (same method as
 * OpenIV / CodeWalker). GTA V applies exactly ONE ECB pass.
 */
const GTA5_AES_KEY_SHA1 = 'a0796128a775720ac204d9819f68c172e3952c6d'

let cachedKey: Buffer | null = null
let scanPromise: Promise<Buffer | null> | null = null

function candidateExe(gamePath: string): string | null {
  for (const name of ['GTA5.exe', 'GTA5_Enhanced.exe', 'PlayGTAV.exe']) {
    const p = join(gamePath, name)
    if (existsSync(p)) return p
  }
  return null
}

/** Scan GTA5.exe for the AES key; cache it, and never block the event loop. */
export async function loadAesKey(gamePath: string): Promise<Buffer | null> {
  if (cachedKey) return cachedKey

  const exe = candidateExe(gamePath)
  if (!exe) return null

  const stat = await fs.stat(exe).catch(() => null)
  if (!stat) return null
  const cacheTag = `${stat.size}`
  const saved = store.get('rpfAesKey') as { tag: string; hex: string } | undefined
  if (saved?.tag === cacheTag) {
    cachedKey = Buffer.from(saved.hex, 'hex')
    return cachedKey
  }

  if (scanPromise) return scanPromise
  scanPromise = (async () => {
    const buf = await fs.readFile(exe)
    const yieldEvery = 400_000
    for (let i = 0; i + 32 <= buf.length; i++) {
      if (i % yieldEvery === 0) await new Promise((r) => setImmediate(r))
      if (createHash('sha1').update(buf.subarray(i, i + 32)).digest('hex') === GTA5_AES_KEY_SHA1) {
        cachedKey = Buffer.from(buf.subarray(i, i + 32))
        store.set('rpfAesKey', { tag: cacheTag, hex: cachedKey.toString('hex') })
        return cachedKey
      }
    }
    return null
  })()
  try {
    return await scanPromise
  } finally {
    scanPromise = null
  }
}

/** AES-256-ECB over the 16-byte-aligned portion, `rounds` times (GTA V uses 1). */
export function aesCrypt(
  data: Buffer,
  key: Buffer,
  mode: 'decrypt' | 'encrypt',
  rounds = 1,
): Buffer {
  const len = data.length & ~15
  const out = Buffer.from(data)
  if (len === 0) return out
  for (let r = 0; r < rounds; r++) {
    const cipher =
      mode === 'decrypt'
        ? createDecipheriv('aes-256-ecb', key, null)
        : createCipheriv('aes-256-ecb', key, null)
    cipher.setAutoPadding(false)
    const head = Buffer.concat([cipher.update(out.subarray(0, len)), cipher.final()])
    head.copy(out, 0)
  }
  return out
}

export const aesDecrypt = (data: Buffer, key: Buffer, rounds = 1): Buffer =>
  aesCrypt(data, key, 'decrypt', rounds)
export const aesEncrypt = (data: Buffer, key: Buffer, rounds = 1): Buffer =>
  aesCrypt(data, key, 'encrypt', rounds)
