const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'chorde.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  title TEXT,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- processing | ready | error
  cifra_json TEXT,
  lyrics_text TEXT,
  lyrics_source_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// migracao leve para bancos criados antes da coluna de letras existir
const existingColumns = db.prepare("PRAGMA table_info(songs)").all().map((c) => c.name);
for (const [col, def] of [['lyrics_text', 'TEXT'], ['lyrics_source_url', 'TEXT']]) {
  if (!existingColumns.includes(col)) {
    db.exec(`ALTER TABLE songs ADD COLUMN ${col} ${def}`);
  }
}

module.exports = db;
