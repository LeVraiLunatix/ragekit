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
  const mockLaunch = {
    exe: 'PlayGTAV.exe',
    pid: 12345,
    startedAt: new Date().toISOString(),
    exitCode: 0,
    signal: null,
    spawnError: null,
    stillRunning: false,
    durationMs: 18400,
    stdout: '',
    stderr: '',
    safeMode: false,
    crashEvents: [
      {
        time: new Date().toISOString(),
        id: 1000,
        provider: 'Application Error',
        faultingModule: 'ntdll.dll',
        exceptionCode: '0xc00000fd (stack overflow)',
        summary:
          "Nom de l'application défaillante : GTA5.exe, version : 1.0.3889.0 · Nom du module défaillant : ntdll.dll, version : 10.0.26100.8972 · Exception code: 0xc00000fd · Fault offset: 0x00000000000ac5dc",
      },
    ],
    werReports: [
      {
        time: new Date(Date.now() - 4000).toISOString(),
        appName: 'GTA5.exe',
        faultModule: 'ntdll.dll',
        exceptionCode: '0xc0000005 (access violation)',
        signatures: [
          "Nom de l'application = GTA5.exe",
          "Version de l'application = 1.0.3889.0",
          'Nom du module défaillant = ntdll.dll',
          "Code de l'exception = c0000005",
          "Décalage de l'exception = 000000000002f6a3",
        ],
      },
    ],
    logs: [
      {
        name: 'ScriptHookV.log',
        mtimeMs: Date.now(),
        errors: 0,
        warns: 0,
        stale: false,
        entries: [],
        raw: '// GTA V SCRIPT HOOK (build Jul 15 2026, v3889.0)\n[01:56:31] INIT: Started\n[01:56:31] INIT: Success, game version is VER_1_0_3889_0\n[01:56:31] INIT: Registering script \'Menyoo.asi\'\n[01:56:32] INIT: Registering script \'shadows.asi\'',
      },
      {
        name: 'ScriptHookVDotNet.log',
        mtimeMs: Date.now() - 90_000_000,
        errors: 1,
        warns: 1,
        stale: true,
        entries: [
          { level: 'error' as const, text: "Failed to load config: ScriptHookVDotNet.ini introuvable" },
          { level: 'warn' as const, text: 'Failed to reload scripts because the scripts directory is missing.' },
        ],
        raw: '[04:01:27] [ERROR] Failed to load config: ScriptHookVDotNet.ini introuvable\n[04:01:28] [WARNING] scripts directory is missing.',
      },
    ],
    gameConfig: [
      { name: 'commandline.txt', text: '-ignoreDifferentVideoCard' },
      { name: 'args.txt', text: '-nobattleye -noBE' },
    ],
  }
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
      launch: async () => mockLaunch,
      lastLaunch: async () => mockLaunch,
      recheckLaunch: async () => mockLaunch,
    },
    mods: {
      list: async () => [],
      import: async () => [],
      importPaths: async () => [],
      plan: async () => ({ modId: '', kind: 'dropin', files: [], warnings: [], missingDependencies: [], dlcPacks: [] }),
      install: async () => ({ ...mockMod }),
      uninstall: async () => ({ ...mockMod }),
      setEnabled: async () => ({ ...mockMod }),
      setAllEnabled: async () => [],
      setEnabledMany: async () => [],
      remove: async () => {},
      removeMany: async () => {},
      reorder: async () => ({ ...mockMod }),
      openFolder: async () => {},
      move: async () => [],
      conflicts: async () => [],
      scan: async () => [],
      adopt: async () => [],
    },
    oiv: {
      pick: async () => 'D:\\Downloads\\NaturalVision Evolved.oiv',
      inspect: async (path: string) => ({
        sourcePath: path,
        name: 'NaturalVision Evolved',
        author: 'Razed',
        authorLink: 'https://www.nvegamer.com',
        version: '9.0',
        description:
          'A comprehensive graphics overhaul for Grand Theft Auto V.\n\nInstall to the mods folder so your original files stay untouched. Requires the OpenIV.asi package loader.',
        icon: undefined,
        ops: [
          { kind: 'replace' as const, target: 'common/data/timecycle/w_clear.xml', archive: 'update/update.rpf', supported: true },
          { kind: 'add' as const, target: 'common/data/reflection.dat', archive: 'update/update.rpf', supported: true },
          { kind: 'add' as const, target: 'visualsettings.dat', archive: '', size: 48210, supported: true },
          { kind: 'replace' as const, target: 'plugins/NVE/config.ini', archive: '', size: 1200, supported: true },
          { kind: 'xml-edit' as const, target: 'common/data/dlclist.xml', archive: 'update/update.rpf', supported: true },
        ],
        counts: { add: 2, replace: 2, delete: 0, xmlEdit: 1, archive: 3, loose: 2 },
        supported: 5,
        total: 5,
        targets: [
          { id: 'mods' as const, path: 'D:\\Games\\GTAV\\mods', exists: true, recommended: true },
          { id: 'game' as const, path: 'D:\\Games\\GTAV', exists: true, recommended: false },
        ],
      }),
      install: async (_path: string, target) => ({
        mod: { ...mockMod, kind: 'oiv' as const, name: 'NaturalVision Evolved', status: 'installed' as const, oivTarget: target },
        report: {
          target,
          applied: 5,
          skipped: 0,
          failed: 0,
          results: [
            { target: 'visualsettings.dat', archive: '', kind: 'add' as const, status: 'applied' as const },
            { target: 'plugins/NVE/config.ini', archive: '', kind: 'replace' as const, status: 'applied' as const },
            { target: 'common/data/timecycle/w_clear.xml', archive: 'update/update.rpf', kind: 'replace' as const, status: 'applied' as const },
            { target: 'common/data/reflection.dat', archive: 'update/update.rpf', kind: 'replace' as const, status: 'applied' as const },
            { target: 'common/data/dlclist.xml', archive: 'update/update.rpf', kind: 'xml-edit' as const, status: 'applied' as const },
          ],
        },
      }),
    },
    profiles: {
      list: async () => mockProfiles,
      create: async (name: string) => {
        const p = { id: `p${Date.now()}`, name, enabledMods: [] as string[] }
        mockProfiles.push(p)
        return p
      },
      duplicate: async (id: string) => {
        const src = mockProfiles.find((x) => x.id === id)!
        const p = { id: `p${Date.now()}`, name: `${src.name} (2)`, enabledMods: [...src.enabledMods] }
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
      export: async () => false,
      import: async () => null,
    },
    activity: {
      list: async () => [],
      undo: async () => {},
      clear: async () => {},
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
        return { active, moved: active ? ['dinput8.dll', 'ScriptHookV.dll', 'mods', 'scripts'] : [] }
      },
      isGameRunning: async () => false,
      status: async () => ({
        safe: !!config.onlineSafeMode,
        hasIndex: false,
        parkedCount: config.onlineSafeMode ? 4 : 0,
      }),
      scan: async () => ({
        usingIndex: false,
        items: [
          { rel: 'dinput8.dll', isDir: false, kind: 'loader' as const, size: 210000, files: ['dinput8.dll'] },
          { rel: 'ScriptHookV.dll', isDir: false, kind: 'dll' as const, size: 900000, files: ['ScriptHookV.dll'] },
          { rel: 'OpenIV.asi', isDir: false, kind: 'asi' as const, size: 1200000, files: ['OpenIV.asi'] },
          { rel: 'mods', isDir: true, kind: 'folder' as const, size: 5_000_000_000, files: ['mods/update/update.rpf'] },
          { rel: 'scripts', isDir: true, kind: 'folder' as const, size: 40_000_000, files: ['scripts/Menyoo.asi'] },
        ],
        modifiedStock: [],
        totalFiles: 5,
        totalBytes: 5_042_310_000,
      }),
      buildIndex: async () => ({ safe: !!config.onlineSafeMode, hasIndex: true, indexTakenAt: new Date().toISOString(), indexCount: 94213, parkedCount: 0 }),
      clearIndex: async () => ({ safe: !!config.onlineSafeMode, hasIndex: false, parkedCount: 0 }),
    },
    system: {
      writable: async () => ({ elevated: true, gamePath: null, gameWritable: true }),
      relaunchAdmin: async () => false,
    },
    misc: {
      openExternal: async () => {},
      openGameFolder: async () => {},
      pathForFile: () => '',
      version: async () => '0.1.1',
    },
    update: {
      check: async () => ({ state: 'idle' as const }),
      status: async () => ({ state: 'idle' as const }),
      install: async () => false,
    },
    on: { taskProgress: () => noop, modsChanged: () => noop, updateStatus: () => noop },
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
