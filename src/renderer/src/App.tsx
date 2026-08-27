import { useEffect, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { I18nProvider, useI18n } from '@/i18n'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Spinner } from '@/components/ui'
import { LibraryPage } from '@/pages/Library'
import { AddModsPage } from '@/pages/AddMods'
import { DependenciesPage } from '@/pages/Dependencies'
import { SettingsPage } from '@/pages/Settings'
import { Onboarding } from '@/onboarding/Onboarding'

function OnlineSafeBanner(): ReactNode {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2.5 border-b border-good/20 bg-good/10 px-4 py-2 text-[12.5px] text-good">
      <ShieldCheck className="size-4 shrink-0" />
      <span className="font-medium">{t('online.bannerTitle')}</span>
      <span className="hidden text-good/80 sm:inline">— {t('online.bannerBody')}</span>
    </div>
  )
}

function Shell(): ReactNode {
  const route = useAppStore((s) => s.route)
  const safe = useAppStore((s) => !!s.config?.onlineSafeMode)
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {safe && <OnlineSafeBanner />}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {route === 'library' && <LibraryPage />}
          {route === 'add' && <AddModsPage />}
          {route === 'dependencies' && <DependenciesPage />}
          {route === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}

export default function App(): ReactNode {
  const { ready, config, bootstrap, refreshMods, refreshDeps } = useAppStore()

  useEffect(() => {
    void bootstrap()
    return window.api.on.modsChanged(() => {
      void refreshMods()
      void refreshDeps()
    })
  }, [bootstrap, refreshMods, refreshDeps])

  return (
    <I18nProvider>
      {!ready || !config ? (
        <div className="flex h-full items-center justify-center gap-2 text-ink-faint">
          <Spinner />
        </div>
      ) : !config.onboarded ? (
        <Onboarding />
      ) : (
        <Shell />
      )}
    </I18nProvider>
  )
}
