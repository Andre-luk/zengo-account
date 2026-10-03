import pg from 'pg';

/**
 * Reinitialise les donnees d'alerte (developpement uniquement).
 * Utilise par les campagnes de tests de fumee pour repartir d'une base saine.
 */
const client = new pg.Client({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 55432),
  user: process.env.DB_USERNAME ?? 'zengo',
  password: process.env.DB_PASSWORD ?? 'zengo',
  database: process.env.DB_NAME ?? 'zengo_account',
});

await client.connect();

const { rows } = await client.query(
  "select tablename from pg_tables where schemaname='public' and tablename in ('voice_calls','alert_events','alert_dispatches','alerts')",
);
console.log('tables:', rows.map((row) => row.tablename).join(', '));

await client.query('truncate table voice_calls, alert_events, alert_dispatches, alerts cascade');

const check = await client.query(
  'select (select count(*) from alerts) as alerts, (select count(*) from alert_dispatches) as dispatches, (select count(*) from voice_calls) as calls',
);
console.log('apres nettoyage :', check.rows[0]);

await client.end();
