import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
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
  CheckSquare,
  X,
} from 'lucide-react'
import type { FoundMod, Mod, ModCategory } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { GameModeCard } from '@/components/GameModeCard'
import { Button, Card, Badge, Toggle, Checkbox, Segmented, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

type SortKey = 'order' | 'category' | 'name' | 'recent' | 'status' | 'type'
type FilterKey = 'all' | 'installed' | 'disabled' | 'updates'

const CAT_ORDER: ModCategory[] = [
  'vehicle',
  'weapon',
  'ped',
  'map',
  'graphics',
  'audio',
  'script',
  'data',
  'other',
]
const CAT_COLOR: Record<ModCategory, string> = {
  vehicle: '#5b8def',
  weapon: '#e0637a',
  ped: '#c06ff2',
  map: '#57c85b',
  graphics: '#f5a524',
  audio: '#3fbfbf',
  script: '#8b93a7',
  data: '#b0863f',
  other: '#6a7180',
}
const catRank = (c: ModCategory | undefined): number => {
  const i = CAT_ORDER.indexOf(c ?? 'other')
  return i === -1 ? CAT_ORDER.length : i
}
const STATUS_RANK: Record<Mod['status'], number> = {
  installed: 0,
  error: 1,
  disabled: 2,
  'not-installed': 3,
}

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
    const rescan = (): void => {
      if (config?.game?.valid) void window.api.mods.scan().then(setFound)
    }
    rescan()
    return window.api.on.modsChanged(rescan) // live — the game folder is watched
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
  selectable,
  selected,
  onSelect,
  conflictWith,
  hasUpdate,
  canMoveUp,
  canMoveDown,
}: {
  mod: Mod
  locked: boolean
  sortable: boolean
  selectable: boolean
  selected: boolean
  onSelect: (v: boolean) => void
  conflictWith: string[]
  hasUpdate: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}): ReactNode {
  const { t, tc, relative } = useI18n()
  const { refreshMods, refreshDeps } = useAppStore()
  const [busy, setBusy] = useState(false)
  const enabled = mod.status === 'installed'
  const cat = mod.category ?? 'other'

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
      } else if (msg.includes('No handler registered')) {
        alert(t('common.restartApp'))
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-bg-card p-3.5 pr-3 shadow-card transition-colors',
        selected ? 'border-brand/50 bg-brand/[0.04]' : 'border-line hover:border-ink-faint/40',
      )}
    >
      <div className="flex w-4 shrink-0 items-center justify-center">
        {selectable || selected ? (
          <Checkbox checked={selected} onChange={onSelect} />
        ) : (
          <span className="size-2.5 rounded-full" style={{ backgroundColor: CAT_COLOR[cat] }} />
        )}
      </div>

      {showArrows && (
        <div className="-my-1 flex flex-col">
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
      )}

      <Toggle checked={enabled} onChange={toggle} disabled={busy || locked} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-medium">{mod.name}</p>
          {mod.kind === 'oiv' ? (
            <PackageOpen className="size-3.5 shrink-0 text-ink-faint" />
          ) : (
            <FileBox className="size-3.5 shrink-0 text-ink-faint" />
          )}
          <span
            className="shrink-0 rounded-md border px-1.5 py-px text-[10px] uppercase tracking-wide"
            style={{ color: CAT_COLOR[cat], borderColor: `${CAT_COLOR[cat]}44` }}
          >
            {t(`library.category.${cat}`)}
          </span>
          {mod.tags.includes('adopted') && <Badge tone="neutral">adopted</Badge>}
          {hasUpdate && (
            <button
              onClick={() => mod.sourceUrl && window.api.misc.openExternal(mod.sourceUrl)}
              className="no-drag inline-flex items-center gap-1 text-brand-hi"
              title={t('remote.updateAvailable')}
            >
              <ArrowUpCircle className="size-3.5" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide">
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
              <span className="text-[10.5px] font-semibold uppercase tracking-wide">
                {t('library.conflict')}
              </span>
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
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
      <button
        disabled={busy}
        onClick={() => window.api.mods.openFolder(mod.id)}
        title={t('nav.openGameFolder')}
        className="no-drag grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-bg-hover hover:text-ink disabled:opacity-40"
      >
        <FolderOpen className="size-4" />
      </button>
      <button
        disabled={busy || locked}
        onClick={remove}
        className="no-drag grid size-8 place-items-center rounded-lg text-ink-faint opacity-0 transition-colors hover:bg-bad/15 hover:text-bad group-hover:opacity-100 disabled:opacity-0"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.div>
  )
}

