import { useEffect, type ReactNode } from 'react'
import { CheckCircle2, Circle, ExternalLink, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Page } from '@/components/Page'
import { Button, Card, EmptyState } from '@/components/ui'
import { Puzzle } from 'lucide-react'

const LINKS: Record<string, string> = {
  scripthookv: 'http://www.dev-c.com/gtav/scripthookv/',
  scripthookvdotnet: 'https://github.com/scripthookvdotnet/scripthookvdotnet/releases',
  'openiv-asi': 'https://openiv.com/',
  'community-sh': 'https://github.com/scripthookvdotnet/scripthookvdotnet/releases',
}

export function DependenciesPage(): ReactNode {
  const { deps, config, refreshDeps } = useAppStore()

  useEffect(() => {
    if (config?.game?.valid) void refreshDeps()
  }, [config?.game?.valid, refreshDeps])

  if (!config?.game?.valid) {
    return (
      <Page title="Dependencies">
        <EmptyState
          icon={<Puzzle className="size-7" />}
          title="Set your game folder first"
          hint="Dependencies are detected inside the GTA V install."
        />
      </Page>
    )
  }

  return (
    <Page
      title="Dependencies"
      subtitle="Runtimes that mods rely on. Install the missing ones from their official pages."
      actions={
        <Button size="sm" variant="ghost" onClick={() => refreshDeps()}>
          <RefreshCw className="size-3.5" />
          Rescan
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
              <p className="text-sm font-medium">{d.name}</p>
              <p className="truncate text-[12px] text-ink-faint">
                {d.installed ? `Found: ${d.detail}` : 'Not detected'}
              </p>
            </div>
            {!d.installed && LINKS[d.id] && (
              <Button size="sm" onClick={() => window.api.misc.openExternal(LINKS[d.id])}>
                Get it
                <ExternalLink className="size-3.5" />
              </Button>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
        After downloading Script Hook V, drop <span className="font-mono text-ink">ScriptHookV.dll</span>{' '}
        and <span className="font-mono text-ink">dinput8.dll</span> into your game folder, then hit
        Rescan.
      </p>
    </Page>
  )
}
