import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Layers,
  Play,
  Trash2,
  Copy,
  RefreshCw,
  Check,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  ShieldCheck,
  CircleCheck,
  Download,
  Upload,
} from 'lucide-react'
import type { Mod, Profile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

const DOT_COLORS = ['#f2a341', '#5b8def', '#57c85b', '#c06ff2', '#e0637a', '#3fbfbf']
function dotColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return DOT_COLORS[h % DOT_COLORS.length]
}

interface Diff {
  enable: Mod[]
  disable: Mod[]
  inSync: boolean
  size: number
}

function useProfileTools(): {
  modById: Map<string, Mod>
  installedIds: string[]
  diffOf: (p: Profile) => Diff
} {
  const mods = useAppStore((s) => s.mods)
  return useMemo(() => {
    const modById = new Map(mods.map((m) => [m.id, m]))
    const installedIds = mods
      .filter((m) => m.status === 'installed')
      .sort((a, b) => a.loadOrder - b.loadOrder)
      .map((m) => m.id)
    const installedSet = new Set(installedIds)
    const diffOf = (p: Profile): Diff => {
      const target = new Set(p.enabledMods.filter((id) => modById.has(id)))
      const enable = [...target].filter((id) => !installedSet.has(id)).map((id) => modById.get(id)!)
      const disable = installedIds.filter((id) => !target.has(id)).map((id) => modById.get(id)!)
      return { enable, disable, inSync: enable.length === 0 && disable.length === 0, size: target.size }
    }
    return { modById, installedIds, diffOf }
  }, [mods])
}

function names(list: Mod[], max = 6): string {
  const shown = list.slice(0, max).map((m) => m.name)
  if (list.length > max) shown.push(`+${list.length - max}`)
  return shown.join(', ')
}

