import { useState, type ReactNode } from 'react'
import { Gamepad2, Globe, Loader2, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Prominent "play with mods / play online without mods" switch. The small
 * titlebar pill mirrors this; this is the one you can't miss.
 */
export function GameModeCard(): ReactNode {
  const { t, tc } = useI18n()
  const { config, mods, setOnlineSafe } = useAppStore()
  const safe = !!config?.onlineSafeMode
  const hasGame = !!config?.game?.valid
  const [busy, setBusy] = useState<null | 'mods' | 'online'>(null)
  const installed = mods.filter((m) => m.status === 'installed').length

  const choose = async (wantSafe: boolean): Promise<void> => {
    if (busy || wantSafe === safe || !hasGame) return
    if (wantSafe && (await window.api.online.isGameRunning())) {
      if (!confirm(t('online.gameRunning'))) return
    }
    setBusy(wantSafe ? 'online' : 'mods')
    try {
      await setOnlineSafe(wantSafe)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('GAME_DIR_NOT_WRITABLE')) {
        if (confirm(`${t('admin.dialogTitle')}\n\n${t('admin.dialogBody')}`)) {
          const ok = await window.api.system.relaunchAdmin()
          if (!ok) alert(t('admin.devHint'))
        }
      } else {
        alert(msg)
      }
    } finally {
      setBusy(null)
    }
  }

  const Option = ({
    active,
    loading,
    onClick,
    icon,
    label,
    sub,
    tone,
  }: {
    active: boolean
    loading: boolean
    onClick: () => void
    icon: ReactNode
    label: string
    sub: string
    tone: 'brand' | 'good'
  }): ReactNode => (
    <button
      onClick={onClick}
      disabled={!hasGame || busy !== null}
      aria-pressed={active}
      className={cn(
        'no-drag flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed',
        active && tone === 'brand' && 'border-brand/50 bg-brand/10',
        active && tone === 'good' && 'border-good/40 bg-good/10',
        !active && 'border-line bg-bg-hover/40 hover:border-ink-faint/50 disabled:opacity-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-md',
          active && tone === 'brand' && 'bg-brand/20 text-brand-hi',
          active && tone === 'good' && 'bg-good/20 text-good',
          !active && 'bg-bg-hover text-ink-faint',
        )}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'flex items-center gap-1.5 text-[13px] font-semibold',
            active && tone === 'brand' && 'text-ink',
            active && tone === 'good' && 'text-good',
            !active && 'text-ink-soft',
          )}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">{sub}</span>
      </span>
    </button>
  )

  return (
    <Card className="mb-3 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {t('online.modeTitle')}
        </span>
        {safe && installed >= 0 && (
          <span className="text-[11px] text-good">{t('online.parked', { count: String(installed) })}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Option
          active={!safe}
          loading={busy === 'mods'}
          onClick={() => void choose(false)}
          icon={<Gamepad2 className="size-4" />}
          label={t('online.withMods')}
          sub={`${t('online.withModsSub')}${installed > 0 ? ` · ${tc('library.count', installed)}` : ''}`}
          tone="brand"
        />
        <Option
          active={safe}
          loading={busy === 'online'}
          onClick={() => void choose(true)}
          icon={safe ? <ShieldCheck className="size-4" /> : <Globe className="size-4" />}
          label={t('online.withoutMods')}
          sub={t('online.withoutModsSub')}
          tone="good"
        />
      </div>
      {!hasGame && (
        <p className="mt-2 px-1 text-[11px] text-warn">{t('online.needGame')}</p>
      )}
    </Card>
  )
}
