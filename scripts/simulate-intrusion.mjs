#!/usr/bin/env node
/**
 * SIMULATION D'UNE INTRUSION — scenario pedagogique de bout en bout.
 *
 * Le script joue le role du kit SafAlert installe chez le client, puis le role
 * du client qui repond au telephone. Chaque etape est expliquee a l'ecran, et
 * l'etat reel en base est affiche apres chaque action : c'est la demonstration
 * a faire devant un client.
 *
 * Prerequis (2 terminaux) :
 *   1) npm run mqtt:broker
 *   2) MQTT_ENABLED=true MQTT_URL=mqtt://127.0.0.1:1884 npm run start:prod
 *
 * Puis :
 *   node scripts/simulate-intrusion.mjs
 *
 * Options :
 *   --watchdog        etape 5 : cree une alerte SANS repondre a l'appel et
 *                     attend l'escalade du minuteur (voir ALERT_ESCALATION_SECONDS)
 *   --watchdog 90     duree d'attente maximale de l'etape 5 (defaut 60 s)
 *   --sans-appel      ne pas repondre non plus a l'appel de l'etape 4
 */
import { createServer } from 'node:net';
import Aedes from 'aedes';
import mqtt from 'mqtt';

const BASE = (process.env.SIM_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const BROKER_PORT = Number(process.env.SIM_BROKER_PORT ?? 1884);
const SERIAL = '3003004fba2394';
const TOPIC = (platform, action) => `sg/${SERIAL}/${platform}/${action}`;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const next = args[index + 1];
  return next && !next.startsWith('--') ? Number(next) : fallback;
};
const watchdog = args.includes('--watchdog');
const watchdogMax = argValue('--watchdog', 60) ?? 60;
const noCall = args.includes('--sans-appel');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const line = (char = '-') => console.log(char.repeat(78));
const step = (n, title) => {
  console.log('');
  line('=');
  console.log(`ETAPE ${n} — ${title}`);
  line('=');
};
const info = (text = '') => console.log(`   ${text}`);
const ok = (text) => console.log(`   [OK] ${text}`);
const ko = (text) => console.log(`   [!] ${text}`);

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

/** Attend qu'une condition devienne vraie (les traitements sont asynchrones). */
const waitFor = async (probe, { attempts = 30, delayMs = 500 } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await probe();
    if (value) return value;
    await sleep(delayMs);
  }
  return null;
};

const fmt = (value) => (value ? new Date(value).toLocaleTimeString('fr-FR') : '—');
const stationNames = (dispatches) =>
  (dispatches ?? []).map((d) => d.station?.name ?? d.stationName ?? '—').join(', ') || '—';

/** Declenche une alarme sur un capteur et renvoie l'alerte creee. */
async function raiseAlarm(kit, token, sensor, operatorToken, excludeIds) {
  const before = await api('GET', '/alerts?openOnly=true&limit=100', { token: operatorToken });
  const known = new Set([...(before.data?.items ?? []).map((item) => item.id), ...(excludeIds ?? [])]);
  kit.publish(
    TOPIC('device', 'alarm'),
    JSON.stringify({
      token,
      id: sensor.subId,
      name: sensor.code === 'PIR' ? 'motion sensor' : 'door sensor',
      message: 'Declenchement detecte pendant l armement.',
      type: 0,
    }),
  );
  return waitFor(async () => {
    const after = await api('GET', '/alerts?openOnly=true&limit=100', { token: operatorToken });
    return (after.data?.items ?? []).find((item) => !known.has(item.id)) ?? null;
  });
}

/** Annule une alerte, ou signale qu'elle est deja cloturee. */
async function closeAlert(alert, token, note) {
  const current = await api('GET', `/alerts/${alert.id}`, { token });
  const status = current.data?.status;
  if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(status)) {
    ok(`Alerte ${alert.reference} deja cloturee (${status}) — rien a faire`);
    return;
  }
  const cancelled = await api('POST', `/alerts/${alert.id}/cancel`, { token, body: { note } });
  if (cancelled.status === 200 || cancelled.status === 201) {
    ok(`Alerte ${alert.reference} annulee`);
    return;
  }
  const resolved = await api('POST', `/alerts/${alert.id}/resolve`, {
    token,
    body: { resolution: 'MAINTENANCE_TEST', note },
  });
  if (resolved.status === 200 || resolved.status === 201) ok(`Alerte ${alert.reference} cloturee`);
  else ko(`Alerte ${alert.reference} non cloturee (HTTP ${resolved.status}) — a traiter dans la console`);
}