function Menu({
  items,
}: {
  items: Array<{ label: string; icon: ReactNode; onClick: () => void; danger?: boolean }>
}): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="no-drag grid size-8 place-items-center rounded-md text-ink-faint hover:bg-bg-hover hover:text-ink"
      >
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-bg-card py-1 shadow-card">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                className={cn(
                  'no-drag flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-bg-hover',
                  it.danger ? 'text-bad' : 'text-ink-soft',
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ModEditor({ profile }: { profile: Profile }): ReactNode {
  const { t } = useI18n()
  const mods = useAppStore((s) => s.mods)
  const { refreshProfiles, refreshMods } = useAppStore()
  const [query, setQuery] = useState('')
  const inProfile = useMemo(() => new Set(profile.enabledMods), [profile.enabledMods])

  const filtered = mods.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()))

  const commit = (ids: string[]): void => {
    void window.api.profiles.setMods(profile.id, ids).then(() => {
      void refreshProfiles()
      void refreshMods()
    })
  }
  const toggle = (id: string): void => {
    commit(
      inProfile.has(id) ? profile.enabledMods.filter((x) => x !== id) : [...profile.enabledMods, id],
    )
  }
  const setAll = (on: boolean): void => {
    const f = new Set(filtered.map((m) => m.id))
    commit(
      on
        ? [...new Set([...profile.enabledMods, ...f])]
        : profile.enabledMods.filter((x) => !f.has(x)),
    )
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('profiles.search')}
            className="no-drag h-8 w-full rounded-md border border-line bg-bg pl-8 pr-2 text-[12.5px] outline-none placeholder:text-ink-faint focus:border-brand/50"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
          {t('profiles.selectAll')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
          {t('profiles.selectNone')}
        </Button>
      </div>

      <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto pr-1">
        {filtered.map((m) => {
          const on = inProfile.has(m.id)
          const installed = m.status === 'installed'
          return (
            <li key={m.id}>
              <button
                onClick={() => toggle(m.id)}
                className="no-drag flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-bg-hover"
              >
                <span
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded border',
                    on ? 'border-brand bg-brand text-black' : 'border-line',
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {on && !installed && (
                  <span className="shrink-0 text-[11px] font-semibold text-good">+</span>
                )}
                {!on && installed && (
                  <span className="shrink-0 text-[11px] font-semibold text-warn">−</span>
                )}
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-2 py-3 text-center text-[12px] text-ink-faint">—</li>
        )}
      </ul>
    </div>
  )
}

function ProfileCard({ profile, locked }: { profile: Profile; locked: boolean }): ReactNode {
  const { t, tc } = useI18n()
  const { config, refreshProfiles, refreshMods, refreshDeps } = useAppStore()
  const { diffOf, modById } = useProfileTools()
  const [busy, setBusy] = useState<null | 'apply' | 'other'>(null)
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(profile.name)
  const renameRef = useRef<HTMLInputElement>(null)
  const active = config?.activeProfileId === profile.id
  const diff = diffOf(profile)

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  const run = async (fn: () => Promise<unknown>, kind: 'apply' | 'other' = 'other'): Promise<void> => {
    setBusy(kind)
    try {
      await fn()
      await Promise.all([refreshProfiles(), refreshMods(), refreshDeps()])
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

  const commitRename = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next && next !== profile.name) void run(() => window.api.profiles.rename(profile.id, next))
    else setDraft(profile.name)
  }

  const apply = (): void => {
    if (!diff.inSync) {
      const lines = [t('profiles.applyConfirmQuestion', { name: profile.name }), '']
      if (diff.enable.length) lines.push(t('profiles.applyConfirmEnable', { mods: names(diff.enable) }))
      if (diff.disable.length)
        lines.push(t('profiles.applyConfirmDisable', { mods: names(diff.disable) }))
      if (!confirm(lines.join('\n'))) return
    }
    void run(() => window.api.profiles.apply(profile.id), 'apply')
  }

  return (
    <Card className={cn('p-4', active && 'border-brand/40')}>
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor(profile.id) }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renaming ? (
              <input
                ref={renameRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') {
                    setDraft(profile.name)
                    setRenaming(false)
                  }
                }}
                className="no-drag h-7 w-56 rounded-md border border-brand/50 bg-bg px-2 text-sm font-medium outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setDraft(profile.name)
                  setRenaming(true)
                }}
                className="no-drag group flex items-center gap-1.5 truncate text-sm font-medium hover:text-brand-hi"
                title={t('profiles.rename')}
              >
                <span className="truncate">{profile.name}</span>
                <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
            )}
            {active && <Badge tone="brand">{t('profiles.active')}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-faint">
            <span>{tc('profiles.count', diff.size)}</span>
            {diff.inSync ? (
              <span className="inline-flex items-center gap-1 text-good">
                <CircleCheck className="size-3" />
                {t('profiles.inSync')}
              </span>
            ) : (
              <>
                {diff.enable.length > 0 && (
                  <span className="text-good">{t('profiles.diffEnable', { count: diff.enable.length })}</span>
                )}
                {diff.disable.length > 0 && (
                  <span className="text-warn">
                    {t('profiles.diffDisable', { count: diff.disable.length })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <Button
          size="sm"
          variant={diff.inSync ? 'outline' : 'primary'}
          loading={busy === 'apply'}
          disabled={!!busy || locked || diff.inSync}
          onClick={apply}
        >
          {diff.inSync ? <CircleCheck className="size-3.5" /> : <Play className="size-3.5" />}
          {diff.inSync ? t('profiles.applied') : t('profiles.apply')}
        </Button>

        <Menu
          items={[
            {
              label: t('profiles.updateFromCurrent'),
              icon: <RefreshCw className="size-3.5" />,
              onClick: () => void run(() => window.api.profiles.capture(profile.id)),
            },
            {
              label: t('profiles.duplicate'),
              icon: <Copy className="size-3.5" />,
              onClick: () => void run(() => window.api.profiles.duplicate(profile.id)),
            },
            {
              label: t('profileIo.export'),
              icon: <Download className="size-3.5" />,
              onClick: () => void window.api.profiles.export(profile.id),
            },
            {
              label: t('profiles.rename'),
              icon: <Pencil className="size-3.5" />,
              onClick: () => {
                setDraft(profile.name)
                setRenaming(true)
              },
            },
            {
              label: t('profiles.delete'),
              icon: <Trash2 className="size-3.5" />,
              danger: true,
              onClick: () => {
                if (confirm(t('profiles.deleteConfirm', { name: profile.name })))
                  void run(() => window.api.profiles.remove(profile.id))
              },
            },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {profile.enabledMods.length === 0 && (
          <span className="text-[12px] text-ink-faint">—</span>
        )}
        {profile.enabledMods.slice(0, 6).map((id) => (
          <span
            key={id}
            className="max-w-[12rem] truncate rounded-md border border-line bg-bg-hover/60 px-2 py-0.5 text-[11.5px] text-ink-soft"
          >
            {modById.get(id)?.name ?? id}
          </span>
        ))}
        {profile.enabledMods.length > 6 && (
          <button
            onClick={() => setEditing(true)}
            className="no-drag rounded-md px-2 py-0.5 text-[11.5px] text-ink-faint hover:text-ink"
          >
            {t('profiles.more', { count: profile.enabledMods.length - 6 })}
          </button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? t('profiles.done') : t('profiles.edit')}
        </Button>
      </div>

      {editing && <ModEditor profile={profile} />}
    </Card>
  )
}

function Creator({
  prefillFromCurrent,
  onDone,
}: {
  prefillFromCurrent: boolean
  onDone: () => void
}): ReactNode {
  const { t, tc } = useI18n()
  const { refreshProfiles } = useAppStore()
  const installed = useAppStore((s) => s.mods.filter((m) => m.status === 'installed').length)
  const [name, setName] = useState('')
  const [fromCurrent, setFromCurrent] = useState(prefillFromCurrent)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => ref.current?.focus(), [])

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await window.api.profiles.create(name.trim(), fromCurrent)
      await refreshProfiles()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-2 border-brand/30 p-4">
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create()
          if (e.key === 'Escape') onDone()
        }}
        placeholder={t('profiles.namePlaceholder')}
        className="no-drag h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13px] outline-none placeholder:text-ink-faint focus:border-brand/50"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFromCurrent(true)}
          className={cn(
            'no-drag rounded-md border px-2.5 py-1 text-[12px] transition-colors',
            fromCurrent ? 'border-brand/50 bg-brand/10 text-ink' : 'border-line text-ink-soft',
          )}
        >
          {t('profiles.fromCurrent', { count: installed })}
        </button>
        <button
          onClick={() => setFromCurrent(false)}
          className={cn(
            'no-drag rounded-md border px-2.5 py-1 text-[12px] transition-colors',
            !fromCurrent ? 'border-brand/50 bg-brand/10 text-ink' : 'border-line text-ink-soft',
          )}
        >
          {t('profiles.fromEmpty')}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>
          <Check className="size-3.5" />
          {t('profiles.create')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('profiles.cancel')}
        </Button>
        <div className="flex-1" />
        <span className="self-center text-[11px] text-ink-faint">
          {fromCurrent ? tc('profiles.count', installed) : t('profiles.fromEmpty')}
        </span>
      </div>
    </Card>
  )
}

function CurrentSetupBar({ onSave }: { onSave: () => void }): ReactNode {
  const { t, tc } = useI18n()
  const { profiles } = useAppStore()
  const { installedIds, diffOf } = useProfileTools()
  const match = profiles.find((p) => diffOf(p).inSync)

  if (installedIds.length === 0) return null

  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-line bg-bg-hover/40 px-3 py-2 text-[12.5px]">
      {match ? (
        <>
          <CircleCheck className="size-4 shrink-0 text-good" />
          <span className="text-ink-soft">{t('profiles.matches', { name: match.name })}</span>
        </>
      ) : (
        <>
          <Layers className="size-4 shrink-0 text-ink-faint" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{t('profiles.unsavedTitle')}</span>
            <span className="ml-1.5 text-ink-faint">
              {t('profiles.unsavedBody', { count: installedIds.length })}
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={onSave}>
            <Plus className="size-3.5" />
            {t('profiles.saveCurrent')}
          </Button>
        </>
      )}
      {match && <span className="ml-auto text-ink-faint">{tc('profiles.count', installedIds.length)}</span>}
    </div>
  )
}

export function ProfilesPage(): ReactNode {
  const { t } = useI18n()
  const { profiles, mods, config, refreshProfiles } = useAppStore()
  const locked = !!config?.onlineSafeMode
  const [creator, setCreator] = useState<null | { fromCurrent: boolean }>(null)

  const doImport = async (): Promise<void> => {
    try {
      const res = await window.api.profiles.import()
      if (!res) return
      await refreshProfiles()
      alert(
        res.missing.length
          ? `${t('profileIo.imported', { name: res.profile.name })}\n${t('profileIo.missing', {
              count: res.missing.length,
              list: res.missing.join(', '),
            })}`
          : t('profileIo.imported', { name: res.profile.name }),
      )
    } catch {
      alert(t('profileIo.badFile'))
    }
  }

  return (
    <Page
      title={t('profiles.title')}
      subtitle={t('profiles.subtitle')}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => void doImport()}>
            <Upload className="size-3.5" />
            {t('profileIo.import')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setCreator({ fromCurrent: true })}
            disabled={mods.length === 0}
          >
            <Plus className="size-3.5" />
            {t('profiles.new')}
          </Button>
        </>
      }
    >
      {locked && (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-good/25 bg-good/10 px-3 py-2 text-[12.5px] text-good">
          <ShieldCheck className="size-4 shrink-0" />
          {t('profiles.lockedByOnline')}
        </div>
      )}

      {!locked && <CurrentSetupBar onSave={() => setCreator({ fromCurrent: true })} />}

      {creator && (
        <Creator prefillFromCurrent={creator.fromCurrent} onDone={() => setCreator(null)} />
      )}

      {profiles.length === 0 && !creator ? (
        <EmptyState
          icon={<Layers className="size-8" />}
          title={t('profiles.empty')}
          hint={t('profiles.emptyHint')}
          action={
            <Button
              variant="primary"
              onClick={() => setCreator({ fromCurrent: true })}
              disabled={mods.length === 0}
            >
              <Plus className="size-4" />
              {t('profiles.emptyCta')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} locked={locked} />
          ))}
        </div>
      )}
    </Page>
  )
}
