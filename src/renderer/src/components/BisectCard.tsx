import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Crosshair, Check, X, Bug } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useI18n } from '@/i18n'
import { Button, Card } from '@/components/ui'

type Phase = 'idle' | 'testing' | 'done' | 'empty'

/** Guided binary search for the mod that crashes the game. */
export function BisectCard(): ReactNode {
  const { t, tc } = useI18n()
  const { mods, refreshMods, refreshDeps } = useAppStore()
  const [phase, setPhase] = useState<Phase>('idle')
  const [original, setOriginal] = useState<string[]>([])
  const [candidates, setCandidates] = useState<string[]>([])
  const [groupA, setGroupA] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const installedIds = useMemo(
    () => mods.filter((m) => m.status === 'installed').map((m) => m.id),
    [mods],
  )
  const nameOf = useMemo(() => new Map(mods.map((m) => [m.id, m.name])), [mods])

  /** Enable exactly `enableOnly`, disable the rest of `base`. */
  const applyGroup = async (base: string[], enableOnly: string[]): Promise<void> => {
    const toDisable = base.filter((id) => !enableOnly.includes(id))
    if (toDisable.length) await window.api.mods.setEnabledMany(toDisable, false)
    if (enableOnly.length) await window.api.mods.setEnabledMany(enableOnly, true)
    await Promise.all([refreshMods(), refreshDeps()])
  }

  const restore = async (): Promise<void> => {
    if (original.length) await applyGroup(original, original)
  }

  const begin = async (): Promise<void> => {
    if (installedIds.length < 2) {
      setPhase('empty')
      return
    }
    const base = installedIds
    const a = base.slice(0, Math.ceil(base.length / 2))
    setBusy(true)
    try {
      setOriginal(base)
      setCandidates(base)
      setGroupA(a)
      await applyGroup(base, a)
      setPhase('testing')
    } finally {
      setBusy(false)
    }
  }

  const answer = async (crashed: boolean): Promise<void> => {
    const next = crashed ? groupA : candidates.filter((id) => !groupA.includes(id))
    setBusy(true)
    try {
      setCandidates(next)
      if (next.length <= 1) {
        setPhase(next.length === 1 ? 'done' : 'empty')
      } else {
        const a = next.slice(0, Math.ceil(next.length / 2))
        setGroupA(a)
        await applyGroup(original, a)
      }
    } finally {
      setBusy(false)
    }
  }

  const finishKeepDisabled = async (): Promise<void> => {
    setBusy(true)
    try {
      const culprit = candidates[0]
      await window.api.mods.setEnabledMany(
        original.filter((id) => id !== culprit),
        true,
      )
      await window.api.mods.setEnabledMany([culprit], false)
      await Promise.all([refreshMods(), refreshDeps()])
    } finally {
      setBusy(false)
      setPhase('idle')
    }
  }

  const cancel = async (): Promise<void> => {
    setBusy(true)
    try {
      await restore()
    } finally {
      setBusy(false)
      setPhase('idle')
    }
  }

  const groupB = candidates.filter((id) => !groupA.includes(id))

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-2">
        <Crosshair className="size-4 text-brand" />
        <p className="text-sm font-semibold">{t('bisect.title')}</p>
        {phase !== 'idle' && (
          <span className="ml-auto text-[11px] text-ink-faint">
            {tc('bisect.remaining', candidates.length)}
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">{t('bisect.body')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            loading={busy}
            disabled={installedIds.length < 2}
            onClick={() => void begin()}
          >
            <Crosshair className="size-3.5" />
            {t('bisect.start')}
          </Button>
          {installedIds.length < 2 && (
            <p className="mt-2 text-[11px] text-warn">{t('bisect.needTwo')}</p>
          )}
        </>
      )}

      {phase === 'testing' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
          <p className="text-[12px] text-ink-soft">{t('bisect.testing')}</p>
          <div className="mt-2 rounded-lg border border-line bg-bg/40 p-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-good">
              {t('bisect.active')} · {groupA.length}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {groupA.map((id) => nameOf.get(id) ?? id).join(', ')}
            </p>
            <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('bisect.parked')} · {groupB.length}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint/70">
              {groupB.map((id) => nameOf.get(id) ?? id).join(', ') || '—'}
            </p>
          </div>
          <p className="mt-3 text-[12px] font-medium">{t('bisect.question')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" loading={busy} onClick={() => void answer(true)}>
              <X className="size-3.5" />
              {t('bisect.crashed')}
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => void answer(false)}>
              <Check className="size-3.5" />
              {t('bisect.ok')}
            </Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => void cancel()}>
              {t('bisect.cancel')}
            </Button>
          </div>
        </motion.div>
      )}

      {phase === 'done' && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-bad">
            <Bug className="size-4" />
            {t('bisect.culprit', { name: nameOf.get(candidates[0]) ?? candidates[0] })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={busy} onClick={() => void finishKeepDisabled()}>
              {t('bisect.keepDisabled')}
            </Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => void cancel()}>
              {t('bisect.restoreAll')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'empty' && (
        <div className="mt-3">
          <p className="text-[12px] text-warn">{t('bisect.notAmongMods')}</p>
          <Button size="sm" variant="ghost" className="mt-2" loading={busy} onClick={() => void cancel()}>
            {t('bisect.restoreAll')}
          </Button>
        </div>
      )}
    </Card>
  )
}
