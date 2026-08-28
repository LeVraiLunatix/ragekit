import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

let last: UpdateStatus = { state: 'idle' }

function emit(s: UpdateStatus): void {
  last = s
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.evtUpdateStatus, s)
}

export function getUpdateStatus(): UpdateStatus {
  return last
}

/**
 * Wire electron-updater to GitHub Releases. The app ships with the `publish`
 * block from electron-builder.yml, so this just needs to listen and react:
 * check on launch, download in the background, and let the renderer offer a
 * "restart to update" button once it's ready.
 */
export function initAutoUpdate(): void {
  if (!app.isPackaged) {
    last = { state: 'dev' }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    emit({ state: 'downloading', version: info.version, percent: 0 }),
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'idle' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', version: last.version, percent: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', message: err instanceof Error ? err.message : String(err) }),
  )

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      emit({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    })
  }
  setTimeout(check, 8_000)
  setInterval(check, 3 * 60 * 60 * 1000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return { state: 'dev' }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return last
}

/** Quit and install a downloaded update (silent, relaunch after). */
export function installUpdateNow(): boolean {
  if (last.state !== 'ready') return false
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return true
}
