import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppConfig,
  DependencyStatus,
  FoundMod,
  GameInfo,
  ImportResult,
  InstallPlan,
  IntegrityReport,
  LanguageCode,
  LogFile,
  Mod,
  Profile,
  RemoteMod,
  ExplorerListing,
  TaskProgress,
  UpdateInfo,
  VanillaSnapshot,
  OnlineStatus,
  NonVanillaScan,
} from '@shared/types'

export interface FileConflict {
  path: string
  modIds: string[]
}

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
    setGame: (game: GameInfo | null): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.configSetGame, game),
    setLanguage: (language: LanguageCode): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.configSetLanguage, language),
    completeOnboarding: (): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.configCompleteOnboarding),
  },
  game: {
    detect: (): Promise<GameInfo | null> => ipcRenderer.invoke(IPC.gameDetect),
    browse: (): Promise<GameInfo | null> => ipcRenderer.invoke(IPC.gameBrowse),
    validate: (path: string): Promise<GameInfo> => ipcRenderer.invoke(IPC.gameValidate, path),
  },
  mods: {
    list: (): Promise<Mod[]> => ipcRenderer.invoke(IPC.modsList),
    import: (): Promise<ImportResult[]> => ipcRenderer.invoke(IPC.modsImport),
    importPaths: (paths: string[]): Promise<ImportResult[]> =>
      ipcRenderer.invoke(IPC.modsImportPaths, paths),
    plan: (modId: string): Promise<InstallPlan> => ipcRenderer.invoke(IPC.modsPlan, modId),
    install: (modId: string): Promise<Mod> => ipcRenderer.invoke(IPC.modsInstall, modId),
    uninstall: (modId: string): Promise<Mod> => ipcRenderer.invoke(IPC.modsUninstall, modId),
    setEnabled: (modId: string, enabled: boolean): Promise<Mod> =>
      ipcRenderer.invoke(IPC.modsSetEnabled, modId, enabled),
    remove: (modId: string): Promise<void> => ipcRenderer.invoke(IPC.modsRemove, modId),
    reorder: (modId: string, loadOrder: number): Promise<Mod> =>
      ipcRenderer.invoke(IPC.modsReorder, modId, loadOrder),
    openFolder: (modId: string): Promise<void> => ipcRenderer.invoke(IPC.modsOpenFolder, modId),
    move: (modId: string, direction: 'up' | 'down'): Promise<Mod[]> =>
      ipcRenderer.invoke(IPC.modsMove, modId, direction),
    conflicts: (): Promise<FileConflict[]> => ipcRenderer.invoke(IPC.modsConflicts),
    scan: (): Promise<FoundMod[]> => ipcRenderer.invoke(IPC.modsScan),
    adopt: (items: FoundMod[]): Promise<Mod[]> => ipcRenderer.invoke(IPC.modsAdopt, items),
  },
  profiles: {
    list: (): Promise<Profile[]> => ipcRenderer.invoke(IPC.profilesList),
    create: (name: string, fromCurrent: boolean): Promise<Profile> =>
      ipcRenderer.invoke(IPC.profilesCreate, name, fromCurrent),
    duplicate: (id: string): Promise<Profile> => ipcRenderer.invoke(IPC.profilesDuplicate, id),
    rename: (id: string, name: string): Promise<Profile> =>
      ipcRenderer.invoke(IPC.profilesRename, id, name),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.profilesDelete, id),
    capture: (id: string): Promise<Profile> => ipcRenderer.invoke(IPC.profilesCapture, id),
    setMods: (id: string, modIds: string[]): Promise<Profile> =>
      ipcRenderer.invoke(IPC.profilesSetMods, id, modIds),
    apply: (id: string): Promise<void> => ipcRenderer.invoke(IPC.profilesApply, id),
  },
  deps: {
    status: (): Promise<DependencyStatus[]> => ipcRenderer.invoke(IPC.depsStatus),
  },
  diagnostics: {
    read: (): Promise<LogFile[]> => ipcRenderer.invoke(IPC.diagnosticsRead),
  },
  integrity: {
    take: (): Promise<VanillaSnapshot> => ipcRenderer.invoke(IPC.integrityTake),
    verify: (): Promise<IntegrityReport> => ipcRenderer.invoke(IPC.integrityVerify),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.integrityClear),
  },
  rpf: {
    explore: (vpath: string): Promise<ExplorerListing> => ipcRenderer.invoke(IPC.rpfExplore, vpath),
    readText: (vpath: string): Promise<string> => ipcRenderer.invoke(IPC.rpfReadText, vpath),
    extract: (vpath: string): Promise<boolean> => ipcRenderer.invoke(IPC.rpfExtract, vpath),
    replace: (vpath: string): Promise<boolean> => ipcRenderer.invoke(IPC.rpfReplace, vpath),
    copyToMods: (vpath: string): Promise<string> => ipcRenderer.invoke(IPC.rpfCopyToMods, vpath),
    showInFolder: (vpath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.rpfShowInFolder, vpath),
  },
  ng: {
    status: (): Promise<{ magicCached: boolean; ready: boolean; reason: string }> =>
      ipcRenderer.invoke(IPC.ngStatus),
    download: (): Promise<{ magicCached: boolean; ready: boolean; reason: string }> =>
      ipcRenderer.invoke(IPC.ngSet),
  },
  remote: {
    fetch: (url: string): Promise<RemoteMod> => ipcRenderer.invoke(IPC.remoteFetch, url),
    install: (remote: RemoteMod): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.remoteInstall, remote),
    checkUpdates: (): Promise<UpdateInfo[]> => ipcRenderer.invoke(IPC.remoteCheckUpdates),
  },
  online: {
    setMode: (active: boolean): Promise<{ active: boolean; moved: string[] }> =>
      ipcRenderer.invoke(IPC.onlineSetMode, active),
    isGameRunning: (): Promise<boolean> => ipcRenderer.invoke(IPC.onlineGameRunning),
    status: (): Promise<OnlineStatus> => ipcRenderer.invoke(IPC.onlineStatus),
    scan: (): Promise<NonVanillaScan> => ipcRenderer.invoke(IPC.onlineScan),
    buildIndex: (): Promise<OnlineStatus> => ipcRenderer.invoke(IPC.onlineBuildIndex),
    clearIndex: (): Promise<OnlineStatus> => ipcRenderer.invoke(IPC.onlineClearIndex),
  },
  system: {
    writable: (): Promise<{
      elevated: boolean
      gamePath: string | null
      gameWritable: boolean
    }> => ipcRenderer.invoke(IPC.systemWritable),
    relaunchAdmin: (): Promise<boolean> => ipcRenderer.invoke(IPC.systemRelaunchAdmin),
  },
  misc: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
    openGameFolder: (): Promise<void> => ipcRenderer.invoke(IPC.openGameFolder),
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
  on: {
    taskProgress: (cb: (p: TaskProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: TaskProgress): void => cb(p)
      ipcRenderer.on(IPC.evtTaskProgress, listener)
      return () => ipcRenderer.removeListener(IPC.evtTaskProgress, listener)
    },
    modsChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.evtModsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.evtModsChanged, listener)
    },
  },
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
