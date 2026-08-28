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
  /** Prebuilt add-on DLC packs to register in dlclist.xml (RPF write). */
  dlcPacks: string[]
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

/** Rough "what kind of mod is this" bucket, for grouping the library. */
export type ModCategory =
  | 'vehicle'
  | 'weapon'
  | 'ped'
  | 'map'
  | 'graphics'
  | 'audio'
  | 'script'
  | 'data'
  | 'other'

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
  /** Auto-detected bucket (vehicle, script, graphics…) for grouping. */
  category?: ModCategory
  /** GTA5-Mods.com page this mod was installed from, when applicable. */
  sourceUrl?: string
  /** "Last updated" timestamp of the mod page at install time. */
  remoteUpdatedAt?: string
  /** Add-on DLC pack names registered in dlclist.xml for this mod. */
  dlcPacks?: string[]
  /** For .oiv packages: which base folder the package was installed into. */
  oivTarget?: OivTarget
}

// ---------------------------------------------------------------------------
// .oiv packages — OpenIV-style installer
// ---------------------------------------------------------------------------

/** Where an .oiv package gets applied. */
export type OivTarget = 'game' | 'mods'

export type OivOpKind = 'add' | 'replace' | 'delete' | 'xml-edit'

/** One operation from an .oiv `assembly.xml` <content> block. */
export interface OivContentOp {
  kind: OivOpKind
  /** Destination path relative to the chosen base folder, slash-separated. */
  target: string
  /** RPF archive chain it lands in, slash-joined ('' for a loose file). */
  archive: string
  /** Source file size in bytes, when known (add / replace). */
  size?: number
  /** True when Ragekit's own installer can apply this operation. */
  supported: boolean
  /** Why it can't be applied here, when unsupported. */
  reason?: string
}

/** One "install to…" choice offered in the installer dialog. */
export interface OivTargetChoice {
  id: OivTarget
  /** Absolute path of the base folder. */
  path: string
  /** The folder already exists on disk. */
  exists: boolean
  /** Suggested default. */
  recommended: boolean
}

/** Everything the installer dialog needs to describe an .oiv package. */
export interface OivInspection {
  sourcePath: string
  name: string
  author?: string
  authorLink?: string
  version?: string
  /** Plain-text large description (RTF / HTML stripped). */
  description?: string
  /** data: URI of the package icon, when the .oiv ships one. */
  icon?: string
  ops: OivContentOp[]
  counts: {
    add: number
    replace: number
    delete: number
    xmlEdit: number
    /** Ops that write inside .rpf archives. */
    archive: number
    /** Ops that write loose files. */
    loose: number
  }
  /** Operations Ragekit can apply itself. */
  supported: number
  total: number
  targets: OivTargetChoice[]
}

export interface OivOpResult {
  target: string
  archive: string
  kind: OivOpKind
  status: 'applied' | 'skipped' | 'failed'
  detail?: string
}

export interface OivInstallReport {
  target: OivTarget
  applied: number
  skipped: number
  failed: number
  results: OivOpResult[]
}

export interface Profile {
  id: string
  name: string
  /** Mod ids enabled in this profile. */
  enabledMods: string[]
}

/** Portable profile — mods identified by name + source so they can be re-fetched. */
export interface ProfileExport {
  ragekit: 1
  name: string
  mods: Array<{ name: string; sourceUrl?: string; version?: string }>
}

export type ActivityKind =
  | 'enable'
  | 'disable'
  | 'install'
  | 'uninstall'
  | 'remove'
  | 'adopt'
  | 'import'
  | 'bulkEnable'
  | 'bulkDisable'
  | 'profileApply'

/** One reversible-ish change, for the activity drawer. */
export interface ActivityEntry {
  id: string
  at: string
  kind: ActivityKind
  modIds: string[]
  modNames: string[]
  /** Present when the action can be undone (and how). */
  undo?: { kind: 'enable' | 'disable'; modIds: string[] }
}

export type LanguageCode = 'fr' | 'en' | 'es' | 'de'

export interface AppConfig {
  game: GameInfo | null
  language: LanguageCode
  onboarded: boolean
  activeProfileId: string | null
  onlineWarningAccepted: boolean
  /** When true, mod loaders are moved aside so the game runs vanilla (online-safe). */
  onlineSafeMode: boolean
  theme: 'dark' | 'light'
}

/** A mod file found in the game folder that the app is not managing. */
export interface FoundMod {
  /** Stable id derived from the path. */
  id: string
  /** Path relative to the game folder. */
  relPath: string
  kind: 'asi' | 'script' | 'script-dll'
  sizeBytes: number
  suggestedName: string
}

export interface ImportResult {
  mod: Mod
  plan: InstallPlan
}

export type RpfEncryption = 'NONE' | 'OPEN' | 'AES' | 'NG' | 'UNKNOWN'

