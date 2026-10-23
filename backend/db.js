/**
 * Camada de dados: Postgres gerenciado (Supabase/Neon) quando DATABASE_URL esta definida,
 * SQLite local (backend/chorde.db) para desenvolvimento sem credenciais.
 * SQL escrito com placeholders "?" e traduzido para "$n" no Postgres.
 */
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
let pgPool = null;
let sqlite = null;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  const ssl = /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false };
  pgPool = new Pool({ connectionString: DATABASE_URL, ssl });
} else {
  try {
    const Database = require('better-sqlite3');
    sqlite = new Database(path.join(__dirname, 'chorde.db'));
  } catch (e) {
    throw new Error('DATABASE_URL nao definida e o fallback SQLite nao esta disponivel (better-sqlite3 nao instalado). Configure DATABASE_URL.');
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  title TEXT,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  cifra_json TEXT,
  lyrics_text TEXT,
  lyrics_source_url TEXT,
  error_message TEXT,
  created_at TEXT
);
`;

const SCHEMA_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  name TEXT,
  created_at TEXT
);
`;

async function addColumnIfMissing(tableName, columnName, def) {
  if (pgPool) {
    await pgPool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${def}`);
  } else {
    const cols = sqlite.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!cols.some(c => c.name === columnName)) {
      sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${def}`);
    }
  }
}

async function init() {
  if (pgPool) {
    await pgPool.query(SCHEMA);
    await pgPool.query(SCHEMA_USERS);
  } else {
    sqlite.exec(SCHEMA);
    sqlite.exec(SCHEMA_USERS);
  }
  await addColumnIfMissing('songs', 'approved', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('songs', 'uploaded_by', 'TEXT');
  // musicas presas em "processing" de uma execucao anterior perderam o arquivo temporario
  // (reinicio do servico) — marcam erro para o usuario poder reenviar/reprocessar.
  await run("UPDATE songs SET status = 'error', error_message = 'processamento interrompido: o servico reiniciou. Envie o audio novamente.' WHERE status = 'processing'");
  // Cria admin padrao se nao existir nenhum usuario
  const { hashPassword } = require('./auth');
  const adminCount = await get('SELECT COUNT(*) as cnt FROM users WHERE role = ?', ['admin']);
  if (adminCount && adminCount.cnt === 0) {
    const { randomUUID } = require('crypto');
    await run('INSERT INTO users (id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), 'admin@chorde.app', hashPassword('admin123'), 'admin', 'Administrador', new Date().toISOString()]);
    console.log('[db] Admin padrao criado: admin@chorde.app / admin123 (TROQUE A SENHA!)');
  }
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  if (pgPool) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function run(sql, params = []) {
  if (pgPool) {
    await pgPool.query(toPgSql(sql), params);
    return;
  }
  sqlite.prepare(sql).run(...params);
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { init, query, run, get, usingPostgres: !!pgPool };
