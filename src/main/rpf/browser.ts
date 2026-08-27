import { promises as fs } from 'node:fs'
import { join, dirname, relative, sep, basename } from 'node:path'
import { loadAesKey } from './crypto'
import { Rpf7, type RpfEntry } from './rpf7'
import type { ExplorerListing, ExplorerNode, NodeCategory } from '@shared/types'
import { ensureDir } from '../mods/fsutil'

const isNestedRpf = (e: RpfEntry): boolean =>
  !e.isDir && e.name.toLowerCase().endsWith('.rpf')

const RESOURCE_EXT = new Set([
  'yft', 'ytd', 'ydr', 'ydd', 'ybn', 'ycd', 'ymap', 'ytyp', 'ynv', 'ynd',
  'yed', 'ypt', 'ywr', 'yvr', ' yld', 'gxt2', 'awc', 'ymf', 'ymt', 'ycd',
])
const TEXT_PREVIEW = /\.(xml|meta|txt|ymt|json|cfg|ini|nametable|rel|dat|lua|log|rgl)$/i
const MAX_TEXT = 512 * 1024

function categorize(name: string, isDir: boolean, isRpf: boolean): {
  category: NodeCategory
  typeLabel: string
} {
  if (isDir) return { category: 'folder', typeLabel: 'Folder' }
  if (isRpf) return { category: 'rpf', typeLabel: 'Rage Package File' }
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (RESOURCE_EXT.has(ext)) return { category: 'resource', typeLabel: `Resource (${ext})` }
  const table: Record<string, [NodeCategory, string]> = {
    exe: ['application', 'Application'],
    dll: ['dll', 'Dynamic-link library'],
    asi: ['dll', 'ASI plugin'],
    txt: ['text', 'Plain text'],
    log: ['text', 'Log'],
    ini: ['text', 'Config'],
    cfg: ['text', 'Config'],
    rgl: ['text', 'Plain text'],
    xml: ['textdata', 'XML'],
    meta: ['textdata', 'Meta'],
    json: ['textdata', 'JSON'],
    nametable: ['textdata', 'Name table'],
    rel: ['textdata', 'Audio rel'],
    bin: ['binary', 'Binary data'],
    dat: ['binary', 'Binary data'],
    idx: ['binary', 'Index'],
  }
  const hit = table[ext]
  if (hit) return { category: hit[0], typeLabel: hit[1] }
  return { category: 'other', typeLabel: ext ? `${ext.toUpperCase()} file` : 'File' }
}

interface FsLoc {
  mode: 'fs'
  fsDir: string
}
interface RpfLoc {
  mode: 'rpf'
  rpfFsPath: string
  rest: string[]
}

async function resolveLocation(gamePath: string, vpath: string): Promise<FsLoc | RpfLoc> {
  const segs = vpath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  let real = gamePath
  let idx = 0
  for (; idx < segs.length; idx++) {
    const cand = join(real, segs[idx])
    let st
    try {
      st = await fs.stat(cand)
    } catch {
      throw new Error(`Not found: ${segs.slice(0, idx + 1).join('/')}`)
    }
    if (st.isDirectory()) {
      real = cand
      continue
    }
    if (st.isFile() && segs[idx].toLowerCase().endsWith('.rpf')) {
      real = cand
      idx++
      break
    }
    throw new Error(`Not a folder: ${segs[idx]}`)
  }
  const st = await fs.stat(real)
  if (st.isDirectory()) return { mode: 'fs', fsDir: real }
  return { mode: 'rpf', rpfFsPath: real, rest: segs.slice(idx) }
}

export async function explore(gamePath: string, vpath: string): Promise<ExplorerListing> {
  const loc = await resolveLocation(gamePath, vpath)

  if (loc.mode === 'fs') {
    const entries = await fs.readdir(loc.fsDir, { withFileTypes: true })
    const nodes: ExplorerNode[] = []
    for (const e of entries) {
      const abs = join(loc.fsDir, e.name)
      const isDir = e.isDirectory()
      const isRpf = !isDir && e.name.toLowerCase().endsWith('.rpf')
      let size = 0
      if (!isDir) size = (await fs.stat(abs).catch(() => ({ size: 0 }))).size
      const cat = categorize(e.name, isDir, isRpf)
      nodes.push({
        name: e.name,
        vpath: relative(gamePath, abs).split(sep).join('/'),
        kind: isDir ? 'dir' : isRpf ? 'rpf' : 'file',
        size,
        ...cat,
      })
    }
    return { vpath, mode: 'fs', writable: false, nodes: sortNodes(nodes) }
  }

  // inside an .rpf
  const key = await loadAesKey(gamePath)
  let rpf: Rpf7
  try {
    rpf = await Rpf7.open(loc.rpfFsPath, key)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      vpath,
      mode: 'rpf',
      writable: false,
      error: /"NG"/.test(msg) ? 'ng' : msg,
      nodes: [],
    }
  }

  let innerDir = ''
  let nested = false
  for (const seg of loc.rest) {
    const full = innerDir ? `${innerDir}/${seg}` : seg
    const entry = rpf.get(full)
    if (!entry) throw new Error(`Not found in archive: ${full}`)
    if (isNestedRpf(entry)) {
      rpf = await rpf.openNested(full)
      innerDir = ''
      nested = true
    } else if (entry.isDir) {
      innerDir = full
    } else {
      throw new Error(`Not a folder: ${seg}`)
    }
  }

  const base = innerDir ? `${innerDir}/` : ''
  const children = rpf.entries.filter((e) => {
    if (!e.path.startsWith(base)) return false
    const rest = e.path.slice(base.length)
    return rest.length > 0 && !rest.includes('/')
  })

  const nodes: ExplorerNode[] = children.map((e) => {
    const isRpf = !e.isDir && e.name.toLowerCase().endsWith('.rpf')
    const cat = e.isResource
      ? { category: 'resource' as NodeCategory, typeLabel: 'Resource' }
      : categorize(e.name, e.isDir, isRpf)
    return {
      name: e.name,
      vpath: `${vpath}/${e.name}`,
      kind: e.isDir ? 'dir' : isRpf ? 'rpf' : 'file',
      size: e.uncompressedSize,
      ...cat,
    }
  })

  const abs = loc.rpfFsPath.toLowerCase()
  const inMods = abs.includes(`${sep}mods${sep}`) || abs.includes('/mods/')

  return {
    vpath,
    mode: 'rpf',
    writable: inMods && !nested,
    encryption: rpf.encryption,
    nodes: sortNodes(nodes),
  }
}

