import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'

export async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  async function rec(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) await rec(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  await rec(dir)
  return out
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function copyFile(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to))
  await fs.copyFile(from, to)
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function copyDir(from: string, to: string): Promise<void> {
  await fs.cp(from, to, { recursive: true })
}

/** Move a file or directory, falling back to copy+delete across volumes (EXDEV). */
export async function movePath(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to))
  try {
    await fs.rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await fs.cp(from, to, { recursive: true })
    await fs.rm(from, { recursive: true, force: true })
  }
}

/** Remove a file and any now-empty parent folders up to (not including) `stopAt`. */
export async function removeFileAndPrune(file: string, stopAt: string): Promise<void> {
  try {
    await fs.rm(file, { force: true })
  } catch {
    // already gone
  }
  let dir = dirname(file)
  while (dir.length > stopAt.length && dir.startsWith(stopAt)) {
    try {
      const remaining = await fs.readdir(dir)
      if (remaining.length > 0) break
      await fs.rmdir(dir)
    } catch {
      break
    }
    dir = dirname(dir)
  }
}
