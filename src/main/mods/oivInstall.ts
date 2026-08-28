import { promises as fs } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import type AdmZip from 'adm-zip'
import type { OivOpResult, OivTarget } from '@shared/types'
import { readOivPackage, oivBaseDir, type OivOp } from './oiv'
import { ensureDir, copyFile, pathExists, removeFileAndPrune } from './fsutil'
import { loadAesKey } from '../rpf/crypto'
import { Rpf7 } from '../rpf/rpf7'

const slash = (p: string): string => p.split(sep).join('/')
const NG_ARCHIVE = /(^|\/)(update\.rpf|common\.rpf|x64[a-z]?\.rpf)$/i

export interface OivApplyResult {
  results: OivOpResult[]
  /** Game-relative paths written (for install tracking / uninstall). */
  written: string[]
}

function zipEntry(zip: AdmZip, source?: string): AdmZip.IZipEntry | undefined {
  if (!source) return undefined
  const s = source.replace(/\\/g, '/')
  return zip.getEntry(s) ?? zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/') === s)
}

/**
 * Apply an .oiv package into the chosen base folder.
 *
 * Loose files are copied / deleted with backups so the change is fully
 * reversible. Same-name replacements inside a non-NG .rpf that lives in the
 * mods folder are applied by appending to the archive (a whole-archive backup
 * is taken first). Everything else — new files inside .rpf, NG-encrypted
 * archives, nested archives and in-place XML edits — is reported as skipped so
 * the user knows to finish those in OpenIV.
 */
export async function applyOivPackage(
  storedOivPath: string,
  target: OivTarget,
  gamePath: string,
  backupDir: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<OivApplyResult> {
  const { zip, pkg } = await readOivPackage(storedOivPath)
  const base = oivBaseDir(gamePath, target)
  const results: OivOpResult[] = []
  const written = new Set<string>()
  const archivesBackedUp = new Set<string>()
  let aesKey: Buffer | null | undefined

  const total = pkg.ops.length
  let done = 0

  const backup = async (absPath: string): Promise<void> => {
    const rel = slash(relative(gamePath, absPath))
    const dst = join(backupDir, rel)
    if (!(await pathExists(dst))) await copyFile(absPath, dst)
  }

  for (const op of pkg.ops) {
    const archive = op.archiveChain.join('/')
    onProgress?.(done, total, op.target)
    done++
    try {
      if (op.kind === 'xml-edit') {
        results.push({ target: op.target, archive, kind: 'xml-edit', status: 'skipped', detail: 'in-place XML edit — apply with OpenIV' })
        continue
      }

      // ── loose file ────────────────────────────────────────────────────────
      if (!archive) {
        const dest = join(base, op.target)
        const rel = slash(relative(gamePath, dest))
        if (op.kind === 'delete') {
          if (await pathExists(dest)) {
            await backup(dest)
            await removeFileAndPrune(dest, gamePath)
            written.add(rel)
            results.push({ target: op.target, archive, kind: 'delete', status: 'applied' })
          } else {
            results.push({ target: op.target, archive, kind: 'delete', status: 'skipped', detail: 'already absent' })
          }
          continue
        }
        const entry = zipEntry(zip, op.source)
        if (!entry) {
          results.push({ target: op.target, archive, kind: 'add', status: 'failed', detail: 'source missing in package' })
          continue
        }
        const overwrite = await pathExists(dest)
        if (overwrite) await backup(dest)
        await ensureDir(dirname(dest))
        await fs.writeFile(dest, entry.getData())
        written.add(rel)
        results.push({ target: op.target, archive, kind: overwrite ? 'replace' : 'add', status: 'applied' })
        continue
      }

      // ── operation inside a .rpf archive ──────────────────────────────────
      const kind = op.kind === 'add' ? 'replace' : 'delete'
      const skip = (detail: string): void => {
        results.push({ target: op.target, archive, kind, status: 'skipped', detail })
      }
      if (target !== 'mods') { skip('install to the mods folder to apply archive changes'); continue }
      if (op.archiveChain.length > 1) { skip(`nested archive (${archive}) — use OpenIV`); continue }
      if (NG_ARCHIVE.test(archive)) { skip(`${archive} is NG-encrypted — use OpenIV`); continue }
      if (op.kind === 'delete') { skip(`deletes inside ${archive} — use OpenIV`); continue }

      const archiveFs = join(base, op.archiveChain[0])
      if (!(await pathExists(archiveFs))) {
        skip(`copy ${op.archiveChain[0]} into your mods folder first (Game files tab)`)
        continue
      }
      if (aesKey === undefined) aesKey = await loadAesKey(gamePath).catch(() => null)
      let rpf: Rpf7
      try {
        rpf = await Rpf7.open(archiveFs, { aes: aesKey ?? null, ng: null })
      } catch (err) {
        skip(err instanceof Error ? err.message : String(err))
        continue
      }
      if (rpf.encryption === 'NG') { skip(`${archive} is NG-encrypted — use OpenIV`); continue }
      const inner = rpf.get(op.target)
      if (!inner) { skip(`adds a new file to ${archive} — use OpenIV`); continue }
      if (inner.isResource) { skip('resource file — use OpenIV'); continue }
      const src = zipEntry(zip, op.source)
      if (!src) {
        results.push({ target: op.target, archive, kind, status: 'failed', detail: 'source missing in package' })
        continue
      }
      if (!archivesBackedUp.has(archiveFs)) {
        await backup(archiveFs)
        archivesBackedUp.add(archiveFs)
        written.add(slash(relative(gamePath, archiveFs)))
      }
      await rpf.replaceFile(op.target, src.getData())
      results.push({ target: op.target, archive, kind: 'replace', status: 'applied' })
    } catch (err) {
      results.push({
        target: op.target,
        archive,
        kind: (op.kind === 'add' ? (archive ? 'replace' : 'add') : op.kind) as OivOpResult['kind'],
        status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  onProgress?.(total, total, '')
  return { results, written: [...written] }
}

export type { OivOp }
