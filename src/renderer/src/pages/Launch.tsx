import { useState, type ReactNode } from 'react'
import {
  Play,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bug,
  Rocket,
} from 'lucide-react'
import type { LaunchReport } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'

function Dot(): ReactNode {
  return <span className="text-ink-faint/50">·</span>
}

function CrashRow({
  label,
  code,
  at,
  detail,
  muted,
}: {
  label: string
  code?: string
  at: string
  detail: string
  muted?: boolean
}): ReactNode {
  return (
    <li className="text-[12px]">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Bug className="size-3.5 shrink-0 text-bad" />
        <span className={muted ? 'font-medium text-ink-soft' : 'font-medium text-bad'}>{label}</span>
        {code && (
          <>
            <Dot />
            <span className="font-mono text-[11px] text-ink-faint">{code}</span>
          </>
        )}
        <Dot />
        <span className="text-[10px] text-ink-faint">{at}</span>
      </div>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg/40 p-2 font-mono text-[10.5px] leading-relaxed text-ink-faint">
        {detail}
      </pre>
    </li>
  )
}

function LaunchReportCard({ report }: { report: LaunchReport }): ReactNode {
  const { t, relative } = useI18n()
  const [showOut, setShowOut] = useState(false)

  const crashEvents = report.crashEvents ?? []
  const werReports = report.werReports ?? []
  const gameConfig = report.gameConfig ?? []
  const crashed = crashEvents.length > 0 || werReports.length > 0

  const outcome: { tone: 'good' | 'bad' | 'warn'; icon: ReactNode; label: string } = report.spawnError
    ? { tone: 'bad', icon: <XCircle className="size-3" />, label: t('launch.failed') }
    : report.stillRunning
      ? { tone: 'good', icon: <CheckCircle2 className="size-3" />, label: t('launch.running') }
      : crashed
        ? { tone: 'bad', icon: <XCircle className="size-3" />, label: t('launch.crashedEarly') }
        : { tone: 'warn', icon: <AlertTriangle className="size-3" />, label: t('launch.notStarted') }

  const noSignal = !report.spawnError && !report.stillRunning && !crashed
  const hasOutput = (report.stdout?.length ?? 0) > 0 || (report.stderr?.length ?? 0) > 0

  return (
    <Card className="p-4">
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

      {noSignal && !report.safeMode && (
        <p className="mt-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          {t('launch.notStartedHint')}
        </p>
      )}

      {(werReports.length > 0 || crashEvents.length > 0) && (
        <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
          {werReports.map((w, i) => (
            <CrashRow
              key={`w${i}`}
              label={
                w.faultModule
                  ? t('launch.faultingModule', { mod: w.faultModule })
                  : `WER · ${w.appName}`
              }
              code={w.exceptionCode}
              at={t('launch.eventAt', { time: relative(w.time) })}
              detail={w.signatures.join('\n')}
            />
          ))}
          {crashEvents.map((e, i) => (
            <CrashRow
              key={`c${i}`}
              label={
                e.faultingModule ? t('launch.faultingModule', { mod: e.faultingModule }) : e.provider
              }
              muted={!e.faultingModule}
              code={e.exceptionCode}
              at={t('launch.eventAt', { time: relative(e.time) })}
              detail={e.summary}
            />
          ))}
        </ul>
      )}

      {gameConfig.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t('launch.gameConfig')}
          </p>
          <div className="mt-1 space-y-1">
            {gameConfig.map((c) => (
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
    </Card>
  )
}

export function LaunchPage(): ReactNode {
  const { t } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)
  const lastLaunch = useAppStore((s) => s.lastLaunch)
  const launching = useAppStore((s) => s.launching)
  const launchGame = useAppStore((s) => s.launchGame)
  const launchVanilla = useAppStore((s) => s.launchVanilla)

  return (
    <Page
      title={t('launchPage.title')}
      subtitle={t('launchPage.subtitle')}
      actions={
        <>
          <Button
            size="sm"
            variant="primary"
            loading={launching}
            disabled={!game?.valid}
            onClick={() => void launchGame()}
          >
            <Play className="size-3.5" />
            {launching ? t('launch.launching') : t('launch.button')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={launching || !game?.valid}
            onClick={() => void launchVanilla()}
          >
            <ShieldCheck className="size-3.5" />
            {t('launch.vanillaButton')}
          </Button>
        </>
      }
    >
      {!game?.valid ? (
        <EmptyState icon={<Rocket className="size-7" />} title={t('diag.setFolderFirst')} />
      ) : lastLaunch ? (
        <LaunchReportCard report={lastLaunch} />
      ) : (
        <EmptyState
          icon={<Rocket className="size-7" />}
          title={t('launchPage.emptyTitle')}
          hint={t('launchPage.emptyHint')}
          action={
            <Button variant="primary" loading={launching} onClick={() => void launchGame()}>
              <Play className="size-4" />
              {t('launch.button')}
            </Button>
          }
        />
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint/80">{t('launch.hint')}</p>
    </Page>
  )
}
