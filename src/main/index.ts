import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import { store, libraryDir, backupsDir, migrateDataDir } from './store'
import { registerIpc } from './ipc'
import { ensureCategories } from './mods/library'
import { startGameWatch } from './watch'
import { initAutoUpdate } from './updater'
import { IPC } from '@shared/ipc'
import type { LanguageCode } from '@shared/types'

const isDev = !app.isPackaged
const SUPPORTED_LANGS: LanguageCode[] = ['fr', 'en', 'es', 'de']

/** Ragekit's own icon (dev only — the packaged .exe carries it natively). */
function windowIcon(): string | undefined {
  for (const rel of ['../../build/icon.ico', '../../build/icon.png']) {
    const p = join(__dirname, rel)
    if (existsSync(p)) return p
  }
  return undefined
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(libraryDir(), { recursive: true })
  await fs.mkdir(backupsDir(), { recursive: true })
}

/** On the very first run, seed the UI language from the OS locale. */
function seedLanguageOnFirstRun(): void {
  const config = store.get('config')
  if (config.onboarded) return
  const short = app.getLocale().slice(0, 2).toLowerCase() as LanguageCode
  const language = SUPPORTED_LANGS.includes(short) ? short : 'en'
  if (language !== config.language) store.set('config', { ...config, language })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    icon: windowIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0d12', symbolColor: '#c9d1e3', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Windows: taskbar identity / icon grouping (otherwise dev groups as electron.exe).
  if (process.platform === 'win32') app.setAppUserModelId('one.ragekit.app')
  nativeTheme.themeSource = store.get('config').theme === 'light' ? 'light' : 'dark'
  seedLanguageOnFirstRun()
  await migrateDataDir().catch((err) => console.error('data dir migration failed:', err))
  await ensureDirs()
  await ensureCategories().catch((err) => console.error('category backfill failed:', err))
  registerIpc()
  createWindow()
  initAutoUpdate()

  const notifyModsChanged = (): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.evtModsChanged, null)
  }
  startGameWatch(notifyModsChanged)
  store.onDidChange('config', () => startGameWatch(notifyModsChanged))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
