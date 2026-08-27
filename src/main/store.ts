import { app } from 'electron'
import { join } from 'node:path'
import Store from 'electron-store'
import type { AppConfig, Mod, Profile } from '@shared/types'

interface Schema {
  config: AppConfig
  mods: Mod[]
  profiles: Profile[]
}

const defaults: Schema = {
  config: {
    game: null,
    activeProfileId: null,
    onlineWarningAccepted: false,
    theme: 'dark',
  },
  mods: [],
  profiles: [{ id: 'default', name: 'Default', enabledMods: [] }],
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
