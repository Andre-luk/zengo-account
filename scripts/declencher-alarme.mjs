#!/usr/bin/env node
/**
 * DECLENCHER UNE INTRUSION — commande unique, pour la demonstration.
 *
 * Trois usages :
 *   npm run demo:alarme              -> declenche une intrusion sur la porte
 *   npm run demo:alarme -- --dtmf 1  -> ... et le client repond « ce n'est pas moi »
 *                                       (alerte CRITIQUE + escalade immediate)
 *   npm run demo:alarme -- --dtmf 2  -> ... et le client repond « c'est moi »
 *                                       (faux positif : rien n'est envoye aux secours)
 *
 * Options :
 *   --capteur DC|PIR|WSD   capteur declencheur (defaut DC = porte principale)
 *   --api                  forcer le chemin API (sans MQTT)
 *
 * Deux chemins possibles :
 *   MQTT actif  -> le script joue le role du kit et publie un vrai message alarm
 *   MQTT inactif-> le script cree l'alerte via l'API (POST /alerts, source MANUAL)
 * Dans les deux cas, toute la chaine s'execute : alerte, appel vocal IA, escalade.
 */
import { createServer } from 'node:net';
import Aedes from 'aedes';
import mqtt from 'mqtt';

const BASE = (process.env.SIM_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const BROKER_PORT = Number(process.env.SIM_BROKER_PORT ?? 1884);
const SERIAL = '3003004fba2394';
const TOPIC = (platform, action) => `sg/${SERIAL}/${platform}/${action}`;
const CLIENT_ZENGO_ID = 'ZGO-LUBAG01-000001';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith('--') ? next : fallback;
};
const sensorCode = String(option('--capteur', 'DC')).toUpperCase();
const dtmf = option('--dtmf');
const forceApi = args.includes('--api');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const title = (text) => {
  console.log('');
  console.log('='.repeat(70));
  console.log(text);
  console.log('='.repeat(70));
};
const info = (text = '') => console.log(`   ${text}`);
const good = (text) => console.log(`   [OK] ${text}`);

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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
};

const login = async (identifier, password) => {
  const { status, data } = await api('POST', '/auth/login', { body: { identifier, password } });
  if (status !== 200) throw new Error(`Connexion impossible pour ${identifier} (${status}).`);
  return data.accessToken;
};

const waitFor = async (probe, { attempts = 30, delayMs = 500 } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await probe();
    if (value) return value;
    await sleep(delayMs);
  }
  return null;
};

const fmt = (value) => (value ? new Date(value).toLocaleTimeString('fr-FR') : '—');

/** Detecte si la passerelle MQTT de l'API repond (handshake device/auth). */
async function tryMqttGateway() {
  let broker = null;
  let server = null;
  let kit = null;
  try {
    kit = mqtt.connect(`mqtt://127.0.0.1:${BROKER_PORT}`, { clientId: `trigger-${Date.now()}` });
    await new Promise((resolve, reject) => {
      kit.once('connect', resolve);
      kit.once('error', reject);
    });
    if (!forceApi) info('Un broker MQTT ecoute deja sur le port.');
    else return { token: null, kit: null, broker: null, server: null };
  } catch {
    // Aucun broker : on en demarre un, comme le ferait un vrai kit installe.
    try {
      broker = new Aedes();
      server = createServer(broker.handle);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(BROKER_PORT, resolve);
      });
      kit = mqtt.connect(`mqtt://127.0.0.1:${BROKER_PORT}`, { clientId: `trigger-${Date.now()}` });
      await new Promise((resolve) => kit.once('connect', resolve));
      if (!forceApi) info(`Broker MQTT embarque demarre sur 127.0.0.1:${BROKER_PORT}.`);
    } catch {
      return { token: null, kit: null, broker: null, server: null };
    }
  }
  if (forceApi) return { token: null, kit, broker, server };

  let token = null;
  kit.subscribe(TOPIC('server', 'auth'));
  kit.on('message', (topic, payload) => {
    if (topic !== TOPIC('server', 'auth')) return;
    try { token = JSON.parse(payload.toString()).token ?? null; } catch { token = null; }
  });
  // La passerelle se reconnecte toutes les 5 s si le broker vient de demarrer.
  for (let attempt = 0; attempt < 12 && !token; attempt += 1) {
    kit.publish(TOPIC('device', 'auth'), JSON.stringify({ sign: 'ec38cb30f28cf6ca1ebaf6c8790042da14a27dcb' }));
    await sleep(1_000);
  }
  return { token, kit, broker, server };
}

