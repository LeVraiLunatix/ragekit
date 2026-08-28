import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'
import { readDiagnostics, readGameConfigFiles } from './diagnostics'
import { isGameRunning } from './online'
import type { CrashEvent, LaunchReport, LogFile, WerReport } from '@shared/types'

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

/** Decode a buffer that may be UTF-16LE (BOM) or UTF-8. */
function decode(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').slice(1)
  return buf.toString('utf8')
}

/* -------------------------------------------------------- Windows Error Rpt --- */

function werDirs(): string[] {
  const la = process.env.LOCALAPPDATA
  const pd = process.env.PROGRAMDATA ?? 'C:\\ProgramData'
  const dirs: string[] = []
  for (const base of [la, pd]) {
    if (!base) continue
    dirs.push(join(base, 'Microsoft', 'Windows', 'WER', 'ReportArchive'))
    dirs.push(join(base, 'Microsoft', 'Windows', 'WER', 'ReportQueue'))
  }
  return dirs
}

async function parseWerFile(file: string): Promise<WerReport | null> {
  let text: string
  try {
    text = decode(await fs.readFile(file))
  } catch {
    return null
  }
  const kv = new Map<string, string>()
  const sigName = new Map<string, string>()
  const sigVal = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    const mName = key.match(/^Sig\[(\d+)\]\.Name$/i)
    const mVal = key.match(/^Sig\[(\d+)\]\.Value$/i)
    if (mName) sigName.set(mName[1], val)
    else if (mVal) sigVal.set(mVal[1], val)
    else kv.set(key, val)
  }

  const sigs: string[] = []
  let faultModule: string | undefined
  let exceptionCode: string | undefined
  let appName = kv.get('AppName') ?? ''
  for (const [i, name] of sigName) {
    const v = sigVal.get(i) ?? ''
    if (!name && !v) continue
    sigs.push(`${name} = ${v}`)
    const n = name.toLowerCase()
    if (n.includes('application name') && v) appName = v
    if (n.includes('fault module name') || n.includes('module en erreur')) faultModule = v
    if (n.includes('exception code')) exceptionCode = normCode(v)
  }

  const haystack = `${appName} ${kv.get('AppPath') ?? ''} ${sigs.join(' ')}`.toLowerCase()
  if (!/gta5|playgtav|grand theft auto/.test(haystack)) return null

  return {
    time: '', // filled from the report folder's mtime by the caller
    appName: appName || 'GTA5.exe',
    faultModule,
    exceptionCode,
    signatures: sigs,
  }
}

async function readWerReports(since: Date): Promise<WerReport[]> {
  const cutoff = since.getTime() - 10 * 60_000
  const out: WerReport[] = []
  for (const dir of werDirs()) {
    let subs: string[]
    try {
      subs = await fs.readdir(dir)
    } catch {
      continue
    }
    const recent: Array<{ path: string; mtime: number; name: string }> = []
    for (const sub of subs) {
      const p = join(dir, sub)
      const st = await fs.stat(p).catch(() => null)
      if (st?.isDirectory() && st.mtimeMs >= cutoff)
        recent.push({ path: p, mtime: st.mtimeMs, name: sub })
    }
    recent.sort((a, b) => b.mtime - a.mtime)
    for (const { path, mtime, name } of recent.slice(0, 30)) {
      let rep = await parseWerFile(join(path, 'Report.wer'))
      if (!rep) {
        // Report.wer is admin-only on some systems — the folder name still
        // encodes the crashed exe: "AppCrash_GTA5.exe_<hash>_<hash>_<guid>".
        const m = name.match(/^AppCrash_((?:GTA5|GTA5_Enhanced|PlayGTAV)\.exe)_/i)
        if (m) rep = { time: '', appName: m[1], signatures: [name] }
      }
      if (rep) {
        rep.time = new Date(mtime).toISOString()
        out.push(rep)
      }
      if (out.length >= 8) break
    }
    if (out.length >= 8) break
  }
  return out.sort((a, b) => b.time.localeCompare(a.time))
}

/* ------------------------------------------------------------- event log --- */

/** Human name for the common NTSTATUS exception codes seen in GTA5 crashes. */
const EXC_NAMES: Record<string, string> = {
  c0000005: 'access violation',
  c00000fd: 'stack overflow',
  c0000409: 'stack buffer overrun',
  c000001d: 'illegal instruction',
  c0000374: 'heap corruption',
  c0000135: 'DLL not found',
  c0000142: 'DLL init failed',
  e0434352: '.NET exception',
  e06d7363: 'C++ exception',
}

function normCode(v: string | undefined): string | undefined {
  if (!v) return undefined
  const hex = v.replace(/^0x/i, '').toLowerCase()
  const name = EXC_NAMES[hex]
  return name ? `0x${hex} (${name})` : `0x${hex}`
}

