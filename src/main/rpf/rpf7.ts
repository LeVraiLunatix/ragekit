import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { RpfEncryption } from '@shared/types'
import { aesDecrypt, aesEncrypt } from './crypto'
import { decryptNg, type NgKeys } from './ng'

const RPF7_MAGIC = 0x52504637
const DIR_IDENT = 0x7fffff00
const SECTOR = 512

export type { RpfEncryption }
export interface RpfKeys {
  aes: Buffer | null
  ng: NgKeys | null
}

function encName(v: number): RpfEncryption {
  if (v === 0 || v === 0x4e4f4e45) return 'NONE'
  if (v === 0x4e45504f) return 'OPEN' // "OPEN"
  if (v === 0x0ffffff9) return 'AES'
  if (v === 0x0feffffe || v === 0x0fefffff) return 'NG'
  return 'UNKNOWN'
}

export interface RpfEntry {
  name: string
  path: string // slash-joined, lowercase
  isDir: boolean
  isResource: boolean
  /** index of this entry in the flat table */
  index: number
  // files only:
  sizeOnDisk: number // compressed bytes; 0 means stored raw
  offset: number // absolute byte offset
  uncompressedSize: number
  encrypted: boolean
}

function alignUp(n: number, to: number): number {
  return Math.ceil(n / to) * to
}

type Source = { kind: 'file'; path: string } | { kind: 'buffer'; data: Buffer; label: string }

export class Rpf7 {
  private constructor(
    private source: Source,
    readonly encryption: RpfEncryption,
    readonly entryCount: number,
    readonly namesLength: number,
    private entriesBuf: Buffer, // decrypted, entryCount*16
    private namesBuf: Buffer, // decrypted
    private keys: RpfKeys,
    readonly entries: RpfEntry[],
    private byPath: Map<string, RpfEntry>,
  ) {}

  get label(): string {
    return this.source.kind === 'file' ? this.source.path : this.source.label
  }

  get writable(): boolean {
    return this.source.kind === 'file' && this.encryption !== 'NG'
  }

  private static parse(
    head16: Buffer,
    toc: Buffer,
    keys: RpfKeys,
    ngName: string,
    ngLen: number,
    label: string,
  ): {
    encryption: RpfEncryption
    entryCount: number
    namesLength: number
    entriesBuf: Buffer
    namesBuf: Buffer
    entries: RpfEntry[]
    byPath: Map<string, RpfEntry>
  } {
    if (head16.readUInt32LE(0) !== RPF7_MAGIC) throw new Error(`${label} is not an RPF7 archive.`)
    const entryCount = head16.readUInt32LE(4)
    const namesLength = head16.readUInt32LE(8)
    const encryption = encName(head16.readUInt32LE(12))
    if (encryption === 'UNKNOWN') throw new Error(`RPF encryption "${encryption}" is not supported.`)

    const encLen = entryCount * 16
    // Entries and names are decrypted as SEPARATE buffers (CodeWalker does the
    // same) — each keeps its own sub-16 remainder.
    const rawEntries = Buffer.from(toc.subarray(0, encLen))
    const rawNames = Buffer.from(toc.subarray(encLen, encLen + namesLength))
    let entriesBuf: Buffer
    let namesBuf: Buffer
    if (encryption === 'AES') {
      if (!keys.aes) throw new Error('This RPF is AES-encrypted but no key was provided.')
      entriesBuf = aesDecrypt(rawEntries, keys.aes)
      namesBuf = aesDecrypt(rawNames, keys.aes)
    } else if (encryption === 'NG') {
      if (!keys.ng) throw new Error('RPF encryption "NG" is not supported.') // caller maps to ng-nokeys
      entriesBuf = decryptNg(rawEntries, ngName, ngLen, keys.ng)
      namesBuf = decryptNg(rawNames, ngName, ngLen, keys.ng)
    } else {
      entriesBuf = rawEntries
      namesBuf = rawNames
    }

    if (entryCount === 0 || entriesBuf.readUInt32LE(4) !== DIR_IDENT) {
      throw new Error(`${label}: table of contents did not decode (encryption "${encryption}").`)
    }
    const { entries, byPath } = parseEntries(entriesBuf, namesBuf, entryCount)
    return { encryption, entryCount, namesLength, entriesBuf, namesBuf, entries, byPath }
  }

  static async open(filePath: string, keys: RpfKeys): Promise<Rpf7> {
    const fd = await fs.open(filePath, 'r')
    try {
      const size = (await fd.stat()).size
      const head16 = Buffer.alloc(16)
      await fd.read(head16, 0, 16, 0)
      const entryCount = head16.readUInt32LE(4)
      const namesLength = head16.readUInt32LE(8)
      const toc = Buffer.alloc(entryCount * 16 + namesLength)
      await fd.read(toc, 0, toc.length, 16)
      const p = Rpf7.parse(head16, toc, keys, basename(filePath), size, filePath)
      return new Rpf7(
        { kind: 'file', path: filePath },
        p.encryption,
        p.entryCount,
        p.namesLength,
        p.entriesBuf,
        p.namesBuf,
        keys,
        p.entries,
        p.byPath,
      )
    } finally {
      await fd.close()
    }
  }

  static fromBuffer(
    data: Buffer,
    keys: RpfKeys,
    label: string,
    ngName: string,
    ngLen: number,
  ): Rpf7 {
    const head16 = data.subarray(0, 16)
    const entryCount = head16.readUInt32LE(4)
    const namesLength = head16.readUInt32LE(8)
    const toc = data.subarray(16, 16 + entryCount * 16 + namesLength)
    const p = Rpf7.parse(head16, toc, keys, ngName, ngLen, label)
    return new Rpf7(
      { kind: 'buffer', data, label },
      p.encryption,
      p.entryCount,
      p.namesLength,
      p.entriesBuf,
      p.namesBuf,
      keys,
      p.entries,
      p.byPath,
    )
  }

  get(innerPath: string): RpfEntry | undefined {
    return this.byPath.get(innerPath.replace(/\\/g, '/').toLowerCase())
  }

