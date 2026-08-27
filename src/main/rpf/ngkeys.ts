import { promises as fs } from 'node:fs'
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib'
import { store } from '../store'
import type { NgKeys } from './ng'

const AES_LEN = 32
const NG_KEY_COUNT = 101
const NG_KEY_LEN = 272 // 68 uint32
const NG_TABLE_ROUNDS = 17
const NG_TABLE_SUBS = 16
const NG_TABLE_ENTRIES = 256
const NG_TABLES_LEN = NG_TABLE_ROUNDS * NG_TABLE_SUBS * NG_TABLE_ENTRIES * 4 // 278528
const MIN_LEN = AES_LEN + NG_KEY_COUNT * NG_KEY_LEN + NG_TABLES_LEN // 306032

let cache: { path: string; keys: NgKeys } | null = null

function tryDecompress(buf: Buffer): Buffer {
  for (const fn of [inflateSync, gunzipSync, inflateRawSync]) {
    try {
      const out = fn(buf)
      if (out.length >= MIN_LEN) return out
    } catch {
      /* next */
    }
  }
  return buf
}

function parse(raw: Buffer): NgKeys {
  if (raw.length < MIN_LEN) {
    throw new Error(
      `Key file is too small (${raw.length} bytes, need ${MIN_LEN}). Use CodeWalker's Key.dat or an equivalent GTA5 NG key dump.`,
    )
  }
  let off = AES_LEN // skip the 32-byte AES key

  const keys: Uint32Array[] = []
  for (let i = 0; i < NG_KEY_COUNT; i++) {
    const slice = raw.subarray(off, off + NG_KEY_LEN)
    keys.push(new Uint32Array(slice.buffer.slice(slice.byteOffset, slice.byteOffset + NG_KEY_LEN)))
    off += NG_KEY_LEN
  }

  const decryptTables: Uint32Array[][] = []
  for (let r = 0; r < NG_TABLE_ROUNDS; r++) {
    const round: Uint32Array[] = []
    for (let s = 0; s < NG_TABLE_SUBS; s++) {
      const bytes = NG_TABLE_ENTRIES * 4
      const slice = raw.subarray(off, off + bytes)
      round.push(
        new Uint32Array(slice.buffer.slice(slice.byteOffset, slice.byteOffset + bytes)),
      )
      off += bytes
    }
    decryptTables.push(round)
  }

  return { keys, decryptTables }
}

/** Path the user pointed us at, if any. */
export function ngKeysPath(): string {
  return store.get('ngKeysPath') as string
}

export async function setNgKeysPath(path: string): Promise<void> {
  // Validate before storing.
  const raw = tryDecompress(await fs.readFile(path))
  parse(raw)
  store.set('ngKeysPath', path)
  cache = null
}

export function clearNgKeys(): void {
  store.set('ngKeysPath', '')
  cache = null
}

/** Loaded NG keys, or null when none configured / unreadable. */
export async function loadNgKeys(): Promise<NgKeys | null> {
  const path = ngKeysPath()
  if (!path) return null
  if (cache?.path === path) return cache.keys
  try {
    const raw = tryDecompress(await fs.readFile(path))
    const keys = parse(raw)
    cache = { path, keys }
    return keys
  } catch {
    return null
  }
}
