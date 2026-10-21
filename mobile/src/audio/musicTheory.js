/**
 * Motor de teoria musical (independente de audio): dado o acorde atual e uma tonalidade estimada,
 * calcula a probabilidade do PROXIMO acorde com base nas tendencias classicas da harmonia tonal
 * (funcoes de tonica, subdominante e dominante). Nao e aprendizado de maquina treinado em musicas
 * reais — e um modelo teorico simples, pensado para orientar quem esta tocando de ouvido.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Tendencia classica de movimento entre funcoes harmonicas (soma 1 em cada linha).
const GROUP_TRANSITIONS = {
  tonic: { tonic: 0.25, subdominant: 0.40, dominant: 0.35 },
  subdominant: { tonic: 0.20, subdominant: 0.20, dominant: 0.60 },
  dominant: { tonic: 0.65, subdominant: 0.10, dominant: 0.25 },
};

// Graus diatonicos por modo, com o "peso" relativo de cada grau dentro da sua funcao.
const DEGREES_BY_MODE = {
  major: [
    { semitone: 0, quality: '', group: 'tonic', weight: 0.60 },   // I
    { semitone: 9, quality: 'm', group: 'tonic', weight: 0.25 },  // vi
    { semitone: 4, quality: 'm', group: 'tonic', weight: 0.15 },  // iii
    { semitone: 5, quality: '', group: 'subdominant', weight: 0.65 }, // IV
    { semitone: 2, quality: 'm', group: 'subdominant', weight: 0.35 }, // ii
    { semitone: 7, quality: '', group: 'dominant', weight: 0.75 }, // V
    { semitone: 11, quality: 'dim', group: 'dominant', weight: 0.25 }, // vii°
  ],
  minor: [
    { semitone: 0, quality: 'm', group: 'tonic', weight: 0.60 },  // i
    { semitone: 8, quality: '', group: 'tonic', weight: 0.25 },   // VI
    { semitone: 3, quality: '', group: 'tonic', weight: 0.15 },   // III
    { semitone: 5, quality: 'm', group: 'subdominant', weight: 0.60 }, // iv
    { semitone: 2, quality: 'dim', group: 'subdominant', weight: 0.40 }, // ii°
    { semitone: 7, quality: '', group: 'dominant', weight: 0.70 }, // V (dominante maior, uso comum)
    { semitone: 10, quality: '', group: 'dominant', weight: 0.30 }, // VII
  ],
};

function parseChordSymbol(symbol) {
  const match = /^([A-G]#?)(m|dim)?/.exec(symbol || '');
  if (!match) return null;
  return { root: match[1], quality: match[2] || '' };
}

function chordName(rootSemitone, quality) {
  const name = NOTE_NAMES[((rootSemitone % 12) + 12) % 12];
  return quality ? `${name}${quality}` : name;
}

/** Estima a tonalidade (tonica + modo) a partir do historico de acordes detectados, usando o
 * acorde mais frequente como aproximacao da tonica (heuristica simples, nao deteccao real de tom). */
export function estimateKey(chordHistory) {
  if (!chordHistory || chordHistory.length === 0) return { root: 'C', mode: 'major' };

  const counts = {};
  for (const chord of chordHistory) {
    counts[chord] = (counts[chord] || 0) + 1;
  }
  const mostFrequent = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const parsed = parseChordSymbol(mostFrequent);
  if (!parsed) return { root: 'C', mode: 'major' };

  return { root: parsed.root, mode: parsed.quality === 'm' ? 'minor' : 'major' };
}

/** Retorna um ranking (ordenado por probabilidade) dos proximos acordes mais prováveis, dado o
 * acorde atual e a tonalidade estimada. Ex.: [{chord:'C', probability:38}, {chord:'Am', probability:22}, ...] */
export function predictNextChords(currentChordSymbol, key, topN = 4) {
  const rootSemitone = NOTE_NAMES.indexOf(key.root);
  const degrees = DEGREES_BY_MODE[key.mode] || DEGREES_BY_MODE.major;

  const parsedCurrent = parseChordSymbol(currentChordSymbol);
  let currentGroup = 'tonic';
  if (parsedCurrent) {
    const relativeSemitone = (((NOTE_NAMES.indexOf(parsedCurrent.root) - rootSemitone) % 12) + 12) % 12;
    const match = degrees.find((d) => d.semitone === relativeSemitone && d.quality === parsedCurrent.quality);
    if (match) currentGroup = match.group;
  }

  const groupProbs = GROUP_TRANSITIONS[currentGroup];
  const results = [];

  for (const targetGroup of Object.keys(groupProbs)) {
    const groupDegrees = degrees.filter((d) => d.group === targetGroup);
    const weightSum = groupDegrees.reduce((acc, d) => acc + d.weight, 0);
    for (const degree of groupDegrees) {
      const chord = chordName(rootSemitone + degree.semitone, degree.quality);
      const probability = groupProbs[targetGroup] * (degree.weight / weightSum);
      results.push({ chord, probability });
    }
  }

  results.sort((a, b) => b.probability - a.probability);
  const top = results.slice(0, topN);
  const total = top.reduce((acc, r) => acc + r.probability, 0) || 1;

  return top.map((r) => ({ chord: r.chord, probability: Math.round((r.probability / total) * 100) }));
}