  private async readRaw(offset: number, len: number): Promise<Buffer> {
    if (this.source.kind === 'buffer') {
      return Buffer.from(this.source.data.subarray(offset, offset + len))
    }
    const fd = await fs.open(this.source.path, 'r')
    try {
      const out = Buffer.alloc(len)
      await fd.read(out, 0, len, offset)
      return out
    } finally {
      await fd.close()
    }
  }

  async readFile(innerPath: string): Promise<Buffer> {
    const e = this.get(innerPath)
    if (!e || e.isDir) throw new Error(`${innerPath} not found in ${this.label}`)
    const readLen = e.sizeOnDisk > 0 ? e.sizeOnDisk : e.uncompressedSize
    let data: Buffer = await this.readRaw(e.offset, readLen)
    if (e.encrypted) {
      if (this.encryption === 'NG') {
        if (!this.keys.ng) throw new Error('File is NG-encrypted but NG keys are unavailable.')
        // ExtractFileBinary decrypts NG with FileUncompressedSize as the length.
        data = decryptNg(data, e.name, e.uncompressedSize, this.keys.ng)
      } else {
        if (!this.keys.aes) throw new Error('File is encrypted but no key is available.')
        data = aesDecrypt(data, this.keys.aes)
      }
    }
    if (e.sizeOnDisk > 0) data = inflateRawSync(data.subarray(0, e.sizeOnDisk))
    return data.subarray(0, e.uncompressedSize)
  }

  /** Open a `.rpf` nested inside this one (read-only). */
  async openNested(innerPath: string): Promise<Rpf7> {
    const e = this.get(innerPath)
    const bytes = await this.readFile(innerPath)
    return Rpf7.fromBuffer(
      bytes,
      this.keys,
      `${this.label}/${innerPath}`,
      e?.name ?? innerPath,
      e?.uncompressedSize ?? bytes.length,
    )
  }

  /**
   * Replace one existing binary file with new contents by appending the data at
   * the end of the archive and repointing its entry. Other files are untouched.
   * The archive grows by a few sectors. Only same-name replacement is supported.
   */
  async replaceFile(innerPath: string, content: Buffer): Promise<void> {
    if (this.source.kind !== 'file') {
      throw new Error('This archive is nested and cannot be edited in place.')
    }
    const e = this.get(innerPath)
    if (!e || e.isDir) throw new Error(`${innerPath} not found`)
    if (e.isResource) throw new Error('Refusing to rewrite a resource file.')

    const compressed = deflateRawSync(content, { level: 9 })
    // Store compressed only if it actually helps.
    const useCompressed = compressed.length < content.length
    const payload = useCompressed ? compressed : content
    const sizeOnDisk = useCompressed ? compressed.length : 0

    const fd = await fs.open(this.source.path, 'r+')
    try {
      const stat = await fd.stat()
      const newOffset = alignUp(stat.size, SECTOR)

      // Build the updated TOC in memory first.
      const newEntries = Buffer.from(this.entriesBuf)
      writeBinaryEntry(newEntries, e.index, {
        nameOffset: readNameOffset(newEntries, e.index),
        sizeOnDisk,
        offsetSectors: newOffset / SECTOR,
        uncompressedSize: content.length,
        encrypted: false,
      })
      // Encrypt entries and names as separate buffers (AES, 1 round). NG
      // archives are rewritten as AES — we don't NG-encrypt.
      let outEntries: Buffer = newEntries
      let outNames: Buffer = this.namesBuf
      let rewriteHeaderToAes = false
      if (this.encryption === 'AES' || this.encryption === 'NG') {
        if (!this.keys.aes) throw new Error('Editing this archive needs the AES key from GTA5.exe.')
        outEntries = aesEncrypt(newEntries, this.keys.aes)
        outNames = aesEncrypt(this.namesBuf, this.keys.aes)
        const back = aesDecrypt(outEntries, this.keys.aes)
        if (back.readUInt32LE(4) !== DIR_IDENT || !back.equals(newEntries)) {
          throw new Error('RPF TOC re-encryption failed a round-trip check — aborting write.')
        }
        rewriteHeaderToAes = this.encryption === 'NG'
      }

      // Only now mutate the archive: append data, then overwrite the TOC.
      const padded = Buffer.alloc(alignUp(payload.length, SECTOR))
      payload.copy(padded)
      await fd.write(padded, 0, padded.length, newOffset)
      await fd.write(outEntries, 0, outEntries.length, 16)
      await fd.write(outNames, 0, outNames.length, 16 + outEntries.length)
      if (rewriteHeaderToAes) {
        const enc = Buffer.alloc(4)
        enc.writeUInt32LE(0x0ffffff9, 0) // AES
        await fd.write(enc, 0, 4, 12)
      }

      newEntries.copy(this.entriesBuf)
      e.sizeOnDisk = sizeOnDisk
      e.offset = newOffset
      e.uncompressedSize = content.length
      e.encrypted = false
    } finally {
      await fd.close()
    }
  }

