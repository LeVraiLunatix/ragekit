import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { loadAesKey } from './crypto'
import { Rpf7 } from './rpf7'
import { loadNgKeys } from './ngkeys'
import { walk, ensureDir, copyFile, pathExists, removeFileAndPrune } from '../mods/fsutil'

const DLCLIST_INNER = 'common/data/dlclist.xml'

export interface FoundDlcPack {
  /** Folder name under dlcpacks/, e.g. "p1". */
  name: string
  /** Absolute path to the pack's dlc.rpf inside the mod source. */
  sourceRpf: string
  /** Game-relative destination, e.g. "mods/update/x64/dlcpacks/p1/dlc.rpf". */
  targetRel: string
}

/** Scan an extracted mod for prebuilt add-on DLC packs (dlcpacks/<name>/dlc.rpf). */
export async function findDlcPacks(sourceDir: string): Promise<FoundDlcPack[]> {
  const out: FoundDlcPack[] = []
  for (const abs of await walk(sourceDir)) {
    const rel = abs.slice(sourceDir.length + 1).split('\\').join('/')
    const m = rel.match(/(?:^|\/)dlcpacks\/([^/]+)\/dlc\.rpf$/i)
    if (!m) continue
    out.push({
      name: m[1],
      sourceRpf: abs,
      targetRel: `mods/update/x64/dlcpacks/${m[1]}/dlc.rpf`,
    })
  }
  return out
}

/**
 * Make sure <game>/mods/update/update.rpf exists. If the user has never used a
 * mods folder we clone the real update.rpf into it (OpenIV works the same way).
 */
async function ensureModsUpdateRpf(
  gamePath: string,
  onProgress?: (label: string, ratio: number | null) => void,
): Promise<string> {
  const target = join(gamePath, 'mods', 'update', 'update.rpf')
  if (await pathExists(target)) return target

  const source = join(gamePath, 'update', 'update.rpf')
  if (!(await pathExists(source))) {
    throw new Error('update/update.rpf not found in the game folder.')
  }
  await ensureDir(dirname(target))
  onProgress?.('Cloning update.rpf into the mods folder (one-time, ~1 GB)…', null)
  await fs.copyFile(source, target)
  return target
}

function dlcItem(name: string): string {
  return `<Item>dlcpacks:/${name}/</Item>`
}

async function editDlclist(
  gamePath: string,
  mutate: (xml: string) => string | null,
): Promise<void> {
  const [aes, ng] = await Promise.all([loadAesKey(gamePath), loadNgKeys()])
  const rpfPath = join(gamePath, 'mods', 'update', 'update.rpf')
  const rpf = await Rpf7.open(rpfPath, { aes, ng })
  const xml = (await rpf.readFile(DLCLIST_INNER)).toString('utf8')
  const next = mutate(xml)
  if (next == null || next === xml) return
  await rpf.replaceFile(DLCLIST_INNER, Buffer.from(next, 'utf8'))
}

export async function registerDlcPack(gamePath: string, name: string): Promise<void> {
  await editDlclist(gamePath, (xml) => {
    const item = dlcItem(name)
    if (xml.includes(`dlcpacks:/${name}/`)) return null
    if (xml.includes('</Paths>')) return xml.replace('</Paths>', `  ${item}\n  </Paths>`)
    return null
  })
}

export async function unregisterDlcPack(gamePath: string, name: string): Promise<void> {
  await editDlclist(gamePath, (xml) => {
    const line = new RegExp(`\\s*<Item>dlcpacks:[/\\\\]${name}[/\\\\]?</Item>`, 'i')
    return line.test(xml) ? xml.replace(line, '') : null
  })
}

export interface DlcInstallResult {
  installedFiles: string[]
  packNames: string[]
}

export async function installDlcPacks(
  gamePath: string,
  packs: FoundDlcPack[],
  onProgress?: (label: string, ratio: number | null) => void,
): Promise<DlcInstallResult> {
  if (packs.length === 0) return { installedFiles: [], packNames: [] }

  await ensureModsUpdateRpf(gamePath, onProgress)
  const installedFiles: string[] = []
  const packNames: string[] = []

  for (const pack of packs) {
    onProgress?.(`Installing add-on pack "${pack.name}"…`, null)
    await copyFile(pack.sourceRpf, join(gamePath, pack.targetRel))
    installedFiles.push(pack.targetRel)
    await registerDlcPack(gamePath, pack.name)
    packNames.push(pack.name)
  }

  return { installedFiles, packNames }
}

export async function uninstallDlcPacks(gamePath: string, packNames: string[]): Promise<void> {
  for (const name of packNames) {
    await unregisterDlcPack(gamePath, name).catch(() => {})
    const folder = join(gamePath, 'mods', 'update', 'x64', 'dlcpacks', name)
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {})
    await removeFileAndPrune(join(folder, 'dlc.rpf'), join(gamePath, 'mods')).catch(() => {})
  }
}
