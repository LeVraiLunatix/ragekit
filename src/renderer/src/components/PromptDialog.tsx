import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useI18n } from '@/i18n'
import { Button } from './ui'

interface PromptOpts {
  title: string
  initial?: string
  placeholder?: string
  confirmLabel?: string
}

type PromptFn = (opts: PromptOpts) => Promise<string | null>

const Ctx = createContext<PromptFn | null>(null)

export function PromptProvider({ children }: { children: ReactNode }): ReactNode {
  const { t } = useI18n()
  const [opts, setOpts] = useState<PromptOpts | null>(null)
  const [value, setValue] = useState('')
  const resolver = useRef<((v: string | null) => void) | null>(null)

  const prompt = useCallback<PromptFn>((o) => {
    setOpts(o)
    setValue(o.initial ?? '')
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (result: string | null): void => {
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }

  return (
    <Ctx.Provider value={prompt}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onMouseDown={() => close(null)}
        >
          <div
            className="w-[min(400px,100%)] rounded-xl border border-line bg-bg-card p-5 shadow-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold">{opts.title}</p>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && value.trim()) close(value.trim())
                if (e.key === 'Escape') close(null)
              }}
              placeholder={opts.placeholder}
              className="mt-3 h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13px] outline-none placeholder:text-ink-faint focus:border-brand/50"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => close(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!value.trim()}
                onClick={() => close(value.trim())}
              >
                {opts.confirmLabel ?? t('common.ok')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export function usePrompt(): PromptFn {
  const fn = useContext(Ctx)
  if (!fn) throw new Error('usePrompt must be used within <PromptProvider>')
  return fn
}