  /**
   * Same-name replacement of many binary files at once, in place: every new
   * block is appended at the end of the archive and its entry repointed, then
   * the TOC is overwritten once. The 99% of the archive that didn't change is
   * never rewritten — fast, and no temp-file rename (so no Windows EPERM on the
   * game folder). Directory tree, name table and entry count are untouched, so
   * this only works for targets that already exist as binary files.
   */
  async replaceMany(
    replace: Map<string, Buffer>,
  ): Promise<{ replaced: string[]; missing: string[] }> {
    if (this.source.kind !== 'file') throw new Error('Only a file-backed archive can be edited.')
    if (this.encryption === 'AES' && !this.keys.aes) {
      throw new Error('Editing this archive needs the AES key from GTA5.exe.')
    }
    if (this.encryption === 'NG') {
      throw new Error('NG-encrypted archives must be converted to OPEN before editing.')
    }

    const jobs: Array<{ index: number; payload: Buffer; sizeOnDisk: number; uncompressed: number }> = []
    const replaced: string[] = []
    const missing: string[] = []
    for (const [rawPath, content] of replace) {
      const e = this.get(rawPath)
      if (!e || e.isDir || e.isResource) {
        missing.push(rawPath.replace(/\\/g, '/').toLowerCase())
        continue
      }
      const comp = deflateRawSync(content, { level: 9 })
      const useC = comp.length < content.length
      jobs.push({
        index: e.index,
        payload: useC ? comp : content,
        sizeOnDisk: useC ? comp.length : 0,
        uncompressed: content.length,
      })
      replaced.push(e.path)
    }
    if (jobs.length === 0) return { replaced, missing }

    const newEntries = Buffer.from(this.entriesBuf)
    const fd = await fs.open(this.source.path, 'r+')
    try {
      let cursor = alignUp((await fd.stat()).size, SECTOR)
      for (const j of jobs) {
        const padded = Buffer.alloc(alignUp(j.payload.length, SECTOR))
        j.payload.copy(padded)
        await fd.write(padded, 0, padded.length, cursor)
        writeBinaryEntry(newEntries, j.index, {
          nameOffset: readNameOffset(newEntries, j.index),
          sizeOnDisk: j.sizeOnDisk,
          offsetSectors: cursor / SECTOR,
          uncompressedSize: j.uncompressed,
          encrypted: false,
        })
        cursor += padded.length
      }
      let outEntries: Buffer = newEntries
      let outNames: Buffer = this.namesBuf
      if (this.encryption === 'AES') {
        outEntries = aesEncrypt(newEntries, this.keys.aes!)
        outNames = aesEncrypt(this.namesBuf, this.keys.aes!)
        const back = aesDecrypt(outEntries, this.keys.aes!)
        if (back.readUInt32LE(4) !== DIR_IDENT || !back.equals(newEntries)) {
          throw new Error('RPF TOC re-encryption failed a round-trip check — aborting write.')
        }
      }
      await fd.write(outEntries, 0, outEntries.length, 16)
      await fd.write(outNames, 0, outNames.length, 16 + outEntries.length)
      newEntries.copy(this.entriesBuf)
    } finally {
      await fd.close()
    }
    return { replaced, missing }
  }

  /**
   * Rebuild the whole archive to `destPath` with a set of same-name file
   * replacements. Unlike {@link replaceFile} (which appends), this repacks every
   * block contiguously and rewrites the TOC — the directory tree, the name table
   * and every entry index are preserved byte-for-byte; only file blocks and their
   * offset/size fields change. Untouched blocks (including resources) are copied
   * verbatim. OPEN and AES archives only — NG must be converted first.
   *
   * Writes to a temp file then renames over `destPath`, so a failure leaves the
   * original intact.
   */
  async rebuild(
    replace: Map<string, Buffer>,
    destPath: string,
  ): Promise<{ replaced: string[]; missing: string[] }> {
    if (this.source.kind !== 'file') {
      throw new Error('Only a file-backed archive can be rebuilt.')
    }
    if (this.encryption === 'NG') {
      throw new Error('NG-encrypted archives must be converted to OPEN before editing.')
    }
    if (this.encryption === 'AES' && !this.keys.aes) {
      throw new Error('Editing this archive needs the AES key from GTA5.exe.')
    }
    const srcPath = this.source.path

    // Normalise wanted paths; split into ones we can actually replace vs not.
    const wanted = new Map<string, Buffer>()
    for (const [k, v] of replace) wanted.set(k.replace(/\\/g, '/').toLowerCase(), v)
    const byIndex = new Map<number, RpfEntry>()
    for (const e of this.entries) byIndex.set(e.index, e)
    const replaced: string[] = []
    const missing: string[] = []
    for (const k of wanted.keys()) {
      const hit = this.byPath.get(k)
      if (hit && !hit.isDir && !hit.isResource) replaced.push(k)
      else missing.push(k)
    }

    interface Slot {
      index: number
      isResource: boolean
      origOffset: number
      origLen: number
      newContent?: { payload: Buffer; sizeOnDisk: number; uncompressed: number }
      newOffset: number
    }

    let srcFd: fs.FileHandle | null = await fs.open(srcPath, 'r')
    try {
      const origSize = (await srcFd.stat()).size
      const origHeader = Buffer.alloc(16)
      await srcFd.read(origHeader, 0, 16, 0)
      const encU32 = origHeader.readUInt32LE(12)

      // Collect every file entry in index order, plus a sorted offset list so we
      // can bound a resource block by the next block's start.
      const slots: Slot[] = []
      const fileOffsets: number[] = []
      for (let i = 0; i < this.entryCount; i++) {
        const o = i * 16
        const w0 = this.entriesBuf.readUInt32LE(o)
        const w1 = this.entriesBuf.readUInt32LE(o + 4)
        if (w1 === DIR_IDENT) continue
        const isResource = (w1 & 0x80000000) !== 0
        const offsetSectors = isResource ? (w1 >>> 8) & 0x7fffff : (w1 >>> 8) & 0xffffff
        const origOffset = offsetSectors * SECTOR
        const sizeField = ((w0 >>> 16) | ((w1 & 0xff) << 16)) & 0xffffff
        const uncompressed = this.entriesBuf.readUInt32LE(o + 8) >>> 0
        // Binary length is exact; resources fall back to span-to-next-block.
        const origLen = isResource ? -1 : sizeField > 0 ? sizeField : uncompressed
        slots.push({ index: i, isResource, origOffset, origLen, newOffset: 0 })
        fileOffsets.push(origOffset)
      }
      fileOffsets.sort((a, b) => a - b)
      const spanEnd = (off: number): number => {
        for (const fo of fileOffsets) if (fo > off) return fo
        return origSize
      }
      for (const s of slots) if (s.origLen < 0) s.origLen = spanEnd(s.origOffset) - s.origOffset

      // Compress the replacement payloads.
      for (const s of slots) {
        const entry = byIndex.get(s.index)
        const content = entry ? wanted.get(entry.path) : undefined
        if (!content) continue
        const compressed = deflateRawSync(content, { level: 9 })
        const useC = compressed.length < content.length
        s.newContent = {
          payload: useC ? compressed : content,
          sizeOnDisk: useC ? compressed.length : 0,
          uncompressed: content.length,
        }
      }

      // Lay out: header + entries + names, padded to a sector, then each block.
      const newEntries = Buffer.from(this.entriesBuf)
      const tocEnd = 16 + this.entryCount * 16 + this.namesLength
      let cursor = alignUp(tocEnd, SECTOR)
      for (const s of slots) {
        s.newOffset = cursor
        const len = s.newContent ? s.newContent.payload.length : s.origLen
        cursor += alignUp(len, SECTOR)

        const o = s.index * 16
        if (s.newContent) {
          writeBinaryEntry(newEntries, s.index, {
            nameOffset: readNameOffset(newEntries, s.index),
            sizeOnDisk: s.newContent.sizeOnDisk,
            offsetSectors: s.newOffset / SECTOR,
            uncompressedSize: s.newContent.uncompressed,
            encrypted: false,
          })
        } else if (s.isResource) {
          // keep resource flag (bit 31) + size-high byte, rewrite offset bits.
          const w1 = newEntries.readUInt32LE(o + 4)
          newEntries.writeUInt32LE(
            ((w1 & 0x800000ff) | (((s.newOffset / SECTOR) & 0x7fffff) << 8)) >>> 0,
            o + 4,
          )
        } else {
          const w1 = newEntries.readUInt32LE(o + 4)
          newEntries.writeUInt32LE(
            ((w1 & 0xff) | (((s.newOffset / SECTOR) & 0xffffff) << 8)) >>> 0,
            o + 4,
          )
        }
      }

      // Encrypt the TOC halves separately for AES; plaintext for OPEN.
      let outEntries: Buffer = newEntries
      let outNames: Buffer = this.namesBuf
      if (this.encryption === 'AES') {
        outEntries = aesEncrypt(newEntries, this.keys.aes!)
        outNames = aesEncrypt(this.namesBuf, this.keys.aes!)
        const back = aesDecrypt(outEntries, this.keys.aes!)
        if (back.readUInt32LE(4) !== DIR_IDENT || !back.equals(newEntries)) {
          throw new Error('RPF TOC re-encryption failed a round-trip check — aborting write.')
        }
      }

      const firstOffset = alignUp(16 + outEntries.length + outNames.length, SECTOR)
      const toc = Buffer.alloc(firstOffset)
      origHeader.copy(toc, 0)
      toc.writeUInt32LE(encU32, 12) // keep original encryption marker
      outEntries.copy(toc, 16)
      outNames.copy(toc, 16 + outEntries.length)

      const tmp = `${destPath}.rktmp`
      const outFd = await fs.open(tmp, 'w')
      try {
        await outFd.write(toc, 0, toc.length, 0)
        for (const s of slots) {
          const block = s.newContent
            ? s.newContent.payload
            : await readInto(srcFd!, s.origOffset, s.origLen)
          const padded = Buffer.alloc(alignUp(block.length, SECTOR))
          block.copy(padded)
          await outFd.write(padded, 0, padded.length, s.newOffset)
        }
      } finally {
        await outFd.close()
      }
      // Release the read handle to destPath before swapping — Windows refuses to
      // rename over a file that still has an open handle.
      await srcFd.close()
      srcFd = null
      await fs.rm(destPath, { force: true })
      await fs.rename(tmp, destPath)
      return { replaced, missing }
    } finally {
      if (srcFd) await srcFd.close()
    }
  }

