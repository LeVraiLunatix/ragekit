import { useState, type ReactNode } from 'react'
import { Boxes, FolderOpen, Trash2, PlusCircle, PackageOpen, FileBox } from 'lucide-react'
import type { Mod } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { Page } from '@/components/Page'
import { Button, Card, Badge, Toggle, EmptyState } from '@/components/ui'
import { timeAgo } from '@/lib/utils'

function StatusBadge({ status }: { status: Mod['status'] }): ReactNode {
  if (status === 'installed') return <Badge tone="good">installed</Badge>
  if (status === 'disabled') return <Badge tone="neutral">disabled</Badge>
  if (status === 'error') return <Badge tone="bad">error</Badge>
  return <Badge tone="neutral">not installed</Badge>
}

function ModRow({ mod }: { mod: Mod }): ReactNode {
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
    if (!confirm(`Remove "${mod.name}" and restore any files it replaced?`)) return
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
            `added ${timeAgo(mod.addedAt)}`,
            mod.installedFiles.length > 0 && `${mod.installedFiles.length} files`,
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
  const { mods, setRoute } = useAppStore()

  return (
    <Page
      title="Library"
      subtitle={`${mods.length} mod${mods.length === 1 ? '' : 's'} · toggle to install or disable`}
      actions={
        <Button size="sm" variant="primary" onClick={() => setRoute('add')}>
          <PlusCircle className="size-3.5" />
          Add
        </Button>
      }
    >
      {mods.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-8" />}
          title="No mods yet"
          hint="Import a .zip or .oiv to get started. Everything is tracked so you can cleanly uninstall later."
          action={
            <Button variant="primary" onClick={() => setRoute('add')}>
              <PlusCircle className="size-4" />
              Add your first mod
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
