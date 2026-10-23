const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const storage = require('./storage');
const { searchLyrics, fetchLyricsText } = require('./lyricsService');
const { alignLyricsToChords } = require('./lyricsAlign');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const ANALYZE_SCRIPT = path.join(__dirname, '..', 'processing', 'analyze.py');

/**
 * Dispara a analise de audio (acordes + letra) em um processo Python separado.
 * O arquivo em tempPath e temporario (upload do multer); ao final ele e removido — a copia
 * permanente vive no storage (Supabase), salva no momento do upload.
 * Apos a analise, tenta buscar a letra automaticamente no letras.com.br pelo titulo.
 */
function runAnalysis(songId, tempPath) {
  const child = spawn(PYTHON_BIN, [ANALYZE_SCRIPT, tempPath], {
    cwd: path.join(__dirname, '..', 'processing'),
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  child.on('close', async (code) => {
    try {
      const row = await db.get('SELECT * FROM songs WHERE id = ?', [songId]);
      if (!row) return;

      if (code !== 0) {
        const msg = stderr.slice(-2000) || 'erro desconhecido no processamento';
        console.error(`[analyze] falhou para ${songId}:`, msg);
        await db.run('UPDATE songs SET status = ?, error_message = ? WHERE id = ?', ['error', msg, songId]);
        return;
      }

      let result;
      try {
        result = JSON.parse(stdout.trim().split('\n').pop());
      } catch (e) {
        console.error(`[analyze] saida invalida para ${songId}:`, e.message, stdout.slice(-500));
        await db.run('UPDATE songs SET status = ?, error_message = ? WHERE id = ?', ['error', 'saida invalida do processamento', songId]);
        return;
      }

      // Salva o resultado inicial (acordes + letra do Whisper, se houver)
      await db.run('UPDATE songs SET status = ?, cifra_json = ? WHERE id = ?', ['ready', JSON.stringify(result), songId]);

      // Tenta buscar a letra automaticamente no letras.com.br pelo titulo da musica
      try {
        const title = row.title.replace(/\.\w+$/, '').replace(/-/g, ' ').trim();
        console.log(`[analyze] buscando letra para "${title}" no letras.com.br...`);
        const results = await searchLyrics(title);
        if (results.length > 0) {
          const best = results[0];
          const lyricsText = await fetchLyricsText(best.url);
          const cifra = { ...result };
          cifra.lines = alignLyricsToChords(lyricsText, cifra.words || [], cifra.chords || []);
          cifra.lyricsSource = best.url;
          await db.run('UPDATE songs SET lyrics_text = ?, lyrics_source_url = ?, cifra_json = ? WHERE id = ?',
            [lyricsText, best.url, JSON.stringify(cifra), songId]);
          console.log(`[analyze] letra encontrada e alinhada para ${songId}`);
        } else {
          console.log(`[analyze] nenhuma letra encontrada no letras.com.br para "${title}"`);
        }
      } catch (e) {
        console.error(`[analyze] auto-letras falhou para ${songId}:`, e.message);
      }
    } catch (e) {
      console.error(`[analyze] erro ao persistir resultado de ${songId}:`, e.message);
    } finally {
      fs.unlink(tempPath, () => {});
    }
  });
}

module.exports = { runAnalysis };

