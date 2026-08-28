import { create } from 'zustand'
import type {
  AppConfig,
  DependencyStatus,
  GameInfo,
  LanguageCode,
  LaunchReport,
  Mod,
  Profile,
} from '@shared/types'
import type { FileConflict } from '../../../preload'

export type Route =
  | 'library'
  | 'add'
  | 'profiles'
  | 'archives'
  | 'dependencies'
  | 'diagnostics'
  | 'settings'

interface AppState {
  ready: boolean
  route: Route
  config: AppConfig | null
  mods: Mod[]
  deps: DependencyStatus[]
  profiles: Profile[]
  conflicts: FileConflict[]
  busy: string | null
  lastLaunch: LaunchReport | null
  launching: boolean

  setRoute: (r: Route) => void
  setBusy: (label: string | null) => void
  bootstrap: () => Promise<void>
  refreshMods: () => Promise<void>
  refreshDeps: () => Promise<void>
  refreshProfiles: () => Promise<void>
  setGame: (game: GameInfo | null) => Promise<void>
  setLanguage: (language: LanguageCode) => Promise<void>
  completeOnboarding: () => Promise<void>
  setOnlineSafe: (active: boolean) => Promise<void>
  launchGame: () => Promise<void>
  launchVanilla: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  route: 'library',
  config: null,
  mods: [],
  deps: [],
  profiles: [],
  conflicts: [],
  busy: null,
  lastLaunch: null,
  launching: false,

  setRoute: (route) => set({ route }),
  setBusy: (busy) => set({ busy }),

  bootstrap: async () => {
    const [config, mods, profiles] = await Promise.all([
      window.api.config.get(),
      window.api.mods.list(),
      window.api.profiles.list(),
    ])
    set({ config, mods, profiles, ready: true })
    void get().refreshMods() // also pulls conflicts
    if (config.game?.valid) void get().refreshDeps()
    void window.api.game.lastLaunch().then((lastLaunch) => set({ lastLaunch }))
  },

  refreshMods: async () => {
    const [mods, conflicts] = await Promise.all([
      window.api.mods.list(),
      window.api.mods.conflicts(),
    ])
    set({ mods, conflicts })
  },

  refreshDeps: async () => set({ deps: await window.api.deps.status() }),

  refreshProfiles: async () => set({ profiles: await window.api.profiles.list() }),

  setGame: async (game) => {
    const config = await window.api.config.setGame(game)
    set({ config })
    await get().refreshDeps()
  },

  setLanguage: async (language) => {
    const config = await window.api.config.setLanguage(language)
    set({ config })
  },

  completeOnboarding: async () => {
    const config = await window.api.config.completeOnboarding()
    set({ config })
  },

  setOnlineSafe: async (active) => {
    await window.api.online.setMode(active)
    const [config] = await Promise.all([window.api.config.get(), get().refreshMods()])
    set({ config })
  },

  launchGame: async () => {
    if (get().launching) return
    set({ launching: true, route: 'diagnostics' })
    try {
      const report = await window.api.game.launch()
      set({ lastLaunch: report })
      await get().refreshDeps()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      set({ launching: false })
    }
  },

  launchVanilla: async () => {
    if (get().launching) return
    set({ launching: true, route: 'diagnostics' })
    try {
      if (!get().config?.onlineSafeMode) {
        await window.api.online.setMode(true)
        const [config] = await Promise.all([window.api.config.get(), get().refreshMods()])
        set({ config })
      }
      const report = await window.api.game.launch()
      set({ lastLaunch: report })
      await get().refreshDeps()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      set({ launching: false })
    }
  },
}))
