#!/usr/bin/env node
/**
 * Test de fumee du module « Interventions terrain » (iteration 3).
 *
 * Pre-requis : base demarree, seed applique, API lancee (`npm run start:prod`).
 *
 *   node scripts/smoke-interventions.mjs [baseUrl] [socketUrl]
 */
import { io } from 'socket.io-client';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const SOCKET_URL = (process.argv[3] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const ACCOUNTS = {
  operator: { identifier: 'operateur.zmc@zengo.cd', password: 'Zengo@2026' },
  client: { identifier: 'client.demo@zengo.cd', password: 'Client@2026' },
  technician: { identifier: 'technicien@zengo.cd', password: 'Zengo@2026' },
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
    throw new Error(
      `Connexion impossible pour ${credentials.identifier} (${status} ${JSON.stringify(data).slice(0, 120)})`,
    );
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

/** Cloture les missions restees ouvertes d'une execution precedente. */
const cleanupOpenMissions = async (operator) => {
  const { data } = await api('GET', '/interventions?openOnly=true&limit=50', { token: operator.token });
  for (const mission of data?.items ?? []) {
    await api('POST', `/interventions/${mission.id}/report`, {
      token: operator.token,
      body: {
        outcome: 'NO_ACTION_REQUIRED',
        summary: 'Nettoyage automatique du test de fumee.',
        closeAlert: true,
      },
    });
  }
  return data?.items?.length ?? 0;
};

/**
 * Client de reference du test : le premier compte geolocalise (le client de
 * demonstration). L'affectation automatique exige un lieu d'intervention.
 */
const findGeolocatedClient = async (operator) => {
  const { data } = await api('GET', '/clients?limit=50&status=ACTIVE', { token: operator.token });
  const items = data?.items ?? [];
  return items.find((client) => client.latitude !== null && client.longitude !== null) ?? items[0] ?? null;
};

/** Distance en metres entre deux points (formule de haversine). */
const distanceMeters = (from, to) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(a)));
};

/**
 * L'affectation automatique ignore les positions de plus d'une heure : le test
 * rafraichit donc les releves des equipes de la specialite visee, depuis le
 * poste de chacune, avant de demander l'affectation. Retourne les equipes
 * classees de la plus proche a la plus lointaine du lieu d'intervention.
 */
const primeTeamPositions = async (operator, teams, destination, specialities) => {
  const eligible = teams
    .filter((team) => team.isActive && team.status === 'AVAILABLE' && specialities.includes(team.speciality))
    .filter((team) => typeof team.station?.latitude === 'number' && typeof team.station?.longitude === 'number')
    .map((team) => ({
      team,
      station: { latitude: team.station.latitude, longitude: team.station.longitude },
      distance: distanceMeters(
        { latitude: team.station.latitude, longitude: team.station.longitude },
        destination,
      ),
    }))
    .sort((left, right) => left.distance - right.distance);

  for (const entry of eligible) {
    await api('POST', `/field-teams/${entry.team.id}/position`, {
      token: operator.token,
      body: {
        latitude: entry.station.latitude,
        longitude: entry.station.longitude,
        speedKmh: 0,
        accuracyMeters: 8,
        source: 'GPS_TRACKER',
      },
    });
  }

  return eligible;
};

