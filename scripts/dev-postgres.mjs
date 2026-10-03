#!/usr/bin/env node
/**
 * PostgreSQL embarque pour le developpement local (aucun sudo / Docker requis).
 *
 *   npm run db:pg:start   # demarre le cluster et le laisse tourner
 *   npm run db:pg:stop    # arrete le cluster
 *
 * Les donnees sont conservees dans ./.pgdata (ignore par git).
 * La configuration doit correspondre a `.env` (DB_PORT=55432 par defaut).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATA_DIR = path.join(ROOT, '.pgdata');
const PID_FILE = path.join(DATA_DIR, '.devpg.pid');
const PORT = Number.parseInt(process.env.DEV_PG_PORT ?? '55432', 10);
const USER = process.env.DEV_PG_USER ?? 'zengo';
const PASSWORD = process.env.DEV_PG_PASSWORD ?? 'zengo';
const DATABASE = process.env.DEV_PG_DATABASE ?? 'zengo_account';

const log = (message) => console.log(`[dev-postgres] ${message}`);
const fail = (message) => {
  console.error(`[dev-postgres] ${message}`);
  process.exit(1);
};

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  fail('PostgreSQL refuse de tourner en root. Lancez cette commande avec un utilisateur normal.');
}

const isInitialised = () => existsSync(path.join(DATA_DIR, 'PG_VERSION'));

async function loadEmbeddedPostgres() {
  const module = await import('embedded-postgres');
  return module.default;
}

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number.parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  return Number.isNaN(pid) ? null : pid;
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  if (isRunning(readPid())) {
    log(`Un cluster est deja en cours d'execution (pid ${readPid()}).`);
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const EmbeddedPostgres = await loadEmbeddedPostgres();

  const postgres = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    authMethod: 'password',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (message) => process.stdout.write(`[postgres] ${message}\n`),
    onError: (error) => process.stderr.write(`[postgres] ${String(error)}\n`),
  });

  if (!isInitialised()) {
    log('Initialisation du cluster (premiere execution, cela peut prendre quelques secondes)...');
    await postgres.initialise();
  }

  log(`Demarrage sur 127.0.0.1:${PORT} (donnees : ${path.relative(ROOT, DATA_DIR)}/)...`);
  await postgres.start();

  try {
    await postgres.createDatabase(DATABASE);
    log(`Base "${DATABASE}" creee.`);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/already exists/i.test(message)) {
      log(`Base "${DATABASE}" deja presente ou non creee : ${message}`);
    }
  }

  writeFileSync(
    PID_FILE,
    String(process.pid),
    'utf8',
  );

  log('');
  log('PostgreSQL pret. Renseignez ces valeurs dans .env :');
  log(`  DB_HOST=127.0.0.1`);
  log(`  DB_PORT=${PORT}`);
  log(`  DB_USERNAME=${USER}`);
  log(`  DB_PASSWORD=${PASSWORD}`);
  log(`  DB_NAME=${DATABASE}`);
  log('');
  log('Arret : npm run db:pg:stop (Ctrl+C fonctionne aussi).');

  const shutdown = async (signal) => {
    log(`Signal ${signal} recu, arret du cluster...`);
    try {
      await postgres.stop();
    } catch (error) {
      console.error(`[dev-postgres] Erreur a l'arret : ${String(error)}`);
    }
    if (existsSync(PID_FILE)) rmSync(PID_FILE, { force: true });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Maintient le processus (et donc le cluster) en vie.
  setInterval(() => {}, 1 << 30);
}

function stop() {
  const pid = readPid();
  if (!isRunning(pid)) {
    log('Aucun cluster en cours d execution.');
    if (existsSync(PID_FILE)) rmSync(PID_FILE, { force: true });
    return;
  }
  process.kill(pid, 'SIGTERM');
  log(`Signal d'arret envoye au cluster (pid ${pid}).`);
}

const command = process.argv[2] ?? 'start';
if (command === 'start') {
  await start();
} else if (command === 'stop') {
  stop();
} else {
  fail(`Commande inconnue : "${command}". Utilisez "start" ou "stop".`);
}
