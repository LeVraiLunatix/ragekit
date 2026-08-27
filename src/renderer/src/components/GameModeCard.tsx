import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Gamepad2,
  Globe,
  Loader2,
  ShieldCheck,
  ScanSearch,
  ListTree,
  TriangleAlert,
} from 'lucide-react'
import type { NonVanillaScan, OnlineStatus } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Button, Card } from '@/components/ui'
import { cn, formatBytes } from '@/lib/utils'

/**
 * "How you play" switch — Story Mode (mods on) vs Online-safe (vanilla) — plus a
 * GTA V Mod Remove Tool-style section: index the clean game once, then the
 * switch moves out *everything* that isn't vanilla, not just known loaders.
 */
export function GameModeCard(): ReactNode {
  const { t, tc, relative } = useI18n()
  const { config, mods, setOnlineSafe } = useAppStore()
  const safe = !!config?.onlineSafeMode
  const hasGame = !!config?.game?.valid
  const [busy, setBusy] = useState<null | 'mods' | 'online'>(null)
  const [indexing, setIndexing] = useState(false)
  const [status, setStatus] = useState<OnlineStatus | null>(null)
  const [scan, setScan] = useState<NonVanillaScan | null>(null)
  const [showList, setShowList] = useState(false)
  const installed = mods.filter((m) => m.status === 'installed').length

  const refresh = useCallback(async () => {
    if (!hasGame) {
      setStatus(null)
      setScan(null)
      return
    }
    setStatus(await window.api.online.status())
    if (!safe) {
      try {
        setScan(await window.api.online.scan())
      } catch {
        setScan(null)
      }
    } else {
      setScan(null)
    }
  }, [hasGame, safe])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleErr = async (err: unknown): Promise<void> => {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('GAME_DIR_NOT_WRITABLE')) {
      if (confirm(`${t('admin.dialogTitle')}\n\n${t('admin.dialogBody')}`)) {
        const ok = await window.api.system.relaunchAdmin()
        if (!ok) alert(t('admin.devHint'))
      }
    } else {
      alert(msg)
    }
  }

  const choose = async (wantSafe: boolean): Promise<void> => {
    if (busy || wantSafe === safe || !hasGame) return
    if (wantSafe && (await window.api.online.isGameRunning())) {
      if (!confirm(t('online.gameRunning'))) return
    }
    setBusy(wantSafe ? 'online' : 'mods')
    try {
      await setOnlineSafe(wantSafe)
      await refresh()
    } catch (err) {
      await handleErr(err)
    } finally {
      setBusy(null)
    }
  }

  const buildIndex = async (): Promise<void> => {
    setIndexing(true)
    try {
      setStatus(await window.api.online.buildIndex())
      await refresh()
    } catch (err) {
      await handleErr(err)
    } finally {
      setIndexing(false)
    }
  }

  const clearIndex = async (): Promise<void> => {
    setStatus(await window.api.online.clearIndex())
    await refresh()
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

  const items = scan?.items ?? []

  return (
    <Card className="mb-3 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {t('online.modeTitle')}
        </span>
        {safe && status && (
          <span className="text-[11px] text-good">
            {t('online.parked', { count: status.parkedCount })}
          </span>
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

      {!hasGame ? (
        <p className="mt-2 px-1 text-[11px] text-warn">{t('online.needGame')}</p>
      ) : (
        <div className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
            <ScanSearch className="size-3.5 shrink-0 text-ink-faint" />
            <span className="font-medium text-ink-soft">{t('online.sweepTitle')}</span>
            {!safe && scan && (
              <span className="text-ink-faint">
                {items.length === 0
                  ? t('online.scanClean')
                  : t('online.scanFound', { count: items.length })}
                {' · '}
                {scan.usingIndex ? t('online.scanExact') : t('online.scanHeuristic')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-1">
            {status?.hasIndex ? (
              <>
                <span className="text-ink-faint">
                  {t('online.indexReady', {
                    count: status.indexCount ?? 0,
                    time: status.indexTakenAt ? relative(status.indexTakenAt) : '?',
                  })}
                </span>
                <button
                  onClick={() => void clearIndex()}
                  className="no-drag text-ink-faint underline decoration-dotted hover:text-ink"
                >
                  {t('online.indexClear')}
                </button>
              </>
            ) : (
              <>
                <span className="text-ink-faint">{t('online.indexNone')}</span>
                <Button size="sm" variant="outline" loading={indexing} onClick={() => void buildIndex()}>
                  <ScanSearch className="size-3.5" />
                  {indexing ? t('online.indexBuilding') : t('online.indexBuild')}
                </Button>
              </>
            )}
          </div>

          {!status?.hasIndex && (
            <p className="px-1 text-[11px] text-ink-faint/80">{t('online.indexHint')}</p>
          )}

          {!safe && scan && scan.modifiedStock.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-warn">
              <TriangleAlert className="size-3.5 shrink-0" />
              {t('online.modifiedStock', { count: scan.modifiedStock.length })}
            </p>
          )}

          {!safe && items.length > 0 && (
            <div className="px-1">
              <button
                onClick={() => setShowList((v) => !v)}
                className="no-drag inline-flex items-center gap-1 text-ink-faint hover:text-ink"
              >
                <ListTree className="size-3.5" />
                {showList ? t('online.hideList') : t('online.showList')}
              </button>
              {showList && (
                <ul className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-line bg-bg/40 p-1.5">
                  {items.map((it) => (
                    <li key={it.rel} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">
                        {it.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft">
                        {it.rel}
                        {it.isDir ? '/' : ''}
                      </span>
                      {it.size >= 0 && (
                        <span className="shrink-0 text-[10px] text-ink-faint">
                          {formatBytes(it.size)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
