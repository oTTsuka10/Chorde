const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const storage = require('./storage');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const ANALYZE_SCRIPT = path.join(__dirname, '..', 'processing', 'analyze.py');

/**
 * Dispara a analise de audio (acordes + letra) em um processo Python separado.
 * O arquivo em tempPath e temporario (upload do multer); ao final ele e removido — a copia
 * permanente vive no storage (Supabase), salva no momento do upload.
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

      try {
        const result = JSON.parse(stdout.trim().split('\n').pop());
        await db.run('UPDATE songs SET status = ?, cifra_json = ? WHERE id = ?', ['ready', JSON.stringify(result), songId]);
      } catch (e) {
        console.error(`[analyze] saida invalida para ${songId}:`, e.message, stdout.slice(-500));
        await db.run('UPDATE songs SET status = ?, error_message = ? WHERE id = ?', ['error', 'saida invalida do processamento', songId]);
      }
    } catch (e) {
      console.error(`[analyze] erro ao persistir resultado de ${songId}:`, e.message);
    } finally {
      fs.unlink(tempPath, () => {});
    }
  });
}

module.exports = { runAnalysis };
