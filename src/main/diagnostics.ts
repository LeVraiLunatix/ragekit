import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry, LogFile, LogLevel } from '@shared/types'
import { pathExists } from './mods/fsutil'

/** Log files various mod tools drop in the game folder (root unless noted). */
const KNOWN_LOGS = [
  'ScriptHookV.log',
  'asiloader.log',
  'ScriptHookVDotNet.log',
  'ScriptHookVDotNet2.log',
  'ScriptHookVDotNet3.log',
  'community_scripthookvdotnet.log',
  'OpenIV.log',
  'PackfileLimitAdjuster.log',
  'PacketLimitAdjuster.log',
  'GTAV.HeapAdjuster.log',
  'GTAVUpscaler.log',
  'menyoolog.txt',
  'openCameraV.log',
  'ReShade.log',
  'd3d11.log',
  'dxgi.log',
  'LSPDFR.log',
  'RagePluginHook.log',
  'ELS.log',
  join('scripts', 'ScriptHookVDotNet.log'),
  join('scripts', 'LemonUI.log'),
  join('plugins', 'LSPDFR.log'),
]

/** Small launch-config files worth showing verbatim. */
const CONFIG_FILES = ['commandline.txt', 'args.txt', 'version.txt', 'versioninfo.txt']

const ERROR_RE =
  /\b(error|exception|failed|fail|unhandled|not found|missing|introuvable|could not|cannot load|couldn.t|crash|fatal|abort)\b/i
const WARN_RE = /\b(warn|warning|deprecat|obsolete|skipp?ed|retry|mismatch)\b/i

function classify(line: string): LogLevel {
  if (ERROR_RE.test(line)) return 'error'
  if (WARN_RE.test(line)) return 'warn'
  return 'info'
}

/** Decode a buffer that may be UTF-16LE (BOM) or UTF-8. */
function decode(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').slice(1)
  return buf.toString('utf8')
}

async function parseFile(abs: string, name: string, since?: number): Promise<LogFile | null> {
  let buf: Buffer
  let mtimeMs: number
  try {
    ;[buf, mtimeMs] = await Promise.all([fs.readFile(abs), fs.stat(abs).then((s) => s.mtimeMs)])
  } catch {
    return null
  }

  const allLines = decode(buf)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
  const trimmed = allLines.filter((l) => l.trim())

  const entries: LogEntry[] = []
  let errors = 0
  let warns = 0
  for (const line of trimmed.slice(-500)) {
    const level = classify(line)
    if (level === 'info') continue
    if (level === 'error') errors++
    else warns++
    entries.push({ level, text: line.slice(0, 500) })
  }

  const raw = trimmed.slice(-160).join('\n').slice(-16_000)

  return {
    name,
    mtimeMs,
    errors,
    warns,
    entries: entries.slice(-80),
    raw,
    stale: since !== undefined && mtimeMs < since - 5_000,
  }
}

/**
 * Parse the mod logs in the game folder. Pass `sinceIso` (a launch time) to have
 * files that predate it flagged `stale` — a tool whose log didn't update on the
 * last run either crashed before logging or isn't loading.
 */
export async function readDiagnostics(gamePath: string, sinceIso?: string): Promise<LogFile[]> {
  const since = sinceIso ? Date.parse(sinceIso) : undefined
  const seen = new Set<string>()
  const out: LogFile[] = []

  const add = async (rel: string): Promise<void> => {
    const key = rel.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const abs = join(gamePath, rel)
    if (!(await pathExists(abs))) return
    const parsed = await parseFile(abs, rel.split('\\').join('/'), since)
    if (parsed) out.push(parsed)
  }

  for (const rel of KNOWN_LOGS) await add(rel)

  // Anything else that looks like a mod log at the root or in scripts/.
  for (const dir of ['', 'scripts', 'plugins']) {
    const abs = dir ? join(gamePath, dir) : gamePath
    const ents = await fs.readdir(abs, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      if (!e.isFile()) continue
      const n = e.name.toLowerCase()
      if (!n.endsWith('.log') && !(dir === '' && n.endsWith('log.txt'))) continue
      await add(dir ? `${dir}/${e.name}` : e.name)
    }
  }

  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Contents of the game's launch-config files (commandline.txt, args.txt…). */
export async function readGameConfigFiles(gamePath: string): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = []
  for (const name of CONFIG_FILES) {
    const abs = join(gamePath, name)
    if (!(await pathExists(abs))) continue
    try {
      const buf = await fs.readFile(abs)
      const text = decode(buf).trim().slice(0, 4_000)
      if (text) out.push({ name, text })
    } catch {
      /* skip */
    }
  }
  return out
}
