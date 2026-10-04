# Déclencher et simuler une intrusion

Ce document explique **comment provoquer vous-même une intrusion** dans la
plateforme, ce que le système fait automatiquement, et comment lire le résultat.
Il sert de guide de démonstration devant un client.

---

## 1. La façon la plus simple : le banc d'essai de la console

Plus besoin de terminal : la console contient un écran **Banc d'essai**
(`/simulation`) qui joue le rôle du kit installé chez un client.

1. Se connecter avec `operateur.zmc@zengo.cd` / `Zengo@2026`.
2. Menu **Banc d'essai** (section Supervision).
3. Choisir le kit dans la liste déroulante (le kit de démonstration est
   rattaché au client `ZGO-LUBAG01-000001`).
4. **Kit en ligne (heartbeat)** : la centrale remonte, l'état des capteurs
   s'affiche (normal, ouvert, sabotage, batterie faible).
5. **Armer (absence)** : le kit annonce son mode d'armement.
6. **Déclencher un capteur** : porte, mouvement, fumée, gaz, eau ou bouton
   d'alerte — un clic suffit.
7. Le dossier apparaît en dessous : référence, nature, gravité, appel de
   vérification, chronologie.
8. **Répondre à l'appel** : « Touche 1 — ce n'est pas moi » (escalade
   immédiate), « Touche 2 — c'est moi » (fausse alerte) ou « Ne pas répondre ».

L'alerte créée apparaît en parallèle dans l'écran **Alertes** : l'opérateur
peut la prendre en charge, engager une station et la clôturer, comme pour un
déclenchement réel.

Rien n'est simulé côté serveur : l'écran appelle les mêmes fonctions que la
passerelle MQTT (`ingestDeviceAlarm`), donc le type d'alerte, la source
`SENSOR`, l'appel vocal, l'escalade et la chronologie sont ceux d'un vrai
matériel. Le module est réservé aux postes de supervision et se désactive
automatiquement en production (`SIMULATION_ENABLED`, `NODE_ENV=production`).

---

## 2. Les commandes, pour les tests et l'automatisation

| Commande | Ce qu'elle fait | Durée |
|---|---|---|
| `npm run demo:alarme` | Déclenche **une** intrusion et affiche le dossier (alerte, appel, escalade, chronologie). | ~10 s |
| `npm run demo:intrusion` | Parcours **complet commenté** en 9 étapes, dont le faux positif. | ~40 s |

Variantes de `demo:alarme` :

```bash
npm run demo:alarme -- --dtmf 1        # le client répond « ce n'est pas moi » -> escalade immédiate
npm run demo:alarme -- --dtmf 2        # le client répond « c'est moi »         -> faux positif
npm run demo:alarme -- --capteur PIR   # déclenche le détecteur de salon au lieu de la porte
npm run demo:alarme -- --capteur WSD   # déclenche le détecteur de fumée (alerte INCENDIE)
npm run demo:alarme -- --api           # sans MQTT : l'alerte est créée par l'API
```

---

## 3. Prérequis (une seule fois par session)

Trois terminaux, dans l'ordre :

```bash
# Terminal 1 — le broker MQTT local (les kits s'y connectent)
npm run mqtt:broker

# Terminal 2 — l'API (le fichier .env active déjà MQTT_ENABLED=true)
npm run start:prod

# Terminal 3 — la console web (facultatif mais recommandé pour la démo)
cd web && npm run dev
```

Vérifications rapides :

```bash
curl http://127.0.0.1:3000/api/v1/health          # -> {"status":"ok",...}
grep MqttService /tmp/api.log                      # -> Connecte au broker MQTT : mqtt://127.0.0.1:1884
```

> La passerelle MQTT de l'API est **auto-réparatrice** : si le broker redémarre,
> elle se reconnecte seule (au plus tard sous 20 s). Il est donc inutile de
> relancer l'API après un redémarrage du broker.

Si vous voyez `Passerelle MQTT desactivee` dans les journaux, c'est que
`MQTT_ENABLED=false` : corrigez `.env` puis relancez l'API.

---

## 3. Ce que fait la commande, étape par étape

