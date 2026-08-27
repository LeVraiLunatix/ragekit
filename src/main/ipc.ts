import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppConfig, GameInfo, LanguageCode } from '@shared/types'
import { store } from './store'
import { detectGame, validateGameFolder } from './game/detect'
import { dependencyStatus } from './mods/deps'
import {
  listMods,
  importFromPaths,
  buildPlan,
  installMod,
  uninstallMod,
  setEnabled,
  removeMod,
  reorder,
} from './mods/library'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function getConfig(): AppConfig {
  return store.get('config')
}

function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch }
  store.set('config', next)
  return next
}

export function registerIpc(): void {
  ipcMain.handle(IPC.configGet, () => getConfig())

  ipcMain.handle(IPC.configSetGame, (_e, game: GameInfo | null) => setConfig({ game }))

  ipcMain.handle(IPC.configSetLanguage, (_e, language: LanguageCode) =>
    setConfig({ language }),
  )

  ipcMain.handle(IPC.configCompleteOnboarding, () =>
    setConfig({ onboarded: true, onlineWarningAccepted: true }),
  )

  ipcMain.handle(IPC.gameDetect, () => detectGame())

  ipcMain.handle(IPC.gameBrowse, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Select your Grand Theft Auto V folder',
      properties: ['openDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null
    return validateGameFolder(res.filePaths[0])
  })

  ipcMain.handle(IPC.gameValidate, (_e, path: string) => validateGameFolder(path))

  ipcMain.handle(IPC.modsList, () => listMods())

  ipcMain.handle(IPC.modsImport, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Add mods',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Mods', extensions: ['zip', 'oiv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (res.canceled || res.filePaths.length === 0) return []
    const out = await importFromPaths(res.filePaths)
    broadcast(IPC.evtModsChanged, null)
    return out
  })

  ipcMain.handle(IPC.modsImportPaths, async (_e, paths: string[]) => {
    if (!paths?.length) return []
    const out = await importFromPaths(paths)
    broadcast(IPC.evtModsChanged, null)
    return out
  })

  ipcMain.handle(IPC.modsInstall, async (_e, modId: string) => {
    const taskId = `install:${modId}`
    const mod = await installMod(modId, (done, total, label) => {
      broadcast(IPC.evtTaskProgress, {
        taskId,
        label: `Installing ${label}`,
        progress: total ? done / total : null,
        done: false,
      })
    })
    broadcast(IPC.evtTaskProgress, { taskId, label: 'Installed', progress: 1, done: true })
    broadcast(IPC.evtModsChanged, null)
    return mod
  })

  ipcMain.handle(IPC.modsUninstall, async (_e, modId: string) => {
    const mod = await uninstallMod(modId)
    broadcast(IPC.evtModsChanged, null)
    return mod
  })

  ipcMain.handle(IPC.modsSetEnabled, async (_e, modId: string, enabled: boolean) => {
    const mod = await setEnabled(modId, enabled)
    broadcast(IPC.evtModsChanged, null)
    return mod
  })

  ipcMain.handle(IPC.modsRemove, async (_e, modId: string) => {
    await removeMod(modId)
    broadcast(IPC.evtModsChanged, null)
  })

  ipcMain.handle(IPC.modsReorder, (_e, modId: string, loadOrder: number) =>
    reorder(modId, loadOrder),
  )

  ipcMain.handle(IPC.modsOpenFolder, (_e, modId: string) => {
    const mod = listMods().find((m) => m.id === modId)
    if (mod) shell.openPath(mod.sourceDir)
  })

  ipcMain.handle(IPC.modsPlan, (_e, modId: string) => buildPlan(modId))

  ipcMain.handle(IPC.depsStatus, () => {
    const game = getConfig().game
    if (!game?.valid) return []
    return dependencyStatus(game.path)
  })

  ipcMain.handle(IPC.openExternal, (_e, url: string) => shell.openExternal(url))

  ipcMain.handle(IPC.openGameFolder, () => {
    const game = getConfig().game
    if (game?.valid) shell.openPath(game.path)
  })
}
