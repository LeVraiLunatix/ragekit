import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Boxes,
  FolderOpen,
  Trash2,
  PlusCircle,
  PackageOpen,
  FileBox,
  SearchCheck,
  ChevronDown,
  ChevronUp,
  TriangleAlert,
  RefreshCw,
  ArrowUpCircle,
  Search,
  Power,
} from 'lucide-react'
import type { FoundMod, Mod } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { GameModeCard } from '@/components/GameModeCard'
import { Button, Card, Badge, Toggle, EmptyState } from '@/components/ui'

type SortKey = 'order' | 'name' | 'recent' | 'status' | 'type'
type FilterKey = 'all' | 'installed' | 'disabled' | 'updates'

/** Small localStorage-backed state so the sort/filter choice sticks. */
function usePersisted<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial
    } catch {
      return initial
    }
  })
  const set = (next: T): void => {
    setV(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      /* private mode */
    }
  }
  return [v, set]
}

function StatusBadge({ status }: { status: Mod['status'] }): ReactNode {
  const { t } = useI18n()
  if (status === 'installed') return <Badge tone="good">{t('library.status.installed')}</Badge>
  if (status === 'disabled') return <Badge tone="neutral">{t('library.status.disabled')}</Badge>
  if (status === 'error') return <Badge tone="bad">{t('library.status.error')}</Badge>
  return <Badge tone="neutral">{t('library.status.notInstalled')}</Badge>
}