export type NodeCategory =
  | 'folder'
  | 'application'
  | 'dll'
  | 'rpf'
  | 'text'
  | 'textdata'
  | 'binary'
  | 'resource'
  | 'other'

export interface ExplorerNode {
  name: string
  /** Full slash path from the game root; may cross into .rpf archives. */
  vpath: string
  kind: 'dir' | 'file' | 'rpf'
  size: number
  category: NodeCategory
  typeLabel: string
}

export interface ExplorerListing {
  vpath: string
  mode: 'fs' | 'rpf'
  writable: boolean
  encryption?: RpfEncryption
  /** 'ng' for NG-encrypted vanilla archives, or an error string. */
  error?: string
  nodes: ExplorerNode[]
}

export interface SnapshotEntry {
  rel: string
  size: number
  mtimeMs: number
  sha1?: string
}

export interface VanillaSnapshot {
  takenAt: string
  gameVersion?: string
  entries: SnapshotEntry[]
}

export interface IntegrityReport {
  hasSnapshot: boolean
  takenAt?: string
  gameVersion?: string
  ok: boolean
  changed: string[]
  missing: string[]
  extra: string[]
}

/** Full manifest of a clean GTA V install — every game-relative file path. */
export interface VanillaIndex {
  takenAt: string
  gameVersion?: string
  count: number
  /** Lowercased, forward-slash game-relative file paths, sorted. */
  files: string[]
}

/** One mod file/folder found in the game folder by the online-safe scan. */
export interface ScannedMod {
  /** Game-relative path (original case). */
  rel: string
  isDir: boolean
  kind: 'loader' | 'asi' | 'dll' | 'script' | 'log' | 'folder' | 'file'
  /** Total bytes (folder = sum of contents). */
  size: number
  /** Files under this entry, game-relative — what actually gets moved. */
  files: string[]
}

export interface NonVanillaScan {
  /** True when the scan compared against a real vanilla index. */
  usingIndex: boolean
  items: ScannedMod[]
  /** Stock files whose hash/size drifted (modded in place) — cannot be parked. */
  modifiedStock: string[]
  totalFiles: number
  totalBytes: number
}

export interface OnlineStatus {
  safe: boolean
  hasIndex: boolean
  indexTakenAt?: string
  indexCount?: number
  indexGameVersion?: string
  /** Files currently parked away by online-safe mode. */
  parkedCount: number
}

/** A mod page fetched from GTA5-Mods.com. */
export interface RemoteMod {
  url: string
  name: string
  author?: string
  imageUrl?: string
  updatedAt?: string
  downloadUrl: string
  /** False when the download is hosted off-site and can't be auto-installed. */
  autoInstallable: boolean
}

export interface UpdateInfo {
  modId: string
  currentUpdatedAt?: string
  latestUpdatedAt?: string
}

/** A GTA5 crash / error picked up from the Windows Application event log. */
export interface CrashEvent {
  time: string
  id: number
  provider: string
  /** e.g. "ScriptHookV.dll" — the DLL that faulted. */
  faultingModule?: string
  /** e.g. "0xc0000005" (access violation). */
  exceptionCode?: string
  summary: string
}

/** Result of launching the game from the app. */
export interface LaunchReport {
  /** Executable name we ran. */
  exe: string
  pid?: number
  startedAt: string
  /** Process exit code, or null if it was still running when we stopped waiting. */
  exitCode: number | null
  signal: string | null
  /** Set when the process could not even be spawned (missing file, blocked…). */
  spawnError: string | null
  /** True when the game was still alive after the grace period — a good sign. */
  stillRunning: boolean
  durationMs: number
  stdout: string
  stderr: string
  /** Online-safe mode was on — this was a mods-removed "vanilla" test launch. */
  safeMode: boolean
  crashEvents: CrashEvent[]
  /** GTA5 crashes recovered from Windows Error Reporting — names the fault module. */
  werReports: WerReport[]
  logs: LogFile[]
  /** Contents of the game's launch-config files, if present. */
  gameConfig: { name: string; text: string }[]
}

export type LogLevel = 'error' | 'warn' | 'info'

export interface LogEntry {
  level: LogLevel
  text: string
}

export interface LogFile {
  name: string
  mtimeMs: number
  errors: number
  warns: number
  entries: LogEntry[]
  /** Last lines of the file, verbatim (capped). */
  raw: string
  /** True when the file predates the launch we're diagnosing (tool didn't run / crashed early). */
  stale?: boolean
}

/** A Windows Error Reporting record for a GTA5 crash (Report.wer). */
export interface WerReport {
  time: string
  appName: string
  faultModule?: string
  exceptionCode?: string
  /** "Fault Module Name = X", "Exception Code = Y", … */
  signatures: string[]
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
