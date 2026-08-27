import { useEffect, type ReactNode } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Spinner } from '@/components/ui'
import { LibraryPage } from '@/pages/Library'
import { AddModsPage } from '@/pages/AddMods'
import { DependenciesPage } from '@/pages/Dependencies'
import { SettingsPage } from '@/pages/Settings'
import { OnlineWarning } from '@/pages/OnlineWarning'

export default function App(): ReactNode {
  const { ready, route, config, bootstrap, refreshMods, refreshDeps } = useAppStore()

  useEffect(() => {
    void bootstrap()
    const offMods = window.api.on.modsChanged(() => {
      void refreshMods()
      void refreshDeps()
    })
    return offMods
  }, [bootstrap, refreshMods, refreshDeps])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-faint">
        <Spinner />
        Loading…
      </div>
    )
  }

  if (config && !config.onlineWarningAccepted) {
    return <OnlineWarning />
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
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
