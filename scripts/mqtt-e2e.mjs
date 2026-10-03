#!/usr/bin/env node
/**
 * Test de bout en bout de la chaine IoT SafAlert :
 *   kit (client MQTT) -> broker -> passerelle Zengo -> alerte dans le ZMC.
 *
 * Le script embarque un broker MQTT local (aedes) et joue le role d'une
 * centrale SafAlert. Il faut lancer l'API avec la passerelle active :
 *
 *   MQTT_ENABLED=true MQTT_URL=mqtt://127.0.0.1:1884 npm run start:prod
 *   node scripts/mqtt-e2e.mjs
 */
import { createServer } from 'node:net';
import Aedes from 'aedes';
import mqtt from 'mqtt';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const BROKER_PORT = Number(process.argv[3] ?? 1884);
const PREFIX = 'sg';
const SERIAL = '3003004fba2394'; // dispositif de demonstration rattache a un client
const TOPIC = (platform, action) => `${PREFIX}/${SERIAL}/${platform}/${action}`;

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` -> ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
};

const login = async (credentials) => {
  const response = await api('POST', '/auth/login', { body: credentials });
  if (response.status !== 200) {
    throw new Error(
      `Connexion impossible pour ${credentials.identifier} (${response.status} ${JSON.stringify(response.data).slice(0, 120)})`,
    );
  }
  return response.data?.accessToken;
};

/** Attend un message sur un topic donne (avec delai maximal). */
const waitForMessage = (client, predicate, timeoutMs = 6_000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.off('message', handler);
      resolve(null);
    }, timeoutMs);

    const handler = (topic, payload) => {
      const text = payload.toString();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      const result = predicate(topic, parsed);
      if (result) {
        clearTimeout(timer);
        client.off('message', handler);
        resolve({ topic, payload: parsed });
      }
    };

    client.on('message', handler);
  });

const waitForApi = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return true;
    } catch {
      /* pas encore prete */
    }
    await sleep(1_000);
  }
  return false;
};

/** Nombre d'alertes (toutes periodes) rattachees a un dispositif. */
const countDeviceAlerts = async (token, deviceId) => {
  const response = await api('GET', `/alerts?deviceId=${deviceId}&limit=100`, { token });
  return response.data?.total ?? 0;
};

async function main() {
  const brokerOnly = process.argv.includes('--broker-only');
  console.log(`\nTest de bout en bout IoT SafAlert -> broker :${BROKER_PORT} / API ${BASE}\n`);

  // Le broker est cree s'il n'y en a pas deja un sur le port : cela permet de
  // demarrer le broker d'abord (`--broker-only`) puis l'API, ou l'inverse.
  let ownedBroker = null;
  let ownedServer = null;
  try {
    ownedBroker = new Aedes();
    ownedServer = createServer(ownedBroker.handle);
    await new Promise((resolve, reject) => {
      ownedServer.once('error', reject);
      ownedServer.listen(BROKER_PORT, resolve);
    });
    console.log(`  (broker MQTT embarque a l ecoute sur 127.0.0.1:${BROKER_PORT})`);
  } catch {
    ownedBroker = null;
    ownedServer = null;
    console.log(`  (broker existant reutilise sur 127.0.0.1:${BROKER_PORT})`);
  }

  if (brokerOnly) {
    console.log('  Mode broker seul : Ctrl+C pour arreter.');
    setInterval(() => {}, 1 << 30);
    return;
  }

  const device = mqtt.connect(`mqtt://127.0.0.1:${BROKER_PORT}`, { clientId: `kit-${SERIAL}` });
  await new Promise((resolve, reject) => {
    device.once('connect', resolve);
    device.once('error', reject);
  });
  device.subscribe(`${PREFIX}/${SERIAL}/server/#`);

  try {
    if (!(await waitForApi())) {
      console.error("L'API ne repond pas (lancez-la avec MQTT_ENABLED=true).");
      process.exit(1);
    }

    const operatorToken = await login({ identifier: 'operateur.zmc@zengo.cd', password: 'Zengo@2026' });
    const adminToken = await login({ identifier: 'admin@zengo.cd', password: 'Zengo@2026' });

    // -------------------------------------------------------------------------
    console.log('\n1. Authentification du dispositif (device/auth -> server/auth)');
    // -------------------------------------------------------------------------
    let authResponse = null;
    for (let attempt = 1; attempt <= 6 && !authResponse; attempt += 1) {
      device.publish(
        TOPIC('device', 'auth'),
        JSON.stringify({ sign: 'ec38cb30f28cf6ca1ebaf6c8790042da14a27dcb' }),
      );
      authResponse = await waitForMessage(
        device,
        (topic, payload) =>
          topic === TOPIC('server', 'auth') && payload && typeof payload.token === 'string' && payload.token.length > 0,
        6_000,
      );
      if (!authResponse) console.log(`  (en attente de la passerelle Zengo, tentative ${attempt}/6)`);
    }

    check('Reponse du serveur au topic server/auth', authResponse !== null);
    check('Token emis', authResponse?.payload?.token?.length > 20, `${authResponse?.payload?.token?.slice(0, 8)}...`);
    check(
      'Calage horaire fourni (YYYYmmddHHiiss)',
      /^\d{14}$/.test(authResponse?.payload?.time_string ?? ''),
      authResponse?.payload?.time_string,
    );

    const token = authResponse?.payload?.token;
    if (!token) throw new Error("Sans token, le reste du scenario ne peut pas s'executer.");

    // -------------------------------------------------------------------------
    console.log('\n2. Heartbeat et etat des sous-appareils');
    // -------------------------------------------------------------------------
    const devicesBefore = await api('GET', `/devices?search=${SERIAL}`, { token: adminToken });
    const deviceId = devicesBefore.data.items[0]?.id;
    const subDevicesBefore = await api('GET', `/devices/${deviceId}/sub-devices`, { token: adminToken });
    const portSubDevice = subDevicesBefore.data.find((item) => item.code === 'DC');
    check('Dispositif et sous-appareils presents en base', Boolean(deviceId) && Boolean(portSubDevice));

    // Porte ouverte (bit 7) sur le contact de porte.
    device.publish(
      TOPIC('device', 'heartbeat'),
      JSON.stringify({ token, ver: 1002, list: [{ id: portSubDevice.subId, state: '00000001' }] }),
    );
    await sleep(1_500);

    const subDevicesAfter = await api('GET', `/devices/${deviceId}/sub-devices`, { token: adminToken });
    const updated = subDevicesAfter.data.find((item) => item.subId === portSubDevice.subId);
    check('Etat du contact decode (porte ouverte)', updated?.decodedState?.open === true, `state=${updated?.state}`);

    const deviceAfter = await api('GET', `/devices/${deviceId}`, { token: adminToken });
    check('Version de firmware mise a jour', deviceAfter.data.firmwareVersion === 1002, `${deviceAfter.data.firmwareVersion}`);
    check('Dispositif marque actif', deviceAfter.data.status === 'ACTIVE', deviceAfter.data.status);

    // -------------------------------------------------------------------------
    console.log('\n3. Synchronisation des sous-appareils (server/syncSubdevice)');
    // -------------------------------------------------------------------------
    device.publish(
      TOPIC('device', 'syncSubdevice'),
      JSON.stringify({
        token,
        list: [{ id: '00abc001', name: 'Detecteur e2e', area_name: 'Garage', code: 'PIR' }],
      }),
    );
    await sleep(1_500);

    const withNewSubDevice = await api('GET', `/devices/${deviceId}/sub-devices`, { token: adminToken });
    check(
      'Nouveau sous-appareil enregistre',
      withNewSubDevice.data.some((item) => item.subId === '00abc001' && item.areaName === 'Garage'),
      `${withNewSubDevice.data.length} sous-appareils`,
    );

    // -------------------------------------------------------------------------
    console.log('\n4. Alarme -> creation de l alerte dans le ZMC');
    // -------------------------------------------------------------------------
    // On repart d'une situation propre : toute alerte encore ouverte pour ce
    // sous-appareil est cloturee, afin que le regroupement soit deterministe.
    const openBefore = await api('GET', '/alerts?openOnly=true&limit=100', { token: operatorToken });
    for (const previous of openBefore.data.items) {
      if (previous.deviceId === deviceId && previous.subDeviceCode === 'DC') {
        await api('POST', `/alerts/${previous.id}/resolve`, {
          token: operatorToken,
          body: { resolution: 'MAINTENANCE_TEST', note: 'Nettoyage du test IoT.' },
        });
      }
    }

    const alertsBefore = await api('GET', '/alerts?openOnly=true&limit=100', { token: operatorToken });

    device.publish(
      TOPIC('device', 'alarm'),
      JSON.stringify({
        token,
        id: portSubDevice.subId,
        name: 'door sensor',
        message: 'Ouverture de porte detectee pendant l armement.',
        type: 0,
      }),
    );
    await sleep(3_000);

    const alertsAfter = await api('GET', '/alerts?openOnly=true&limit=100', { token: operatorToken });
    const created =
      alertsAfter.data.items.find(
        (item) => !alertsBefore.data.items.some((before) => before.id === item.id),
      ) ??
      alertsAfter.data.items.find(
        (item) => item.deviceId === deviceId && item.subDeviceCode === 'DC' && !item.dispatchedAt,
      );

    check('Alerte creee depuis le message MQTT', Boolean(created), created?.reference);
    check('Nature deduite du sous-appareil (porte -> intrusion)', created?.type === 'INTRUSION', created?.type);
    check('Origine identifiee comme capteur', created?.source === 'SENSOR', created?.source);
    check('Dispositif rattache a l alerte', created?.deviceId === deviceId);
    check('Client identifie via le dispositif', Boolean(created?.clientId), created?.client?.zengoId ?? '');
    check(
      'Sous-appareil declencheur identifie',
      created?.subDeviceCode === 'DC',
      `${created?.subDeviceCode} / ${created?.subDevice?.name ?? ''}`,
    );

    const voiceCalls = created ? await api('GET', `/alerts/${created.id}/voice-calls`, { token: operatorToken }) : null;
    check(
      'Appel vocal IA declenche pour l alerte capteur',
      (voiceCalls?.data ?? []).length === 1,
      `${voiceCalls?.data?.length ?? 0} appel(s)`,
    );

    // Anti-flood : un second declenchement rapproche doit etre regroupe.
    device.publish(
      TOPIC('device', 'alarm'),
      JSON.stringify({ token, id: portSubDevice.subId, name: 'door sensor', message: 'Nouvelle ouverture.', type: 0 }),
    );
    await sleep(2_500);

    const afterSecondAlarm = await api('GET', `/alerts/${created.id}`, { token: operatorToken });
    check(
      'Declenchements rapproches regroupes sur une seule alerte',
      afterSecondAlarm.data?.occurrenceCount === 2,
      `occurrences=${afterSecondAlarm.data?.occurrenceCount}`,
    );

    // -------------------------------------------------------------------------
    console.log('\n5. Suppression d un sous-appareil (server/delSubdevice)');
    // -------------------------------------------------------------------------
    device.publish(TOPIC('device', 'delSubdevice'), JSON.stringify({ token, ids: ['00abc001'] }));
    await sleep(1_500);

    const afterDelete = await api('GET', `/devices/${deviceId}/sub-devices`, { token: adminToken });
    check(
      'Sous-appareil supprime',
      !afterDelete.data.some((item) => item.subId === '00abc001'),
      `${afterDelete.data.length} restant(s)`,
    );

    // -------------------------------------------------------------------------
    console.log('\n6. Securite : un token invalide est rejete');
    // -------------------------------------------------------------------------
    const alertsBeforeBadToken = await countDeviceAlerts(operatorToken, deviceId);
    device.publish(
      TOPIC('device', 'alarm'),
      JSON.stringify({ token: 'token-falsifie', id: portSubDevice.subId, message: 'Tentative avec token invalide.' }),
    );
    await sleep(2_500);

    const alertsAfterBadToken = await countDeviceAlerts(operatorToken, deviceId);
    check(
      'Aucune alerte creee avec un token invalide',
      alertsAfterBadToken === alertsBeforeBadToken,
      `${alertsAfterBadToken} alerte(s) pour ce dispositif`,
    );

    // -------------------------------------------------------------------------
    console.log('\n7. Journal d audit');
    // -------------------------------------------------------------------------
    const auditLogs = await api('GET', '/audit-logs?limit=100', { token: adminToken });
    check('Journal d audit accessible', auditLogs.status === 200 && auditLogs.data.total > 0);
  } finally {
    device.end(true);
    if (ownedBroker && ownedServer) {
      await new Promise((resolve) => ownedBroker.close(resolve));
      ownedServer.close();
    }
  }

  console.log(`\n============================================================`);
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test de bout en bout IoT interrompu :', error);
  process.exit(1);
});
