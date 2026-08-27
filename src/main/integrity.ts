import { promises as fs, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { IntegrityReport, VanillaSnapshot, SnapshotEntry } from '@shared/types'
import { store } from './store'
import { pathExists } from './mods/fsutil'

/** Executables / small DLLs worth a full hash. */
const HASHED = [
  'GTA5.exe',
  'GTA5_Enhanced.exe',
  'PlayGTAV.exe',
  'GTAVLauncher.exe',
  'bink2w64.dll',
  'd3dcompiler_46.dll',
  'GFSDK_TXAA.win64.dll',
]

async function sha1(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    createReadStream(path)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

async function listRpf(gamePath: string): Promise<string[]> {
  const out: string[] = []
  for (const dir of ['', 'update', 'x64', 'common']) {
    const abs = dir ? join(gamePath, dir) : gamePath
    const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.rpf')) {
        out.push(dir ? `${dir}/${e.name}` : e.name)
      }
    }
  }
  return out
}

async function collect(gamePath: string): Promise<SnapshotEntry[]> {
  const entries: SnapshotEntry[] = []

  for (const rel of HASHED) {
    const abs = join(gamePath, rel)
    if (!(await pathExists(abs))) continue
    const st = await fs.stat(abs)
    entries.push({ rel, size: st.size, mtimeMs: Math.round(st.mtimeMs), sha1: await sha1(abs) })
  }

  for (const rel of await listRpf(gamePath)) {
    const st = await fs.stat(join(gamePath, rel)).catch(() => null)
    if (st) entries.push({ rel, size: st.size, mtimeMs: Math.round(st.mtimeMs) })
  }

  return entries.sort((a, b) => a.rel.localeCompare(b.rel))
}

export async function takeSnapshot(gamePath: string): Promise<VanillaSnapshot> {
  const snap: VanillaSnapshot = {
    takenAt: new Date().toISOString(),
    gameVersion: store.get('config').game?.version,
    entries: await collect(gamePath),
  }
  store.set('vanillaSnapshot', snap)
  return snap
}

export function clearSnapshot(): void {
  store.set('vanillaSnapshot', null)
}

export async function verifySnapshot(gamePath: string): Promise<IntegrityReport> {
  const snap = store.get('vanillaSnapshot')
  if (!snap) return { hasSnapshot: false, ok: true, changed: [], missing: [], extra: [] }

  const now = await collect(gamePath)
  const nowByRel = new Map(now.map((e) => [e.rel, e]))
  const snapByRel = new Map(snap.entries.map((e) => [e.rel, e]))

  const changed: string[] = []
  const missing: string[] = []
  for (const e of snap.entries) {
    const cur = nowByRel.get(e.rel)
    if (!cur) {
      missing.push(e.rel)
      continue
    }
    const differs = e.sha1
      ? cur.sha1 !== e.sha1
      : cur.size !== e.size || Math.abs(cur.mtimeMs - e.mtimeMs) > 2000
    if (differs) changed.push(e.rel)
  }

  const extra = now.filter((e) => !snapByRel.has(e.rel)).map((e) => e.rel)

  return {
    hasSnapshot: true,
    takenAt: snap.takenAt,
    gameVersion: snap.gameVersion,
    changed,
    missing,
    extra,
    ok: changed.length === 0 && missing.length === 0,
  }
}
