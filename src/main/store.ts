import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import Store from 'electron-store'
import type {
  AppConfig,
  Mod,
  Profile,
  VanillaSnapshot,
  VanillaIndex,
  LaunchReport,
  ActivityEntry,
} from '@shared/types'
import { pathExists, movePath } from './mods/fsutil'

interface Schema {
  config: AppConfig
  mods: Mod[]
  profiles: Profile[]
  /** Files renamed aside by online-safe mode, as game-relative paths. */
  onlineMoved: string[]
  /** Top-level entries (files/dirs) removed on enable — for the UI summary. */
  onlineMovedTop: string[]
  /** Absolute path of the folder those files were parked in (set on enable). */
  onlineParkedDir: string
  vanillaSnapshot: VanillaSnapshot | null
  /** Full manifest of a clean install — drives the online-safe "remove all" sweep. */
  vanillaIndex: VanillaIndex | null
  /** Cached GTA5.exe RPF AES key: { tag: <exe size>, hex } */
  rpfAesKey: { tag: string; hex: string } | null
  /** User-provided NG key file (CodeWalker Key.dat or equivalent). */
  ngKeysPath: string
  /** Result of the last "Launch GTA V" attempt. */
  lastLaunch: LaunchReport | null
  /** Recent reversible actions, newest first (capped). */
  activity: ActivityEntry[]
}

const defaults: Schema = {
  config: {
    game: null,
    language: 'en',
    onboarded: false,
    activeProfileId: null,
    onlineWarningAccepted: false,
    onlineSafeMode: false,
    theme: 'dark',
  },
  mods: [],
  profiles: [{ id: 'default', name: 'Default', enabledMods: [] }],
  onlineMoved: [],
  onlineMovedTop: [],
  onlineParkedDir: '',
  vanillaSnapshot: null,
  vanillaIndex: null,
  rpfAesKey: null,
  ngKeysPath: '',
  lastLaunch: null,
  activity: [],
}

export const store = new Store<Schema>({ defaults, name: 'gtav-mod-manager' })

/**
 * All app data (mod library, backups, parked loaders) lives here. When a game
 * folder is set it sits NEXT TO it — `<game parent>/GTAV Mod Manager` — so it is
 * on the same drive (instant moves) and nothing large lands on the system drive.
 * Falls back to userData until a game folder is configured.
 */
export function dataRoot(): string {
  const gamePath = store.get('config').game?.path
  return gamePath ? join(dirname(gamePath), 'GTAV Mod Manager') : app.getPath('userData')
}

/** Root folder where imported mods are copied and kept. */
export function libraryDir(): string {
  return join(dataRoot(), 'library')
}

/** Folder where we stash original game files before overwriting them. */
export function backupsDir(): string {
  return join(dataRoot(), 'backups')
}

/**
 * Folder where mod loaders / folders are parked while online-safe mode is on, so
 * the game directory is byte-identical to vanilla.
 */
export function parkedDir(): string {
  return join(dataRoot(), 'parked')
}

/**
 * Move an existing userData library/backups tree next to the game folder the
 * first time a game path is known. Safe to call repeatedly.
 */
export async function migrateDataDir(): Promise<void> {
  const gamePath = store.get('config').game?.path
  if (!gamePath) return
  const oldRoot = app.getPath('userData')
  const newRoot = join(dirname(gamePath), 'GTAV Mod Manager')
  if (newRoot.toLowerCase() === oldRoot.toLowerCase()) return

  for (const name of ['library', 'backups'] as const) {
    const from = join(oldRoot, name)
    const to = join(newRoot, name)
    if (!(await pathExists(from)) || (await pathExists(to))) continue
    const entries = await fs.readdir(from).catch(() => [] as string[])
    if (entries.length === 0) continue
    await fs.mkdir(newRoot, { recursive: true })
    await movePath(from, to)
  }

  // Mod source folders are stored as absolute paths — repoint them.
  const oldLib = join(oldRoot, 'library')
  const newLib = join(newRoot, 'library')
  const mods = store.get('mods')
  let touched = false
  for (const mod of mods) {
    if (mod.sourceDir.toLowerCase().startsWith(oldLib.toLowerCase())) {
      mod.sourceDir = newLib + mod.sourceDir.slice(oldLib.length)
      touched = true
    }
  }
  if (touched) store.set('mods', mods)
}
