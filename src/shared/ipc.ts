/** Canonical list of IPC channel names, shared by main and preload. */

export const IPC = {
  // config
  configGet: 'config:get',
  configSetGame: 'config:setGame',
  configSetLanguage: 'config:setLanguage',
  configCompleteOnboarding: 'config:completeOnboarding',

  // game detection
  gameDetect: 'game:detect',
  gameBrowse: 'game:browse',
  gameValidate: 'game:validate',

  // mod library
  modsList: 'mods:list',
  modsImport: 'mods:import', // opens a picker, returns ImportResult[]
  modsImportPaths: 'mods:importPaths', // import specific paths (drag & drop)
  modsPlan: 'mods:plan',
  modsInstall: 'mods:install',
  modsUninstall: 'mods:uninstall',
  modsSetEnabled: 'mods:setEnabled',
  modsRemove: 'mods:remove',
  modsReorder: 'mods:reorder',
  modsOpenFolder: 'mods:openFolder',
  modsScan: 'mods:scan', // find mods installed outside the app
  modsAdopt: 'mods:adopt', // pull found mods into the library

  // online-safe mode
  onlineSetMode: 'online:setMode',
  onlineGameRunning: 'online:gameRunning',

  // dependencies
  depsStatus: 'deps:status',

  // misc
  openExternal: 'misc:openExternal',
  openGameFolder: 'misc:openGameFolder',

  // events (main -> renderer)
  evtTaskProgress: 'evt:taskProgress',
  evtModsChanged: 'evt:modsChanged',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
