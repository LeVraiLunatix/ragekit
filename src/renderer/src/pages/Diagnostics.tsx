import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  AlertOctagon,
  Play,
  CheckCircle2,
  XCircle,
  Bug,
} from 'lucide-react'
import type { LaunchReport, LogFile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'

/** GTA5 crash codes are big unsigned hex values; small ones are plain. */
function fmtExit(code: number): string {
  if (code < 0) code = code >>> 0
  return code > 255 ? `0x${code.toString(16).toUpperCase().padStart(8, '0')}` : String(code)
}

function LaunchCard({ report }: { report: LaunchReport }): ReactNode {
  const { t, relative } = useI18n()
  const [showOut, setShowOut] = useState(false)

  const outcome: { tone: 'good' | 'bad' | 'neutral'; icon: ReactNode; label: string } = report
    .spawnError
    ? { tone: 'bad', icon: <XCircle className="size-3" />, label: t('launch.failed') }
    : report.stillRunning
      ? { tone: 'good', icon: <CheckCircle2 className="size-3" />, label: t('launch.ok') }
      : report.exitCode === 0
        ? { tone: 'neutral', icon: <CheckCircle2 className="size-3" />, label: t('launch.cleanExit') }
        : {
            tone: 'bad',
            icon: <XCircle className="size-3" />,
            label: t('launch.crashed', { code: fmtExit(report.exitCode ?? 0) }),
          }

  const hasOutput = report.stdout.length > 0 || report.stderr.length > 0

  return (
    <Card className="mb-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Play className="size-4 shrink-0 text-brand" />
        <p className="text-sm font-semibold">{t('launch.title')}</p>
        <Badge tone={outcome.tone}>
          {outcome.icon} {outcome.label}
        </Badge>
        <span className="ml-auto text-[11px] text-ink-faint">
          {t('launch.exe', { exe: report.exe })} · {relative(report.startedAt)}
        </span>
      </div>

      {report.spawnError && (
        <p className="mt-2 rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 font-mono text-[11px] text-bad">
          {report.spawnError}
        </p>
      )}

      {report.crashEvents.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {report.crashEvents.map((e, i) => (
            <li key={i} className="text-[12px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Bug className="size-3.5 shrink-0 text-bad" />
                {e.faultingModule ? (
                  <span className="font-medium text-bad">
                    {t('launch.faultingModule', { mod: e.faultingModule })}
                  </span>
                ) : (
                  <span className="font-medium text-ink-soft">{e.provider}</span>
                )}
                {e.exceptionCode && (
                  <span className="font-mono text-[11px] text-ink-faint">
                    {t('launch.exceptionCode', { code: e.exceptionCode })}
                  </span>
                )}
                <span className="text-[10px] text-ink-faint">
                  {t('launch.eventAt', { time: relative(e.time) })}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words pl-5 font-mono text-[10.5px] leading-relaxed text-ink-faint">
                {e.summary}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !report.stillRunning &&
        report.exitCode !== 0 && (
          <p className="mt-2 text-[12px] text-ink-faint">{t('launch.noCrashEvents')}</p>
        )
      )}

      {hasOutput && (
        <div className="mt-2">
          <button
            onClick={() => setShowOut((v) => !v)}
            className="no-drag text-[11px] text-ink-faint underline decoration-dotted hover:text-ink"
          >
            {t('launch.output')}
          </button>
          {showOut && (
            <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-line bg-bg/50 p-2 font-mono text-[10.5px] text-ink-soft">
              {[report.stdout, report.stderr].filter(Boolean).join('\n---\n')}
            </pre>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint/80">{t('launch.hint')}</p>
    </Card>
  )
}

export function DiagnosticsPage(): ReactNode {
  const { t, tc, relative } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)
  const lastLaunch = useAppStore((s) => s.lastLaunch)
  const launching = useAppStore((s) => s.launching)
  const launchGame = useAppStore((s) => s.launchGame)
  const [files, setFiles] = useState<LogFile[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setFiles(await window.api.diagnostics.read())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (game?.valid) void load()
  }, [game?.valid, load, lastLaunch])

  if (!game?.valid) {
    return (
      <Page title={t('diag.title')}>
        <EmptyState icon={<Stethoscope className="size-7" />} title={t('diag.setFolderFirst')} />
      </Page>
    )
  }

  return (
    <Page
      title={t('diag.title')}
      subtitle={t('diag.subtitle')}
      actions={
        <>
          <Button size="sm" variant="primary" loading={launching} onClick={() => void launchGame()}>
            <Play className="size-3.5" />
            {launching ? t('launch.launching') : t('launch.button')}
          </Button>
          <Button size="sm" variant="ghost" loading={loading} onClick={load}>
            <RefreshCw className="size-3.5" />
            {t('diag.refresh')}
          </Button>
        </>
      }
    >
      {lastLaunch && <LaunchCard report={lastLaunch} />}

      {files.length === 0 ? (
        <EmptyState icon={<Stethoscope className="size-7" />} title={t('diag.none')} />
      ) : (
        <div className="space-y-3">
          {files.map((f) => (
            <Card key={f.name} className="p-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate font-mono text-[13px]">{f.name}</p>
                {f.errors > 0 && (
                  <Badge tone="bad">
                    <AlertOctagon className="size-3" /> {tc('diag.errors', f.errors)}
                  </Badge>
                )}
                {f.warns > 0 && (
                  <Badge tone="warn">
                    <AlertTriangle className="size-3" /> {tc('diag.warns', f.warns)}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {t('diag.updated', { time: relative(new Date(f.mtimeMs).toISOString()) })}
              </p>

              {f.entries.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink-faint">{t('diag.noEntries')}</p>
              ) : (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {f.entries.map((e, i) => (
                    <li
                      key={i}
                      className={`whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed ${
                        e.level === 'error' ? 'text-bad' : 'text-warn'
                      }`}
                    >
                      {e.text}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </Page>
  )
}
