#!/usr/bin/env node
/**
 * Test de fumee de bout en bout du socle Zengo Account.
 *
 * Pre-requis : base demarree (npm run db:pg:start), seed applique (npm run seed)
 * et API lancee (npm run start:prod).
 *
 *   node scripts/smoke-test.mjs [baseUrl]
 */
import crypto from 'node:crypto';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const ADMIN = { identifier: 'admin@zengo.cd', password: 'Zengo@2026' };
const AGENCY_MANAGER = { identifier: 'chef.kinshasa@zengo.cd', password: 'Zengo@2026' };

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

const api = async (method, path, { token, body, raw } = {}) => {
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
  return raw ? { status: response.status, data, text } : { status: response.status, data };
};

const login = async (credentials, extra = {}) => {
  const { status, data } = await api('POST', '/auth/login', { body: { ...credentials, ...extra } });
  if (status !== 200 && status !== 401) {
    throw new Error(
      `Connexion inattendue pour ${credentials.identifier} (${status} ${JSON.stringify(data).slice(0, 120)})`,
    );
  }
  return { status, data };
};

// --- TOTP (RFC 6238, SHA-1, 6 chiffres, pas de 30 s) -------------------------
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Decode = (value) => {
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of value.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const totp = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000;
  return String(code).padStart(6, '0');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return true;
    } catch {
      // API pas encore prete
    }
    await sleep(1_000);
  }
  return false;
}