  /**
   * Decrypt every entry of an NG-encrypted archive and write it out as an OPEN
   * (unencrypted) archive — the same thing OpenIV does when you save into the
   * mods folder. The tree, the name table and every entry index are kept; only
   * the encryption is stripped so the archive becomes writable by {@link rebuild}
   * without an NG-encrypt implementation.
   *
   * Binary blocks are NG-decrypted with FileUncompressedSize as the key length
   * (CodeWalker ExtractFileBinary). Resource blocks keep their 16-byte RSC
   * header and have the remainder NG-decrypted with FileSize as the key length
   * (CodeWalker ExtractFileResource); the zlib payload stays compressed — the
   * game inflates it. Nested .rpf blocks are decrypted and copied whole (their
   * own inner encryption is untouched; the game reads them natively).
   */
  async convertToOpen(
    destPath?: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ entries: number; buf?: Buffer }> {
    if (this.encryption !== 'NG') throw new Error('convertToOpen expects an NG-encrypted archive.')
    if (!this.keys.ng) throw new Error('NG keys are unavailable — cannot convert.')
    if (!destPath && this.source.kind === 'file') {
      throw new Error('convertToOpen needs a destPath for a file-backed archive.')
    }
    const ng = this.keys.ng

    interface Slot {
      index: number
      newBlock: Buffer
      newOffset: number
    }

    let srcFd: fs.FileHandle | null =
      this.source.kind === 'file' ? await fs.open(this.source.path, 'r') : null
    const readSrc = (off: number, len: number): Promise<Buffer> =>
      this.source.kind === 'buffer'
        ? Promise.resolve(Buffer.from(this.source.data.subarray(off, off + len)))
        : readInto(srcFd!, off, len)
    try {
      const origHeader = await readSrc(0, 16)

      const newEntries = Buffer.from(this.entriesBuf)
      const slots: Slot[] = []

      for (let i = 0; i < this.entryCount; i++) {
        if (i % 200 === 0) onProgress?.(i, this.entryCount)
        const o = i * 16
        const w0 = this.entriesBuf.readUInt32LE(o)
        const w1 = this.entriesBuf.readUInt32LE(o + 4)
        const w2 = this.entriesBuf.readUInt32LE(o + 8)
        const w3 = this.entriesBuf.readUInt32LE(o + 12)
        if (w1 === DIR_IDENT) continue
        const isResource = (w1 & 0x80000000) !== 0
        const nameOffset = w0 & 0xffff
        const name = readCName(this.namesBuf, nameOffset)

        if (!isResource) {
          const fileSize = ((w0 >>> 16) | ((w1 & 0xff) << 16)) & 0xffffff
          const offsetSectors = (w1 >>> 8) & 0xffffff
          const uncompressed = w2 >>> 0
          const encType = w3 >>> 0
          const blockLen = fileSize > 0 ? fileSize : uncompressed
          let block = await readSrc(offsetSectors * SECTOR, blockLen)
          if (encType !== 0) block = decryptNg(block, name, uncompressed, ng)
          writeBinaryEntry(newEntries, i, {
            nameOffset,
            sizeOnDisk: fileSize,
            offsetSectors: 0, // patched below
            uncompressedSize: uncompressed,
            encrypted: false,
          })
          slots.push({ index: i, newBlock: block, newOffset: 0 })
          continue
        }

        // resource entry
        let fileSize = (w0 >>> 16) | ((w1 & 0xff) << 16) // 24-bit
        const offsetSectors = (w1 >>> 8) & 0x7fffff
        if (fileSize === 0xffffff) {
          // real size is packed into the first 16 bytes of the block
          const h = await readSrc(offsetSectors * SECTOR, 16)
          fileSize = ((h[7] << 0) | (h[14] << 8) | (h[5] << 16) | (h[2] << 24)) >>> 0
        } else if (fileSize === 0) {
          fileSize = getSizeFromFlags(w2) + getSizeFromFlags(w3) // CodeWalker GetFileSize()
        }
        if (fileSize <= 16) throw new Error(`${name}: implausible resource size ${fileSize}`)
        const block = await readSrc(offsetSectors * SECTOR, fileSize)
        const header16 = block.subarray(0, 16)
        const payload = block.subarray(16, fileSize)
        const decPayload = decryptNg(payload, name, fileSize, ng)
        const newBlock = Buffer.concat([header16, decPayload], fileSize)
        slots.push({ index: i, newBlock, newOffset: 0 })
      }

      // Lay the blocks out contiguously after the (plaintext) TOC.
      const namesLen = this.namesLength
      let cursor = alignUp(16 + this.entryCount * 16 + namesLen, SECTOR)
      for (const s of slots) {
        s.newOffset = cursor
        cursor += alignUp(s.newBlock.length, SECTOR)
        const o = s.index * 16
        const w1 = newEntries.readUInt32LE(o + 4)
        const isResource = (w1 & 0x80000000) !== 0
        if (isResource) {
          newEntries.writeUInt32LE(
            ((w1 & 0x800000ff) | (((s.newOffset / SECTOR) & 0x7fffff) << 8)) >>> 0,
            o + 4,
          )
        } else {
          newEntries.writeUInt32LE(
            ((w1 & 0xff) | (((s.newOffset / SECTOR) & 0xffffff) << 8)) >>> 0,
            o + 4,
          )
        }
      }

      const firstOffset = alignUp(16 + newEntries.length + namesLen, SECTOR)
      const toc = Buffer.alloc(firstOffset)
      origHeader.copy(toc, 0)
      toc.writeUInt32LE(0x4e45504f, 12) // "OPEN"
      newEntries.copy(toc, 16)
      this.namesBuf.copy(toc, 16 + newEntries.length)

      // Every block is already in memory — release the read handle so an
      // in-place swap doesn't hit a Windows sharing violation.
      if (srcFd) {
        await srcFd.close()
        srcFd = null
      }

      if (destPath) {
        const tmp = `${destPath}.rktmp`
        const outFd = await fs.open(tmp, 'w')
        try {
          await outFd.write(toc, 0, toc.length, 0)
          for (const s of slots) {
            const padded = Buffer.alloc(alignUp(s.newBlock.length, SECTOR))
            s.newBlock.copy(padded)
            await outFd.write(padded, 0, padded.length, s.newOffset)
          }
        } finally {
          await outFd.close()
        }
        await fs.rm(destPath, { force: true })
        await fs.rename(tmp, destPath)
        return { entries: slots.length }
      }

      const last = slots[slots.length - 1]
      const totalLen = last ? last.newOffset + alignUp(last.newBlock.length, SECTOR) : toc.length
      const buf = Buffer.alloc(totalLen)
      toc.copy(buf, 0)
      for (const s of slots) s.newBlock.copy(buf, s.newOffset)
      return { entries: slots.length, buf }
    } finally {
      if (srcFd) await srcFd.close()
    }
  }

