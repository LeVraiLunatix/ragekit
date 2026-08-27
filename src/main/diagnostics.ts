import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry, LogFile, LogLevel } from '@shared/types'
import { pathExists } from './mods/fsutil'

/** Log files various mod tools drop in the game folder. */
const CANDIDATES = [
  'ScriptHookV.log',
  'asiloader.log',
  'ScriptHookVDotNet.log',
  'ScriptHookVDotNet2.log',
  'ScriptHookVDotNet3.log',
  'openIV.log',
  'PacketLimitAdjuster.log',
  join('scripts', 'ScriptHookVDotNet.log'),
]

const ERROR_RE = /\b(error|exception|failed|fail|unhandled|not found|missing|could not|cannot load|crash)\b/i
const WARN_RE = /\b(warn|warning|deprecat|obsolete|skipp?ed|retry)\b/i

function classify(line: string): LogLevel {
  if (ERROR_RE.test(line)) return 'error'
  if (WARN_RE.test(line)) return 'warn'
  return 'info'
}

async function parseFile(abs: string, name: string): Promise<LogFile | null> {
  let raw: string
  let mtimeMs: number
  try {
    ;[raw, mtimeMs] = await Promise.all([
      fs.readFile(abs, 'utf8'),
      fs.stat(abs).then((s) => s.mtimeMs),
    ])
  } catch {
    return null
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-400)

  const entries: LogEntry[] = []
  let errors = 0
  let warns = 0
  for (const line of lines) {
    const level = classify(line)
    if (level === 'info') continue
    if (level === 'error') errors++
    else warns++
    entries.push({ level, text: line.slice(0, 400) })
  }

  return { name, mtimeMs, errors, warns, entries: entries.slice(-60) }
}

export async function readDiagnostics(gamePath: string): Promise<LogFile[]> {
  const out: LogFile[] = []
  for (const rel of CANDIDATES) {
    const abs = join(gamePath, rel)
    if (!(await pathExists(abs))) continue
    const parsed = await parseFile(abs, rel.split('\\').join('/'))
    if (parsed) out.push(parsed)
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}
