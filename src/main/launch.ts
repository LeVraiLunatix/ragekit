import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'
import { readDiagnostics } from './diagnostics'
import { isGameRunning } from './online'
import type { CrashEvent, LaunchReport, LogFile } from '@shared/types'

const execFileAsync = promisify(execFile)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** How long to keep polling for the real game process after we start it. */
const POLL_WINDOW_MS = 18_000
const POLL_EVERY_MS = 1_500

/**
 * Newer GTA V builds refuse to run when GTA5.exe is started directly
 * ("ERR_NO_LAUNCHER"). PlayGTAV.exe is Rockstar's official entry point and does
 * the Steam / Rockstar / Epic hand-off, so prefer it; fall back to the raw exe.
 */
function pickLauncher(gamePath: string): { abs: string; name: string } {
  for (const name of ['PlayGTAV.exe', 'GTA5.exe', 'GTA5_Enhanced.exe']) {
    const abs = join(gamePath, name)
    if (existsSync(abs)) return { abs, name }
  }
  throw new Error('No GTA V executable found in the game folder.')
}

/**
 * GTA5 crash / error records from the Windows Application event log since
 * `since`. Non-admin friendly (the Application log is world-readable). Messages
 * are localized, so the "faulting module" / "exception code" patterns match
 * both English and French wording.
 */
async function readCrashEvents(since: Date): Promise<CrashEvent[]> {
  const startIso = new Date(since.getTime() - 60_000).toISOString()
  const psScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    `$evts = Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=[datetime]'${startIso}'} -MaxEvents 80`,
    "$evts | Where-Object { $_.Message -match 'GTA5(_Enhanced)?\\.exe|GTAV' } | ForEach-Object {",
    "  [pscustomobject]@{ time=$_.TimeCreated.ToString('o'); id=$_.Id; provider=$_.ProviderName; message=$_.Message }",
    '} | ConvertTo-Json -Compress -Depth 3',
  ].join('\n')

  let raw = ''
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true, maxBuffer: 8_000_000 },
    )
    raw = stdout.trim()
  } catch {
    return []
  }
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{
    time?: string
    id?: number
    provider?: string
    message?: string
  }>

  const modRe = /(?:faulting module name|nom du module d[eé]faillant)\s*:?\s*([^\s,]+)/i
  const codeRe = /(?:exception code|code d.exception)\s*:?\s*(0x[0-9a-f]+)/i

  return rows
    .filter((r) => r.message)
    .map((r) => {
      const msg = r.message ?? ''
      return {
        time: r.time ?? '',
        id: r.id ?? 0,
        provider: r.provider ?? '',
        faultingModule: msg.match(modRe)?.[1],
        exceptionCode: msg.match(codeRe)?.[1],
        summary: msg
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 6)
          .join(' · ')
          .slice(0, 600),
      }
    })
}

/** Launch GTA V through PlayGTAV.exe and watch for the game process / a crash. */
export async function launchGame(): Promise<LaunchReport> {
  const game = store.get('config').game
  if (!game?.valid) throw new Error('No valid GTA V folder configured.')
  const { abs, name } = pickLauncher(game.path)

  const startedAt = new Date()
  const t0 = Date.now()
  let stdout = ''
  let stderr = ''
  let spawnError: string | null = null
  let stubExit: number | null = null
  let child: ChildProcess | null = null

  try {
    child = spawn(abs, [], { cwd: game.path, windowsHide: false })
  } catch (err) {
    spawnError = err instanceof Error ? err.message : String(err)
  }
  child?.stdout?.on('data', (d: Buffer) => {
    stdout = (stdout + d.toString()).slice(-16_000)
  })
  child?.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-16_000)
  })
  child?.on('error', (err) => {
    spawnError = spawnError ?? err.message
  })
  child?.on('exit', (code) => {
    stubExit = code
  })

  // Poll for the actual GTA5 process — PlayGTAV.exe exits as soon as it hands
  // off, so its exit code tells us nothing about the game.
  let gameSeen = false
  const deadline = Date.now() + POLL_WINDOW_MS
  while (Date.now() < deadline) {
    await sleep(POLL_EVERY_MS)
    if (await isGameRunning()) {
      gameSeen = true
      break
    }
  }
  if (child && !gameSeen) child.unref()

  const [crashEvents, logs] = await Promise.all([
    readCrashEvents(startedAt).catch(() => [] as CrashEvent[]),
    readDiagnostics(game.path).catch(() => [] as LogFile[]),
  ])

  const report: LaunchReport = {
    exe: name,
    pid: child?.pid,
    startedAt: startedAt.toISOString(),
    exitCode: stubExit,
    signal: null,
    spawnError,
    stillRunning: gameSeen,
    durationMs: Date.now() - t0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    crashEvents,
    logs,
  }
  store.set('lastLaunch', report)
  return report
}

export function getLastLaunch(): LaunchReport | null {
  return store.get('lastLaunch')
}

/** Re-read the event log + mod logs for the last launch (e.g. it crashed later). */
export async function recheckLastLaunch(): Promise<LaunchReport | null> {
  const prev = store.get('lastLaunch')
  if (!prev) return null
  const gamePath = store.get('config').game?.path
  const [crashEvents, logs] = await Promise.all([
    readCrashEvents(new Date(prev.startedAt)).catch(() => prev.crashEvents),
    gamePath ? readDiagnostics(gamePath).catch(() => prev.logs) : Promise.resolve(prev.logs),
  ])
  const merged: LaunchReport = { ...prev, crashEvents, logs, stillRunning: await isGameRunning() }
  store.set('lastLaunch', merged)
  return merged
}
