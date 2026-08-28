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

/**
 * One AES-like round, writing 16 bytes into `dst` at `dstOff` from `src` at
 * `srcOff`. Hot path — no allocations, no Buffer views per call.
 */
function roundInto(
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstOff: number,
  key: Uint32Array,
  keyOff: number,
  tables: Uint32Array[],
  pat: number[][],
): void {
  for (let c = 0; c < 4; c++) {
    const p = pat[c]
    const x =
      (tables[p[0]][src[srcOff + p[0]]] ^
        tables[p[1]][src[srcOff + p[1]]] ^
        tables[p[2]][src[srcOff + p[2]]] ^
        tables[p[3]][src[srcOff + p[3]]] ^
        key[keyOff + c]) >>>
      0
    const o = dstOff + c * 4
    dst[o] = x & 0xff
    dst[o + 1] = (x >>> 8) & 0xff
    dst[o + 2] = (x >>> 16) & 0xff
    dst[o + 3] = (x >>> 24) & 0xff
  }
}

/** Decrypt an NG blob. `name` = entry/archive filename, `length` its size. */
export function decryptNg(data: Buffer, name: string, length: number, ng: NgKeys): Buffer {
  const key = ng.keys[ngKeyIndex(calculateHash(name, ng.lut), length)]
  if (!key) throw new Error('NG key table is incomplete.')
  const out = Buffer.from(data)
  const tabs = ng.decryptTables
  const t0 = tabs[0]
  const t1 = tabs[1]
  const t16 = tabs[16]
  const a = new Uint8Array(16)
  const b = new Uint8Array(16)
  const blocks = (data.length / 16) | 0
  for (let i = 0; i < blocks; i++) {
    const base = i * 16
    roundInto(out, base, a, 0, key, 0, t0, PAT_A)
    roundInto(a, 0, b, 0, key, 4, t1, PAT_A)
    let cur = b
    let nxt = a
    for (let k = 2; k <= 15; k++) {
      roundInto(cur, 0, nxt, 0, key, k * 4, tabs[k], PAT_B)
      const tmp = cur
      cur = nxt
      nxt = tmp
    }
    roundInto(cur, 0, out, base, key, 64, t16, PAT_A)
  }
  return out // trailing < 16 bytes left as-is
}
