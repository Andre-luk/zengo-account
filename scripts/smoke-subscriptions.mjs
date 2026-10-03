#!/usr/bin/env node
/**
 * Test de fumee du module Abonnements & encaissements (iteration 4).
 *
 * Pre-requis : base demarree, seed applique, API lancee (`npm run start:prod`).
 *
 *   node scripts/smoke-subscriptions.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

const ACCOUNTS = {
  director: { identifier: 'plateforme@zengo.cd', password: 'Zengo@2026' },
  operator: { identifier: 'operateur.zmc@zengo.cd', password: 'Zengo@2026' },
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

const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / 86_400_000);

async function main() {
  console.log(`\nTest de fumee Abonnements -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas.");
    process.exit(1);
  }

  const director = await login(ACCOUNTS.director);
  const operator = await login(ACCOUNTS.operator);
  const client = await login(ACCOUNTS.client);

  const me = await api('GET', '/clients/me', { token: client.token });
  const clientProfile = me.data;
  const clientId = clientProfile.id;
  check('Fiche client de demonstration accessible', Boolean(clientId), clientProfile.zengoId);

  // ---------------------------------------------------------------------------
  console.log('1. Etat initial et tarification');
  // ---------------------------------------------------------------------------
  const initial = await api('GET', `/subscriptions/clients/${clientId}`, { token: operator.token });
  check(
    'Etat d abonnement consultable',
    initial.status === 200 && typeof initial.data?.effectiveStatus === 'string',
    `${initial.data?.effectiveStatus} (${initial.data?.validity})`,
  );
  const initialExpiry = initial.data?.expiresAt ?? null;

  const tooShort = await api('POST', '/subscriptions', {
    token: operator.token,
    body: { clientId, durationDays: 45, method: 'CASH_AGENCY' },
  });
  check('Duree non commercialisee refusee (400)', tooShort.status === 400, String(tooShort.status));

  const unknownClient = await api('POST', '/subscriptions', {
    token: operator.token,
    body: { clientId: '00000000-0000-4000-8000-000000000000', durationDays: 30, method: 'CASH_AGENCY' },
  });
  check('Client inconnu refuse (404)', unknownClient.status === 404, String(unknownClient.status));

  const cashierless = await api('POST', '/subscriptions', {
    token: client.token,
    body: { clientId, durationDays: 30, method: 'MPESA' },
  });
  check('Un client ne peut pas encaisser un abonnement (403)', cashierless.status === 403, String(cashierless.status));

  // ---------------------------------------------------------------------------
  console.log('\n2. Encaissement au guichet : code, validite et SMS');
  // ---------------------------------------------------------------------------
  const issue = await api('POST', '/subscriptions', {
    token: operator.token,
    body: {
      clientId,
      durationDays: 30,
      method: 'CASH_AGENCY',
      operatorReference: `CAISSE-${Date.now()}`,
      note: 'Test de fumee abonnements',
    },
  });

  check('Abonnement encaisse', issue.status === 201, issue.data?.subscription?.code);
  check(
    'Code au format ZG-XXXX-XXXX',
    /^ZG-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(
      issue.data?.subscription?.code ?? '',
    ),
    issue.data?.subscription?.code,
  );
  check(
    'Paiement enregistre et confirme',
    issue.data?.payment?.status === 'CONFIRMED' && issue.data?.payment?.channel === 'CASH',
    `${issue.data?.payment?.amountUsd} USD / ${issue.data?.payment?.amountCdf} CDF`,
  );
  check(
    'Prix calcule d apres le groupe tarifaire',
    Number(issue.data?.subscription?.priceUsd) > 0,
    `${issue.data?.subscription?.priceUsd} USD`,
  );
  check(
    'Validite etendue de 30 jours',
    daysBetween(issue.data?.subscription?.startsAt, issue.data?.subscription?.endsAt) === 30,
    `${issue.data?.subscription?.validity}`,
  );
  check(
    'Validite du client mise a jour',
    issue.data?.client?.subscriptionStatus === 'ACTIVE' &&
      (!initialExpiry || new Date(issue.data.client.subscriptionExpiresAt) > new Date(initialExpiry)),
    issue.data?.client?.subscriptionExpiresAt,
  );
  check('Code transmis au client par SMS', issue.data?.smsSent === true, issue.data?.smsError ?? 'envoye');

  const smsList = await api('GET', `/alerts/../sms/stats`, { token: operator.token });
  check('Indicateurs SMS disponibles', smsList.status === 200, `${smsList.data?.total} message(s)`);

  const codeSms = await api('GET', `/subscriptions?clientId=${clientId}&limit=5`, { token: operator.token });
  check(
    'Abonnement retrouve dans la liste du client',
    (codeSms.data?.items ?? []).some((item) => item.code === issue.data?.subscription?.code),
  );
  check(
    'Historique du client enrichi',
    (await api('GET', `/subscriptions/clients/${clientId}`, { token: operator.token })).data.history.length >= 1,
  );

  // Le franc congolais est la devise du terrain : un encaissement en CDF doit
  // etre converti au taux du jour et conserve pour la comptabilite.
  const cdfPayment = await api('POST', '/subscriptions', {
    token: operator.token,
    body: {
      clientId,
      durationDays: 30,
      method: 'ILLICOCASH',
      currency: 'CDF',
      operatorReference: `IL-${Date.now()}`,
    },
  });
  check(
    'Encaissement en francs congolais converti au taux du jour',
    cdfPayment.status === 201 && Number(cdfPayment.data?.payment?.amountCdf) > 0,
    `${cdfPayment.data?.payment?.amountUsd} USD -> ${cdfPayment.data?.payment?.amountCdf} CDF (taux ${cdfPayment.data?.payment?.exchangeRate})`,
  );

  // ---------------------------------------------------------------------------
  console.log('\n3. Activation du code');
  // ---------------------------------------------------------------------------
  const code = issue.data.subscription.code;
  const lowerCased = ` ${code.toLowerCase().replace(/-/g, ' ')} `;

  const byClient = await api('POST', '/subscriptions/activate', {
    token: client.token,
    body: { code: lowerCased },
  });
  check(
    'Le client active son propre code (saisie normalisee)',
    byClient.status === 201 && byClient.data?.subscription?.status === 'ACTIVATED',
    `${byClient.data?.subscription?.activatedAt}`,
  );
  check(
    'Activation tracee comme libre-service',
    byClient.data?.subscription?.activatedAt !== null,
    byClient.data?.alreadyActive ? 'deja active' : 'activee',
  );

  const renewed = await api('POST', '/subscriptions/activate', {
    token: client.token,
    body: { code },
  });
  check('Reactivation idempotente', renewed.status === 201 && renewed.data?.alreadyActive === true);

  const foreign = await api('POST', '/subscriptions', {
    token: operator.token,
    body: { clientId, durationDays: 90, method: 'MPESA', amountUsd: 57 },
  });
  check('Abonnement mobile money encaisse', foreign.status === 201, foreign.data?.payment?.method);

  const stolenCode = foreign.data.subscription.code;
  const clientActivation = await api('POST', '/subscriptions/activate', {
    token: client.token,
    body: { code: stolenCode },
  });
  check(
    'Le client peut activer le code rattache a son dossier',
    clientActivation.status === 201,
    clientActivation.data?.subscription?.status,
  );

  const unknownCode = await api('POST', '/subscriptions/activate', {
    token: client.token,
    body: { code: 'ZG-AAAA-BBBB' },
  });
  check('Code inconnu refuse (404)', unknownCode.status === 404, String(unknownCode.status));

  const inactiveBefore = await api('GET', `/subscriptions/clients/${clientId}`, { token: operator.token });
  check(
    'Frais d installation absents au renouvellement',
    inactiveBefore.data.history[0].isFirstSubscription === false,
    String(inactiveBefore.data.history[0]?.isFirstSubscription),
  );

  // ---------------------------------------------------------------------------
  console.log('\n4. Renouvellement et jours restants');
  // ---------------------------------------------------------------------------
  const before = await api('GET', `/subscriptions/clients/${clientId}`, { token: operator.token });
  const endsBefore = new Date(before.data.expiresAt);

  const extension = await api('POST', '/subscriptions', {
    token: operator.token,
    body: { clientId, durationDays: 180, method: 'ORANGE_MONEY', operatorReference: `OM-${Date.now()}` },
  });
  const extensionStart = new Date(extension.data.subscription.startsAt);
  check(
    'Un renouvellement anticipe ne fait pas perdre les jours restants',
    extensionStart.getTime() === endsBefore.getTime(),
    `${endsBefore.toISOString()} -> ${new Date(extension.data.subscription.endsAt).toISOString()}`,
  );
  check(
    'Duree de 180 jours appliquee',
    daysBetween(extension.data.subscription.startsAt, extension.data.subscription.endsAt) === 180,
  );
  check(
    'Remise appliquee sur la duree longue',
    Number(extension.data.subscription.discountUsd) > 0,
    `${extension.data.subscription.discountUsd} USD`,
  );

  // ---------------------------------------------------------------------------
  console.log('\n5. Annulation et securite');
  // ---------------------------------------------------------------------------
  const extra = await api('POST', '/subscriptions', {
    token: operator.token,
    body: { clientId, durationDays: 30, method: 'CASH_AGENCY', amountUsd: 20 },
  });
  const cancelled = await api('PATCH', `/subscriptions/${extra.data.subscription.id}/cancel`, {
    token: operator.token,
    body: { reason: 'Erreur de saisie du caissier' },
  });
  check('Code jamais active annulable', cancelled.status === 200 && cancelled.data?.status === 'CANCELLED');

  const activateCancelled = await api('POST', '/subscriptions/activate', {
    token: operator.token,
    body: { code: extra.data.subscription.code, clientId },
  });
  check('Code annule non activable (400)', activateCancelled.status === 400, String(activateCancelled.status));

  const cancelActivated = await api('PATCH', `/subscriptions/${issue.data.subscription.id}/cancel`, {
    token: operator.token,
    body: { reason: 'Tentative sur un code deja active' },
  });
  check('Code deja active non annulable (400)', cancelActivated.status === 400, String(cancelActivated.status));

  const anonymous = await api('GET', '/subscriptions');
  check('Liste des abonnements protegee par authentification (401)', anonymous.status === 401);

  const clientList = await api('GET', '/subscriptions', { token: client.token });
  check('Un client n accede pas au portefeuille global (403)', clientList.status === 403, String(clientList.status));

  const foreignClient = await api('GET', '/subscriptions/clients/00000000-0000-4000-8000-000000000000', {
    token: operator.token,
  });
  check('Client inconnu refuse (404)', foreignClient.status === 404, String(foreignClient.status));

  // ---------------------------------------------------------------------------
  console.log('\n6. Indicateurs de caisse');
  // ---------------------------------------------------------------------------
  const stats = await api('GET', '/subscriptions/stats?days=30', { token: director.token });
  check(
    'Indicateurs finances disponibles',
    stats.status === 200 && stats.data.revenueUsd > 0 && stats.data.payments >= 3,
    `${stats.data.revenueUsd} USD / ${stats.data.revenueCdf} CDF sur ${stats.data.payments} paiement(s)`,
  );
  check(
    'Repartition par moyen de paiement',
    (stats.data.byMethod ?? []).length >= 2 &&
      stats.data.byMethod.some((entry) => entry.method === 'CASH_AGENCY'),
    (stats.data.byMethod ?? []).map((entry) => `${entry.method}:${entry.count}`).join(', '),
  );
  check(
    'Clients actifs et expirants comptes',
    typeof stats.data.activeClients === 'number' && typeof stats.data.expiringSoon === 'number',
    `${stats.data.activeClients} actif(s), ${stats.data.expiringSoon} expirant(s)`,
  );

  const operatorStats = await api('GET', '/subscriptions/stats', { token: operator.token });
  check('Indicateurs finances ouverts au ZMC (perimetre)', operatorStats.status === 200);

  const clientStats = await api('GET', '/subscriptions/stats', { token: client.token });
  check('Indicateurs finances refuses au client (403)', clientStats.status === 403, String(clientStats.status));

  // ---------------------------------------------------------------------------
  console.log('\n7. Expiration automatique');
  // ---------------------------------------------------------------------------
  const forced = await api('POST', '/subscriptions/maintenance/expire-due', { token: director.token });
  check(
    'Watchdog d expiration execrable a la demande',
    forced.status === 201 && typeof forced.data?.clients === 'number',
    `${forced.data?.clients} client(s) restreint(s), ${forced.data?.codes} code(s) perime(s)`,
  );

  const stillActive = await api('GET', `/subscriptions/clients/${clientId}`, { token: operator.token });
  check(
    'Le client paye reste actif apres le passage du watchdog',
    stillActive.data.effectiveStatus === 'ACTIVE' && stillActive.data.restricted === false,
    `${stillActive.data.validity}`,
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
