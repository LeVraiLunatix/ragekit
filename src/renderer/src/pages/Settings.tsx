import { useEffect, useState, type ReactNode } from 'react'
import {
  FolderSearch,
  FolderOpen,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ScanLine,
  KeyRound,
  RefreshCw,
  ArrowUpCircle,
} from 'lucide-react'
import type { IntegrityReport, LanguageCode } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useI18n, LANGUAGE_ORDER, NATIVE_NAME, LANG_LABEL } from '@/i18n'
import { Page } from '@/components/Page'
import { Button, Card, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

function NgKeysCard(): ReactNode {
  const { t } = useI18n()
  const [status, setStatus] = useState<{
    magicCached: boolean
    ready: boolean
    reason: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.ng.status().then(setStatus)
  }, [])

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-brand" />
        <h2 className="text-sm font-semibold">{t('settings.ngTitle')}</h2>
        {status &&
          (status.ready ? (
            <Badge tone="good">
              <CheckCircle2 className="size-3" /> {t('settings.ngReady')}
            </Badge>
          ) : status.magicCached ? (
            <Badge tone="warn">{t('settings.ngPartial')}</Badge>
          ) : (
            <Badge tone="neutral">{t('settings.ngNone')}</Badge>
          ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{t('settings.ngSub')}</p>
      <div className="mt-3">
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              setStatus(await window.api.ng.download())
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <KeyRound className="size-4" />
          {busy ? t('settings.ngDownloading') : t('settings.ngLocate')}
        </Button>
      </div>
      {status?.reason && !status.ready && (
        <p className="mt-2 rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 font-mono text-[11px] text-bad">
          {status.reason}
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t('settings.ngNote')}</p>
    </Card>
  )
}

function IntegrityCard(): ReactNode {
  const { t, relative } = useI18n()
  const game = useAppStore((s) => s.config?.game ?? null)
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [busy, setBusy] = useState<null | 'take' | 'verify'>(null)

  useEffect(() => {
    if (game?.valid) void window.api.integrity.verify().then(setReport)
  }, [game?.valid])

  const run = async (kind: 'take' | 'verify'): Promise<void> => {
    setBusy(kind)
    try {
      if (kind === 'take') await window.api.integrity.take()
      setReport(await window.api.integrity.verify())
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand" />
        <h2 className="text-sm font-semibold">{t('integrity.title')}</h2>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{t('integrity.body')}</p>

      <div className="mt-3 text-[12px]">
        {!report?.hasSnapshot ? (
          <span className="text-ink-faint">{t('integrity.none')}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-faint">
              {t('integrity.takenAt', {
                time: report.takenAt ? relative(report.takenAt) : '?',
              })}
            </span>
            {report.ok ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> {t('integrity.clean')}
              </Badge>
            ) : (
              <>
                {report.changed.length > 0 && (
                  <Badge tone="bad">{t('integrity.changed', { count: report.changed.length })}</Badge>
                )}
                {report.missing.length > 0 && (
                  <Badge tone="bad">{t('integrity.missing', { count: report.missing.length })}</Badge>
                )}
                {report.extra.length > 0 && (
                  <Badge tone="warn">{t('integrity.extra', { count: report.extra.length })}</Badge>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" loading={busy === 'take'} disabled={!game?.valid} onClick={() => run('take')}>
          <ScanLine className="size-4" />
          {t('integrity.take')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'verify'}
          disabled={!game?.valid || !report?.hasSnapshot}
          onClick={() => run('verify')}
        >
          {t('integrity.verify')}
        </Button>
        {report?.hasSnapshot && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await window.api.integrity.clear()
              setReport(await window.api.integrity.verify())
            }}
          >
            {t('integrity.clear')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function UpdatesCard(): ReactNode {
  const { t } = useI18n()
  const version = useAppStore((s) => s.appVersion)
  const update = useAppStore((s) => s.update)
  const [busy, setBusy] = useState(false)

  const line =
    update.state === 'checking'
      ? t('update.checking')
      : update.state === 'downloading'
        ? t('update.downloading', { version: update.version ?? '' })
        : update.state === 'ready'
          ? t('update.ready', { version: update.version ?? '' })
          : update.state === 'error'
            ? update.message || t('update.error')
            : update.state === 'dev'
              ? t('update.dev')
              : t('update.upToDate')

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="size-4 text-brand" />
        <h2 className="text-sm font-semibold">{t('update.title')}</h2>
        {version && <Badge tone="neutral">v{version}</Badge>}
      </div>
      <p
        className={cn(
          'mt-2 text-[12px] leading-relaxed',
          update.state === 'error' ? 'text-bad' : 'text-ink-faint',
        )}
      >
        {line}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={busy || update.state === 'checking'}
          disabled={update.state === 'dev' || update.state === 'downloading'}
          onClick={async () => {
            setBusy(true)
            try {
              await window.api.update.check()
            } finally {
              setBusy(false)
            }
          }}
        >
          <RefreshCw className="size-4" />
          {t('update.checkNow')}
        </Button>
        {update.state === 'ready' && (
          <Button size="sm" variant="primary" onClick={() => void window.api.update.install()}>
            {t('update.restart')}
          </Button>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t('update.note')}</p>
    </Card>
  )
}

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
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-md text-[10px] font-bold tracking-wider',
                  language === code ? 'bg-brand/20 text-brand-hi' : 'bg-bg-hover text-ink-soft',
                )}
              >
                {LANG_LABEL[code]}
              </span>
              {NATIVE_NAME[code]}
            </button>
          ))}
        </div>
      </Card>

      <UpdatesCard />
      <IntegrityCard />
      <NgKeysCard />

      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">{t('settings.note')}</p>
    </Page>
  )
}