export function LibraryPage(): ReactNode {
  const { t, tc } = useI18n()
  const { mods, config, conflicts, setRoute, refreshMods, refreshDeps } = useAppStore()
  const locked = !!config?.onlineSafeMode
  const [updates, setUpdates] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePersisted<SortKey>('lib.sort', 'category')
  const [statusFilter, setStatusFilter] = usePersisted<FilterKey>('lib.filter', 'all')
  const [cat, setCat] = useState<string>('all')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const hasSourced = mods.some((m) => m.sourceUrl)
  const installedCount = mods.filter((m) => m.status === 'installed').length

  useEffect(() => {
    // drop selections for mods that vanished
    setSelected((s) => {
      const live = new Set(mods.map((m) => m.id))
      const next = new Set([...s].filter((id) => live.has(id)))
      return next.size === s.size ? s : next
    })
  }, [mods])

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      const list = await window.api.remote.checkUpdates()
      setUpdates(new Set(list.map((u) => u.modId)))
    } finally {
      setChecking(false)
    }
  }

  const handleWriteError = async (err: unknown): Promise<void> => {
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
  }

  const runBulk = async (fn: () => Promise<unknown>): Promise<void> => {
    setBulk(true)
    try {
      await fn()
      await Promise.all([refreshMods(), refreshDeps()])
    } catch (err) {
      await handleWriteError(err)
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

  const catCounts = useMemo(() => {
    const m = new Map<ModCategory, number>()
    for (const mod of mods) {
      const c = mod.category ?? 'other'
      m.set(c, (m.get(c) ?? 0) + 1)
    }
    return m
  }, [mods])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = mods.filter((m) => {
      if (q && !`${m.name} ${m.author ?? ''}`.toLowerCase().includes(q)) return false
      if (cat !== 'all' && (m.category ?? 'other') !== cat) return false
      if (statusFilter === 'installed') return m.status === 'installed'
      if (statusFilter === 'disabled') return m.status !== 'installed'
      if (statusFilter === 'updates') return updates.has(m.id)
      return true
    })
    const cmp: Record<SortKey, (a: Mod, b: Mod) => number> = {
      order: (a, b) => a.loadOrder - b.loadOrder || a.name.localeCompare(b.name),
      category: (a, b) => catRank(a.category) - catRank(b.category) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.addedAt > a.addedAt ? 1 : b.addedAt < a.addedAt ? -1 : 0),
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
      type: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    }
    return [...list].sort(cmp[sort])
  }, [mods, query, cat, statusFilter, sort, updates])

  const groups = useMemo(() => {
    if (sort !== 'category' || cat !== 'all') return null
    const by = new Map<ModCategory, Mod[]>()
    for (const m of visible) {
      const c = m.category ?? 'other'
      if (!by.has(c)) by.set(c, [])
      by.get(c)!.push(m)
    }
    return CAT_ORDER.filter((c) => by.has(c)).map((c) => [c, by.get(c)!] as const)
  }, [visible, sort, cat])

  const installedOrder = useMemo(
    () =>
      mods
        .filter((m) => m.status === 'installed')
        .sort((a, b) => a.loadOrder - b.loadOrder)
        .map((m) => m.id),
    [mods],
  )

  const visibleIds = useMemo(() => visible.map((m) => m.id), [visible])
  const selCount = selected.size
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  const toggleSel = (id: string, on: boolean): void =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const selCls =
    'no-drag h-8 rounded-lg border border-line bg-bg px-2 text-[12px] text-ink-soft outline-none focus:border-brand/50'

  const renderRow = (mod: Mod): ReactNode => {
    const idx = installedOrder.indexOf(mod.id)
    return (
      <ModRow
        key={mod.id}
        mod={mod}
        locked={locked}
        sortable={sort === 'order' && !query && cat === 'all'}
        selectable={selectMode}
        selected={selected.has(mod.id)}
        onSelect={(v) => toggleSel(mod.id, v)}
        conflictWith={[...(conflictNames.get(mod.id) ?? [])]}
        hasUpdate={updates.has(mod.id)}
        canMoveUp={idx > 0}
        canMoveDown={idx >= 0 && idx < installedOrder.length - 1}
      />
    )
  }

  const catOptions = [
    { value: 'all', label: t('library.filter.all'), count: mods.length },
    ...CAT_ORDER.filter((c) => catCounts.has(c)).map((c) => ({
      value: c,
      label: t(`library.category.${c}`),
      count: catCounts.get(c),
    })),
  ]

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
          {catOptions.length > 2 && (
            <Segmented
              name="cat"
              className="mb-2.5"
              options={catOptions}
              value={cat}
              onChange={setCat}
            />
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[9rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('library.search')}
                className="no-drag h-8 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-[12.5px] outline-none placeholder:text-ink-faint focus:border-brand/50"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={selCls}
              title={t('library.sortBy')}
            >
              <option value="order">{t('library.sort.order')}</option>
              <option value="category">{t('library.sort.category')}</option>
              <option value="name">{t('library.sort.name')}</option>
              <option value="recent">{t('library.sort.recent')}</option>
              <option value="status">{t('library.sort.status')}</option>
              <option value="type">{t('library.sort.type')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterKey)}
              className={selCls}
            >
              <option value="all">{t('library.filter.all')}</option>
              <option value="installed">{t('library.filter.installed')}</option>
              <option value="disabled">{t('library.filter.disabled')}</option>
              <option value="updates">{t('library.filter.updates')}</option>
            </select>
            <Button
              size="sm"
              variant={selectMode ? 'primary' : 'outline'}
              onClick={() => {
                setSelectMode((v) => !v)
                if (selectMode) setSelected(new Set())
              }}
            >
              <CheckSquare className="size-3.5" />
              {t('library.select')}
            </Button>
          </div>

          {sort !== 'order' && !selectMode && (
            <p className="mb-2 text-[11px] text-ink-faint">{t('library.orderHint')}</p>
          )}

          {visible.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-ink-faint">{t('library.noMatch')}</p>
          ) : groups ? (
            <div className="space-y-5">
              {groups.map(([c, list]) => (
                <div key={c} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: CAT_COLOR[c] }}
                    />
                    <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">
                      {t(`library.category.${c}`)}
                    </h3>
                    <span className="text-[11px] text-ink-faint">{list.length}</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  {list.map((mod) => renderRow(mod))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">{visible.map((mod) => renderRow(mod))}</div>
          )}
        </>
      )}

      {/* Floating selection bar */}
      <motion.div
        initial={false}
        animate={selCount > 0 ? { y: 0, opacity: 1 } : { y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className={cn(
          'no-drag fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-line bg-bg-raised/95 px-2.5 py-2 shadow-pop backdrop-blur',
          selCount === 0 && 'pointer-events-none',
        )}
      >
        <span className="px-1.5 text-[12.5px] font-medium">
          {tc('library.selected', selCount)}
        </span>
        <button
          onClick={() =>
            setSelected(allVisibleSelected ? new Set() : new Set([...selected, ...visibleIds]))
          }
          className="rounded-lg px-2 py-1 text-[12px] text-ink-faint hover:bg-bg-hover hover:text-ink"
        >
          {allVisibleSelected ? t('library.selectNone') : t('library.selectAll')}
        </button>
        <div className="mx-0.5 h-5 w-px bg-line" />
        <Button
          size="sm"
          variant="ghost"
          loading={bulk}
          disabled={locked}
          onClick={() =>
            void runBulk(() => window.api.mods.setEnabledMany([...selected], true)).then(() =>
              setSelected(new Set()),
            )
          }
        >
          {t('library.enableSel')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={bulk}
          disabled={locked}
          onClick={() =>
            void runBulk(() => window.api.mods.setEnabledMany([...selected], false)).then(() =>
              setSelected(new Set()),
            )
          }
        >
          {t('library.disableSel')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={bulk}
          disabled={locked}
          onClick={() => {
            if (!confirm(t('library.removeSelConfirm', { count: selCount }))) return
            void runBulk(() => window.api.mods.removeMany([...selected])).then(() =>
              setSelected(new Set()),
            )
          }}
        >
          <Trash2 className="size-3.5" />
          {t('library.delete')}
        </Button>
        <button
          onClick={() => {
            setSelected(new Set())
            setSelectMode(false)
          }}
          className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-bg-hover hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </motion.div>

      {installedCount > 0 && (
        <div className="mt-4 flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            loading={bulk}
            disabled={locked}
            onClick={() => void runBulk(() => window.api.mods.setAllEnabled(false))}
          >
            <Power className="size-3.5" />
            {t('library.disableAll')}
          </Button>
        </div>
      )}
    </Page>
  )
}
