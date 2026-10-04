# Zengo Account — API de la plateforme SafAlert Solar G1

Écosystème logiciel de la solution de sécurité connectée **SafAlert Solar G1**
(Onesha Global) : sécurité anti-intrusion, incendie, e-santé préventive et
gestion d'interventions d'urgence, en architecture **multi-tenant**
(Direction générale → Zones régionales → Agences/PDC → Stations de secours).

> Ce dépôt couvre les **itérations 1 à 6** : socle multi-tenant (comptes, auth/RBAC,
> clients, dispositifs IoT, tarification, audit), la chaîne d'alerte du
> **Zengo Monitoring Center** (pipeline d'alertes, appel vocal IA multilingue,
> affectation aux stations, temporisation 5 min, diffusion temps réel), les
> **interventions terrain**, les **abonnements & Mobile Money**, les
> **mutations géographiques** des dossiers clients et l'**e-santé connectée**.

---

## Démarrage rapide

### 1. Dépendances

```bash
npm install
cp .env.example .env
```

### 2. Base de données

Deux options :

**A. PostgreSQL embarqué (aucun sudo / Docker requis)** — recommandé en local :

```bash
npm run db:pg:start   # port 55432, données dans ./.pgdata, Ctrl+C ou `npm run db:pg:stop` pour arrêter
```

**B. Docker** :

```bash
docker compose up -d   # PostgreSQL sur 5432
```

Ajustez `DB_PORT` dans `.env` selon l'option choisie (55432 ou 5432).

### 3. Initialisation et lancement

```bash
npm run seed        # arborescence, groupes tarifaires, comptes de référence, jeu de démonstration
npm run start:dev   # ou `npm run build && npm run start:prod`
```

| URL | Description |
|---|---|
| `http://localhost:3000/api/v1/health` | Sonde de santé |
| `http://localhost:3000/docs` | Documentation OpenAPI (Swagger UI) |

### 4. Console web (ZMC)

La console de supervision se trouve dans `web/` (React 18 + Vite + Tailwind).
Elle consomme l'API et le canal temps réel via un proxy de développement : rien
à configurer.

```bash
cd web
npm install
npm run dev      # http://127.0.0.1:5173
```

Détails, comptes de démonstration et organisation du code : [`web/README.md`](web/README.md).

### 5. Vérification complète

```bash
npm run verify                  # type-check + tests unitaires + build (API)
npm run smoke                   # parcours de bout en bout (API déjà lancée)
npm --prefix web run build      # type-check + build de la console
```

---

## Comptes créés par le seed

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Super admin (Direction générale) | `admin@zengo.cd` | `Zengo@2026` |
| Responsable plateforme (création clients) | `plateforme@zengo.cd` | `Zengo@2026` |
| Direction technique | `technique@zengo.cd` | `Zengo@2026` |
| Chef d'agence Kinshasa | `chef.kinshasa@zengo.cd` | `Zengo@2026` |
| Technicien installateur | `technicien@zengo.cd` | `Zengo@2026` |
| Opérateur ZMC | `operateur.zmc@zengo.cd` | `Zengo@2026` |
| Agent de station (incendie) | `station.pompiers@zengo.cd` | `Zengo@2026` |
| Client de démonstration | `client.demo@zengo.cd` | `Client@2026` |

> ⚠️ Ces comptes sont destinés au développement. En production, renseignez
> `SEED_ADMIN_PASSWORD` et remplacez tous les mots de passe.

---

## Scripts

| Commande | Rôle |
|---|---|
| `npm run start:dev` | Démarrage en mode watch |
| `npm run build` / `npm run start:prod` | Compilation et exécution production |
| `npm run lint` | Vérification des types (`tsc --noEmit`) |
| `npm test` | Tests unitaires (Jest) |
| `npm run verify` | Types + tests + build |
| `npm run smoke` | Test de fumée socle (comptes, auth, tarifs, 2FA) |
| `npm run smoke:alerts` | Test de fumée alertes & ZMC (46 contrôles) |
| `npm run smoke:iot` | Test de fumée IoT : chaîne MQTT → alerte (19 contrôles) |
| `npm run smoke:interventions` | Test de fumée interventions terrain (52 contrôles) |
| `npm run smoke:subscriptions` | Test de fumée abonnements & Mobile Money (51 contrôles) |
| `npm run smoke:mutations` | Test de fumée mutations géographiques (46 contrôles) |
| `npm run smoke:health` | Test de fumée e-santé connectée (59 contrôles) |
| `npm run smoke:all` | Socle + alertes + interventions + abonnements + mutations + e-santé (328 contrôles) |
| `npm run mqtt:broker` | Broker MQTT embarqué (aedes) pour le développement |
| `npm run seed` | Jeu de données initial (idempotent) |
| `npm run db:pg:start` / `db:pg:stop` | PostgreSQL embarqué de développement |
| `npm run db:info` | État des tables et volumétrie |
| `npm run migration:generate` / `migration:run` | Migrations TypeORM |

