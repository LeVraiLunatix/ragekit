import { randomUUID } from 'node:crypto'
import type { Profile } from '@shared/types'
import { store } from './store'
import { installMod, uninstallMod } from './mods/library'

function all(): Profile[] {
  return store.get('profiles')
}

function save(profiles: Profile[]): void {
  store.set('profiles', profiles)
}

/** Ids of mods currently installed, in load order. */
function currentlyEnabled(): string[] {
  return store
    .get('mods')
    .filter((m) => m.status === 'installed')
    .sort((a, b) => a.loadOrder - b.loadOrder)
    .map((m) => m.id)
}

export function listProfiles(): Profile[] {
  return all()
}

export function createProfile(name: string, fromCurrent = true): Profile {
  const profile: Profile = {
    id: randomUUID(),
    name: name.trim() || 'New profile',
    enabledMods: fromCurrent ? currentlyEnabled() : [],
  }
  save([...all(), profile])
  return profile
}

export function duplicateProfile(id: string): Profile {
  const profiles = all()
  const src = profiles.find((x) => x.id === id)
  if (!src) throw new Error(`Unknown profile ${id}`)
  const base = src.name.replace(/\s*\(\d+\)$/, '')
  let n = 2
  const taken = new Set(profiles.map((p) => p.name))
  let name = `${base} (${n})`
  while (taken.has(name)) name = `${base} (${++n})`
  const copy: Profile = { id: randomUUID(), name, enabledMods: [...src.enabledMods] }
  save([...profiles, copy])
  return copy
}

export function renameProfile(id: string, name: string): Profile {
  const profiles = all()
  const p = profiles.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  p.name = name.trim() || p.name
  save(profiles)
  return p
}

export function deleteProfile(id: string): void {
  save(all().filter((p) => p.id !== id))
  const cfg = store.get('config')
  if (cfg.activeProfileId === id) store.set('config', { ...cfg, activeProfileId: null })
}

/** Overwrite a profile's membership with whatever is installed right now. */
export function captureProfile(id: string): Profile {
  const profiles = all()
  const p = profiles.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  p.enabledMods = currentlyEnabled()
  save(profiles)
  return p
}

/** Edit a profile's membership without applying it to the game. */
export function setProfileMods(id: string, modIds: string[]): Profile {
  const profiles = all()
  const p = profiles.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  const known = new Set(store.get('mods').map((m) => m.id))
  p.enabledMods = modIds.filter((m) => known.has(m))
  save(profiles)
  return p
}

/** Install/uninstall the delta so the game matches this profile. */
export async function applyProfile(id: string): Promise<void> {
  const p = all().find((x) => x.id === id)
  if (!p) throw new Error(`Unknown profile ${id}`)
  const target = new Set(p.enabledMods)

  for (const mod of store.get('mods')) {
    const shouldRun = target.has(mod.id)
    if (shouldRun && mod.status !== 'installed') await installMod(mod.id)
    else if (!shouldRun && mod.status === 'installed') await uninstallMod(mod.id, true)
  }

  store.set('config', { ...store.get('config'), activeProfileId: id })
}
