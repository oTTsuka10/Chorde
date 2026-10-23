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
const { hashPassword, verifyPassword, createToken, authMiddleware, optionalAuth, adminOnly } = require('./auth');

const PORT = process.env.PORT || 3000;
fs.mkdirSync(storage.STORAGE_DIR, { recursive: true });
fs.mkdirSync(path.join(storage.STORAGE_DIR, 'tmp'), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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
    approved: !!row.approved,
    uploadedBy: row.uploaded_by || null,
    createdAt: row.created_at,
    errorMessage: row.error_message || null,
    cifra: row.cifra_json ? JSON.parse(row.cifra_json) : null,
  };
}

// ===================== AUTH =====================

app.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatorios' });
  if (password.length < 4) return res.status(400).json({ error: 'senha muito curta (min 4 caracteres)' });
  try {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'email ja cadastrado' });
    const id = randomUUID();
    await db.run('INSERT INTO users (id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email.toLowerCase(), hashPassword(password), 'user', name || email.split('@')[0], new Date().toISOString()]);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ token: createToken(user), user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    console.error('[register]', e.message);
    res.status(500).json({ error: 'falha ao registrar' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatorios' });
  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'email ou senha incorretos' });
    }
    res.json({ token: createToken(user), user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    console.error('[login]', e.message);
    res.status(500).json({ error: 'falha ao logar' });
  }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
  const user = await db.get('SELECT id, email, role, name FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'usuario nao encontrado' });
  res.json({ user });
});

// ===================== SONGS (public + user) =====================

app.post('/songs/upload', authMiddleware, upload.single('audio'), async (req, res) => {
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
    const isAdmin = req.user.role === 'admin';

    await storage.saveFile(req.file.path, key);

    const extPath = req.file.path + ext;
    fs.renameSync(req.file.path, extPath);

    if (existing) {
      await db.run("UPDATE songs SET status = 'processing', error_message = NULL WHERE id = ?", [existing.id]);
      runAnalysis(existing.id, extPath);
      const row = await db.get('SELECT * FROM songs WHERE id = ?', [existing.id]);
      return res.status(202).json(toPublic(row));
    }

    await db.run(
      'INSERT INTO songs (id, hash, title, file_path, status, created_at, approved, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, hash, title, key, 'processing', new Date().toISOString(), isAdmin ? 1 : 0, req.user.email]
    );

    runAnalysis(id, extPath);
    const created = await db.get('SELECT * FROM songs WHERE id = ?', [id]);
    res.status(201).json(toPublic(created));
  } catch (e) {
    console.error('[upload]', e.message);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(502).json({ error: e.message || 'falha ao salvar o audio' });
  }
});

// Lista publica: apenas aprovadas. Se logado como admin, ve todas.
app.get('/songs', optionalAuth, async (req, res) => {
  let rows;
  if (req.user?.role === 'admin') {
    rows = await db.query('SELECT * FROM songs ORDER BY title COLLATE NOCASE ASC');
  } else if (req.user) {
    rows = await db.query('SELECT * FROM songs WHERE approved = 1 OR uploaded_by = ? ORDER BY title COLLATE NOCASE ASC', [req.user.email]);
  } else {
    rows = await db.query('SELECT * FROM songs WHERE approved = 1 ORDER BY title COLLATE NOCASE ASC');
  }
  res.json(rows.map(toPublic));
});

app.get('/songs/:id', optionalAuth, async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  // So mostra se aprovada, ou se o usuario e admin, ou se o usuario e o dono
  if (!row.approved && req.user?.role !== 'admin' && row.uploaded_by !== req.user?.email) {
    return res.status(403).json({ error: 'esta musica ainda nao foi aprovada' });
  }
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

// Troca um acorde especifico na cifra.
app.patch('/songs/:id/chord', authMiddleware, async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const { lineIndex, oldChord, newChord } = req.body;
  const cifra = JSON.parse(row.cifra_json);

  if (lineIndex < 0 || lineIndex >= cifra.lines.length) {
    return res.status(400).json({ error: 'indice de linha invalido' });
  }

  const line = cifra.lines[lineIndex];
  line.chordLine = line.chordLine.replace(`[${oldChord}]`, `[${newChord}]`);

  for (const c of cifra.chords) {
    if (c.chord === oldChord) { c.chord = newChord; break; }
  }

  await db.run('UPDATE songs SET cifra_json = ? WHERE id = ?', [JSON.stringify(cifra), row.id]);
  const updated = await db.get('SELECT * FROM songs WHERE id = ?', [row.id]);
  res.json(toPublic(updated));
});

