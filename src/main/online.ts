import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { store, parkedDir } from './store'
import { pathExists, ensureDir, movePath } from './mods/fsutil'

const execFileAsync = promisify(execFile)

/**
 * Everything that makes GTA V load mods. Moving all of this OUT of the game
 * folder leaves the directory byte-identical to a clean install, which is the
 * safe state for GTA Online.
 *
 * - ASI loaders: dinput8 / version / winmm .dll
 * - Script Hook V + its .NET bridge
 * - every `*.asi` at the game root
 * - the `mods/` folder (OpenIV reads modified RPFs from here)
 * - the `scripts/` folder (Script Hook V .NET loads from here)
 * - the `plugins/` folder (LSPDFR and friends)
 */
const NAMED_TARGETS = [
  'dinput8.dll', // standard ASI loader
  'version.dll', // alternative ASI loader
  'winmm.dll', // alternative ASI loader
  'ScriptHookV.dll',
  'ScriptHookVDotNet.ini',
]
const NAMED_DIRS = ['mods', 'scripts', 'plugins']

function requireGamePath(): string {
  const game = store.get('config').game
  if (!game?.valid) throw new Error('No valid GTA V folder configured.')
  return game.path
}

async function rootAsiFiles(gamePath: string): Promise<string[]> {
  const entries = await fs.readdir(gamePath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.asi'))
    .map((e) => e.name)
}

/** Is GTA5 currently running? Switching modes while it runs is unsafe. */
export async function isGameRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/nh', '/fo', 'csv'], { windowsHide: true })
    return /"GTA5(_Enhanced)?\.exe"/i.test(stdout)
  } catch {
    return false
  }
}

export interface OnlineModeResult {
  active: boolean
  moved: string[]
}

/** Park every mod loader / folder outside the game directory. */
export async function enableOnlineSafeMode(): Promise<OnlineModeResult> {
  const gamePath = requireGamePath()
  const park = parkedDir() // sits next to the game folder, same drive
  await ensureDir(park)

  const names = [...new Set([...NAMED_TARGETS, ...NAMED_DIRS, ...(await rootAsiFiles(gamePath))])]
  const moved: string[] = []

  for (const name of names) {
    const src = join(gamePath, name)
    const dst = join(park, name)
    if (!(await pathExists(src))) continue
    // Clear a stale parked copy left by a previous interrupted restore.
    if (await pathExists(dst)) await fs.rm(dst, { recursive: true, force: true })
    await movePath(src, dst)
    moved.push(name)
  }

  store.set('onlineMoved', moved)
  store.set('onlineParkedDir', park)
  store.set('config', { ...store.get('config'), onlineSafeMode: true })
  return { active: true, moved }
}

/** Move everything parked back into the game directory. */
export async function disableOnlineSafeMode(): Promise<OnlineModeResult> {
  const gamePath = requireGamePath()
  // Prefer the exact folder used at enable time (the game path may have changed).
  const park = store.get('onlineParkedDir') || parkedDir()

  const parked = await fs.readdir(park, { withFileTypes: true }).catch(() => [])
  for (const entry of parked) {
    const src = join(park, entry.name)
    const dst = join(gamePath, entry.name)
    if (await pathExists(dst)) {
      // Game already has a live copy — the parked one is stale, drop it.
      await fs.rm(src, { recursive: true, force: true })
      continue
    }
    await movePath(src, dst)
  }

  // Leave nothing behind next to the game folder.
  await fs.rmdir(park).catch(() => {})

  store.set('onlineMoved', [])
  store.set('onlineParkedDir', '')
  store.set('config', { ...store.get('config'), onlineSafeMode: false })
  return { active: false, moved: [] }
}

export async function setOnlineSafeMode(active: boolean): Promise<OnlineModeResult> {
  return active ? enableOnlineSafeMode() : disableOnlineSafeMode()
}
