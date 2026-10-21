const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { randomUUID } = require('crypto');

const db = require('./db');
const { runAnalysis } = require('./processWorker');
const { searchLyrics, fetchLyricsText } = require('./lyricsService');
const { alignLyricsToChords } = require('./lyricsAlign');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(STORAGE_DIR, 'tmp') });

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Envia um audio: se ja existir (mesmo hash), reaproveita a cifra sem reprocessar nem duplicar
// o arquivo no servidor.
app.post('/songs/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo de audio obrigatorio (campo "audio")' });

  const hash = sha256File(req.file.path);
  const existing = db.prepare('SELECT * FROM songs WHERE hash = ?').get(hash);

  if (existing) {
    fs.unlink(req.file.path, () => {});
    return res.status(200).json(toPublic(existing));
  }

  const id = randomUUID();
  const ext = path.extname(req.file.originalname) || '.mp3';
  const finalPath = path.join(STORAGE_DIR, `${hash}${ext}`);
  fs.renameSync(req.file.path, finalPath);

  const title = req.body.title || path.basename(req.file.originalname, ext);

  db.prepare(
    'INSERT INTO songs (id, hash, title, file_path, status) VALUES (?, ?, ?, ?, ?)'
  ).run(id, hash, title, finalPath, 'processing');

  runAnalysis(id, finalPath);

  const created = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
  res.status(201).json(toPublic(created));
});

app.get('/songs', (req, res) => {
  const rows = db.prepare('SELECT * FROM songs ORDER BY created_at DESC').all();
  res.json(rows.map(toPublic));
});

app.get('/songs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  res.json(toPublic(row));
});

app.get('/songs/:id/pdf', (req, res) => {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const cifra = JSON.parse(row.cifra_json);
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${row.title}.pdf"`);
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
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '"url" obrigatoria' });

  try {
    const lyricsText = await fetchLyricsText(url);
    const cifra = JSON.parse(row.cifra_json);
    const lines = alignLyricsToChords(lyricsText, cifra.words || [], cifra.chords || []);
    const updatedCifra = { ...cifra, lines, lyricsSource: url };

    db.prepare('UPDATE songs SET lyrics_text = ?, lyrics_source_url = ?, cifra_json = ? WHERE id = ?')
      .run(lyricsText, url, JSON.stringify(updatedCifra), row.id);

    const updated = db.prepare('SELECT * FROM songs WHERE id = ?').get(row.id);
    res.json(toPublic(updated));
  } catch (e) {
    console.error('[lyrics/import]', e.message);
    res.status(502).json({ error: 'falha ao importar a letra dessa URL' });
  }
});

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

app.listen(PORT, () => console.log(`Chorde backend rodando em http://localhost:${PORT}`));
