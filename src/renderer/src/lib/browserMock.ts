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
      explore: async (vpath: string) => {
        const n = (
          name: string,
          kind: 'dir' | 'file' | 'rpf',
          size: number,
          category: string,
          typeLabel: string,
        ) => ({ name, vpath: vpath ? `${vpath}/${name}` : name, kind, size, category, typeLabel }) as never
        if (vpath === '') {
          return {
            vpath, mode: 'fs' as const, writable: false, nodes: [
              n('BattlEye', 'dir', 0, 'folder', 'Folder'),
              n('update', 'dir', 0, 'folder', 'Folder'),
              n('x64', 'dir', 0, 'folder', 'Folder'),
              n('GTA5.exe', 'file', 47467520, 'application', 'Application'),
              n('bink2w64.dll', 'file', 446464, 'dll', 'Dynamic-link library'),
              n('commandline.txt', 'file', 1024, 'text', 'Plain text'),
              n('common.rpf', 'rpf', 27000000, 'rpf', 'Rage Package File'),
              n('x64a.rpf', 'rpf', 48700000, 'rpf', 'Rage Package File'),
            ],
          }
        }
        if (vpath === 'update') {
          return { vpath, mode: 'fs' as const, writable: false, nodes: [
            n('x64', 'dir', 0, 'folder', 'Folder'),
            n('update.rpf', 'rpf', 1258291200, 'rpf', 'Rage Package File'),
          ] }
        }
        if (vpath === 'common.rpf') {
          return { vpath, mode: 'rpf' as const, writable: false, error: 'ng-nokeys', nodes: [] }
        }
        return { vpath, mode: 'rpf' as const, writable: vpath.startsWith('mods/'), encryption: 'OPEN' as const, nodes: [
          n('data', 'dir', 0, 'folder', 'Folder'),
          n('setup2.xml', 'file', 490, 'textdata', 'XML'),
          n('vehicles.meta', 'file', 31877, 'textdata', 'Meta'),
        ] }
      },
      readText: async () => '<?xml version="1.0"?>\n<Example>mock</Example>',
      extract: async () => true,
      replace: async () => true,
      copyToMods: async (v: string) => `mods/${v}`,
      showInFolder: async () => {},
    },
    ng: {
      status: async () => ({ magicCached: false, ready: false, reason: '' }),
      download: async () => ({ magicCached: true, ready: true, reason: '' }),
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
    system: {
      writable: async () => ({ elevated: true, gamePath: null, gameWritable: true }),
      relaunchAdmin: async () => false,
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
