import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'
import { useI18n } from '@/i18n'

export interface PrimaryAction {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
  onBack,
  primary,
  progress,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
  onBack?: () => void
  primary: PrimaryAction
  progress?: { current: number; total: number }
}): ReactNode {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      {progress && (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: progress.total }).map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-bg-hover">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={false}
                animate={{ width: i < progress.current ? '100%' : '0%' }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-hi">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] leading-relaxed text-ink-soft">{subtitle}</p>}
      </div>

      {children}

      <div className="flex items-center gap-3 pt-1">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t('common.back')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={primary.onClick}
          disabled={primary.disabled}
          loading={primary.loading}
        >
          {primary.label}
        </Button>
      </div>
    </div>
  )
}
