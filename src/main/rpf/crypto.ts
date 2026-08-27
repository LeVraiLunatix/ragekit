import { promises as fs } from 'node:fs'
import { createHash, createDecipheriv, createCipheriv } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { store } from '../store'

/**
 * GTA V (Legacy) encrypts RPF tables of contents — and some contained files —
 * with AES-256-ECB applied 16 times, using a key baked into GTA5.exe. We never
 * ship the key: we scan the user's own executable for the 32-byte block whose
 * SHA-1 matches the well-known value, exactly like OpenIV / CodeWalker.
 */
const GTA5_AES_KEY_SHA1 = 'dea375ef1e6ef2223a1221c2c575c47bf17efa5e'
const AES_ROUNDS = 16

let cachedKey: Buffer | null = null

function candidateExe(gamePath: string): string | null {
  for (const name of ['GTA5.exe', 'GTA5_Enhanced.exe', 'PlayGTAV.exe']) {
    const p = join(gamePath, name)
    if (existsSync(p)) return p
  }
  return null
}

let scanPromise: Promise<Buffer | null> | null = null

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

  // De-dupe concurrent callers.
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

function aesRound(data: Buffer, key: Buffer, mode: 'decrypt' | 'encrypt'): Buffer {
  const len = data.length & ~15
  if (len === 0) return Buffer.from(data)
  const head = data.subarray(0, len)
  const tail = data.subarray(len)
  const cipher =
    mode === 'decrypt'
      ? createDecipheriv('aes-256-ecb', key, null)
      : createCipheriv('aes-256-ecb', key, null)
  cipher.setAutoPadding(false)
  const out = Buffer.concat([cipher.update(head), cipher.final()])
  return Buffer.concat([out, tail]) as Buffer
}

/** AES-256-ECB, 16 iterations, over the 16-byte-aligned portion only. */
export function aesDecrypt(data: Buffer, key: Buffer): Buffer {
  let out: Buffer = Buffer.from(data)
  for (let r = 0; r < AES_ROUNDS; r++) out = aesRound(out, key, 'decrypt')
  return out
}

export function aesEncrypt(data: Buffer, key: Buffer): Buffer {
  let out: Buffer = Buffer.from(data)
  for (let r = 0; r < AES_ROUNDS; r++) out = aesRound(out, key, 'encrypt')
  return out
}
