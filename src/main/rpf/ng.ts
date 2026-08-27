/**
 * GTA V (Legacy) "NG" RPF encryption — the scheme used by the vanilla base
 * archives (update.rpf, common.rpf, x64*.rpf). It is an AES-like 17-round
 * block cipher whose per-file key is chosen from a 101-entry table by a hash
 * of the entry name and its length.
 *
 * The key material (101 keys + 17 rounds of decrypt tables) is NOT shipped — the
 * user points Ragekit at a key file (CodeWalker "Key.dat" or an equivalent
 * dump). Implementation is EXPERIMENTAL: a wrong round would produce garbage,
 * which the caller detects (the TOC must decode to a valid root directory) and
 * reports rather than acting on.
 */

export interface NgKeys {
  /** 101 keys, each 272 bytes (68 little-endian uint32). */
  keys: Uint32Array[]
  /** [17 rounds][16 tables] of 256 uint32 each. */
  decryptTables: Uint32Array[][]
}

/** Jenkins one-at-a-time hash of the lowercased name. */
export function jenkinsHash(name: string): number {
  let h = 0
  const s = name.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return h >>> 0
}

/** Which of the 101 keys decrypts a blob with this name-hash and length. */
export function ngKeyIndex(hash: number, length: number): number {
  return ((hash >>> 0) + (length >>> 0) + (101 - 40)) % 101
}

// Inv-ShiftRows byte pickup patterns.
const A = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
]
const B = [
  [0, 7, 10, 13],
  [4, 1, 14, 11],
  [8, 5, 2, 15],
  [12, 9, 6, 3],
]

function roundColumns(
  data: Uint8Array,
  keyU32: Uint32Array,
  keyOff: number,
  tables: Uint32Array[],
  pat: number[][],
): Uint8Array {
  const out = new Uint8Array(16)
  const dv = new DataView(out.buffer)
  for (let c = 0; c < 4; c++) {
    const p = pat[c]
    const v =
      (keyU32[keyOff + c] ^
        tables[c * 4 + 0][data[p[0]]] ^
        tables[c * 4 + 1][data[p[1]]] ^
        tables[c * 4 + 2][data[p[2]]] ^
        tables[c * 4 + 3][data[p[3]]]) >>>
      0
    dv.setUint32(c * 4, v, true)
  }
  return out
}

/** Final round: no MixColumns — take the low byte of each 4-way table XOR. */
function roundLast(
  data: Uint8Array,
  keyU32: Uint32Array,
  keyOff: number,
  tables: Uint32Array[],
): Uint8Array {
  const keyBytes = new Uint8Array(keyU32.buffer, keyOff * 4, 16)
  const out = new Uint8Array(16)
  for (let c = 0; c < 4; c++) {
    const p = B[c]
    for (let j = 0; j < 4; j++) {
      const t = c * 4 + j
      const x =
        (tables[(t * 4 + 0) & 15][data[p[0]]] ^
          tables[(t * 4 + 1) & 15][data[p[1]]] ^
          tables[(t * 4 + 2) & 15][data[p[2]]] ^
          tables[(t * 4 + 3) & 15][data[p[3]]]) &
        0xff
      out[c * 4 + j] = (x ^ keyBytes[c * 4 + j]) & 0xff
    }
  }
  return out
}

function decryptBlock(block: Uint8Array, key: Uint32Array, tables: Uint32Array[][]): Uint8Array {
  let b = roundColumns(block, key, 0, tables[0], A)
  b = roundColumns(b, key, 4, tables[1], A)
  for (let r = 2; r <= 15; r++) b = roundColumns(b, key, r * 4, tables[r], B)
  b = roundLast(b, key, 64, tables[16])
  return b
}

/** Decrypt an NG blob. `name` is the entry / archive filename, `length` its size. */
export function decryptNg(
  data: Buffer,
  name: string,
  length: number,
  ng: NgKeys,
): Buffer {
  const key = ng.keys[ngKeyIndex(jenkinsHash(name), length)]
  if (!key) throw new Error('NG key table is incomplete.')
  const out = Buffer.from(data)
  const blocks = Math.floor(data.length / 16)
  for (let i = 0; i < blocks; i++) {
    const dec = decryptBlock(data.subarray(i * 16, i * 16 + 16), key, ng.decryptTables)
    out.set(dec, i * 16)
  }
  // trailing < 16 bytes pass through unchanged
  return out
}
