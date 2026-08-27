import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { GameInfo, Platform } from '@shared/types'

const execFileAsync = promisify(execFile)

const EXE = 'GTA5.exe'
const LEGACY_EXE = 'GTA5_Enhanced.exe' // Enhanced edition ships an extra exe name

/** Common fixed install locations to probe as a last resort. */
const COMMON_PATHS: Array<{ path: string; platform: Platform }> = [
  { path: 'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V', platform: 'rockstar' },
  { path: 'C:\\Program Files\\Rockstar Games\\GTAV Enhanced', platform: 'rockstar' },
  { path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V', platform: 'steam' },
  { path: 'C:\\Program Files\\Epic Games\\GTAV', platform: 'epic' },
  { path: 'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V', platform: 'steam' },
]

async function regQuery(key: string, value: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', value], {
      windowsHide: true,
    })
    const match = stdout.match(/REG_[A-Z_]+\s+(.+)\s*$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function folderHasGame(dir: string): boolean {
  return existsSync(join(dir, EXE)) || existsSync(join(dir, LEGACY_EXE))
}

async function fromRockstarLauncher(): Promise<string | null> {
  // Rockstar Games Launcher records installs here.
  for (const hive of ['HKLM', 'HKCU']) {
    for (const title of ['Grand Theft Auto V', 'GTAV Enhanced']) {
      const p = await regQuery(
        `${hive}\\SOFTWARE\\WOW6432Node\\Rockstar Games\\${title}`,
        'InstallFolder',
      )
      if (p && folderHasGame(p)) return p
      const p2 = await regQuery(
        `${hive}\\SOFTWARE\\Rockstar Games\\${title}`,
        'InstallFolder',
      )
      if (p2 && folderHasGame(p2)) return p2
    }
  }
  return null
}

async function fromSteam(): Promise<string | null> {
  // Steam app id 271590 = Grand Theft Auto V.
  const steamPath =
    (await regQuery('HKCU\\SOFTWARE\\Valve\\Steam', 'SteamPath')) ??
    (await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'))
  if (!steamPath) return null

  const libraryFoldersVdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  const roots = new Set<string>([steamPath])
  try {
    const { readFileSync } = await import('node:fs')
    const vdf = readFileSync(libraryFoldersVdf, 'utf8')
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      roots.add(m[1].replace(/\\\\/g, '\\'))
    }
  } catch {
    // no library file, just use the base steam path
  }

  for (const root of roots) {
    const candidate = join(root, 'steamapps', 'common', 'Grand Theft Auto V')
    if (folderHasGame(candidate)) return candidate
  }
  return null
}

async function fromEpic(): Promise<string | null> {
  // Epic writes per-app manifests as .item json files.
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData'
  const manifestDir = join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  try {
    const { readdirSync, readFileSync } = await import('node:fs')
    for (const file of readdirSync(manifestDir)) {
      if (!file.endsWith('.item')) continue
      const data = JSON.parse(readFileSync(join(manifestDir, file), 'utf8')) as {
        InstallLocation?: string
        DisplayName?: string
        MandatoryAppFolderName?: string
      }
      const name = (data.DisplayName ?? '').toLowerCase()
      if (name.includes('grand theft auto') && data.InstallLocation && folderHasGame(data.InstallLocation)) {
        return data.InstallLocation
      }
    }
  } catch {
    // manifests unavailable
  }
  return null
}

async function readExeVersion(dir: string): Promise<string | undefined> {
  const exe = existsSync(join(dir, EXE)) ? join(dir, EXE) : join(dir, LEGACY_EXE)
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`,
      ],
      { windowsHide: true },
    )
    const v = stdout.trim()
    return v.length ? v : undefined
  } catch {
    return undefined
  }
}

/** Best-effort auto-detection across all known launchers. */
export async function detectGame(): Promise<GameInfo | null> {
  const attempts: Array<[Platform, Promise<string | null>]> = [
    ['rockstar', fromRockstarLauncher()],
    ['steam', fromSteam()],
    ['epic', fromEpic()],
  ]

  for (const [platform, promise] of attempts) {
    const path = await promise
    if (path && folderHasGame(path)) {
      return { path, platform, valid: true, version: await readExeVersion(path) }
    }
  }

  for (const { path, platform } of COMMON_PATHS) {
    if (folderHasGame(path)) {
      return { path, platform, valid: true, version: await readExeVersion(path) }
    }
  }

  return null
}

/** Validate a user-picked folder. */
export async function validateGameFolder(path: string): Promise<GameInfo> {
  const valid = folderHasGame(path)
  return {
    path,
    platform: 'manual',
    valid,
    version: valid ? await readExeVersion(path) : undefined,
  }
}
