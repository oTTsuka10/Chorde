/**
 * Armazenamento de arquivos de audio: Supabase Storage (S3-like, persistente) quando
 * SUPABASE_URL + SUPABASE_SERVICE_KEY estao definidos; disco local (efemero) como fallback
 * para desenvolvimento.
 *
 * SUPABASE_SERVICE_KEY e a chave "service_role" — SEGREDO. Configure apenas como variavel de
 * ambiente no Render, nunca no codigo.
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'audio';

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));

function contentTypeFor(key) {
  if (key.endsWith('.mp3')) return 'audio/mpeg';
  if (key.endsWith('.wav')) return 'audio/wav';
  if (key.endsWith('.m4a')) return 'audio/mp4';
  if (key.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

/** Envia o arquivo local para o storage persistente sob a chave "key". Resolve com a referencia. */
async function saveFile(localPath, key) {
  if (supabase) {
    const body = fs.readFileSync(localPath);
    const { error } = await supabase.storage.from(BUCKET).upload(key, body, {
      contentType: contentTypeFor(key),
      upsert: true,
    });
    if (error) {
      throw new Error(`falha ao salvar no bucket "${BUCKET}" (o bucket existe no Supabase?): ${error.message}`);
    }
    return `supabase://${BUCKET}/${key}`;
  }

  const dest = path.join(STORAGE_DIR, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(localPath, dest);
  return dest;
}

/** Baixa (ou copia) um arquivo do storage para um caminho local temporario. */
async function fetchToFile(key, destPath) {
  if (supabase) {
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error) throw new Error(`falha ao baixar "${key}" do bucket: ${error.message}`);
    fs.writeFileSync(destPath, Buffer.from(await data.arrayBuffer()));
    return destPath;
  }

  const src = path.join(STORAGE_DIR, key);
  if (!fs.existsSync(src)) throw new Error(`arquivo "${key}" nao existe no storage local`);
  fs.copyFileSync(src, destPath);
  return destPath;
}

module.exports = { saveFile, fetchToFile, usingSupabase: !!supabase, STORAGE_DIR };
