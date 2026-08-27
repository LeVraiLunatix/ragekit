import { create } from 'zustand'
import type { AppConfig, DependencyStatus, GameInfo, LanguageCode, Mod } from '@shared/types'

export type Route = 'library' | 'add' | 'dependencies' | 'settings'

interface AppState {
  ready: boolean
  route: Route
  config: AppConfig | null
  mods: Mod[]
  deps: DependencyStatus[]
  busy: string | null

  setRoute: (r: Route) => void
  setBusy: (label: string | null) => void
  bootstrap: () => Promise<void>
  refreshMods: () => Promise<void>
  refreshDeps: () => Promise<void>
  setGame: (game: GameInfo | null) => Promise<void>
  setLanguage: (language: LanguageCode) => Promise<void>
  completeOnboarding: () => Promise<void>
  setOnlineSafe: (active: boolean) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  route: 'library',
  config: null,
  mods: [],
  deps: [],
  busy: null,

  setRoute: (route) => set({ route }),
  setBusy: (busy) => set({ busy }),

  bootstrap: async () => {
    const [config, mods] = await Promise.all([window.api.config.get(), window.api.mods.list()])
    set({ config, mods, ready: true })
    if (config.game?.valid) void get().refreshDeps()
  },

  refreshMods: async () => set({ mods: await window.api.mods.list() }),

  refreshDeps: async () => set({ deps: await window.api.deps.status() }),

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
}))