---

## Fonctionnalités livrées

### Multi-tenant et droits

- Hiérarchie `NATIONAL → REGION → AGENCY → STATION`, avec validation des
  rattachements autorisés et chemin matérialisé pour les requêtes de sous-arbre.
- Utilisateurs multi-organisations avec un rôle par appartenance
  (`SUPER_ADMIN`, `PLATFORM_MANAGER`, `REGION_MANAGER`, `AGENCY_MANAGER`,
  `TECHNICIAN`, `OPERATOR`, `STATION_AGENT`, `FIELD_AGENT`, `HEALTH_STAFF`,
  `DAF`, `ACCOUNTANT`, `QUALITY_DIRECTOR`, `CLIENT`, `CLIENT_ADMIN`).
- Cloisonnement automatique des données : un chef d'agence ne voit que son
  sous-arbre (organisations, clients, dispositifs, utilisateurs).

### Authentification

- Connexion par email ou téléphone, JWT d'accès (15 min) + refresh token opaque
  rotatif haché en base, révocation de toutes les sessions en cas de réutilisation.
- Double authentification TOTP avec QR code.
- Verrouillage temporaire après 5 échecs, changement et réinitialisation de mot de passe.

### Comptes clients

- Workflow du cahier des charges : création par le Responsable plateforme
  (ID Zengo unique `ZGO-<AGENCE>-<NNNNNN>`, login client, langue préférée,
  pack tarifaire, boutons SOS) → installation par le technicien → activation.
- Profil client accessible à l'application mobile (`GET /clients/me`).

### Dispositifs SafAlert

- Provisionnement par numéro de série, rattachement unique client ↔ appareil.
- Sous-appareils (porte, PIR, fumée, gaz, eau, sirènes, télécommande) avec
  décodage des bits d'état du heartbeat.
- Armement/désarmement (désarmé / away / stay) relayé au kit via MQTT.
- Passerelle MQTT complète : `auth`, `heartbeat`, `alarm`, `syncSubdevice`,
  `delSubdevice`, `changeArmMode`, `ota`.

### Tarification

- Groupes tarifaires pilotés par la DAF : frais de souscription, abonnement
  mensuel, boutons SOS supplémentaires (5 $/unité, maximum configurable),
  taux de change USD → CDF.
- Recalcul automatique du prix du kit (ex. Standard + 2 boutons = 160 $ ;
  10 boutons = 195 $) et conversion en CDF.

### Conformité et traçabilité

- Journal d'audit automatique de toutes les mutations authentifiées, avec
  masquage des secrets et consultation via `GET /audit-logs`.
- Rate limiting global, `helmet`, CORS restreint, validation en liste blanche.

### Alertes & Zengo Monitoring Center

- **Pipeline d'alertes** alimenté par les capteurs (MQTT), le bouton SOS de
  l'application mobile ou un opérateur ; type d'alerte déduit du sous-appareil
  déclencheur, gravité automatique, regroupement des déclenchements répétitifs.
- **Appel vocal IA multilingue** : le client est appelé dans sa langue et répond
  par touche (1 / 2) ou à la voix ; « ce n'est pas moi » → intervention
  immédiate, « c'est moi » → alerte close et conseil de désarmement.
- **Temporisation de 5 minutes** : sans affectation d'équipe, l'alerte est
  automatiquement diffusée à toutes les stations du point de distribution.
- **Affectation intelligente** : une alerte incendie part vers les pompiers, une
  urgence médicale vers l'hôpital, une intrusion vers la police.
