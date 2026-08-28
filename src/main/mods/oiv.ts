import { join, normalize } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type {
  OivContentOp,
  OivInspection,
  OivOpKind,
  OivTarget,
  OivTargetChoice,
} from '@shared/types'
import { pathExists } from './fsutil'
import { OivZip, withOivZip } from './oivZip'

export interface OivMetadata {
  name: string
  author?: string
  authorLink?: string
  version?: string
  description?: string
}

/** A single flattened operation from an .oiv assembly.xml <content> block. */
export interface OivOp {
  kind: 'add' | 'delete' | 'xml-edit'
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
  /** Ops that write into .rpf archives — not supported by the loose installer. */
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
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'])
  }
  return undefined
}

/** Flatten RTF (or lightly-tagged HTML) into plain text for display. */
export function deRtf(input: string | undefined): string | undefined {
  if (!input) return undefined
  const s = input.trim()
  if (!s) return undefined

  if (!/^\{\\rtf/i.test(s)) {
    const plain = s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return plain || undefined
  }

  let out = s
  // Drop metadata groups we never want to render.
  out = out.replace(
    /\{\\\*?\\(fonttbl|colortbl|stylesheet|info|generator|pntext|listtable|listoverridetable)[^{}]*(\{[^{}]*\}[^{}]*)*\}/gi,
    '',
  )
  // Unicode escapes: \uNNNN followed by a fallback char.
  out = out.replace(/\\u(-?\d+)\s?\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
  // Hex escapes: \'xx
  out = out.replace(/\\'([0-9a-fA-F]{2})/g, (_, h: string) => {
    try {
      return Buffer.from([parseInt(h, 16)]).toString('latin1')
    } catch {
      return ''
    }
  })
  out = out.replace(/\\pard?/g, '\n').replace(/\\line\b/g, '\n').replace(/\\tab\b/g, '\t')
  // Any remaining control word (with optional numeric arg and trailing space).
  out = out.replace(/\\[a-zA-Z]+-?\d* ?/g, '')
  out = out.replace(/[{}]/g, '').replace(/\\\*/g, '')
  out = out.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return out.trim() || undefined
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
  const authorLink =
    typeof authorNode === 'object' && authorNode
      ? textOf(authorNode.web) ?? textOf(authorNode.actionLink)
      : undefined
  const largeDesc =
    textOf((meta.largeDescription as Record<string, unknown>)?.displayName) ??
    textOf(meta.largeDescription)
  const shortDesc =
    textOf((meta.description as Record<string, unknown>)?.displayName) ?? textOf(meta.description)
  return {
    name: textOf((meta.name as Record<string, unknown>)?.displayName) ?? textOf(meta.name) ?? 'Unnamed OIV package',
    author: author?.trim() || undefined,
    authorLink: authorLink?.trim() || undefined,
    version: major != null ? `${major}.${minor ?? 0}` : undefined,
    description: deRtf(largeDesc) ?? deRtf(shortDesc),
  }
}

const clean = (p: string): string => normalize(p).replace(/^[\\/]+/, '').replace(/\\/g, '/')

function flattenContent(node: Record<string, unknown>, chain: string[], ops: OivOp[]): void {
  for (const add of asArray(node.add as unknown)) {
    if (typeof add === 'object' && add != null) {
      const rec = add as Record<string, unknown>
      const target = textOf(rec) ?? String(rec['#text'] ?? '')
      ops.push({
        kind: 'add',
        source: rec['@_source'] as string | undefined,
        target: clean(target),
        archiveChain: [...chain],
      })
    } else if (typeof add === 'string') {
      ops.push({ kind: 'add', target: clean(add), archiveChain: [...chain] })
    }
  }

  for (const del of asArray(node.delete as unknown)) {
    const target = textOf(del) ?? (typeof del === 'string' ? del : '')
    if (target) ops.push({ kind: 'delete', target: clean(target), archiveChain: [...chain] })
  }

  // <text path="…"> … XML edit fragments … </text>
  for (const txt of asArray(node.text as unknown)) {
    if (typeof txt === 'object' && txt != null) {
      const rec = txt as Record<string, unknown>
      const path = (rec['@_path'] as string | undefined) ?? ''
      if (path) ops.push({ kind: 'xml-edit', target: clean(path), archiveChain: [...chain] })
    }
  }

  for (const archive of asArray(node.archive as unknown)) {
    if (typeof archive === 'object' && archive != null) {
      const rec = archive as Record<string, unknown>
      const path = rec['@_path'] as string | undefined
      flattenContent(rec, path ? [...chain, clean(path)] : chain, ops)
    }
  }
}

function parseAssembly(xml: string): OivPackage {
  const doc = parser.parse(xml) as Record<string, unknown>
  const pkgNode = (doc.package ?? doc.Package) as Record<string, unknown> | undefined
  if (!pkgNode) throw new Error('Not a valid .oiv package: <package> root is missing.')

  const metadata = parseMetadata(pkgNode.metadata as Record<string, unknown> | undefined)
  const ops: OivOp[] = []
  const content = pkgNode.content as Record<string, unknown> | undefined
  if (content) flattenContent(content, [], ops)

  return {
    metadata,
    ops,
    archiveOps: ops.filter((o) => o.archiveChain.length > 0),
    looseOps: ops.filter((o) => o.archiveChain.length === 0),
  }
}

/** Parse the `assembly.xml` manifest of an already-open .oiv. */
export async function parseOivPackage(zOrPath: OivZip | string): Promise<OivPackage> {
  if (typeof zOrPath === 'string') return withOivZip(zOrPath, (z) => parseOivPackage(z))
  const z = zOrPath
  let name = z.names().find((n) => n.toLowerCase().replace(/\\/g, '/') === 'assembly.xml')
  name ??= z.names().find((n) => n.toLowerCase().replace(/\\/g, '/').endsWith('/assembly.xml'))
  if (!name) throw new Error('Not a valid .oiv package: assembly.xml is missing.')
  const buf = await z.buffer(name)
  if (!buf) throw new Error('Not a valid .oiv package: assembly.xml could not be read.')
  return parseAssembly(buf.toString('utf8'))
}

/**
 * Extract the source files referenced by loose `add` ops into a staging folder,
 * laid out at their final game-relative paths. Returns the relative paths written.
 */
export async function stageOivLooseFiles(
  z: OivZip,
  looseOps: OivOp[],
  stagingDir: string,
): Promise<string[]> {
  const written: string[] = []
  for (const op of looseOps) {
    if (op.kind !== 'add' || !op.source) continue
    const ok = await z.toFile(op.source, join(stagingDir, op.target)).catch(() => false)
    if (ok) written.push(op.target.replace(/\\/g, '/'))
  }
  return written
}

// ---------------------------------------------------------------------------
// Inspection — everything the OpenIV-style installer dialog needs
// ---------------------------------------------------------------------------

const ICON_RX = /(^|\/)icon\.(png|jpe?g|bmp|gif)$/i

async function findIconDataUri(z: OivZip): Promise<string | undefined> {
  const names = z.names().filter((n) => ICON_RX.test(n.replace(/\\/g, '/')))
  if (!names.length) return undefined
  // Prefer one at the package root.
  names.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length)
  const pick = names[0]
  if ((z.size(pick) ?? Infinity) > 512 * 1024) return undefined
  const data = await z.buffer(pick).catch(() => null)
  if (!data?.length) return undefined
  const lower = pick.toLowerCase()
  const ext = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
    ? 'jpeg'
    : lower.endsWith('.bmp')
      ? 'bmp'
      : lower.endsWith('.gif')
        ? 'gif'
        : 'png'
  return `data:image/${ext};base64,${data.toString('base64')}`
}