async function readCrashEvents(since: Date): Promise<CrashEvent[]> {
  const startIso = new Date(since.getTime() - 90_000).toISOString()
  const psScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    `$evts = Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=[datetime]'${startIso}'} -MaxEvents 150`,
    "$evts | Where-Object { $_.Message -match 'gta5|playgtav|grand theft auto|scripthook' } | ForEach-Object {",
    "  [pscustomobject]@{ time=$_.TimeCreated.ToString('o'); id=$_.Id; provider=$_.ProviderName; message=$_.Message }",
    '} | ConvertTo-Json -Compress -Depth 3',
  ].join('\n')

  let raw = ''
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true, maxBuffer: 12_000_000 },
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

  // "Application Error" (1000) — labelled fields, localized.
  const modRe = /(?:faulting module name|nom du module d[eé]faillant|module en erreur)\s*:?\s*([^\s,]+)/i
  const codeRe = /(?:exception code|code d.exception)\s*:?\s*(0x[0-9a-f]+)/i
  // WER "APPCRASH" (1001) — P1..P10 signature lines. NBSP or space before ':'.
  const pRe = /^\s*P(\d{1,2})[\s ]*:?\s*(.+?)\s*$/

  const events = rows
    .filter((r) => r.message)
    .map((r): CrashEvent => {
      const msg = r.message ?? ''
      const lines = msg.split(/\r?\n/)
      let faultingModule = msg.match(modRe)?.[1]
      let exceptionCode = msg.match(codeRe)?.[1]

      const isAppcrash = /APPCRASH|CLR20r3/i.test(msg)
      if (isAppcrash) {
        const p: Record<number, string> = {}
        for (const l of lines) {
          const m = l.match(pRe)
          if (m) p[Number(m[1])] = m[2]
        }
        // APPCRASH: P4 = fault module, P7 = exception code.
        // CLR20r3:  P4 = assembly,     P8 = exception type.
        if (!faultingModule) faultingModule = p[4]
        if (!exceptionCode) exceptionCode = p[7] || p[8]
      }

      const summary = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, isAppcrash ? 14 : 6)
        .join(' · ')
        .slice(0, 700)

      return {
        time: r.time ?? '',
        id: r.id ?? 0,
        provider: r.provider ?? '',
        faultingModule,
        exceptionCode: normCode(exceptionCode),
        summary,
      }
    })
    .sort((a, b) => b.time.localeCompare(a.time))

  // A crash loop produces dozens of identical records — keep one per signature.
  const seen = new Set<string>()
  const deduped: CrashEvent[] = []
  for (const e of events) {
    const key = `${e.provider}|${e.faultingModule ?? ''}|${e.exceptionCode ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(e)
    if (deduped.length >= 12) break
  }
  return deduped
}

/* --------------------------------------------------------------- launch --- */

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

  // Poll for the actual GTA5 process. A load crash appears then dies in <2s,
  // so a true launch is one that's still there at the end of the window.
  let everSeen = false
  const deadline = Date.now() + POLL_WINDOW_MS
  while (Date.now() < deadline) {
    await sleep(POLL_EVERY_MS)
    if (await isGameRunning()) everSeen = true
  }
  const runningAtEnd = await isGameRunning()
  if (child && !runningAtEnd) child.unref()

  const [crashEvents, werReports, logs, gameConfig] = await Promise.all([
    readCrashEvents(startedAt).catch(() => [] as CrashEvent[]),
    readWerReports(startedAt).catch(() => [] as WerReport[]),
    readDiagnostics(game.path, startedAt.toISOString()).catch(() => [] as LogFile[]),
    readGameConfigFiles(game.path).catch(() => [] as { name: string; text: string }[]),
  ])

  const report: LaunchReport = {
    exe: name,
    pid: child?.pid,
    startedAt: startedAt.toISOString(),
    exitCode: stubExit,
    signal: null,
    spawnError,
    stillRunning: runningAtEnd || (everSeen && crashEvents.length === 0 && werReports.length === 0),
    durationMs: Date.now() - t0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    safeMode: !!store.get('config').onlineSafeMode,
    crashEvents,
    werReports,
    logs,
    gameConfig,
  }
  // A process that showed up and then vanished is a startup crash, not "running".
  if (everSeen && !runningAtEnd && (crashEvents.length > 0 || werReports.length > 0)) {
    report.stillRunning = false
  }
  store.set('lastLaunch', report)
  return report
}

/** Back-fill fields that older builds didn't store, so the renderer never NPEs. */
function normalize(r: LaunchReport | null): LaunchReport | null {
  if (!r) return null
  return {
    ...r,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    safeMode: r.safeMode ?? false,
    crashEvents: r.crashEvents ?? [],
    werReports: r.werReports ?? [],
    logs: r.logs ?? [],
    gameConfig: r.gameConfig ?? [],
  }
}

export function getLastLaunch(): LaunchReport | null {
  return normalize(store.get('lastLaunch'))
}

/** Re-read the event log + WER + mod logs for the last launch (it may have crashed later). */
export async function recheckLastLaunch(): Promise<LaunchReport | null> {
  const prev = normalize(store.get('lastLaunch'))
  if (!prev) return null
  const gamePath = store.get('config').game?.path
  const since = new Date(prev.startedAt)
  const [crashEvents, werReports, logs] = await Promise.all([
    readCrashEvents(since).catch(() => prev.crashEvents),
    readWerReports(since).catch(() => prev.werReports),
    gamePath
      ? readDiagnostics(gamePath, prev.startedAt).catch(() => prev.logs)
      : Promise.resolve(prev.logs),
  ])
  const merged: LaunchReport = {
    ...prev,
    crashEvents,
    werReports,
    logs,
    stillRunning: await isGameRunning(),
  }
  store.set('lastLaunch', merged)
  return merged
}