async function main() {
  console.log('\n');
  line('#');
  console.log('#  SIMULATION D UNE INTRUSION — SafAlert Solar G1 / Zengo Monitoring Center');
  line('#');
  info(`API           : ${BASE}`);
  info(`Broker MQTT   : 127.0.0.1:${BROKER_PORT}`);
  info(`Kit (SN)      : ${SERIAL}`);
  info('Scenario      : ouverture de porte pendant l armement -> appel de verification -> escalade');
  if (noCall) info('Option        : --sans-appel (le client ne repond pas)');
  if (watchdog) info(`Option        : --watchdog (attente du minuteur limitee a ${watchdogMax} s)`);

  // ---------------------------------------------------------------------------
  step(0, 'PREPARATION — ouvrir le broker et recuperer les comptes de travail');
  // ---------------------------------------------------------------------------
  info('Le broker MQTT est demarre par le script si aucun n ecoute deja.');
  let broker = null;
  let server = null;
  try {
    broker = new Aedes();
    server = createServer(broker.handle);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(BROKER_PORT, resolve);
    });
    ok(`Broker MQTT embarque a l ecoute sur 127.0.0.1:${BROKER_PORT}`);
  } catch {
    broker = null;
    server = null;
    ok(`Un broker ecoute deja sur 127.0.0.1:${BROKER_PORT}`);
  }
  info("L API doit etre lancee avec MQTT_ENABLED=true : la passerelle se reconnecte");
  info('automatiquement (toutes les 5 s) si le broker demarre apres elle.');

  const operatorToken = await login('operateur.zmc@zengo.cd', 'Zengo@2026');
  const adminToken = await login('admin@zengo.cd', 'Zengo@2026');
  ok('Connexion operateur ZMC et administrateur');

  const deviceResponse = await api('GET', `/devices?search=${SERIAL}`, { token: adminToken });
  const device = deviceResponse.data?.items?.[0];
  if (!device) throw new Error(`Dispositif ${SERIAL} introuvable : lancez d abord « npm run seed ».`);
  ok(`Kit identifie : ${device.serialNumber} (client ${device.client?.zengoId ?? '—'})`);
  info('C est le kit installe chez le client de demonstration (Lubumbashi).');

  const subDevices = await api('GET', `/devices/${device.id}/sub-devices`, { token: adminToken });
  const door = (subDevices.data ?? []).find((item) => item.code === 'DC');
  const motion = (subDevices.data ?? []).find((item) => item.code === 'PIR');
  if (!door) throw new Error('Aucun capteur de porte (code DC) sur ce kit.');
  ok(`Capteurs du kit : ${(subDevices.data ?? []).map((s) => `${s.name} (${s.code})`).join(', ')}`);

  const kit = mqtt.connect(`mqtt://127.0.0.1:${BROKER_PORT}`, { clientId: `sim-kit-${Date.now()}` });
  await new Promise((resolve) => kit.once('connect', resolve));
  ok('Le kit est connecte au broker (comme s il venait d etre pose chez le client)');

  // ---------------------------------------------------------------------------
  step(1, 'LE KIT S AUTHENTIFIE (device/auth)');
  // ---------------------------------------------------------------------------
  info('Le kit envoie son numero de serie chiffre. Le serveur repond par un jeton');
  info('que le kit utilisera ensuite dans TOUS ses messages.');
  let token = null;
  kit.subscribe(TOPIC('server', 'auth'));
  kit.on('message', (topic, payload) => {
    if (topic !== TOPIC('server', 'auth')) return;
    try { token = JSON.parse(payload.toString()).token ?? null; } catch { token = null; }
  });
  for (let attempt = 0; attempt < 8 && !token; attempt += 1) {
    kit.publish(TOPIC('device', 'auth'), JSON.stringify({ sign: 'ec38cb30f28cf6ca1ebaf6c8790042da14a27dcb' }));
    await sleep(1_000);
  }
  if (!token) throw new Error("Le kit n a pas recu de jeton : la passerelle MQTT de l API est-elle activee ?");
  ok(`Jeton recu (${token.slice(0, 8)}...). Sans lui, aucun message du kit n est accepte.`);

  // ---------------------------------------------------------------------------
  step(2, 'LE KIT SIGNALE SON ETAT (device/heartbeat)');
  // ---------------------------------------------------------------------------
  info('Toutes les centrales remontent regulierement l etat de leurs capteurs.');
  info('Ici : le contact de porte est ferme et le systeme est arme (mode AWAY).');
  info('L etat est un masque binaire : 00000000 = tout est normal.');
  kit.publish(
    TOPIC('device', 'heartbeat'),
    JSON.stringify({ token, ver: 1002, list: [{ id: door.subId, state: '00000000' }] }),
  );
  await sleep(2_000);
  const heartbeat = await api('GET', `/devices/${device.id}/sub-devices`, { token: adminToken });
  const doorState = (heartbeat.data ?? []).find((item) => item.subId === door.subId);
  ok(`Etat enregistre : ${doorState?.state ?? '—'}`);
  info('Le ZMC sait donc que ce kit est en ligne, avec sa version de firmware a jour.');

  // ---------------------------------------------------------------------------
  step(3, 'LA PORTE S OUVRE -> LE KIT DECLENCHE UNE ALARME (device/alarm)');
  // ---------------------------------------------------------------------------
  info('Quelqu un ouvre la porte alors que le systeme est arme.');
  info('Le kit publie immediatement un message alarm sur son sujet MQTT.');
  const alert = await raiseAlarm(kit, token, door, operatorToken);
  if (!alert) throw new Error("Aucune alerte n a ete creee : verifiez MQTT_ENABLED=true et les journaux de l API.");

  ok(`ALERTE CREEE : ${alert.reference}`);
  info(`   nature    : ${alert.type} (deduite du capteur : un contact de porte = intrusion)`);
  info(`   gravite   : ${alert.severity}`);
  info(`   statut    : ${alert.status}`);
  info(`   origine   : ${alert.source} (SENSOR = vient du materiel, pas d un humain)`);
  info(`   client    : ${alert.client?.zengoId ?? '—'} — ${alert.client?.fullName ?? ''}`);
  info(`   adresse   : ${alert.address ?? '—'}, ${alert.city ?? ''}`);
  info(`   capteur   : ${alert.subDeviceName ?? door.name} (${alert.subDeviceCode ?? door.code})`);
  info(`   ouverte a : ${fmt(alert.openedAt)}`);
  info('');
  if ((alert.dispatches?.length ?? 0) > 0) {
    ok(`Stations prevenues d office : ${alert.dispatches.length} — ${stationNames(alert.dispatches)}`);
  } else {
    ok('Aucune equipe engagee pour l instant : le dossier attend la decision de l operateur.');
    info('C est voulu : le ZMC ne deplace pas les secours sur un simple declenchement.');
    info('Les stations sont diffusees a l escalade (etapes 4 et 5).');
  }
  info('L affectation automatique choisit les stations competentes du PDC du client.');
  info('');
  info('Deux traitements se declenchent en parallele :');
  info('   1. le ZMC recoit l alerte en temps reel (elle apparait sur l ecran de l operateur)');
  info('   2. le CENTRE APPELLE LE CLIENT pour verifier (etape 4)');
  info('   et un minuteur demarre : sans action, l escalade generale part (etape 5).');

  // ---------------------------------------------------------------------------
  step(4, 'L APPEL DE VERIFICATION AU CLIENT (appel vocal IA)');
  // ---------------------------------------------------------------------------
  const calls = await waitFor(async () => {
    const response = await api('GET', `/alerts/${alert.id}/voice-calls`, { token: operatorToken });
    return (response.data ?? []).length > 0 ? response.data : null;
  });
  if (!calls) {
    ko("Aucun appel n a ete enregistre (ALERT_AUTO_VOICE_CALL=false ?) — passez a l etape 5.");
  } else {
    const call = calls[0];
    ok(`Appel lance vers ${call.toNumber} en langue « ${call.language} » (statut ${call.status})`);
    const twiml = await fetch(`${BASE}/voice-calls/twiml/${call.id}`);
    const script = await twiml.text();
    const phrase = /Bonjour[^<"]*/.exec(script.replace(/\s+/g, ' '));
    info('Ce que le client entend :');
    info(`   « ${(phrase?.[0] ?? 'script vocal').slice(0, 160)}... »`);
    info('');
    info('Le client repond de trois facons possibles :');
    info('   touche 1  « ce n est pas moi »  -> INTRUSION CONFIRMEE -> escalade immediate');
    info('   touche 2  « c est moi »          -> FAUX POSITIF -> fin de l alerte');
    info('   pas de reponse                   -> le minuteur de l etape 5 decide');
    info('');

    if (noCall) {
      ok('Option --sans-appel : on ne repond pas, comme un client absent.');
    } else {
      info('>>> SIMULATION : le client appuie sur la touche 1 (« ce n est pas moi »)');
      const answer = await api('POST', `/voice-calls/${call.id}/simulate/input`, {
        token: operatorToken,
        body: { dtmf: '1' },
      });
      info(`     reponse envoyee (HTTP ${answer.status})`);
      await sleep(3_000);

      const afterCall = await api('GET', `/alerts/${alert.id}`, { token: operatorToken });
      ok(`Alerte requalifiee : gravite ${afterCall.data?.severity}, statut ${afterCall.data?.status}`);
      info('Un client qui dit « ce n est pas moi » fait passer l alerte en CRITIQUE et');
      info('declenche l ESCALADE IMMEDIATE, sans attendre le minuteur.');
      const escalations = (afterCall.data?.dispatches ?? []).filter((d) => d.isEscalation);
      ok(`Escalade niveau ${afterCall.data?.escalationLevel ?? '—'} : ${escalations.length} equipe(s) supplementaire(s)`);
      info('   ' + stationNames(escalations));
    }
  }

  // ---------------------------------------------------------------------------
  step(5, 'LA TEMPORISATION — quand PERSONNE n agit');
  // ---------------------------------------------------------------------------
  const current = await api('GET', `/alerts/${alert.id}`, { token: operatorToken });
  info('Regle du cahier des charges : si aucune action n est enregistree dans le delai');
  info('de ALERT_ESCALATION_SECONDS (300 s = 5 min par defaut), l alerte est diffusee');
  info('automatiquement a TOUTES les equipes actives du centre.');
  info('');
  info(`Etat du dossier ${alert.reference} : escalade a ${fmt(current.data?.escalatedAt)}`);
  info(`   niveau ${current.data?.escalationLevel ?? '—'} — ${(current.data?.dispatches ?? []).length} affectation(s) au total`);
  info('');
  info(noCall
    ? 'Ici le client n a pas repondu : c est le minuteur qui a fait le travail.'
    : 'Ici l escalade vient de la confirmation du client (touche 1) : elle est donc');
  if (!noCall) info('plus rapide que le minuteur. C est tout l interet du controle par appel.');

  if (watchdog) {
    info('');
    info(`>>> Minuteur pur : nouvelle alerte sans reponse, attente <= ${watchdogMax} s`);
    const watched = await raiseAlarm(kit, token, motion ?? door, operatorToken);
    if (!watched) {
      ko('Aucune nouvelle alerte (regroupement avec la precedente).');
    } else {
      info(`Alerte ${watched.reference} creee (capteur ${watched.subDeviceName ?? '—'}) — on ne repond pas.`);
      const fired = await waitFor(
        async () => {
          const state = await api('GET', `/alerts/${watched.id}`, { token: operatorToken });
          return state.data?.escalatedAt ? state.data : null;
        },
        { attempts: Math.ceil(watchdogMax / 2), delayMs: 2_000 },
      );
      if (fired) {
        ok(`Escalade automatique du minuteur a ${fmt(fired.escalatedAt)} (niveau ${fired.escalationLevel})`);
      } else {
        ko(`Le minuteur n a pas encore tourne apres ${watchdogMax} s (delai configure : 300 s).`);
        info('Pour une demo rapide : ALERT_ESCALATION_SECONDS=30 et');
        info('ALERT_WATCHDOG_INTERVAL_SECONDS=10 dans .env, puis redemarrez l API.');
      }
      await closeAlert(watched, operatorToken, 'Demonstration du minuteur.');
    }
  } else {
    info('');
    info('Pour demontrer le minuteur pur : relancer avec « --watchdog 60 » apres avoir');
    info('mis ALERT_ESCALATION_SECONDS=30 dans .env.');
  }

  // ---------------------------------------------------------------------------
  step(6, 'CE QUE VOIT L OPERATEUR DANS LA CONSOLE WEB');
  // ---------------------------------------------------------------------------
  info('Ouvrir http://127.0.0.1:5173 et se connecter avec operateur.zmc@zengo.cd / Zengo@2026.');
  info('');
  info('1. Ecran ALERTES : la nouvelle alerte est en haut de la file, sans rafraichir la page.');
  info('2. Cliquer dessus : le dossier s ouvre (client, adresse, capteur, appels, chronologie).');
  info('3. Bouton PRENDRE EN CHARGE : l operateur s attribue l alerte et stoppe le minuteur.');
  info('4. Bouton ENGAGER LES SECOURS : choisir la station, ou laisser l affectation automatique.');
  info('5. La station accuse reception, puis declare « sur place », puis « terminee ».');
  info('6. Bouton CLOTURER : compte rendu (ou « faux positif » si erreur).');
  info('');
  info('Ecran MISSIONS : l equipe engagee, sa position GPS, son temps d arrivee, son rapport.');

  // ---------------------------------------------------------------------------
  step(7, 'LA CHRONOLOGIE DU DOSSIER — la preuve de ce qui s est passe');
  // ---------------------------------------------------------------------------
  const timeline = await api('GET', `/alerts/${alert.id}/timeline`, { token: operatorToken });
  info('Chaque etape est horodatee et attribuee : c est le journal exigible en cas de litige.');
  info('');
  for (const event of (timeline.data ?? [])) {
    console.log(
      `   ${fmt(event.createdAt)}  ${String(event.type).padEnd(22)} ${String(event.message ?? '').slice(0, 76)}`,
    );
  }

  // ---------------------------------------------------------------------------
  step(8, 'DEUXIEME SCENARIO — le client dit « c est moi » (faux positif)');
  // ---------------------------------------------------------------------------
  info('Meme declenchement, mais le client confirme etre a l origine :');
  info('l alerte est classee sans suite, avec le motif, et rien n est envoye aux secours.');
  info('');
  info('Au passage, premiere regle de protection contre les repetitions :');
  info('un meme capteur qui repete en moins de 2 minutes n ouvre pas une 2e alerte,');
  info('il incremente le compteur d occurrences de la premiere.');
  const repeat = await api('GET', `/alerts/${alert.id}`, { token: operatorToken });
  info(`   alerte ${repeat.data?.reference} : occurrence ${repeat.data?.occurrenceCount ?? 1}`);

  const trigger = motion ?? door;
  const falseAlert = await raiseAlarm(kit, token, trigger, operatorToken);
  if (!falseAlert) {
    ko('Aucune nouvelle alerte creee (declenchement regroupe avec la precedente).');
  } else {
    ok(`Alerte ${falseAlert.reference} creee sur ${falseAlert.subDeviceName ?? trigger.name}`);
    const falseCalls = await waitFor(async () => {
      const response = await api('GET', `/alerts/${falseAlert.id}/voice-calls`, { token: operatorToken });
      return (response.data ?? []).length > 0 ? response.data : null;
    });
    if (!falseCalls) {
      ko("Pas d appel vocal sur cette alerte : le faux positif doit etre saisi a la main.");
    } else {
      info('>>> SIMULATION : le client appuie sur la touche 2 (« c est moi »)');
      await api('POST', `/voice-calls/${falseCalls[0].id}/simulate/input`, {
        token: operatorToken,
        body: { dtmf: '2' },
      });
      await sleep(3_000);
      const resolved = await api('GET', `/alerts/${falseAlert.id}`, { token: operatorToken });
      ok(`Alerte ${resolved.data?.reference} : statut ${resolved.data?.status}, motif ${resolved.data?.resolution}`);
      info(`Compte rendu : ${resolved.data?.resolutionNote ?? '—'}`);
      info('Aucune equipe n a ete engagee : la fausse alerte a ete arretee par un simple appel.');
    }
  }

  // ---------------------------------------------------------------------------
  step(9, 'NETTOYAGE');
  // ---------------------------------------------------------------------------
  info('Les alertes de la demonstration sont annulees pour laisser une file propre.');
  for (const target of [alert, falseAlert].filter(Boolean)) {
    await closeAlert(target, operatorToken, "Fin de la simulation d'intrusion.");
  }

  kit.end(true);
  if (server) await new Promise((resolve) => server.close(resolve));
  if (broker) await new Promise((resolve) => broker.close(resolve));

  console.log('');
  line('#');
  console.log('#  SIMULATION TERMINEE');
  line('#');
  info('A retenir pour la presentation : une intrusion est detectee par le kit,');
  info('verifiee par un appel automatique au client, escaladee si besoin sans');
  info('intervention humaine, et chaque etape reste tracee dans le dossier.');
  console.log('');
}

main().catch((error) => {
  console.error('\nErreur pendant la simulation :', error.message);
  process.exit(1);
});
