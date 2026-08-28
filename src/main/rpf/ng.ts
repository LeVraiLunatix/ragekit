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
  /**
   * [17 rounds][16 sub-tables] of 256 uint32 — the inverse round tables, so
   * changed blocks / the TOC can be re-encrypted in place instead of decrypting
   * the whole archive. Built lazily (buildEncryptTables) and cached; rounds 2..15
   * hold the RoundB-permuted solve, used with encryptRoundB's scatter.
   */
  encryptTables?: Uint32Array[][]
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

// ───────────────────────────────────────────────────────────────────────────
// NG encrypt — the inverse. RoundA is inverted with RandomGauss (a linear
// solve over GF(2), ported from CodeWalker); RoundB is inverted as
// σ⁻¹ ∘ RoundA⁻¹ ∘ σ, so no giant BuildLUTs2 table is needed. Inverse tables
// are built once and cached (see ngkeys.ensureEncryptTables).
// ───────────────────────────────────────────────────────────────────────────

/** Flat byte order that turns a RoundB round into a contiguous RoundA. */
const PERM_B: number[] = ([] as number[]).concat(...PAT_B) // [0,7,10,13, 1,4,11,14, 2,5,8,15, 3,6,9,12]

/** Reorder the 16 sub-tables of a RoundB round so `Solve` sees a RoundA. */
function permuteTablesB(tables: Uint32Array[]): Uint32Array[] {
  return PERM_B.map((idx) => tables[idx])
}

// --- RandomGauss.Solve(uint[][] tables) → uint[16][256] --------------------
//
// CodeWalker solves one output *bit* at a time (128 passes). All 32 bits of an
// output word share the same left-hand side (the row.A depends only on which
// output word, not which bit), so we solve a whole word at once with row.B as a
// uint32 — 4 passes instead of 128. Reduction is word-granular over GF(2).

const setBit = (a: Uint32Array, i: number): void => {
  a[i >>> 5] |= 1 << (i & 31)
}
const getBit = (a: Uint32Array, i: number): number => (a[i >>> 5] >>> (i & 31)) & 1
const lowSet = (w: number): number => 31 - Math.clz32(w & -w)

interface Row {
  a: Uint32Array // 1024 bits
  b: number // 32 output bits, one per solved column
}

/** Solve the 32 output bits of one word `w` (input bytes `inB` = [4w..4w+3]). */
function solveWord(tables: Uint32Array[], inB: number[]): Uint32Array {
  const b0 = inB[0]
  const pivots: Row[] = new Array(1024)
  const first: Row = { a: new Uint32Array(32), b: 0xffffffff }
  first.a[0] = 1
  pivots[0] = first

  const enc = new Uint8Array(16)
  for (let pivotIdx = 1; pivotIdx < 1024; pivotIdx++) {
    let tries = 0
    for (;;) {
      if (++tries > 200_000) {
        throw new Error(`NG encrypt-table solve stalled at column ${pivotIdx} — decrypt tables look wrong.`)
      }
      for (let i = 0; i < 16; i++) enc[i] = (Math.random() * 256) | 0
      const v =
        (tables[b0][enc[b0]] ^
          tables[b0 + 1][enc[b0 + 1]] ^
          tables[b0 + 2][enc[b0 + 2]] ^
          tables[b0 + 3][enc[b0 + 3]]) >>>
        0
      const d0 = v & 0xff
      const d1 = (v >>> 8) & 0xff
      const d2 = (v >>> 16) & 0xff
      const d3 = (v >>> 24) & 0xff

      let row: Row
      if (pivotIdx === 0x2ff || pivotIdx === 0x3ff) {
        row = { a: new Uint32Array(32), b: 0xffffffff }
        setBit(row.a, pivotIdx)
      } else {
        // row.B = the random encrypted word (one bit per solved column); row.A
        // columns are picked by the decrypt-round output bytes d0..d3.
        const encWord = (enc[b0] | (enc[b0 + 1] << 8) | (enc[b0 + 2] << 16) | (enc[b0 + 3] << 24)) >>> 0
        row = { a: new Uint32Array(32), b: encWord }
        setBit(row.a, 0 + d0)
        setBit(row.a, 256 + d1)
        setBit(row.a, 512 + d2)
        setBit(row.a, 768 + d3)
      }

      for (let wi = 0; wi < 32; wi++) {
        let word = row.a[wi]
        while (word !== 0) {
          const k = wi * 32 + lowSet(word)
          if (k >= pivotIdx) break
          const pk = pivots[k].a
          for (let n = wi; n < 32; n++) row.a[n] ^= pk[n]
          row.b ^= pivots[k].b
          word = row.a[wi]
        }
      }
      if (getBit(row.a, pivotIdx)) {
        pivots[pivotIdx] = row
        break
      }
    }
  }

  const result = new Uint32Array(1024)
  for (let j = 1023; j >= 0; j--) {
    const val = pivots[j].b >>> 0
    result[j] = val
    if (val !== 0) {
      for (let k = 0; k < j; k++) if (getBit(pivots[k].a, j)) pivots[k].b ^= val
    }
  }
  return result
}

