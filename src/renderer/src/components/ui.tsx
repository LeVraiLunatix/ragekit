import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { Loader2, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-black font-semibold hover:bg-brand-hi disabled:bg-brand-dim disabled:text-ink-faint shadow-[0_1px_0_rgba(255,255,255,0.2)_inset]',
  ghost: 'text-ink-soft hover:text-ink hover:bg-bg-hover',
  outline:
    'border border-line text-ink-soft hover:text-ink hover:border-ink-faint/60 hover:bg-bg-hover/50 bg-transparent',
  danger: 'bg-bad/12 text-bad hover:bg-bad/20 border border-bad/25',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'no-drag inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-150 ease-smooth active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
})

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}): ReactNode {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-line bg-bg-card shadow-card',
        onClick && 'cursor-pointer transition-colors hover:border-ink-faint/50',
        className,
      )}
    >
      {children}
    </div>
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'brand'
const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-hover text-ink-soft border-line',
  good: 'bg-good/12 text-good border-good/25',
  warn: 'bg-warn/12 text-warn border-warn/25',
  bad: 'bg-bad/12 text-bad border-bad/25',
  brand: 'bg-brand/12 text-brand-hi border-brand/25',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-drag relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200 ease-smooth disabled:opacity-40',
        checked ? 'border-brand bg-brand' : 'border-line bg-bg-hover',
      )}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
        className={cn(
          'absolute left-[3px] top-[3px] size-4 rounded-full shadow-sm',
          checked ? 'bg-black' : 'bg-ink-faint',
        )}
      />
    </button>
  )
}

export function Checkbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}): ReactNode {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'no-drag grid size-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors duration-150',
        checked ? 'border-brand bg-brand text-black' : 'border-line bg-bg hover:border-ink-faint',
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3.5} />}
    </button>
  )
}

export interface SegOption {
  value: string
  label: ReactNode
  count?: number
}

export function Segmented({
  options,
  value,
  onChange,
  className,
  name = 'seg',
}: {
  options: SegOption[]
  value: string
  onChange: (v: string) => void
  className?: string
  name?: string
}): ReactNode {
  return (
    <div className={cn('no-drag flex flex-wrap gap-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-full px-3 py-1 text-[12px] font-medium transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-faint hover:text-ink-soft',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${name}-active`}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className="absolute inset-0 -z-10 rounded-full border border-line bg-bg-hover"
              />
            )}
            {o.label}
            {o.count != null && (
              <span className={cn('ml-1.5 text-[10.5px]', active ? 'text-ink-faint' : 'text-ink-faint/60')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Spinner(): ReactNode {
  return <Loader2 className="size-4 animate-spin text-ink-faint" />
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-center">
      <div className="mb-3 text-ink-faint">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-faint">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
