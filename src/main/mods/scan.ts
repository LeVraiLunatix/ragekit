import { promises as fs } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { FoundMod, Mod } from '@shared/types'
import { store, libraryDir } from '../store'
import { walk, copyFile, ensureDir, pathExists } from './fsutil'

/** Files that belong to a dependency/runtime, not a mod. */
const NOT_A_MOD = new Set(
  [
    'scripthookv.dll',
    'dinput8.dll',
    'version.dll',
    'winmm.dll',
    'scripthookvdotnet.asi',
    'scripthookvdotnet2.dll',
    'scripthookvdotnet3.dll',
    'scripthookvdotnet.runtimeconfig.json',
    'openiv.asi',
    'packfilelimitadjuster.asi',
    'gtavlanguageselector.asi',
    'dinput8.dll.gtavmm-off',
  ].map((s) => s.toLowerCase()),
)

const SCRIPT_EXT = new Set(['.lua', '.js', '.cs', '.ini', '.xml', '.json', '.dll', '.asi'])

function idFor(relPath: string): string {
  return createHash('sha1').update(relPath.toLowerCase()).digest('hex').slice(0, 12)
}

function prettyName(relPath: string): string {
  const stem = basename(relPath, extname(relPath))
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** Every game-relative path the library already owns. */
function managedPaths(): Set<string> {
  const set = new Set<string>()
  for (const mod of store.get('mods')) {
    for (const f of mod.installedFiles) set.add(f.toLowerCase().split('\\').join('/'))
  }
  for (const name of store.get('onlineMoved')) set.add(name.toLowerCase())
  return set
}

export async function scanUnmanaged(gamePath: string): Promise<FoundMod[]> {
  const managed = managedPaths()
  const found: FoundMod[] = []

  const consider = async (relPath: string): Promise<void> => {
    const norm = relPath.split('\\').join('/')
    const name = basename(norm).toLowerCase()
    if (NOT_A_MOD.has(name) || name.endsWith('.gtavmm-off')) return
    if (managed.has(norm.toLowerCase())) return
    const abs = join(gamePath, norm)
    let sizeBytes = 0
    try {
      sizeBytes = (await fs.stat(abs)).size
    } catch {
      return
    }
    const ext = extname(name)
    const kind: FoundMod['kind'] =
      ext === '.asi'
        ? 'asi'
        : ext === '.dll'
          ? 'script-dll'
          : 'script'
    found.push({ id: idFor(norm), relPath: norm, kind, sizeBytes, suggestedName: prettyName(norm) })
  }

  // Root .asi files
  const rootEntries = await fs.readdir(gamePath, { withFileTypes: true }).catch(() => [])
  for (const e of rootEntries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.asi')) await consider(e.name)
  }

  // scripts/ tree
  const scriptsDir = join(gamePath, 'scripts')
  if (await pathExists(scriptsDir)) {
    for (const abs of await walk(scriptsDir)) {
      const rel = 'scripts/' + abs.slice(scriptsDir.length + 1).split('\\').join('/')
      if (SCRIPT_EXT.has(extname(rel).toLowerCase())) await consider(rel)
    }
  }

  return found.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/**
 * Copy the selected found files into the library and register them as installed
 * mods, so they can be toggled and cleanly removed afterwards.
 */
export async function adoptFound(gamePath: string, items: FoundMod[]): Promise<Mod[]> {
  const mods = store.get('mods')
  const created: Mod[] = []

  for (const item of items) {
    const id = randomUUID()
    const modDir = join(libraryDir(), id)
    const srcDir = join(modDir, 'src')
    await ensureDir(srcDir)

    const from = join(gamePath, item.relPath)
    const to = join(srcDir, item.relPath)
    if (!(await pathExists(from))) continue
    await copyFile(from, to)

    const mod: Mod = {
      id,
      name: item.suggestedName,
      kind: 'dropin',
      status: 'installed',
      addedAt: new Date().toISOString(),
      sourceDir: srcDir,
      installedFiles: [item.relPath],
      loadOrder: (mods.length ? Math.max(...mods.map((m) => m.loadOrder)) : 0) + 1 + created.length,
      tags: ['adopted'],
    }
    mods.push(mod)
    created.push(mod)
  }

  store.set('mods', mods)
  return created
}
