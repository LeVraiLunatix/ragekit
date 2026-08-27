import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * A mod manager must write into the GTA V folder (clone update.rpf, drop
 * dlcpacks, park loaders for online-safe mode, rewrite RPF TOCs). When the game
 * lives under a location whose ACL only grants write to Administrators — the
 * common case for Steam/Rockstar installs and anything OpenIV has touched — an
 * unprivileged process gets EPERM/EACCES. OpenIV solves this by requiring
 * elevation; we do the same, and offer a one-click "relaunch as admin".
 */

let elevatedCache: boolean | null = null

/** Windows: is this process running elevated? Probed by writing to %WINDIR%. */
export function isElevated(): boolean {
  if (process.platform !== 'win32') return true
  if (elevatedCache !== null) return elevatedCache
  const dir = process.env.WINDIR || 'C:\\Windows'
  const probe = join(dir, `ragekit-elev-${process.pid}-${Date.now()}.tmp`)
  try {
    writeFileSync(probe, '')
    unlinkSync(probe)
    elevatedCache = true
  } catch {
    elevatedCache = false
  }
  return elevatedCache
}

/** Can the current process create (and delete) a file directly under `dir`? */
export async function canWrite(dir: string): Promise<boolean> {
  const probe = join(dir, `.ragekit-write-test-${randomBytes(5).toString('hex')}`)
  try {
    await fs.writeFile(probe, '')
    await fs.rm(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/** True when an error is a Windows permission denial we can fix by elevating. */
export function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code === 'EPERM' || code === 'EACCES'
}

const MARKER = 'GAME_DIR_NOT_WRITABLE'

/** Re-throw a permission denial as a message the renderer recognises. */
export function rethrowIfPermission(err: unknown): never {
  if (isPermissionError(err)) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`${MARKER}: ${detail}`)
  }
  throw err
}

/** Run `fn`, converting a permission denial into the recognised marker error. */
export async function guardGameWrite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    rethrowIfPermission(err)
  }
}

/**
 * Relaunch this executable elevated via a UAC prompt, then quit this instance.
 * Returns false if we couldn't even spawn the helper (non-Windows, or blocked).
 */
export function relaunchElevated(): boolean {
  if (process.platform !== 'win32') return false
  const exe = process.execPath
  // Packaged: execPath is Ragekit.exe and needs no args. Dev: execPath is
  // electron.exe — hand back the original argv so it re-opens the project.
  const args = app.isPackaged ? [] : process.argv.slice(1)
  const q = (s: string): string => `'${s.replace(/'/g, "''")}'`
  const argList =
    args.length > 0 ? ` -ArgumentList @(${args.map(q).join(',')})` : ''
  const command = `Start-Process -FilePath ${q(exe)}${argList} -Verb RunAs`
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    setTimeout(() => app.exit(0), 250)
    return true
  } catch {
    return false
  }
}
