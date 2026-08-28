import { randomUUID } from 'node:crypto'
import type { ActivityEntry, ActivityKind } from '@shared/types'
import { store } from './store'

const CAP = 60

function names(ids: string[]): string[] {
  const by = new Map(store.get('mods').map((m) => [m.id, m.name]))
  return ids.map((id) => by.get(id) ?? id)
}

/** Record a change. `undo` says how to reverse it (only enable/disable are reversible). */
export function logActivity(
  kind: ActivityKind,
  modIds: string[],
  undo?: ActivityEntry['undo'],
): void {
  if (modIds.length === 0) return
  const entry: ActivityEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    modIds,
    modNames: names(modIds),
    undo,
  }
  store.set('activity', [entry, ...store.get('activity')].slice(0, CAP))
}

export function listActivity(): ActivityEntry[] {
  return store.get('activity')
}

export function clearActivity(): void {
  store.set('activity', [])
}

export function takeUndo(id: string): ActivityEntry['undo'] | null {
  const all = store.get('activity')
  const e = all.find((x) => x.id === id)
  if (!e?.undo) return null
  // Drop the entry so it can't be undone twice.
  store.set(
    'activity',
    all.filter((x) => x.id !== id),
  )
  return e.undo
}
