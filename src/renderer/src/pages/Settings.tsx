import { useState, type ReactNode } from 'react'
import { FolderSearch, FolderOpen, CheckCircle2, XCircle } from 'lucide-react'
import type { LanguageCode } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n, LANGUAGE_ORDER, NATIVE_NAME, FLAG } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export function SettingsPage(): ReactNode {
  const { t, language } = useI18n()
  const { config, setGame, setLanguage } = useAppStore()
  const game = config?.game ?? null
  const [detecting, setDetecting] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  return (
    <Page title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('settings.gameFolder')}</h2>
          {game &&
            (game.valid ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> {t('settings.valid')}
              </Badge>
            ) : (
              <Badge tone="bad">
                <XCircle className="size-3" /> {t('settings.invalid')}
              </Badge>
            ))}
        </div>

        <p className="mt-3 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[12px] text-ink-soft">
          {game?.path ?? t('settings.notSet')}
        </p>
        {game?.version && (
          <p className="mt-1.5 text-[12px] text-ink-faint">
            {t('settings.exeInfo', { version: game.version, platform: game.platform })}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            loading={detecting}
            onClick={async () => {
              setDetecting(true)
              try {
                const found = await window.api.game.detect()
                if (found) await setGame(found)
                else alert(t('settings.detectFail'))
              } finally {
                setDetecting(false)
              }
            }}
          >
            <FolderSearch className="size-4" />
            {t('settings.autoDetect')}
          </Button>
          <Button
            loading={browsing}
            onClick={async () => {
              setBrowsing(true)
              try {
                const picked = await window.api.game.browse()
                if (picked) await setGame(picked)
              } finally {
                setBrowsing(false)
              }
            }}
          >
            <FolderOpen className="size-4" />
            {t('settings.browse')}
          </Button>
          {game && (
            <Button variant="ghost" onClick={() => setGame(null)}>
              {t('settings.clear')}
            </Button>
          )}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">{t('settings.language')}</h2>
        <p className="mt-1 text-[12px] text-ink-faint">{t('settings.languageSub')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LANGUAGE_ORDER.map((code: LanguageCode) => (
            <button
              key={code}
              onClick={() => void setLanguage(code)}
              className={cn(
                'no-drag flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                language === code
                  ? 'border-brand/60 bg-brand/10 text-ink'
                  : 'border-line text-ink-soft hover:border-ink-faint/50 hover:text-ink',
              )}
            >
              <span className="text-base leading-none">{FLAG[code]}</span>
              {NATIVE_NAME[code]}
            </button>
          ))}
        </div>
      </Card>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">{t('settings.note')}</p>
    </Page>
  )
}
