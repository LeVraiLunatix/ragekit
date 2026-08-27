import { useEffect, type ReactNode } from 'react'
import { CheckCircle2, Circle, ExternalLink, RefreshCw, Puzzle } from 'lucide-react'
import type { DependencyId } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, EmptyState } from '@/components/ui'

const LINKS: Record<DependencyId, string> = {
  scripthookv: 'http://www.dev-c.com/gtav/scripthookv/',
  scripthookvdotnet: 'https://github.com/scripthookvdotnet/scripthookvdotnet/releases',
  'openiv-asi': 'https://openiv.com/',
  'community-sh': 'https://github.com/scripthookvdotnet/scripthookvdotnet/releases',
}

export function DependenciesPage(): ReactNode {
  const { t } = useI18n()
  const { deps, config, refreshDeps } = useAppStore()

  useEffect(() => {
    if (config?.game?.valid) void refreshDeps()
  }, [config?.game?.valid, refreshDeps])

  if (!config?.game?.valid) {
    return (
      <Page title={t('deps.title')}>
        <EmptyState
          icon={<Puzzle className="size-7" />}
          title={t('deps.setFolderFirst')}
          hint={t('deps.setFolderHint')}
        />
      </Page>
    )
  }

  return (
    <Page
      title={t('deps.title')}
      subtitle={t('deps.subtitle')}
      actions={
        <Button size="sm" variant="ghost" onClick={() => refreshDeps()}>
          <RefreshCw className="size-3.5" />
          {t('deps.rescan')}
        </Button>
      }
    >
      <div className="space-y-2">
        {deps.map((d) => (
          <Card key={d.id} className="flex items-center gap-3 p-4">
            {d.installed ? (
              <CheckCircle2 className="size-5 shrink-0 text-good" />
            ) : (
              <Circle className="size-5 shrink-0 text-ink-faint" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(`deps.names.${d.id}`)}</p>
              <p className="truncate text-[12px] text-ink-faint">
                {d.installed ? t('deps.found', { detail: d.detail ?? '' }) : t('deps.notDetected')}
              </p>
            </div>
            {!d.installed && LINKS[d.id] && (
              <Button size="sm" onClick={() => window.api.misc.openExternal(LINKS[d.id])}>
                {t('deps.getIt')}
                <ExternalLink className="size-3.5" />
              </Button>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">{t('deps.hint')}</p>
    </Page>
  )
}
