# Feuille de route — Zengo Account

Le socle livré couvre les **itérations 1 et 2**. Les itérations suivantes reprennent
point par point le cahier des charges `ZENGO_ACCOUNT_plateforme...pdf`.

## Itération 1 — Socle multi-tenant ✅ (livrée)

- [x] Hiérarchie National → Région → Agence → Station
- [x] Utilisateurs, rôles, appartenances multiples, calcul de périmètre
- [x] Authentification JWT + refresh rotatif + 2FA TOTP + verrouillage de compte
- [x] Création de compte client (ID Zengo unique, login, langue, pack, boutons SOS)
- [x] Rattachement et activation du dispositif (workflow d'installation)
- [x] Dispositifs SafAlert, sous-appareils, armement/désarmement
- [x] Passerelle MQTT (auth, heartbeat, sync/del subdevice, OTA, alarme)
- [x] Groupes tarifaires, taux USD→CDF, prix des boutons SOS
- [x] Journal d'audit automatique et consultation
- [x] Seeds, tests unitaires, test de fumée bout en bout, documentation

## Itération 2 — Alertes & Zengo Monitoring Center (ZMC) ✅ (livrée)

- [x] Entité `Alert` (type, gravité, statut, origine capteur/bouton/app/opérateur)
- [x] Injection automatique des alarmes MQTT dans le pipeline d'alertes
- [x] Déduction du type d'alerte depuis le sous-appareil déclencheur
- [x] Regroupement des déclenchements répétitifs (anti-inondation)
- [x] Chronologie du dossier (`alert_events`) et journal d'audit
- [x] Temporisation 5 min (watchdog) avant escalade à toutes les équipes du PDC
- [x] Affectation automatique par famille de station (incendie / médical / intrusion)
- [x] Accusé de réception par station (`PENDING` → `ACKNOWLEDGED` → `ARRIVED` → `COMPLETED`)
- [x] Module d'appel vocal IA multilingue (Twilio / STUB) : « Êtes-vous à l'origine
      de cette action ? » → ASR ou DTMF 1/2
- [x] Scripts en français, anglais, swahili, lingala, chiluba, kikongo
- [x] Historique des appels (statut, touche, intention, transcription, enregistrement)
- [x] Escalade immédiate lorsque le client confirme l'intrusion
- [x] Console opérateur : file d'alertes, prise en charge, affectation, clôture, indicateurs
- [x] Diffusion temps réel (Socket.IO) avec authentification et salles par organisation
- [x] Supervision de présence des dispositifs (passage hors ligne automatique)

Détail : [`ALERTES-ZMC.md`](./ALERTES-ZMC.md).

Reste à traiter dans l'itération 3 (ou en fin d'itération 2) :
- [x] Application web « console ZMC » (React + Vite) consommant l'API et le canal temps réel
- [x] Notification SMS du client en parallele de l'appel vocal
- [x] Enregistrement audio des appels IA exploite dans l'interface (lecture integree)
- [x] Analyse predictive : regroupement des incidents par zone et zones a risque

Detail SMS : [`SMS.md`](./SMS.md). Detail analyse de risque : [`RISQUES.md`](./RISQUES.md).

## Itération 3 — Interventions terrain ✅ (livrée)

- [x] Entités `FieldTeam`, `Intervention`, `InterventionReport`, `TeamPosition`
- [x] Affectation manuelle et automatique de l'équipe la plus proche (haversine + spécialité)
- [x] Statuts de mission : assignée / en route / sur place / terminée / abandonnée
- [x] Rapport de fin d'intervention (conclusion, photos, dégâts, signature)
- [x] Clôture automatique de l'alerte selon la conclusion du rapport
- [x] Suivi GPS : remontée de position, trace du trajet, distance et ETA restantes
- [x] Watchdog de pilotage (départ non confirmé, trajet anormalement long, équipe silencieuse)
- [x] Diffusion temps réel des missions (`intervention.*`, `team.*`)
- [x] Indicateurs : délai moyen d'arrivée, durée moyenne, taux de réalisation
- [x] Console web : écran « Missions » (file d'attente, affectation, carte de suivi, rapport)

Détail : [`INTERVENTIONS.md`](./INTERVENTIONS.md).

## Itération 4 — Abonnements & paiements ✅ (livrée)

- [x] Codes d'abonnement uniques liés au numéro du client (30/90/180 jours)
- [x] Envoi du code par SMS à chaque paiement
- [x] Expiration automatique et restriction d'accès
- [x] Activation du code depuis l'application et/ou l'écran central
- [x] Webhooks des opérateurs Mobile Money (M-Pesa, Airtel Money, Orange Money, Illicocash)
- [x] Caisse virtuelle et rapprochement (journal des encaissements, paiements à rattacher)
- [x] Indicateurs de caisse (encaissé USD/CDF, clients actifs, échéances proches)
- [ ] Tableau de bord finance dédié (par agence, par caissier, par mois)

Détail : [`ABONNEMENTS.md`](./ABONNEMENTS.md).

## Itération 5 — Mutation géographique

- [ ] Entité `ClientMutation` avec double validation (agent + Directeur contrôle qualité)
- [ ] Transfert du dossier complet vers le portefeuille de l'agence de destination
- [ ] Redirection des alertes vers les centres de secours de la nouvelle région
- [ ] Historique des mutations, retour à l'agence d'origine, rapport automatique
- [ ] Notification client (SMS/app) et notification interne inter-services
- [ ] Rapport d'intégration à 7 et 30 jours

## Itération 6 — e-Santé connectée

- [ ] Remontée des mesures (tensiomètre, oxymètre, CGM) dans le dossier client
- [ ] Partage des données avec le personnel de santé (`HEALTH_STAFF`)
- [ ] Messagerie / appel infirmier, stations d'alerte médicale
- [ ] Consentement et traçabilité d'accès aux données de santé

## Itération 7 — Applications et industrialisation

- [x] Application web admin / ZMC (React + Vite + TypeScript)
- [ ] Application mobile client et agents (React Native + Expo) avec suivi GPS
- [ ] Guidage vocal des agents (TTS/STT) et assistant IA embarqué
- [ ] Multi-langue de l'interface (FR, EN, SW, LN, LU, KG)
- [ ] Analyse prédictive communautaire (zones à risque) et notifications de prévention  _(l'analyse par zone est livree, voir [`RISQUES.md`](./RISQUES.md) ; restent les notifications de prevention)_- [ ] Système embarqué véhicule d'intervention (GPS, TTS/STT, 4G/5G)
- [ ] Migrations TypeORM versionnées, CI/CD, observabilité (logs, métriques, traces)
- [ ] Authentification MQTT par certificat/broker managé et rotation des secrets
