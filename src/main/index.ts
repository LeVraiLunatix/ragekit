import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { store, libraryDir, backupsDir } from './store'
import { registerIpc } from './ipc'
import { promises as fs } from 'node:fs'

const isDev = !app.isPackaged

async function ensureDirs(): Promise<void> {
  await fs.mkdir(libraryDir(), { recursive: true })
  await fs.mkdir(backupsDir(), { recursive: true })
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
