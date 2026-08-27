/**
 * Fallback `window.api` for running the renderer in a plain browser (no Electron
 * preload). Lets the UI be developed / inspected via `vite` alone. In Electron
 * the real preload bridge is already present, so this is a no-op there.
 */
import type { Api } from '../../../preload'
import type { AppConfig } from '@shared/types'

if (typeof window !== 'undefined' && !window.api) {
  let config: AppConfig = {
    game: null,
    language: 'fr',
    onboarded: false,
    activeProfileId: null,
    onlineWarningAccepted: false,
    onlineSafeMode: false,
    theme: 'dark',
  }
  const noop = (): void => {}
  let mockProfiles: Array<{ id: string; name: string; enabledMods: string[] }> = []

  const mock: Api = {
    config: {
      get: async () => config,
      setGame: async (game) => (config = { ...config, game }),
      setLanguage: async (language) => (config = { ...config, language }),
      completeOnboarding: async () => (config = { ...config, onboarded: true }),
    },
    game: {
      detect: async () => ({
        path: 'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
        platform: 'steam' as const,
        valid: true,
        version: '1.0.3095.0',
      }),
      browse: async () => ({
        path: 'D:\\Games\\GTAV',
        platform: 'manual' as const,
        valid: true,
        version: '1.0.3095.0',
      }),
      validate: async (path) => ({ path, platform: 'manual' as const, valid: true }),
    },
    mods: {
      list: async () => [],
      import: async () => [],
      importPaths: async () => [],
      plan: async () => ({ modId: '', kind: 'dropin', files: [], warnings: [], missingDependencies: [], dlcPacks: [] }),
      install: async () => ({ ...mockMod }),
      uninstall: async () => ({ ...mockMod }),
      setEnabled: async () => ({ ...mockMod }),
      remove: async () => {},
      reorder: async () => ({ ...mockMod }),
      openFolder: async () => {},
      move: async () => [],
      conflicts: async () => [],
      scan: async () => [],
      adopt: async () => [],
    },
    profiles: {
      list: async () => mockProfiles,
      create: async (name: string) => {
        const p = { id: `p${Date.now()}`, name, enabledMods: [] as string[] }
        mockProfiles.push(p)
        return p
      },
      rename: async (id: string, name: string) => {
        const p = mockProfiles.find((x) => x.id === id)!
        p.name = name
        return p
      },
      remove: async (id: string) => {
        mockProfiles = mockProfiles.filter((x) => x.id !== id)
      },
      capture: async (id: string) => mockProfiles.find((x) => x.id === id)!,
      setMods: async (id: string, modIds: string[]) => {
        const p = mockProfiles.find((x) => x.id === id)!
        p.enabledMods = modIds
        return p
      },
      apply: async () => {},
    },
    deps: { status: async () => [] },
    diagnostics: { read: async () => [] },
    integrity: {
      take: async () => ({ takenAt: new Date().toISOString(), entries: [] }),
      verify: async () => ({ hasSnapshot: false, ok: true, changed: [], missing: [], extra: [] }),
      clear: async () => {},
    },
    rpf: {
      list: async () => [
        { rel: 'update/update.rpf', sizeBytes: 1258291200, encryption: 'AES' as const, inMods: false },
        { rel: 'x64a.rpf', sizeBytes: 2147483648, encryption: 'AES' as const, inMods: false },
        { rel: 'mods/update/update.rpf', sizeBytes: 1258291200, encryption: 'AES' as const, inMods: true },
      ],
      open: async (chain: string[]) => {
        const d = (name: string, path: string) => ({
          name,
          path,
          isDir: true,
          isResource: false,
          isNestedRpf: false,
          size: 0,
        })
        const f = (name: string, path: string, size: number, res = false, rpf = false) => ({
          name,
          path,
          isDir: false,
          isResource: res,
          isNestedRpf: rpf,
          size,
        })
        return {
          encryption: 'AES' as const,
          writable: chain[0].startsWith('mods/'),
          nodes: [
            d('common', 'common'),
            d('x64', 'x64'),
            d('data', 'common/data'),
            f('gtxd.meta', 'common/data/gtxd.meta', 4821),
            f('dlclist.xml', 'common/data/dlclist.xml', 2310),
            f('handling.meta', 'common/data/handling.meta', 91002),
            f('vehicles.meta', 'common/data/vehicles.meta', 31877),
            f('t20.yft', 'x64/t20.yft', 814722, true),
            f('t20.ytd', 'x64/t20.ytd', 5353326, true),
            f('vehicles.rpf', 'x64/vehicles.rpf', 3158016, false, true),
            f('setup2.xml', 'setup2.xml', 490),
            f('content.xml', 'content.xml', 2476),
          ],
        }
      },
      readText: async () => '<?xml version="1.0"?>\n<Example>mock</Example>',
      extract: async () => true,
      replace: async () => true,
      copyToMods: async (rel: string) => `mods/${rel}`,
    },
    remote: {
      fetch: async (url: string) => ({
        url,
        name: 'Mock remote mod',
        author: 'someone',
        updatedAt: new Date().toISOString(),
        downloadUrl: url + '/download/1',
        autoInstallable: true,
      }),
      install: async () => ({
        mod: { ...mockMod },
        plan: { modId: 'mock', kind: 'dropin' as const, files: [], warnings: [], missingDependencies: [], dlcPacks: [] },
      }),
      checkUpdates: async () => [],
    },
    online: {
      setMode: async (active) => {
        config = { ...config, onlineSafeMode: active }
        return { active, moved: [] }
      },
      isGameRunning: async () => false,
    },
    misc: { openExternal: async () => {}, openGameFolder: async () => {}, pathForFile: () => '' },
    on: { taskProgress: () => noop, modsChanged: () => noop },
  }

  const mockMod = {
    id: 'mock',
    name: 'Mock mod',
    kind: 'dropin' as const,
    status: 'not-installed' as const,
    addedAt: new Date().toISOString(),
    sourceDir: '',
    installedFiles: [],
    loadOrder: 0,
    tags: [],
  }

  window.api = mock
}
