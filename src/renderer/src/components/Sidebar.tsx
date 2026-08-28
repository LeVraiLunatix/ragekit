import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Boxes,
  PlusCircle,
  Layers,
  Rocket,
  Archive,
  Puzzle,
  Stethoscope,
  Settings,
  FolderOpen,
} from 'lucide-react'
import { useAppStore, type Route } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const ITEMS: Array<{ id: Route; key: string; icon: ReactNode }> = [
  { id: 'library', key: 'nav.library', icon: <Boxes className="size-[17px]" /> },
  { id: 'add', key: 'nav.add', icon: <PlusCircle className="size-[17px]" /> },
  { id: 'profiles', key: 'nav.profiles', icon: <Layers className="size-[17px]" /> },
  { id: 'launch', key: 'nav.launch', icon: <Rocket className="size-[17px]" /> },
  { id: 'archives', key: 'nav.archives', icon: <Archive className="size-[17px]" /> },
  { id: 'dependencies', key: 'nav.dependencies', icon: <Puzzle className="size-[17px]" /> },
  { id: 'diagnostics', key: 'nav.diagnostics', icon: <Stethoscope className="size-[17px]" /> },
  { id: 'settings', key: 'nav.settings', icon: <Settings className="size-[17px]" /> },
]

export function Sidebar(): ReactNode {
  const { t } = useI18n()
  const { route, setRoute, mods, config } = useAppStore()
  const installed = mods.filter((m) => m.status === 'installed').length

  return (
    <nav className="flex w-[212px] shrink-0 flex-col gap-0.5 border-r border-line bg-bg-raised p-3">
      {ITEMS.map((item) => {
        const active = route === item.id
        return (
          <button
            key={item.id}
            onClick={() => setRoute(item.id)}
            className={cn(
              'no-drag relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-faint hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 -z-10 rounded-lg border border-line bg-bg-hover"
              />
            )}
            <span className={active ? 'text-brand' : ''}>{item.icon}</span>
            {t(item.key)}
            {item.id === 'library' && mods.length > 0 && (
              <span className="ml-auto text-[11px] tabular-nums text-ink-faint">
                {installed}/{mods.length}
              </span>
            )}
          </button>
        )
      })}

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
