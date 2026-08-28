import { sep } from 'node:path'
import type { ModCategory } from '@shared/types'
import { walk } from './fsutil'

/**
 * Best-effort guess at what kind of mod a folder holds, from its file names +
 * the mod's display name. Used only to group the library — never to decide how
 * a mod installs. Checked in priority order: the first bucket that matches wins.
 * Regexes run against a newline-joined, forward-slashed, lowercased haystack
 * with the `m` flag, so `^`/`$` anchor per path segment / line.
 */

const RULES: Array<{ cat: ModCategory; re: RegExp }> = [
  {
    cat: 'vehicle',
    re: /(^|\/)(vehicles|carvariations|carcols|handling|vehiclelayouts|vehiclemodelsets|caraddoncols)\.meta$|(^|\/)vehicles?\/|_hi\.yft$|vehicle_mods|addon ?cars?|\b(car|voiture|supercar|hypercar|bike|motorcycle|moto)\b/im,
  },
  {
    cat: 'weapon',
    re: /(^|\/)(weapons|weaponcomponents|weaponanimations|weaponarchetypes)\.meta$|(^|\/)weapons?\/|(^|\/)w_[a-z]+_[a-z0-9]+\.(ydr|ytd|yft)$|\b(weapon|firearm|pistol|rifle) ?(pack|mod|replace)?\b/im,
  },
  {
    cat: 'ped',
    re: /(^|\/)(peds|pedpersonality|pedmodelsets|relationships)\.meta$|(^|\/)peds?\/|mp_[mf]_freemode|\b(skin|ped|character|outfit) ?(pack|mod|replace)\b/im,
  },
  {
    cat: 'map',
    re: /\.ymap$|\.ybn$|<spoonerplacements>|(^|\/)maps?\/|menyoostuff\/spooner|\b(map|mlo|interior|scene) ?(mod|pack|build|editor)?\b/im,
  },
  {
    cat: 'graphics',
    re: /\.(fx|fxh|hlsl)$|reshade|enbseries|enblocal|timecycle_?mod|visualsettings\.dat|(^|\/)shaders?\/|\b(graphics?|visual|preset|weather|lighting|hdr|ray ?trac)\b|naturalvision|photorealistic|\bnve\b|\benb\b/im,
  },
  {
    cat: 'audio',
    re: /\.(awc|nametable)$|\.dat54\.rel$|(^|\/)audio\/|\b(audio|sound|sfx|music|radio|siren) ?(mod|pack)?\b/im,
  },
  {
    cat: 'script',
    re: /\.asi$|(^|\/)scripts?\/[^/]+\.(cs|lua|js|dll)$|scripthookvdotnet|\.lua$|\.cs$|\b(trainer|menyoo|mod ?menu|native ?ui|lemon ?ui|lscript)\b/im,
  },
  {
    cat: 'data',
    re: /(^|\/)(gameconfig|dispatch|scenarios|popgroups|popcycle|loadouts|pedhealth|explosion|tuning)\.(xml|meta|ymt|dat)$|\.ymt$|(^|\/)(data|levels)\/[a-z]/im,
  },
]

/** Name-only hints when file scanning is inconclusive. */
const NAME_HINTS: Array<{ cat: ModCategory; re: RegExp }> = [
  {
    cat: 'vehicle',
    re: /\b(20\d\d|19\d\d)\b|\b(mclaren|ferrari|lamborghini|bmw|audi|mercedes|benz|porsche|nissan|toyota|ford|dodge|chevrolet|bugatti|koenigsegg|pagani|aston|bentley|rolls[- ]?royce|subaru|mazda|honda|jaguar|maserati)\b/i,
  },
  { cat: 'graphics', re: /\b(vision|graphics?|visual|reshade|enb|preset|redux|remaster|colorful|realism)\b/i },
  { cat: 'script', re: /\b(trainer|menu|menyoo|lspdfr|simple ?trainer)\b/i },
]

export async function detectCategory(sourceDir: string, name: string): Promise<ModCategory> {
  let hay = name.toLowerCase()
  try {
    const files = await walk(sourceDir)
    const norm = files
      .map((f) => f.slice(sourceDir.length).split(sep).join('/').replace(/\\/g, '/').toLowerCase())
      .join('\n')
    hay += '\n' + norm
  } catch {
    /* name-only */
  }

  for (const { cat, re } of RULES) {
    if (re.test(hay)) return cat
  }
  for (const { cat, re } of NAME_HINTS) {
    if (re.test(name)) return cat
  }
  return 'other'
}
