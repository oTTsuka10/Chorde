/**
 * Parser minimo de arquivo WAV (PCM 16-bit) a partir de um Uint8Array.
 * Suficiente para ler as janelas curtas gravadas pelo detector de acordes por microfone.
 */
export function parseWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, false) !== 0x52494646 /* 'RIFF' */) {
    throw new Error('arquivo nao e um WAV valido (RIFF ausente)');
  }

  let offset = 12; // pula RIFF header (ChunkID, ChunkSize, Format)
  let sampleRate = 44100;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1) throw new Error('bloco de dados (data) nao encontrado no WAV');
  if (bitsPerSample !== 16) throw new Error(`formato nao suportado: ${bitsPerSample} bits por amostra`);

  const sampleCount = Math.floor(dataSize / 2 / numChannels);
  const mono = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
      sum += view.getInt16(sampleOffset, true) / 32768;
    }
    mono[i] = sum / numChannels;
  }

  return { sampleRate, samples: mono };
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Converte uma string base64 (como retornada pelo expo-file-system) em Uint8Array, sem depender
 * de atob/Buffer (nem sempre disponiveis no runtime do React Native). */
export function base64ToBytes(base64) {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = Math.floor((clean.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bitsFilled = 0;

  for (let i = 0; i < clean.length; i++) {
    const value = BASE64_CHARS.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsFilled += 6;
    if (bitsFilled >= 8) {
      bitsFilled -= 8;
      bytes[byteIndex++] = (buffer >> bitsFilled) & 0xff;
    }
  }

  return bytes;
}
