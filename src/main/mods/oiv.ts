import { promises as fs } from 'node:fs'
import { join, dirname, normalize } from 'node:path'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import { ensureDir } from './fsutil'

export interface OivMetadata {
  name: string
  author?: string
  version?: string
  description?: string
}

/** A single flattened operation from an .oiv assembly.xml <content> block. */
export interface OivOp {
  kind: 'add' | 'delete'
  /** zip-internal path of the source file (for `add`). */
  source?: string
  /** Target path relative to the game folder. */
  target: string
  /** RPF archive chain this op lives inside, e.g. ["update\\update.rpf", "dlc.rpf"]. */
  archiveChain: string[]
}

export interface OivPackage {
  metadata: OivMetadata
  ops: OivOp[]
  /** Ops that write into .rpf archives — not supported by the v1 loose installer. */
  archiveOps: OivOp[]
  /** Ops that write loose files — fully supported. */
  looseOps: OivOp[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
})

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function textOf(node: unknown): string | undefined {
  if (node == null) return undefined
  if (typeof node === 'string') return node
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'])
  }
  return undefined
}

function parseMetadata(meta: Record<string, unknown> | undefined): OivMetadata {
  if (!meta) return { name: 'Unnamed OIV package' }
  const version = meta.version as Record<string, unknown> | undefined
  const major = version ? textOf(version.major) : undefined
  const minor = version ? textOf(version.minor) : undefined
  const authorNode = meta.author as Record<string, unknown> | string | undefined
  const author =
    typeof authorNode === 'string'
      ? authorNode
      : textOf(authorNode?.displayName) ?? textOf(authorNode)
  return {
    name: textOf(meta.name) ?? 'Unnamed OIV package',
    author: author || undefined,
    version: major != null ? `${major}.${minor ?? 0}` : undefined,
    description: textOf(meta.description) ?? textOf(meta.largeDescription),
  }
}

function flattenContent(node: Record<string, unknown>, chain: string[], ops: OivOp[]): void {
  for (const add of asArray(node.add as unknown)) {
    if (typeof add === 'object' && add != null) {
      const rec = add as Record<string, unknown>
      const target = textOf(rec) ?? String(rec['#text'] ?? '')
      ops.push({
        kind: 'add',
        source: rec['@_source'] as string | undefined,
        target: normalize(target).replace(/^[\\/]+/, ''),
        archiveChain: [...chain],
      })
    } else if (typeof add === 'string') {
      ops.push({ kind: 'add', target: normalize(add).replace(/^[\\/]+/, ''), archiveChain: [...chain] })
    }
  }

  for (const del of asArray(node.delete as unknown)) {
    const target = textOf(del) ?? (typeof del === 'string' ? del : '')
    if (target) {
      ops.push({
        kind: 'delete',
        target: normalize(target).replace(/^[\\/]+/, ''),
        archiveChain: [...chain],
      })
    }
  }

  for (const archive of asArray(node.archive as unknown)) {
    if (typeof archive === 'object' && archive != null) {
      const rec = archive as Record<string, unknown>
      const path = rec['@_path'] as string | undefined
      flattenContent(rec, path ? [...chain, path] : chain, ops)
    }
  }
}

export async function readOivPackage(oivPath: string): Promise<{ zip: AdmZip; pkg: OivPackage }> {
  const zip = new AdmZip(oivPath)
  const entry =
    zip.getEntry('assembly.xml') ??
    zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('assembly.xml'))
  if (!entry) throw new Error('Not a valid .oiv package: assembly.xml is missing.')

  const xml = zip.readAsText(entry)
  const doc = parser.parse(xml) as Record<string, unknown>
  const pkgNode = (doc.package ?? doc.Package) as Record<string, unknown> | undefined
  if (!pkgNode) throw new Error('Not a valid .oiv package: <package> root is missing.')

  const metadata = parseMetadata(pkgNode.metadata as Record<string, unknown> | undefined)
  const ops: OivOp[] = []
  const content = pkgNode.content as Record<string, unknown> | undefined
  if (content) flattenContent(content, [], ops)

  const archiveOps = ops.filter((o) => o.archiveChain.length > 0)
  const looseOps = ops.filter((o) => o.archiveChain.length === 0)

  return { zip, pkg: { metadata, ops, archiveOps, looseOps } }
}

/**
 * Extract the source files referenced by loose ops into a staging folder,
 * laid out at their final game-relative paths. Returns the staging dir.
 */
export async function stageOivLooseFiles(
  zip: AdmZip,
  looseOps: OivOp[],
  stagingDir: string,
): Promise<string[]> {
  const written: string[] = []
  for (const op of looseOps) {
    if (op.kind !== 'add' || !op.source) continue
    const src = op.source.replace(/\\/g, '/')
    const entry =
      zip.getEntry(src) ?? zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/') === src)
    if (!entry) continue
    const dest = join(stagingDir, op.target)
    await ensureDir(dirname(dest))
    await fs.writeFile(dest, entry.getData())
    written.push(op.target.replace(/\\/g, '/'))
  }
  return written
}