async function main() {
  console.log('\n==== DECLENCHEMENT D UNE INTRUSION ====');
  info(`API : ${BASE} | capteur : ${sensorCode}${dtmf ? ` | reponse client : touche ${dtmf}` : ''}`);

  const operatorToken = await login('operateur.zmc@zengo.cd', 'Zengo@2026');
  const adminToken = await login('admin@zengo.cd', 'Zengo@2026');

  const before = await api('GET', '/alerts?limit=100', { token: operatorToken });
  const known = new Set((before.data?.items ?? []).map((item) => item.id));

  const gateway = await tryMqttGateway();
  const useMqtt = Boolean(gateway.token);

  title(useMqtt ? '1. LE KIT PUBLIE UNE ALARME (chemin MQTT reel)' : "1. L ALERTE EST CREEE PAR L API (MQTT inactif)");

  if (useMqtt) {
    const deviceResponse = await api('GET', `/devices?search=${SERIAL}`, { token: adminToken });
    const device = deviceResponse.data?.items?.[0];
    if (!device) throw new Error(`Dispositif ${SERIAL} introuvable : lancez d abord « npm run seed ».`);
    const subDevices = await api('GET', `/devices/${device.id}/sub-devices`, { token: adminToken });
    const sensor =
      (subDevices.data ?? []).find((item) => item.code === sensorCode) ?? (subDevices.data ?? [])[0];
    info(`Kit ${device.serialNumber} — capteur ${sensor.name} (${sensor.code})`);
    gateway.kit.publish(
      TOPIC('device', 'alarm'),
      JSON.stringify({
        token: gateway.token,
        id: sensor.subId,
        name: sensor.code === 'DC' ? 'door sensor' : sensor.code === 'PIR' ? 'motion sensor' : 'smoke sensor',
        message: 'Declenchement detecte pendant l armement.',
        type: 0,
      }),
    );
    good('Message alarm publie sur le broker (comme le ferait le kit).');
  } else {
    info("La passerelle MQTT de l API ne repond pas : l alerte est creee par l API.");
    info('Pour utiliser le vrai chemin MQTT : MQTT_ENABLED=true et MQTT_URL=mqtt://127.0.0.1:1884');
    info("dans .env, puis « npm run mqtt:broker » avant de lancer l API.");
    const clients = await api('GET', `/clients?search=${CLIENT_ZENGO_ID}&limit=100`, { token: adminToken });
    const client = (clients.data?.items ?? []).find((item) => item.zengoId === CLIENT_ZENGO_ID);
    if (!client) throw new Error(`Client ${CLIENT_ZENGO_ID} introuvable : lancez « npm run seed ».`);
    const created = await api('POST', '/alerts', {
      token: operatorToken,
      body: {
        type: 'INTRUSION',
        clientId: client.id,
        source: 'OPERATOR',
        note: 'Simulation : ouverture de porte pendant l armement.',
      },
    });
    if (created.status >= 300) {
      throw new Error(`Creation impossible (${created.status}) : ${JSON.stringify(created.data).slice(0, 200)}`);
    }
    good('Alerte creee par l API.');
  }

  const alert = await waitFor(async () => {
    const after = await api('GET', '/alerts?limit=100', { token: operatorToken });
    return (after.data?.items ?? []).find((item) => !known.has(item.id)) ?? null;
  });
  if (!alert) throw new Error('Aucune alerte n a ete creee : consultez les journaux de l API.');

  good(`Alerte ${alert.reference} — ${alert.type} / ${alert.severity} / ${alert.status}`);
  info(`Client : ${alert.client?.zengoId ?? '—'} — ${alert.client?.fullName ?? ''}`);
  info(`Adresse : ${alert.address ?? '—'}, ${alert.city ?? ''}`);
  info(`Ouverte a ${fmt(alert.openedAt)}`);

  title("2. L APPEL DE VERIFICATION AU CLIENT");
  const calls = await waitFor(async () => {
    const response = await api('GET', `/alerts/${alert.id}/voice-calls`, { token: operatorToken });
    return (response.data ?? []).length > 0 ? response.data : null;
  });
  if (!calls) {
    info("Aucun appel vocal (ALERT_AUTO_VOICE_CALL=false ?).");
  } else {
    const call = calls[0];
    good(`Appel vers ${call.toNumber} en « ${call.language} » (statut ${call.status})`);
    info('Le client entend : « Bonjour, ici le centre de surveillance Zengo... »');
    info('Touche 1 = ce n est pas moi | Touche 2 = c est moi');
    if (dtmf) {
      const answered = await api('POST', `/voice-calls/${call.id}/simulate/input`, {
        token: operatorToken,
        body: { dtmf: String(dtmf) },
      });
      good(`Le client appuie sur la touche ${dtmf} (HTTP ${answered.status})`);
      await sleep(3_000);
    } else {
      info('');
      info(`Pour repondre a sa place : npm run demo:alarme -- --dtmf 1`);
      info(`ou depuis un autre terminal sur cet appel :`);
      info(`   curl -X POST ${BASE}/voice-calls/${call.id}/simulate/input \\`);
      info(`     -H "Content-Type: application/json" -H "Authorization: Bearer <jeton>" \\`);
      info(`     -d '{"dtmf":"1"}'`);
      await sleep(2_000);
    }
  }

  title('3. ETAT DU DOSSIER');
  const final = await api('GET', `/alerts/${alert.id}`, { token: operatorToken });
  const data = final.data ?? {};
  info(`gravite        : ${data.severity}`);
  info(`statut         : ${data.status}`);
  info(`occurrence     : ${data.occurrenceCount}`);
  info(`escalade       : niveau ${data.escalationLevel} a ${fmt(data.escalatedAt)}`);
  info(`affectations   : ${(data.dispatches ?? []).length}`);
  for (const dispatch of data.dispatches ?? []) {
    info(`   - ${dispatch.station?.name ?? '—'}${dispatch.isEscalation ? ' (escalade)' : ''} — ${dispatch.status}`);
  }
  if (data.resolution) info(`motif de cloture: ${data.resolution} — ${data.resolutionNote ?? ''}`);

  title('4. CHRONOLOGIE (ce que le dossier conserve)');
  const timeline = await api('GET', `/alerts/${alert.id}/timeline`, { token: operatorToken });
  for (const event of timeline.data ?? []) {
    console.log(`   ${fmt(event.createdAt)}  ${String(event.type).padEnd(22)} ${String(event.message ?? '').slice(0, 74)}`);
  }

  title('5. SUITE DANS LA CONSOLE WEB (http://127.0.0.1:5173)');
  info('Connexion : operateur.zmc@zengo.cd / Zengo@2026');
  info('Ecran ALERTES : prenez en charge, engagez une station, suivez la mission, cloturez.');
  console.log('');
  info(`Reference a retrouver : ${alert.reference}`);

  if (gateway.kit) gateway.kit.end(true);
  if (gateway.server) await new Promise((resolve) => gateway.server.close(resolve));
  if (gateway.broker) await new Promise((resolve) => gateway.broker.close(resolve));
}

main().catch((error) => {
  console.error(`\nEchec du declenchement : ${error.message}`);
  process.exit(1);
});
