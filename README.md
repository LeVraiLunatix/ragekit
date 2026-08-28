<div align="center">

<img src="build/icon.png" width="112" height="112" alt="Logo Ragekit" />

# Ragekit

**Un gestionnaire de mods pour Grand Theft Auto V en solo, avec un explorateur d'archives `.rpf` en prime.**

Tu ajoutes tes mods une fois, tu les actives ou tu les coupes quand ça te
chante, et le jour où tu ranges tout, le dossier du jeu se retrouve comme
avant. L'explorateur `.rpf` marche dans l'esprit d'OpenIV.

[![Télécharger](https://img.shields.io/github/v/release/LeVraiLunatix/ragekit?label=T%C3%A9l%C3%A9charger&style=for-the-badge&color=f5a524)](https://github.com/LeVraiLunatix/ragekit/releases/latest)
[![Licence](https://img.shields.io/badge/Licence-MIT-blue?style=for-the-badge)](LICENSE)
[![Plateforme](https://img.shields.io/badge/Windows-10%20%2F%2011-0a0b0e?style=for-the-badge&logo=windows)](https://github.com/LeVraiLunatix/ragekit/releases/latest)

[**Site**](https://ragekit.vercel.app) · [Télécharger](https://github.com/LeVraiLunatix/ragekit/releases/latest) · [Un bug ?](https://github.com/LeVraiLunatix/ragekit/issues)

</div>

---

> [!WARNING]
> **Solo uniquement.** Ne lance jamais GTA Online avec Script Hook V ou des
> fichiers de jeu modifiés : tu risques le ban Rockstar. Avant de jouer en
> ligne, passe en **mode Online-safe** — il sort tous les loaders du dossier et
> le jeu redémarre 100 % vanilla.

## Télécharger

Attrape le dernier `.exe` sur la
**[page des releases](https://github.com/LeVraiLunatix/ragekit/releases/latest)**
et lance-le. Au premier démarrage il te pose trois questions (ta langue, où est
installé GTA V, et le petit rappel sécurité), et c'est bon.

L'installeur n'est pas encore signé, donc Windows SmartScreen va sûrement râler
la première fois : *Informations complémentaires → Exécuter quand même*.

## Ce qu'il fait

- **Premier lancement guidé.** Choix de la langue (FR / EN / ES / DE), on
  localise le jeu, on lit l'avertissement, et on démarre.
- **Détection du jeu.** Steam, Epic, le launcher Rockstar — ou tu pointes le
  dossier à la main.
- **Import.** Un `.zip`, un `.rar`, un `.oiv` ou juste un dossier. Ragekit trie
  ce qu'il y a dedans : les `.asi` à la racine, les scripts au bon endroit, les
  DLL loaders, les arbres `mods/`.
- **Packages OpenIV `.oiv`.** Les métadonnées et les fichiers loose sont posés ;
  les opérations sur archives `.rpf` sont repérées et signalées.
- **Install / désinstall propres.** Tout est copié dans une bibliothèque à part.
  Quand un mod remplace un fichier du jeu, l'original est mis de côté et remis en
  place si tu désactives.
- **Mode Online-safe.** Un bouton, et `dinput8` / `version` / `winmm.dll`,
  `ScriptHookV.dll`, les `.asi` de la racine et les dossiers `mods/` `scripts/`
  `plugins/` quittent le dossier du jeu. Il redevient identique au vanilla, au
  fichier près. Tu rebascules quand tu veux rejouer avec tes mods.
- **Adoption.** Il scanne le dossier du jeu, retrouve les mods que tu as posés à
  la main ou avec un autre outil, et les fait rentrer dans la bibliothèque.
- **Profils.** Tu enregistres un set de mods sous un nom et tu bascules dessus en
  un clic.
- **Ordre de chargement et conflits.** Tu montes et descends les `.asi` et les
  scripts. Si deux mods touchent au même fichier, il te prévient (c'est le
  dernier chargé qui gagne).
- **Dépendances.** Il regarde si Script Hook V, Script Hook V .NET et OpenIV.asi
  sont là. S'il en manque, tu as le lien officiel.
- **Diagnostic.** Il lit `ScriptHookV.log`, `asiloader.log`, les logs SHVDN et
  `openIV.log`, plus les rapports de crash de Windows, et te pointe l'erreur et
  le module fautif.
- **Explorateur de fichiers du jeu.** Tu ouvres les archives `.rpf` comme dans
  OpenIV : extraire, prévisualiser, remplacer. Les archives add-on et celles du
  dossier `mods/` s'ouvrent sans clé.
- **Empreinte vanilla.** Une empreinte de tes fichiers quand le jeu est propre,
  pour vérifier plus tard si quelque chose a bougé.
- **Install depuis GTA5-Mods.com** *(expérimental).* Tu colles un lien, il
  télécharge, classe et installe, puis revient voir la page pour les mises à
  jour.

## Le déchiffrement RPF / NG, en deux mots

Les sommaires des archives `.rpf` sont chiffrés en AES avec une clé planquée
dans `GTA5.exe`, et les archives d'origine ajoutent par-dessus une couche
« NG ». Ragekit ne trimballe aucune clé de Rockstar :

- La clé AES est retrouvée en fouillant **ton propre** `GTA5.exe` : le bloc de
  32 octets dont le SHA-1 tombe sur la valeur connue. C'est la méthode d'OpenIV
  et de CodeWalker.
- Les données NG sont téléchargées au lancement depuis le `magic.dat` public de
  [CodeWalker](https://github.com/dexyfex/CodeWalker), puis décodées chez toi
  avec la clé de ton exécutable.

Rien d'utilisable n'est livré avec Ragekit, et sans le jeu ça ne tourne pas. Le
NG est encore **expérimental**.

## Développement

```bash
npm install
npm run dev
```

Le renderer tourne aussi dans un vrai navigateur (`vite`), grâce à un faux
`window.api` dans
[`src/renderer/src/lib/browserMock.ts`](src/renderer/src/lib/browserMock.ts) —
pratique pour bosser l'UI vite fait.

### Construire l'installeur Windows

```bash
npm run dist
```

Ça sort `release/<version>/Ragekit-<version>-setup.exe` (NSIS). Un tag `v*`
poussé sur GitHub build et publie la release tout seul, via
[`.github/workflows/release.yml`](.github/workflows/release.yml).

## Stack

Electron · electron-vite · React + TypeScript · Tailwind CSS · zustand ·
framer-motion · electron-builder (NSIS). Pour les archives : `adm-zip`,
`node-unrar-js`, `fast-xml-parser`.

## Crédits

L'approche crypto et les données NG viennent d'[OpenIV](https://openiv.com/) et
[CodeWalker](https://github.com/dexyfex/CodeWalker). Ragekit n'a rien à voir
avec Rockstar Games ni Take-Two Interactive — c'est juste un projet perso.

## Licence

[MIT](LICENSE) © 2026 LeVraiLunatix
