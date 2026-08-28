import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  PackageOpen,
  X,
  ExternalLink,
  HardDrive,
  FolderInput,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  FileCog,
  Trash2,
  Upload,
  Loader2,
  Boxes,
} from 'lucide-react'
import type {
  OivContentOp,
  OivInspection,
  OivInstallReport,
  OivOpKind,
  OivTarget,
} from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Button, Badge } from './ui'
import { cn } from '@/lib/utils'

type Phase = 'loading' | 'ready' | 'error' | 'installing' | 'done'

const KIND_ICON: Record<OivOpKind, ReactNode> = {
  add: <FileText className="size-3.5" />,
  replace: <FileCog className="size-3.5" />,
  delete: <Trash2 className="size-3.5" />,
  'xml-edit': <FileCog className="size-3.5" />,
}

function OpRow({ op }: { op: OivContentOp }): ReactNode {
  const { t } = useI18n()
  const kindLabel = t(`oiv.op.${op.kind === 'xml-edit' ? 'xmlEdit' : op.kind}`)
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 text-[12px]">
      <span className={cn('mt-0.5 shrink-0', op.supported ? 'text-ink-soft' : 'text-ink-faint')}>
        {KIND_ICON[op.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-soft">
          <span className="text-ink-faint">{kindLabel} · </span>
          {op.target}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
          {op.archive ? (
            <span className="rounded bg-bg-hover px-1 py-px font-mono">{op.archive}</span>
          ) : (
            <span>{t('oiv.looseFile')}</span>
          )}
          {op.size != null && <span>· {formatSize(op.size)}</span>}
        </p>
      </div>
      {op.supported ? (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-good">
          <Check className="size-3" /> {t('oiv.willApply')}
        </span>
      ) : (
        <span
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warn"
          title={op.reason}
        >
          <AlertTriangle className="size-3" /> {t('oiv.needsOpenIV')}
        </span>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TargetCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  badges,
  path,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  title: string
  subtitle: string
  badges?: ReactNode
  path: string
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'no-drag flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 ease-smooth',
        active
          ? 'border-brand/60 bg-brand/5 ring-1 ring-brand/30'
          : 'border-line bg-bg hover:border-ink-faint/50',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', active ? 'text-brand' : 'text-ink-faint')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
          {title}
          {badges}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">{subtitle}</span>
        <span className="mt-1 block truncate font-mono text-[10.5px] text-ink-faint/70">{path}</span>
      </span>
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
          active ? 'border-brand bg-brand text-black' : 'border-line',
        )}
      >
        {active && <Check className="size-2.5" strokeWidth={4} />}
      </span>
    </button>
  )
}

export function OivInstallDialog(): ReactNode {
  const path = useAppStore((s) => s.oivQueue[0] ?? null)
  const dequeueOiv = useAppStore((s) => s.dequeueOiv)
  const setRoute = useAppStore((s) => s.setRoute)
  const { t } = useI18n()

  const [phase, setPhase] = useState<Phase>('loading')
  const [info, setInfo] = useState<OivInspection | null>(null)
  const [err, setErr] = useState('')
  const [target, setTarget] = useState<OivTarget>('mods')
  const [progress, setProgress] = useState<number | null>(null)
  const [report, setReport] = useState<OivInstallReport | null>(null)

  useEffect(() => {
    if (!path) return
    let live = true
    setPhase('loading')
    setInfo(null)
    setReport(null)
    setProgress(null)
    setErr('')
    window.api.oiv
      .inspect(path)
      .then((res) => {
        if (!live) return
        setInfo(res)
        const rec = res.targets.find((x) => x.recommended) ?? res.targets[0]
        setTarget(rec?.id ?? 'game')
        setPhase('ready')
      })
      .catch((e) => {
        if (!live) return
        setErr(e instanceof Error ? e.message : String(e))
        setPhase('error')
      })
    return () => {
      live = false
    }
  }, [path])

  useEffect(() => {
    if (!path) return
    return window.api.on.taskProgress((p) => {
      if (p.taskId === `oiv:${path}`) setProgress(p.done ? 1 : p.progress)
    })
  }, [path])

  const close = (): void => {
    if (phase === 'installing') return
    dequeueOiv()
  }

  const doInstall = async (): Promise<void> => {
    if (!path || !info) return
    setPhase('installing')
    setProgress(0)
    try {
      const res = await window.api.oiv.install(path, target)
      setReport(res.report)
      setPhase('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const noGameFolder = useMemo(() => phase === 'ready' && info != null && info.targets.length === 0, [phase, info])

  if (!path) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onMouseDown={close}
      />
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative flex max-h-[86vh] w-[min(680px,100%)] flex-col overflow-hidden rounded-2xl border border-line bg-bg-card shadow-pop"
      >
        {/* Header */}
        <div className="flex items-start gap-3.5 border-b border-line p-4">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-bg">
            {info?.icon ? (
              <img src={info.icon} alt="" className="size-full object-cover" />
            ) : (
              <PackageOpen className="size-6 text-brand" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('oiv.installer')}
            </p>
            <h2 className="truncate text-[17px] font-semibold leading-tight text-ink">
              {info?.name ?? (phase === 'error' ? t('oiv.cantRead') : t('oiv.reading'))}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-faint">
              {info?.author && (
                <span className="inline-flex items-center gap-1">
                  {t('oiv.by', { author: info.author })}
                  {info.authorLink && (
                    <button
                      onClick={() => window.api.misc.openExternal(info.authorLink!)}
                      className="no-drag text-ink-faint hover:text-brand"
                    >
                      <ExternalLink className="size-3" />
                    </button>
                  )}
                </span>
              )}
              {info?.version && <span>· {t('oiv.version', { version: info.version })}</span>}
            </p>
          </div>
          <button
            onClick={close}
            disabled={phase === 'installing'}
            className="no-drag -m-1 shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-bg-hover hover:text-ink disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {phase === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-faint">
              <Loader2 className="size-4 animate-spin" /> {t('oiv.reading')}
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-xl border border-bad/25 bg-bad/10 p-3 text-[13px] text-bad">{err}</div>
          )}

          {info && phase !== 'loading' && phase !== 'error' && (
            <>
              {info.description && (
                <p className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-bg p-3 text-[12.5px] leading-relaxed text-ink-soft">
                  {info.description}
                </p>
              )}

              {/* Install target */}
              {noGameFolder ? (
                <div className="rounded-xl border border-warn/25 bg-warn/10 p-3 text-[13px] text-warn">
                  {t('oiv.needGameFolder')}
                </div>
              ) : (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {t('oiv.installTo')}
                  </p>
                  <div className="space-y-2">
                    {info.targets.map((tc) => (
                      <TargetCard
                        key={tc.id}
                        active={target === tc.id}
                        onClick={() => phase === 'ready' && setTarget(tc.id)}
                        icon={
                          tc.id === 'mods' ? (
                            <FolderInput className="size-5" />
                          ) : (
                            <HardDrive className="size-5" />
                          )
                        }
                        title={tc.id === 'mods' ? t('oiv.modsFolder') : t('oiv.gameFolder')}
                        subtitle={tc.id === 'mods' ? t('oiv.modsFolderSub') : t('oiv.gameFolderSub')}
                        path={tc.path}
                        badges={
                          <>
                            {tc.recommended && <Badge tone="brand">{t('oiv.recommended')}</Badge>}
                            {tc.id === 'mods' &&
                              (tc.exists ? (
                                <Badge tone="good">{t('oiv.detected')}</Badge>
                              ) : (
                                <Badge tone="neutral">{t('oiv.willCreate')}</Badge>
                              ))}
                          </>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Contents */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    <Boxes className="size-3.5" /> {t('oiv.contents')}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    {info.supported === info.total
                      ? t('oiv.allSupported', { total: info.total })
                      : t('oiv.supportedCount', { supported: info.supported, total: info.total })}
                  </p>
                </div>
                <div className="max-h-52 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line bg-bg">
                  {info.ops.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[12px] text-ink-faint">{t('oiv.noOps')}</p>
                  ) : (
                    info.ops.map((op, i) => <OpRow key={i} op={op} />)
                  )}
                </div>
                {info.supported < info.total && phase !== 'done' && (
                  <p className="mt-1.5 flex gap-1.5 text-[11px] text-ink-faint">
                    <AlertTriangle className="mt-px size-3 shrink-0" />
                    {t('oiv.skippedHint')}
                  </p>
                )}
              </div>

              {/* Result */}
              {phase === 'done' && report && (
                <div className="rounded-xl border border-line bg-bg p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <CheckCircle2 className="size-4 text-good" /> {t('oiv.resultTitle')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="good">{t('oiv.resultApplied', { applied: report.applied })}</Badge>
                    {report.skipped > 0 && (
                      <Badge tone="warn">{t('oiv.resultSkipped', { skipped: report.skipped })}</Badge>
                    )}
                    {report.failed > 0 && (
                      <Badge tone="bad">{t('oiv.resultFailed', { failed: report.failed })}</Badge>
                    )}
                  </div>
                  {report.results.some((r) => r.status !== 'applied') && (
                    <ul className="mt-2 space-y-1 text-[11px] text-ink-faint">
                      {report.results
                        .filter((r) => r.status !== 'applied')
                        .slice(0, 8)
                        .map((r, i) => (
                          <li key={i} className="flex gap-1.5">
                            {r.status === 'failed' ? (
                              <XCircle className="mt-px size-3 shrink-0 text-bad" />
                            ) : (
                              <AlertTriangle className="mt-px size-3 shrink-0 text-warn" />
                            )}
                            <span className="min-w-0">
                              <span className="font-mono">{r.target}</span>
                              {r.detail ? ` — ${r.detail}` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-line p-3">
          {phase === 'installing' ? (
            <div className="flex flex-1 items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-hover">
                <motion.div
                  className="h-full rounded-full bg-brand"
                  animate={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                  transition={{ ease: 'easeOut', duration: 0.3 }}
                />
              </div>
              <span className="text-[12px] text-ink-faint">{t('oiv.installing')}</span>
            </div>
          ) : (
            <div className="flex-1 text-[12px] text-ink-faint">
              {phase === 'done'
                ? t('oiv.doneHint')
                : info
                  ? info.supported === info.total
                    ? t('oiv.allSupported', { total: info.total })
                    : t('oiv.supportedCount', { supported: info.supported, total: info.total })
                  : ''}
            </div>
          )}

          {phase === 'done' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRoute('library')
                  close()
                }}
              >
                {t('oiv.openInLibrary')}
              </Button>
              <Button size="sm" variant="primary" onClick={close}>
                {t('oiv.close')}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={close} disabled={phase === 'installing'}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={phase === 'installing'}
                disabled={phase !== 'ready' || noGameFolder || (info?.supported ?? 0) === 0}
                onClick={doInstall}
              >
                <Upload className="size-3.5" />
                {t('oiv.install')}
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