function ScanBanner(): ReactNode {
  const { t, tc } = useI18n()
  const { config, refreshMods, refreshDeps } = useAppStore()
  const [found, setFound] = useState<FoundMod[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (config?.game?.valid) void window.api.mods.scan().then(setFound)
  }, [config?.game?.valid])

  if (dismissed || found.length === 0) return null

  const adoptAll = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.mods.adopt(found)
      await Promise.all([refreshMods(), refreshDeps()])
      setFound([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-3 border-brand/25 bg-brand/[0.06] p-4">
      <div className="flex items-center gap-3">
        <SearchCheck className="size-5 shrink-0 text-brand-hi" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{tc('scan.title', found.length)}</p>
          <p className="text-[12px] text-ink-faint">{t('scan.body')}</p>
        </div>
        <Button size="sm" variant="primary" loading={busy} onClick={adoptAll}>
          {t('scan.adoptAll')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          {t('scan.dismiss')}
        </Button>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="no-drag mt-2 flex items-center gap-1 text-[12px] text-ink-faint hover:text-ink-soft"
      >
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {found.length}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[12px]">
          {found.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-ink-soft">
              <span className="text-ink-faint">{t(`scan.kind.${f.kind}`)}</span>
              <span className="truncate font-mono text-[11px]">{f.relPath}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ModRow({
  mod,
  locked,
  sortable,
  conflictWith,
  hasUpdate,
  canMoveUp,
  canMoveDown,
}: {
  mod: Mod
  locked: boolean
  sortable: boolean
  conflictWith: string[]
  hasUpdate: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}): ReactNode {
  const { t, tc, relative } = useI18n()
  const { refreshMods, refreshDeps } = useAppStore()
  const [busy, setBusy] = useState(false)
  const enabled = mod.status === 'installed'

  const move = (direction: 'up' | 'down'): void => {
    void window.api.mods.move(mod.id, direction).then(() => Promise.all([refreshMods(), refreshDeps()]))
  }

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.mods.setEnabled(mod.id, !enabled)
      await Promise.all([refreshMods(), refreshDeps()])
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
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!confirm(t('library.removeConfirm', { name: mod.name }))) return
    setBusy(true)
    try {
      await window.api.mods.remove(mod.id)
      await Promise.all([refreshMods(), refreshDeps()])
    } finally {
      setBusy(false)
    }
  }

  const showArrows = enabled && !locked && sortable

  return (
    <Card className="flex items-center gap-3 p-4">
      {showArrows ? (
        <div className="flex flex-col">
          <button
            onClick={() => move('up')}
            disabled={!canMoveUp}
            title={t('library.moveUp')}
            className="no-drag text-ink-faint hover:text-ink disabled:opacity-25"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            onClick={() => move('down')}
            disabled={!canMoveDown}
            title={t('library.moveDown')}
            className="no-drag text-ink-faint hover:text-ink disabled:opacity-25"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      ) : (
        enabled && !locked && <div className="w-4 shrink-0" />
      )}
      <Toggle checked={enabled} onChange={toggle} disabled={busy || locked} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{mod.name}</p>
          {mod.kind === 'oiv' ? (
            <PackageOpen className="size-3.5 shrink-0 text-ink-faint" />
          ) : (
            <FileBox className="size-3.5 shrink-0 text-ink-faint" />
          )}
          {mod.tags.includes('adopted') && <Badge tone="neutral">adopted</Badge>}
          {hasUpdate && (
            <button
              onClick={() => mod.sourceUrl && window.api.misc.openExternal(mod.sourceUrl)}
              className="no-drag inline-flex items-center gap-1 text-brand-hi"
              title={t('remote.updateAvailable')}
            >
              <ArrowUpCircle className="size-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {t('remote.updateAvailable')}
              </span>
            </button>
          )}
          {conflictWith.length > 0 && (
            <span
              title={t('library.conflictHint', { mods: conflictWith.join(', ') })}
              className="inline-flex items-center gap-1 text-warn"
            >
              <TriangleAlert className="size-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {t('library.conflict')}
              </span>
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-ink-faint">
          {[
            mod.author,
            mod.version && `v${mod.version}`,
            t('library.addedAgo', { time: relative(mod.addedAt) }),
            mod.installedFiles.length > 0 && tc('library.files', mod.installedFiles.length),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <StatusBadge status={mod.status} />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => window.api.mods.openFolder(mod.id)}>
        <FolderOpen className="size-3.5" />
      </Button>
      <Button size="sm" variant="ghost" disabled={busy || locked} onClick={remove}>
        <Trash2 className="size-3.5" />
      </Button>
    </Card>
  )
}

const STATUS_RANK: Record<Mod['status'], number> = {
  installed: 0,
  error: 1,
  disabled: 2,
  'not-installed': 3,
}

export function LibraryPage(): ReactNode {
  const { t, tc } = useI18n()
  const { mods, config, conflicts, setRoute, refreshMods, refreshDeps } = useAppStore()
  const locked = !!config?.onlineSafeMode
  const [updates, setUpdates] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePersisted<SortKey>('lib.sort', 'order')
  const [filter, setFilter] = usePersisted<FilterKey>('lib.filter', 'all')
  const hasSourced = mods.some((m) => m.sourceUrl)
  const installedCount = mods.filter((m) => m.status === 'installed').length

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      const list = await window.api.remote.checkUpdates()
      setUpdates(new Set(list.map((u) => u.modId)))
    } finally {
      setChecking(false)
    }
  }

  const setAll = async (enabled: boolean): Promise<void> => {
    setBulk(true)
    try {
      await window.api.mods.setAllEnabled(enabled)
      await Promise.all([refreshMods(), refreshDeps()])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('GAME_DIR_NOT_WRITABLE')) {
        if (confirm(`${t('admin.dialogTitle')}\n\n${t('admin.dialogBody')}`)) {
          const ok = await window.api.system.relaunchAdmin()
          if (!ok) alert(t('admin.devHint'))
        }
      } else if (msg.includes('No handler registered')) {
        alert(t('common.restartApp'))
      } else {
        alert(msg)
      }
    } finally {
      setBulk(false)
    }
  }

  const nameById = useMemo(() => new Map(mods.map((m) => [m.id, m.name])), [mods])
  const conflictNames = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const c of conflicts) {
      for (const id of c.modIds) {
        const others = c.modIds.filter((x) => x !== id).map((x) => nameById.get(x) ?? x)
        map.set(id, new Set([...(map.get(id) ?? []), ...others]))
      }
    }
    return map
  }, [conflicts, nameById])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = mods.filter((m) => {
      if (q && !`${m.name} ${m.author ?? ''}`.toLowerCase().includes(q)) return false
      if (filter === 'installed') return m.status === 'installed'
      if (filter === 'disabled') return m.status !== 'installed'
      if (filter === 'updates') return updates.has(m.id)
      return true
    })
    const cmp: Record<SortKey, (a: Mod, b: Mod) => number> = {
      order: (a, b) => a.loadOrder - b.loadOrder || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.addedAt > a.addedAt ? 1 : b.addedAt < a.addedAt ? -1 : 0),
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
      type: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    }
    return [...list].sort(cmp[sort])
  }, [mods, query, filter, sort, updates])

  const installedOrder = useMemo(
    () =>
      mods
        .filter((m) => m.status === 'installed')
        .sort((a, b) => a.loadOrder - b.loadOrder)
        .map((m) => m.id),
    [mods],
  )

  const selCls =
    'no-drag h-8 rounded-md border border-line bg-bg px-2 text-[12px] text-ink-soft outline-none focus:border-brand/50'

  return (
    <Page
      title={t('library.title')}
      subtitle={`${tc('library.count', mods.length)} · ${tc('library.installedCount', installedCount)}`}
      actions={
        <>
          {hasSourced && (
            <Button size="sm" variant="ghost" loading={checking} onClick={checkUpdates}>
              <RefreshCw className="size-3.5" />
              {t('remote.checkUpdates')}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setRoute('add')}>
            <PlusCircle className="size-3.5" />
            {t('library.add')}
          </Button>
        </>
      }
    >
      <GameModeCard />
      <ScanBanner />

      {mods.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-8" />}
          title={t('library.emptyTitle')}
          hint={t('library.emptyHint')}
          action={
            <Button variant="primary" onClick={() => setRoute('add')}>
              <PlusCircle className="size-4" />
              {t('library.emptyCta')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('library.search')}
                className="no-drag h-8 w-full rounded-md border border-line bg-bg pl-8 pr-2 text-[12.5px] outline-none placeholder:text-ink-faint focus:border-brand/50"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={selCls}
              title={t('library.sortBy')}
            >
              <option value="order">{t('library.sort.order')}</option>
              <option value="name">{t('library.sort.name')}</option>
              <option value="recent">{t('library.sort.recent')}</option>
              <option value="status">{t('library.sort.status')}</option>
              <option value="type">{t('library.sort.type')}</option>
            </select>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
              className={selCls}
            >
              <option value="all">{t('library.filter.all')}</option>
              <option value="installed">{t('library.filter.installed')}</option>
              <option value="disabled">{t('library.filter.disabled')}</option>
              <option value="updates">{t('library.filter.updates')}</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              loading={bulk}
              disabled={locked || (installedCount === 0 && filter !== 'disabled')}
              onClick={() => void setAll(installedCount === 0)}
            >
              <Power className="size-3.5" />
              {installedCount === 0 ? t('library.enableAll') : t('library.disableAll')}
            </Button>
          </div>

          {sort !== 'order' && (
            <p className="mb-2 text-[11px] text-ink-faint">{t('library.orderHint')}</p>
          )}

          {visible.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-faint">{t('library.noMatch')}</p>
          ) : (
            <div className="space-y-2">
              {visible.map((mod) => {
                const idx = installedOrder.indexOf(mod.id)
                return (
                  <ModRow
                    key={mod.id}
                    mod={mod}
                    locked={locked}
                    sortable={sort === 'order' && !query}
                    conflictWith={[...(conflictNames.get(mod.id) ?? [])]}
                    hasUpdate={updates.has(mod.id)}
                    canMoveUp={idx > 0}
                    canMoveDown={idx >= 0 && idx < installedOrder.length - 1}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
    </Page>
  )
}
