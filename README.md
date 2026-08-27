# GTAV Mod Manager

A modern desktop mod manager for **Grand Theft Auto V (single-player / Story Mode)**.
Import mods once, toggle them on and off, and get a clean uninstall every time.

> ⚠️ Story Mode only. Never launch GTA Online with Script Hook V or modified game
> files present — it can get your Rockstar account banned.

## Features (v1)

- **Auto-detect** the game folder for Steam, Epic, and the Rockstar launcher (or browse manually).
- **Drop-in mods** — `.zip` archives or loose folders containing `.asi` plugins,
  `scripts/` files (`.lua` / `.js` / `.cs` / `.dll`), and loader DLLs. Files are
  classified and routed to the right place automatically.
- **OpenIV `.oiv` packages** — metadata + loose-file operations are applied.
  Operations that write *inside* `.rpf` archives are detected and reported
  (full RPF editing is planned for v2).
- **Safe install/uninstall** — mods are copied into an internal library, replaced
  game files are backed up, and disabling or removing a mod restores the originals.
- **Dependency check** — detects Script Hook V, Script Hook V .NET, and OpenIV.asi,
  and links to their official download pages.

## Development

```bash
npm install
npm run dev
```

## Build a Windows installer

```bash
npm run dist
```

Output lands in `release/<version>/GTAV Mod Manager-<version>-setup.exe` (NSIS).

## Stack

Electron + electron-vite · React + TypeScript · Tailwind CSS · zustand ·
electron-builder (NSIS).
