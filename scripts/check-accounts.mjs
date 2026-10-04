#!/usr/bin/env node
/**
 * Verification des habilitations des comptes du seed, role par role.
 *
 *   node scripts/check-accounts.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const PWD = 'Zengo@2026';

const ACCOUNTS = [
  ['admin@zengo.cd', 'SUPER_ADMIN'],
  ['plateforme@zengo.cd', 'PLATFORM_MANAGER'],
  ['technique@zengo.cd', 'TECHNICAL_DIRECTOR'],
  ['daf@zengo.cd', 'DAF'],
  ['compta@zengo.cd', 'ACCOUNTANT'],
  ['qualite@zengo.cd', 'QUALITY_DIRECTOR'],
  ['sante@zengo.cd', 'HEALTH_STAFF'],
  ['zone.lubumbashi@zengo.cd', 'REGION_MANAGER'],
  ['chef.kinshasa@zengo.cd', 'AGENCY_MANAGER'],
  ['technicien@zengo.cd', 'TECHNICIAN'],
  ['operateur.zmc@zengo.cd', 'OPERATOR'],
  ['station.pompiers@zengo.cd', 'STATION_AGENT'],
  ['client.demo@zengo.cd', 'CLIENT'],
];

const api = async (method, path, token, body) => {
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

const login = async (email) => {
  const { status, data } = await api('POST', '/auth/login', null, {
    identifier: email,
    password: email.startsWith('client.') ? 'Client@2026' : PWD,
  });
  return status === 200 ? { token: data.accessToken, user: data.user } : null;
};

const TARIFF_ACTIONS = {
  DAF: { path: '/tariff-groups', body: { code: 'ZZ_TEST', name: 'Test', offerPack: 'STANDARD', monthlyFeeUsd: 1 } },
};

console.log(`\nVerification des comptes -> ${BASE}\n`);
const tokens = {};
for (const [email, role] of ACCOUNTS) {
  const session = await login(email);
  const roles = session?.user?.roles?.join(',') ?? '-';
  const scope = session?.user?.memberships?.map((m) => m.organizationName).join(' + ') ?? '-';
  console.log(
    `${(session ? 'OK ' : 'ECHEC').padEnd(6)} ${email.padEnd(30)} ${(roles || '-').padEnd(18)} ${scope}`,
  );
  if (!session) process.exitCode = 1;
  tokens[email] = session?.token;
}

const check = async (label, method, path, email, expected, body) => {
  const { status, data } = await api(method, path, tokens[email], body);
  const ok = Array.isArray(expected) ? expected.includes(status) : status === expected;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label.padEnd(62)} ${status}`);
  return data;
};

console.log('\n1. Tarification : la DAF modifie, la comptabilite consulte, le chef d agence ne modifie pas (403)');
const groups = await check('Liste des groupes tarifaires (DAF)', 'GET', '/tariff-groups', 'daf@zengo.cd', 200);
const groupId = groups?.items?.find((g) => g.code === 'STANDARD')?.id;
if (groupId) {
  await check(
    'Mise a jour du taux USD/CDF (DAF)',
    'PATCH',
    `/tariff-groups/${groupId}/exchange-rate`,
    'daf@zengo.cd',
    200,
    { exchangeRateUsdToCdf: 2800 },
  );
  await check(
    'Meme action par le chef d agence (refusee)',
    'PATCH',
    `/tariff-groups/${groupId}/exchange-rate`,
    'chef.kinshasa@zengo.cd',
    [403],
    { exchangeRateUsdToCdf: 3000 },
  );
}

console.log('\n2. Caisse : la comptabilite et la DAF lisent les encaissements');
await check('Journal des encaissements (comptabilite)', 'GET', '/subscriptions/payments?limit=5', 'compta@zengo.cd', 200);
await check('Rapprochement de caisse (DAF)', 'GET', '/subscriptions/payments/reconciliation', 'daf@zengo.cd', 200);
await check('Encaissement refuse au personnel de sante (403)', 'GET', '/subscriptions/payments', 'sante@zengo.cd', [403]);

console.log('\n3. Perimetre du chef de zone Lubumbashi : il ne voit que sa zone');
const lensOrgs = await check('Organisations visibles (chef de zone)', 'GET', '/organizations?limit=50', 'zone.lubumbashi@zengo.cd', 200);
const names = (lensOrgs?.items ?? []).map((o) => o.code);
const leaked = names.filter((code) => code.startsWith('KIN') || code.startsWith('KLZ-AG'));
console.log(`   ${names.length} organisation(s) : ${names.join(', ')}`);
console.log(`${leaked.length === 0 ? '  PASS' : '  FAIL'}  Aucune organisation de Kinshasa ni de Kolwezi dans son perimetre`);
const lensClients = await check('Clients visibles (chef de zone)', 'GET', '/clients?limit=50', 'zone.lubumbashi@zengo.cd', 200);
console.log(`   ${lensClients?.items?.length ?? 0} dossier(s) client visible(s)`);

console.log('\n4. Postes operationnels');
await check('File d alertes ouverte (operateur ZMC)', 'GET', '/alerts?openOnly=true', 'operateur.zmc@zengo.cd', 200);
await check('Missions (operateur ZMC)', 'GET', '/interventions', 'operateur.zmc@zengo.cd', 200);
await check('Dossier de sante du client (personnel de sante)', 'GET', `/clients/${lensClients?.items?.[0]?.id ?? '00000000-0000-4000-8000-000000000000'}`, 'sante@zengo.cd', 200);
await check('Journal d audit (admin)', 'GET', '/audit-logs?limit=5', 'admin@zengo.cd', 200);
await check('Journal d audit refuse a l operateur (403)', 'GET', '/audit-logs', 'operateur.zmc@zengo.cd', [403]);
await check('Mes propres alertes (client)', 'GET', '/alerts', 'client.demo@zengo.cd', 200);
await check('Creation d utilisateur refusee au client (403)', 'POST', '/users', 'client.demo@zengo.cd', [403], { email: 'x@y.cd' });

console.log('\nFin des verifications.\n');
