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
  gameLaunch: 'game:launch',
  gameLastLaunch: 'game:lastLaunch',
  gameRecheckLaunch: 'game:recheckLaunch',

  // mod library
  modsList: 'mods:list',
  modsImport: 'mods:import', // opens a picker, returns ImportResult[]
  modsImportPaths: 'mods:importPaths', // import specific paths (drag & drop)
  modsPlan: 'mods:plan',
  modsInstall: 'mods:install',
  modsUninstall: 'mods:uninstall',
  modsSetEnabled: 'mods:setEnabled',
  modsSetAllEnabled: 'mods:setAllEnabled',
  modsSetEnabledMany: 'mods:setEnabledMany',
  modsRemove: 'mods:remove',
  modsRemoveMany: 'mods:removeMany',
  modsReorder: 'mods:reorder',
  modsOpenFolder: 'mods:openFolder',
  modsMove: 'mods:move', // shift load order up/down
  modsConflicts: 'mods:conflicts',
  modsScan: 'mods:scan', // find mods installed outside the app
  modsAdopt: 'mods:adopt', // pull found mods into the library

  // profiles
  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesDuplicate: 'profiles:duplicate',
  profilesRename: 'profiles:rename',
  profilesDelete: 'profiles:delete',
  profilesCapture: 'profiles:capture',
  profilesSetMods: 'profiles:setMods',
  profilesApply: 'profiles:apply',

  // online-safe mode
  onlineSetMode: 'online:setMode',
  onlineGameRunning: 'online:gameRunning',
  onlineStatus: 'online:status',
  onlineScan: 'online:scan',
  onlineBuildIndex: 'online:buildIndex',
  onlineClearIndex: 'online:clearIndex',

  // diagnostics
  diagnosticsRead: 'diagnostics:read',

  // integrity / vanilla snapshot
  integrityTake: 'integrity:take',
  integrityVerify: 'integrity:verify',
  integrityClear: 'integrity:clear',

  // RPF / filesystem explorer
  rpfExplore: 'rpf:explore',
  rpfExtract: 'rpf:extract',
  rpfReadText: 'rpf:readText',
  rpfReplace: 'rpf:replace',
  rpfCopyToMods: 'rpf:copyToMods',
  rpfShowInFolder: 'rpf:showInFolder',
  ngStatus: 'ng:status',
  ngSet: 'ng:set',
  ngClear: 'ng:clear',

  // GTA5-Mods.com
  remoteFetch: 'remote:fetch',
  remoteInstall: 'remote:install',
  remoteCheckUpdates: 'remote:checkUpdates',

  // dependencies
  depsStatus: 'deps:status',

  // system / elevation
  systemWritable: 'system:writable',
  systemRelaunchAdmin: 'system:relaunchAdmin',

  // misc
  openExternal: 'misc:openExternal',
  openGameFolder: 'misc:openGameFolder',

  // activity / undo
  activityList: 'activity:list',
  activityUndo: 'activity:undo',
  activityClear: 'activity:clear',

  // profiles import/export
  profilesExport: 'profiles:export',
  profilesImport: 'profiles:import',

  // events (main -> renderer)
  evtTaskProgress: 'evt:taskProgress',
  evtModsChanged: 'evt:modsChanged',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
