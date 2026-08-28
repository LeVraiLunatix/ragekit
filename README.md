<div align="center">

<img src="build/icon.png" width="112" height="112" alt="Logo Ragekit" />

# Ragekit

**Gestionnaire de mods & boîte à outils RPF pour Grand Theft Auto V — solo.**

Importe tes mods une fois, active-les ou désactive-les, explore les archives
`.rpf` du jeu façon OpenIV, et retrouve une désinstallation propre à chaque fois.

[![Télécharger](https://img.shields.io/github/v/release/LeVraiLunatix/ragekit?label=T%C3%A9l%C3%A9charger&style=for-the-badge&color=f5a524)](https://github.com/LeVraiLunatix/ragekit/releases/latest)
[![Licence](https://img.shields.io/badge/Licence-MIT-blue?style=for-the-badge)](LICENSE)
[![Plateforme](https://img.shields.io/badge/Windows-10%20%2F%2011-0a0b0e?style=for-the-badge&logo=windows)](https://github.com/LeVraiLunatix/ragekit/releases/latest)

[**Site**](https://ragekit.vercel.app) · [Télécharger](https://github.com/LeVraiLunatix/ragekit/releases/latest) · [Signaler un bug](https://github.com/LeVraiLunatix/ragekit/issues)

</div>

---

> [!WARNING]
> **Solo uniquement.** Ne lance jamais GTA Online avec Script Hook V ou des
> fichiers de jeu modifiés — ça peut faire bannir ton compte Rockstar. Active le
> **mode Online-safe** avant de jouer en ligne : il sort tous les loaders du
> dossier du jeu pour qu'il redémarre 100 % vanilla.

## Télécharger

Récupère le dernier installeur Windows sur la
**[page des releases](https://github.com/LeVraiLunatix/ragekit/releases/latest)** —
`Ragekit-<version>-setup.exe`. Lance-le : Ragekit t'accompagne avec un assistant
de premier lancement (langue, emplacement du jeu, avertissement de sécurité).

L'installeur n'est pas encore signé, donc Windows SmartScreen peut afficher un
avertissement au premier lancement — choisis *Informations complémentaires →
Exécuter quand même*.

## Fonctions

- **Assistant de premier lancement** — choisis ta langue (FR / EN / ES / DE),
  localise le jeu, lis l'avertissement de sécurité. Flux animé soigné.
- **Détection auto du jeu** — Steam, Epic et le launcher Rockstar, ou sélection
  manuelle du dossier.
- **Import universel** — `.zip`, `.rar`, `.oiv`, ou un simple dossier. Les
  fichiers sont classés et routés automatiquement : `.asi` → racine, fichiers
  `scripts/`, DLL loaders, arbres `mods/`.
- **Packages OpenIV `.oiv`** — métadonnées et opérations sur fichiers loose
  appliquées ; les opérations sur archives `.rpf` sont détectées et signalées.
- **Install / désinstall propres** — les mods vivent dans une bibliothèque
  interne, les fichiers de jeu remplacés sont sauvegardés, et désactiver ou
  retirer un mod restaure les originaux.
- **Mode Online-safe** — un bouton déplace tous les loaders de mods (`dinput8` /
  `version` / `winmm.dll`, `ScriptHookV.dll`, tous les `.asi` racine, et les
  dossiers `mods/` `scripts/` `plugins/`) hors du dossier du jeu, qui redevient
  identique au vanilla, octet pour octet. Rebascule pour tout restaurer.
- **Adoption des mods existants** — scanne le dossier du jeu pour les mods
  installés à la main ou par un autre outil et les intègre à la bibliothèque.
- **Profils** — des configs de mods nommées que tu enclenches en un clic.
- **Ordre de chargement & conflits** — réordonne les `.asi` / scripts et vois
  quand deux mods écrivent le même fichier.
- **Vérif des dépendances** — Script Hook V, Script Hook V .NET, OpenIV.asi.
- **Diagnostic** — parse `ScriptHookV.log`, `asiloader.log`,
  `ScriptHookVDotNet*.log`, `openIV.log` et les événements de crash Windows, puis
  remonte les erreurs.
- **Explorateur de fichiers du jeu** — navigue dans les archives `.rpf` façon
  OpenIV : extraire, prévisualiser, remplacer des fichiers. Les archives add-on
  et du dossier `mods/` s'ouvrent sans clé.
- **Empreinte vanilla** — prends l'empreinte des fichiers de jeu quand ils sont
  propres, puis vérifie plus tard si quelque chose a bougé.
- **Installation depuis GTA5-Mods.com** *(expérimental)* — colle un lien de mod ;
  il télécharge, classe et installe, puis vérifie la page plus tard pour les
  mises à jour.

## Comment marche le déchiffrement RPF / NG

Les tables des matières des archives `.rpf` de GTA V sont chiffrées en AES avec
une clé intégrée à `GTA5.exe`, et les archives vanilla ajoutent une seconde
couche « NG ». Ragekit **ne distribue jamais les clés de Rockstar** :

- La clé AES est trouvée en scannant **ton propre** `GTA5.exe` à la recherche du
  bloc de 32 octets dont le SHA-1 correspond à la valeur connue — la même méthode
  qu'OpenIV et CodeWalker.
- Les données de clé NG sont récupérées au runtime depuis le `magic.dat` public
  de [CodeWalker](https://github.com/dexyfex/CodeWalker) et désembrouillées en
  local avec la clé AES de ton exécutable.

Rien d'exploitable n'est empaqueté, et il faut posséder le jeu pour que quoi que
ce soit fonctionne. Le déchiffrement NG est **expérimental**.

## Développement

```bash
npm install
npm run dev
```

Le renderer tourne aussi dans un navigateur classique (`vite`) via un mock de
`window.api` dans
[`src/renderer/src/lib/browserMock.ts`](src/renderer/src/lib/browserMock.ts) —
pratique pour itérer vite sur l'UI.

### Construire un installeur Windows

```bash
npm run dist
```

Sortie : `release/<version>/Ragekit-<version>-setup.exe` (NSIS). Les tags poussés
(`v*`) construisent et publient une GitHub Release automatiquement via
[`.github/workflows/release.yml`](.github/workflows/release.yml).

## Stack

Electron · electron-vite · React + TypeScript · Tailwind CSS · zustand ·
framer-motion · electron-builder (NSIS). Gestion des archives : `adm-zip`,
`node-unrar-js`, `fast-xml-parser`.

## Crédits

Approche cryptographique et données de clé NG issues d'[OpenIV](https://openiv.com/)
et [CodeWalker](https://github.com/dexyfex/CodeWalker). Ragekit est un projet
indépendant, **sans aucune affiliation avec Rockstar Games ou Take-Two
Interactive**.

## Licence

[MIT](LICENSE) © 2026 LeVraiLunatix
