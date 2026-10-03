#!/usr/bin/env node
/**
 * Test de fumee du module Alertes & Zengo Monitoring Center.
 *
 * Pre-requis : base demarree, seed applique, API lancee (`npm run start:prod`).
 *
 *   node scripts/smoke-alerts.mjs [baseUrl] [socketUrl]
 */
import { io } from 'socket.io-client';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const SOCKET_URL = (process.argv[3] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const ACCOUNTS = {
  operator: { identifier: 'operateur.zmc@zengo.cd', password: 'Zengo@2026' },
  client: { identifier: 'client.demo@zengo.cd', password: 'Client@2026' },
  agencyManagerKinshasa: { identifier: 'chef.kinshasa@zengo.cd', password: 'Zengo@2026' },
};

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

/**
 * Attend qu'une valeur devienne disponible : les webhooks fournisseur sont
 * acquittes immediatement puis traites par le bus d'evenements.
 */
const waitFor = async (probe, { attempts = 10, delayMs = 250 } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await probe();
    if (value) return value;
    await sleep(delayMs);
  }
  return null;
};

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
  const { status, data } = await api('POST', '/auth/login', { body: credentials });
  if (status !== 200) {
    throw new Error(`Connexion impossible pour ${credentials.identifier} (${status} ${JSON.stringify(data).slice(0, 120)})`);
  }
  return { status, token: data?.accessToken, user: data?.user };
};