  /**
   * Rebuild the archive applying add / replace / delete mutations on the tree.
   * The entry and name tables are regenerated in CodeWalker's canonical order
   * (stack DFS, children sorted `String.CompareOrdinal`, names deduped and padded
   * to 16). New files with an `RSC7` header become resource entries, everything
   * else binary (`.rpf`/`.awc` stored raw). OPEN or AES only — convert NG first.
   *
   * With `destPath` it writes a file (temp + rename). Without, it returns the
   * rebuilt archive as `buf` — used for editing a nested `.rpf` in memory.
   */
  async rebuildTree(
    mutations: RpfMutation[],
    destPath?: string,
  ): Promise<{
    added: string[]
    replaced: string[]
    deleted: string[]
    missing: string[]
    buf?: Buffer
  }> {
    if (!destPath && this.source.kind === 'file') {
      throw new Error('rebuildTree needs a destPath for a file-backed archive.')
    }
    if (this.encryption === 'NG') {
      throw new Error('NG-encrypted archives must be converted to OPEN before editing.')
    }
    if (this.encryption === 'AES' && !this.keys.aes) {
      throw new Error('Editing this archive needs the AES key from GTA5.exe.')
    }

    // ── 1. parse the raw entry table into a mutable tree ──────────────────────
    const raw: RawEnt[] = []
    for (let i = 0; i < this.entryCount; i++) {
      const o = i * 16
      const w0 = this.entriesBuf.readUInt32LE(o)
      const w1 = this.entriesBuf.readUInt32LE(o + 4)
      const w2 = this.entriesBuf.readUInt32LE(o + 8)
      const w3 = this.entriesBuf.readUInt32LE(o + 12)
      const name = readCName(this.namesBuf, w0 & 0xffff)
      if (w1 === DIR_IDENT) {
        raw.push({ kind: 'dir', name, childIndex: w2, childCount: w3, children: [] })
      } else if ((w1 & 0x80000000) === 0) {
        const fileSize24 = ((w0 >>> 16) | ((w1 & 0xff) << 16)) & 0xffffff
        raw.push({
          kind: 'binary',
          name,
          offsetSectors: (w1 >>> 8) & 0xffffff,
          fileSize24,
          uncompressed: w2 >>> 0,
          encType: w3 >>> 0,
        })
      } else {
        raw.push({
          kind: 'resource',
          name,
          offsetSectors: (w1 >>> 8) & 0x7fffff,
          fileSize24: (w0 >>> 16) | ((w1 & 0xff) << 16),
          sysFlags: w2 >>> 0,
          gfxFlags: w3 >>> 0,
        })
      }
    }
    // sorted original file offsets → bound a resource block by the next block
    const origFileOffsets = raw
      .filter((e) => e.kind !== 'dir')
      .map((e) => (e as RawFile).offsetSectors * SECTOR)
      .sort((a, b) => a - b)
    const origSize =
      this.source.kind === 'buffer'
        ? this.source.data.length
        : (await fs.stat(this.source.path)).size
    const spanEnd = (off: number): number => {
      for (const fo of origFileOffsets) if (fo > off) return fo
      return origSize
    }

    const link = (idx: number): RawEnt => {
      const e = raw[idx]
      if (e.kind === 'dir') {
        for (let c = e.childIndex; c < e.childIndex + e.childCount; c++) e.children.push(link(c))
      }
      return e
    }
    const root = link(0)
    if (root.kind !== 'dir') throw new Error('RPF root is not a directory.')

    // ── 2. apply mutations ───────────────────────────────────────────────────
    const added: string[] = []
    const replaced: string[] = []
    const deleted: string[] = []
    const missing: string[] = []

    const findChild = (dir: RawDir, nm: string): RawEnt | undefined =>
      dir.children.find((c) => c.name.toLowerCase() === nm.toLowerCase())

    for (const m of mutations) {
      const parts = m.path.replace(/\\/g, '/').split('/').filter(Boolean)
      const fname = parts.pop()!
      let dir: RawDir = root
      let ok = true
      for (const seg of parts) {
        let next = findChild(dir, seg)
        if (!next && m.op === 'add') {
          next = { kind: 'dir', name: seg, childIndex: 0, childCount: 0, children: [] }
          dir.children.push(next)
        }
        if (!next || next.kind !== 'dir') {
          ok = false
          break
        }
        dir = next
      }
      if (!ok) {
        missing.push(m.path)
        continue
      }
      const existing = findChild(dir, fname)
      if (m.op === 'delete') {
        if (existing) {
          dir.children = dir.children.filter((c) => c !== existing)
          deleted.push(m.path)
        } else missing.push(m.path)
        continue
      }
      // add / replace — the new content's header decides binary vs resource
      // (CodeWalker CreateFile deletes any existing entry and re-adds by type).
      if (!m.content) {
        missing.push(m.path)
        continue
      }
      if (m.op === 'replace' && !existing) {
        missing.push(m.path)
        continue
      }
      if (existing && existing.kind === 'dir') {
        missing.push(m.path)
        continue
      }
      if (existing) dir.children = dir.children.filter((c) => c !== existing)
      const node: RawEnt = isRsc7(m.content)
        ? makeResourceNode(fname, m.content)
        : {
            kind: 'binary',
            name: fname,
            offsetSectors: 0,
            fileSize24: 0,
            uncompressed: 0,
            encType: 0,
            isNew: true,
            newContent: m.content,
          }
      dir.children.push(node)
      ;(existing ? replaced : added).push(m.path)
    }

    // ── 3. regenerate entry list in CodeWalker canonical order ───────────────
    const all: RawEnt[] = [root]
    const stack: RawDir[] = [root]
    while (stack.length) {
      const item = stack.pop()!
      item.entriesIndex = all.length
      item.entriesCount = item.children.length
      const sorted = [...item.children].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      for (const child of sorted) {
        all.push(child)
        if (child.kind === 'dir') stack.push(child)
      }
    }
    const entryCount = all.length

    // ── 4. name table (dedup by exact name, pad to 16) ──────────────────────
    const nameOff = new Map<string, number>()
    const nameParts: Buffer[] = []
    let namesLen = 0
    for (const e of all) {
      const nm = e.kind === 'dir' && e === root ? '' : e.name
      const hit = nameOff.get(nm)
      if (hit != null) {
        e.nameOffset = hit
      } else {
        e.nameOffset = namesLen
        nameOff.set(nm, namesLen)
        const b = Buffer.from(`${nm}\0`, 'latin1')
        nameParts.push(b)
        namesLen += b.length
      }
    }
    const namesRaw = Buffer.concat(nameParts)
    const namesBuf = Buffer.alloc(alignUp(namesRaw.length, 16))
    namesRaw.copy(namesBuf)
    const namesLength = namesBuf.length

    // ── 5. lay out file blocks, build the new entry table ───────────────────
    const entries = Buffer.alloc(entryCount * 16)
    interface OutBlock { fromOrigOffset?: number; origLen?: number; payload?: Buffer; at: number }
    const blocks: OutBlock[] = []
    let cursor = alignUp(16 + entryCount * 16 + namesLength, SECTOR)

    for (let i = 0; i < entryCount; i++) {
      const e = all[i]
      const o = i * 16
      if (e.kind === 'dir') {
        entries.writeUInt32LE((e.nameOffset ?? 0) & 0xffff, o)
        entries.writeUInt32LE(DIR_IDENT, o + 4)
        entries.writeUInt32LE((e.entriesIndex ?? 0) >>> 0, o + 8)
        entries.writeUInt32LE((e.entriesCount ?? 0) >>> 0, o + 12)
        continue
      }

      let payload: Buffer | undefined
      let fileSize24: number
      let uncompressed: number
      let origLen = 0
      let fromOrigOffset: number | undefined

      if (e.kind === 'binary' && e.newContent) {
        const content = e.newContent
        const rawStore =
          /\.(rpf|awc)$/i.test(e.name) ||
          (content.length >= 4 && content.readUInt32LE(0) === RPF7_MAGIC)
        const comp = rawStore ? content : deflateRawSync(content, { level: 9 })
        const useC = !rawStore && comp.length < content.length
        payload = useC ? comp : content
        fileSize24 = useC ? comp.length : 0
        uncompressed = content.length
      } else if (e.kind === 'binary') {
        fileSize24 = e.fileSize24
        uncompressed = e.uncompressed
        origLen = e.fileSize24 > 0 ? e.fileSize24 : e.uncompressed
        fromOrigOffset = e.offsetSectors * SECTOR
      } else if (e.newContent) {
        // new / replaced resource — the RSC7 file is stored verbatim
        payload = e.newContent
        fileSize24 = Math.min(e.newContent.length, 0xffffff)
        uncompressed = 0
      } else {
        // untouched resource — verbatim, span-bounded
        fileSize24 = e.fileSize24
        uncompressed = 0
        origLen = spanEnd(e.offsetSectors * SECTOR) - e.offsetSectors * SECTOR
        fromOrigOffset = e.offsetSectors * SECTOR
      }

      const blockLen = payload ? payload.length : origLen
      const at = cursor
      cursor += alignUp(blockLen, SECTOR)
      blocks.push({ payload, fromOrigOffset, origLen, at })
      const offSectors = at / SECTOR

      if (e.kind === 'resource') {
        const fs24 = Math.min(e.fileSize24, 0xffffff)
        entries.writeUInt32LE((((e.nameOffset ?? 0) & 0xffff) | ((fs24 & 0xffff) << 16)) >>> 0, o)
        entries.writeUInt32LE(
          (((fs24 >>> 16) & 0xff) | ((offSectors & 0x7fffff) << 8) | 0x80000000) >>> 0,
          o + 4,
        )
        entries.writeUInt32LE(e.sysFlags >>> 0, o + 8)
        entries.writeUInt32LE(e.gfxFlags >>> 0, o + 12)
      } else {
        writeBinaryEntry(entries, i, {
          nameOffset: (e.nameOffset ?? 0) & 0xffff,
          sizeOnDisk: fileSize24,
          offsetSectors: offSectors,
          uncompressedSize: uncompressed,
          encrypted: false,
        })
      }
    }

    // ── 6. encrypt TOC halves if AES, assemble, write ──────────────────────
    let outEntries: Buffer = entries
    let outNames: Buffer = namesBuf
    if (this.encryption === 'AES') {
      outEntries = aesEncrypt(entries, this.keys.aes!)
      outNames = aesEncrypt(namesBuf, this.keys.aes!)
      const back = aesDecrypt(outEntries, this.keys.aes!)
      if (back.readUInt32LE(4) !== DIR_IDENT || !back.equals(entries)) {
        throw new Error('RPF TOC re-encryption failed a round-trip check — aborting write.')
      }
    }
    const firstOffset = alignUp(16 + outEntries.length + outNames.length, SECTOR)
    const toc = Buffer.alloc(firstOffset)
    toc.writeUInt32LE(RPF7_MAGIC, 0)
    toc.writeUInt32LE(entryCount, 4)
    toc.writeUInt32LE(namesLength, 8)
    toc.writeUInt32LE(this.encryption === 'AES' ? 0x0ffffff9 : 0x4e45504f, 12)
    outEntries.copy(toc, 16)
    outNames.copy(toc, 16 + outEntries.length)

    let srcFd: fs.FileHandle | null =
      this.source.kind === 'file' ? await fs.open(this.source.path, 'r') : null
    const materialize = async (b: (typeof blocks)[number]): Promise<Buffer> => {
      if (b.payload) return b.payload
      if (this.source.kind === 'buffer') {
        return this.source.data.subarray(b.fromOrigOffset!, b.fromOrigOffset! + b.origLen!)
      }
      return readInto(srcFd!, b.fromOrigOffset!, b.origLen!)
    }
    try {
      if (destPath) {
        const tmp = `${destPath}.rktmp`
        const outFd = await fs.open(tmp, 'w')
        try {
          await outFd.write(toc, 0, toc.length, 0)
          for (const b of blocks) {
            const data = await materialize(b)
            const padded = Buffer.alloc(alignUp(data.length, SECTOR))
            data.copy(padded)
            await outFd.write(padded, 0, padded.length, b.at)
          }
        } finally {
          await outFd.close()
        }
        // Drop the read handle to destPath before the swap (Windows).
        if (srcFd) {
          await srcFd.close()
          srcFd = null
        }
        await fs.rm(destPath, { force: true })
        await fs.rename(tmp, destPath)
        return { added, replaced, deleted, missing }
      }

      const last = blocks[blocks.length - 1]
      const totalLen = last
        ? last.at + alignUp((last.payload?.length ?? last.origLen ?? 0), SECTOR)
        : toc.length
      const out = Buffer.alloc(totalLen)
      toc.copy(out, 0)
      for (const b of blocks) {
        const data = await materialize(b)
        data.copy(out, b.at)
      }
      return { added, replaced, deleted, missing, buf: out }
    } finally {
      if (srcFd) await srcFd.close()
    }
  }
}

