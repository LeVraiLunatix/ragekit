import { promises as fs } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { loadAesKey } from './crypto'
import { Rpf7 } from './rpf7'
import type { RpfEncryption } from './rpf7'
import { walk, ensureDir } from '../mods/fsutil'

export interface ArchiveInfo {
  rel: string // relative to game folder, slash-separated
  sizeBytes: number
  encryption: RpfEncryption
  inMods: boolean
}

export interface RpfNode {
  name: string
  path: string // inner path, lowercase, slash
  isDir: boolean
  isResource: boolean
  isNestedRpf: boolean
  size: number
}

export interface OpenedArchive {
  encryption: RpfEncryption
  /** true when this exact archive can be edited (file-backed and under mods/). */
  writable: boolean
  nodes: RpfNode[]
}

const TEXT_EXT = /\.(xml|meta|txt|ymt|json|cfg|ini|nametable|rel|dat|lua)$/i
const MAX_TEXT = 512 * 1024

function headerEncryption(head: Buffer): RpfEncryption {
  if (head.length < 16 || head.readUInt32LE(0) !== 0x52504637) return 'UNKNOWN'
  const v = head.readUInt32LE(12)
  if (v === 0) return 'NONE'
  if (v === 0x4e45504f) return 'OPEN'
  if (v === 0x0ffffff9) return 'AES'
  if (v === 0x0feffffe || v === 0x0fefffff) return 'NG'
  return 'UNKNOWN'
}

export async function listArchives(gamePath: string): Promise<ArchiveInfo[]> {
  const files = (await walk(gamePath).catch(() => [])).filter((f) =>
    f.toLowerCase().endsWith('.rpf'),
  )
  const out: ArchiveInfo[] = []
  for (const f of files) {
    const rel = relative(gamePath, f).split(sep).join('/')
    // Skip archives nested many levels inside dlcpacks noise; keep it useful.
    let head = Buffer.alloc(16)
    try {
      const fd = await fs.open(f, 'r')
      await fd.read(head, 0, 16, 0)
      await fd.close()
    } catch {
      continue
    }
    const st = await fs.stat(f).catch(() => null)
    if (!st) continue
    out.push({
      rel,
      sizeBytes: st.size,
      encryption: headerEncryption(head),
      inMods: rel.toLowerCase().startsWith('mods/'),
    })
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

async function openChain(gamePath: string, chain: string[]): Promise<Rpf7> {
  const key = await loadAesKey(gamePath).catch(() => null)
  let rpf = await Rpf7.open(join(gamePath, chain[0]), key)
  for (let i = 1; i < chain.length; i++) rpf = await rpf.openNested(chain[i])
  return rpf
}

export async function openArchive(gamePath: string, chain: string[]): Promise<OpenedArchive> {
  const rpf = await openChain(gamePath, chain)
  const nodes: RpfNode[] = rpf.entries.map((e) => ({
    name: e.name,
    path: e.path,
    isDir: e.isDir,
    isResource: e.isResource,
    isNestedRpf: !e.isDir && e.name.toLowerCase().endsWith('.rpf'),
    size: e.uncompressedSize,
  }))
  const abs = join(gamePath, chain[0]).toLowerCase()
  const inMods = abs.includes(`${sep}mods${sep}`) || abs.includes('/mods/')
  return { encryption: rpf.encryption, writable: chain.length === 1 && inMods, nodes }
}

export async function extractEntry(
  gamePath: string,
  chain: string[],
  innerPath: string,
  savePath: string,
): Promise<void> {
  const rpf = await openChain(gamePath, chain)
  await fs.writeFile(savePath, await rpf.readFile(innerPath))
}

export async function readEntryText(
  gamePath: string,
  chain: string[],
  innerPath: string,
): Promise<string> {
  if (!TEXT_EXT.test(innerPath)) throw new Error('Not a previewable text file.')
  const rpf = await openChain(gamePath, chain)
  const buf = await rpf.readFile(innerPath)
  return buf.subarray(0, MAX_TEXT).toString('utf8')
}

export async function replaceEntry(
  gamePath: string,
  chain: string[],
  innerPath: string,
  sourcePath: string,
): Promise<void> {
  if (chain.length !== 1) throw new Error('Nested archives are read-only.')
  const abs = join(gamePath, chain[0])
  const lower = abs.toLowerCase()
  if (!lower.includes(`${sep}mods${sep}`) && !lower.includes('/mods/')) {
    throw new Error('Only archives inside the mods/ folder can be edited. Copy it into mods/ first.')
  }
  const key = await loadAesKey(gamePath).catch(() => null)
  const rpf = await Rpf7.open(abs, key)
  await rpf.replaceFile(innerPath, await fs.readFile(sourcePath))
}

/** Mirror a game archive into mods/ so it becomes editable. Returns its new rel path. */
export async function copyArchiveToMods(gamePath: string, rel: string): Promise<string> {
  if (rel.toLowerCase().startsWith('mods/')) return rel
  const src = join(gamePath, rel)
  const destRel = `mods/${rel}`
  const dst = join(gamePath, destRel)
  await ensureDir(dirname(dst))
  await fs.copyFile(src, dst)
  return destRel
}
