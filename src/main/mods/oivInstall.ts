import { join, relative, dirname, sep } from 'node:path'
import type { OivOpResult, OivTarget } from '@shared/types'
import { parseOivPackage, oivBaseDir, type OivOp } from './oiv'
import { withOivZip, type OivZip } from './oivZip'
import { ensureDir, copyFile, pathExists, removeFileAndPrune } from './fsutil'
import { loadAesKey } from '../rpf/crypto'
import { loadNgKeys } from '../rpf/ngkeys'
import { Rpf7 } from '../rpf/rpf7'

const slash = (p: string): string => p.split(sep).join('/')

export interface OivApplyResult {
  results: OivOpResult[]
  /** Game-relative paths written (for install tracking / uninstall). */
  written: string[]
}

/**
 * Apply an .oiv package into the chosen base folder.
 *
 * - Loose files: copied / deleted with per-file backups (fully reversible).
 * - `<add>` into a level-1 .rpf (target = mods folder): the archive is pulled
 *   into mods/ if missing, NG-encrypted vanilla archives (update.rpf, x64*.rpf,
 *   common.rpf) are decrypted to OPEN in place once, then a single rebuild
 *   applies every same-name replacement for that archive. A whole-archive backup
 *   is taken first.
 * - Still deferred: nested archives, brand-new files inside a .rpf, deletes
 *   inside a .rpf, and in-place XML edits — reported as skipped.
 */
