const { spawn } = require('child_process');
const path = require('path');
const db = require('./db');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const ANALYZE_SCRIPT = path.join(__dirname, '..', 'processing', 'analyze.py');

/**
 * Dispara a analise de audio (acordes + letra) em um processo Python separado.
 * Ao terminar, atualiza o registro da musica no banco (status + cifra ou erro).
 */
function runAnalysis(songId, filePath) {
  const child = spawn(PYTHON_BIN, [ANALYZE_SCRIPT, filePath], {
    cwd: path.join(__dirname, '..', 'processing'),
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`[analyze] falhou para ${songId}:`, stderr.slice(-2000));
      db.prepare('UPDATE songs SET status = ?, error_message = ? WHERE id = ?')
        .run('error', stderr.slice(-2000) || 'erro desconhecido no processamento', songId);
      return;
    }
    try {
      const result = JSON.parse(stdout.trim().split('\n').pop());
      db.prepare('UPDATE songs SET status = ?, cifra_json = ? WHERE id = ?')
        .run('ready', JSON.stringify(result), songId);
    } catch (e) {
      console.error(`[analyze] saida invalida para ${songId}:`, e.message, stdout.slice(-500));
      db.prepare('UPDATE songs SET status = ?, error_message = ? WHERE id = ?')
        .run('error', 'saida invalida do processamento', songId);
    }
  });
}

module.exports = { runAnalysis };
