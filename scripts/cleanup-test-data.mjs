#!/usr/bin/env node
/**
 * Nettoyage des donnees laissees par les tests automatises.
 *
 * Les suites de fumee (`npm run smoke*`) creent des comptes jetables
 * (`smoke.*@zengo.cd`, `qa.*@zengo.cd`) et des alertes de demonstration. Ils
 * faussent les compteurs des tableaux de bord et encombrent la file du ZMC.
 *
 * Ce script ne touche PAS aux comptes de reference du seed ni aux clients de
 * demonstration (`client.demo@zengo.cd`, marie.ilunga, joseph.mukendi).
 *
 *   node scripts/cleanup-test-data.mjs              # clients de test + alertes
 *   node scripts/cleanup-test-data.mjs --clients    # uniquement les comptes de test
 *   node scripts/cleanup-test-data.mjs --alerts     # uniquement les alertes
 *   node scripts/cleanup-test-data.mjs --dry-run    # affiche ce qui serait supprime
 *
 * Pre-requis : base de donnees demarree (`npm run db:pg:start`).
 */
import { Client } from 'pg';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const onlyClients = args.has('--clients');
const onlyAlerts = args.has('--alerts');
const doClients = onlyClients || (!onlyClients && !onlyAlerts);
const doAlerts = onlyAlerts || (!onlyClients && !onlyAlerts);

/** Comptes utilisateurs a conserver, quoi qu'il arrive. */
const KEEP_EMAILS = [
  'admin@zengo.cd',
  'plateforme@zengo.cd',
  'technique@zengo.cd',
  'daf@zengo.cd',
  'compta@zengo.cd',
  'qualite@zengo.cd',
  'sante@zengo.cd',
  'zone.lubumbashi@zengo.cd',
  'chef.kinshasa@zengo.cd',
  'technicien@zengo.cd',
  'operateur.zmc@zengo.cd',
  'station.pompiers@zengo.cd',
  'client.demo@zengo.cd',
];

const client = new Client({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 55432),
  user: process.env.DB_USERNAME ?? 'zengo',
  password: process.env.DB_PASSWORD ?? 'zengo',
  database: process.env.DB_NAME ?? 'zengo_account',
});

/** Comptes crees par les tests : prefixe smoke./qa. ou nom fictif. */
const TEST_EMAIL_PATTERN = '^(smoke\\.|qa\\.)|@example\\.cd$';
const TEST_CLIENT_NAME = 'Smoke Testeur';/** Kits enregistres par les suites de fumee (voir scripts/smoke-*.mjs). */
const TEST_DEVICE_SERIAL_PREFIX = 'SMOKE';
const count = async (sql, params = []) => {
  const { rows } = await client.query(sql, params);
  return Number(rows[0]?.total ?? 0);
};

await client.connect();

console.log(`\nNettoyage des donnees de test${dryRun ? ' (simulation, rien ne sera supprime)' : ''}`);

