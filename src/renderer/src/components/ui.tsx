import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
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
    'bg-brand text-black font-medium hover:bg-brand-hi disabled:bg-brand-dim disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:text-ink hover:bg-bg-hover',
  outline: 'border border-line text-ink-soft hover:text-ink hover:border-ink-faint bg-transparent',
  danger: 'bg-bad/15 text-bad hover:bg-bad/25 border border-bad/30',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
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
        'no-drag inline-flex items-center justify-center whitespace-nowrap transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:cursor-not-allowed',
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
        onClick && 'cursor-pointer hover:border-ink-faint/60 transition-colors',
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
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
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
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'no-drag relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40',
        checked ? 'bg-brand border-brand' : 'bg-bg-hover border-line',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-black transition-all',
          checked ? 'left-[18px]' : 'left-[3px] bg-ink-faint',
        )}
      />
    </button>
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-16 text-center">
      <div className="mb-3 text-ink-faint">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-ink-faint">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
