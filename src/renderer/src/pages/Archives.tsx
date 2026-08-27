import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  HardDrive,
  Folder,
  FolderOpen,
  FileText,
  FileCog,
  File as FileIcon,
  Binary,
  Box,
  AppWindow,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Search,
  Download,
  Upload,
  Eye,
  FolderInput,
  X,
} from 'lucide-react'
import type { ExplorerListing, ExplorerNode, NodeCategory } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { EmptyState, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

const TEXT_EXT = /\.(xml|meta|txt|ymt|json|cfg|ini|nametable|rel|dat|lua|log|rgl)$/i
type SortCol = 'name' | 'type' | 'size'

const CAT_ORDER: NodeCategory[] = [
  'folder',
  'rpf',
  'application',
  'dll',
  'resource',
  'textdata',
  'text',
  'binary',
  'other',
]
const CAT_LABEL: Record<NodeCategory, string> = {
  folder: 'Folder',
  rpf: 'Rage Package File',
  application: 'Application',
  dll: 'Dynamic-link library',
  resource: 'Resource',
  textdata: 'Text data',
  text: 'Plain text',
  binary: 'Binary data',
  other: 'Other',
}

function human(bytes: number): string {
  if (bytes <= 0) return ''
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

function NodeIcon({ node }: { node: ExplorerNode }): ReactNode {
  if (node.kind === 'dir') return <Folder className="size-4 shrink-0 text-brand" />
  if (node.kind === 'rpf') return <Box className="size-4 shrink-0 text-brand-hi" />
  if (node.category === 'application') return <AppWindow className="size-4 shrink-0 text-ink-soft" />
  if (node.category === 'dll' || node.category === 'resource')
    return <FileCog className="size-4 shrink-0 text-ink-faint" />
  if (node.category === 'binary') return <Binary className="size-4 shrink-0 text-ink-faint" />
  if (node.category === 'text' || node.category === 'textdata')
    return <FileText className="size-4 shrink-0 text-ink-faint" />
  return <FileIcon className="size-4 shrink-0 text-ink-faint" />
}

// ── left tree ────────────────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  current,
  onGo,
  fetchList,
}: {
  node: ExplorerNode
  depth: number
  current: string
  onGo: (vpath: string) => void
  fetchList: (vpath: string) => Promise<ExplorerListing>
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [kids, setKids] = useState<ExplorerNode[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && kids === null) {
      setLoading(true)
      try {
        const res = await fetchList(node.vpath)
        setKids(res.nodes.filter((n) => n.kind === 'dir' || n.kind === 'rpf'))
      } catch {
        setKids([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div>
      <div
        className={cn(
          'no-drag flex items-center gap-1 rounded px-1 py-1 text-[12px] hover:bg-bg-hover',
          current === node.vpath && 'bg-bg-hover text-ink',
        )}
        style={{ paddingLeft: depth * 12 + 2 }}
      >
        <button className="shrink-0 text-ink-faint" onClick={toggle}>
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
          onClick={() => onGo(node.vpath)}
        >
          {node.kind === 'rpf' ? (
            <Box className="size-3.5 shrink-0 text-brand-hi" />
          ) : open ? (
            <FolderOpen className="size-3.5 shrink-0 text-brand" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-brand" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {open && (
        <div>
          {loading && <div className="py-1 pl-6 text-[11px] text-ink-faint">…</div>}
          {kids?.map((k) => (
            <TreeItem
              key={k.vpath}
              node={k}
              depth={depth + 1}
              current={current}
              onGo={onGo}
              fetchList={fetchList}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export function ArchivesPage(): ReactNode {
  const { t, tc } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)

  const [listing, setListing] = useState<ExplorerListing | null>(null)
  const [root, setRoot] = useState<ExplorerNode[]>([])
  const [vpath, setVpath] = useState('')
  const [hist, setHist] = useState<string[]>([''])
  const [hi, setHi] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: 'name', dir: 1 })
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; node: ExplorerNode } | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchList = useCallback(
    (v: string) => window.api.rpf.explore(v),
    [],
  )

  const load = useCallback(
    async (v: string): Promise<void> => {
      setLoading(true)
      setSel(null)
      setPreview(null)
      setQuery('')
      try {
        setListing(await window.api.rpf.explore(v))
        setVpath(v)
      } catch (err) {
        setListing({
          vpath: v,
          mode: 'fs',
          writable: false,
          error: err instanceof Error ? err.message : String(err),
          nodes: [],
        })
        setVpath(v)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!game?.valid) return
    void window.api.rpf
      .explore('')
      .then((r) => setRoot(r.nodes.filter((n) => n.kind === 'dir' || n.kind === 'rpf')))
    void load('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.valid])

  useEffect(() => {
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const go = (v: string): void => {
    setHist((h) => [...h.slice(0, hi + 1), v])
    setHi((i) => i + 1)
    void load(v)
  }
  const back = (): void => {
    if (hi <= 0) return
    setHi(hi - 1)
    void load(hist[hi - 1])
  }
  const fwd = (): void => {
    if (hi >= hist.length - 1) return
    setHi(hi + 1)
    void load(hist[hi + 1])
  }
  const up = (): void => {
    if (!vpath) return
    go(vpath.split('/').slice(0, -1).join('/'))
  }

  const openNode = (n: ExplorerNode): void => {
    if (n.kind === 'dir' || n.kind === 'rpf') go(n.vpath)
    else if (TEXT_EXT.test(n.name)) void act(n, 'preview')
    else void act(n, 'extract')
  }

  const act = async (
    n: ExplorerNode,
    kind: 'extract' | 'replace' | 'preview' | 'reveal',
  ): Promise<void> => {
    setMenu(null)
    try {
      if (kind === 'extract') await window.api.rpf.extract(n.vpath)
      else if (kind === 'replace') {
        if (await window.api.rpf.replace(n.vpath)) alert(t('archives.replaced'))
      } else if (kind === 'reveal') await window.api.rpf.showInFolder(n.vpath)
      else setPreview({ name: n.name, text: await window.api.rpf.readText(n.vpath) })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const grouped = useMemo(() => {
    if (!listing) return []
    const q = query.trim().toLowerCase()
    const rows = listing.nodes.filter((n) => !q || n.name.toLowerCase().includes(q))
    const byCat = new Map<NodeCategory, ExplorerNode[]>()
    for (const n of rows) {
      if (!byCat.has(n.category)) byCat.set(n.category, [])
      byCat.get(n.category)!.push(n)
    }
    const cmp = (a: ExplorerNode, b: ExplorerNode): number => {
      let c = 0
      if (sort.col === 'size') c = a.size - b.size
      else if (sort.col === 'type') c = a.typeLabel.localeCompare(b.typeLabel)
      else c = a.name.localeCompare(b.name)
      return c * sort.dir
    }
    return CAT_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      cat: c,
      items: byCat.get(c)!.sort(cmp),
    }))
  }, [listing, query, sort])

  const totalRows = grouped.reduce((s, g) => s + g.items.length, 0)
  const selNode = listing?.nodes.find((n) => n.vpath === sel)

  if (!game?.valid) {
    return (
      <div className="px-7 py-6">
        <EmptyState icon={<HardDrive className="size-7" />} title={t('archives.setFolderFirst')} />
      </div>
    )
  }

  const segs = vpath ? vpath.split('/') : []
  const canReveal = listing?.mode === 'fs'
  const canCopyToMods =
    listing?.mode === 'rpf' && !vpath.toLowerCase().startsWith('mods/') && !listing.error

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">{t('archives.title')}</h1>
        <p className="text-[12px] text-ink-faint">{t('archives.subtitle')}</p>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left tree */}
        <div className="w-60 shrink-0 overflow-y-auto border-r border-line p-2">
          <button
            onClick={() => go('')}
            className={cn(
              'no-drag mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] font-medium hover:bg-bg-hover',
              vpath === '' && 'bg-bg-hover text-ink',
            )}
          >
            <HardDrive className="size-3.5 text-brand-hi" />
            GTA V
          </button>
          {root.map((n) => (
            <TreeItem
              key={n.vpath}
              node={n}
              depth={1}
              current={vpath}
              onGo={go}
              fetchList={fetchList}
            />
          ))}
        </div>

        {/* right pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* toolbar */}
          <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
            <ToolBtn disabled={hi <= 0} onClick={back} title={t('common.back')}>
              <ArrowLeft className="size-4" />
            </ToolBtn>
            <ToolBtn disabled={hi >= hist.length - 1} onClick={fwd} title={t('common.next')}>
              <ArrowRight className="size-4" />
            </ToolBtn>
            <ToolBtn disabled={!vpath} onClick={up} title={t('archives.up')}>
              <ArrowUp className="size-4" />
            </ToolBtn>

            <div className="mx-1.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-md border border-line bg-bg px-2 py-1 text-[12px]">
              <button
                className="no-drag shrink-0 font-medium text-brand-hi hover:underline"
                onClick={() => go('')}
              >
                GTA V
              </button>
              {segs.map((s, i) => (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  <span className="text-ink-faint">/</span>
                  <button
                    className={cn(
                      'no-drag hover:text-ink',
                      s.toLowerCase().endsWith('.rpf') ? 'font-mono text-brand-hi' : 'text-ink-soft',
                    )}
                    onClick={() => go(segs.slice(0, i + 1).join('/'))}
                  >
                    {s}
                  </button>
                </span>
              ))}
            </div>

            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('archives.search')}
                className="no-drag h-7 w-28 rounded-md border border-line bg-bg pl-7 pr-2 text-[12px] outline-none placeholder:text-ink-faint focus:border-brand/50"
              />
            </div>

            {listing?.mode === 'rpf' && !listing.error && (
              <span
                className={cn(
                  'shrink-0 text-[10px] font-semibold uppercase',
                  listing.writable ? 'text-good' : 'text-ink-faint',
                )}
              >
                {listing.writable ? t('archives.editable') : t('archives.readOnly')}
              </span>
            )}
            {canCopyToMods && (
              <button
                className="no-drag shrink-0 whitespace-nowrap rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:text-ink"
                title={t('archives.copyToMods')}
                onClick={async () => {
                  const rel = await window.api.rpf.copyToMods(vpath)
                  go(rel)
                }}
              >
                → mods/
              </button>
            )}
            {canReveal && (
              <ToolBtn onClick={() => window.api.rpf.showInFolder(vpath)} title="Explorer">
                <FolderInput className="size-4" />
              </ToolBtn>
            )}
          </div>

          {/* column header */}
          <div className="grid grid-cols-[1fr_150px_90px] gap-2 border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {(['name', 'type', 'size'] as SortCol[]).map((col) => (
              <button
                key={col}
                className={cn('no-drag flex items-center gap-1', col === 'size' && 'justify-end')}
                onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 1 ? -1 : 1 }))}
              >
                {t(`archives.${col}`)}
                {sort.col === col && (sort.dir === 1 ? '▲' : '▼')}
              </button>
            ))}
          </div>

          {/* list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : listing?.error === 'ng' ||
              listing?.error === 'ng-nokeys' ||
              listing?.error === 'ng-failed' ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-ink-faint">
                {t(
                  listing.error === 'ng-nokeys'
                    ? 'archives.ngNoKeys'
                    : listing.error === 'ng-failed'
                      ? 'archives.ngFailed'
                      : 'archives.ngNote',
                )}
              </div>
            ) : listing?.error ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-bad">
                {listing.error}
              </div>
            ) : totalRows === 0 ? (
              <div className="py-10 text-center text-[12px] text-ink-faint">—</div>
            ) : (
              grouped.map((g) => (
                <div key={g.cat}>
                  <div className="bg-bg-raised px-3 py-1 text-[11px] font-semibold text-ink-faint">
                    {CAT_LABEL[g.cat]} ({g.items.length})
                  </div>
                  {g.items.map((n) => (
                    <div
                      key={n.vpath}
                      onClick={() => setSel(n.vpath)}
                      onDoubleClick={() => openNode(n)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setSel(n.vpath)
                        setMenu({ x: e.clientX, y: e.clientY, node: n })
                      }}
                      className={cn(
                        'grid cursor-default select-none grid-cols-[1fr_150px_90px] items-center gap-2 border-b border-line/40 px-3 py-1.5 text-[13px]',
                        sel === n.vpath ? 'bg-brand/15' : 'hover:bg-bg-hover',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <NodeIcon node={n} />
                        <span className="truncate">{n.name}</span>
                      </span>
                      <span className="truncate text-[12px] text-ink-faint">{n.typeLabel}</span>
                      <span className="text-right text-[12px] text-ink-faint">{human(n.size)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* preview */}
          {preview && (
            <div className="max-h-64 shrink-0 border-t border-line">
              <div className="flex items-center justify-between bg-bg-raised px-3 py-1">
                <span className="truncate font-mono text-[11px] text-ink-soft">{preview.name}</span>
                <button className="no-drag text-ink-faint hover:text-ink" onClick={() => setPreview(null)}>
                  <X className="size-3.5" />
                </button>
              </div>
              <pre className="max-h-52 overflow-auto p-3 text-[11px] leading-relaxed text-ink-soft">
                {preview.text}
              </pre>
            </div>
          )}

          {/* status bar */}
          <div className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-ink-faint">
            {tc('archives.items', totalRows)}
            {selNode && selNode.kind === 'file' && (
              <span className="ml-3">
                {t('archives.selectedInfo', { name: selNode.name, size: human(selNode.size) || '—' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border border-line bg-bg-card py-1 text-[13px] shadow-card"
          style={{ left: menu.x, top: menu.y }}
        >
          {(menu.node.kind === 'dir' || menu.node.kind === 'rpf') && (
            <MenuItem onClick={() => openNode(menu.node)}>{t('archives.open')}</MenuItem>
          )}
          {menu.node.kind === 'file' && (
            <>
              {TEXT_EXT.test(menu.node.name) && (
                <MenuItem onClick={() => act(menu.node, 'preview')}>
                  <Eye className="size-3.5" /> {t('archives.preview')}
                </MenuItem>
              )}
              <MenuItem onClick={() => act(menu.node, 'extract')}>
                <Download className="size-3.5" /> {t('archives.extract')}
              </MenuItem>
              {listing?.writable && (
                <MenuItem onClick={() => act(menu.node, 'replace')}>
                  <Upload className="size-3.5" /> {t('archives.replace')}
                </MenuItem>
              )}
            </>
          )}
          {listing?.mode === 'fs' && (
            <MenuItem onClick={() => act(menu.node, 'reveal')}>
              <FolderInput className="size-3.5" /> Explorer
            </MenuItem>
          )}
        </div>
      )}
    </div>
  )
}

function ToolBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
}): ReactNode {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="no-drag shrink-0 rounded p-1 text-ink-soft hover:bg-bg-hover hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }): ReactNode {
  return (
    <button
      onClick={onClick}
      className="no-drag flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover"
    >
      {children}
    </button>
  )
}
