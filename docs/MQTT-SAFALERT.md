# Protocole MQTT SafAlert — intégration Zengo

Source : `Safety_GuardMQTTDOCUMENT.pdf`.

## 1. Format des topics

```
{prefix}/{SN}/{platform}/{action}
```

| Variable | Description | Valeur Zengo |
|---|---|---|
| `prefix` | Préfixe de topic | `MQTT_TOPIC_PREFIX` (défaut `sg`) |
| `SN` | Numéro de série unique de la centrale | `devices.serial_number` |
| `platform` | Émetteur | `device` (kit → serveur) ou `server` (serveur → kit) |
| `action` | Action du protocole | voir ci-dessous |

Exemple : `sg/3003004fba2394/device/alarm`

## 2. Sous-appareils (Subdevice Code Map)

| Catégorie | Code | Constante |
|---|---|---|
| Door Sensor | `DC` | `SubDeviceCode.DC` |
| PIR | `PIR` | `SubDeviceCode.PIR` |
| Détecteur de fumée sans fil | `WSD` | `SubDeviceCode.WSD` |
| Détecteur de fuite de gaz | `GLS` | `SubDeviceCode.GLS` |
| Alarme extérieure sans fil | `WOS` | `SubDeviceCode.WOS` |
| Alarme intérieure sans fil | `WIS` | `SubDeviceCode.WIS` |
| Détecteur de fuite d'eau | `WLS` | `SubDeviceCode.WLS` |
| Télécommande | `CON` | `SubDeviceCode.CON` |

## 3. Champ `state` (heartbeat)

Chaîne de 8 caractères ; un bit à `1` signale l'anomalie.

| Bit | Signification | Constante |
|---|---|---|
| 0 | Sous-appareil hors ligne | `SubDeviceStateBit.OFFLINE` |
| 5 | Sabotage (tamper) | `SubDeviceStateBit.TAMPER` |
| 6 | Batterie faible | `SubDeviceStateBit.LOW_BATTERY` |
| 7 | Contact ouvert (porte) | `SubDeviceStateBit.OPEN` |

`00000000` = tout est nominal. Décodage : `decodeSubDeviceState()`.

## 4. Séquence d'authentification

1. **Kit → serveur** : `sg/{SN}/device/auth` avec `{ "sign": "<sn chiffré>" }`.
2. **Serveur → kit** : `sg/{SN}/server/auth` avec `{ "token": "...", "time_string": "YYYYmmddHHiiss" }`.
   Le token est mémorisé côté kit et envoyé dans tous les messages suivants.
3. Si le dispositif est désactivé, le serveur renvoie un `token` vide.

Implémentation : `MqttService.handleAuth()` → `DevicesService.storeNewToken()`.
Le token n'est jamais stocké en clair : seule son empreinte SHA-256 est conservée
(`devices.token_hash`).

## 5. Actions traitées

| Topic (device → serveur) | Traitement Zengo |
|---|---|
| `device/auth` | Émission d'un nouveau token + calage horaire |
| `device/heartbeat` | Mise à jour `last_seen_at`, `firmware_version` et états des sous-appareils |
| `device/alarm` | **Création d'une alerte** (type déduit du sous-appareil), diffusion temps réel au ZMC, appel vocal IA et démarrage de la temporisation de 5 min — voir [`ALERTES-ZMC.md`](./ALERTES-ZMC.md) |
| `device/syncSubdevice` | Upsert des sous-appareils (`sub_devices`) |
| `device/delSubdevice` | Suppression des sous-appareils (`ffffffff` = tous) |
| `device/changeArmMode` | Mise à jour du mode d'armement |
| `device/ota` | Journalisation de la demande de mise à jour |

| Topic (serveur → device) | Déclencheur Zengo |
|---|---|
| `server/changeArmMode` | `POST /devices/:id/arm-mode` (0 = désarmé, 1 = away, 2 = stay) |
| `server/alarm` | Déclenchement manuel d'une alarme (itération suivante) |
| `server/auth` | Réponse au message `auth` |
| `server/syncSubdevice` | Déclaration des sous-appareils depuis le back-office |
| `server/ota` | Publication d'une mise à jour de firmware (itération suivante) |

## 6. Activation locale

```bash
# Broker de test embarque (aucun Docker requis)
npm run mqtt:broker

# .env
MQTT_ENABLED=true
MQTT_URL=mqtt://127.0.0.1:1884
MQTT_TOPIC_PREFIX=sg
```

Verification automatique de toute la chaine (auth, heartbeat, sync, alarme ->
alerte, suppression, securite) :

```bash
MQTT_ENABLED=true MQTT_URL=mqtt://127.0.0.1:1884 npm run start:prod
npm run smoke:iot
```

Simuler un kit a la main avec `mosquitto_pub` :

```bash
# Authentification
mosquitto_pub -t 'sg/SMOKE123/device/auth' -m '{"sign":"abc123"}'

# Heartbeat (token renvoyé par le serveur)
mosquitto_pub -t 'sg/SMOKE123/device/heartbeat' \
  -m '{"token":"<token>","ver":1001,"list":[{"id":"00000040","state":"00000001"}]}'
```

## 7. Points de vigilance

- **Ordre des états** : la documentation fournie comporte des ambiguïtés de topics
  (le payload `alarm` est décrit sous le topic `delSubdevice`). L'implémentation suit
  le nom de l'action, pas l'ordre du document.
- **`syncSubdevice`** est émis par la centrale *et* peut être déclenché par le serveur :
  les deux sens sont supportés.
- **OTA** : les URL de firmware doivent être servies en HTTP (non HTTPS) — prévoir une
  URL signée à durée limitée.
- **Tokens** : rotation à chaque `auth` ; le dispositif désactivé reçoit un token vide,
  ce qui invalide immédiatement ses messages suivants.
