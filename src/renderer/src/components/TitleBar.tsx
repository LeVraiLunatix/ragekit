import { useState, type ReactNode } from 'react'
import { Globe, Loader2, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { Badge } from './ui'
import { Logo } from './Logo'

function OnlineSafeToggle(): ReactNode {
  const { t } = useI18n()
  const { config, setOnlineSafe } = useAppStore()
  const safe = !!config?.onlineSafeMode
  const [busy, setBusy] = useState(false)

  const flip = async (): Promise<void> => {
    if (busy) return
    if (!safe && (await window.api.online.isGameRunning())) {
      if (!confirm(t('online.gameRunning'))) return
    }
    setBusy(true)
    try {
      await setOnlineSafe(!safe)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={flip}
      disabled={busy || !config?.game?.valid}
      title={safe ? t('online.toStory') : t('online.toSafe')}
      className={cn(
        'no-drag flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-40',
        safe
          ? 'border-good/30 bg-good/12 text-good hover:bg-good/20'
          : 'border-line bg-bg-hover text-ink-soft hover:text-ink',
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : safe ? (
        <ShieldCheck className="size-3.5" />
      ) : (
        <Globe className="size-3.5" />
      )}
      {safe ? t('online.safeMode') : t('online.storyMode')}
    </button>
  )
}

export function TitleBar(): ReactNode {
  const { t } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)

  return (
    <header className="drag-region flex h-9 shrink-0 items-center gap-2 border-b border-line bg-bg px-3">
      <Logo size={17} />
      <span className="text-[13px] font-semibold tracking-tight">Ragekit</span>
      <div className="no-drag ml-2">
        {game?.valid ? (
          <Badge tone="good">{game.platform}</Badge>
        ) : (
          <Badge tone="warn">{t('titlebar.noGameFolder')}</Badge>
        )}
      </div>
      <div className="flex-1" />
      <OnlineSafeToggle />
    </header>
  )
}
