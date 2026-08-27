# GTAV Mod Manager

A modern desktop mod manager for **Grand Theft Auto V (single-player / Story Mode)**.
Import mods once, toggle them on and off, and get a clean uninstall every time.

> ⚠️ Story Mode only. Never launch GTA Online with Script Hook V or modified game
> files present — it can get your Rockstar account banned. Use **online-safe mode**
> before playing online.

## Features

- **First-run wizard** — pick language (FR / EN / ES / DE), locate the game, read
  the safety notice. Polished animated flow.
- **Game auto-detect** — Steam, Epic, and the Rockstar launcher, or browse manually.
- **Import** `.zip`, `.rar`, `.oiv`, or a loose folder. Files are classified and
  routed: `.asi` → root, `scripts/` files, loader DLLs, `mods/` trees.
- **OpenIV `.oiv` packages** — metadata + loose-file operations applied; `.rpf`
  archive ops detected and reported (full RPF editing is planned).
- **Safe install / uninstall** — mods live in an internal library, replaced game
  files are backed up, disabling or removing a mod restores the originals.
- **Online-safe mode** — one toggle moves every mod loader (`dinput8`/`version`/
  `winmm.dll`, `ScriptHookV.dll`, every root `.asi`, and the `mods/` `scripts/`
  `plugins/` folders) **out of the game directory** into a
  `GTAV Mod Manager (parked mods)` folder right next to it (same drive, so the
  move is instant), leaving the game folder byte-identical to vanilla. Toggle
  back to restore, and the parked folder is removed when empty.
- **Adopt existing mods** — scans the game folder for mods installed by hand or
  another tool and pulls them into the library.
- **Profiles** — named mod loadouts you switch between in one click.
- **Load order & conflicts** — reorder `.asi`/scripts, and see when two mods write
  the same file.
- **Dependency check** — Script Hook V, Script Hook V .NET, OpenIV.asi.
- **Diagnostics** — parses `ScriptHookV.log`, `asiloader.log`,
  `ScriptHookVDotNet*.log`, `openIV.log` and surfaces the errors.
- **Vanilla snapshot** — fingerprint core game files while clean, then verify drift.
- **GTA5-Mods.com install** (experimental) — paste a mod link, it downloads,
  classifies and installs; checks the page later for updates.

## Development

```bash
npm install
npm run dev
```

The renderer also runs in a plain browser (`vite`) via a `window.api` mock in
`src/renderer/src/lib/browserMock.ts` — handy for fast UI work.

## Build a Windows installer

```bash
npm run dist
```

Output: `release/<version>/GTAV Mod Manager-<version>-setup.exe` (NSIS).

## Stack

Electron + electron-vite · React + TypeScript · Tailwind CSS · zustand ·
framer-motion · electron-builder (NSIS). Archive handling: adm-zip, node-unrar-js,
fast-xml-parser.
