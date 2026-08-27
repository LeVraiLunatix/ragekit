import { useCallback, useState, type DragEvent, type ReactNode } from 'react'
import { UploadCloud, FolderOpen, Trash2, Download } from 'lucide-react'
import type { ImportResult } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { Page } from '@/components/Page'
import { Button, Card } from '@/components/ui'
import { PlanPreview } from '@/components/PlanPreview'

export function AddModsPage(): ReactNode {
  const { config, setRoute, refreshMods, refreshDeps } = useAppStore()
  const [results, setResults] = useState<ImportResult[]>([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const gameReady = !!config?.game?.valid

  const ingest = useCallback(
    async (run: () => Promise<ImportResult[]>) => {
      setImporting(true)
      try {
        const out = await run()
        if (out.length) setResults((prev) => [...out, ...prev])
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err))
      } finally {
        setImporting(false)
      }
    },
    [],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => window.api.misc.pathForFile(f))
        .filter(Boolean)
      if (paths.length) void ingest(() => window.api.mods.importPaths(paths))
    },
    [ingest],
  )

  return (
    <Page
      title="Add mods"
      subtitle="Drop a .zip or .oiv, or a mod folder. It gets copied into your library and analysed."
    >
      {!gameReady && (
        <Card className="mb-4 border-warn/30 bg-warn/10 p-3 text-[13px] text-warn">
          Set your GTA V folder in Settings before installing anything.
        </Card>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-colors ${
          dragOver ? 'border-brand bg-brand/5' : 'border-line'
        }`}
      >
        <UploadCloud className={`size-9 ${dragOver ? 'text-brand' : 'text-ink-faint'}`} />
        <p className="mt-3 text-sm text-ink-soft">Drag mod files here</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            loading={importing}
            onClick={() => void ingest(() => window.api.mods.import())}
          >
            <FolderOpen className="size-4" />
            Choose files…
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {results.map(({ mod, plan }) => (
          <Card key={mod.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{mod.name}</p>
                <p className="text-[12px] text-ink-faint">
                  {[mod.author, mod.version && `v${mod.version}`].filter(Boolean).join(' · ') ||
                    'No metadata'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!gameReady || plan.files.length === 0}
                  loading={installingId === mod.id}
                  onClick={async () => {
                    setInstallingId(mod.id)
                    try {
                      await window.api.mods.install(mod.id)
                      await Promise.all([refreshMods(), refreshDeps()])
                      setResults((prev) => prev.filter((r) => r.mod.id !== mod.id))
                      setRoute('library')
                    } catch (err) {
                      alert(err instanceof Error ? err.message : String(err))
                    } finally {
                      setInstallingId(null)
                    }
                  }}
                >
                  <Download className="size-3.5" />
                  Install
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await window.api.mods.remove(mod.id)
                    await refreshMods()
                    setResults((prev) => prev.filter((r) => r.mod.id !== mod.id))
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <PlanPreview plan={plan} />
            </div>
          </Card>
        ))}
      </div>
    </Page>
  )
}
