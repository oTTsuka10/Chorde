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
  const Database = require('better-sqlite3');
  sqlite = new Database(path.join(__dirname, 'chorde.db'));
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

async function init() {
  if (pgPool) {
    await pgPool.query(SCHEMA);
  } else {
    sqlite.exec(SCHEMA);
  }
  // musicas presas em "processing" de uma execucao anterior perderam o arquivo temporario
  // (reinicio do servico) — marcam erro para o usuario poder reenviar/reprocessar.
  await run("UPDATE songs SET status = 'error', error_message = 'processamento interrompido: o servico reiniciou. Envie o audio novamente.' WHERE status = 'processing'");
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
