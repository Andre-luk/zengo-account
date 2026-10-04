#!/usr/bin/env node
/**
 * Test de fumee du banc d'essai du materiel (`/simulation`).
 *
 * Verifie que la console peut jouer un kit de bout en bout : mise en ligne,
 * armement, declenchement d'un capteur, appel de verification et reponse du
 * client. Aucun broker MQTT n'est necessaire : le banc d'essai emprunte le meme
 * chemin de code que la passerelle.
 *
 * A noter : la regle anti-repetition du projet (ALERT_GROUPING_WINDOW_SECONDS,
 * 2 minutes) fait qu'un declenchement sur un capteur deja en alerte est regroupe
 * dans le dossier existant (compteur d'occurrences). Le test accepte donc le
 * dossier retourne, qu'il soit nouveau ou regroupe.
 *
 *   node scripts/smoke-simulation.mjs [base-url]
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
};

const login = async (credentials) => {
  const response = await api('POST', '/auth/login', { body: credentials });
  if (response.status !== 200) {
    throw new Error(`Connexion impossible pour ${credentials.identifier} (${response.status}).`);
  }
  return response.data.accessToken;
};

/** Attend qu'une condition devienne vraie (les traitements sont asynchrones). */
const waitFor = async (probe, { attempts = 20, delayMs = 500 } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await probe();
    if (value) return value;
    await sleep(delayMs);
  }
  return null;
};

const formed = [];