// Move um acorde na cifra para esquerda ou direita (ajusta espacos).
app.patch('/songs/:id/chord/move', authMiddleware, async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  if (row.status !== 'ready') return res.status(409).json({ error: 'cifra ainda nao esta pronta' });

  const { lineIndex, chordIndex, direction } = req.body;
  const cifra = JSON.parse(row.cifra_json);

  if (lineIndex < 0 || lineIndex >= cifra.lines.length) {
    return res.status(400).json({ error: 'indice de linha invalido' });
  }

  const line = cifra.lines[lineIndex];
  const parts = line.chordLine.split(/(\[[^\]]+\])/).filter(p => p.length > 0);

  let chordCount = 0;
  const chordIndices = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('[')) { chordIndices.push(i); chordCount++; }
  }

  if (chordIndex < 0 || chordIndex >= chordCount) {
    return res.status(400).json({ error: 'indice de acorde invalido' });
  }

  const partIdx = chordIndices[chordIndex];

  if (direction === 'left') {
    if (partIdx > 0) {
      let spaces = parts[partIdx - 1];
      if (spaces.length > 0) {
        parts[partIdx - 1] = spaces.slice(0, -1);
      }
    }
  } else if (direction === 'right') {
    if (partIdx > 0) {
      parts[partIdx - 1] = (parts[partIdx - 1] || '') + ' ';
    } else {
      parts.unshift(' ');
    }
  }

  line.chordLine = parts.join('');
  await db.run('UPDATE songs SET cifra_json = ? WHERE id = ?', [JSON.stringify(cifra), row.id]);
  const updated = await db.get('SELECT * FROM songs WHERE id = ?', [row.id]);
  res.json(toPublic(updated));
});

// ===================== LYRICS =====================

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

app.post('/songs/:id/lyrics/import', authMiddleware, async (req, res) => {
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

// ===================== ADMIN =====================

app.get('/admin/songs', authMiddleware, adminOnly, async (req, res) => {
  const rows = await db.query('SELECT * FROM songs ORDER BY created_at DESC');
  res.json(rows.map(toPublic));
});

app.patch('/admin/songs/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  await db.run('UPDATE songs SET approved = 1 WHERE id = ?', [req.params.id]);
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  res.json(toPublic(row));
});

app.patch('/admin/songs/:id/reject', authMiddleware, adminOnly, async (req, res) => {
  await db.run('UPDATE songs SET approved = 0 WHERE id = ?', [req.params.id]);
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  res.json(toPublic(row));
});

app.delete('/admin/songs/:id', authMiddleware, adminOnly, async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  // Remove do storage se existir
  try { fs.unlinkSync(path.join(storage.STORAGE_DIR, row.file_path)); } catch {}
  await db.run('DELETE FROM songs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.patch('/admin/songs/:id', authMiddleware, adminOnly, async (req, res) => {
  const row = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'musica nao encontrada' });
  const { title, cifra } = req.body;
  if (title) await db.run('UPDATE songs SET title = ? WHERE id = ?', [title, req.params.id]);
  if (cifra) await db.run('UPDATE songs SET cifra_json = ? WHERE id = ?', [typeof cifra === 'string' ? cifra : JSON.stringify(cifra), req.params.id]);
  const updated = await db.get('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  res.json(toPublic(updated));
});

// ===================== ADMIN WEB UI =====================

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

async function start() {
  await db.init();
  app.listen(PORT, () => console.log(`Chorde backend rodando em http://localhost:${PORT} (db: ${db.usingPostgres ? 'Postgres' : 'SQLite local'}, storage: ${storage.usingSupabase ? 'Supabase' : 'disco local'})\nAdmin: http://localhost:${PORT}/admin`));
}

start().catch((e) => {
  console.error('falha ao iniciar o backend:', e.message);
  process.exit(1);
});
