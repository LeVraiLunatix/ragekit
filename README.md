<div align="center">

<img src="build/icon.png" width="112" height="112" alt="Ragekit logo" />

# Ragekit

**A modern mod manager & RPF toolkit for Grand Theft Auto V — single-player.**

Import mods once, toggle them on and off, browse the game's `.rpf` archives
OpenIV-style, and get a clean uninstall every time.

[![Download](https://img.shields.io/github/v/release/LeVraiLunatix/ragekit?label=Download&style=for-the-badge&color=f5a524)](https://github.com/LeVraiLunatix/ragekit/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows-10%20%2F%2011-0a0b0e?style=for-the-badge&logo=windows)](https://github.com/LeVraiLunatix/ragekit/releases/latest)

[**Website**](https://ragekit.vercel.app) · [Download](https://github.com/LeVraiLunatix/ragekit/releases/latest) · [Report a bug](https://github.com/LeVraiLunatix/ragekit/issues)

</div>

---

> [!WARNING]
> **Story Mode only.** Never launch GTA Online with Script Hook V or modified
> game files present — it can get your Rockstar account banned. Flip on
> **Online-safe mode** before you play online; it moves every mod loader out of
> the game folder so the game boots 100% vanilla.

## Download

Grab the latest Windows installer from the
**[Releases page](https://github.com/LeVraiLunatix/ragekit/releases/latest)** —
`Ragekit-<version>-setup.exe`. Run it, and Ragekit walks you through a first-run
wizard (language, game location, safety notice).

The installer is not code-signed yet, so Windows SmartScreen may warn on first
launch — choose *More info → Run anyway*.

## Features

- **First-run wizard** — pick your language (FR / EN / ES / DE), locate the game,
  read the safety notice. Polished animated flow.
- **Game auto-detect** — Steam, Epic, and the Rockstar launcher, or browse to the
  folder manually.
- **Import anything** — `.zip`, `.rar`, `.oiv`, or a loose folder. Files are
  classified and routed automatically: `.asi` → root, `scripts/` files, loader
  DLLs, `mods/` trees.
- **OpenIV `.oiv` packages** — metadata and loose-file operations are applied;
  `.rpf` archive ops are detected and reported.
- **Safe install / uninstall** — mods live in an internal library, replaced game
  files are backed up, and disabling or removing a mod restores the originals.
- **Online-safe mode** — one toggle moves every mod loader (`dinput8` / `version`
  / `winmm.dll`, `ScriptHookV.dll`, every root `.asi`, and the `mods/` `scripts/`
  `plugins/` folders) out of the game directory, leaving the folder
  byte-identical to vanilla. Toggle back to restore.
- **Adopt existing mods** — scans the game folder for mods installed by hand or
  another tool and pulls them into the library.
- **Profiles** — named mod loadouts you switch between in one click.
- **Load order & conflicts** — reorder `.asi` / scripts and see when two mods
  write the same file.
- **Dependency check** — Script Hook V, Script Hook V .NET, OpenIV.asi.
- **Diagnostics** — parses `ScriptHookV.log`, `asiloader.log`,
  `ScriptHookVDotNet*.log`, `openIV.log` and Windows crash events, then surfaces
  the errors.
- **Game files browser** — browse `.rpf` archives OpenIV-style: extract, preview
  and replace files. Add-on and `mods/`-folder archives open with no keys.
- **Vanilla snapshot** — fingerprint core game files while clean, then verify
  later whether anything drifted.
- **GTA5-Mods.com install** *(experimental)* — paste a mod link; it downloads,
  classifies and installs, then checks the page later for updates.

## How the RPF / NG decryption works

GTA V's `.rpf` archive tables of contents are AES-encrypted with a key baked into
`GTA5.exe`, and the vanilla archives add a second "NG" layer. Ragekit **never
ships Rockstar's keys**:

- The AES key is found by scanning **your own** `GTA5.exe` for the 32-byte block
  whose SHA-1 matches the well-known value — the same method OpenIV and
  CodeWalker use.
- The NG key data is fetched at runtime from
  [CodeWalker](https://github.com/dexyfex/CodeWalker)'s public `magic.dat` and
  unscrambled locally with the AES key from your executable.

Nothing usable is bundled, and you must own the game for any of it to work. NG
decryption is **experimental**.

## Development

```bash
npm install
npm run dev
```

The renderer also runs in a plain browser (`vite`) via a `window.api` mock in
[`src/renderer/src/lib/browserMock.ts`](src/renderer/src/lib/browserMock.ts) —
handy for fast UI work.

### Build a Windows installer

```bash
npm run dist
```

Output: `release/<version>/Ragekit-<version>-setup.exe` (NSIS). Tagged pushes
(`v*`) build and publish a GitHub Release automatically via
[`.github/workflows/release.yml`](.github/workflows/release.yml).

## Stack

Electron · electron-vite · React + TypeScript · Tailwind CSS · zustand ·
framer-motion · electron-builder (NSIS). Archive handling: `adm-zip`,
`node-unrar-js`, `fast-xml-parser`.

## Credits

Crypto approach and NG key data from [OpenIV](https://openiv.com/) and
[CodeWalker](https://github.com/dexyfex/CodeWalker). Ragekit is an independent
project and is **not affiliated with Rockstar Games or Take-Two Interactive**.

## License

[MIT](LICENSE) © 2026 LeVraiLunatix
