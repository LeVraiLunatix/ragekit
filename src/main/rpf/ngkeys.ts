import { promises as fs, existsSync, statSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { join } from 'node:path'
import { app } from 'electron'
import { aesDecrypt, loadAesKey } from './crypto'
import type { NgKeys } from './ng'

/**
 * NG key material. CodeWalker's `magic.dat` is a scrambled blob of
 * [NG keys 27472][NG decrypt tables 278528][hash LUT 256][AWC key 16], XORed
 * with four .NET-Random streams seeded from a Jenkins hash of the AES key, then
 * AES-decrypted (1 round) and raw-deflated. We fetch magic.dat from the
 * CodeWalker repo (MIT), cache it, and unscramble it with the user's own AES
 * key — so nothing usable is stored and the game must be owned.
 */
const MAGIC_URL =
  'https://raw.githubusercontent.com/dexyfex/CodeWalker/master/CodeWalker.Core/Resources/magic.dat'
const MAGIC_SIZE = 154069
const NG_KEYS_LEN = 27472
const NG_TABLES_LEN = 278528
const LUT_LEN = 256

let cache: NgKeys | null = null
let deriving: Promise<NgKeys | null> | null = null

function magicPath(): string {
  return join(app.getPath('userData'), 'codewalker-magic.dat')
}

export function magicCached(): boolean {
  try {
    return existsSync(magicPath()) && statSync(magicPath()).size === MAGIC_SIZE
  } catch {
    return false
  }
}

/** Download magic.dat from CodeWalker if we don't have it. */
export async function ensureMagic(force = false): Promise<Buffer> {
  const p = magicPath()
  if (!force) {
    try {
      const b = await fs.readFile(p)
      if (b.length === MAGIC_SIZE) return b
    } catch {
      /* fetch */
    }
  }
  const res = await fetch(MAGIC_URL, { headers: { 'user-agent': 'Ragekit' } })
  if (!res.ok) throw new Error(`Could not download CodeWalker magic.dat (${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length !== MAGIC_SIZE) {
    throw new Error(`Downloaded magic.dat is ${buf.length} bytes, expected ${MAGIC_SIZE}.`)
  }
  await fs.writeFile(p, buf)
  return buf
}

/** Jenkins one-at-a-time over bytes — for the .NET Random seed. */
function jenkGenHash(data: Uint8Array): number {
  let h = 0
  for (let i = 0; i < data.length; i++) {
    h = (h + data[i]) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return h >>> 0
}

/** Bit-exact port of .NET Framework's System.Random (Knuth subtractive). */
class DotNetRandom {
  private seed: number[] = new Array(56).fill(0)
  private inext = 0
  private inextp = 21
  private static MBIG = 2147483647

  constructor(seed: number) {
    const MSEED = 161803398
    const subtraction = seed === -2147483648 ? 2147483647 : Math.abs(seed)
    let mj = MSEED - subtraction
    this.seed[55] = mj
    let mk = 1
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55
      this.seed[ii] = mk
      mk = mj - mk
      if (mk < 0) mk += DotNetRandom.MBIG
      mj = this.seed[ii]
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        this.seed[i] -= this.seed[1 + ((i + 30) % 55)]
        if (this.seed[i] < 0) this.seed[i] += DotNetRandom.MBIG
      }
    }
  }

  private sample(): number {
    let a = this.inext
    let b = this.inextp
    if (++a >= 56) a = 1
    if (++b >= 56) b = 1
    let v = this.seed[a] - this.seed[b]
    if (v === DotNetRandom.MBIG) v--
    if (v < 0) v += DotNetRandom.MBIG
    this.seed[a] = v
    this.inext = a
    this.inextp = b
    return v
  }

  nextBytes(n: number): Buffer {
    const out = Buffer.alloc(n)
    for (let i = 0; i < n; i++) out[i] = this.sample() % 256 & 0xff
    return out
  }
}

function u32Array(buf: Buffer, off: number, count: number): Uint32Array {
  const out = new Uint32Array(count)
  for (let i = 0; i < count; i++) out[i] = buf.readUInt32LE(off + i * 4)
  return out
}

async function derive(gamePath: string): Promise<NgKeys | null> {
  const aes = await loadAesKey(gamePath)
  if (!aes) return null

  let magic: Buffer
  try {
    magic = await ensureMagic()
  } catch {
    return null
  }

  const rnd = new DotNetRandom(jenkGenHash(aes) | 0)
  const n = magic.length
  const rb1 = rnd.nextBytes(n)
  const rb2 = rnd.nextBytes(n)
  const rb3 = rnd.nextBytes(n)
  const rb4 = rnd.nextBytes(n)
  const db = Buffer.alloc(n)
  for (let i = 0; i < n; i++) {
    db[i] = (magic[i] - rb1[i] - rb2[i] - rb3[i] - rb4[i]) & 0xff
  }

  const dec = aesDecrypt(db, aes, 1)
  let blob: Buffer
  try {
    blob = inflateRawSync(dec)
  } catch {
    return null // wrong AES key / algo mismatch
  }
  if (blob.length < NG_KEYS_LEN + NG_TABLES_LEN + LUT_LEN) return null

  const keysBlob = blob.subarray(0, NG_KEYS_LEN)
  const tablesBlob = blob.subarray(NG_KEYS_LEN, NG_KEYS_LEN + NG_TABLES_LEN)
  const lut = Uint8Array.from(
    blob.subarray(NG_KEYS_LEN + NG_TABLES_LEN, NG_KEYS_LEN + NG_TABLES_LEN + LUT_LEN),
  )

  const keys: Uint32Array[] = []
  for (let i = 0; i < 101; i++) keys.push(u32Array(keysBlob, i * 272, 68))

  const decryptTables: Uint32Array[][] = []
  for (let i = 0; i < 17; i++) {
    const rnds: Uint32Array[] = []
    for (let j = 0; j < 16; j++) rnds.push(u32Array(tablesBlob, (i * 16 + j) * 1024, 256))
    decryptTables.push(rnds)
  }

  return { keys, decryptTables, lut }
}

/** NG keys derived from CodeWalker magic.dat + the user's AES key, cached. */
export async function loadNgKeys(gamePath: string): Promise<NgKeys | null> {
  if (cache) return cache
  if (deriving) return deriving
  deriving = derive(gamePath)
  try {
    cache = await deriving
    return cache
  } finally {
    deriving = null
  }
}

export function ngReady(): boolean {
  return !!cache
}

export async function refetchMagic(gamePath: string): Promise<boolean> {
  cache = null
  try {
    await ensureMagic(true)
  } catch {
    return false
  }
  return !!(await loadNgKeys(gamePath))
}
