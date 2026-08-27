import type { ReactNode } from 'react'
import { Boxes, PlusCircle, Puzzle, Settings, FolderOpen } from 'lucide-react'
import { useAppStore, type Route } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const ITEMS: Array<{ id: Route; label: string; icon: ReactNode }> = [
  { id: 'library', label: 'Library', icon: <Boxes className="size-4" /> },
  { id: 'add', label: 'Add mods', icon: <PlusCircle className="size-4" /> },
  { id: 'dependencies', label: 'Dependencies', icon: <Puzzle className="size-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="size-4" /> },
]

export function Sidebar(): ReactNode {
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
          {item.label}
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
        Open game folder
      </button>
      <p className="px-3 pt-1 text-[10px] leading-tight text-ink-faint/70">
        Single-player only. Never load mods in GTA Online.
      </p>
    </nav>
  )
}
