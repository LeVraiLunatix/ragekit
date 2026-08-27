import { app } from 'electron'
import { join } from 'node:path'
import Store from 'electron-store'
import type { AppConfig, Mod, Profile, VanillaSnapshot } from '@shared/types'

interface Schema {
  config: AppConfig
  mods: Mod[]
  profiles: Profile[]
  /** Files renamed aside by online-safe mode, as game-relative paths. */
  onlineMoved: string[]
  vanillaSnapshot: VanillaSnapshot | null
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
  vanillaSnapshot: null,
}

export const store = new Store<Schema>({ defaults, name: 'gtav-mod-manager' })

/** Root folder where imported mods are copied and kept. */
export function libraryDir(): string {
  return join(app.getPath('userData'), 'library')
}

/** Folder where we stash original game files before overwriting them. */
export function backupsDir(): string {
  return join(app.getPath('userData'), 'backups')
}

/**
 * Folder OUTSIDE the game directory where mod loaders / folders are parked while
 * online-safe mode is on, so the game directory is byte-identical to vanilla.
 */
export function parkedDir(): string {
  return join(app.getPath('userData'), 'parked')
}
