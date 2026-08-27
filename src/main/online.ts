import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname, sep } from 'node:path'
import { store, parkedDir, dataRoot } from './store'
import { pathExists, ensureDir, movePath } from './mods/fsutil'
import type { NonVanillaScan, OnlineStatus, ScannedMod, VanillaIndex } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * Online-safe mode, "GTA V Mod Remove Tool" style. It works off an ALLOWLIST of
 * what a clean install has at its root — anything else (any .asi, .dll, .ini,
 * .log, .bin, unknown folder…) is treated as a mod and moved out, so GTA Online
 * sees a byte-identical vanilla folder. Toggling back moves it all home.
 *
 * A vanilla file *index* (captured from the user's own clean install) makes it
 * exact; without one we use the built-in allowlist below, which is the same
 * approach the Remove Tool takes with its curated per-patch list.
 *
 * Only the game *root* is swept: drop-in mods live at the root, in `mods/`,
 * `scripts/` or `plugins/`; RPF mods replace `x64*.rpf` / `update.rpf` at the
 * root. We never descend into the stock `x64/` `update/` `common/` trees.
 */

/** Every file GTA V (Legacy + Enhanced, all launchers) ships at its root. */
const STOCK_FILES = new Set([
  // executables
  'gta5.exe',
  'gta5_enhanced.exe',
  'gta5_enhanced_be.exe',
  'gta5_be.exe',
  'playgtav.exe',
  'gtavlauncher.exe',
  'gtavlanguageselect.exe',
  'bugreport.exe',
  'launcher.exe',
  'launcher.patcher.exe',
  'rockstarservice.exe',
  'rockstarsteamhelper.exe',
  'uninstall.exe',
  // graphics / engine DLLs
  'bink2w64.dll',
  'bink2w64_enhanced.dll',
  'd3dcompiler_46.dll',
  'd3dcompiler_47.dll',
  'd3dcsx_46.dll',
  'gfsdk_shadowlib.win64.dll',
  'gfsdk_txaa.win64.dll',
  'gfsdk_txaa_alpharesolve.win64.dll',
  'nvpmapi.core.win64.dll',
  'amd_ags_x64.dll',
  'ffx_fsr2_api_x64.dll',
  'ffx_fsr2_api_dx12_x64.dll',
  'nvngx_dlss.dll',
  'nvngx_dlssg.dll',
  'nvngx_dlssd.dll',
  'xess.dll',
  'libxess.dll',
  'oo2core_5_win64.dll',
  'oo2core_9_win64.dll',
  'gpuperfapidx11-x64.dll',
  // Enhanced networking / voice stack
  'libcurl.dll',
  'xcurl.dll',
  'zlib1.dll',
  'opus.dll',
  'opusenc.dll',
  'fvad.dll',
  'libsodium.dll',
  'ssleay32.dll',
  'libeay32.dll',
  'discord_game_sdk.dll',
  // data / config
  'common.rpf',
  'version.txt',
  'index.bin',
  'gta5.exe.cfg',
  'gameinfo.txt',
  'installscript.vdf',
  'manifest.ares',
  'gta5_dump.txt',
  'x64.axf',
])

/** Every folder a clean install has at its root. */
const STOCK_DIRS = new Set([
  'x64',
  'update',
  'common',
  'readme',
  'redistributables',
  'installers',
  'battleye',
  'easyanticheat',
  'launcher',
  'ros',
])

/** `x64a.rpf` … `x64z.rpf`, `x64.rpf`. */
const STOCK_RPF = /^x64[a-z]?\.rpf$/

function isStockRoot(name: string, isDir: boolean): boolean {
  const n = name.toLowerCase()
  return isDir ? STOCK_DIRS.has(n) : STOCK_FILES.has(n) || STOCK_RPF.test(n)
}

/** Loader DLLs that hijack a DirectX/system name at the game root. */
const LOADER_DLL = new Set([
  'dinput8.dll',
  'version.dll',
  'winmm.dll',
  'dsound.dll',
  'd3d8.dll',
  'd3d9.dll',
  'd3d11.dll',
  'd3d12.dll',
  'xinput1_3.dll',
  'xinput1_4.dll',
  'xlive.dll',
])

/** Root logs a mod loader leaves behind. */
const MOD_LOG =
  /^(scripthookv|scripthookvdotnet.*|asiloader|openiv|packfilelimitadjuster|nativetrainer|menyoo.*|trainerv|gtav\.mods)\.log$/i

function requireGamePath(): string {
  const game = store.get('config').game
  if (!game?.valid) throw new Error('No valid GTA V folder configured.')
  return game.path
}

/** Recursive file walk that skips directories it cannot read. */
async function walkFiles(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(join(root, prefix), { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walkFiles(root, rel)))
    else if (e.isFile()) out.push(rel)
  }
  return out
}

