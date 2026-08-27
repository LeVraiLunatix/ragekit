import { join } from 'node:path'
import type { DependencyId, DependencyStatus, PlannedFile } from '@shared/types'
import { pathExists } from './fsutil'

const CATALOG: Record<DependencyId, { name: string; probes: string[] }> = {
  scripthookv: {
    name: 'Script Hook V',
    probes: ['ScriptHookV.dll', 'dinput8.dll'],
  },
  scripthookvdotnet: {
    name: 'Script Hook V .NET',
    probes: ['ScriptHookVDotNet.asi', 'ScriptHookVDotNet3.dll', 'ScriptHookVDotNet2.dll'],
  },
  'openiv-asi': {
    name: 'OpenIV.asi (mods folder support)',
    probes: ['OpenIV.asi', join('mods')],
  },
  'community-sh': {
    name: 'Community Script Hook V .NET runtime',
    probes: ['scripts\\ScriptHookVDotNet.runtimeconfig.json'],
  },
}

export async function dependencyStatus(gamePath: string): Promise<DependencyStatus[]> {
  const out: DependencyStatus[] = []
  for (const id of Object.keys(CATALOG) as DependencyId[]) {
    const { name, probes } = CATALOG[id]
    let detail: string | undefined
    for (const probe of probes) {
      if (await pathExists(join(gamePath, probe))) {
        detail = probe
        break
      }
    }
    out.push({ id, name, installed: detail != null, detail })
  }
  return out
}

/** Infer which dependencies a set of planned files will need. */
export function inferRequiredDeps(files: PlannedFile[]): DependencyId[] {
  const needs = new Set<DependencyId>()
  for (const f of files) {
    if (f.role === 'asi') needs.add('scripthookv')
    if (f.role === 'script' && f.to.endsWith('.cs')) needs.add('scripthookvdotnet')
    if (f.role === 'script-dll') needs.add('scripthookvdotnet')
    if (f.role === 'script' && f.to.endsWith('.lua')) {
      // LUA needs the community LUA plugin, which itself needs SHVDN.
      needs.add('scripthookvdotnet')
    }
    if (f.role === 'mods-tree') needs.add('openiv-asi')
  }
  return [...needs]
}
