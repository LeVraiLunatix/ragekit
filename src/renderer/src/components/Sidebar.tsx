import type { ReactNode } from 'react'
import { Boxes, PlusCircle, Layers, Puzzle, Stethoscope, Settings, FolderOpen } from 'lucide-react'
import { useAppStore, type Route } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const ITEMS: Array<{ id: Route; key: string; icon: ReactNode }> = [
  { id: 'library', key: 'nav.library', icon: <Boxes className="size-4" /> },
  { id: 'add', key: 'nav.add', icon: <PlusCircle className="size-4" /> },
  { id: 'profiles', key: 'nav.profiles', icon: <Layers className="size-4" /> },
  { id: 'dependencies', key: 'nav.dependencies', icon: <Puzzle className="size-4" /> },
  { id: 'diagnostics', key: 'nav.diagnostics', icon: <Stethoscope className="size-4" /> },
  { id: 'settings', key: 'nav.settings', icon: <Settings className="size-4" /> },
]

export function Sidebar(): ReactNode {
  const { t } = useI18n()
  const { route, setRoute, mods, config } = useAppStore()
  const installed = mods.filter((m) => m.status === 'installed').length

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-line bg-bg-raised p-3">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => setRoute(item.id)}
          className={cn(
            'no-drag flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
            route === item.id
              ? 'bg-bg-hover text-ink'
              : 'text-ink-soft hover:bg-bg-hover/60 hover:text-ink',
          )}
        >
          {item.icon}
          {t(item.key)}
          {item.id === 'library' && mods.length > 0 && (
            <span className="ml-auto text-[11px] text-ink-faint">
              {installed}/{mods.length}
            </span>
          )}
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => window.api.misc.openGameFolder()}
        disabled={!config?.game?.valid}
        className="no-drag flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-ink-faint transition-colors hover:bg-bg-hover hover:text-ink-soft disabled:opacity-40"
      >
        <FolderOpen className="size-3.5" />
        {t('nav.openGameFolder')}
      </button>
      <p className="px-3 pt-1 text-[10px] leading-tight text-ink-faint/70">{t('nav.disclaimer')}</p>
    </nav>
  )
}
