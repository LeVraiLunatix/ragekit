import { promises as fs } from 'node:fs'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { RpfEncryption } from '@shared/types'
import { aesDecrypt, aesEncrypt } from './crypto'

const RPF7_MAGIC = 0x52504637
const DIR_IDENT = 0x7fffff00
const SECTOR = 512

export type { RpfEncryption }

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
    private key: Buffer | null,
    readonly entries: RpfEntry[],
    private byPath: Map<string, RpfEntry>,
  ) {}

  get label(): string {
    return this.source.kind === 'file' ? this.source.path : this.source.label
  }

  get writable(): boolean {
    return this.source.kind === 'file'
  }

  private static parse(
    head16: Buffer,
    toc: Buffer,
    key: Buffer | null,
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
    if (encryption === 'NG' || encryption === 'UNKNOWN') {
      throw new Error(`RPF encryption "${encryption}" is not supported.`)
    }
    const tocLen = entryCount * 16 + namesLength
    let plain: Buffer = toc.subarray(0, tocLen)
    if (encryption === 'AES') {
      if (!key) throw new Error('This RPF is AES-encrypted but no key was provided.')
      plain = aesDecrypt(Buffer.from(plain), key)
    }
    const entriesBuf = Buffer.from(plain.subarray(0, entryCount * 16))
    const namesBuf = Buffer.from(plain.subarray(entryCount * 16, tocLen))
    if (entryCount === 0 || entriesBuf.readUInt32LE(4) !== DIR_IDENT) {
      throw new Error(`${label}: table of contents did not decode (encryption "${encryption}").`)
    }
    const { entries, byPath } = parseEntries(entriesBuf, namesBuf, entryCount)
    return { encryption, entryCount, namesLength, entriesBuf, namesBuf, entries, byPath }
  }

  static async open(filePath: string, key: Buffer | null): Promise<Rpf7> {
    const fd = await fs.open(filePath, 'r')
    try {
      const head16 = Buffer.alloc(16)
      await fd.read(head16, 0, 16, 0)
      const entryCount = head16.readUInt32LE(4)
      const namesLength = head16.readUInt32LE(8)
      const toc = Buffer.alloc(entryCount * 16 + namesLength)
      await fd.read(toc, 0, toc.length, 16)
      const p = Rpf7.parse(head16, toc, key, filePath)
      return new Rpf7(
        { kind: 'file', path: filePath },
        p.encryption,
        p.entryCount,
        p.namesLength,
        p.entriesBuf,
        p.namesBuf,
        key,
        p.entries,
        p.byPath,
      )
    } finally {
      await fd.close()
    }
  }

  static fromBuffer(data: Buffer, key: Buffer | null, label: string): Rpf7 {
    const head16 = data.subarray(0, 16)
    const entryCount = head16.readUInt32LE(4)
    const namesLength = head16.readUInt32LE(8)
    const toc = data.subarray(16, 16 + entryCount * 16 + namesLength)
    const p = Rpf7.parse(head16, toc, key, label)
    return new Rpf7(
      { kind: 'buffer', data, label },
      p.encryption,
      p.entryCount,
      p.namesLength,
      p.entriesBuf,
      p.namesBuf,
      key,
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
      if (!this.key) throw new Error('File is encrypted but no key is available.')
      data = aesDecrypt(data, this.key)
    }
    if (e.sizeOnDisk > 0) data = inflateRawSync(data.subarray(0, e.sizeOnDisk))
    return data.subarray(0, e.uncompressedSize)
  }

  /** Open a `.rpf` nested inside this one (read-only). */
  async openNested(innerPath: string): Promise<Rpf7> {
    const bytes = await this.readFile(innerPath)
    return Rpf7.fromBuffer(bytes, this.key, `${this.label}/${innerPath}`)
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
      const plainToc = Buffer.concat([newEntries, this.namesBuf])
      let toc: Buffer = plainToc
      if (this.encryption === 'AES') {
        if (!this.key) throw new Error('Cannot re-encrypt TOC without the key.')
        toc = aesEncrypt(plainToc, this.key)
        // Verify the round-trip before touching the file.
        const back = aesDecrypt(toc, this.key)
        if (
          back.readUInt32LE(4) !== DIR_IDENT ||
          !back.subarray(0, plainToc.length).equals(plainToc)
        ) {
          throw new Error('RPF TOC re-encryption failed a round-trip check — aborting write.')
        }
      }

      // Only now mutate the archive: append data, then overwrite the TOC.
      const padded = Buffer.alloc(alignUp(payload.length, SECTOR))
      payload.copy(padded)
      await fd.write(padded, 0, padded.length, newOffset)
      await fd.write(toc, 0, toc.length, 16)

      newEntries.copy(this.entriesBuf)
      e.sizeOnDisk = sizeOnDisk
      e.offset = newOffset
      e.uncompressedSize = content.length
      e.encrypted = false
    } finally {
      await fd.close()
    }
  }
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
      const nameOffset = w0 & 0xffff
      const sizeOnDisk = (w0 >>> 16) | ((w1 & 0xff) << 16)
      const offsetSectors = (w1 >>> 8) & 0xffffff
      raw.push({
        isDir: false,
        isResource: false,
        name: nameAt(nameOffset),
        sizeOnDisk,
        offset: offsetSectors * SECTOR,
        uncompressedSize: w2 & 0xffffff,
        encrypted: ((w2 >>> 24) & 0xff) !== 0,
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
  const w2 = (e.uncompressedSize & 0xffffff) | ((e.encrypted ? 1 : 0) << 24)
  entries.writeUInt32LE(w0 >>> 0, o)
  entries.writeUInt32LE(w1 >>> 0, o + 4)
  entries.writeUInt32LE(w2 >>> 0, o + 8)
  entries.writeUInt32LE(0, o + 12)
}
