import { useCallback, useState, type DragEvent, type ReactNode } from 'react'
import { UploadCloud, FolderOpen, Trash2, Download, Globe, ExternalLink } from 'lucide-react'
import type { ImportResult, RemoteMod } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card } from '@/components/ui'
import { PlanPreview } from '@/components/PlanPreview'

function RemoteInstaller({
  gameReady,
  onInstalled,
}: {
  gameReady: boolean
  onInstalled: () => void
}): ReactNode {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [remote, setRemote] = useState<RemoteMod | null>(null)
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'installing'>('idle')

  const fetchInfo = async (): Promise<void> => {
    if (!url.trim()) return
    setPhase('fetching')
    setRemote(null)
    try {
      setRemote(await window.api.remote.fetch(url.trim()))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('idle')
    }
  }

  const install = async (): Promise<void> => {
    if (!remote) return
    setPhase('installing')
    try {
      await window.api.remote.install(remote)
      setRemote(null)
      setUrl('')
      onInstalled()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('idle')
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="size-4 text-brand" />
        {t('remote.title')}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchInfo()}
          placeholder={t('remote.placeholder')}
          className="no-drag h-9 flex-1 rounded-lg border border-line bg-bg px-3 text-[13px] outline-none placeholder:text-ink-faint focus:border-brand/50"
        />
        <Button
          size="md"
          loading={phase === 'fetching'}
          disabled={!url.trim() || phase !== 'idle'}
          onClick={fetchInfo}
        >
          {t('remote.fetch')}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">{t('remote.beta')}</p>

      {remote && (
        <div className="mt-3 flex gap-3 border-t border-line pt-3">
          {remote.imageUrl && (
            <img
              src={remote.imageUrl}
              alt=""
              className="size-16 shrink-0 rounded-lg object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{remote.name}</p>
            <p className="truncate text-[12px] text-ink-faint">
              {[remote.author, remote.updatedAt && t('remote.updatedOn', {
                date: new Date(remote.updatedAt).toLocaleDateString(),
              })]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {!remote.autoInstallable && (
              <p className="mt-1 text-[12px] text-warn">{t('remote.offsite')}</p>
            )}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <Button size="sm" variant="ghost" onClick={() => window.api.misc.openExternal(remote.url)}>
              <ExternalLink className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={phase === 'installing'}
              disabled={!gameReady || !remote.autoInstallable || phase !== 'idle'}
              onClick={install}
            >
              <Download className="size-3.5" />
              {t('remote.install')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function AddModsPage(): ReactNode {
  const { t } = useI18n()
  const { config, setRoute, refreshMods, refreshDeps } = useAppStore()
  const [results, setResults] = useState<ImportResult[]>([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const gameReady = !!config?.game?.valid

  const ingest = useCallback(async (run: () => Promise<ImportResult[]>) => {
    setImporting(true)
    try {
      const out = await run()
      if (out.length) setResults((prev) => [...out, ...prev])
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }, [])

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
    <Page title={t('add.title')} subtitle={t('add.subtitle')}>
      {!gameReady && (
        <Card className="mb-4 border-warn/30 bg-warn/10 p-3 text-[13px] text-warn">
          {t('add.needGameFolder')}
        </Card>
      )}

      <RemoteInstaller
        gameReady={gameReady}
        onInstalled={() => {
          void Promise.all([refreshMods(), refreshDeps()])
          setRoute('library')
        }}
      />

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
        <p className="mt-3 text-sm text-ink-soft">{t('add.dropHere')}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            loading={importing}
            onClick={() => void ingest(() => window.api.mods.import())}
          >
            <FolderOpen className="size-4" />
            {t('add.chooseFiles')}
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
                    t('add.noMeta')}
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
                  {t('add.install')}
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
