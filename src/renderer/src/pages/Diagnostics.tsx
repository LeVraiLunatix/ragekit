import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Stethoscope, RefreshCw, AlertTriangle, AlertOctagon, Clock } from 'lucide-react'
import type { LogFile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'

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
  const lastLaunchAt = useAppStore((s) => s.lastLaunch?.startedAt)
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
  }, [game?.valid, load, lastLaunchAt])

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
        <Button size="sm" variant="ghost" loading={loading} onClick={load}>
          <RefreshCw className="size-3.5" />
          {t('diag.refresh')}
        </Button>
      }
    >
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
