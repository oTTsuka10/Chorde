/**
 * Deteccao de acordes a partir de uma janela curta de audio PCM (a mesma ideia do
 * processing/chords.py no backend, portada para JS): calcula a energia de cada uma das 12 classes
 * de nota (chroma) usando o algoritmo de Goertzel (mais leve que uma FFT completa para poucas
 * frequencias-alvo) e compara com 24 templates de triade (maior/menor) por similaridade de
 * cosseno.
 */
import { parseWav, base64ToBytes } from './wav';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function buildTemplates() {
  const templates = {};
  for (let i = 0; i < 12; i++) {
    const root = NOTE_NAMES[i];
    const major = new Array(12).fill(0);
    major[i] = 1; major[(i + 4) % 12] = 1; major[(i + 7) % 12] = 1;
    templates[root] = major;

    const minor = new Array(12).fill(0);
    minor[i] = 1; minor[(i + 3) % 12] = 1; minor[(i + 7) % 12] = 1;
    templates[root + 'm'] = minor;
  }
  return templates;
}

const TEMPLATES = buildTemplates();

/** Magnitude de uma frequencia-alvo em um bloco de amostras (algoritmo de Goertzel). */
function goertzelMagnitude(samples, sampleRate, targetFreq) {
  const n = samples.length;
  const k = Math.round((n * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

/** Energia de cada uma das 12 classes de nota, somando algumas oitavas (E2 ate ~G5). */
function computeChroma(samples, sampleRate) {
  const chroma = new Array(12).fill(0);
  const baseFreqs = [82.41, 87.31, 92.50, 98.00, 103.83, 110.00, 116.54, 123.47, 130.81, 138.59, 146.83, 155.56]; // E2..D#3
  const octaves = 4; // cobre aprox. E2 a D#6

  for (let note = 0; note < 12; note++) {
    let energy = 0;
    for (let oct = 0; oct < octaves; oct++) {
      const freq = baseFreqs[note] * 2 ** oct;
      if (freq > sampleRate / 2) break;
      energy += goertzelMagnitude(samples, sampleRate, freq);
    }
    chroma[note] = energy;
  }
  return chroma;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Retorna o acorde mais provavel (ex.: "G", "Am") e a confianca (0-1) para a janela de audio. */
export function detectChordFromWavBase64(base64Wav) {
  const bytes = base64ToBytes(base64Wav);
  const { sampleRate, samples } = parseWav(bytes);
  const chroma = computeChroma(samples, sampleRate);

  let best = 'N';
  let bestScore = -1;
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const score = cosineSimilarity(chroma, template);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  const silent = Math.max(...chroma) < 0.02;
  return { chord: silent ? 'N' : best, confidence: silent ? 0 : Math.max(0, bestScore) };
}
