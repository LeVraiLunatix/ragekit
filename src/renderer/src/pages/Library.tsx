import { useEffect, useState, type ReactNode } from 'react'
import {
  Boxes,
  FolderOpen,
  Trash2,
  PlusCircle,
  PackageOpen,
  FileBox,
  SearchCheck,
  ChevronDown,
} from 'lucide-react'
import type { FoundMod, Mod } from '@shared/types'
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

function ModRow({ mod, locked }: { mod: Mod; locked: boolean }): ReactNode {
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

export function LibraryPage(): ReactNode {
  const { t, tc } = useI18n()
  const { mods, config, setRoute } = useAppStore()
  const locked = !!config?.onlineSafeMode

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
        <div className="space-y-2">
          {mods.map((mod) => (
            <ModRow key={mod.id} mod={mod} locked={locked} />
          ))}
        </div>
      )}
    </Page>
  )
}
