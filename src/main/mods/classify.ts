import { relative, sep, basename, extname } from 'node:path'
import type { FileRole, PlannedFile } from '@shared/types'

const IGNORE_NAMES = new Set([
  'readme',
  'read me',
  'read_me',
  'license',
  'licence',
  'changelog',
  'installation',
  'install',
  'credits',
])

const IGNORE_EXT = new Set(['.txt', '.md', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.url', '.htm', '.html'])

/** DLLs that belong in the game root rather than scripts/. */
const ROOT_DLLS = new Set([
  'dinput8.dll',
  'scripthookv.dll',
  'scripthookvdotnet.asi',
  'scripthookvdotnet2.dll',
  'scripthookvdotnet3.dll',
  'nativetrainer.asi',
])

function normalize(rel: string): string {
  return rel.split(sep).join('/')
}

/**
 * Decide where a single file from a drop-in mod archive should land,
 * relative to the game folder.
 */
export function classifyFile(rootDir: string, absPath: string): PlannedFile | null {
  const rel = normalize(relative(rootDir, absPath))
  const lower = rel.toLowerCase()
  const name = basename(lower)
  const ext = extname(lower)
  const stem = name.slice(0, name.length - ext.length)

  if (IGNORE_NAMES.has(stem) || IGNORE_EXT.has(ext)) {
    return { from: rel, to: rel, role: 'ignored', overwrite: false }
  }

  // Already-rooted trees: the archive author laid out the target path for us.
  const firstSeg = lower.split('/')[0]
  if (firstSeg === 'mods' || firstSeg === 'update' || firstSeg === 'x64' || firstSeg === 'common') {
    return { from: rel, to: rel, role: 'mods-tree', overwrite: true }
  }

  if (lower.startsWith('scripts/')) {
    const role: FileRole =
      ext === '.dll' ? 'script-dll' : ext === '.asi' ? 'asi' : ext === '.lua' || ext === '.js' || ext === '.cs' ? 'script' : 'asset'
    return { from: rel, to: rel, role, overwrite: false }
  }

  if (ext === '.asi') {
    return { from: rel, to: name, role: 'asi', overwrite: false }
  }

  if (ext === '.dll') {
    if (ROOT_DLLS.has(name)) {
      return { from: rel, to: name, role: 'root-dll', overwrite: true }
    }
    // Loose .NET script plugin.
    return { from: rel, to: `scripts/${name}`, role: 'script-dll', overwrite: false }
  }

  if (ext === '.lua' || ext === '.js' || ext === '.cs') {
    return { from: rel, to: `scripts/${name}`, role: 'script', overwrite: false }
  }

  if (name === 'dinput8.dll') {
    return { from: rel, to: name, role: 'root-dll', overwrite: true }
  }

  // .ini / .xml / .json config files usually sit next to the script that reads
  // them. If they're at the archive root, assume scripts/.
  if (ext === '.ini' || ext === '.xml' || ext === '.json' || ext === '.cfg') {
    const depth = lower.split('/').length
    return {
      from: rel,
      to: depth > 1 ? `scripts/${rel}` : `scripts/${name}`,
      role: 'asset',
      overwrite: false,
    }
  }

  return null
}
