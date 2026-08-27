import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Gamepad2,
  FolderSearch,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Check,
} from 'lucide-react'
import type { LanguageCode } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n, LANGUAGE_ORDER, NATIVE_NAME, FLAG } from '@/i18n'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { StepShell } from './StepShell'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const MIDDLE_STEPS = 3 // language, game, safety

function Aurora(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-32 -top-32 size-[420px] rounded-full bg-brand/20 blur-[120px]"
        animate={{ x: [0, 40, -10, 0], y: [0, 30, 60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-24 size-[460px] rounded-full bg-indigo-500/15 blur-[130px]"
        animate={{ x: [0, -30, 20, 0], y: [0, -40, -10, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }): ReactNode {
  const { t } = useI18n()
  return (
    <StepShell
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      primary={{ label: t('onboarding.welcome.cta'), onClick: onNext }}
    >
      <motion.div
        className="relative mx-auto my-2 grid size-24 place-items-center rounded-2xl bg-gradient-to-br from-brand/25 to-brand/5"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        <motion.span
          className="absolute inset-0 rounded-2xl ring-1 ring-brand/40"
          animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <Gamepad2 className="size-11 text-brand-hi" />
      </motion.div>
    </StepShell>
  )
}

function LanguageStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}): ReactNode {
  const { t, language } = useI18n()
  const setLanguage = useAppStore((s) => s.setLanguage)

  return (
    <StepShell
      eyebrow={t('onboarding.stepOf', { current: 1, total: MIDDLE_STEPS })}
      title={t('onboarding.language.title')}
      subtitle={t('onboarding.language.subtitle')}
      onBack={onBack}
      progress={{ current: 1, total: MIDDLE_STEPS }}
      primary={{ label: t('common.continue'), onClick: onNext }}
    >
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGE_ORDER.map((code: LanguageCode) => {
          const active = language === code
          return (
            <button
              key={code}
              onClick={() => void setLanguage(code)}
              className={cn(
                'no-drag relative flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-brand/60 bg-brand/10'
                  : 'border-line bg-bg-card hover:border-ink-faint/50',
              )}
            >
              {active && (
                <motion.span
                  layoutId="lang-active"
                  className="absolute inset-0 rounded-xl ring-2 ring-brand/50"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="text-2xl leading-none">{FLAG[code]}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{NATIVE_NAME[code]}</span>
                <span className="block truncate text-[11px] text-ink-faint">{t(`lang.${code}`)}</span>
              </span>
              {active && <Check className="ml-auto size-4 shrink-0 text-brand-hi" />}
            </button>
          )
        })}
      </div>
    </StepShell>
  )
}

function GameStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}): ReactNode {
  const { t } = useI18n()
  const { config, setGame } = useAppStore()
  const game = config?.game ?? null
  const [detecting, setDetecting] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [triedAuto, setTriedAuto] = useState(false)

  const runDetect = async (): Promise<void> => {
    setDetecting(true)
    try {
      const found = await window.api.game.detect()
      if (found) await setGame(found)
    } finally {
      setDetecting(false)
      setTriedAuto(true)
    }
  }

  const runBrowse = async (): Promise<void> => {
    setBrowsing(true)
    try {
      const picked = await window.api.game.browse()
      if (picked) await setGame(picked)
    } finally {
      setBrowsing(false)
    }
  }

  useEffect(() => {
    if (!game && !detecting) void runDetect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status: ReactNode = detecting ? (
    <div className="flex items-center gap-2.5 text-[13px] text-ink-soft">
      <Loader2 className="size-4 animate-spin text-brand" />
      {t('onboarding.game.detecting')}
    </div>
  ) : game?.valid ? (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-good">
        <CheckCircle2 className="size-4" />
        {t('onboarding.game.valid')}
      </div>
      <p className="break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11.5px] text-ink-soft">
        {game.path}
      </p>
      <p className="text-[11px] text-ink-faint">
        {t('onboarding.game.detectedVia', { platform: game.platform })}
        {game.version && ` · ${t('onboarding.game.version', { version: game.version })}`}
      </p>
    </div>
  ) : game && !game.valid ? (
    <div className="flex items-center gap-2 text-[13px] text-warn">
      <AlertTriangle className="size-4" />
      {t('onboarding.game.invalid')}
    </div>
  ) : triedAuto ? (
    <p className="text-[13px] text-ink-faint">{t('onboarding.game.notFound')}</p>
  ) : null

  return (
    <StepShell
      eyebrow={t('onboarding.stepOf', { current: 2, total: MIDDLE_STEPS })}
      title={t('onboarding.game.title')}
      subtitle={t('onboarding.game.subtitle')}
      onBack={onBack}
      progress={{ current: 2, total: MIDDLE_STEPS }}
      primary={{
        label: t('common.continue'),
        onClick: onNext,
        disabled: !game?.valid,
      }}
    >
      <div className="min-h-[92px] rounded-xl border border-line bg-bg-card p-3.5">{status}</div>

      <div className="flex gap-2">
        <Button size="sm" loading={detecting} onClick={runDetect}>
          <FolderSearch className="size-4" />
          {t('onboarding.game.autoDetect')}
        </Button>
        <Button size="sm" loading={browsing} onClick={runBrowse}>
          <FolderOpen className="size-4" />
          {t('onboarding.game.browse')}
        </Button>
        <div className="flex-1" />
        {!game?.valid && (
          <Button size="sm" variant="ghost" onClick={onNext}>
            {t('onboarding.game.later')}
          </Button>
        )}
      </div>
    </StepShell>
  )
}

function SafetyStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}): ReactNode {
  const { t } = useI18n()
  const [accepted, setAccepted] = useState(false)

  return (
    <StepShell
      eyebrow={t('onboarding.stepOf', { current: 3, total: MIDDLE_STEPS })}
      title={t('onboarding.safety.title')}
      onBack={onBack}
      progress={{ current: 3, total: MIDDLE_STEPS }}
      primary={{ label: t('common.continue'), onClick: onNext, disabled: !accepted }}
    >
      <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn/10 p-3.5">
        <ShieldAlert className="size-5 shrink-0 text-warn" />
        <div className="space-y-2 text-[12.5px] leading-relaxed text-ink-soft">
          <p>{t('onboarding.safety.body1')}</p>
          <p className="font-medium text-ink">{t('onboarding.safety.body2')}</p>
        </div>
      </div>

      <button
        onClick={() => setAccepted((v) => !v)}
        className="no-drag flex items-center gap-3 rounded-xl border border-line bg-bg-card p-3 text-left transition-colors hover:border-ink-faint/50"
      >
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
            accepted ? 'border-brand bg-brand text-black' : 'border-line',
          )}
        >
          {accepted && <Check className="size-3.5" />}
        </span>
        <span className="text-[13px] font-medium">{t('onboarding.safety.checkbox')}</span>
      </button>
    </StepShell>
  )
}

