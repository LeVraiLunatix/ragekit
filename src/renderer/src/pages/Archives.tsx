import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  Folder,
  FileText,
  FileCog,
  Box,
  ChevronRight,
  Download,
  Upload,
  Eye,
  ArrowLeft,
} from 'lucide-react'
import type { RpfArchiveInfo, RpfNode, RpfOpened } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Badge, EmptyState, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

const TEXT_EXT = /\.(xml|meta|txt|ymt|json|cfg|ini|nametable|rel|dat|lua)$/i

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const u = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`
}

function encTone(e: string): 'neutral' | 'good' | 'warn' | 'bad' {
  if (e === 'OPEN' || e === 'NONE') return 'good'
  if (e === 'AES') return 'neutral'
  return 'bad'
}

export function ArchivesPage(): ReactNode {
  const { t } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)

  const [archives, setArchives] = useState<RpfArchiveInfo[]>([])
  const [chain, setChain] = useState<string[]>([])
  const [opened, setOpened] = useState<RpfOpened | null>(null)
  const [dir, setDir] = useState('')
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game?.valid) void window.api.rpf.list().then(setArchives)
  }, [game?.valid])

  const openChain = async (next: string[]): Promise<void> => {
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const res = await window.api.rpf.open(next)
      setChain(next)
      setOpened(res)
      setDir('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setOpened(null)
    } finally {
      setLoading(false)
    }
  }

  const children = useMemo(() => {
    if (!opened) return []
    const base = dir ? `${dir}/` : ''
    return opened.nodes
      .filter((n) => {
        if (!n.path.startsWith(base)) return false
        const rest = n.path.slice(base.length)
        return rest.length > 0 && !rest.includes('/')
      })
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  }, [opened, dir])

  const rootArchive = chain[0]
  const selected = archives.find((a) => a.rel === rootArchive)
  const groups = {
    game: archives.filter((a) => !a.inMods),
    mods: archives.filter((a) => a.inMods),
  }

  if (!game?.valid) {
    return (
      <Page title={t('archives.title')}>
        <EmptyState icon={<Archive className="size-7" />} title={t('archives.setFolderFirst')} />
      </Page>
    )
  }

  const nodeAction = async (
    n: RpfNode,
    kind: 'extract' | 'preview' | 'replace',
  ): Promise<void> => {
    try {
      if (kind === 'extract') await window.api.rpf.extract(chain, n.path)
      else if (kind === 'replace') {
        if (await window.api.rpf.replace(chain, n.path)) alert(t('archives.replaced'))
      } else {
        setPreview({ path: n.path, text: await window.api.rpf.readText(chain, n.path) })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Page title={t('archives.title')} subtitle={t('archives.subtitle')}>
      <div className="flex gap-4">
        {/* Archive list */}
        <div className="w-60 shrink-0 space-y-3">
          {(['game', 'mods'] as const).map((g) =>
            groups[g].length === 0 ? null : (
              <div key={g}>
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {t(`archives.${g}`)}
                </p>
                <div className="space-y-0.5">
                  {groups[g].map((a) => (
                    <button
                      key={a.rel}
                      onClick={() => openChain([a.rel])}
                      className={cn(
                        'no-drag flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left transition-colors',
                        rootArchive === a.rel ? 'bg-bg-hover' : 'hover:bg-bg-hover/60',
                      )}
                    >
                      <span className="truncate font-mono text-[11.5px] text-ink">{a.rel}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-ink-faint">
                        {human(a.sizeBytes)}
                        <Badge tone={encTone(a.encryption)}>{a.encryption}</Badge>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
          {archives.length === 0 && (
            <p className="px-1 text-[12px] text-ink-faint">{t('archives.empty')}</p>
          )}
        </div>

        {/* Browser */}
        <div className="min-w-0 flex-1">
          {!opened ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center text-[13px] text-ink-faint">
              {loading ? <Spinner /> : error ? <span className="text-bad">{error}</span> : t('archives.pickArchive')}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                <button
                  className="no-drag font-mono text-brand-hi hover:underline"
                  onClick={() => {
                    setChain([rootArchive])
                    setDir('')
                    void openChain([rootArchive])
                  }}
                >
                  {rootArchive}
                </button>
                {chain.slice(1).map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <ChevronRight className="size-3 text-ink-faint" />
                    <span className="font-mono text-ink-soft">{c}</span>
                  </span>
                ))}
                {dir
                  .split('/')
                  .filter(Boolean)
                  .map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <ChevronRight className="size-3 text-ink-faint" />
                      <button
                        className="no-drag text-ink-soft hover:text-ink"
                        onClick={() => setDir(arr.slice(0, i + 1).join('/'))}
                      >
                        {part}
                      </button>
                    </span>
                  ))}
                <span className="ml-2">
                  <Badge tone={opened.writable ? 'good' : 'neutral'}>
                    {opened.writable ? t('archives.editable') : t('archives.readOnly')}
                  </Badge>
                </span>
                {selected && !selected.inMods && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={async () => {
                      const rel = await window.api.rpf.copyToMods(rootArchive)
                      setArchives(await window.api.rpf.list())
                      void openChain([rel])
                    }}
                  >
                    {t('archives.copyToMods')}
                  </Button>
                )}
              </div>

              {(dir || chain.length > 1) && (
                <button
                  onClick={() => {
                    if (dir) setDir(dir.split('/').slice(0, -1).join('/'))
                    else void openChain(chain.slice(0, -1))
                  }}
                  className="no-drag mb-1 flex items-center gap-1.5 text-[12px] text-ink-faint hover:text-ink"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('common.back')}
                </button>
              )}

              <div className="divide-y divide-line rounded-xl border border-line">
                {children.map((n) => (
                  <div key={n.path} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                    {n.isDir ? (
                      <Folder className="size-4 shrink-0 text-brand" />
                    ) : n.isNestedRpf ? (
                      <Box className="size-4 shrink-0 text-brand-hi" />
                    ) : n.isResource ? (
                      <FileCog className="size-4 shrink-0 text-ink-faint" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-ink-faint" />
                    )}
                    <button
                      className="no-drag min-w-0 flex-1 truncate text-left hover:text-brand-hi disabled:hover:text-ink"
                      disabled={!n.isDir && !n.isNestedRpf}
                      onClick={() => {
                        if (n.isDir) setDir(n.path)
                        else if (n.isNestedRpf) void openChain([...chain, n.path])
                      }}
                    >
                      {n.name}
                    </button>
                    {!n.isDir && (
                      <span className="text-[11px] text-ink-faint">{human(n.size)}</span>
                    )}
                    {!n.isDir && !n.isNestedRpf && (
                      <div className="flex shrink-0 gap-1">
                        {TEXT_EXT.test(n.name) && (
                          <Button size="sm" variant="ghost" onClick={() => nodeAction(n, 'preview')}>
                            <Eye className="size-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => nodeAction(n, 'extract')}>
                          <Download className="size-3.5" />
                        </Button>
                        {opened.writable && !n.isResource && (
                          <Button size="sm" variant="ghost" onClick={() => nodeAction(n, 'replace')}>
                            <Upload className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {children.length === 0 && (
                  <div className="px-3 py-6 text-center text-[12px] text-ink-faint">—</div>
                )}
              </div>

              {preview && (
                <div className="mt-3 rounded-xl border border-line bg-bg">
                  <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                    <span className="truncate font-mono text-[11px] text-ink-soft">
                      {preview.path}
                    </span>
                    <button
                      className="no-drag text-[12px] text-ink-faint hover:text-ink"
                      onClick={() => setPreview(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <pre className="max-h-80 overflow-auto p-3 text-[11px] leading-relaxed text-ink-soft">
                    {preview.text}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Page>
  )
}
