import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Undo2,
  Power,
  PowerOff,
  Download,
  Trash2,
  PackagePlus,
  Layers,
  History,
} from 'lucide-react'
import type { ActivityEntry, ActivityKind } from '@shared/types'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'

const ICONS: Record<ActivityKind, ReactNode> = {
  enable: <Power className="size-3.5 text-good" />,
  install: <Power className="size-3.5 text-good" />,
  bulkEnable: <Power className="size-3.5 text-good" />,
  disable: <PowerOff className="size-3.5 text-ink-faint" />,
  bulkDisable: <PowerOff className="size-3.5 text-ink-faint" />,
  uninstall: <PowerOff className="size-3.5 text-ink-faint" />,
  remove: <Trash2 className="size-3.5 text-bad" />,
  adopt: <Download className="size-3.5 text-brand" />,
  import: <PackagePlus className="size-3.5 text-brand" />,
  profileApply: <Layers className="size-3.5 text-brand" />,
}

export function ActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const { t, tc, relative } = useI18n()
  const { refreshMods, refreshDeps } = useAppStore()
  const [items, setItems] = useState<ActivityEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.api.activity.list().then(setItems)
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  useEffect(() => window.api.on.modsChanged(load), [load])

  const undo = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      await window.api.activity.undo(id)
      await Promise.all([refreshMods(), refreshDeps()])
      load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 ${open ? '' : 'pointer-events-none'}`}
      />
      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : 340 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="fixed right-0 top-0 z-50 flex h-full w-[340px] flex-col border-l border-line bg-bg-raised shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <History className="size-4 text-brand" />
          <h2 className="flex-1 text-sm font-semibold">{t('activity.title')}</h2>
          <button
            onClick={() => {
              void window.api.activity.clear().then(load)
            }}
            className="no-drag text-[11px] text-ink-faint hover:text-ink"
          >
            {t('activity.clear')}
          </button>
          <button
            onClick={onClose}
            className="no-drag grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-bg-hover hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] text-ink-faint">{t('activity.empty')}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-line/60 bg-bg-card/60 px-3 py-2 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    {ICONS[e.kind]}
                    <span className="font-medium">{t(`activity.kind.${e.kind}`)}</span>
                    <span className="text-ink-faint">·</span>
                    <span className="text-ink-faint">{tc('library.count', e.modIds.length)}</span>
                    <span className="ml-auto text-[10.5px] text-ink-faint">{relative(e.at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                    {e.modNames.slice(0, 4).join(', ')}
                    {e.modNames.length > 4 ? ` +${e.modNames.length - 4}` : ''}
                  </p>
                  {e.undo && (
                    <button
                      disabled={busy === e.id}
                      onClick={() => void undo(e.id)}
                      className="no-drag mt-1.5 inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-50"
                    >
                      <Undo2 className="size-3" />
                      {t('activity.undo')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.aside>
    </>
  )
}
