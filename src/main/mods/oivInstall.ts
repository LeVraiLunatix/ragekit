import { join, relative, dirname, basename, sep } from 'node:path'
import type { OivOpResult, OivTarget } from '@shared/types'
import { parseOivPackage, oivBaseDir, type OivOp } from './oiv'
import { withOivZip, type OivZip } from './oivZip'
import { ensureDir, copyFile, pathExists, removeFileAndPrune } from './fsutil'
import { loadAesKey } from '../rpf/crypto'
import { loadNgKeys } from '../rpf/ngkeys'
import { Rpf7, type RpfMutation, type RpfKeys } from '../rpf/rpf7'

const slash = (p: string): string => p.split(sep).join('/')
const lower = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

/**
 * Edit inside a nested `.rpf` (or deeper). `chain[0]` is a direct child of
 * `parent`; the leaf ops are applied at the bottom. NG nested archives are
 * decrypted to OPEN in memory first. Returns the rebuilt nested archive bytes
 * plus which leaf ops landed.
 */
async function editNested(
  parent: Rpf7,
  chain: string[],
  leaf: { op: OivOp; content: Buffer }[],
  keys: RpfKeys,
): Promise<{ buf: Buffer; ok: Set<OivOp>; err: Map<OivOp, string> }> {
  const ok = new Set<OivOp>()
  const err = new Map<OivOp, string>()
  const fail = (msg: string): { buf: Buffer; ok: Set<OivOp>; err: Map<OivOp, string> } => {
    for (const l of leaf) err.set(l.op, msg)
    return { buf: Buffer.alloc(0), ok, err }
  }

  let nested: Rpf7
  try {
    nested = await parent.openNested(chain[0])
  } catch (e) {
    return fail(`open ${chain[0]}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (nested.encryption === 'NG') {
    if (!keys.ng) return fail(`${chain[0]} is NG-encrypted and NG keys aren't loaded`)
    const conv = await nested.convertToOpen()
    nested = Rpf7.fromBuffer(conv.buf!, keys, `${parent.label}/${chain[0]}`, basename(chain[0]), conv.buf!.length)
  }

  let muts: RpfMutation[]
  if (chain.length === 1) {
    muts = leaf.map((l) => {
      const inner = nested.get(l.op.target)
      return {
        op: (inner ? 'replace' : 'add') as 'replace' | 'add',
        path: lower(inner?.path ?? l.op.target),
        content: l.content,
      }
    })
  } else {
    const sub = await editNested(nested, chain.slice(1), leaf, keys)
    for (const o of sub.ok) ok.add(o)
    for (const [o, m] of sub.err) err.set(o, m)
    if (!sub.buf.length) return { buf: Buffer.alloc(0), ok, err }
    muts = [{ op: 'replace', path: lower(chain[1]), content: sub.buf }]
  }

  const r = await nested.rebuildTree(muts)
  if (chain.length === 1) {
    const done = new Set([...r.added, ...r.replaced])
    for (const l of leaf) {
      const inner = nested.get(l.op.target)
      if (done.has(lower(inner?.path ?? l.op.target))) ok.add(l.op)
      else err.set(l.op, 'nested rebuild did not include this file')
    }
  }
  return { buf: r.buf!, ok, err }
}

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
 *   common.rpf) are decrypted to OPEN in place once, then a single rebuild per
 *   archive applies every replacement and every brand-new file (entry table and
 *   name table regenerated). A whole-archive backup is taken first.
 * - Still deferred: nested archives, replacing a resource (.ytd/.yft…) inside a
 *   .rpf, deletes inside a .rpf, and in-place XML edits — reported as skipped.
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
          results.push({ target: op.target, archive, kind: 'xml-edit', status: 'skipped', detail: 'in-place XML edit — not supported yet' })
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

        const keys: RpfKeys = { aes: aesKey ?? null, ng: ngKeys ?? null }
        const mutations: RpfMutation[] = []
        const staged: { op: OivOp; path: string }[] = []
        let touchesResource = false
        let touchesNested = false

        // ── nested-archive ops: rebuild the inner .rpf in memory ─────────────
        const nestedGroups = new Map<string, OivOp[]>()
        for (const op of ops.filter((o) => o.archiveChain.length > 1)) {
          const key = op.archiveChain.slice(1).join(' ')
          nestedGroups.set(key, [...(nestedGroups.get(key) ?? []), op])
        }
        for (const [, nOps] of nestedGroups) {
          const chain = nOps[0].archiveChain.slice(1)
          const leaf: { op: OivOp; content: Buffer }[] = []
          for (const op of nOps) {
            const buf = op.source ? await extract(zip, op.source) : null
            if (!buf) { push(op, 'failed', 'source missing in package'); continue }
            leaf.push({ op, content: buf })
          }
          if (leaf.length === 0) continue
          const res = await editNested(rpf, chain, leaf, keys)
          for (const op of nOps) {
            if (res.ok.has(op)) push(op, 'applied')
            else if (res.err.has(op)) push(op, 'failed', res.err.get(op))
          }
          if (res.buf.length) {
            mutations.push({ op: 'replace', path: lower(chain[0]), content: res.buf })
            touchesNested = true
          }
        }

        // ── direct ops on this archive ──────────────────────────────────────
        for (const op of ops.filter((o) => o.archiveChain.length === 1)) {
          const inner = rpf.get(op.target)
          if (inner?.isDir) { push(op, 'skipped', `${op.target} is a folder in ${archiveRel}`); continue }
          const buf = op.source ? await extract(zip, op.source) : null
          if (!buf) { push(op, 'failed', 'source missing in package'); continue }
          const rsc7 = buf.length >= 16 && buf.readUInt32LE(0) === 0x37435352
          if (inner?.isResource && !rsc7) {
            push(op, 'skipped', `${op.target} is a resource but the package source isn't an RSC7 file`)
            continue
          }
          if (inner?.isResource || rsc7) touchesResource = true
          const path = lower(inner?.path ?? op.target)
          mutations.push({ op: inner ? 'replace' : 'add', path, content: buf })
          staged.push({ op, path })
        }
        if (mutations.length === 0) continue

        await backup(archiveFs)
        const needsTree = touchesResource || touchesNested || mutations.some((m) => m.op === 'add')
        const done2 = new Set<string>()
        if (needsTree) {
          const r = await rpf.rebuildTree(mutations, archiveFs)
          for (const p of [...r.added, ...r.replaced]) done2.add(p)
        } else {
          const map = new Map(mutations.map((m) => [m.path, m.content!]))
          const r = await rpf.rebuild(map, archiveFs)
          for (const p of r.replaced) done2.add(p)
        }
        written.add(slash(relative(gamePath, archiveFs)))
        for (const s of staged) {
          push(s.op, done2.has(s.path) ? 'applied' : 'failed', done2.has(s.path) ? undefined : 'archive rebuild did not include this file')
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