export async function applyOivPackage(
  storedOivPath: string,
  target: OivTarget,
  gamePath: string,
  backupDir: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<OivApplyResult> {
  return withOivZip(storedOivPath, async (zip) => {
    const pkg = await parseOivPackage(zip)
    const base = oivBaseDir(gamePath, target)
    const results: OivOpResult[] = []
    const written = new Set<string>()

    const total = pkg.ops.length
    let done = 0

    const backup = async (absPath: string): Promise<void> => {
      const rel = slash(relative(gamePath, absPath))
      const dst = join(backupDir, rel)
      if (!(await pathExists(dst))) await copyFile(absPath, dst)
    }

    /** archive path relative to base (chain[0]) -> the ops targeting it */
    const archiveGroups = new Map<string, OivOp[]>()

    for (const op of pkg.ops) {
      const archive = op.archiveChain.join('/')
      onProgress?.(done, total, op.target)
      done++
      try {
        if (op.kind === 'xml-edit') {
          results.push({ target: op.target, archive, kind: 'xml-edit', status: 'skipped', detail: 'in-place XML edit — apply with OpenIV' })
          continue
        }

        // ── loose file ──────────────────────────────────────────────────────
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
          if (!op.source || !zip.has(op.source)) {
            results.push({ target: op.target, archive, kind: 'add', status: 'failed', detail: 'source missing in package' })
            continue
          }
          const overwrite = await pathExists(dest)
          if (overwrite) await backup(dest)
          await ensureDir(dirname(dest))
          const ok = await zip.toFile(op.source, dest)
          if (!ok) {
            results.push({ target: op.target, archive, kind: 'add', status: 'failed', detail: 'could not extract source' })
            continue
          }
          written.add(rel)
          results.push({ target: op.target, archive, kind: overwrite ? 'replace' : 'add', status: 'applied' })
          continue
        }

        // ── operation inside a .rpf archive — collect, apply in a batch below ─
        const kind = op.kind === 'add' ? 'replace' : 'delete'
        const skip = (detail: string): void => {
          results.push({ target: op.target, archive, kind, status: 'skipped', detail })
        }
        if (target !== 'mods') { skip('install to the mods folder to apply archive changes'); continue }
        if (op.archiveChain.length > 1) { skip(`nested archive (${archive}) — not supported yet`); continue }
        if (op.kind === 'delete') { skip(`deletes inside ${archive} — not supported yet`); continue }
        const list = archiveGroups.get(op.archiveChain[0]) ?? []
        list.push(op)
        archiveGroups.set(op.archiveChain[0], list)
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

    // ── batched archive rebuilds ─────────────────────────────────────────────
    let aesKey: Buffer | null | undefined
    let ngKeys: Awaited<ReturnType<typeof loadNgKeys>> | undefined
    for (const [archiveRel, ops] of archiveGroups) {
      const archiveFs = join(base, archiveRel)
      const push = (op: OivOp, status: OivOpResult['status'], detail?: string): void => {
        results.push({ target: op.target, archive: op.archiveChain.join('/'), kind: 'replace', status, detail })
      }
      try {
        // The archive must live in mods/. If it doesn't, pull the vanilla copy
        // from the game folder (what you'd otherwise do by hand in OpenIV).
        if (!(await pathExists(archiveFs))) {
          const vanilla = join(gamePath, archiveRel)
          if (!(await pathExists(vanilla))) {
            for (const op of ops) push(op, 'skipped', `${archiveRel} not found in the game folder`)
            continue
          }
          onProgress?.(total, total, `Copying ${archiveRel} into mods…`)
          await copyFile(vanilla, archiveFs)
        }
        if (aesKey === undefined) aesKey = await loadAesKey(gamePath).catch(() => null)
        if (ngKeys === undefined) ngKeys = await loadNgKeys(gamePath).catch(() => null)

        let rpf: Rpf7
        try {
          rpf = await Rpf7.open(archiveFs, { aes: aesKey ?? null, ng: ngKeys ?? null })
        } catch (err) {
          for (const op of ops) push(op, 'skipped', err instanceof Error ? err.message : String(err))
          continue
        }

        // NG (vanilla) archive → decrypt it to OPEN once, in place, then reopen.
        if (rpf.encryption === 'NG') {
          if (!ngKeys) {
            for (const op of ops) push(op, 'skipped', `${archiveRel} is NG-encrypted and NG keys aren't loaded (Settings › NG keys)`)
            continue
          }
          await backup(archiveFs)
          onProgress?.(total, total, `Converting ${archiveRel} to an editable copy…`)
          await rpf.convertToOpen(archiveFs, (d, t) =>
            onProgress?.(total, total, `Converting ${archiveRel} — ${Math.round((d / Math.max(t, 1)) * 100)}%`),
          )
          rpf = await Rpf7.open(archiveFs, { aes: aesKey ?? null, ng: ngKeys })
        }

        const replaceMap = new Map<string, Buffer>()
        const staged: OivOp[] = []
        for (const op of ops) {
          const inner = rpf.get(op.target)
          if (!inner || inner.isDir) { push(op, 'skipped', `adds a new file to ${archiveRel} — not supported yet`); continue }
          if (inner.isResource) { push(op, 'skipped', 'resource file inside a .rpf — not supported yet'); continue }
          const buf = op.source ? await extract(zip, op.source) : null
          if (!buf) { push(op, 'failed', 'source missing in package'); continue }
          replaceMap.set(inner.path, buf)
          staged.push(op)
        }
        if (replaceMap.size === 0) continue

        await backup(archiveFs)
        const { replaced } = await rpf.rebuild(replaceMap, archiveFs)
        written.add(slash(relative(gamePath, archiveFs)))
        const done2 = new Set(replaced)
        for (const op of staged) {
          const inner = rpf.get(op.target)
          push(op, inner && done2.has(inner.path) ? 'applied' : 'failed', inner && done2.has(inner.path) ? undefined : 'rebuild did not include this file')
        }
      } catch (err) {
        for (const op of ops) push(op, 'failed', err instanceof Error ? err.message : String(err))
      }
    }

    onProgress?.(total, total, '')
    return { results, written: [...written] }
  })
}

async function extract(zip: OivZip, source: string): Promise<Buffer | null> {
  try {
    return await zip.buffer(source)
  } catch {
    return null
  }
}

export type { OivOp }
