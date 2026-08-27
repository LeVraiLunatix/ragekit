import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppConfig, FoundMod, GameInfo, LanguageCode, RemoteMod } from '@shared/types'
import { store, migrateDataDir } from './store'
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
  moveMod,
  fileConflicts,
} from './mods/library'
import { scanUnmanaged, adoptFound } from './mods/scan'
import { setOnlineSafeMode, isGameRunning } from './online'
import { readDiagnostics } from './diagnostics'
import { takeSnapshot, verifySnapshot, clearSnapshot } from './integrity'
import { fetchModInfo, installFromRemote, checkModUpdates } from './gta5mods'
import {
  explore,
  extractEntry,
  readEntryText,
  replaceEntry,
  copyArchiveToMods,
  archiveBasename,
} from './rpf/browser'
import { magicCached, ngReady, refetchMagic, loadNgKeys } from './rpf/ngkeys'
import { join } from 'node:path'
import {
  listProfiles,
  createProfile,
  renameProfile,
  deleteProfile,
  captureProfile,
  setProfileMods,
  applyProfile,
} from './profiles'

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

  ipcMain.handle(IPC.configSetGame, async (_e, game: GameInfo | null) => {
    const config = setConfig({ game })
    await migrateDataDir().catch((err) => console.error('data dir migration failed:', err))
    return config
  })

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
        { name: 'Mods', extensions: ['zip', 'rar', 'oiv'] },
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

  ipcMain.handle(IPC.modsMove, (_e, modId: string, direction: 'up' | 'down') => {
    const mods = moveMod(modId, direction)
    broadcast(IPC.evtModsChanged, null)
    return mods
  })

  ipcMain.handle(IPC.modsConflicts, () => fileConflicts())

  ipcMain.handle(IPC.profilesList, () => listProfiles())
  ipcMain.handle(IPC.profilesCreate, (_e, name: string, fromCurrent: boolean) =>
    createProfile(name, fromCurrent),
  )
  ipcMain.handle(IPC.profilesRename, (_e, id: string, name: string) => renameProfile(id, name))
  ipcMain.handle(IPC.profilesDelete, (_e, id: string) => {
    deleteProfile(id)
  })
  ipcMain.handle(IPC.profilesCapture, (_e, id: string) => captureProfile(id))
  ipcMain.handle(IPC.profilesSetMods, (_e, id: string, modIds: string[]) =>
    setProfileMods(id, modIds),
  )
  ipcMain.handle(IPC.profilesApply, async (_e, id: string) => {
    await applyProfile(id)
    broadcast(IPC.evtModsChanged, null)
  })

  ipcMain.handle(IPC.modsOpenFolder, (_e, modId: string) => {
    const mod = listMods().find((m) => m.id === modId)
    if (mod) shell.openPath(mod.sourceDir)
  })

  ipcMain.handle(IPC.modsScan, () => {
    const game = getConfig().game
    if (!game?.valid) return []
    return scanUnmanaged(game.path)
  })

  ipcMain.handle(IPC.modsAdopt, async (_e, items: FoundMod[]) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    const created = await adoptFound(game.path, items)
    broadcast(IPC.evtModsChanged, null)
    return created
  })

  ipcMain.handle(IPC.onlineSetMode, async (_e, active: boolean) => {
    const res = await setOnlineSafeMode(active)
    broadcast(IPC.evtModsChanged, null)
    return res
  })

  ipcMain.handle(IPC.onlineGameRunning, () => isGameRunning())

  ipcMain.handle(IPC.diagnosticsRead, () => {
    const game = getConfig().game
    if (!game?.valid) return []
    return readDiagnostics(game.path)
  })

  ipcMain.handle(IPC.integrityTake, () => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    return takeSnapshot(game.path)
  })

  ipcMain.handle(IPC.integrityVerify, () => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    return verifySnapshot(game.path)
  })

  ipcMain.handle(IPC.integrityClear, () => clearSnapshot())

  ipcMain.handle(IPC.rpfExplore, (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    return explore(game.path, vpath || '')
  })

  ipcMain.handle(IPC.rpfReadText, (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    return readEntryText(game.path, vpath)
  })

  ipcMain.handle(IPC.rpfExtract, async (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showSaveDialog(win!, { defaultPath: archiveBasename(vpath) })
    if (res.canceled || !res.filePath) return false
    await extractEntry(game.path, vpath, res.filePath)
    return true
  })

  ipcMain.handle(IPC.rpfReplace, async (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'] })
    if (res.canceled || !res.filePaths[0]) return false
    await replaceEntry(game.path, vpath, res.filePaths[0])
    return true
  })

  ipcMain.handle(IPC.rpfCopyToMods, (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    return copyArchiveToMods(game.path, vpath)
  })

  ipcMain.handle(IPC.rpfShowInFolder, (_e, vpath: string) => {
    const game = getConfig().game
    if (!game?.valid) return
    shell.showItemInFolder(join(game.path, vpath))
  })

  ipcMain.handle(IPC.ngStatus, async () => {
    const game = getConfig().game
    if (game?.valid) await loadNgKeys(game.path).catch(() => null)
    return { magicCached: magicCached(), ready: ngReady() }
  })

  ipcMain.handle(IPC.ngSet, async () => {
    const game = getConfig().game
    if (!game?.valid) throw new Error('Set a valid GTA V folder first.')
    const ok = await refetchMagic(game.path)
    return { magicCached: magicCached(), ready: ok }
  })

  ipcMain.handle(IPC.ngClear, () => {})

  ipcMain.handle(IPC.remoteFetch, (_e, url: string) => fetchModInfo(url))

  ipcMain.handle(IPC.remoteInstall, async (_e, remote: RemoteMod) => {
    const taskId = `remote:${remote.url}`
    const result = await installFromRemote(remote, (done, total, label) => {
      broadcast(IPC.evtTaskProgress, {
        taskId,
        label,
        progress: total ? done / total : null,
        done: false,
      })
    })
    broadcast(IPC.evtTaskProgress, { taskId, label: result.mod.name, progress: 1, done: true })
    broadcast(IPC.evtModsChanged, null)
    return result
  })

  ipcMain.handle(IPC.remoteCheckUpdates, () => checkModUpdates())

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
