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
  Clock,
  ShieldCheck,
} from 'lucide-react'
import type { LaunchReport, LogFile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'

function LaunchCard({ report }: { report: LaunchReport }): ReactNode {
  const { t, relative } = useI18n()
  const [showOut, setShowOut] = useState(false)

  const outcome: { tone: 'good' | 'bad' | 'warn'; icon: ReactNode; label: string } = report.spawnError
    ? { tone: 'bad', icon: <XCircle className="size-3" />, label: t('launch.failed') }
    : report.stillRunning
      ? { tone: 'good', icon: <CheckCircle2 className="size-3" />, label: t('launch.running') }
      : report.crashEvents.length > 0 || report.werReports.length > 0
        ? { tone: 'bad', icon: <XCircle className="size-3" />, label: t('launch.crashedEarly') }
        : { tone: 'warn', icon: <AlertTriangle className="size-3" />, label: t('launch.notStarted') }

  const noSignal =
    !report.spawnError &&
    !report.stillRunning &&
    report.crashEvents.length === 0 &&
    report.werReports.length === 0
  const hasOutput = report.stdout.length > 0 || report.stderr.length > 0

  return (
    <Card className="mb-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Play className="size-4 shrink-0 text-brand" />
        <p className="text-sm font-semibold">{t('launch.title')}</p>
        <Badge tone={outcome.tone}>
          {outcome.icon} {outcome.label}
        </Badge>
        {report.safeMode && (
          <Badge tone="good">
            <ShieldCheck className="size-3" /> {t('launch.vanillaBadge')}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-ink-faint">
          {t('launch.exe', { exe: report.exe })} · {relative(report.startedAt)}
        </span>
      </div>

      {report.safeMode && (
        <p
          className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${
            report.stillRunning
              ? 'border-good/25 bg-good/10 text-good'
              : 'border-warn/25 bg-warn/10 text-warn'
          }`}
        >
          {report.stillRunning ? t('launch.vanillaOkHint') : t('launch.vanillaCrashedHint')}
        </p>
      )}

      {report.spawnError && (
        <p className="mt-2 rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 font-mono text-[11px] text-bad">
          {report.spawnError}
        </p>
      )}

      {noSignal && (
        <p className="mt-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          {t('launch.notStartedHint')}
        </p>
      )}

      {/* Windows Error Reporting — names the fault module even with no event. */}
      {report.werReports.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {report.werReports.map((w, i) => (
            <li key={i} className="text-[12px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <Bug className="size-3.5 shrink-0 text-bad" />
                <span className="font-medium text-bad">
                  {w.faultModule
                    ? t('launch.faultingModule', { mod: w.faultModule })
                    : `WER · ${w.appName}`}
                </span>
                {w.exceptionCode && (
                  <span className="font-mono text-[11px] text-ink-faint">
                    {t('launch.exceptionCode', { code: w.exceptionCode })}
                  </span>
                )}
                <span className="text-[10px] text-ink-faint">
                  {t('launch.eventAt', { time: relative(w.time) })}
                </span>
              </div>
              <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap pl-5 font-mono text-[10.5px] leading-relaxed text-ink-faint">
                {w.signatures.join('\n')}
              </pre>
            </li>
          ))}
        </ul>
      )}

      {report.crashEvents.length > 0 && (
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
      )}

      {report.gameConfig.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t('launch.gameConfig')}
          </p>
          <div className="mt-1 space-y-1">
            {report.gameConfig.map((c) => (
              <div key={c.name} className="flex gap-2 text-[11px]">
                <span className="shrink-0 font-mono text-ink-faint">{c.name}</span>
                <span className="min-w-0 break-all font-mono text-ink-soft">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
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

function LogCard({ file }: { file: LogFile }): ReactNode {
  const { t, tc, relative } = useI18n()
  const [mode, setMode] = useState<'raw' | 'issues'>(file.errors > 0 ? 'issues' : 'raw')

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[13px]">{file.name}</p>
        {file.stale && (
          <Badge tone="warn">
            <Clock className="size-3" /> {t('diag.stale')}
          </Badge>
        )}
        {file.errors > 0 && (
          <Badge tone="bad">
            <AlertOctagon className="size-3" /> {tc('diag.errors', file.errors)}
          </Badge>
        )}
        {file.warns > 0 && (
          <Badge tone="warn">
            <AlertTriangle className="size-3" /> {tc('diag.warns', file.warns)}
          </Badge>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
        <span>{t('diag.updated', { time: relative(new Date(file.mtimeMs).toISOString()) })}</span>
        {file.errors > 0 && (
          <button
            onClick={() => setMode((m) => (m === 'raw' ? 'issues' : 'raw'))}
            className="no-drag underline decoration-dotted hover:text-ink"
          >
            {mode === 'raw' ? t('diag.showIssues') : t('diag.showAll')}
          </button>
        )}
      </div>

      {mode === 'issues' && file.entries.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {file.entries.map((e, i) => (
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
      ) : file.raw ? (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line pt-2 font-mono text-[11px] leading-relaxed text-ink-soft">
          {file.raw}
        </pre>
      ) : (
        <p className="mt-2 text-[12px] text-ink-faint">{t('diag.noEntries')}</p>
      )}
    </Card>
  )
}

export function DiagnosticsPage(): ReactNode {
  const { t } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)
  const lastLaunch = useAppStore((s) => s.lastLaunch)
  const launching = useAppStore((s) => s.launching)
  const launchGame = useAppStore((s) => s.launchGame)
  const launchVanilla = useAppStore((s) => s.launchVanilla)
  const [files, setFiles] = useState<LogFile[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, relaunch] = await Promise.all([
        window.api.diagnostics.read(),
        window.api.game.recheckLaunch(),
      ])
      setFiles(f)
      if (relaunch) useAppStore.setState({ lastLaunch: relaunch })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (game?.valid) void load()
    // re-run when a *new* launch happens, not on every recheck merge
  }, [game?.valid, load, lastLaunch?.startedAt])

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
          <Button
            size="sm"
            variant="outline"
            disabled={launching}
            onClick={() => void launchVanilla()}
          >
            <ShieldCheck className="size-3.5" />
            {t('launch.vanillaButton')}
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
            <LogCard key={f.name} file={f} />
          ))}
        </div>
      )}
    </Page>
  )
}