function DoneStep({ onBack }: { onBack: () => void }): ReactNode {
  const { t } = useI18n()
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)
  const [finishing, setFinishing] = useState(false)

  return (
    <StepShell
      title={t('onboarding.done.title')}
      subtitle={t('onboarding.done.subtitle')}
      onBack={onBack}
      primary={{
        label: t('onboarding.done.cta'),
        loading: finishing,
        onClick: async () => {
          setFinishing(true)
          await completeOnboarding()
        },
      }}
    >
      <div className="relative mx-auto my-2 grid size-24 place-items-center">
        {[...Array(8)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full bg-brand"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0.5],
              x: Math.cos((i / 8) * Math.PI * 2) * 52,
              y: Math.sin((i / 8) * Math.PI * 2) * 52,
            }}
            transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
          />
        ))}
        <motion.svg viewBox="0 0 52 52" className="size-24">
          <motion.circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-good"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
          <motion.path
            d="M16 27 L23 34 L37 19"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-good"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, delay: 0.45, ease: 'easeOut' }}
          />
        </motion.svg>
      </div>
    </StepShell>
  )
}

export function Onboarding(): ReactNode {
  const [[step, dir], setStep] = useState<[number, number]>([0, 1])
  const go = (next: number): void => setStep([next, next > step ? 1 : -1])

  const steps = useMemo(
    () => [
      <WelcomeStep key="welcome" onNext={() => go(1)} />,
      <LanguageStep key="language" onNext={() => go(2)} onBack={() => go(0)} />,
      <GameStep key="game" onNext={() => go(3)} onBack={() => go(1)} />,
      <SafetyStep key="safety" onNext={() => go(4)} onBack={() => go(2)} />,
      <DoneStep key="done" onBack={() => go(3)} />,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step],
  )

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-bg">
      <Aurora />
      <div className="drag-region absolute inset-x-0 top-0 h-9" />
      <div className="relative w-[min(460px,calc(100vw-48px))]">
        <div className="rounded-2xl border border-line bg-bg-card/85 p-7 shadow-card backdrop-blur-xl">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d > 0 ? 36 : -36, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d > 0 ? -36 : 36, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.26, ease: EASE }}
            >
              {steps[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