function classifyOp(op: OivOp): OivContentOp {
  const archive = op.archiveChain.join('/')
  const base: OivContentOp = {
    kind: op.kind as OivOpKind,
    target: op.target,
    archive,
    supported: false,
  }

  if (op.kind === 'xml-edit') {
    return { ...base, reason: 'in-place XML edit — not supported yet' }
  }
  if (!archive) {
    // Loose file — fully supported. `add` maps to add/replace at apply time.
    return { ...base, kind: op.kind === 'add' ? 'add' : 'delete', supported: true }
  }
  // Op inside a .rpf archive.
  if (op.kind === 'delete') {
    return { ...base, kind: 'delete', reason: `deletes inside ${archive} — not supported yet` }
  }
  // Applied by rebuilding the archive in the mods folder (NG vanilla archives
  // are decrypted to OPEN first; nested archives are rebuilt in memory).
  return { ...base, kind: 'replace', supported: true }
}

export async function inspectOiv(oivPath: string, gamePath: string | null): Promise<OivInspection> {
  const { pkg, ops, icon } = await withOivZip(oivPath, async (z) => {
    const parsed = await parseOivPackage(z)
    const classified: OivContentOp[] = parsed.ops.map((op) => ({
      ...classifyOp(op),
      size: op.source ? z.size(op.source) : undefined,
    }))
    return { pkg: parsed, ops: classified, icon: await findIconDataUri(z) }
  })

  const counts = {
    add: ops.filter((o) => o.kind === 'add').length,
    replace: ops.filter((o) => o.kind === 'replace').length,
    delete: ops.filter((o) => o.kind === 'delete').length,
    xmlEdit: ops.filter((o) => o.kind === 'xml-edit').length,
    archive: pkg.archiveOps.length,
    loose: pkg.looseOps.length,
  }

  const targets: OivTargetChoice[] = []
  if (gamePath) {
    const modsPath = join(gamePath, 'mods')
    const modsExists = await pathExists(modsPath)
    // OpenIV defaults to the mods folder when it exists, otherwise the game folder.
    targets.push({ id: 'mods', path: modsPath, exists: modsExists, recommended: modsExists })
    targets.push({ id: 'game', path: gamePath, exists: true, recommended: !modsExists })
  }

  return {
    sourcePath: oivPath,
    name: pkg.metadata.name,
    author: pkg.metadata.author,
    authorLink: pkg.metadata.authorLink,
    version: pkg.metadata.version,
    description: pkg.metadata.description,
    icon,
    ops,
    counts,
    supported: ops.filter((o) => o.supported).length,
    total: ops.length,
    targets,
  }
}

/** Resolve the base folder for a chosen target. */
export function oivBaseDir(gamePath: string, target: OivTarget): string {
  return target === 'mods' ? join(gamePath, 'mods') : gamePath
}