// ---------------------------------------------------------------------------
// 1. Dossiers clients de test
// ---------------------------------------------------------------------------
if (doClients) {
  const testClients = await client.query(
    `select cp.id, cp.zengo_id, coalesce(cp.full_name, '') as full_name, u.email
     from client_profiles cp
     left join users u on u.id = cp.user_id
     where cp.deleted_at is null
       and (
         coalesce(cp.full_name, '') = $1
         or (u.email is not null and u.email !~ $3 and (u.email like 'smoke.%' or u.email like 'qa.%'))
       )
       and (u.email is null or not (u.email = any($2)))`,
    [TEST_CLIENT_NAME, KEEP_EMAILS, TEST_EMAIL_PATTERN],
  );

  const testUsers = await client.query(
    `select id, email from users
     where deleted_at is null
       and (email like 'smoke.%' or email like 'qa.%')
       and not (email = any($1))`,
    [KEEP_EMAILS],
  );

  console.log(`\n1. Comptes de test`);
  console.log(`   dossiers clients a supprimer : ${testClients.rowCount}`);
  for (const row of testClients.rows.slice(0, 6)) {
    console.log(`     - ${row.zengo_id} ${row.full_name} ${row.email ? `(${row.email})` : ''}`);
  }
  if (testClients.rowCount > 6) console.log(`     … et ${testClients.rowCount - 6} autre(s)`);
  console.log(`   comptes utilisateurs a supprimer : ${testUsers.rowCount}`);

  if (!dryRun) {
    await client.query('begin');
    try {
      // Les abonnements, paiements, mesures, consentements, demandes de soin et
      // mutations partent en cascade avec le dossier client.
      const deletedClients = await client.query(
        `delete from client_profiles where id = any($1::uuid[])`,
        [testClients.rows.map((row) => row.id)],
      );
      const deletedUsers = await client.query(
        `delete from users where id = any($1::uuid[])`,
        [testUsers.rows.map((row) => row.id)],
      );
      // Kits crees par les suites de fumee : le dossier client a disparu, le
      // dispositif resterait orphelin et polluerait les ecrans de selection.
      const deletedDevices = await client.query(`delete from devices where serial_number ilike $1`, [
        `${TEST_DEVICE_SERIAL_PREFIX}%`,
      ]);
      await client.query('commit');
      console.log(
        `   -> supprime : ${deletedClients.rowCount} dossier(s) client, ${deletedUsers.rowCount} compte(s) utilisateur, ` +
          `${deletedDevices.rowCount} dispositif(s) de test`,
      );
    } catch (error) {
      await client.query('rollback');
      console.error('   Echec du nettoyage des comptes :', error.message);
      process.exitCode = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Alertes, interventions et messages issus des tests
// ---------------------------------------------------------------------------
if (doAlerts) {
  const alerts = await count('select count(*)::int as total from alerts');
  const interventions = await count('select count(*)::int as total from interventions');
  const calls = await count('select count(*)::int as total from voice_calls');
  const sms = await count('select count(*)::int as total from sms_messages');
  const positions = await count('select count(*)::int as total from team_positions where intervention_id is not null');

  console.log(`\n2. Alertes et interventions`);
  console.log(`   alertes                       : ${alerts}`);
  console.log(`   interventions                 : ${interventions}`);
  console.log(`   appels vocaux                 : ${calls}`);
  console.log(`   messages SMS                  : ${sms}`);
  console.log(`   positions GPS rattachees      : ${positions}`);

  if (!dryRun) {
    await client.query('begin');
    try {
      // `alerts` porte les suppressions en cascade : affectations, chronologie,
      // appels vocaux, SMS, interventions et rapports d'intervention.
      await client.query('delete from team_positions where intervention_id is not null');
      const deletedAlerts = await client.query('delete from alerts');
      await client.query('commit');
      console.log(`   -> supprime : ${deletedAlerts.rowCount} alerte(s) et tout leur dossier`);
    } catch (error) {
      await client.query('rollback');
      console.error("Echec du nettoyage des alertes :", error.message);
      process.exitCode = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Etat final
// ---------------------------------------------------------------------------
const remaining = await client.query(
  `select u.email, coalesce(string_agg(distinct uo.role::text, ', '), '-') as roles
   from users u
   left join user_organizations uo on uo.user_id = u.id
   where u.deleted_at is null
   group by u.email
   order by u.email`,
);
const clientsLeft = await count('select count(*)::int as total from client_profiles where deleted_at is null');
const alertsLeft = await count('select count(*)::int as total from alerts');

console.log(`\n${dryRun ? 'Etat actuel (inchange)' : 'Etat apres nettoyage'} : ${remaining.rowCount} compte(s) utilisateur, ${clientsLeft} dossier(s) client, ${alertsLeft} alerte(s)`);
for (const row of remaining.rows) console.log(`   ${row.email.padEnd(30)} ${row.roles}`);
console.log('');

await client.end();
