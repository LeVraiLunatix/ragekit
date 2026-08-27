import { useState, type ReactNode } from 'react'
import { Boxes, FolderOpen, Trash2, PlusCircle, PackageOpen, FileBox } from 'lucide-react'
import type { Mod } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge, Toggle, EmptyState } from '@/components/ui'

function StatusBadge({ status }: { status: Mod['status'] }): ReactNode {
  const { t } = useI18n()
  if (status === 'installed') return <Badge tone="good">{t('library.status.installed')}</Badge>
  if (status === 'disabled') return <Badge tone="neutral">{t('library.status.disabled')}</Badge>
  if (status === 'error') return <Badge tone="bad">{t('library.status.error')}</Badge>
  return <Badge tone="neutral">{t('library.status.notInstalled')}</Badge>
}

function ModRow({ mod }: { mod: Mod }): ReactNode {
  const { t, tc, relative } = useI18n()
  const { refreshMods, refreshDeps } = useAppStore()
  const [busy, setBusy] = useState(false)
  const enabled = mod.status === 'installed'

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.mods.setEnabled(mod.id, !enabled)
      await Promise.all([refreshMods(), refreshDeps()])
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
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

  return (
    <Card className="flex items-center gap-3 p-4">
      <Toggle checked={enabled} onChange={toggle} disabled={busy} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{mod.name}</p>
          {mod.kind === 'oiv' ? (
            <PackageOpen className="size-3.5 shrink-0 text-ink-faint" />
          ) : (
            <FileBox className="size-3.5 shrink-0 text-ink-faint" />
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
      <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
        <Trash2 className="size-3.5" />
      </Button>
    </Card>
  )
}

export function LibraryPage(): ReactNode {
  const { t, tc } = useI18n()
  const { mods, setRoute } = useAppStore()

  return (
    <Page
      title={t('library.title')}
      subtitle={`${tc('library.count', mods.length)} · ${t('library.subtitle')}`}
      actions={
        <Button size="sm" variant="primary" onClick={() => setRoute('add')}>
          <PlusCircle className="size-3.5" />
          {t('library.add')}
        </Button>
      }
    >
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
        <div className="space-y-2">
          {mods.map((mod) => (
            <ModRow key={mod.id} mod={mod} />
          ))}
        </div>
      )}
    </Page>
  )
}
