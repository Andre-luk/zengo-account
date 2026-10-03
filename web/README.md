# Zengo Account — Console web

Interface de supervision du **Zengo Monitoring Center (ZMC)** : file d'alertes
temps réel, qualification par appels vocaux IA, engagement des stations
d'intervention, gestion du parc SafAlert Solar G1, des comptes clients, de la
tarification et du journal d'audit.

- **Stack** : React 18 + TypeScript + Vite 5, Tailwind CSS 3, TanStack Query 5,
  Zustand 5, Socket.IO 4, Recharts 2, lucide-react.
- **Thème** : clair et sombre (bascule dans l'en-tête, mémorisée dans le
  navigateur), interface entièrement en français.

## Démarrage

```bash
# 1. API + base de données (depuis la racine du dépôt)
npm run db:pg:start      # PostgreSQL embarqué (port 55432)
npm run start:dev        # API NestJS sur http://localhost:3000

# 2. Console web
cd web
npm install
npm run dev              # http://127.0.0.1:5173
```

Le serveur de développement **proxifie** `/api` et `/socket.io` vers
`http://127.0.0.1:3000` : aucune configuration CORS ni variable
d'environnement n'est nécessaire en local.

### Variables d'environnement (facultatif)

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Base de l'API REST |
| `VITE_SOCKET_URL` | `window.location.origin` | Serveur temps réel Socket.IO |

### Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (HMR) |
| `npm run build` | Vérification TypeScript + build de production (`dist/`) |
| `npm run preview` | Sert le build de production |
| `npm run typecheck` | Vérification TypeScript seule |

## Comptes de démonstration

| Profil | Identifiant | Mot de passe |
| --- | --- | --- |
| Super administrateur | `admin@zengo.cd` | `Zengo@2026` |
| Opérateur ZMC | `operateur.zmc@zengo.cd` | `Zengo@2026` |
| Chef d'agence | `chef.kinshasa@zengo.cd` | `Zengo@2026` |
| Client (mobile) | `client.demo@zengo.cd` | `Client@2026` |

## Organisation du code

```
web/src
├─ components/
│  ├─ alerts/      # Panneau de détail d'alerte (cycle de vie complet)
│  ├─ clients/     # Formulaire de création de compte client
│  ├─ layout/      # Coque applicative : barre latérale, en-tête
│  └─ ui/          # Design system : Badge, Button, Card, Modal, Table, Tabs…
├─ hooks/          # Requêtes TanStack Query (une fonction par ressource)
├─ lib/            # Client HTTP, formatage, libellés métier, navigation
├─ providers/      # Canal temps réel Socket.IO
├─ routes/         # Une page par écran du ZMC
├─ store/          # Zustand : session, thème/notifications, temps réel
└─ types/          # Types du domaine partagés avec l'API
```

### Conventions

- **Navigation** : définie dans `src/lib/navigation.ts` avec les rôles
  autorisés ; les routes sont protégées par `RequireAuth` / `RequireRole`.
- **Données** : toutes les requêtes passent par `src/hooks/queries.ts` et les
  clés de cache centralisées de `src/lib/queryClient.ts`.
- **Temps réel** : `RealtimeProvider` ouvre le namespace `/realtime`, invalide
  le cache des alertes et déclenche les notifications visuelles.
- **Libellés** : aucune chaîne métier en dur dans les composants — tout passe
  par `src/lib/labels.ts` (libellé français + ton visuel).
- **Identifiants** : les statuts, types et rôles restent en anglais technique
  dans le code ; seul l'affichage est traduit.

## Écrans

| Route | Écran | Rôles |
| --- | --- | --- |
| `/connexion` | Authentification (mot de passe puis 2FA) | tous |
| `/tableau-de-bord` | KPI, répartitions, file d'attente prioritaire, flux temps réel | tous |
| `/alertes` | Console d'alertes : filtres, file paginée, dossier d'intervention | tous |
| `/clients` | Comptes clients Zengo, création, installation | encadrement, opérateurs |
| `/dispositifs` | Parc SafAlert : provisioning, armement, sous-appareils | tous |
| `/tarifs` | Grilles tarifaires, boutons SOS, taux USD/CDF, simulateur | encadrement, finance |
| `/organisations` | Hiérarchie nationale, zones, agences, stations | encadrement |
| `/utilisateurs` | Comptes, rôles, habilitations, réinitialisation | encadrement |
| `/journal` | Journal d'audit (lecture seule) | super admin, direction, qualité, DAF |

## Actions clés de la console d'alertes

- Prendre en charge, escalader (toutes les équipes du PDC), clôturer avec
  compte rendu, classer en faux positif, annuler, ajouter une note.
- Engager les secours : dispatch automatique selon le type d'alerte ou
  sélection manuelle des stations.
- Suivre le statut de chaque station (accusée, sur place, terminée, refusée).
- Consulter la chronologie et les appels vocaux IA (touche DTMF, intention
  détectée, transcription, durée).