async function main() {
  console.log(`\nTest de fumee Zengo Account -> ${BASE}\n`);

  if (!(await waitForApi())) {
    console.error("L'API ne repond pas. Lancez `npm run start:prod`.");
    process.exit(1);
  }

  // 1. Sante -----------------------------------------------------------------
  console.log('1. Sante & securite de base');
  const health = await api('GET', '/health');
  check('GET /health', health.status === 200 && health.data.status === 'ok', health.data?.database);
  const anonymous = await api('GET', '/clients');
  check('Route protegee sans token -> 401', anonymous.status === 401);
  const badLogin = await login({ identifier: ADMIN.identifier, password: 'mauvais-mot-de-passe' });
  check('Mot de passe invalide -> 401', badLogin.status === 401);

  // 2. Authentification ------------------------------------------------------
  console.log('\n2. Authentification');
  const adminLogin = await login(ADMIN);
  check('Connexion super admin', adminLogin.status === 200 && adminLogin.data.accessToken.length > 20);
  check('Refresh token emis', typeof adminLogin.data.refreshToken === 'string' && adminLogin.data.refreshToken.length > 40);
  check('Role SUPER_ADMIN', adminLogin.data.user.roles.includes('SUPER_ADMIN'));
  const token = adminLogin.data.accessToken;

  const managerLogin = await login(AGENCY_MANAGER);
  check('Connexion chef d agence', managerLogin.status === 200, managerLogin.data.user?.roles?.join(','));
  const managerToken = managerLogin.data.accessToken;

  // 3. Rotation des refresh tokens -------------------------------------------
  console.log('\n3. Rotation et revocation des refresh tokens');
  const rotated = await api('POST', '/auth/refresh', { body: { refreshToken: adminLogin.data.refreshToken } });
  check('Rotation du refresh token -> 200', rotated.status === 200 && rotated.data.refreshToken !== adminLogin.data.refreshToken);
  const reused = await api('POST', '/auth/refresh', { body: { refreshToken: adminLogin.data.refreshToken } });
  check('Reutilisation du token revoque -> 401', reused.status === 401, reused.data?.code);

  // Le token d'acces reste valide : on continue avec lui.
  const me = await api('GET', '/users/me', { token });
  check('GET /users/me', me.status === 200 && me.data.email === ADMIN.identifier);

  // 4. Perimetre multi-tenant ------------------------------------------------
  console.log('\n4. Perimetre multi-tenant (scoping hierarchique)');
  const allOrganizations = await api('GET', '/organizations?limit=100', { token });
  const scopedOrganizations = await api('GET', '/organizations?limit=100', { token: managerToken });
  check(
    'Super admin voit toutes les organisations',
    allOrganizations.status === 200 && allOrganizations.data.total >= 10,
    `total=${allOrganizations.data?.total}`,
  );
  check(
    'Chef d agence voit uniquement son sous-arbre',
    scopedOrganizations.status === 200 && scopedOrganizations.data.total === 4,
    `total=${scopedOrganizations.data?.total}`,
  );
  const auditForbidden = await api('GET', '/audit-logs', { token: managerToken });
  check('Journal d audit interdit au chef d agence -> 403', auditForbidden.status === 403);

  // 5. Tarification ----------------------------------------------------------
  console.log('\n5. Tarification (regles du cahier des charges)');
  const tariffs = await api('GET', '/tariff-groups', { token });
  check('4 groupes tarifaires', tariffs.status === 200 && tariffs.data.total === 4, `total=${tariffs.data?.total}`);
  const standard = tariffs.data.items.find((item) => item.code === 'STANDARD');
  check('Standard : 150$ + 22$/mois', Number(standard.registrationFeeUsd) === 150 && Number(standard.monthlyFeeUsd) === 22);

  const preview3 = await api('POST', '/tariff-groups/price-preview', {
    token,
    body: { tariffGroupId: standard.id, sosButtonCount: 3 },
  });
  check('3 boutons SOS -> 160 USD', preview3.data?.totalKitUsd === 160, `${preview3.data?.totalKitUsd} USD`);
  check('Conversion CDF (2800)', preview3.data?.totalKitCdf === 448_000, `${preview3.data?.totalKitCdf} CDF`);
  check('Abonnement CDF', preview3.data?.totalMonthlyCdf === 61_600, `${preview3.data?.totalMonthlyCdf} CDF/mois`);

  const preview10 = await api('POST', '/tariff-groups/price-preview', {
    token,
    body: { tariffGroupId: standard.id, sosButtonCount: 10 },
  });
  check('10 boutons SOS -> 195 USD', preview10.data?.totalKitUsd === 195, `${preview10.data?.totalKitUsd} USD`);
  const previewTooMany = await api('POST', '/tariff-groups/price-preview', {
    token,
    body: { tariffGroupId: standard.id, sosButtonCount: 11 },
  });
  check('Au-dela du maximum -> 409', previewTooMany.status === 409);

  // 6. Cycle de vie d'un compte client --------------------------------------
  console.log('\n6. Cycle de vie d un compte client (creation -> installation -> activation)');
  const agency = scopedOrganizations.data.items.find((item) => item.type === 'AGENCY');
  const suffix = Date.now().toString().slice(-7);
  const created = await api('POST', '/clients', {
    token: managerToken,
    body: {
      fullName: 'Smoke Testeur',
      primaryPhone: `+2439${suffix}`,
      preferredLanguage: 'sw',
      address: '99 avenue du Test',
      city: 'Kinshasa',
      organizationId: agency.id,
      tariffGroupId: standard.id,
      sosButtonCount: 2,
      loginEmail: `smoke.${suffix}@zengo.cd`,
    },
  });
  check('Creation du compte client -> 201', created.status === 201, created.data?.client?.zengoId);
  check(
    'ID Zengo format ZGO-<CODE>-<NNNNNN>',
    /^ZGO-[A-Z0-9]+-\d{6}$/.test(created.data?.client?.zengoId ?? ''),
    created.data?.client?.zengoId,
  );
  check('Mot de passe temporaire genere', typeof created.data?.temporaryPassword === 'string');
  const clientId = created.data.client.id;
  const clientToken = (await login({ identifier: `smoke.${suffix}@zengo.cd`, password: created.data.temporaryPassword }))
    .data?.accessToken;
  check('Connexion du client avec le mot de passe temporaire', Boolean(clientToken));

  const myProfile = await api('GET', '/clients/me', { token: clientToken });
  check('Le client consulte sa propre fiche', myProfile.status === 200 && myProfile.data.id === clientId);
  const otherClient = await api('GET', '/clients', { token: clientToken });
  check('Le client ne peut pas lister les comptes -> 403', otherClient.status === 403);

  // Dispositif de test puis installation
  const device = await api('POST', '/devices', {
    token,
    body: {
      serialNumber: `SMOKE${suffix}`,
      organizationId: agency.id,
      alarmPhoneNumber: '+243810000009',
    },
  });
  check('Provisionnement du dispositif -> 201', device.status === 201, device.data?.serialNumber);
  const installation = await api('POST', `/clients/${clientId}/installation`, {
    token,
    body: { deviceId: device.data.id },
  });
  check(
    'Installation : compte active et dispositif lie',
    installation.status === 201 || installation.status === 200
      ? installation.data?.status === 'ACTIVE' && installation.data?.device?.id === device.data.id
      : false,
    `statut=${installation.data?.status}`,
  );

  const pricing = await api('GET', `/clients/${clientId}/pricing`, { token });
  check('Tarification du kit (2 boutons -> 155 USD)', pricing.data?.totalKitUsd === 155, `${pricing.data?.totalKitUsd} USD`);

  const patched = await api('PATCH', `/clients/${clientId}`, {
    token,
    body: { city: 'Kinshasa / Limete', notes: 'Mise a jour de test' },
  });
  check(
    'PATCH client : le dispositif reste rattache',
    patched.status === 200 && patched.data.device?.id === device.data.id && patched.data.city === 'Kinshasa / Limete',
    `device=${patched.data?.device?.id ?? 'null'}`,
  );

  // 7. Dispositifs -----------------------------------------------------------
  console.log('\n7. Dispositifs SafAlert & sous-appareils');
  const subDevices = await api('POST', `/devices/${device.data.id}/sub-devices`, {
    token,
    body: {
      subDevices: [
        { id: '00000040', name: 'Porte cave', areaName: 'Cave', code: 'DC' },
        { id: '00411400', name: 'PIR garage', areaName: 'Garage', code: 'PIR' },
      ],
    },
  });
  check('Declaration des sous-appareils', subDevices.status === 201 && subDevices.data.length === 2);
  const listed = await api('GET', `/devices/${device.data.id}/sub-devices`, { token });
  check(
    'Etat des sous-appareils decode',
    listed.status === 200 && listed.data.every((item) => item.decodedState.open === false),
  );
  const blockedArm = await api('POST', `/devices/${device.data.id}/arm-mode`, {
    token: managerToken,
    body: { mode: 1 },
  });
  check('Armement par le chef d agence -> 201', blockedArm.status === 201 && blockedArm.data.command.type === 'ARM_MODE');
  check('Mode d armement persiste (away=1)', blockedArm.data.device.armMode === 1);
  const tokenRegeneration = await api('POST', `/devices/${device.data.id}/token`, { token: managerToken });
  check('Regeneration de token reservee a la direction technique -> 403', tokenRegeneration.status === 403);

  // 8. Double authentification ----------------------------------------------
  console.log('\n8. Double authentification (TOTP)');
  const qaEmail = `qa.${suffix}@zengo.cd`;
  const qaPassword = 'QaSmoke@2026';
  const qaUser = await api('POST', '/users', {
    token,
    body: {
      email: qaEmail,
      firstName: 'QA',
      lastName: 'Smoke',
      password: qaPassword,
    },
  });
  check('Creation d un utilisateur de test -> 201', qaUser.status === 201, qaUser.data?.user?.id);
  const qaToken = (await login({ identifier: qaEmail, password: qaPassword })).data?.accessToken;
  const setup = await api('POST', '/auth/2fa/setup', { token: qaToken });
  check('Activation 2FA : secret + QR code', setup.status === 201 && Boolean(setup.data?.secret) && String(setup.data?.qrCodeDataUrl).startsWith('data:image/png;base64,'));
  const loginBeforeConfirm = await login({ identifier: qaEmail, password: qaPassword });
  check('2FA non encore confirmee : connexion classique acceptee', loginBeforeConfirm.status === 200);
  const confirm = await api('POST', '/auth/2fa/confirm', { token: qaToken, body: { code: totp(setup.data.secret) } });
  check('Confirmation avec code TOTP valide', confirm.status === 200 && confirm.data.enabled === true);
  const loginWithoutCode = await login({ identifier: qaEmail, password: qaPassword });
  check(
    'Connexion sans code 2FA -> 401 (code requis)',
    loginWithoutCode.status === 401 && loginWithoutCode.data?.code === 'TWO_FACTOR_REQUIRED',
    loginWithoutCode.data?.code,
  );
  const loginWithCode = await login({ identifier: qaEmail, password: qaPassword }, { totpCode: totp(setup.data.secret) });
  check('Connexion avec code TOTP', loginWithCode.status === 200);
  const wrongCode = await login({ identifier: qaEmail, password: qaPassword }, { totpCode: '000000' });
  check('Code TOTP invalide -> 401', wrongCode.status === 401);
  const disable = await api('POST', '/auth/2fa/disable', { token: qaToken, body: { password: qaPassword } });
  check('Desactivation de la 2FA', disable.status === 200 && disable.data.enabled === false);

  // 9. Journal d'audit -------------------------------------------------------
  console.log('\n9. Journal d audit');
  const auditLogs = await api('GET', '/audit-logs?limit=100', { token });
  check('Journal accessible a la direction', auditLogs.status === 200 && auditLogs.data.total > 0, `${auditLogs.data?.total} entrees`);
  const actions = new Set((auditLogs.data?.items ?? []).map((item) => item.action));
  check('Actions tracees (LOGIN, CREATE...)', actions.has('LOGIN') && actions.has('CREATE'));
  const secretsLeaked = JSON.stringify(auditLogs.data).match(/jmJzdWI|passwordHash|"[A-Za-z0-9+/]{40,}"/i);
  check('Aucun secret en clair dans le journal', secretsLeaked === null);

  // 10. Consultation des organisations ---------------------------------------
  console.log('\n10. Hierarchie organisationnelle');
  const region = allOrganizations.data.items.find((item) => item.type === 'REGION');
  const descendants = await api('GET', `/organizations/${region.id}/descendants`, { token });
  check(
    'Descendants d une zone regionale',
    descendants.status === 200 && descendants.data.some((item) => item.type === 'AGENCY'),
    `${descendants.data?.length} organisations`,
  );

  console.log(`\n============================================================`);
  console.log(` Resultat : ${passed} reussis, ${failed} echecs`);
  console.log('============================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test de fumee interrompu :', error);
  process.exit(1);
});
