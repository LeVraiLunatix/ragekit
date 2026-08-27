/**
 * GTA V (Legacy) "NG" RPF encryption — used by the vanilla base archives
 * (update.rpf, common.rpf, x64*.rpf). A 17-round AES-like block cipher whose
 * per-blob key is chosen from 101 candidates by a LUT-based hash of the name
 * plus the blob length.
 *
 * Algorithm ported verbatim from CodeWalker (MIT, © Neodymium / dexyfex):
 * GTACrypto.DecryptNGBlock / DecryptNGRoundA / DecryptNGRoundB and
 * GTA5Hash.CalculateHash. The key material comes from CodeWalker's `magic.dat`
 * (see ngkeys.ts) — nothing is shipped by Ragekit.
 */

export interface NgKeys {
  /** 101 keys, each 68 little-endian uint32 (272 bytes). */
  keys: Uint32Array[]
  /** [17 rounds][16 sub-tables] of 256 uint32. */
  decryptTables: Uint32Array[][]
  /** 256-byte hash lookup table used by calculateHash. */
  lut: Uint8Array
}

/** GTA5Hash.CalculateHash — NOT Jenkins; uses the NG hash LUT. */
export function calculateHash(text: string, lut: Uint8Array): number {
  let result = 0
  for (let i = 0; i < text.length; i++) {
    const temp = Math.imul(1025, (lut[text.charCodeAt(i) & 0xff] + result) >>> 0) >>> 0
    result = ((temp >>> 6) ^ temp) >>> 0
  }
  const r9 = Math.imul(9, result) >>> 0
  return Math.imul(32769, ((r9 >>> 11) ^ r9) >>> 0) >>> 0
}

/** GTACrypto.GetNGKey key selection. */
export function ngKeyIndex(hash: number, length: number): number {
  return (((hash >>> 0) + (length >>> 0) + (101 - 40)) >>> 0) % 101
}

// table sub-index / data-byte pickup patterns per output column
const PAT_A = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
]
const PAT_B = [
  [0, 7, 10, 13],
  [1, 4, 11, 14],
  [2, 5, 8, 15],
  [3, 6, 9, 12],
]

function round(
  data: Uint8Array,
  key: Uint32Array,
  keyOff: number,
  tables: Uint32Array[],
  pat: number[][],
): Uint8Array {
  const out = Buffer.alloc(16)
  for (let c = 0; c < 4; c++) {
    const p = pat[c]
    const x =
      (tables[p[0]][data[p[0]]] ^
        tables[p[1]][data[p[1]]] ^
        tables[p[2]][data[p[2]]] ^
        tables[p[3]][data[p[3]]] ^
        key[keyOff + c]) >>>
      0
    out.writeUInt32LE(x, c * 4)
  }
  return out
}

function decryptBlock(block: Uint8Array, key: Uint32Array, tabs: Uint32Array[][]): Uint8Array {
  let b: Uint8Array = round(block, key, 0, tabs[0], PAT_A)
  b = round(b, key, 4, tabs[1], PAT_A)
  for (let k = 2; k <= 15; k++) b = round(b, key, k * 4, tabs[k], PAT_B)
  b = round(b, key, 64, tabs[16], PAT_A)
  return b
}

/** Decrypt an NG blob. `name` = entry/archive filename, `length` its size. */
export function decryptNg(data: Buffer, name: string, length: number, ng: NgKeys): Buffer {
  const key = ng.keys[ngKeyIndex(calculateHash(name, ng.lut), length)]
  if (!key) throw new Error('NG key table is incomplete.')
  const out = Buffer.from(data)
  const blocks = Math.floor(data.length / 16)
  for (let i = 0; i < blocks; i++) {
    const dec = decryptBlock(data.subarray(i * 16, i * 16 + 16), key, ng.decryptTables)
    out.set(dec, i * 16)
  }
  return out // trailing < 16 bytes left as-is
}