- **Chronologie complète** du dossier d'intervention, indicateurs de délai de
  prise en charge, et **diffusion temps réel** (Socket.IO) aux consoles du ZMC,
  aux stations affectées et à l'application du client.

Détail complet : [`docs/ALERTES-ZMC.md`](docs/ALERTES-ZMC.md).

---

## Structure du projet

```
├── src/
│   ├── common/        # enums, DTO, gardes, filtres, bus applicatifs, utilitaires
│   ├── config/        # configuration typée et validée
│   ├── database/      # entités TypeORM, seeds
│   └── modules/       # auth, users, organizations, clients, devices, tariffs,
│                      # alerts, telephony, realtime, iot, interventions,
│                      # subscriptions, mutations, healthcare, audit, health
├── web/               # console web React + Vite (opérateurs, supervision, gestion)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ALERTES-ZMC.md
│   ├── INTERVENTIONS.md
│   ├── SMS.md
│   ├── RISQUES.md
│   ├── ABONNEMENTS.md
│   ├── MUTATIONS.md
│   ├── ESANTE.md
│   ├── MQTT-SAFALERT.md
│   └── ROADMAP.md
├── scripts/           # PostgreSQL embarqué, broker MQTT, tests de fumée, info base
└── docker-compose.yml
```

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, modèle de données, sécurité, conventions.
- [`docs/ALERTES-ZMC.md`](docs/ALERTES-ZMC.md) — pipeline d'alertes, appel vocal IA, escalade, temps réel.
- [`docs/MQTT-SAFALERT.md`](docs/MQTT-SAFALERT.md) — protocole du kit et intégration.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — itérations livrées et à venir (e-santé connectée,
  applications mobile et embarquée, industrialisation).
- [`docs/INTERVENTIONS.md`](docs/INTERVENTIONS.md) — équipes terrain, affectation, suivi GPS.
- [`docs/ABONNEMENTS.md`](docs/ABONNEMENTS.md) — codes d'abonnement, Mobile Money, caisse.
- [`docs/MUTATIONS.md`](docs/MUTATIONS.md) — mutations géographiques, double validation, suivi d'intégration.
- [`docs/ESANTE.md`](docs/ESANTE.md) — mesures de santé, consentement et traçabilité, demandes de soin.

---

## Sécurité en production

Avant toute mise en production :

1. Générer des secrets forts (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` ≥ 32 caractères).
2. Passer `DB_SYNCHRONIZE=false` et utiliser les migrations TypeORM.
3. Restreindre `CORS_ORIGINS` aux domaines réels.
4. Activer l'authentification du broker MQTT et servir les API en HTTPS.
5. Remplacer tous les mots de passe issus du seed et activer la 2FA sur les comptes
   à privilèges élevés.
6. Configurer la téléphonie réelle : `TELEPHONY_PROVIDER=TWILIO` avec
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` et
   `TELEPHONY_PUBLIC_BASE_URL` (URL publique joignant l'API). Le démarrage est
   refusé si `STUB` est utilisé en production, ou si la configuration Twilio est
   incomplète.

## Variables d'environnement clés

| Variable | Défaut | Rôle |
|---|---|---|
| `ALERT_ESCALATION_SECONDS` | `300` | Temporisation avant escalade à toutes les équipes du PDC |
| `ALERT_WATCHDOG_INTERVAL_SECONDS` | `30` | Fréquence du watchdog d'escalade et d'appel |
| `ALERT_GROUPING_WINDOW_SECONDS` | `120` | Fenêtre de regroupement des déclenchements répétitifs |
| `ALERT_AUTO_VOICE_CALL` | `true` | Appel vocal IA automatique sur alerte capteur |
| `TELEPHONY_PROVIDER` | `STUB` | `STUB` (développement) ou `TWILIO` (production) |
| `TELEPHONY_PUBLIC_BASE_URL` | `http://localhost:3000/api/v1` | Base publique pour TwiML et webhooks |
| `VOICE_CALL_TIMEOUT_SECONDS` | `45` | Délai avant de considérer l'appel sans réponse |
| `DEVICE_OFFLINE_AFTER_SECONDS` | `300` | Délai de heartbeat avant passage hors ligne |

Liste complète et commentée : `.env.example`.
