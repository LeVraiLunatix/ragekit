import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { LanguageCode } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { en, type Dict } from './locales/en'
import { fr } from './locales/fr'
import { es } from './locales/es'
import { de } from './locales/de'

export const LOCALES: Record<LanguageCode, Dict> = { en, fr, es, de }

export const LANGUAGE_ORDER: LanguageCode[] = ['fr', 'en', 'es', 'de']

/** Native, non-translated names for the language picker. */
export const NATIVE_NAME: Record<LanguageCode, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
}

export const FLAG: Record<LanguageCode, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  es: '🇪🇸',
  de: '🇩🇪',
}

type Vars = Record<string, string | number>

function resolvePath(dict: unknown, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), dict)
  return typeof value === 'string' ? value : path
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}

/** English plural rule works for en/es/de; French groups 0 and 1 as singular. */
function isSingular(lang: LanguageCode, n: number): boolean {
  return lang === 'fr' ? Math.abs(n) < 2 : n === 1
}

export interface I18n {
  language: LanguageCode
  /** Translate a dotted key, with optional {var} interpolation. */
  t: (key: string, vars?: Vars) => string
  /** Translate a pluralised key: appends `_one` / `_other` and injects `count`. */
  tc: (key: string, count: number, vars?: Vars) => string
  /** Human "x minutes ago" from an ISO timestamp. */
  relative: (iso: string) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const language = useAppStore((s) => s.config?.language ?? 'en')
  const dict = LOCALES[language] ?? en

  const t = useCallback(
    (key: string, vars?: Vars) => interpolate(resolvePath(dict, key), vars),
    [dict],
  )

  const tc = useCallback(
    (key: string, count: number, vars?: Vars) => {
      const suffix = isSingular(language, count) ? '_one' : '_other'
      return interpolate(resolvePath(dict, key + suffix), { count, ...vars })
    },
    [dict, language],
  )

  const relative = useCallback(
    (iso: string) => {
      const diffMs = Date.now() - new Date(iso).getTime()
      const min = Math.floor(diffMs / 60000)
      if (min < 1) return resolvePath(dict, 'time.justNow')
      if (min < 60) return interpolate(resolvePath(dict, 'time.minutesAgo'), { n: min })
      const hrs = Math.floor(min / 60)
      if (hrs < 24) return interpolate(resolvePath(dict, 'time.hoursAgo'), { n: hrs })
      return interpolate(resolvePath(dict, 'time.daysAgo'), { n: Math.floor(hrs / 24) })
    },
    [dict],
  )

  const value = useMemo<I18n>(() => ({ language, t, tc, relative }), [language, t, tc, relative])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>')
  return ctx
}
