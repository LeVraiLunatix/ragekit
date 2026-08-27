/**
 * Regenerate build/icon.png (512) and build/icon.ico (multi-size) from
 * build/icon.svg — the same R-monogram mark as <Logo>. Run: npm run icons
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'build', 'icon.svg'))

const png = (size) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer()

// Windows taskbar / Explorer pull whichever size they need from the .ico.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoBuffers = await Promise.all(icoSizes.map(png))
await writeFile(join(root, 'build', 'icon.ico'), await pngToIco(icoBuffers))

// electron-builder also wants a 512 png (Linux / fallback / installer art).
await writeFile(join(root, 'build', 'icon.png'), await png(512))

console.log(`icon.ico (${icoSizes.join('/')}) + icon.png (512) written to build/`)