const waitForApi = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function main() {
  console.log(`\nTest de fumee Alertes & ZMC -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas.");
    process.exit(1);
  }

  const operator = await login(ACCOUNTS.operator);
  const client = await login(ACCOUNTS.client);
  const kinshasaManager = await login(ACCOUNTS.agencyManagerKinshasa);

  check('Connexion operateur ZMC', operator.status === 200, operator.user?.roles?.join(','));
  check('Connexion client', client.status === 200);

  // ---------------------------------------------------------------------------
  console.log('\n1. Alertes et perimetre');
  // ---------------------------------------------------------------------------
  const protectedAccess = await api('GET', '/alerts');
  check('File d alertes protegee sans token -> 401', protectedAccess.status === 401);

  const sos = await api('POST', '/alerts/sos', {
    token: client.token,
    body: { type: 'MEDICAL', note: 'Malaise a domicile, besoin d une ambulance.' },
  });
  check('Bouton SOS client -> alerte creee', sos.status === 201, sos.data?.reference);
  check(
    'Reference au format AL-AAAAMMJJ-NNNN',
    /^AL-\d{8}-\d{4}$/.test(sos.data?.reference ?? ''),
    sos.data?.reference,
  );
  check('Origine identifiee comme application mobile', sos.data?.source === 'CLIENT_APP');
  check('Gravite medicale critique', sos.data?.severity === 'CRITICAL', sos.data?.severity);
  check('Localisation issue de la fiche client', sos.data?.city === 'Lubumbashi', sos.data?.city);
  check('Agence de rattachement reprise', Boolean(sos.data?.organizationId));

  const alertId = sos.data.id;

  const clientSeesOwn = await api('GET', '/alerts', { token: client.token });
  check(
    'Le client ne voit que ses propres alertes',
    clientSeesOwn.status === 200 && clientSeesOwn.data.items.every((item) => item.clientId !== null),
    `${clientSeesOwn.data.total} alerte(s)`,
  );

  const otherScope = await api('GET', '/alerts', { token: kinshasaManager.token });
  check(
    'Cloisonnement : l agence de Kinshasa ne voit pas l alerte de Lubumbashi',
    otherScope.status === 200 && otherScope.data.items.every((item) => item.id !== alertId),
    `${otherScope.data.total} alerte(s) visibles`,
  );

  const forbiddenRead = await api('GET', `/alerts/${alertId}`, { token: kinshasaManager.token });
  check('Acces direct hors perimetre -> 403', forbiddenRead.status === 403);

  // ---------------------------------------------------------------------------
  console.log('\n2. Cycle de vie complet (prise en charge -> affectation -> cloture)');
  // ---------------------------------------------------------------------------
  const queue = await api('GET', '/alerts?openOnly=true', { token: operator.token });
  check(
    'Alerte presente dans la file du ZMC',
    queue.status === 200 && queue.data.items.some((item) => item.id === alertId),
    `${queue.data.total} alerte(s) ouverte(s)`,
  );

  const acknowledged = await api('POST', `/alerts/${alertId}/acknowledge`, {
    token: operator.token,
    body: { note: 'Appel du client en cours.' },
  });
  check('Prise en charge operateur', acknowledged.status === 201 && acknowledged.data.status === 'ACKNOWLEDGED');

  const dispatched = await api('POST', `/alerts/${alertId}/dispatch`, {
    token: operator.token,
    body: { note: 'Ambulance requise.' },
  });
  check(
    'Affectation automatique',
    dispatched.status === 201 && dispatched.data.dispatches.length > 0,
    `${dispatched.status} ${JSON.stringify(dispatched.data).slice(0, 200)}`,
  );
  check('Statut passe a ASSIGNED', dispatched.data.alert?.status === 'ASSIGNED');
  const stationNames = (dispatched.data.dispatches ?? []).map((item) => item.station?.name);
  check(
    'Alerte medicale orientee vers la station medicale',
    stationNames.length > 0 && stationNames.every((name) => String(name).includes('Medicale')),
    stationNames.join(', '),
  );

  const dispatchId = dispatched.data.dispatches?.[0]?.id ?? null;
  if (!dispatchId) {
    console.error("\nAffectation impossible : le scenario de cycle de vie ne peut pas continuer.");
    process.exit(1);
  }

  const arrived = await api('PATCH', `/alerts/${alertId}/dispatches/${dispatchId}`, {
    token: operator.token,
    body: { status: 'ARRIVED', note: 'Equipe sur place.' },
  });
  check('Equipe declaree sur place -> IN_PROGRESS', arrived.status === 200 && arrived.data.status === 'IN_PROGRESS');

  const resolved = await api('POST', `/alerts/${alertId}/resolve`, {
    token: operator.token,
    body: { resolution: 'HANDLED_BY_TEAM', note: 'Patient transporte vers la clinique.' },
  });
  check('Cloture de l alerte', resolved.status === 201 && resolved.data.status === 'RESOLVED');

  const resolveAgain = await api('POST', `/alerts/${alertId}/resolve`, {
    token: operator.token,
    body: { resolution: 'NO_ACTION_REQUIRED' },
  });
  check('Double cloture refusee -> 400', resolveAgain.status === 400);

  const timeline = await api('GET', `/alerts/${alertId}/timeline`, { token: operator.token });
  const eventTypes = (timeline.data ?? []).map((event) => event.type);
  check(
    'Chronologie complete',
    ['CREATED', 'ACKNOWLEDGED', 'DISPATCHED', 'STATUS_CHANGED', 'RESOLVED'].every((type) =>
      eventTypes.includes(type),
    ),
    eventTypes.join(' -> '),
  );

  // ---------------------------------------------------------------------------
  console.log("\n3. Appel vocal IA : le client confirme etre a l'origine");
  // ---------------------------------------------------------------------------
  const clientProfile = await api('GET', '/clients/me', { token: client.token });
  const intrusion = await api('POST', '/alerts', {
    token: operator.token,
    body: {
      type: 'INTRUSION',
      clientId: clientProfile.data.id,
      note: 'Ouverture de porte detectee (test).',
    },
  });
  check('Alerte intrusion creee par l operateur', intrusion.status === 201, intrusion.data?.reference);

  const calls = await api('GET', `/alerts/${intrusion.data.id}/voice-calls`, { token: operator.token });
  check('Appel vocal IA declenche automatiquement', calls.status === 200 && calls.data.length === 1, `${calls.data?.length} appel(s)`);
  const voiceCall = calls.data[0];
  check('Appel compose vers le numero du client', voiceCall?.toNumber === '+243970000099', voiceCall?.toNumber);
  check(
    'Langue de l appel = langue preferee du client',
    voiceCall?.language === clientProfile.data.preferredLanguage,
    `${voiceCall?.language}`,
  );
  check('Fournisseur de test utilise', voiceCall?.provider === 'STUB');

  const twiml = await fetch(`${BASE}/voice-calls/twiml/${voiceCall.id}`);
  const twimlBody = await twiml.text();
  check(
    'Script vocal servi (TwiML)',
    twiml.status === 200 && twimlBody.includes('<Response>') && twimlBody.includes('<Say'),
  );
  check(
    'Script joue dans la langue du client',
    twimlBody.includes('language="fr-FR"') && twimlBody.includes('Etes-vous'),
    `langue=${/language="([^"]+)"/.exec(twimlBody)?.[1]}`,
  );

  // Parcours Twilio : le <Gather> poste la touche sur l'URL de reponse.
  const answer = await fetch(`${BASE}/voice-calls/twiml/${voiceCall.id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CallSid: voiceCall.providerCallId, Digits: '2' }),
  });
  const closingBody = await answer.text();
  check('Touche 2 (c est moi) enregistree', answer.status === 200 && closingBody.includes('<Response>'));
  check(
    'Message de cloture adapte (conseil de desarmement)',
    closingBody.includes('desarmer'),
  );

  const afterConfirmation = await api('GET', `/alerts/${intrusion.data.id}`, { token: operator.token });
  check(
    'Alerte classee sans suite (client confirme)',
    afterConfirmation.data?.status === 'FALSE_ALARM' && afterConfirmation.data?.clientConfirmed === true,
    `${afterConfirmation.data?.status} / ${afterConfirmation.data?.resolution}`,
  );

  const closedCalls = await api('GET', `/alerts/${intrusion.data.id}/voice-calls`, { token: operator.token });
  check(
    'Appel trace avec intention et touche composee',
    closedCalls.data?.[0]?.dtmfDigit === '2' && closedCalls.data?.[0]?.outcome === 'CONFIRMED_BY_CLIENT',
    `dtmf=${closedCalls.data?.[0]?.dtmfDigit} / ${closedCalls.data?.[0]?.detectedIntent}`,
  );

  // ---------------------------------------------------------------------------
  console.log("\n4. Appel vocal IA : le client infirme -> escalade immediate");
  // ---------------------------------------------------------------------------
  const confirmedIntrusion = await api('POST', '/alerts', {
    token: operator.token,
    body: {
      type: 'INTRUSION',
      clientId: clientProfile.data.id,
      note: 'Presence detectee dans le garage (test).',
    },
  });
  const calls2 = await api('GET', `/alerts/${confirmedIntrusion.data.id}/voice-calls`, { token: operator.token });
  const voiceCall2 = calls2.data[0];

  const clientDenies = await api('POST', `/voice-calls/${voiceCall2.id}/simulate/input`, {
    token: operator.token,
    body: { dtmf: '1' },
  });
  check(
    'Touche 1 (ce n est pas moi) -> intrusion confirmee',
    clientDenies.data?.voiceCall?.outcome === 'INTRUSION_CONFIRMED',
    clientDenies.data?.voiceCall?.outcome,
  );

  const escalated = await api('GET', `/alerts/${confirmedIntrusion.data.id}`, { token: operator.token });
  check('Gravite portee a CRITICAL', escalated.data?.severity === 'CRITICAL', escalated.data?.severity);
  check('Escalade immediate (niveau 1)', escalated.data?.escalationLevel === 1, `niveau ${escalated.data?.escalationLevel}`);
  check(
    'Toutes les stations du PDC notifiees',
    (escalated.data?.dispatches ?? []).length === 3,
    `${escalated.data?.dispatches?.length} station(s)`,
  );

  const escalatedTimeline = await api('GET', `/alerts/${confirmedIntrusion.data.id}/timeline`, {
    token: operator.token,
  });
  check(
    'Escalade tracee dans la chronologie',
    (escalatedTimeline.data ?? []).some((event) => event.type === 'ESCALATED'),
  );

  const manualEscalation = await api('POST', `/alerts/${confirmedIntrusion.data.id}/escalate`, {
    token: operator.token,
    body: { reason: 'Renfort policier demande.', regional: true },
  });
  check(
    'Escalade manuelle idempotente (aucune nouvelle station)',
    manualEscalation.status === 201 && manualEscalation.data.dispatches.length === 0,
  );

  // ---------------------------------------------------------------------------
  console.log('\n5. Simulation ASR (reconnaissance vocale) et appel sans reponse');
  // ---------------------------------------------------------------------------
  const speechAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'FIRE', clientId: clientProfile.data.id, note: 'Detecteur de fumee cuisine (test).' },
  });
  const speechCalls = await api('GET', `/alerts/${speechAlert.data.id}/voice-calls`, { token: operator.token });
  const speechInputWithoutAnswer = await api('POST', `/voice-calls/${speechCalls.data[0].id}/simulate/input`, {
    token: operator.token,
    body: { speech: 'Non, ce n est pas moi !' },
  });
  check(
    'ASR : « non, ce n est pas moi » -> intrusion confirmee',
    speechInputWithoutAnswer.data?.voiceCall?.outcome === 'INTRUSION_CONFIRMED',
    speechInputWithoutAnswer.data?.voiceCall?.detectedIntent,
  );

  const noAnswerAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'INTRUSION', clientId: clientProfile.data.id, note: 'Test sans reponse.' },
  });
  const noAnswerCalls = await api('GET', `/alerts/${noAnswerAlert.data.id}/voice-calls`, {
    token: operator.token,
  });
  const noAnswer = await api('POST', `/voice-calls/${noAnswerCalls.data[0].id}/simulate/status`, {
    token: operator.token,
    body: { status: 'no-answer' },
  });
  check(
    'Appel sans reponse : alerte inchangee (le watchdog prend le relais)',
    noAnswer.status === 200 &&
      noAnswer.data.voiceCall?.outcome === 'NO_ANSWER' &&
      (await api('GET', `/alerts/${noAnswerAlert.data.id}`, { token: operator.token })).data.status === 'NEW',
  );

  // ---------------------------------------------------------------------------
  console.log('\n7. Relecture de l enregistrement d appel');
  // ---------------------------------------------------------------------------
  const recordingAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'INTRUSION', clientId: clientProfile.data.id, note: 'Test enregistrement.' },
  });
  const recordingCalls = await api('GET', `/alerts/${recordingAlert.data.id}/voice-calls`, { token: operator.token });
  const recordingCall = recordingCalls.data[0];

  const withoutRecording = await api('GET', `/voice-calls/${recordingCall.id}/recording`, { token: operator.token });
  check(
    'Aucun enregistrement : relecture refusee explicitement',
    withoutRecording.status === 404 && withoutRecording.data?.code === 'RECORDING_UNAVAILABLE',
    String(withoutRecording.status),
  );

  const hostileRecording = await api('POST', `/voice-calls/webhooks/stub/status`, {
    body: {
      CallSid: recordingCall.providerCallId,
      CallStatus: 'completed',
      RecordingUrl: 'http://169.254.169.254/latest/meta-data/',
    },
  });
  check('Enregistrement hostile enregistre mais jamais relaye', hostileRecording.status === 200);

  const callsAfterWebhook = await api('GET', `/alerts/${recordingAlert.data.id}/voice-calls`, {
    token: operator.token,
  });
  const callWithRecording = callsAfterWebhook.data.find((call) => call.id === recordingCall.id);
  // Les webhooks fournisseur sont traites de maniere asynchrone par le bus
  // d'evenements (le 200 acquitte la reception, pas le traitement) : on laisse
  // au consommateur le temps d'ecrire l'enregistrement en base.
  const persistedRecording = await waitFor(async () => {
    const { data } = await api('GET', `/alerts/${recordingAlert.data.id}/voice-calls`, {
      token: operator.token,
    });
    return data.find((call) => call.id === recordingCall.id)?.recordingUrl ?? null;
  });
  check(
    'URL d enregistrement recue du fournisseur (jamais servie directement)',
    persistedRecording === 'http://169.254.169.254/latest/meta-data/',
    persistedRecording ?? callWithRecording?.recordingUrl ?? 'aucune',
  );

  const relayed = await api('GET', `/voice-calls/${recordingCall.id}/recording`, { token: operator.token });
  check(
    'Hote non autorise : le serveur refuse de relayer (403)',
    relayed.status === 403 && relayed.data?.code === 'RECORDING_HOST_NOT_ALLOWED',
    `${relayed.status} ${relayed.data?.code ?? ''}`,
  );

  const anonymousRecording = await api('GET', `/voice-calls/${recordingCall.id}/recording`, {});
  check('Enregistrement protege par authentification (401)', anonymousRecording.status === 401);

  // ---------------------------------------------------------------------------
  console.log('\n8. Notification SMS du client');
  // ---------------------------------------------------------------------------
  const smsAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'MEDICAL', clientId: clientProfile.data.id, note: 'Test SMS client.', autoVoiceCall: false },
  });

  const alertSms = await api('GET', `/alerts/${smsAlert.data.id}/sms`, { token: operator.token });
  const firstSms = alertSms.data?.items?.[0];
  check(
    'SMS envoye en parallele de lappel vocal',
    alertSms.status === 200 && (alertSms.data?.items?.length ?? 0) === 1,
    `${alertSms.data?.items?.length ?? 0} message(s)`,
  );
  check(
    'SMS au statut accepte par le fournisseur',
    firstSms?.status === 'SENT' && firstSms?.provider === 'STUB',
    `${firstSms?.status} via ${firstSms?.provider}`,
  );
  check(
    'SMS redige dans la langue du client, sans variable non remplacee',
    firstSms?.language === 'fr' && !firstSms?.body.includes('{'),
    firstSms?.body?.slice(0, 90),
  );
  check(
    'SMS adresse au numero principal du client',
    firstSms?.toNumber === clientProfile.data.primaryPhone,
    firstSms?.toNumber,
  );
  check(
    'SMS decoupe et facture en segments coherents',
    firstSms?.segments >= 1 && ['GSM7', 'UCS2'].includes(firstSms?.encoding),
    `${firstSms?.segments} segment(s) ${firstSms?.encoding}`,
  );

  const timelineWithSms = await api('GET', `/alerts/${smsAlert.data.id}/timeline`, { token: operator.token });
  check(
    'Chronologie du dossier enrichie du SMS',
    (timelineWithSms.data ?? []).some((event) => event.type === 'SMS_SENT'),
  );

  const resent = await api('POST', `/sms/${firstSms.id}/resend`, { token: operator.token });
  check(
    'Renvoi manuel : nouveau message, historique conserve',
    resent.status === 200 &&
      resent.data?.message?.id !== firstSms.id &&
      resent.data?.message?.attemptNumber === 2 &&
      (await api('GET', `/alerts/${smsAlert.data.id}/sms`, { token: operator.token })).data.items.length === 2,
    resent.data?.message?.status,
  );

  const deliveryReport = await api('POST', '/sms/webhooks/stub/status', {
    body: { MessageSid: firstSms.providerMessageId, MessageStatus: 'delivered', Price: '-0.0450' },
  });
  check(
    'Accuse de remise du fournisseur applique',
    deliveryReport.status === 200 &&
      deliveryReport.data?.status === 'DELIVERED' &&
      (await api('GET', `/alerts/${smsAlert.data.id}/sms`, { token: operator.token })).data.items.find(
        (item) => item.id === firstSms.id,
      ).deliveredAt !== null,
  );

  const smsStats = await api('GET', '/sms/stats', { token: operator.token });
  check(
    'Indicateurs du canal SMS',
    smsStats.status === 200 && smsStats.data.total >= 2 && smsStats.data.acceptanceRate !== null,
    `${smsStats.data.total} message(s), acceptation ${smsStats.data.acceptanceRate}%, remise ${smsStats.data.deliveryRate}%`,
  );

  // Le client lit legitimement les messages recus sur son propre dossier :
  // c'est la trace ecrite de ce que le centre lui a annonce.
  const clientSmsAccess = await api('GET', `/alerts/${smsAlert.data.id}/sms`, { token: client.token });  check(
    'Le client relit les SMS recus sur son dossier',
    clientSmsAccess.status === 200 && (clientSmsAccess.data?.items?.length ?? 0) === 2,
    `${clientSmsAccess.data?.items?.length ?? 0} message(s)`,
  );

  // ... mais il ne peut pas ecrire dans le canal : seuls les agents y publient.
  const clientAttempt = await api('POST', `/alerts/${smsAlert.data.id}/sms`, {
    token: client.token,
    body: { body: 'Message ecrit par le client lui-meme.' },
  });
  check(
    'Un client ne peut pas ecrire dans le canal SMS (403)',
    clientAttempt.status === 403,
    String(clientAttempt.status),
  );

  const anonymousSmsAccess = await api('GET', `/alerts/${smsAlert.data.id}/sms`, {});
  check('Historique SMS protege par authentification (401)', anonymousSmsAccess.status === 401);

  // ---------------------------------------------------------------------------
  console.log('\n9. Indicateurs et diffusion temps reel');
  // ---------------------------------------------------------------------------
  const stats = await api('GET', '/alerts/stats', { token: operator.token });
  check('Statistiques disponibles', stats.status === 200 && typeof stats.data.open === 'number', `${stats.data.open} ouverte(s)`);
  check('Repartition par type presente', Array.isArray(stats.data.byType) && stats.data.byType.length > 0);
  check(
    'Delai moyen de prise en charge calcule',
    stats.data.averageAcknowledgeSeconds === null || stats.data.averageAcknowledgeSeconds >= 0,
    `${stats.data.averageAcknowledgeSeconds}s`,
  );

  const socket = io(`${SOCKET_URL}/realtime`, {
    auth: { token: operator.token },
    transports: ['websocket'],
    reconnection: false,
  });

  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000);
    socket.on('ready', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    socket.on('unauthorized', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  check('Poignee de main temps reel authentifiee', ready !== null, ready ? `${ready.rooms.length} salle(s)` : 'echec');

  const realtimeEventPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000);
    socket.on('alert.created', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });

  const realtimeAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'PANIC', clientId: clientProfile.data.id, note: 'Test de diffusion temps reel.' },
  });
  const realtimeEvent = await realtimeEventPromise;
  check(
    'Evenement alert.created recu par la console connectee',
    realtimeEvent !== null && realtimeEvent.alertId === realtimeAlert.data.id,
    realtimeEvent?.reference,
  );

  const anonymousSocket = io(`${SOCKET_URL}/realtime`, { transports: ['websocket'], reconnection: false });
  const rejected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 6_000);
    anonymousSocket.on('unauthorized', () => {
      clearTimeout(timer);
      resolve(true);
    });
    anonymousSocket.on('disconnect', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  check('Connexion temps reel sans JWT refusee', rejected);

  socket.close();
  anonymousSocket.close();

  console.log(`\n============================================================`);
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test de fumee interrompu :', error);
  process.exit(1);
});