```
1. Le script joue le rôle du kit SafAlert installé chez le client
   - il s'authentifie    : device/auth       -> reçoit un jeton
   - il signale son état : device/heartbeat  -> état des capteurs (masque binaire)
   - il déclenche        : device/alarm      -> ouverture de porte pendant l'armement

2. Le serveur, en réaction automatique
   - crée l'alerte (nature INTRUSION, déduite du type de capteur)
   - déclenche l'appel vocal IA de vérification vers le client
   - envoie le SMS de notification
   - arme le minuteur d'escalade (ALERT_ESCALATION_SECONDS, 300 s par défaut)

3. Le client répond à l'appel
   - touche 1 « ce n'est pas moi » : alerte CRITIQUE + escalade IMMÉDIATE
                                    à toutes les stations compétentes du PDC
   - touche 2 « c'est moi »        : alerte classée FAUX POSITIF (CLIENT_CONFIRMED),
                                    aucune équipe n'est engagée
   - pas de réponse                : le minuteur déclenche l'escalade

4. L'opérateur, depuis la console web
   - prend en charge, engage une station, suit la mission, clôture avec un compte rendu
```

---

## 4. Exemple de résultat réel

```
==== DECLENCHEMENT D UNE INTRUSION ====
   [OK] Message alarm publie sur le broker (comme le ferait le kit).
   [OK] Alerte AL-20261004-0006 — INTRUSION / HIGH / NEW
   Client : ZGO-LUBAG01-000001 — Client Demonstration
   [OK] Appel vers +243970000099 en « fr » (statut QUEUED)
   [OK] Le client appuie sur la touche 1 (HTTP 200)

3. ETAT DU DOSSIER
   gravite        : CRITICAL
   statut         : ASSIGNED
   escalade       : niveau 1 a 15:23:01
   affectations   : 3
      - Station Intrusion Lubumbashi (escalade) — NOTIFIED
      - Station Incendie Lubumbashi (escalade) — NOTIFIED
      - Station Medicale Lubumbashi (escalade) — NOTIFIED

4. CHRONOLOGIE
   15:22:59  CREATED               Declenchement detecte pendant l armement.
   15:23:01  VOICE_CALL_STARTED    Appel vocal IA declenche en fr vers +243970000099 (STUB).
   15:23:01  VOICE_CALL_COMPLETED  Le client a confirme ne pas etre a l'origine du declenchement.
   15:23:01  ESCALATED             Escalade automatique : Declenchement confirme par le client.
   15:23:01  SMS_SENT              SMS ALERT_RAISED envoye en fr vers +243970000099.
```

Chaque ligne de la chronologie est horodatée et conservée : c'est la traçabilité
exigée en cas de litige.

---

## 5. Régler la vitesse pour une démonstration

Dans `.env` :

```bash
ALERT_ESCALATION_SECONDS=30        # temporisation du minuteur (au lieu de 300)
ALERT_WATCHDOG_INTERVAL_SECONDS=10 # fréquence de contrôle du minuteur
ALERT_GROUPING_WINDOW_SECONDS=120  # anti-répétition : 2 min sans nouvelle alerte
ALERT_AUTO_VOICE_CALL=true         # appel de vérification automatique
```

Puis, pour montrer l'escalade automatique **sans réponse du client** :

```bash
npm run demo:intrusion -- --watchdog 60 --sans-appel
```

---

## 6. Questions fréquentes

**Le script dit « MQTT inactif » et crée l'alerte par l'API ?**
L'API tourne sans passerelle MQTT. Vérifiez `MQTT_ENABLED=true` dans `.env`,
lancez `npm run mqtt:broker`, puis relancez l'API. Le déclenchement fonctionne
quand même (chemin API), mais sans le parcours matériel. Le banc d'essai de la
console, lui, ne dépend pas du broker.

**Le banc d'essai affiche « indisponible » ?**
Le module est désactivé : `SIMULATION_ENABLED=true` dans `.env`, puis relancez
l'API. Il est aussi refusé aux comptes clients (403).

**Aucune nouvelle alerte n'apparaît ?**
Le déclenchement a probablement été **regroupé** avec le précédent : un même
capteur qui répète en moins de 2 minutes (`ALERT_GROUPING_WINDOW_SECONDS`)
incrémente le compteur d'occurrences au lieu de créer une seconde alerte.
Changez de capteur (`--capteur PIR`) ou attendez.

**Les appels et SMS sont-ils réels ?**
Non : en développement, le fournisseur téléphonique est simulé (`STUB`). Les
transitions d'état sont identiques, seule la liaison opérateur est remplacée.

**Le dossier de démonstration encombre la file d'alertes ?**
`npm run db:clean -- --alerts` purge les alertes (et tout leur dossier), ou
`npm run db:clean` pour purger en plus les comptes et dossiers clients de test.

**Comment vérifier que tous les comptes voient ce qu'ils doivent voir ?**
`npm run check:accounts` connecte les 13 comptes de référence et contrôle leurs
permissions (tarifs, caisse, périmètre du chef de zone, journal d'audit...).
