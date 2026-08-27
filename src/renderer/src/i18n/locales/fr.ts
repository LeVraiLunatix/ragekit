import type { Dict } from './en'

export const fr: Dict = {
  common: {
    back: 'Retour',
    next: 'Suivant',
    continue: 'Continuer',
    skip: 'Ignorer',
    loading: 'Chargement…',
  },
  lang: {
    fr: 'Français',
    en: 'Anglais',
    es: 'Espagnol',
    de: 'Allemand',
  },
  titlebar: {
    noGameFolder: 'aucun dossier de jeu',
  },
  nav: {
    library: 'Bibliothèque',
    add: 'Ajouter des mods',
    dependencies: 'Dépendances',
    settings: 'Paramètres',
    openGameFolder: 'Ouvrir le dossier du jeu',
    disclaimer: 'Solo uniquement. Ne jamais charger de mods sur GTA Online.',
  },
  onboarding: {
    stepOf: 'Étape {current} sur {total}',
    welcome: {
      title: 'GTAV Mod Manager',
      subtitle:
        "Installe des mods pour le mode Histoire de GTA V, active-les ou désactive-les, et profite d'une désinstallation propre à chaque fois.",
      cta: 'Commencer',
    },
    language: {
      title: 'Choisis ta langue',
      subtitle: 'Tu pourras la changer plus tard dans les Paramètres.',
    },
    game: {
      title: 'Localise Grand Theft Auto V',
      subtitle: 'Le gestionnaire a besoin du dossier qui contient GTA5.exe.',
      autoDetect: 'Détection auto',
      browse: 'Parcourir…',
      detecting: 'Recherche de ton installation…',
      notFound:
        "Impossible de trouver GTA V automatiquement. Utilise Parcourir pour sélectionner le dossier.",
      valid: 'Jeu trouvé',
      invalid: "GTA5.exe est introuvable dans ce dossier",
      detectedVia: 'via {platform}',
      version: 'build {version}',
      later: 'Je configurerai ça plus tard',
    },
    safety: {
      title: 'Un point important',
      body1:
        "Les mods installés avec cet outil sont pour le mode Histoire. Lancer GTA Online avec Script Hook V ou des fichiers de jeu modifiés peut faire bannir ton compte Rockstar.",
      body2: 'Désactive toujours tes mods avant de jouer en ligne.',
      checkbox: "J'ai compris — mode Histoire uniquement",
    },
    done: {
      title: 'Tout est prêt',
      subtitle:
        'Ta bibliothèque est prête. Dépose un .zip ou un .oiv pour installer ton premier mod.',
      cta: 'Ouvrir GTAV Mod Manager',
    },
  },
  library: {
    title: 'Bibliothèque',
    subtitle: 'Active un mod pour l’installer ou le désactiver.',
    add: 'Ajouter',
    count_one: '{count} mod',
    count_other: '{count} mods',
    emptyTitle: 'Aucun mod pour le moment',
    emptyHint:
      "Importe un .zip ou un .oiv pour commencer. Tout est suivi pour une désinstallation propre plus tard.",
    emptyCta: 'Ajouter ton premier mod',
    removeConfirm: 'Supprimer « {name} » et restaurer les fichiers qu’il a remplacés ?',
    files_one: '{count} fichier',
    files_other: '{count} fichiers',
    addedAgo: 'ajouté {time}',
    status: {
      installed: 'installé',
      disabled: 'désactivé',
      notInstalled: 'non installé',
      error: 'erreur',
    },
  },
  add: {
    title: 'Ajouter des mods',
    subtitle:
      'Dépose un .zip, un .oiv ou un dossier de mod. Il est copié dans ta bibliothèque et analysé.',
    needGameFolder: 'Définis ton dossier GTA V dans les Paramètres avant d’installer quoi que ce soit.',
    dropHere: 'Glisse les fichiers de mod ici',
    chooseFiles: 'Choisir des fichiers…',
    install: 'Installer',
    noMeta: 'Aucune métadonnée',
  },
  plan: {
    files_one: '{count} fichier',
    files_other: '{count} fichiers',
    overwrites_one: '{count} écrasement',
    overwrites_other: '{count} écrasements',
    oivPackage: 'Paquet OIV',
    dropin: 'Drop-in',
    missingDeps: 'Dépendances manquantes',
    missingDepsHint:
      "{list} — à installer depuis l’onglet Dépendances. Tu peux quand même installer ce mod ; il ne se chargera simplement pas en jeu pour l’instant.",
    roles: {
      asi: 'Plugins ASI',
      scriptDll: 'Plugins de script .NET',
      script: 'Fichiers de script',
      rootDll: 'DLL de chargement (racine du jeu)',
      modsTree: 'Fichiers dans l’arbre mods/',
      asset: 'Config & ressources',
      ignored: 'Ignorés',
    },
  },
  deps: {
    title: 'Dépendances',
    subtitle:
      'Runtimes dont dépendent les mods. Installe ceux qui manquent depuis leurs pages officielles.',
    rescan: 'Rescanner',
    setFolderFirst: 'Définis d’abord ton dossier de jeu',
    setFolderHint: 'Les dépendances sont détectées dans l’installation de GTA V.',
    found: 'Trouvé : {detail}',
    notDetected: 'Non détecté',
    getIt: 'Obtenir',
    hint: 'Après avoir téléchargé Script Hook V, place ScriptHookV.dll et dinput8.dll dans ton dossier de jeu, puis clique sur Rescanner.',
    names: {
      scripthookv: 'Script Hook V',
      scripthookvdotnet: 'Script Hook V .NET',
      'openiv-asi': 'OpenIV.asi (support du dossier mods)',
      'community-sh': 'Runtime Community Script Hook V .NET',
    },
  },
  settings: {
    title: 'Paramètres',
    subtitle: 'Indique au gestionnaire où se trouve ton installation de Grand Theft Auto V.',
    gameFolder: 'Dossier du jeu',
    valid: 'valide',
    invalid: 'GTA5.exe introuvable',
    notSet: 'Non défini',
    autoDetect: 'Détection auto',
    browse: 'Parcourir…',
    clear: 'Effacer',
    exeInfo: 'Version de l’exécutable {version} · détecté via {platform}',
    detectFail: 'Impossible de détecter GTA V automatiquement. Utilise « Parcourir » pour sélectionner le dossier.',
    language: 'Langue',
    languageSub: 'Langue de l’interface.',
    note: "Les mods sont copiés dans une bibliothèque interne, tu peux donc supprimer le téléchargement d’origine après import. Les fichiers de jeu écrasés sont sauvegardés puis restaurés automatiquement quand tu désactives ou supprimes un mod.",
  },
  time: {
    justNow: 'à l’instant',
    minutesAgo: 'il y a {n} min',
    hoursAgo: 'il y a {n} h',
    daysAgo: 'il y a {n} j',
  },
}