const norm = (p: string): string => p.split(sep).join('/').toLowerCase()

/** Is GTA5 currently running? Switching modes while it runs is unsafe. */
export async function isGameRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/nh', '/fo', 'csv'], { windowsHide: true })
    return /"GTA5(_Enhanced)?\.exe"/i.test(stdout)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ index --- */

export interface IndexResult {
  count: number
  takenAt: string
}

/**
 * Walk the whole game folder and remember every file — the "clean install".
 * Obvious mod files (loaders, .asi, the mods/ & scripts/ trees, …) are left OUT
 * of the index even if present now, so indexing a folder that already has some
 * mods still yields a usable vanilla manifest. For a perfect index, run this
 * right after Steam/Rockstar "verify files".
 */
export async function buildVanillaIndex(
  onProgress?: (done: number, label: string) => void,
): Promise<IndexResult> {
  const gamePath = requireGamePath()
  onProgress?.(0, 'Scanning game folder…')

  const all = await walkFiles(gamePath)
  onProgress?.(all.length, 'Filtering out known mod files…')

  // Everything the heuristic would sweep is definitely not vanilla — drop it.
  const savedIndex = store.get('vanillaIndex')
  store.set('vanillaIndex', null)
  const dropFiles = new Set<string>()
  const dropDirs: string[] = []
  try {
    const scan = await scanNonVanilla()
    for (const it of scan.items) {
      if (it.isDir) dropDirs.push(it.rel.toLowerCase() + '/')
      else dropFiles.add(it.rel.toLowerCase())
    }
  } finally {
    if (savedIndex) store.set('vanillaIndex', savedIndex)
  }

  const files = all
    .map((f) => f.toLowerCase())
    .filter((f) => !dropFiles.has(f) && !dropDirs.some((d) => f.startsWith(d)))
    .sort()

  const index: VanillaIndex = {
    takenAt: new Date().toISOString(),
    gameVersion: store.get('config').game?.version,
    count: files.length,
    files,
  }
  store.set('vanillaIndex', index)
  onProgress?.(files.length, `${files.length} files indexed`)
  return { count: files.length, takenAt: index.takenAt }
}

export function clearVanillaIndex(): void {
  store.set('vanillaIndex', null)
}

/* ------------------------------------------------------------------- scan --- */

function classifyFile(name: string): ScannedMod['kind'] {
  const n = name.toLowerCase()
  if (LOADER_DLL.has(n)) return 'loader'
  if (n.endsWith('.asi')) return 'asi'
  if (n.endsWith('.dll')) return 'dll'
  if (MOD_LOG.test(n) || n.endsWith('.log')) return 'log'
  if (/\.(lua|js|cs|ini|xml|cfg)$/.test(n)) return 'script'
  return 'file'
}

