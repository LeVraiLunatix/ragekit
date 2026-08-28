import { watch, existsSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'

/**
 * Watch the game folder (and the common mod dirs) for changes made outside the
 * app — someone drops an .asi in by hand, OpenIV writes a file — and fire a
 * debounced callback so the UI can re-scan.
 */

let watchers: FSWatcher[] = []
let timer: NodeJS.Timeout | null = null

export function stopGameWatch(): void {
  for (const w of watchers) {
    try {
      w.close()
    } catch {
      /* already closed */
    }
  }
  watchers = []
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function startGameWatch(onChange: () => void): void {
  stopGameWatch()
  const game = store.get('config').game
  if (!game?.valid) return

  const bump = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 1400)
  }

  for (const rel of ['', 'mods', 'scripts', 'plugins']) {
    const dir = rel ? join(game.path, rel) : game.path
    if (!existsSync(dir)) continue
    try {
      const w = watch(dir, { persistent: false }, () => bump())
      w.on('error', () => {})
      watchers.push(w)
    } catch {
      /* dir vanished / not watchable */
    }
  }
}
