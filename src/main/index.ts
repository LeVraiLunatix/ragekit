import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { store, libraryDir, backupsDir, migrateDataDir } from './store'
import { registerIpc } from './ipc'
import { promises as fs } from 'node:fs'
import type { LanguageCode } from '@shared/types'

const isDev = !app.isPackaged
const SUPPORTED_LANGS: LanguageCode[] = ['fr', 'en', 'es', 'de']

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
  nativeTheme.themeSource = store.get('config').theme === 'light' ? 'light' : 'dark'
  seedLanguageOnFirstRun()
  await migrateDataDir().catch((err) => console.error('data dir migration failed:', err))
  await ensureDirs()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
