import type { ReactNode } from 'react'
import { Gamepad2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Badge } from './ui'

export function TitleBar(): ReactNode {
  const { t } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)

  return (
    <header className="drag-region flex h-9 shrink-0 items-center gap-2 border-b border-line bg-bg px-3">
      <Gamepad2 className="size-4 text-brand" />
      <span className="text-[13px] font-semibold tracking-tight">GTAV Mod Manager</span>
      <div className="no-drag ml-2">
        {game?.valid ? (
          <Badge tone="good">{game.platform}</Badge>
        ) : (
          <Badge tone="warn">{t('titlebar.noGameFolder')}</Badge>
        )}
      </div>
      <div className="flex-1" />
    </header>
  )
}