async function main() {
  console.log(`\nBanc d'essai du materiel -> ${BASE}\n`);

  const operatorToken = await login({ identifier: 'operateur.zmc@zengo.cd', password: 'Zengo@2026' });
  const adminToken = await login({ identifier: 'admin@zengo.cd', password: 'Zengo@2026' });
  const clientToken = await login({ identifier: 'client.demo@zengo.cd', password: 'Client@2026' });

  // 1. Kits disponibles ------------------------------------------------------
  console.log('1. Kits jouables');
  const kits = await api('GET', '/simulation/kits', { token: operatorToken });
  check('Liste des kits', kits.status === 200 && Array.isArray(kits.data), `${kits.data?.length ?? 0} kit(s)`);

  const kit = (kits.data ?? []).find((item) => item.client && item.subDevices.length > 0);
  check('Un kit rattache a un client est disponible', Boolean(kit), kit?.serialNumber ?? '—');
  if (!kit) throw new Error("Aucun kit rattache a un client : lancez « npm run seed ».");
  check('Le kit expose ses capteurs', kit.subDevices.length >= 3, `${kit.subDevices.length} capteur(s)`);
  const door = kit.subDevices.find((item) => item.code === 'DC');
  const smoke = kit.subDevices.find((item) => item.code === 'WSD');
  check('Capteur de porte present', Boolean(door), door?.name ?? '—');
  check('Capteur de fumee present', Boolean(smoke), smoke?.name ?? '—');

  // 2. Permissions -----------------------------------------------------------
  console.log('\n2. Permissions');
  const anonymous = await api('GET', '/simulation/kits');
  check('Acces anonyme refuse', anonymous.status === 401, String(anonymous.status));
  const forbidden = await api('GET', '/simulation/kits', { token: clientToken });
  check('Acces client refuse', forbidden.status === 403, String(forbidden.status));

  // 3. Le kit se declare en ligne -------------------------------------------
  console.log('\n3. Mise en ligne du kit');
  const heartbeat = await api('POST', `/simulation/kits/${kit.id}/heartbeat`, {
    token: operatorToken,
    body: { subDeviceCode: 'DC', state: 'OPEN', firmwareVersion: 1002 },
  });
  check('Heartbeat accepte', heartbeat.status === 200, String(heartbeat.status));
  const doorAfter = heartbeat.data?.subDevices?.find((item) => item.code === 'DC');
  check('Contact declare ouvert', doorAfter?.state === '00000001', doorAfter?.state ?? '—');
  check('Etat decode par la console', doorAfter?.decoded?.open === true);
  check('Kit declare en ligne', heartbeat.data?.status === 'ACTIVE', heartbeat.data?.status ?? '—');

  const backToNormal = await api('POST', `/simulation/kits/${kit.id}/heartbeat`, {
    token: operatorToken,
    body: { subDeviceCode: 'DC', state: 'NORMAL' },
  });
  check(
    'Retour a l etat nominal',
    backToNormal.data?.subDevices?.find((item) => item.code === 'DC')?.state === '00000000',
  );

  const armed = await api('POST', `/simulation/kits/${kit.id}/arm-mode`, {
    token: adminToken,
    body: { armMode: 1 },
  });
  check('Armement annonce', armed.status === 200 && armed.data?.armMode === 1, String(armed.data?.armMode));

  // 4. Declenchement d'un capteur -------------------------------------------
  console.log('\n4. Declenchement d un capteur');
  const fire = await api('POST', `/simulation/kits/${kit.id}/alarm`, {
    token: operatorToken,
    body: { scenario: 'FIRE_SMOKE' },
  });
  formed.push(fire.data?.id);
  check('Alerte creee', fire.status === 201 && Boolean(fire.data?.reference), fire.data?.reference ?? '—');
  check('Nature deduite du capteur', fire.data?.type === 'FIRE', fire.data?.type ?? '—');
  check('Origine capteur', fire.data?.source === 'SENSOR', fire.data?.source ?? '—');
  check('Capteur journalise', fire.data?.subDeviceCode === 'WSD', fire.data?.subDeviceCode ?? '—');
  check('Client rattache', fire.data?.clientId === kit.client.id, fire.data?.client?.zengoId ?? '—');

  const fireCalls = await waitFor(async () => {
    const response = await api('GET', `/alerts/${fire.data.id}/voice-calls`, { token: operatorToken });
    return (response.data ?? []).length > 0 ? response.data : null;
  });
  check('Appel de verification declenche', Boolean(fireCalls), fireCalls?.[0]?.status ?? 'aucun');
  check('Appel en francais', fireCalls?.[0]?.language === 'fr', fireCalls?.[0]?.language ?? '—');

  const falseAlarm = await api('POST', `/voice-calls/${fireCalls[0].id}/simulate/input`, {
    token: operatorToken,
    body: { dtmf: '2' },
  });
  check('Reponse « c est moi » acceptee', falseAlarm.status === 200, String(falseAlarm.status));

  const resolved = await waitFor(async () => {
    const response = await api('GET', `/alerts/${fire.data.id}`, { token: operatorToken });
    return response.data?.status === 'FALSE_ALARM' ? response.data : null;
  });
  check('Alerte classee sans suite', resolved?.status === 'FALSE_ALARM', resolved?.status ?? '—');
  check('Motif client confirme', resolved?.resolution === 'CLIENT_CONFIRMED', resolved?.resolution ?? '—');
  check('Aucune equipe engagee', (resolved?.dispatches ?? []).length === 0);

  // 5. Intrusion confirmee par le client ------------------------------------
  console.log('\n5. Intrusion confirmee par le client');
  const intrusion = await api('POST', `/simulation/kits/${kit.id}/alarm`, {
    token: operatorToken,
    body: { scenario: 'INTRUSION_DOOR' },
  });
  formed.push(intrusion.data?.id);
  check('Alerte d intrusion creee', intrusion.status === 201, intrusion.data?.reference ?? '—');
  check('Nature intrusion', intrusion.data?.type === 'INTRUSION', intrusion.data?.type ?? '—');

  const intrusionCalls = await waitFor(async () => {
    const response = await api('GET', `/alerts/${intrusion.data.id}/voice-calls`, { token: operatorToken });
    return (response.data ?? []).length > 0 ? response.data : null;
  });
  const confirmed = await api('POST', `/voice-calls/${intrusionCalls[0].id}/simulate/input`, {
    token: operatorToken,
    body: { dtmf: '1' },
  });
  check('Reponse « ce n est pas moi » acceptee', confirmed.status === 200, String(confirmed.status));

  const escalated = await waitFor(async () => {
    const response = await api('GET', `/alerts/${intrusion.data.id}`, { token: operatorToken });
    return response.data?.escalatedAt ? response.data : null;
  });
  check('Gravite elevee a critique', escalated?.severity === 'CRITICAL', escalated?.severity ?? '—');
  check('Escalade declenchee', (escalated?.escalationLevel ?? 0) >= 1, `niveau ${escalated?.escalationLevel ?? 0}`);
  check('Equipes notifiees', (escalated?.dispatches ?? []).length >= 1, `${escalated?.dispatches?.length ?? 0} station(s)`);

  const timeline = await api('GET', `/alerts/${intrusion.data.id}/timeline`, { token: operatorToken });
  const types = (timeline.data ?? []).map((event) => event.type);
  check('Chronologie complete', types.includes('CREATED') && types.includes('VOICE_CALL_STARTED'), types.join(', '));
  check('Escalade tracee', types.includes('ESCALATED'));

  // 6. Appel sans reponse ----------------------------------------------------
  console.log('\n6. Appel sans reponse');
  const noAnswer = await api('POST', `/voice-calls/${intrusionCalls[0].id}/simulate/status`, {
    token: operatorToken,
    body: { status: 'no-answer' },
  });
  check('Statut sans reponse accepte', noAnswer.status === 200, String(noAnswer.status));

  // 7. Nettoyage -------------------------------------------------------------
  console.log('\n7. Nettoyage');
  let cancelled = 0;
  for (const alertId of formed.filter(Boolean)) {
    const response = await api('POST', `/alerts/${alertId}/cancel`, {
      token: operatorToken,
      body: { note: 'Fin du test de fumee du banc d essai.' },
    });
    if (response.status < 300) cancelled += 1;
  }
  check('Alertes de test annulees', cancelled >= 1, `${cancelled} annulee(s)`);

  console.log('\n============================================================');
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nEchec du test : ${error.message}\n`);
  process.exit(1);
});
