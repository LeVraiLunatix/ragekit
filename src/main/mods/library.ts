import { promises as fs } from 'node:fs'
import { join, basename, extname, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import type {
  ImportResult,
  InstallPlan,
  Mod,
  ModKind,
  PlannedFile,
} from '@shared/types'
import { store, libraryDir, backupsDir } from '../store'
import { classifyFile } from './classify'
import { detectCategory } from './category'
import { inferRequiredDeps, dependencyStatus } from './deps'
import { readOivPackage, stageOivLooseFiles } from './oiv'
import { walk, ensureDir, copyFile, copyDir, pathExists, removeFileAndPrune } from './fsutil'
import { findDlcPacks, installDlcPacks, uninstallDlcPacks } from '../rpf/dlcpack'

function getMods(): Mod[] {
  return store.get('mods')
}

function saveMods(mods: Mod[]): void {
  store.set('mods', mods)
}

function requireGamePath(): string {
  const game = store.get('config').game
  if (!game?.valid) throw new Error('Set a valid GTA V folder in Settings first.')
  return game.path
}

export function listMods(): Mod[] {
  return getMods().sort((a, b) => a.loadOrder - b.loadOrder || a.name.localeCompare(b.name))
}

/** Fill in `category` for mods imported before that field existed. */
export async function ensureCategories(): Promise<void> {
  const mods = getMods()
  let touched = false
  for (const m of mods) {
    if (m.category) continue
    m.category = await detectCategory(m.sourceDir, m.name).catch(() => 'other' as const)
    touched = true
  }
  if (touched) saveMods(mods)
}

function nextLoadOrder(): number {
  const mods = getMods()
  return mods.length ? Math.max(...mods.map((m) => m.loadOrder)) + 1 : 0
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function importFolder(src: string, modDir: string): Promise<{ sourceDir: string }> {
  const dest = join(modDir, 'src')
  await copyDir(src, dest)
  return { sourceDir: dest }
}

async function importZip(src: string, modDir: string): Promise<{ sourceDir: string }> {
  const dest = join(modDir, 'src')
  await ensureDir(dest)
  try {
    new AdmZip(src).extractAllTo(dest, true)
  } catch {
    throw new Error('This file is not a valid .zip archive.')
  }
  return { sourceDir: dest }
}

async function importRar(src: string, modDir: string): Promise<{ sourceDir: string }> {
  const dest = join(modDir, 'src')
  await ensureDir(dest)
  const { createExtractorFromFile } = await import('node-unrar-js')
  const extractor = await createExtractorFromFile({ filepath: src, targetPath: dest })
  // The extraction is lazy — iterating the generator writes the files.
  for (const _file of extractor.extract().files) void _file
  return { sourceDir: dest }
}

async function importOiv(
  src: string,
  modDir: string,
): Promise<{ sourceDir: string; name: string; author?: string; version?: string; description?: string }> {
  const stored = join(modDir, 'package.oiv')
  await copyFile(src, stored)
  const { zip, pkg } = await readOivPackage(stored)
  const staged = join(modDir, 'staged')
  await ensureDir(staged)
  await stageOivLooseFiles(zip, pkg.looseOps, staged)
  return {
    sourceDir: staged,
    name: pkg.metadata.name,
    author: pkg.metadata.author,
    version: pkg.metadata.version,
    description: pkg.metadata.description,
  }
}

export async function importFromPaths(paths: string[]): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const mods = getMods()

  for (const p of paths) {
    const id = randomUUID()
    const modDir = join(libraryDir(), id)
    await ensureDir(modDir)

    const stat = await fs.stat(p)
    const ext = extname(p).toLowerCase()
    let kind: ModKind = 'dropin'
    let sourceDir: string
    let name = basename(p, ext)
    let author: string | undefined
    let version: string | undefined
    let description: string | undefined

    try {
      if (stat.isDirectory()) {
        ;({ sourceDir } = await importFolder(p, modDir))
      } else if (ext === '.oiv') {
        kind = 'oiv'
        ;({ sourceDir, name, author, version, description } = await importOiv(p, modDir))
      } else if (ext === '.zip') {
        ;({ sourceDir } = await importZip(p, modDir))
      } else if (ext === '.rar') {
        ;({ sourceDir } = await importRar(p, modDir))
      } else {
        await fs.rm(modDir, { recursive: true, force: true })
        throw new Error(`Unsupported file type: ${ext || '(none)'}`)
      }
    } catch (err) {
      await fs.rm(modDir, { recursive: true, force: true })
      throw err
    }

    const mod: Mod = {
      id,
      name,
      author,
      version,
      description,
      kind,
      status: 'not-installed',
      addedAt: new Date().toISOString(),
      sourceDir,
      installedFiles: [],
      loadOrder: nextLoadOrder() + results.length,
      tags: [],
      category: await detectCategory(sourceDir, name),
    }
    mods.push(mod)
    saveMods(mods)

    const plan = await buildPlan(id)
    results.push({ mod, plan })
  }

  return results
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export async function buildPlan(modId: string): Promise<InstallPlan> {
  const mod = getMods().find((m) => m.id === modId)
  if (!mod) throw new Error(`Unknown mod ${modId}`)
  const gamePath = requireGamePath()

  const files: PlannedFile[] = []
  const warnings: string[] = []

  if (mod.kind === 'oiv') {
    const { pkg } = await readOivPackage(join(dirname(mod.sourceDir), 'package.oiv'))
    for (const abs of await walk(mod.sourceDir)) {
      const rel = abs.slice(mod.sourceDir.length + 1).split('\\').join('/')
      files.push({
        from: rel,
        to: rel,
        role: 'mods-tree',
        overwrite: await pathExists(join(gamePath, rel)),
      })
    }
    if (pkg.archiveOps.length) {
      warnings.push(
        `${pkg.archiveOps.length} operation(s) write inside .rpf archives. ` +
          `The v1 installer only applies loose files — use OpenIV for the rest, or wait for RPF support.`,
      )
    }
    const deletes = pkg.looseOps.filter((o) => o.kind === 'delete')
    if (deletes.length) warnings.push(`${deletes.length} loose file deletion(s) will be applied.`)
  } else {
    const abs = await walk(mod.sourceDir)
    for (const f of abs) {
      const planned = classifyFile(mod.sourceDir, f)
      if (!planned || planned.role === 'ignored') continue
      planned.overwrite = await pathExists(join(gamePath, planned.to))
      files.push(planned)
    }
  }

  // Prebuilt add-on DLC packs — installed via RPF write into mods/update.
  const foundPacks = mod.kind === 'oiv' ? [] : await findDlcPacks(mod.sourceDir)
  const dlcPacks = foundPacks.map((p) => p.name)
  // The dlc.rpf copy is part of the plan; classifyFile ignores .rpf so add it here.
  for (const p of foundPacks) {
    const from = p.sourceRpf.slice(mod.sourceDir.length + 1).split('\\').join('/')
    files.push({ from, to: p.targetRel, role: 'mods-tree', overwrite: false })
  }
  if (dlcPacks.length) {
    warnings.push(
      `Add-on vehicle pack(s): ${dlcPacks.join(', ')}. The dlc.rpf is copied into ` +
        `mods/update/x64/dlcpacks/ and registered in dlclist.xml (writes update.rpf in the mods folder).`,
    )
  }

  const rawAssets = mod.kind === 'oiv' ? 0 : await countRpfAssets(mod.sourceDir)
  if (rawAssets > 0 && dlcPacks.length === 0) {
    warnings.push(
      `${rawAssets} model/metadata file(s) (.yft/.ytd/.meta…) need injecting into a .rpf ` +
        `archive — not supported. Use the [Add-On] version of this mod, or OpenIV.`,
    )
  }

  if (files.length === 0 && dlcPacks.length === 0) {
    warnings.push('No installable files were recognised in this archive.')
  }

  const installedDeps = new Set(
    (await dependencyStatus(gamePath)).filter((d) => d.installed).map((d) => d.id),
  )
  const missingDependencies = inferRequiredDeps(files).filter((d) => !installedDeps.has(d))

  return { modId, kind: mod.kind, files, warnings, missingDependencies, dlcPacks }
}

const RPF_ASSET_EXT = new Set([
  '.yft',
  '.ytd',
  '.ydr',
  '.ydd',
  '.ybn',
  '.ycd',
  '.ynv',
  '.ymap',
  '.ytyp',
  '.meta',
  '.gxt2',
])

async function countRpfAssets(sourceDir: string): Promise<number> {
  let n = 0
  for (const abs of await walk(sourceDir)) {
    const dot = abs.lastIndexOf('.')
    if (dot >= 0 && RPF_ASSET_EXT.has(abs.slice(dot).toLowerCase())) n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Install / uninstall
// ---------------------------------------------------------------------------

export function updateMod(modId: string, patch: Partial<Mod>): Mod {
  const mods = getMods()
  const idx = mods.findIndex((m) => m.id === modId)
  if (idx < 0) throw new Error(`Unknown mod ${modId}`)
  mods[idx] = { ...mods[idx], ...patch }
  saveMods(mods)
  return mods[idx]
}

export async function installMod(
  modId: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<Mod> {
  const mod = getMods().find((m) => m.id === modId)
  if (!mod) throw new Error(`Unknown mod ${modId}`)
  const gamePath = requireGamePath()
  const plan = await buildPlan(modId)
  const modBackupDir = join(backupsDir(), modId)

  const written: string[] = []
  let done = 0
  // dlc.rpf copies are handled by installDlcPacks; skip them in the plain loop.
  const dlcTargets = new Set(
    (await findDlcPacks(mod.sourceDir)).map((p) => p.targetRel),
  )
  const plainFiles = plan.files.filter((f) => !dlcTargets.has(f.to))

  for (const file of plainFiles) {
    const src = join(mod.sourceDir, file.from)
    const dst = join(gamePath, file.to)

    if (file.overwrite && (await pathExists(dst))) {
      const backup = join(modBackupDir, file.to)
      if (!(await pathExists(backup))) await copyFile(dst, backup)
    }
    await copyFile(src, dst)
    written.push(file.to.split('\\').join('/'))
    onProgress?.(++done, plan.files.length, file.to)
  }

  let dlcPacks: string[] | undefined
  if (plan.dlcPacks.length > 0) {
    const packs = await findDlcPacks(mod.sourceDir)
    const res = await installDlcPacks(gamePath, packs, (label) =>
      onProgress?.(done, plan.files.length, label),
    )
    written.push(...res.installedFiles)
    dlcPacks = res.packNames
  }

  return updateMod(modId, { status: 'installed', installedFiles: written, dlcPacks })
}

export async function uninstallMod(modId: string, markDisabled = false): Promise<Mod> {
  const mod = getMods().find((m) => m.id === modId)
  if (!mod) throw new Error(`Unknown mod ${modId}`)
  const gamePath = requireGamePath()
  const modBackupDir = join(backupsDir(), modId)

  if (mod.dlcPacks?.length) {
    await uninstallDlcPacks(gamePath, mod.dlcPacks)
  }

  for (const rel of mod.installedFiles) {
    if (mod.dlcPacks?.length && /\/dlcpacks\//i.test(rel)) continue // handled above
    const dst = join(gamePath, rel)
    const backup = join(modBackupDir, rel)
    if (await pathExists(backup)) {
      await copyFile(backup, dst)
      await fs.rm(backup, { force: true })
    } else {
      await removeFileAndPrune(dst, gamePath)
    }
  }
  await fs.rm(modBackupDir, { recursive: true, force: true }).catch(() => {})

  return updateMod(modId, {
    status: markDisabled ? 'disabled' : 'not-installed',
    installedFiles: [],
    dlcPacks: [],
  })
}

export async function setEnabled(modId: string, enabled: boolean): Promise<Mod> {
  const mod = getMods().find((m) => m.id === modId)
  if (!mod) throw new Error(`Unknown mod ${modId}`)
  if (enabled && mod.status !== 'installed') return installMod(modId)
  if (!enabled && mod.status === 'installed') return uninstallMod(modId, true)
  return mod
}

/** Enable or disable every managed mod in one go (for bisecting a crash). */
export async function setAllEnabled(enabled: boolean): Promise<Mod[]> {
  const targets = getMods()
    .filter((m) => (enabled ? m.status !== 'installed' : m.status === 'installed'))
    .sort((a, b) => a.loadOrder - b.loadOrder)
  for (const m of targets) {
    try {
      await setEnabled(m.id, enabled)
    } catch {
      // keep going — one bad mod shouldn't block the rest
    }
  }
  return listMods()
}

export async function removeMod(modId: string): Promise<void> {
  const mod = getMods().find((m) => m.id === modId)
  if (!mod) return
  if (mod.status === 'installed') await uninstallMod(modId)
  await fs.rm(join(libraryDir(), modId), { recursive: true, force: true }).catch(() => {})
  saveMods(getMods().filter((m) => m.id !== modId))
}

export function reorder(modId: string, loadOrder: number): Mod {
  return updateMod(modId, { loadOrder })
}

/** Swap a mod's load order with its neighbour in the sorted list. */
export function moveMod(modId: string, direction: 'up' | 'down'): Mod[] {
  const sorted = listMods()
  const idx = sorted.findIndex((m) => m.id === modId)
  const swapWith = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return sorted
  const a = sorted[idx]
  const b = sorted[swapWith]
  const ao = a.loadOrder
  updateMod(a.id, { loadOrder: b.loadOrder })
  updateMod(b.id, { loadOrder: ao })
  // Normalise so equal/duplicate orders can't wedge future swaps.
  listMods().forEach((m, i) => {
    if (m.loadOrder !== i) updateMod(m.id, { loadOrder: i })
  })
  return listMods()
}

/** Game-relative paths written by more than one installed mod. */
export function fileConflicts(): Array<{ path: string; modIds: string[] }> {
  const owners = new Map<string, string[]>()
  for (const mod of getMods()) {
    if (mod.status !== 'installed') continue
    for (const rel of mod.installedFiles) {
      const key = rel.toLowerCase()
      owners.set(key, [...(owners.get(key) ?? []), mod.id])
    }
  }
  return [...owners.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([path, modIds]) => ({ path, modIds }))
}
