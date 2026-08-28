import { createWriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import { ensureDir } from './fsutil'

/**
 * Streaming reader for .oiv packages. `adm-zip` loads the whole archive into a
 * Buffer, which throws `ERR_FS_FILE_TOO_LARGE` past 2 GiB — and graphics
 * overhauls (NVE, QuantV…) ship multi-GB .oiv files. yauzl only reads the
 * central directory, then streams individual entries on demand.
 */
const norm = (s: string): string => s.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()

export class OivZip {
  private readonly zf: yauzl.ZipFile
  /** normalised entry name -> yauzl entry */
  private readonly entries: Map<string, yauzl.Entry>

  private constructor(zf: yauzl.ZipFile, entries: Map<string, yauzl.Entry>) {
    this.zf = zf
    this.entries = entries
  }

  static open(oivPath: string): Promise<OivZip> {
    return new Promise((resolve, reject) => {
      yauzl.open(oivPath, { lazyEntries: true, autoClose: false }, (err, zf) => {
        if (err || !zf) return reject(err ?? new Error('Could not open .oiv package.'))
        const raw = new Map<string, yauzl.Entry>()
        zf.on('entry', (entry: yauzl.Entry) => {
          if (!/\/$/.test(entry.fileName)) raw.set(norm(entry.fileName), entry)
          zf.readEntry()
        })
        zf.on('end', () => {
          // Some .oiv zips nest everything under one top folder while assembly.xml
          // references sources relative to it. Detect that prefix and also key
          // every entry without it, so `source="content/x"` still resolves.
          let prefix = ''
          for (const k of raw.keys()) {
            if (k === 'assembly.xml') {
              prefix = ''
              break
            }
            if (k.endsWith('/assembly.xml') && (prefix === '' || k.length < prefix.length)) {
              prefix = k.slice(0, -'assembly.xml'.length)
            }
          }
          const entries = new Map<string, yauzl.Entry>()
          for (const [k, v] of raw) {
            entries.set(k, v)
            if (prefix && k.startsWith(prefix) && !entries.has(k.slice(prefix.length))) {
              entries.set(k.slice(prefix.length), v)
            }
          }
          resolve(new OivZip(zf, entries))
        })
        zf.on('error', reject)
        zf.readEntry()
      })
    })
  }

  private entry(name: string): yauzl.Entry | undefined {
    return this.entries.get(norm(name))
  }

  has(name: string): boolean {
    return this.entry(name) != null
  }

  size(name: string): number | undefined {
    return this.entry(name)?.uncompressedSize
  }

  /** All entry names (original case), directories excluded. */
  names(): string[] {
    return [...new Set([...this.entries.values()].map((e) => e.fileName))]
  }

  /** Read one entry fully into memory. Use only for small entries. */
  buffer(name: string): Promise<Buffer | null> {
    const entry = this.entry(name)
    if (!entry) return Promise.resolve(null)
    return new Promise((resolve, reject) => {
      this.zf.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error(`Cannot read ${name}`))
        const chunks: Buffer[] = []
        stream.on('data', (c: Buffer) => chunks.push(c))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    })
  }

  /** Stream one entry straight to disk (no full-file buffering). */
  async toFile(name: string, dest: string): Promise<boolean> {
    const entry = this.entry(name)
    if (!entry) return false
    await ensureDir(dirname(dest))
    const stream: NodeJS.ReadableStream = await new Promise((resolve, reject) => {
      this.zf.openReadStream(entry, (err, s) => (err || !s ? reject(err ?? new Error('read failed')) : resolve(s)))
    })
    await pipeline(stream, createWriteStream(dest))
    return true
  }

  close(): void {
    try {
      this.zf.close()
    } catch {
      /* already closed */
    }
  }
}

/** Open an .oiv, run `fn`, always close the handle. */
export async function withOivZip<T>(oivPath: string, fn: (z: OivZip) => Promise<T>): Promise<T> {
  const z = await OivZip.open(oivPath)
  try {
    return await fn(z)
  } finally {
    z.close()
  }
}
