import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'
import { readDiagnostics } from './diagnostics'
import type { CrashEvent, LaunchReport, LogFile } from '@shared/types'

const execFileAsync = promisify(execFile)

/** If the game is still alive this long after spawn, it launched fine. */
const CONSIDER_UP_MS = 9_000
/** Absolute ceiling on how long the IPC call blocks. */
const HARD_CAP_MS = 22_000

function pickExe(gamePath: string): { abs: string; name: string } {
  for (const name of ['GTA5.exe', 'GTA5_Enhanced.exe', 'PlayGTAV.exe']) {
    const abs = join(gamePath, name)
    if (existsSync(abs)) return { abs, name }
  }
  throw new Error('No GTA V executable found in the game folder.')
}

/**
 * Read GTA5 crash / error records from the Windows Application event log since
 * `since`. Non-admin friendly (the Application log is world-readable). Messages
 * are localized, so the "faulting module" / "exception code" patterns match
 * both the English and French wording.
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
        summary: msg.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6).join(' · ').slice(0, 600),
      }
    })
}

/** Launch GTA V and report how it went. Blocks briefly to catch an early crash. */
export async function launchGame(): Promise<LaunchReport> {
  const game = store.get('config').game
  if (!game?.valid) throw new Error('No valid GTA V folder configured.')
  const { abs, name } = pickExe(game.path)

  const startedAt = new Date()
  const t0 = Date.now()
  let stdout = ''
  let stderr = ''
  let exitCode: number | null = null
  let signal: string | null = null
  let spawnError: string | null = null

  const child = spawn(abs, [], { cwd: game.path, windowsHide: false })
  const pid = child.pid

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    child.stdout?.on('data', (d: Buffer) => {
      stdout = (stdout + d.toString()).slice(-16_000)
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-16_000)
    })
    child.on('error', (err) => {
      spawnError = err.message
      finish()
    })
    child.on('exit', (code, sig) => {
      exitCode = code
      signal = sig
      finish()
    })
    setTimeout(() => {
      if (exitCode === null && !spawnError) finish()
    }, CONSIDER_UP_MS)
    setTimeout(finish, HARD_CAP_MS)
  })

  const stillRunning = exitCode === null && !spawnError
  if (stillRunning) child.unref()

  const [crashEvents, logs] = await Promise.all([
    readCrashEvents(startedAt).catch(() => [] as CrashEvent[]),
    readDiagnostics(game.path).catch(() => [] as LogFile[]),
  ])

  const report: LaunchReport = {
    exe: name,
    pid,
    startedAt: startedAt.toISOString(),
    exitCode,
    signal,
    spawnError,
    stillRunning,
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