/** CodeWalker RandomGauss.Solve — invert one round's 16 sub-tables. */
export function randomGaussSolve(tables: Uint32Array[]): Uint32Array[] {
  const result: Uint32Array[] = []
  for (let i = 0; i < 16; i++) result.push(new Uint32Array(256))
  for (let w = 0; w < 4; w++) {
    const inB = [4 * w, 4 * w + 1, 4 * w + 2, 4 * w + 3]
    const wr = solveWord(tables, inB)
    for (let i = 0; i < 256; i++) {
      result[inB[0]][i] |= wr[0 + i]
      result[inB[1]][i] |= wr[256 + i]
      result[inB[2]][i] |= wr[512 + i]
      result[inB[3]][i] |= wr[768 + i]
    }
  }
  return result
}

/**
 * Build the 17 inverse round tables from the decrypt tables. Rounds 0/1/16 are
 * a direct solve; rounds 2..15 solve the RoundB-permuted tables (used with the
 * scatter in encryptRoundB). ~1–2 min the first time; cache the result.
 */
export function buildEncryptTables(
  decryptTables: Uint32Array[][],
  onProgress?: (done: number, total: number) => void,
): Uint32Array[][] {
  const out: Uint32Array[][] = []
  for (let k = 0; k < 17; k++) {
    onProgress?.(k, 17)
    const src = k === 0 || k === 1 || k === 16 ? decryptTables[k] : permuteTablesB(decryptTables[k])
    out.push(randomGaussSolve(src))
  }
  onProgress?.(17, 17)
  return out
}

// --- encrypt round primitives --------------------------------------------------

/** EncryptRoundA: key XORed into the input, then the inverse table lookup. */
function encRoundA(src: Uint8Array, kb: Uint8Array, tab: Uint32Array[], out: Uint8Array): void {
  for (let w = 0; w < 4; w++) {
    const o = w * 4
    const x =
      (tab[o][src[o] ^ kb[o]] ^
        tab[o + 1][src[o + 1] ^ kb[o + 1]] ^
        tab[o + 2][src[o + 2] ^ kb[o + 2]] ^
        tab[o + 3][src[o + 3] ^ kb[o + 3]]) >>>
      0
    out[o] = x & 0xff
    out[o + 1] = (x >>> 8) & 0xff
    out[o + 2] = (x >>> 16) & 0xff
    out[o + 3] = (x >>> 24) & 0xff
  }
}

/** EncryptRoundB = contiguous inverse RoundA, then scatter back by PERM_B. */
function encRoundB(src: Uint8Array, kb: Uint8Array, tab: Uint32Array[], out: Uint8Array, scratch: Uint8Array): void {
  encRoundA(src, kb, tab, scratch)
  for (let i = 0; i < 16; i++) out[PERM_B[i]] = scratch[i]
}

/** Encrypt one 16-byte block with a 68-uint key + the prebuilt inverse tables. */
function encryptBlock(block: Uint8Array, key: Uint32Array, et: Uint32Array[][], kb: Uint8Array): Uint8Array {
  const a = new Uint8Array(16)
  const b = new Uint8Array(16)
  const scratch = new Uint8Array(16)
  const subKb = (r: number): void => {
    for (let c = 0; c < 4; c++) {
      const v = key[4 * r + c] >>> 0
      kb[c * 4] = v & 0xff
      kb[c * 4 + 1] = (v >>> 8) & 0xff
      kb[c * 4 + 2] = (v >>> 16) & 0xff
      kb[c * 4 + 3] = (v >>> 24) & 0xff
    }
  }
  subKb(16)
  encRoundA(block, kb, et[16], a)
  let cur = a
  let nxt = b
  for (let k = 15; k >= 2; k--) {
    subKb(k)
    encRoundB(cur, kb, et[k], nxt, scratch)
    const t = cur
    cur = nxt
    nxt = t
  }
  subKb(1)
  encRoundA(cur, kb, et[1], nxt)
  subKb(0)
  encRoundA(nxt, kb, et[0], cur)
  return cur
}

/** Encrypt an NG blob. Mirrors {@link decryptNg}; needs `ng.encryptTables`. */
export function encryptNg(data: Buffer, name: string, length: number, ng: NgKeys): Buffer {
  if (!ng.encryptTables) throw new Error('NG encrypt tables not built.')
  const key = ng.keys[ngKeyIndex(calculateHash(name, ng.lut), length)]
  if (!key) throw new Error('NG key table is incomplete.')
  const out = Buffer.from(data)
  const et = ng.encryptTables
  const kb = new Uint8Array(16)
  const blocks = (data.length / 16) | 0
  for (let i = 0; i < blocks; i++) {
    out.set(encryptBlock(out.subarray(i * 16, i * 16 + 16), key, et, kb), i * 16)
  }
  return out
}