export interface RpfMutation {
  op: 'add' | 'replace' | 'delete'
  /** inner path, slash-separated */
  path: string
  /** required for add / replace */
  content?: Buffer
}

interface RawDir {
  kind: 'dir'
  name: string
  nameOffset?: number
  childIndex: number
  childCount: number
  children: RawEnt[]
  entriesIndex?: number
  entriesCount?: number
}
interface RawBinary {
  kind: 'binary'
  name: string
  nameOffset?: number
  offsetSectors: number
  fileSize24: number
  uncompressed: number
  encType: number
  isNew?: boolean
  newContent?: Buffer
}
interface RawResource {
  kind: 'resource'
  name: string
  nameOffset?: number
  offsetSectors: number
  fileSize24: number
  sysFlags: number
  gfxFlags: number
  isNew?: boolean
  /** full RSC7 file (header + payload) for a new / replaced resource */
  newContent?: Buffer
}
type RawFile = RawBinary | RawResource
type RawEnt = RawDir | RawFile

const RSC7_MAGIC = 0x37435352

function isRsc7(buf: Buffer | undefined): boolean {
  return !!buf && buf.length >= 16 && buf.readUInt32LE(0) === RSC7_MAGIC
}

/** Build a resource node from a standalone RSC7 file (CodeWalker CreateFile). */
function makeResourceNode(name: string, rsc7: Buffer): RawResource {
  const data = Buffer.from(rsc7) // copy — we may patch the size bytes
  const len = data.length
  const sysFlags = data.readUInt32LE(8)
  const gfxFlags = data.readUInt32LE(12)
  if (len >= 0xffffff) {
    // CodeWalker packs the real size into these 4 header bytes.
    data[7] = (len >>> 0) & 0xff
    data[14] = (len >>> 8) & 0xff
    data[5] = (len >>> 16) & 0xff
    data[2] = (len >>> 24) & 0xff
  }
  return {
    kind: 'resource',
    name,
    offsetSectors: 0,
    fileSize24: Math.min(len, 0xffffff),
    sysFlags,
    gfxFlags,
    isNew: true,
    newContent: data,
  }
}

