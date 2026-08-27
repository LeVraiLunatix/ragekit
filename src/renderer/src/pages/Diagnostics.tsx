import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Stethoscope, RefreshCw, AlertTriangle, AlertOctagon } from 'lucide-react'
import type { LogFile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'

export function DiagnosticsPage(): ReactNode {
  const { t, tc, relative } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)
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
  }, [game?.valid, load])

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
