#!/usr/bin/env node
/**
 * Test de fumee du module e-Sante connectee (iteration 6).
 *
 * Pre-requis : base demarree, seed applique, API lancee (`npm run start:prod`).
 *
 *   node scripts/smoke-health.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

const ACCOUNTS = {
  /** Personnel de sante : porte la lecture des donnees de sante. */
  health: { identifier: 'sante@zengo.cd', password: 'Zengo@2026' },
  /** Profil non habilite : sert a verifier les refus. */
  requester: { identifier: 'plateforme@zengo.cd', password: 'Zengo@2026' },
  client: { identifier: 'client.demo@zengo.cd', password: 'Client@2026' },
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
    throw new Error(`Connexion impossible pour ${credentials.identifier} (${status}).`);
  }
  return { token: data?.accessToken, user: data?.user };
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

/** Interroge la file d'alertes jusqu'a obtenir une alerte medicale du client. */
const waitForMedicalAlert = async (token, clientId, type) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await api(
      'GET',
      `/alerts?clientId=${clientId}&type=${type}&limit=5`,
      { token },
    );
    const alert = response.data?.items?.[0];
    if (alert) return alert;
    await sleep(500);
  }
  return null;
};

async function main() {
  console.log(`\nTest de fumee e-Sante connectee -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas.");
    process.exit(1);
  }

  const health = await login(ACCOUNTS.health);
  const requester = await login(ACCOUNTS.requester);
  const client = await login(ACCOUNTS.client);

  check(
    'Connexion du personnel de sante (HEALTH_STAFF)',
    Array.isArray(health.user?.roles) && health.user.roles.includes('HEALTH_STAFF'),
    (health.user?.roles ?? []).join(', '),
  );

  const me = await api('GET', '/clients/me', { token: client.token });
  const clientId = me.data?.id;
  check('Dossier client de demonstration accessible', Boolean(clientId), me.data?.zengoId);

  // ---------------------------------------------------------------------------
  console.log('\n1. Securite et cloisonnement des donnees de sante');
  // ---------------------------------------------------------------------------
  const anonymous = await api('GET', '/healthcare/measurements');
  check('Historique des mesures protege par authentification (401)', anonymous.status === 401);

  const forbidden = await api('GET', '/healthcare/measurements', { token: requester.token });
  check(
    'Hors personnel de sante, la lecture est refusee (403)',
    forbidden.status === 403,
    String(forbidden.status),
  );

  const forbiddenDossier = await api('GET', `/healthcare/clients/${clientId}`, {
    token: requester.token,
  });
  check(
    'Hors personnel de sante, le dossier de sante est refuse (403)',
    forbiddenDossier.status === 403,
    String(forbiddenDossier.status),
  );

  const forbiddenWrite = await api('POST', '/healthcare/measurements', {
    token: requester.token,
    body: { clientId, metric: 'SPO2', value: 97 },
  });
  check(
    'Hors personnel de sante, la saisie est refusee (403)',
    forbiddenWrite.status === 403,
    String(forbiddenWrite.status),
  );

  // ---------------------------------------------------------------------------
  console.log('\n2. Mesures : qualification automatique');
  // ---------------------------------------------------------------------------
  const normal = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: { clientId, metric: 'SPO2', value: 97, note: 'Controle de routine.' },
  });
  check(
    'Mesure normale enregistree et classee NORMAL (201)',
    normal.status === 201 && normal.data?.status === 'NORMAL',
    `${normal.data?.label}`,
  );
  check(
    'Unite et date de mesure renseignees',
    normal.data?.unit === '%' && Boolean(normal.data?.measuredAt),
    `${normal.data?.value} ${normal.data?.unit}`,
  );
  check(
    'Aucune alerte pour une valeur normale',
    normal.data?.alertId === null,
    String(normal.data?.alertId),
  );

  const watch = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: { clientId, metric: 'BLOOD_GLUCOSE', value: 108, fasting: true },
  });
  check(
    'Glycemie a jeun prediabetique classee WATCH (201)',
    watch.status === 201 && watch.data?.status === 'WATCH',
    watch.data?.label,
  );
  check(
    'Conseil delivre pour une valeur a surveiller',
    typeof watch.data?.advice === 'string' && watch.data.advice.length > 10,
    watch.data?.advice?.slice(0, 60),
  );

  const invalid = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: { clientId, metric: 'BLOOD_PRESSURE', value: 130 },
  });
  check(
    'Tension sans diastolique refusee (400)',
    invalid.status === 400,
    String(invalid.status),
  );

  const unknownClient = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: { clientId: '00000000-0000-4000-8000-000000000000', metric: 'SPO2', value: 97 },
  });
  check('Mesure sur un dossier inexistant refusee (404)', unknownClient.status === 404, String(unknownClient.status));

  // ---------------------------------------------------------------------------
  console.log('\n3. Mesure critique -> alerte medicale');
  // ---------------------------------------------------------------------------
  const critical = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: {
      clientId,
      metric: 'BLOOD_PRESSURE',
      value: 182,
      secondaryValue: 112,
      note: 'Client se plaint de maux de tete.',
    },
  });
  check(
    'Mesure critique classee CRITICAL (201)',
    critical.status === 201 && critical.data?.status === 'CRITICAL',
    critical.data?.label,
  );
  check(
    'Alerte medicale ouverte pour la valeur critique',
    Boolean(critical.data?.alertId),
    critical.data?.alertId,
  );

  const medicalAlert = await waitForMedicalAlert(health.token, clientId, 'MEDICAL');
  check(
    'Alerte MEDICALE visible dans le pipeline du ZMC',
    Boolean(medicalAlert?.id),
    medicalAlert ? `${medicalAlert.reference} / ${medicalAlert.severity}` : 'aucune',
  );
  check(
    "L'alerte rappelle la mesure d'origine",
    medicalAlert?.triggerMessage?.includes('Mesure de sante critique') ?? false,
    medicalAlert?.triggerMessage?.slice(0, 70),
  );
  check(
    'Aucun appel vocal automatique declenche (decision du personnel)',
    (medicalAlert?.voiceCalls ?? []).length === 0,
    `voiceCalls=${(medicalAlert?.voiceCalls ?? []).length}`,
  );

  const lowSpo2 = await api('POST', '/healthcare/measurements', {
    token: health.token,
    body: { clientId, metric: 'SPO2', value: 86 },
  });
  check(
    'Hypoxie classee CRITICAL avec alerte',
    lowSpo2.status === 201 &&
      lowSpo2.data?.status === 'CRITICAL' &&
      Boolean(lowSpo2.data?.alertId),
    lowSpo2.data?.label,
  );

  // ---------------------------------------------------------------------------
  console.log('\n4. Consentement du client et tracabilite');
  // ---------------------------------------------------------------------------
  // Etat de depart connu : aucun consentement actif, afin que le test soit
  // rejouable meme apres une demonstration dans la console.
  const baseline = await api('GET', `/healthcare/clients/${clientId}/consents`, {
    token: health.token,
  });
  for (const consent of baseline.data ?? []) {
    if (consent.active) {
      await api('PATCH', `/healthcare/clients/${clientId}/consents/revoke`, {
        token: health.token,
        body: { scope: consent.scope, reason: 'Remise a zero avant le test de fumee.' },
      });
    }
  }

  const revokedAttempt = await api('GET', `/healthcare/clients/${clientId}`, {
    token: health.token,
  });
  check(
    'Sans consentement, le dossier est refuse au personnel (403)',
    revokedAttempt.status === 403,
    String(revokedAttempt.status),
  );

  const emergency = await api('GET', `/healthcare/clients/${clientId}?emergency=true`, {
    token: health.token,
  });
  check(
    "Acces d'urgence autorise sans consentement, mais trace",
    emergency.status === 200 && (emergency.data?.vitals ?? []).length > 0,
    `${emergency.data?.sampleSize} mesure(s)`,
  );

  const grant = await api('POST', `/healthcare/clients/${clientId}/consents`, {
    token: health.token,
    body: {
      scope: 'DATA_SHARING',
      channel: 'CLIENT_APP',
      months: 24,
      statement: "J'autorise le partage de mes mesures avec le personnel de sante Zengo.",
    },
  });
  check(
    'Consentement de partage enregistre (201)',
    grant.status === 201 && grant.data?.active === true,
    `${grant.data?.scope} jusqu'au ${grant.data?.expiresAt?.slice(0, 10)}`,
  );

  const duplicate = await api('POST', `/healthcare/clients/${clientId}/consents`, {
    token: health.token,
    body: { scope: 'DATA_SHARING' },
  });
  check('Consentement actif non duplicable (409)', duplicate.status === 409, String(duplicate.status));

  const dossier = await api('GET', `/healthcare/clients/${clientId}`, { token: health.token });
  check(
    'Dossier de sante accessible apres consentement (200)',
    dossier.status === 200 && dossier.data?.sampleSize >= 4,
    `${dossier.data?.sampleSize} mesure(s) sur ${dossier.data?.vitals?.length} grandeur(s)`,
  );
  check(
    'Resume par grandeur avec statut et tendance',
    (dossier.data?.vitals ?? []).every((vital) => vital.status && vital.trend),
    (dossier.data?.vitals ?? []).map((vital) => `${vital.metric}:${vital.status}`).join(', '),
  );
  check(
    'Mesures critiques remontees dans le resume',
    (dossier.data?.criticalReadings ?? []).length >= 2,
    `${dossier.data?.criticalReadings?.length} mesure(s) critique(s)`,
  );
  check(
    'Comptage par statut coherent',
    dossier.data?.counts?.CRITICAL >= 2 && dossier.data?.counts?.NORMAL >= 1,
    JSON.stringify(dossier.data?.counts ?? {}),
  );

  const accessLogs = await api('GET', `/healthcare/clients/${clientId}/access-logs`, {
    token: health.token,
  });
  const actions = (accessLogs.data?.items ?? []).map((log) => log.action);
  check(
    "Journal d'acces alimente (consultations, urgence, consentement)",
    accessLogs.status === 200 &&
      actions.includes('VIEW') &&
      actions.includes('CONSENT_GRANTED'),
    actions.join(', '),
  );
  check(
    "L'acces d'urgence est trace distinctement",
    actions.includes('EMERGENCY') ||
      (accessLogs.data?.items ?? []).some((log) => log.reason.includes('urgence')),
    (accessLogs.data?.items ?? []).find((log) => log.action === 'EMERGENCY')?.reason ?? 'n/a',
  );

  const exportWithReason = await api('POST', `/healthcare/clients/${clientId}/export`, {
    token: health.token,
    body: { reason: 'Transmission au medecin traitant.' },
  });
  check(
    'Export des donnees de sante trace avec motif (201)',
    exportWithReason.status === 201 && exportWithReason.data?.dossier?.sampleSize >= 4,
    `${exportWithReason.data?.dossier?.sampleSize} mesure(s) exportee(s)`,
  );

  const exportWithoutReason = await api('POST', `/healthcare/clients/${clientId}/export`, {
    token: health.token,
    body: {},
  });
  check('Export sans motif refuse (400)', exportWithoutReason.status === 400, String(exportWithoutReason.status));

  const revoke = await api('PATCH', `/healthcare/clients/${clientId}/consents/revoke`, {
    token: health.token,
    body: { scope: 'DATA_SHARING', reason: 'Le client demande a reprendre la main.' },
  });
  check(
    'Consentement retire a la demande du client (200)',
    revoke.status === 200 && revoke.data?.status === 'REVOKED' && revoke.data?.active === false,
    revoke.data?.reason ?? revoke.data?.status,
  );

  const afterRevoke = await api('GET', `/healthcare/clients/${clientId}`, {
    token: health.token,
  });
  check(
    'Apres retrait, tout acces est a nouveau refuse (403)',
    afterRevoke.status === 403,
    String(afterRevoke.status),
  );

  const revokeAgain = await api('PATCH', `/healthcare/clients/${clientId}/consents/revoke`, {
    token: health.token,
    body: { scope: 'DATA_SHARING', reason: 'Deuxieme retrait.' },
  });
  check('Retrait sans consentement actif refuse (400)', revokeAgain.status === 400, String(revokeAgain.status));

  // Le client peut toujours acceder a son propre dossier.
  const ownDossier = await api('GET', `/healthcare/clients/${clientId}`, {
    token: client.token,
  });
  check(
    'Le client accede a son propre dossier sans consentement (200)',
    ownDossier.status === 200,
    `${ownDossier.data?.sampleSize} mesure(s)`,
  );

  // On remet un consentement pour la suite du parcours.
  const regrant = await api('POST', `/healthcare/clients/${clientId}/consents`, {
    token: health.token,
    body: { scope: 'DATA_SHARING', channel: 'SMS', months: 12 },
  });
  check('Nouveau consentement possible apres retrait (201)', regrant.status === 201, regrant.data?.status);

  // ---------------------------------------------------------------------------
  console.log('\n5. Demande de soin / appel infirmier');
  // ---------------------------------------------------------------------------
  const request = await api('POST', '/healthcare/nurse-requests', {
    token: health.token,
    body: {
      clientId,
      reason: 'Maux de tete persistants.',
      symptoms: 'Cephalees depuis 24 h, tension elevee a domicile.',
      message: 'Bonjour, le client signale des maux de tete apres sa mesure.',
    },
  });
  check(
    'Demande de soin ouverte avec reference (201)',
    request.status === 201 && request.data?.reference?.startsWith('NS-'),
    request.data?.reference,
  );
  check(
    'Priorite deduite automatiquement des mesures critiques (EMERGENCY)',
    request.data?.priority === 'EMERGENCY',
    request.data?.priority,
  );
  check(
    "Alerte medicale liee a l'urgence declaree",
    Boolean(request.data?.alertId),
    request.data?.alertId,
  );
  check(
    'Premier message present dans le fil',
    (request.data?.messages ?? []).length === 1,
    `${(request.data?.messages ?? []).length} message(s)`,
  );
  check(
    'Echeance de prise en charge calculee selon la priorite',
    Boolean(request.data?.responseDueAt),
    request.data?.responseDueAt,
  );

  const duplicateRequest = await api('POST', '/healthcare/nurse-requests', {
    token: health.token,
    body: { clientId, reason: 'Deuxieme appel simultane.' },
  });
  check(
    'Une seule demande ouverte par client (409)',
    duplicateRequest.status === 409,
    String(duplicateRequest.status),
  );

  const accept = await api('PATCH', `/healthcare/nurse-requests/${request.data.id}/accept`, {
    token: health.token,
  });
  check(
    'Prise en charge par le personnel de sante (200)',
    accept.status === 200 && accept.data?.status === 'IN_PROGRESS',
    `${accept.data?.status} par ${accept.data?.assignedToLabel}`,
  );

  const message = await api('POST', `/healthcare/nurse-requests/${request.data.id}/messages`, {
    token: client.token,
    body: { body: 'Le patient confirme une amelioration apres repos.' },
  });
  check(
    'Message du client accepte dans le fil (201)',
    message.status === 201 && (message.data?.messages ?? []).length === 3,
    `${(message.data?.messages ?? []).length} message(s)`,
  );

  const complete = await api('PATCH', `/healthcare/nurse-requests/${request.data.id}/complete`, {
    token: health.token,
    body: {
      resolution: 'Tension recontrôlee a 138/86 : surveillance a domicile.',
      advice: 'Recontrole de la tension matin et soir, consultation si > 160/100.',
    },
  });
  check(
    'Demande cloturee avec conclusion et conseils (200)',
    complete.status === 200 &&
      complete.data?.status === 'COMPLETED' &&
      Boolean(complete.data?.advice),
    complete.data?.resolution,
  );

  const messageAfterClose = await api('POST', `/healthcare/nurse-requests/${request.data.id}/messages`, {
    token: client.token,
    body: { body: 'Encore un mot ?' },
  });
  check('Fil ferme apres cloture (400)', messageAfterClose.status === 400, String(messageAfterClose.status));

  const secondRequest = await api('POST', '/healthcare/nurse-requests', {
    token: client.token,
    body: { clientId, reason: 'Question sur le traitement prescrit.' },
  });
  check(
    'Nouvelle demande possible apres cloture (201)',
    secondRequest.status === 201,
    `${secondRequest.data?.reference} (${secondRequest.data?.priority})`,
  );

  const cancel = await api('PATCH', `/healthcare/nurse-requests/${secondRequest.data.id}/cancel`, {
    token: client.token,
    body: { reason: 'Le client a obtenu sa reponse par telephone.' },
  });
  check(
    'Annulation par le demandeur (200)',
    cancel.status === 200 && cancel.data?.status === 'CANCELLED',
    cancel.data?.status,
  );

  const clientRequests = await api('GET', `/healthcare/clients/${clientId}/nurse-requests`, {
    token: health.token,
  });
  check(
    "Historique des demandes de soin d'un client",
    clientRequests.status === 200 && (clientRequests.data ?? []).length >= 2,
    `${(clientRequests.data ?? []).length} demande(s)`,
  );

  const requestFromOtherProfile = await api('GET', '/healthcare/nurse-requests', {
    token: requester.token,
  });
  check(
    'File des demandes refusee hors personnel de sante (403)',
    requestFromOtherProfile.status === 403,
    String(requestFromOtherProfile.status),
  );

  // ---------------------------------------------------------------------------
  console.log('\n6. Historique et indicateurs');
  // ---------------------------------------------------------------------------
  const history = await api(
    'GET',
    `/healthcare/clients/${clientId}/measurements?metric=SPO2&limit=5`,
    { token: health.token },
  );
  check(
    'Filtre par grandeur sur l historique client',
    history.status === 200 &&
      (history.data?.items ?? []).length >= 2 &&
      history.data.items.every((item) => item.metric === 'SPO2'),
    `${history.data?.items?.length ?? 0} mesure(s) SPO2`,
  );

  const criticalOnly = await api('GET', '/healthcare/measurements?criticalOnly=true&limit=10', {
    token: health.token,
  });
  check(
    'Filtre des mesures critiques',
    criticalOnly.status === 200 &&
      (criticalOnly.data?.items ?? []).every((item) => item.status === 'CRITICAL'),
    `${criticalOnly.data?.items?.length ?? 0} mesure(s) critique(s)`,
  );

  const measurements = await api('GET', '/healthcare/measurements?limit=50', {
    token: health.token,
  });
  check(
    'Historique du perimetre accessible au personnel (200)',
    measurements.status === 200 && (measurements.data?.total ?? 0) >= 5,
    `${measurements.data?.total} mesure(s)`,
  );

  const stats = await api('GET', '/healthcare/measurements/stats', { token: health.token });
  check(
    'Indicateurs de sante calcules (statuts, grandeur, critiques 24 h)',
    stats.status === 200 &&
      stats.data.totalMeasurements >= 5 &&
      stats.data.byStatus.CRITICAL >= 2 &&
      stats.data.criticalLast24h >= 2,
    `${stats.data?.totalMeasurements} mesure(s), ${stats.data?.criticalClients} client(s) a risque`,
  );

  const nurseStats = await api('GET', '/healthcare/nurse-requests/stats', { token: health.token });
  check(
    'Indicateurs du centre de soin (delais, retards)',
    nurseStats.status === 200 &&
      nurseStats.data.total >= 2 &&
      Array.isArray(nurseStats.data.byPriority),
    `${nurseStats.data?.total} demande(s), delai moyen ${nurseStats.data?.averageResponseMinutes ?? 'n/a'} min`,
  );

  const globalStats = await api('GET', '/healthcare/stats', { token: health.token });
  check(
    'Synthese e-sante consolidee',
    globalStats.status === 200 &&
      globalStats.data.measurements?.totalMeasurements >= 5 &&
      globalStats.data.nurseRequests?.total >= 2,
    'mesures + demandes de soin',
  );

  const openOnly = await api('GET', '/healthcare/nurse-requests?openOnly=true', {
    token: health.token,
  });
  check(
    'Filtre des demandes non cloturees',
    openOnly.status === 200 &&
      (openOnly.data?.items ?? []).every((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED'),
    `${openOnly.data?.items?.length ?? 0} demande(s) ouverte(s)`,
  );

  // ---------------------------------------------------------------------------
  console.log('\n7. Menage');
  // ---------------------------------------------------------------------------
  const revokeFinal = await api('PATCH', `/healthcare/clients/${clientId}/consents/revoke`, {
    token: health.token,
    body: { scope: 'DATA_SHARING', reason: 'Fin du test de fumee.' },
  });
  check('Consentement de test retire', revokeFinal.status === 200, revokeFinal.data?.status);

  // Les mesures critiques du test ont ouvert des alertes MEDICALES : on les
  // cloture pour ne pas polluer la file du ZMC entre deux executions.
  const openMedicalAlerts = await api(
    'GET',
    `/alerts?clientId=${clientId}&type=MEDICAL&openOnly=true&limit=20`,
    { token: requester.token },
  );
  let closed = 0;
  for (const alert of openMedicalAlerts.data?.items ?? []) {
    const resolved = await api('POST', `/alerts/${alert.id}/resolve`, {
      token: requester.token,
      body: {
        resolution: 'MAINTENANCE_TEST',
        note: 'Alerte medicale generee par le test de fumee e-sante.',
      },
    });
    if (resolved.status === 200 || resolved.status === 201) closed += 1;
  }
  check(
    'Alertes medicales du test cloturees (file du ZMC nettoyee)',
    (openMedicalAlerts.data?.items ?? []).length === closed,
    `${closed} alerte(s) cloturee(s)`,
  );

  console.log('\n============================================================');
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nErreur fatale du test de fumee :', error);
  process.exit(1);
});