async function readInto(fd: fs.FileHandle, offset: number, len: number): Promise<Buffer> {
  const out = Buffer.alloc(len)
  if (len > 0) await fd.read(out, 0, len, offset)
  return out
}

/** Read a NUL-terminated latin1 name from the names blob. */
function readCName(names: Buffer, off: number): string {
  let end = off
  while (end < names.length && names[end] !== 0) end++
  return names.toString('latin1', off, end)
}

/**
 * CodeWalker RpfResourceFileEntry.GetSizeFromFlags — resource block size packed
 * into a system/graphics page-flags word. Kept for block-count / defrag math.
 */
export function getSizeFromFlags(flags: number): number {
  const s0 = ((flags >>> 27) & 0x1) << 0
  const s1 = ((flags >>> 26) & 0x1) << 1
  const s2 = ((flags >>> 25) & 0x1) << 2
  const s3 = ((flags >>> 24) & 0x1) << 3
  const s4 = ((flags >>> 17) & 0x7f) << 4
  const s5 = ((flags >>> 11) & 0x3f) << 5
  const s6 = ((flags >>> 7) & 0xf) << 6
  const s7 = ((flags >>> 5) & 0x3) << 7
  const s8 = ((flags >>> 4) & 0x1) << 8
  const ss = flags & 0xf
  const baseSize = 0x200 << ss
  return baseSize * (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8)
}