function sortNodes(nodes: ExplorerNode[]): ExplorerNode[] {
  return nodes.sort(
    (a, b) =>
      Number(b.kind === 'dir') - Number(a.kind === 'dir') ||
      Number(b.kind === 'rpf') - Number(a.kind === 'rpf') ||
      a.name.localeCompare(b.name),
  )
}

// ── file operations on a vpath ───────────────────────────────────────────────

async function openToFile(
  gamePath: string,
  vpath: string,
): Promise<{ fsFile: string } | { rpf: Rpf7; inner: string; writable: boolean; fsPath: string }> {
  const segs = vpath.split('/').filter(Boolean)
  const parent = segs.slice(0, -1).join('/')
  const name = segs[segs.length - 1]
  const loc = await resolveLocation(gamePath, parent || '.')

  if (loc.mode === 'fs') return { fsFile: join(loc.fsDir, name) }

  const key = await loadAesKey(gamePath)
  let rpf = await Rpf7.open(loc.rpfFsPath, key)
  let innerDir = ''
  let nested = false
  for (const seg of loc.rest) {
    const full = innerDir ? `${innerDir}/${seg}` : seg
    const entry = rpf.get(full)
    if (!entry) throw new Error(`Not found: ${full}`)
    if (isNestedRpf(entry)) {
      rpf = await rpf.openNested(full)
      innerDir = ''
      nested = true
    } else innerDir = full
  }
  const abs = loc.rpfFsPath.toLowerCase()
  const inMods = abs.includes(`${sep}mods${sep}`) || abs.includes('/mods/')
  return {
    rpf,
    inner: innerDir ? `${innerDir}/${name}` : name,
    writable: inMods && !nested,
    fsPath: loc.rpfFsPath,
  }
}

export async function extractEntry(gamePath: string, vpath: string, savePath: string): Promise<void> {
  const t = await openToFile(gamePath, vpath)
  if ('fsFile' in t) {
    await fs.copyFile(t.fsFile, savePath)
    return
  }
  await fs.writeFile(savePath, await t.rpf.readFile(t.inner))
}

export async function readEntryText(gamePath: string, vpath: string): Promise<string> {
  if (!TEXT_PREVIEW.test(vpath)) throw new Error('Not a previewable text file.')
  const t = await openToFile(gamePath, vpath)
  if ('fsFile' in t) {
    const buf = await fs.readFile(t.fsFile)
    return buf.subarray(0, MAX_TEXT).toString('utf8')
  }
  return (await t.rpf.readFile(t.inner)).subarray(0, MAX_TEXT).toString('utf8')
}

export async function replaceEntry(
  gamePath: string,
  vpath: string,
  sourcePath: string,
): Promise<void> {
  const t = await openToFile(gamePath, vpath)
  if ('fsFile' in t) {
    const lower = t.fsFile.toLowerCase()
    if (!lower.includes(`${sep}mods${sep}`) && !lower.includes('/mods/')) {
      throw new Error('Loose files outside the mods/ folder are read-only.')
    }
    await fs.copyFile(sourcePath, t.fsFile)
    return
  }
  if (!t.writable) {
    throw new Error('Only archives inside the mods/ folder can be edited. Copy it into mods/ first.')
  }
  await t.rpf.replaceFile(t.inner, await fs.readFile(sourcePath))
}

export async function copyArchiveToMods(gamePath: string, vpath: string): Promise<string> {
  if (vpath.toLowerCase().startsWith('mods/')) return vpath
  const src = join(gamePath, vpath)
  const destRel = `mods/${vpath}`
  const dst = join(gamePath, destRel)
  await ensureDir(dirname(dst))
  await fs.copyFile(src, dst)
  return destRel
}

export function archiveBasename(vpath: string): string {
  return basename(vpath)
}
