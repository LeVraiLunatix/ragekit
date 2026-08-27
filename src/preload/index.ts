import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppConfig,
  DependencyStatus,
  FoundMod,
  GameInfo,
  ImportResult,
  InstallPlan,
  LanguageCode,
  Mod,
  TaskProgress,
} from '@shared/types'

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
    scan: (): Promise<FoundMod[]> => ipcRenderer.invoke(IPC.modsScan),
    adopt: (items: FoundMod[]): Promise<Mod[]> => ipcRenderer.invoke(IPC.modsAdopt, items),
  },
  deps: {
    status: (): Promise<DependencyStatus[]> => ipcRenderer.invoke(IPC.depsStatus),
  },
  online: {
    setMode: (active: boolean): Promise<{ active: boolean; moved: string[] }> =>
      ipcRenderer.invoke(IPC.onlineSetMode, active),
    isGameRunning: (): Promise<boolean> => ipcRenderer.invoke(IPC.onlineGameRunning),
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
