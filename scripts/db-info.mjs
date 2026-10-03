import pg from 'pg';

const client = new pg.Client({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 55432),
  user: process.env.DB_USERNAME ?? 'zengo',
  password: process.env.DB_PASSWORD ?? 'zengo',
  database: process.env.DB_NAME ?? 'zengo_account',
});

await client.connect();
const tables = await client.query(
  "select table_name from information_schema.tables where table_schema='public' order by 1",
);
console.log('tables:', tables.rows.map((row) => row.table_name).join(', ') || '(none)');

for (const table of [
  'organizations',
  'users',
  'user_organizations',
  'tariff_groups',
  'client_profiles',
  'devices',
  'sub_devices',
  'audit_logs',
]) {
  try {
    const result = await client.query(`select count(*)::int as n from ${table}`);
    console.log(`${table}: ${result.rows[0].n}`);
  } catch (error) {
    console.log(`${table}: ERR ${error.message}`);
  }
}

await client.end();