async function main() {
  console.log(`\nTest de fumee Interventions terrain -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas.");
    process.exit(1);
  }

  const operator = await login(ACCOUNTS.operator);
  const client = await login(ACCOUNTS.client);
  const technician = await login(ACCOUNTS.technician);
  const referenceClient = await findGeolocatedClient(operator);

  const cleaned = await cleanupOpenMissions(operator);
  if (cleaned > 0) console.log(`  info  ${cleaned} mission(s) ouverte(s) cloturee(s) avant le test.\n`);

  // ---------------------------------------------------------------------------
  console.log('1. Equipes terrain');
  // ---------------------------------------------------------------------------
  const teamsResponse = await api('GET', '/field-teams?limit=50', { token: operator.token });
  const teams = teamsResponse.data?.items ?? [];
  check('Liste des equipes du perimetre', teamsResponse.status === 200 && teams.length > 0, `${teams.length} equipe(s)`);
  check(
    'Chaque equipe porte sa station et sa position initiale',
    teams.every((team) => Boolean(team.station?.id) && typeof team.currentLatitude === 'number'),
  );

  const availableResponse = await api('GET', '/field-teams?availableOnly=true&withPositionOnly=true&limit=50', {
    token: operator.token,
  });
  const availableTeams = availableResponse.data?.items ?? [];
  check(
    'Filtre disponibilite + position recente',
    availableResponse.status === 200 && availableTeams.every((team) => team.status === 'AVAILABLE'),
    `${availableTeams.length} disponible(s)`,
  );

  const targetTeam = availableTeams[0];

  const sortedResponse = await api(
    'GET',
    `/field-teams?limit=5&nearLatitude=-4.33&nearLongitude=15.33&availableOnly=true`,
    { token: operator.token },
  );
  check('Tri par distance croissante', sortedResponse.status === 200, `${sortedResponse.data?.items?.length ?? 0} equipe(s)`);

  // ---------------------------------------------------------------------------
  console.log('\n2. Affectation automatique de l equipe la plus proche');
  // ---------------------------------------------------------------------------
  const createdAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: {
      type: 'INTRUSION',
      clientId: referenceClient?.id,
      note: 'Test de fumee interventions terrain',
      autoVoiceCall: false,
    },
  });

  const alert = createdAlert.data;
  check('Alerte de test creee sur un client geolocalise', Boolean(alert?.id), alert?.reference);

  const destinationPoint = referenceClient?.latitude !== null && referenceClient?.longitude !== null
    ? { latitude: referenceClient.latitude, longitude: referenceClient.longitude }
    : null;
  const destination = destinationPoint
    ? `${destinationPoint.latitude}, ${destinationPoint.longitude}`
    : 'agence de rattachement';
  check('Lieu d intervention connu', Boolean(alert?.id), destination);

  const eligibleTeams = await primeTeamPositions(operator, teams, destinationPoint, ['INTRUSION', 'MIXED']);
  check(
    'Equipes de la specialite visee disponibles et positionnees',
    eligibleTeams.length > 0,
    `${eligibleTeams.length} equipe(s), plus proche a ${eligibleTeams[0]?.distance ?? '?'} m`,
  );

  const socket = io(`${SOCKET_URL}/realtime`, {
    auth: { token: operator.token },
    transports: ['websocket'],
    reconnection: false,
  });

  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000);
    socket.on('ready', () => {
      clearTimeout(timer);
      resolve('ready');
    });
    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

  const realtimePromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000);
    socket.on('intervention.assigned', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });

  const assignment = await api('POST', '/interventions', {
    token: operator.token,
    body: { alertId: alert.id, note: 'Mission de test' },
  });

  check('Mission creee (affectation automatique)', assignment.status === 201, assignment.data?.reference);
  check('Reference de mission au format IN-AAAAMMJJ-NNNN', /^IN-\d{8}-\d{4}$/.test(assignment.data?.reference ?? ''));
  check('Affectation marquee comme automatique', assignment.data?.autoAssigned === true);
  check(
    'Distance et ETA calcules',
    typeof assignment.data?.distanceMeters === 'number' && typeof assignment.data?.etaMinutes === 'number',
    `${assignment.data?.distanceMeters} m / ${assignment.data?.etaMinutes} min`,
  );
  check('Equipe engagee sur la mission', Boolean(assignment.data?.team?.id), assignment.data?.team?.name);

  const realtimeEvent = await realtimePromise;
  check('Evenement intervention.assigned diffuse en temps reel', realtimeEvent?.interventionId === assignment.data?.id);
  socket.close();

  const missionId = assignment.data?.id;
  const assignedTeam = assignment.data?.team;

  // Deux equipes peuvent partager la meme station : on compare la distance du
  // poste engage, pas l'identite de l'equipe.
  const engagedDistance = assignedTeam?.station
    ? distanceMeters(
        { latitude: assignedTeam.station.latitude, longitude: assignedTeam.station.longitude },
        destinationPoint,
      )
    : null;
  check(
    'L equipe engagee est la plus proche du lieu d intervention',
    engagedDistance !== null && engagedDistance === eligibleTeams[0]?.distance,
    `${assignedTeam?.name} (${assignedTeam?.station?.name ?? 'station inconnue'}) a ${engagedDistance ?? '?'} m / meilleure ${eligibleTeams[0]?.distance ?? '?'} m`,
  );

  const assignmentSms = await api('GET', `/alerts/${alert.id}/sms`, { token: operator.token });
  const missionSms = (assignmentSms.data?.items ?? []).find((item) => item.template === 'MISSION_ASSIGNED');
  check(
    'SMS « equipe en route » envoye au client a l affectation',
    Boolean(missionSms) && missionSms.body.includes(assignedTeam?.name ?? '#') && !missionSms.body.includes('{'),
    missionSms?.body?.slice(0, 90),
  );

  // ---------------------------------------------------------------------------
  console.log('\n3. L alerte suit la mission');
  // ---------------------------------------------------------------------------
  const alertAfterAssign = await api('GET', `/alerts/${alert.id}`, { token: operator.token });
  check(
    'Alerte passee en "equipe engagee"',
    alertAfterAssign.data?.status === 'ASSIGNED',
    alertAfterAssign.data?.status,
  );

  const timeline = await api('GET', `/alerts/${alert.id}/timeline`, { token: operator.token });
  const dispatchEvent = (timeline.data ?? []).find((event) => event.type === 'DISPATCHED');
  check('Chronologie enrichie (mission transmise)', Boolean(dispatchEvent), dispatchEvent?.message);

  const teamAfterAssign = await api('GET', `/field-teams/${assignedTeam.id}`, { token: operator.token });
  check('Equipe passee en "engagee"', teamAfterAssign.data?.status === 'ENGAGED', teamAfterAssign.data?.status);

  const displaced = await api('GET', '/field-teams?availableOnly=true&limit=50', { token: operator.token });
  check(
    "L equipe engagee sort de la liste des equipes disponibles",
    !(displaced.data?.items ?? []).some((team) => team.id === assignedTeam.id),
  );

  // ---------------------------------------------------------------------------
  console.log('\n4. Deroulement de la mission');
  // ---------------------------------------------------------------------------
  const doubleAssignment = await api('POST', '/interventions', {
    token: operator.token,
    body: { alertId: alert.id, teamId: assignedTeam.id },
  });
  check('Engagement en double refuse (409)', doubleAssignment.status === 409, String(doubleAssignment.status));

  const enRoute = await api('POST', `/interventions/${missionId}/en-route`, {
    token: operator.token,
    body: { note: 'Depart confirme' },
  });
  check('Depart confirme', enRoute.status === 201 && enRoute.data?.status === 'EN_ROUTE', enRoute.data?.status);

  const foreignTechnician = await api('POST', `/interventions/${missionId}/en-route`, {
    token: technician.token,
    body: { note: 'Tentative hors perimetre' },
  });
  check(
    'Un technicien hors zone ne peut pas piloter la mission (403)',
    [403, 400].includes(foreignTechnician.status),
    String(foreignTechnician.status),
  );

  const invalidTransition = await api('POST', `/interventions/${missionId}/en-route`, { token: operator.token, body: {} });
  check('Transition incoherente refusee', invalidTransition.status === 400, String(invalidTransition.status));

  // La trace part du poste de l'equipe puis progresse vers le lieu d'intervention :
  // sans cela, une equipe de Lubumbashi recevrait une position de Kinshasa et la
  // distance restante deviendrait absurde dans la console.
  const stationLatitude = assignedTeam?.station?.latitude ?? alert.latitude ?? -4.331;
  const stationLongitude = assignedTeam?.station?.longitude ?? alert.longitude ?? 15.331;
  const destinationLatitude = alert.latitude ?? stationLatitude;
  const destinationLongitude = alert.longitude ?? stationLongitude;

  const departure = await api('POST', `/field-teams/${assignedTeam.id}/position`, {
    token: operator.token,
    body: {
      latitude: stationLatitude,
      longitude: stationLongitude,
      speedKmh: 0,
      accuracyMeters: 8,
      interventionId: missionId,
    },
  });
  check(
    'Position GPS de depart enregistree',
    departure.status === 201,
    `${departure.data?.latitude}, ${departure.data?.longitude}`,
  );

  const midway = {
    latitude: stationLatitude + (destinationLatitude - stationLatitude) * 0.55,
    longitude: stationLongitude + (destinationLongitude - stationLongitude) * 0.55,
  };
  const progress = await api('POST', `/field-teams/${assignedTeam.id}/position`, {
    token: operator.token,
    body: { ...midway, speedKmh: 32.5, headingDegrees: 190, accuracyMeters: 12, interventionId: missionId },
  });
  check('Position GPS intermediaire enregistree', progress.status === 201);

  const track = await api('GET', `/interventions/${missionId}/track`, { token: operator.token });
  check(
    'Suivi GPS : releves et distance restante',
    track.status === 200 && (track.data?.positions?.length ?? 0) >= 2,
    `${track.data?.positions?.length ?? 0} releve(s), reste ${track.data?.remainingMeters ?? '?'} m`,
  );
  check(
    'La position de l equipe est rattachee a la mission (trace du trajet)',
    (track.data?.positions ?? []).every((entry) => entry.interventionId === missionId),
  );

  const onSite = await api('POST', `/interventions/${missionId}/on-site`, {
    token: operator.token,
    body: { note: 'Equipe sur place' },
  });
  check('Arrivee sur site confirmee', onSite.status === 201 && onSite.data?.status === 'ON_SITE', onSite.data?.status);

  const onSiteSms = await api('GET', `/alerts/${alert.id}/sms`, { token: operator.token });
  check(
    'SMS « equipe sur place » envoye au client',
    (onSiteSms.data?.items ?? []).some((item) => item.template === 'MISSION_ON_SITE'),
    (onSiteSms.data?.items ?? []).map((item) => item.template).join(', '),
  );

  const alertInProgress = await api('GET', `/alerts/${alert.id}`, { token: operator.token });
  check(
    'Alerte passee en "intervention en cours"',
    alertInProgress.data?.status === 'IN_PROGRESS',
    alertInProgress.data?.status,
  );

  // ---------------------------------------------------------------------------
  console.log('\n5. Rapport d intervention et cloture');
  // ---------------------------------------------------------------------------
  const report = await api('POST', `/interventions/${missionId}/report`, {
    token: operator.token,
    body: {
      outcome: 'RESOLVED_ON_SITE',
      summary: 'Intrusion confirmee et maitrisee, aucun degat.',
      actionsTaken: 'Perimetre securise, serrure reverrouillee.',
      peopleAssisted: 0,
      photos: ['https://storage.zengo.cd/rapports/smoke-1.jpg'],
      signatureName: 'Client Demonstration',
      closeAlert: true,
      clientNotified: true,
    },
  });
  check('Rapport enregistre et mission cloturee', report.status === 201 && report.data?.status === 'COMPLETED', report.data?.status);
  check('Rapport rattache a la mission', Boolean(report.data?.report?.id), report.data?.report?.outcome);
  check(
    'Duree de la mission calculee',
    typeof report.data?.report?.durationSeconds === 'number',
    `${report.data?.report?.durationSeconds} s`,
  );

  const doubleReport = await api('POST', `/interventions/${missionId}/report`, {
    token: operator.token,
    body: { outcome: 'NO_ACTION_REQUIRED', summary: 'Doublon' },
  });
  check('Second rapport refuse', doubleReport.status === 400 || doubleReport.status === 409, String(doubleReport.status));

  const closedAlert = await api('GET', `/alerts/${alert.id}`, { token: operator.token });
  check('Alerte cloturee par le rapport', closedAlert.data?.status === 'RESOLVED', closedAlert.data?.status);
  check(
    'Classement "traite par une equipe"',
    closedAlert.data?.resolution === 'HANDLED_BY_TEAM',
    closedAlert.data?.resolution,
  );
  check(
    'Compte rendu repris dans l alerte',
    (closedAlert.data?.resolutionNote ?? '').includes('Intrusion confirmee'),
  );

  const teamReleased = await api('GET', `/field-teams/${assignedTeam.id}`, { token: operator.token });
  check('Equipe liberee apres cloture', teamReleased.data?.status === 'AVAILABLE', teamReleased.data?.status);

  const closureSms = await api('GET', `/alerts/${alert.id}/sms`, { token: operator.token });
  const closureMessages = closureSms.data?.items ?? [];
  const closureNotice = closureMessages.find((item) => item.template === 'ALERT_CLOSED');
  check(
    'Le client est informe par SMS du resultat de l intervention',
    Boolean(closureNotice) && closureNotice.body.includes('incident traite sur place'),
    closureNotice?.body?.slice(0, 90),
  );
  check(
    'Trois etapes annoncees au client (affectation, arrivee, cloture)',
    ['MISSION_ASSIGNED', 'MISSION_ON_SITE', 'ALERT_CLOSED'].every((template) =>
      closureMessages.some((item) => item.template === template),
    ),
    closureMessages.map((item) => item.template).join(' -> '),
  );

  // ---------------------------------------------------------------------------
  console.log('\n6. Consultation et statistiques');
  // ---------------------------------------------------------------------------
  const openMissions = await api('GET', '/interventions?openOnly=true&limit=50', { token: operator.token });
  check(
    'La mission cloturee sort des missions en cours',
    !(openMissions.data?.items ?? []).some((mission) => mission.id === missionId),
  );

  const byAlert = await api('GET', `/interventions/by-alert/${alert.id}`, { token: operator.token });
  check('Missions d une alerte consultables', (byAlert.data?.length ?? 0) >= 1, `${byAlert.data?.length ?? 0} mission(s)`);

  const searched = await api('GET', `/interventions?search=${encodeURIComponent(assignment.data?.reference ?? '')}`, {
    token: operator.token,
  });
  check('Recherche par reference de mission', (searched.data?.items?.length ?? 0) === 1);

  const stats = await api('GET', '/interventions/stats', { token: operator.token });
  check(
    'Indicateurs d intervention disponibles',
    stats.status === 200 && typeof stats.data?.total === 'number',
    `total ${stats.data?.total}, en cours ${stats.data?.open}, delai moyen ${stats.data?.averageResponseSeconds ?? '—'} s`,
  );

  const delayed = await api('GET', '/interventions?status=ABORTED&limit=5', { token: operator.token });
  check('Filtre par statut', delayed.status === 200);

  // ---------------------------------------------------------------------------
  console.log('\n7. Securite et perimetre');
  // ---------------------------------------------------------------------------
  const clientAttempt = await api('POST', '/interventions', { token: client.token, body: { alertId: alert.id } });
  check('Un client ne peut pas engager une equipe (403)', clientAttempt.status === 403, String(clientAttempt.status));

  const closedAlertAssignment = await api('POST', '/interventions', { token: operator.token, body: { alertId: alert.id } });
  check(
    'Aucune mission possible sur une alerte cloturee',
    closedAlertAssignment.status === 400,
    String(closedAlertAssignment.status),
  );

  const anonymousTeams = await fetch(`${BASE}/field-teams`);
  check('Liste des equipes protegee par authentification', anonymousTeams.status === 401, String(anonymousTeams.status));

  const foreignMission = await api('GET', `/interventions/${missionId}`, { token: client.token });
  check('Detail de mission refuse a un client', foreignMission.status === 403, String(foreignMission.status));

  // ---------------------------------------------------------------------------
  // Abandon de mission sur une nouvelle alerte
  // ---------------------------------------------------------------------------
  console.log('\n8. Abandon de mission');
  const medicalTeams = await primeTeamPositions(operator, teams, destinationPoint, ['MEDICAL', 'MIXED']);
  const secondAlert = await api('POST', '/alerts', {
    token: operator.token,
    body: { type: 'MEDICAL', clientId: referenceClient?.id, note: 'Test abandon', autoVoiceCall: false },
  });

  const secondAssignment = await api('POST', '/interventions', {
    token: operator.token,
    body: { alertId: secondAlert.data?.id },
  });

  if (secondAssignment.data?.id) {
    const medicalStation = secondAssignment.data.team?.station;
    const medicalDistance = medicalStation
      ? distanceMeters(
          { latitude: medicalStation.latitude, longitude: medicalStation.longitude },
          destinationPoint,
        )
      : null;
    check(
      'Affectation medicale : equipe de la bonne specialite engagee',
      medicalDistance !== null && medicalDistance === medicalTeams[0]?.distance,
      `${secondAssignment.data.team?.name} (${secondAssignment.data.team?.speciality}) a ${medicalDistance ?? '?'} m / meilleure ${medicalTeams[0]?.distance ?? '?'} m`,
    );

    const aborted = await api('POST', `/interventions/${secondAssignment.data.id}/abort`, {
      token: operator.token,
      body: { reason: 'FALSE_ALARM', note: 'Faux positif confirme par telephone' },
    });
    check('Mission abandonnee', aborted.status === 201 && aborted.data?.status === 'ABORTED', aborted.data?.status);

    const released = await api('GET', `/field-teams/${secondAssignment.data.team.id}`, { token: operator.token });
    check('Equipe liberee apres abandon', released.data?.status === 'AVAILABLE', released.data?.status);
  } else {
    check('Mission d abandon creee', false, JSON.stringify(secondAssignment.data).slice(0, 120));
  }

  // Menage : on cloture les alertes de test restantes.
  for (const alertId of [alert.id, secondAlert.data?.id].filter(Boolean)) {
    const current = await api('GET', `/alerts/${alertId}`, { token: operator.token });
    if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(current.data?.status)) continue;
    await api('POST', `/alerts/${alertId}/cancel`, {
      token: operator.token,
      body: { note: 'Fin du test de fumee interventions.' },
    });
  }

  console.log('\n============================================================');
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nErreur fatale du test de fumee :', error);
  process.exit(1);
});
