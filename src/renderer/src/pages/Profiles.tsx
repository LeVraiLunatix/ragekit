import { useState, type ReactNode } from 'react'
import { Layers, Play, Pencil, Trash2, Save, RefreshCw, Check } from 'lucide-react'
import type { Profile } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'

function ProfileCard({ profile }: { profile: Profile }): ReactNode {
  const { t, tc } = useI18n()
  const { mods, config, refreshProfiles, refreshMods } = useAppStore()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<null | 'apply' | 'other'>(null)
  const active = config?.activeProfileId === profile.id

  const run = async (fn: () => Promise<unknown>, kind: 'apply' | 'other' = 'other'): Promise<void> => {
    setBusy(kind)
    try {
      await fn()
      await Promise.all([refreshProfiles(), refreshMods()])
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const toggleMod = (modId: string): void => {
    const next = profile.enabledMods.includes(modId)
      ? profile.enabledMods.filter((m) => m !== modId)
      : [...profile.enabledMods, modId]
    void run(() => window.api.profiles.setMods(profile.id, next))
  }

  return (
    <Card className={cn('p-4', active && 'border-brand/40')}>
      <div className="flex items-center gap-3">
        <Layers className="size-4 shrink-0 text-ink-faint" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{profile.name}</p>
            {active && <Badge tone="brand">{t('profiles.active')}</Badge>}
          </div>
          <p className="text-[12px] text-ink-faint">{tc('profiles.count', profile.enabledMods.length)}</p>
        </div>
        <Button
          size="sm"
          variant="primary"
          loading={busy === 'apply'}
          disabled={!!busy}
          onClick={() => run(() => window.api.profiles.apply(profile.id), 'apply')}
        >
          <Play className="size-3.5" />
          {t('profiles.apply')}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-3.5" />
          {profile.enabledMods.length} / {mods.length}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!!busy}
          onClick={() => run(() => window.api.profiles.capture(profile.id))}
        >
          <RefreshCw className="size-3.5" />
          {t('profiles.recapture')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const name = window.prompt(t('profiles.rename'), profile.name)
            if (name) void run(() => window.api.profiles.rename(profile.id, name))
          }}
        >
          {t('profiles.rename')}
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="danger"
          disabled={!!busy}
          onClick={() => {
            if (confirm(t('profiles.deleteConfirm', { name: profile.name })))
              void run(() => window.api.profiles.remove(profile.id))
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {editing && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {mods.map((m) => {
            const on = profile.enabledMods.includes(m.id)
            return (
              <li key={m.id}>
                <button
                  onClick={() => toggleMod(m.id)}
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
                  <span className="truncate">{m.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function ProfilesPage(): ReactNode {
  const { t } = useI18n()
  const { profiles, mods, refreshProfiles } = useAppStore()
  const [creating, setCreating] = useState(false)

  const create = async (): Promise<void> => {
    const name = window.prompt(t('profiles.createPrompt'))
    if (!name) return
    setCreating(true)
    try {
      await window.api.profiles.create(name, true)
      await refreshProfiles()
    } finally {
      setCreating(false)
    }
  }

  return (
    <Page
      title={t('profiles.title')}
      subtitle={t('profiles.subtitle')}
      actions={
        <Button size="sm" variant="primary" loading={creating} onClick={create}>
          <Save className="size-3.5" />
          {t('profiles.create')}
        </Button>
      }
    >
      {profiles.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-8" />}
          title={t('profiles.empty')}
          hint={t('profiles.emptyHint')}
          action={
            <Button variant="primary" loading={creating} onClick={create} disabled={mods.length === 0}>
              <Save className="size-4" />
              {t('profiles.create')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </Page>
  )
}
