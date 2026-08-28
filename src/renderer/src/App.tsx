import { useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { I18nProvider, useI18n } from '@/i18n'
import { PromptProvider } from '@/components/PromptDialog'
import { AdminBanner } from '@/components/AdminBanner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Spinner } from '@/components/ui'
import { LibraryPage } from '@/pages/Library'
import { AddModsPage } from '@/pages/AddMods'
import { ProfilesPage } from '@/pages/Profiles'
import { LaunchPage } from '@/pages/Launch'
import { ArchivesPage } from '@/pages/Archives'
import { DependenciesPage } from '@/pages/Dependencies'
import { DiagnosticsPage } from '@/pages/Diagnostics'
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
      <AdminBanner />
      {safe && <OnlineSafeBanner />}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ErrorBoundary resetKey={route}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            >
              {route === 'library' && <LibraryPage />}
              {route === 'add' && <AddModsPage />}
              {route === 'profiles' && <ProfilesPage />}
              {route === 'launch' && <LaunchPage />}
              {route === 'archives' && <ArchivesPage />}
              {route === 'dependencies' && <DependenciesPage />}
              {route === 'diagnostics' && <DiagnosticsPage />}
              {route === 'settings' && <SettingsPage />}
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App(): ReactNode {
  const { ready, config, bootstrap, refreshMods, refreshDeps } = useAppStore()

  const refreshProfiles = useAppStore((s) => s.refreshProfiles)

  useEffect(() => {
    void bootstrap()
    return window.api.on.modsChanged(() => {
      void refreshMods()
      void refreshDeps()
      void refreshProfiles()
    })
  }, [bootstrap, refreshMods, refreshDeps, refreshProfiles])

  return (
    <I18nProvider>
      <PromptProvider>
        {!ready || !config ? (
          <div className="flex h-full items-center justify-center gap-2 text-ink-faint">
            <Spinner />
          </div>
        ) : !config.onboarded ? (
          <Onboarding />
        ) : (
          <Shell />
        )}
      </PromptProvider>
    </I18nProvider>
  )
}
