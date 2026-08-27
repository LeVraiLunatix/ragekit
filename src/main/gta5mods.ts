import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ImportResult, RemoteMod, UpdateInfo } from '@shared/types'
import { store } from './store'
import { importFromPaths, updateMod } from './mods/library'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function first(html: string, ...res: RegExp[]): string | undefined {
  for (const re of res) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

type Sniffed = 'zip' | 'rar' | '7z' | 'html' | 'unknown'

/** Identify a downloaded blob by its magic bytes, not by a guessed extension. */
function sniff(buf: Buffer): Sniffed {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return 'zip' // PK
  if (buf.length >= 7 && buf.toString('latin1', 0, 6) === 'Rar!\x1a\x07') return 'rar'
  if (buf.length >= 6 && buf.toString('hex', 0, 6) === '377abcaf271c') return '7z'
  const head = buf.toString('latin1', 0, 512).trimStart().toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml'))
    return 'html'
  return 'unknown'
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export async function fetchModInfo(rawUrl: string): Promise<RemoteMod> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new Error('That is not a valid URL.')
  }
  if (!/(^|\.)gta5-mods\.com$/i.test(url.hostname)) {
    throw new Error('Only gta5-mods.com links are supported for now.')
  }

  const res = await fetch(url.toString(), { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`GTA5-Mods responded ${res.status}. Try again or download manually.`)
  const html = await res.text()
  if (/Just a moment|cf-browser-verification|challenge-platform/i.test(html)) {
    throw new Error('GTA5-Mods is behind a Cloudflare check right now. Download the file manually and drop it in.')
  }

  const name =
    decodeEntities(
      first(
        html,
        /<meta property="og:title" content="([^"]+?)(?:\s*-\s*GTA5-Mods\.com)?"/i,
        /<h1[^>]*>\s*(?:<a[^>]*>)?\s*([^<]+?)\s*(?:<\/a>)?\s*<\/h1>/i,
      ) ?? '',
    ) || url.pathname.split('/').filter(Boolean).pop() || 'Unknown mod'

  const imageUrl = first(html, /<meta property="og:image" content="([^"]+)"/i)
  const author = first(
    html,
    /href="\/users\/[^"]+"[^>]*>\s*([^<]+?)\s*</i,
    /itemprop="author"[^>]*>\s*([^<]+?)\s*</i,
  )
  const updatedAt = first(
    html,
    /<time[^>]*datetime="([0-9T:\-+.Z]+)"[^>]*>[^<]*<\/time>\s*<\/span>\s*<\/div>\s*<div[^>]*>\s*Last Updated/i,
    /Last Updated[^<]*<[^>]*>\s*<time[^>]*datetime="([0-9T:\-+.Z]+)"/i,
    /<time[^>]*datetime="([0-9T:\-+.Z]+)"/i,
  )

  let downloadUrl =
    first(
      html,
      /href="(https?:\/\/[^"]*gta5-mods\.com\/[^"]+\/download\/\d+)"/i,
      /href="(\/[^"]+\/download\/\d+)"/i,
    ) ?? ''
  if (downloadUrl.startsWith('/')) downloadUrl = `https://www.gta5-mods.com${downloadUrl}`

  // Some mods only link out to an external host.
  const external = first(html, /class="btn-download"[^>]*href="(https?:\/\/(?!www\.gta5-mods\.com)[^"]+)"/i)

  return {
    url: url.toString(),
    name,
    author,
    imageUrl,
    updatedAt,
    downloadUrl: downloadUrl || external || '',
    autoInstallable: !!downloadUrl,
  }
}

export async function installFromRemote(
  remote: RemoteMod,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<ImportResult> {
  if (!remote.autoInstallable || !remote.downloadUrl) {
    throw new Error('This mod is hosted off-site — open the page and download it manually.')
  }

  onProgress?.(0, 1, remote.name)
  const res = await fetch(remote.downloadUrl, {
    headers: { 'user-agent': UA, referer: remote.url },
  })
  if (!res.ok) throw new Error(`Download failed (${res.status}).`)

  const buf = Buffer.from(await res.arrayBuffer())
  const kind = sniff(buf)
  if (kind === 'html' || kind === 'unknown') {
    throw new Error(
      kind === 'html'
        ? 'The download returned a web page, not a mod file (GTA5-Mods may be gating it). Open the mod page and download it manually, then drop the file in.'
        : 'The downloaded file is not a recognised archive. Download it manually from the mod page and drop it in.',
    )
  }
  if (kind === '7z') {
    throw new Error('This mod ships as a .7z archive, which is not supported yet. Extract it and drop the folder in.')
  }

  const cd = res.headers.get('content-disposition') ?? ''
  const rawStem =
    first(cd, /filename\*=(?:UTF-8'')?"?([^";]+)"?/i, /filename="?([^";]+)"?/i) ||
    new URL(res.url).pathname.split('/').pop() ||
    remote.name ||
    'mod'
  const stem = decodeURIComponent(rawStem)
    .replace(/\.(zip|rar|oiv|7z)$/i, '')
    .replace(/[/\\:*?"<>|]/g, '_')
  const filename = `${stem}.${kind}` // extension from the real bytes

  const tmp = join(app.getPath('temp'), `gtavmm-${Date.now()}-${filename}`)
  await fs.writeFile(tmp, buf)
  onProgress?.(1, 1, filename)

  try {
    const [result] = await importFromPaths([tmp])
    const mod = updateMod(result.mod.id, {
      name: remote.name || result.mod.name,
      author: remote.author ?? result.mod.author,
      sourceUrl: remote.url,
      remoteUpdatedAt: remote.updatedAt,
    })
    return { mod, plan: result.plan }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
}

export async function checkModUpdates(): Promise<UpdateInfo[]> {
  const out: UpdateInfo[] = []
  for (const mod of store.get('mods')) {
    if (!mod.sourceUrl) continue
    try {
      const info = await fetchModInfo(mod.sourceUrl)
      if (info.updatedAt && info.updatedAt !== mod.remoteUpdatedAt) {
        out.push({
          modId: mod.id,
          currentUpdatedAt: mod.remoteUpdatedAt,
          latestUpdatedAt: info.updatedAt,
        })
      }
    } catch {
      // skip mods we can't re-check
    }
  }
  return out
}