/** Everything at the game root that a clean install would not have. */
export async function scanNonVanilla(): Promise<NonVanillaScan> {
  const gamePath = requireGamePath()
  const index = store.get('vanillaIndex')
  const usingIndex = !!index && index.files.length > 0

  // Vanilla file names at the root + set of vanilla top-level dir names.
  const rootFiles = new Set<string>()
  const vanillaDirs = new Set<string>()
  if (usingIndex) {
    for (const f of index!.files) {
      const slash = f.indexOf('/')
      if (slash === -1) rootFiles.add(f)
      else vanillaDirs.add(f.slice(0, slash))
    }
  }

  const topEntries = await fs.readdir(gamePath, { withFileTypes: true }).catch(() => [])
  const items: ScannedMod[] = []
  let totalBytes = 0

  for (const e of topEntries) {
    const lname = e.name.toLowerCase()
    const rel = e.name
    const abs = join(gamePath, rel)

    // Never touch our own sidecar data folder.
    if (norm(abs) === norm(dataRoot()) || norm(abs).startsWith(norm(dataRoot()) + '/')) continue

    if (e.isFile()) {
      const isMod = usingIndex ? !rootFiles.has(lname) : !isStockRoot(lname, false)
      if (!isMod) continue
      const size = (await fs.stat(abs).catch(() => null))?.size ?? 0
      items.push({ rel, isDir: false, kind: classifyFile(lname), size, files: [rel] })
      totalBytes += size
    } else if (e.isDirectory()) {
      const isMod = usingIndex ? !vanillaDirs.has(lname) : !isStockRoot(lname, true)
      if (!isMod) continue
      items.push({ rel, isDir: true, kind: 'folder', size: -1, files: [] })
    }
  }

  // Stock files modded in place (can't be parked — would break the game).
  const modifiedStock: string[] = []
  const snap = store.get('vanillaSnapshot')
  if (snap) {
    for (const entry of snap.entries) {
      if (entry.sha1) continue
      const st = await fs.stat(join(gamePath, entry.rel)).catch(() => null)
      if (st && st.size !== entry.size) modifiedStock.push(entry.rel)
    }
  }

  items.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.rel.localeCompare(b.rel))
  return { usingIndex, items, modifiedStock, totalFiles: items.length, totalBytes }
}

/* ------------------------------------------------------------- enable/off --- */

export interface OnlineModeResult {
  active: boolean
  moved: string[]
}

/** Park every non-vanilla root entry outside the game directory. */
export async function enableOnlineSafeMode(): Promise<OnlineModeResult> {
  const gamePath = requireGamePath()
  const park = parkedDir() // sits next to the game folder, same drive
  await ensureDir(park)

  const scan = await scanNonVanilla()
  const moved: string[] = []

  for (const item of scan.items) {
    const src = join(gamePath, item.rel)
    const dst = join(park, item.rel)
    if (!(await pathExists(src))) continue
    if (await pathExists(dst)) await fs.rm(dst, { recursive: true, force: true })
    await ensureDir(dirname(dst))
    await movePath(src, dst)
    moved.push(item.rel)
  }

  store.set('onlineMoved', moved)
  store.set('onlineMovedTop', moved)
  store.set('onlineParkedDir', park)
  store.set('config', { ...store.get('config'), onlineSafeMode: true })
  return { active: true, moved }
}

/** Move everything parked back into the game directory. */
export async function disableOnlineSafeMode(): Promise<OnlineModeResult> {
  const gamePath = requireGamePath()
  const park = store.get('onlineParkedDir') || parkedDir()

  if (await pathExists(park)) {
    const entries = await fs.readdir(park, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const src = join(park, entry.name)
      const dst = join(gamePath, entry.name)
      if (await pathExists(dst)) {
        // Game already has a live copy — the parked one is stale, drop it.
        await fs.rm(src, { recursive: true, force: true }).catch(() => {})
        continue
      }
      await movePath(src, dst)
    }
    await fs.rm(park, { recursive: true, force: true }).catch(() => {})
  }

  store.set('onlineMoved', [])
  store.set('onlineMovedTop', [])
  store.set('onlineParkedDir', '')
  store.set('config', { ...store.get('config'), onlineSafeMode: false })
  return { active: false, moved: [] }
}

export async function setOnlineSafeMode(active: boolean): Promise<OnlineModeResult> {
  return active ? enableOnlineSafeMode() : disableOnlineSafeMode()
}

export function getOnlineStatus(): OnlineStatus {
  const index = store.get('vanillaIndex')
  return {
    safe: !!store.get('config').onlineSafeMode,
    hasIndex: !!index && index.files.length > 0,
    indexTakenAt: index?.takenAt,
    indexCount: index?.count,
    indexGameVersion: index?.gameVersion,
    parkedCount: store.get('onlineMoved').length,
  }
}
