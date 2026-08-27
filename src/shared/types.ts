/** Shared types used by both the main and renderer processes. */

export type Platform = 'steam' | 'epic' | 'rockstar' | 'manual' | 'unknown'

export interface GameInfo {
  /** Absolute path to the folder containing GTA5.exe. */
  path: string
  platform: Platform
  /** Whether GTA5.exe was actually found at `path`. */
  valid: boolean
  /** File version of GTA5.exe when we can read it. */
  version?: string
}

/** How a mod gets applied to the game folder. */
export type ModKind = 'dropin' | 'oiv'

/** Category of an individual file inside a drop-in mod. */
export type FileRole =
  | 'asi' // native plugin -> game root
  | 'script-dll' // ScriptHookVDotNet plugin -> scripts/
  | 'script' // .lua/.js/.cs -> scripts/
  | 'root-dll' // loader dll (dinput8.dll, ScriptHookV.dll) -> game root
  | 'mods-tree' // path already rooted under mods/ or update/ -> copy as-is
  | 'asset' // textures/meshes referenced by a script -> scripts/
  | 'ignored' // readme, license, screenshots

export interface PlannedFile {
  /** Path inside the mod's source folder. */
  from: string
  /** Path relative to the game folder where it will be written. */
  to: string
  role: FileRole
  /** True when an existing game file will be overwritten (needs backup). */
  overwrite: boolean
}

export interface InstallPlan {
  modId: string
  kind: ModKind
  files: PlannedFile[]
  warnings: string[]
  /** Dependencies the plan needs that are not currently satisfied. */
  missingDependencies: DependencyId[]
}

export type DependencyId =
  | 'scripthookv'
  | 'scripthookvdotnet'
  | 'openiv-asi'
  | 'community-sh'

export interface DependencyStatus {
  id: DependencyId
  name: string
  installed: boolean
  /** Where we detected it, when installed. */
  detail?: string
}

export type ModStatus = 'installed' | 'disabled' | 'not-installed' | 'error'

export interface Mod {
  id: string
  name: string
  author?: string
  version?: string
  description?: string
  kind: ModKind
  status: ModStatus
  /** ISO date the mod was added to the library. */
  addedAt: string
  /** Absolute path to the mod's folder inside the library. */
  sourceDir: string
  /** Files written to the game folder, recorded at install time. */
  installedFiles: string[]
  /** Load order for scripts / asi. Lower loads first. */
  loadOrder: number
  tags: string[]
}

export interface Profile {
  id: string
  name: string
  /** Mod ids enabled in this profile. */
  enabledMods: string[]
}

export type LanguageCode = 'fr' | 'en' | 'es' | 'de'

export interface AppConfig {
  game: GameInfo | null
  language: LanguageCode
  onboarded: boolean
  activeProfileId: string | null
  onlineWarningAccepted: boolean
  theme: 'dark' | 'light'
}

export interface ImportResult {
  mod: Mod
  plan: InstallPlan
}

/** Generic progress event streamed from long-running main-process tasks. */
export interface TaskProgress {
  taskId: string
  label: string
  /** 0..1, or null for indeterminate. */
  progress: number | null
  done: boolean
  error?: string
}