function readNameOffset(entries: Buffer, index: number): number {
  const w0 = entries.readUInt32LE(index * 16)
  return w0 & 0xffff
}

function parseEntries(
  entries: Buffer,
  names: Buffer,
  count: number,
): { entries: RpfEntry[]; byPath: Map<string, RpfEntry> } {
  const nameAt = (off: number): string => {
    let end = off
    while (end < names.length && names[end] !== 0) end++
    return names.toString('latin1', off, end)
  }

  const raw: Array<
    | { isDir: true; name: string; childIndex: number; childCount: number }
    | {
        isDir: false
        isResource: boolean
        name: string
        sizeOnDisk: number
        offset: number
        uncompressedSize: number
        encrypted: boolean
      }
  > = []

  for (let i = 0; i < count; i++) {
    const o = i * 16
    const w0 = entries.readUInt32LE(o)
    const w1 = entries.readUInt32LE(o + 4)
    const w2 = entries.readUInt32LE(o + 8)
    if (w1 === DIR_IDENT) {
      raw.push({
        isDir: true,
        name: nameAt(w0 & 0xffff),
        childIndex: w2,
        childCount: entries.readUInt32LE(o + 12),
      })
    } else if ((w1 & 0x80000000) === 0) {
      // RpfBinaryFileEntry: [nameOffset:16 | fileSize:24 | fileOffset:24] as a
      // u64, then word2 = FileUncompressedSize (full), word3 = EncryptionType.
      const nameOffset = w0 & 0xffff
      const sizeOnDisk = ((w0 >>> 16) | ((w1 & 0xff) << 16)) & 0xffffff
      const offsetSectors = (w1 >>> 8) & 0xffffff
      raw.push({
        isDir: false,
        isResource: false,
        name: nameAt(nameOffset),
        sizeOnDisk,
        offset: offsetSectors * SECTOR,
        uncompressedSize: w2 >>> 0,
        encrypted: (entries.readUInt32LE(o + 12) >>> 0) !== 0,
      })
    } else {
      // resource file — enough to locate, not to rewrite
      const nameOffset = w0 & 0xffff
      const sizeOnDisk = (w0 >>> 16) | ((w1 & 0xff) << 16)
      const offsetSectors = (w1 >>> 8) & 0x7fffff
      raw.push({
        isDir: false,
        isResource: true,
        name: nameAt(nameOffset),
        sizeOnDisk,
        offset: offsetSectors * SECTOR,
        uncompressedSize: 0,
        encrypted: true,
      })
    }
  }

  const out: RpfEntry[] = []
  const byPath = new Map<string, RpfEntry>()

  const walk = (index: number, prefix: string): void => {
    const node = raw[index]
    if (!node) return
    if (node.isDir) {
      const dirPath = prefix ? `${prefix}/${node.name}` : node.name
      for (let c = node.childIndex; c < node.childIndex + node.childCount; c++) {
        walk(c, index === 0 ? '' : dirPath)
      }
      if (index !== 0) {
        const entry: RpfEntry = {
          name: node.name,
          path: dirPath.toLowerCase(),
          isDir: true,
          isResource: false,
          index,
          sizeOnDisk: 0,
          offset: 0,
          uncompressedSize: 0,
          encrypted: false,
        }
        out.push(entry)
        byPath.set(entry.path, entry)
      }
      return
    }
    const filePath = prefix ? `${prefix}/${node.name}` : node.name
    const entry: RpfEntry = {
      name: node.name,
      path: filePath.toLowerCase(),
      isDir: false,
      isResource: node.isResource,
      index,
      sizeOnDisk: node.sizeOnDisk,
      offset: node.offset,
      uncompressedSize: node.uncompressedSize,
      encrypted: node.encrypted,
    }
    out.push(entry)
    byPath.set(entry.path, entry)
  }

  walk(0, '')
  return { entries: out, byPath }
}

function writeBinaryEntry(
  entries: Buffer,
  index: number,
  e: {
    nameOffset: number
    sizeOnDisk: number
    offsetSectors: number
    uncompressedSize: number
    encrypted: boolean
  },
): void {
  const o = index * 16
  const w0 = (e.nameOffset & 0xffff) | ((e.sizeOnDisk & 0xffff) << 16)
  const w1 = ((e.sizeOnDisk >>> 16) & 0xff) | ((e.offsetSectors & 0xffffff) << 8)
  entries.writeUInt32LE(w0 >>> 0, o)
  entries.writeUInt32LE(w1 >>> 0, o + 4)
  entries.writeUInt32LE(e.uncompressedSize >>> 0, o + 8) // FileUncompressedSize
  entries.writeUInt32LE(e.encrypted ? 1 : 0, o + 12) // EncryptionType
}
