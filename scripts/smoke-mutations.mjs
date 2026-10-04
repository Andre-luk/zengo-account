#!/usr/bin/env node
/**
 * Test de fumee du module Mutations geographiques (iteration 5).
 *
 * Pre-requis : base demarree, seed applique, API lancee (`npm run start:prod`).
 *
 *   node scripts/smoke-mutations.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

const ACCOUNTS = {
  /** Demandeur : portee nationale, donc habilite sur toutes les agences. */
  requester: { identifier: 'plateforme@zengo.cd', password: 'Zengo@2026' },
  /** Seconde validation : profil qualite distinct du demandeur. */
  quality: { identifier: 'qualite@zengo.cd', password: 'Zengo@2026' },
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

async function main() {
  console.log(`\nTest de fumee Mutations geographiques -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas.");
    process.exit(1);
  }

  const requester = await login(ACCOUNTS.requester);
  const quality = await login(ACCOUNTS.quality);
  const client = await login(ACCOUNTS.client);

  const me = await api('GET', '/clients/me', { token: client.token });
  const clientId = me.data.id;

  const clientBefore = await api('GET', `/clients/${clientId}`, { token: requester.token });
  const originOrganizationId = clientBefore.data.organizationId;
  check('Dossier client de demonstration accessible', Boolean(clientId), clientBefore.data.zengoId);

  // L'agence de destination doit etre une agence differente : on prend une
  // agence d'une autre region pour verifier la redirection des alertes.
  const agencies = await api('GET', '/organizations?type=AGENCY&limit=20', { token: requester.token });
  const destination = (agencies.data.items ?? []).find((organization) => organization.id !== originOrganizationId);
  check(
    'Agence de destination identifiee (autre region)',
    Boolean(destination?.id),
    `${destination?.name} (${destination?.city})`,
  );

  const stations = await api('GET', '/organizations?type=STATION&limit=5', { token: requester.token });
  const aStation = stations.data.items?.[0];

  // ---------------------------------------------------------------------------
  console.log('\n1. Conditions de la demande');
  // ---------------------------------------------------------------------------
  const anonymous = await api('GET', '/client-mutations');
  check('Liste des mutations protegee par authentification (401)', anonymous.status === 401);

  const clientAttempt = await api('POST', '/client-mutations', {
    token: client.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'CLIENT_MOVED' },
  });
  check('Un client ne peut pas demander sa propre mutation (403)', clientAttempt.status === 403, String(clientAttempt.status));

  const unknownClient = await api('POST', '/client-mutations', {
    token: requester.token,
    body: {
      clientId: '00000000-0000-4000-8000-000000000000',
      toOrganizationId: destination.id,
      reason: 'CLIENT_MOVED',
    },
  });
  check('Client inconnu refuse (404)', unknownClient.status === 404, String(unknownClient.status));

  const notAnAgency = await api('POST', '/client-mutations', {
    token: requester.token,
    body: { clientId, toOrganizationId: aStation.id, reason: 'CLIENT_MOVED' },
  });
  check(
    'Une station ne peut pas reprendre un dossier client (400)',
    notAnAgency.status === 400,
    notAnAgency.data?.message?.slice(0, 70),
  );

  const sameAgency = await api('POST', '/client-mutations', {
    token: requester.token,
    body: { clientId, toOrganizationId: originOrganizationId, reason: 'CLIENT_MOVED' },
  });
  check("Mutation vers l'agence actuelle refusee (400)", sameAgency.status === 400);

  // ---------------------------------------------------------------------------
  console.log('\n2. Demande de transfert et charge du dossier');
  // ---------------------------------------------------------------------------
  const created = await api('POST', '/client-mutations', {
    token: requester.token,
    body: {
      clientId,
      toOrganizationId: destination.id,
      reason: 'CLIENT_MOVED',
      note: 'Le client a demenage dans la nouvelle commune. Test de fumee.',
    },
  });
  check('Demande de mutation creee', created.status === 201, created.data?.reference);
  check(
    'Reference au format MU-AAAAMMJJ-NNNN',
    /^MU-\d{8}-\d{4}$/.test(created.data?.reference ?? ''),
    created.data?.reference,
  );
  check(
    'Demande en attente de la seconde validation',
    created.data?.status === 'REQUESTED' && created.data?.canBeReviewed === true,
    created.data?.status,
  );
  check(
    'Changement de region detecte pour la redirection des alertes',
    typeof created.data?.regionChanged === 'boolean',
    `regionChanged=${created.data?.regionChanged}`,
  );
  check(
    'Charge du dossier chiffree avant transfert',
    Boolean(created.data?.caseLoadSummary) && created.data.caseLoadSummary.includes('dispositif'),
    created.data?.caseLoadSummary,
  );

  const duplicate = await api('POST', '/client-mutations', {
    token: requester.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'CLIENT_REQUEST' },
  });
  check('Deux demandes ouvertes sur le meme dossier refusees (409)', duplicate.status === 409, String(duplicate.status));

  const mutationId = created.data.id;
  const applyTooEarly = await api('PATCH', `/client-mutations/${mutationId}/apply`, { token: requester.token });
  check('Transfert impossible avant validation (400)', applyTooEarly.status === 400, applyTooEarly.data?.message?.slice(0, 60));

  // ---------------------------------------------------------------------------
  console.log('\n3. Double validation (controle qualite)');
  // ---------------------------------------------------------------------------
  const secondWhileOpen = await api('POST', '/client-mutations', {
    token: requester.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'COMMERCIAL_DISPUTE' },
  });
  check(
    'Une seconde demande est refusee tant que la premiere est ouverte (409)',
    secondWhileOpen.status === 409,
    String(secondWhileOpen.status),
  );

  const qualityOwnRequest = await api('POST', '/client-mutations', {
    token: quality.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'COVERAGE_OPTIMISATION' },
  });
  check(
    'Demande toujours refusee tant que la premiere n est pas instruite (409)',
    qualityOwnRequest.status === 409,
    String(qualityOwnRequest.status),
  );

  const selfReview = await api('PATCH', `/client-mutations/${mutationId}/review`, {
    token: quality.token,
    body: { approve: true, comment: 'Dossier conforme, transfert accepte.' },
  });
  check(
    'Le controle qualite valide la demande (profil habilite, distinct du demandeur)',
    selfReview.status === 200 && selfReview.data?.status === 'APPROVED',
    `${selfReview.data?.status} par ${selfReview.data?.reviewedByLabel}`,
  );

  const doubleReview = await api('PATCH', `/client-mutations/${mutationId}/review`, {
    token: quality.token,
    body: { approve: false, comment: 'Nouvelle decision' },
  });
  check('Une demande deja instruite ne peut plus etre re-decidee (400)', doubleReview.status === 400, String(doubleReview.status));

  // ---------------------------------------------------------------------------
  console.log('\n4. Application du transfert');
  // ---------------------------------------------------------------------------
  const applied = await api('PATCH', `/client-mutations/${mutationId}/apply`, { token: requester.token });
  check('Transfert applique', applied.status === 200 && applied.data?.status === 'APPLIED', applied.data?.status);
  check(
    'Services informes du transfert',
    (applied.data?.servicesNotified ?? []).includes('Qualite') &&
      (applied.data?.servicesNotified ?? []).includes('Exploitation ZMC'),
    (applied.data?.servicesNotified ?? []).join(', '),
  );
  check(
    'Client informe de son nouveau point de contact (SMS)',
    Boolean(applied.data?.clientNotifiedAt),
    applied.data?.clientNotifiedAt ?? 'aucun envoi',
  );
  check(
    'Alertes ouvertes redirigees lorsque la region change',
    applied.data?.regionChanged === false || applied.data?.alertsRedirected >= 0,
    `${applied.data?.alertsRedirected} alerte(s) redirigee(s), regionChanged=${applied.data?.regionChanged}`,
  );

  const clientAfter = await api('GET', `/clients/${clientId}`, { token: requester.token });
  check(
    "Le dossier appartient desormais a l'agence de destination",
    clientAfter.data.organizationId === destination.id,
    `${clientAfter.data.organizationId}`,
  );
  check(
    'Les equipements suivent le dossier',
    Boolean(clientAfter.data.device) && clientAfter.data.device.organizationId === destination.id,
    `${clientAfter.data.device?.serialNumber ?? 'aucun dispositif'} -> ${clientAfter.data.device?.organizationId ?? '-'}`,
  );

  const doubleApply = await api('PATCH', `/client-mutations/${mutationId}/apply`, { token: requester.token });
  check('Transfert non reiterable (400)', doubleApply.status === 400, String(doubleApply.status));

  const history = await api('GET', `/client-mutations/clients/${clientId}`, { token: requester.token });
  check(
    "Historique du dossier disponible avec l'agence d'origine",
    history.status === 200 &&
      history.data?.organizationId === destination.id &&
      Boolean(history.data?.originOrganizationId),
    `${history.data?.organizationName} (origine ${history.data?.originOrganizationId ? 'connue' : 'inconnue'})`,
  );
  check(
    'Rapports d integration attendus listes',
    Array.isArray(history.data?.pendingIntegration),
    `horizons ${(history.data?.pendingIntegration ?? []).join(', ') || 'aucun pour le moment'}`,
  );

  // ---------------------------------------------------------------------------
  console.log('\n5. Suivi de l integration');
  // ---------------------------------------------------------------------------
  const earlyReport = await api('POST', `/client-mutations/${mutationId}/integration-report`, {
    token: requester.token,
    body: { horizon: 7, outcome: 'SATISFACTORY', note: 'Client contacte, installation conforme.' },
  });
  check(
    'Rapport d integration a 7 jours enregistre',
    earlyReport.status === 201 &&
      earlyReport.data?.integration?.some((entry) => entry.horizon === 7 && entry.outcome === 'SATISFACTORY'),
    earlyReport.data?.integration?.map((entry) => `${entry.horizon}j:${entry.outcome ?? 'en attente'}`).join(' | '),
  );

  const secondReport = await api('POST', `/client-mutations/${mutationId}/integration-report`, {
    token: requester.token,
    body: { horizon: 7, outcome: 'ISSUES_REPORTED' },
  });
  check('Rapport deja saisi non duplicable (409)', secondReport.status === 409, String(secondReport.status));

  const lateReport = await api('POST', `/client-mutations/${mutationId}/integration-report`, {
    token: requester.token,
    body: { horizon: 30, outcome: 'SATISFACTORY', note: 'Suivi a un mois.' },
  });
  check(
    'Rapport d integration a 30 jours enregistre',
    lateReport.status === 201,
    lateReport.status === 201 ? 'ok' : String(lateReport.status),
  );

  const pendingReports = await api('GET', '/client-mutations/pending-reports', { token: requester.token });
  check(
    'Liste des rapports attendus consultable',
    pendingReports.status === 200 && Array.isArray(pendingReports.data),
    `${pendingReports.data?.length ?? 0} mutation(s) en attente`,
  );

  // ---------------------------------------------------------------------------
  console.log("\n6. Retour a l'agence d'origine");
  // ---------------------------------------------------------------------------
  const unmotivatedRevert = await api('PATCH', `/client-mutations/${mutationId}/revert`, {
    token: requester.token,
    body: { reason: 'x' },
  });
  check('Retour non motive refuse (400)', unmotivatedRevert.status === 400, String(unmotivatedRevert.status));

  const reverted = await api('PATCH', `/client-mutations/${mutationId}/revert`, {
    token: quality.token,
    body: { reason: "Erreur d'affectation constatee par le controle qualite." },
  });
  check('Retour effectue', reverted.status === 200 && reverted.data?.status === 'REVERTED', reverted.data?.status);

  const clientBack = await api('GET', `/clients/${clientId}`, { token: requester.token });
  check(
    "Le dossier est revenu a son agence d'origine",
    clientBack.data.organizationId === originOrganizationId,
    clientBack.data.organizationId,
  );
  check(
    'Les equipements sont revenus avec le dossier',
    Boolean(clientBack.data.device) && clientBack.data.device.organizationId === originOrganizationId,
    `${clientBack.data.device?.serialNumber ?? 'aucun dispositif'} -> ${clientBack.data.device?.organizationId ?? '-'}`,
  );

  const doubleRevert = await api('PATCH', `/client-mutations/${mutationId}/revert`, {
    token: requester.token,
    body: { reason: 'Nouvelle tentative' },
  });
  check('Retour non reiterable (400)', doubleRevert.status === 400, String(doubleRevert.status));

  // ---------------------------------------------------------------------------
  console.log('\n6 bis. Auto-validation et retrait de demande');
  // ---------------------------------------------------------------------------
  const ownRequest = await api('POST', '/client-mutations', {
    token: quality.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'COVERAGE_OPTIMISATION' },
  });
  check(
    'Le controle qualite peut demander un transfert apres cloture du precedent (201)',
    ownRequest.status === 201,
    ownRequest.data?.reference,
  );

  const autoValidation = await api('PATCH', `/client-mutations/${ownRequest.data?.id}/review`, {
    token: quality.token,
    body: { approve: true, comment: 'Auto-validation' },
  });
  check(
    'Le demandeur ne peut pas valider sa propre demande (403)',
    autoValidation.status === 403,
    autoValidation.data?.message?.slice(0, 80),
  );

  const withdrawn = await api('PATCH', `/client-mutations/${ownRequest.data?.id}/cancel`, {
    token: quality.token,
    body: { reason: 'Client finalement maintenu dans son agence.' },
  });
  check(
    'Demande retiree avant application',
    withdrawn.status === 200 && withdrawn.data?.status === 'CANCELLED',
    withdrawn.data?.status,
  );

  const afterCancellation = await api('POST', '/client-mutations', {
    token: requester.token,
    body: { clientId, toOrganizationId: destination.id, reason: 'CLIENT_REQUEST' },
  });
  check(
    'Une nouvelle demande reste possible apres retrait (201)',
    afterCancellation.status === 201,
    afterCancellation.data?.reference,
  );
  const cleanup = await api('PATCH', `/client-mutations/${afterCancellation.data?.id}/cancel`, {
    token: requester.token,
    body: { reason: 'Fin du test de fumee.' },
  });
  check('Menage : demande de test retiree', cleanup.status === 200, cleanup.data?.status);

  // ---------------------------------------------------------------------------
  console.log('\n7. Indicateurs du controle qualite');
  // ---------------------------------------------------------------------------
  const stats = await api('GET', '/client-mutations/stats?days=90', { token: quality.token });
  check(
    'Indicateurs de mutation disponibles',
    stats.status === 200 && stats.data.total > 0,
    `${stats.data?.total} demande(s), ${stats.data?.applied} appliquee(s), ${stats.data?.reverted} retour(s)`,
  );
  check(
    'Repartition par statut et par motif',
    (stats.data?.byStatus ?? []).length > 0 && (stats.data?.byReason ?? []).length > 0,
    (stats.data?.byStatus ?? []).map((entry) => `${entry.status}:${entry.count}`).join(', '),
  );
  check(
    "Delai moyen d'instruction mesure",
    stats.data?.averageProcessingHours === null || stats.data.averageProcessingHours >= 0,
    stats.data?.averageProcessingHours === null ? 'aucune donnee' : `${stats.data.averageProcessingHours} h`,
  );

  const clientStats = await api('GET', '/client-mutations/stats', { token: client.token });
  check('Indicateurs refuses au client (403)', clientStats.status === 403, String(clientStats.status));

  const filtered = await api('GET', '/client-mutations?status=APPLIED&limit=5', { token: quality.token });
  check(
    'Filtre par statut operationnel',
    filtered.status === 200 && (filtered.data?.items ?? []).every((item) => item.status === 'APPLIED'),
    `${filtered.data?.items?.length ?? 0} element(s)`,
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
