const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { randomUUID } = require('crypto');

const db = require('./db');
const storage = require('./storage');
const { runAnalysis } = require('./processWorker');
const { searchLyrics, fetchLyricsText } = require('./lyricsService');
const { alignLyricsToChords } = require('./lyricsAlign');

const PORT = process.env.PORT || 3000;
fs.mkdirSync(storage.STORAGE_DIR, { recursive: true });
fs.mkdirSync(path.join(storage.STORAGE_DIR, 'tmp'), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(storage.STORAGE_DIR, 'tmp') });

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function toPublic(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    errorMessage: row.error_message || null,
    cifra: row.cifra_json ? JSON.parse(row.cifra_json) : null,
  };
}

// Envia um audio: se ja existe cifra pronta (mesmo hash), reaproveita; se a analise falhou
// antes, reprossifica; se e novo, guarda no storage persistente e inicia a analise.
app.post('/songs/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo de audio obrigatorio (campo "audio")' });

  try {
    const hash = sha256File(req.file.path);
    const existing = await db.get('SELECT * FROM songs WHERE hash = ?', [hash]);

    if (existing && existing.status !== 'error') {
      fs.unlink(req.file.path, () => {});
      return res.status(200).json(toPublic(existing));
    }

    const id = existing ? existing.id : randomUUID();
    const ext = path.extname(req.file.originalname || '') || '.mp3';
    const key = `${hash}${ext}`;
    const title = req.body.title || path.basename(req.file.originalname || 'musica', ext);

    await storage.saveFile(req.file.path, key);

    if (existing) {
      // analise anterior falhou: reprossifica com o arquivo recem-enviado
      await db.run("UPDATE songs SET status = 'processing', error_message = NULL WHERE id = ?", [existing.id]);
      runAnalysis(existing.id, req.file.path);
      const row = await db.get('SELECT * FROM songs WHERE id = ?', [existing.id]);
      return res.status(202).json(toPublic(row));
    }

    await db.run(
      'INSERT INTO songs (id, hash, title, file_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, hash, title, key, 'processing', new Date().toISOString()]
    );

    runAnalysis(id, req.file.path);
    const created = await db.get('SELECT * FROM songs WHERE id = ?', [id]);
    res.status(201).json(toPublic(created));
  } catch (e) {
    console.error('[upload]', e.message);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(502).json({ error: e.message || 'falha ao salvar o audio' });
  }
});

app.get('/songs', async (req, res) => {
  const rows = await db.query('SELECT * FROM songs ORDER BY created_at DESC');
  res.json(rows.map(toPublic));
});

app.get('/songs/:id', async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  res.json(toPublic(row));
});

app.get('/songs/:id/pdf', async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const cifra = JSON.parse(row.cifra_json);
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.title)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(row.title, { align: 'center' });
  doc.moveDown();
  doc.font('Courier').fontSize(11);
  for (const line of cifra.lines) {
    if (line.chordLine.trim()) doc.text(line.chordLine);
    doc.text(line.lyricLine || ' ');
    doc.moveDown(0.3);
  }
  doc.end();
});

// Busca candidatos de letra no letras.com.br para o usuario escolher a versao correta.
app.get('/lyrics/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'parametro "q" obrigatorio' });
  try {
    const results = await searchLyrics(q);
    res.json(results);
  } catch (e) {
    console.error('[lyrics/search]', e.message);
    res.status(502).json({ error: 'falha ao buscar letras no letras.com.br' });
  }
});

// Importa a letra oficial de uma URL do letras.com.br e realinha com os acordes ja detectados.
app.post('/songs/:id/lyrics/import', async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '"url" obrigatoria' });

  try {
    const lyricsText = await fetchLyricsText(url);
    const cifra = JSON.parse(row.cifra_json);
    const lines = alignLyricsToChords(lyricsText, cifra.words || [], cifra.chords || []);
    const updatedCifra = { ...cifra, lines, lyricsSource: url };

    await db.run('UPDATE songs SET lyrics_text = ?, lyrics_source_url = ?, cifra_json = ? WHERE id = ?', [
      lyricsText, url, JSON.stringify(updatedCifra), row.id,
    ]);

    const updated = await db.get('SELECT * FROM songs WHERE id = ?', [row.id]);
    res.json(toPublic(updated));
  } catch (e) {
    console.error('[lyrics/import]', e.message);
    res.status(502).json({ error: 'falha ao importar a letra dessa URL' });
  }
});

async function start() {
  await db.init();
  app.listen(PORT, () => console.log(`Chorde backend rodando em http://localhost:${PORT} (db: ${db.usingPostgres ? 'Postgres' : 'SQLite local'}, storage: ${storage.usingSupabase ? 'Supabase' : 'disco local'})`));
}

start().catch((e) => {
  console.error('falha ao iniciar o backend:', e.message);
  process.exit(1);
});
