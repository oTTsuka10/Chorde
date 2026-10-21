/**
 * Realinha uma letra "oficial" (vinda do letras.com.br, sem tempos) com os tempos de palavra que
 * o Whisper detectou no audio, para manter os acordes posicionados corretamente sobre a letra
 * correta. Como nao ha garantia de correspondencia 1:1 entre as palavras transcritas e as da letra
 * oficial, usamos um mapeamento proporcional (posicao relativa da palavra no texto) em vez de um
 * alinhamento exato palavra-a-palavra — e uma aproximacao razoavel para uso em cifra, nao uma
 * transcricao forense.
 */

function chordActiveAt(chords, t) {
  let active = null;
  for (const c of chords) {
    if (c.time <= t) active = c.chord;
    else break;
  }
  return active;
}

function alignLyricsToChords(officialText, recognizedWords, chords) {
  const officialLines = officialText.split('\n').map((l) => l.trim());
  const flatRecognized = recognizedWords.filter((w) => w.word && w.word.trim());

  if (flatRecognized.length === 0) {
    const chordLine = chords.map((c) => `[${c.chord}]`).join('  ');
    return officialLines.map((line, idx) => ({
      chordLine: idx === 0 ? chordLine : '',
      lyricLine: line,
    }));
  }

  const totalWords = officialLines.reduce((acc, l) => acc + (l ? l.split(/\s+/).length : 0), 0) || 1;
  let globalWordIndex = 0;
  let lastChordShown = null;
  const lines = [];

  for (const line of officialLines) {
    if (!line) {
      lines.push({ chordLine: '', lyricLine: '' });
      continue;
    }
    const words = line.split(/\s+/);
    let chordLineChars = Array.from({ length: line.length }, () => ' ');
    let cursor = 0;

    for (const word of words) {
      const idx = line.indexOf(word, cursor);
      const pos = idx === -1 ? cursor : idx;

      const ratio = globalWordIndex / totalWords;
      const recognizedIdx = Math.min(flatRecognized.length - 1, Math.floor(ratio * flatRecognized.length));
      const t = flatRecognized[recognizedIdx].start;
      const chordHere = chordActiveAt(chords, t);

      if (chordHere && chordHere !== lastChordShown) {
        const chordStr = `[${chordHere}]`;
        chordLineChars.splice(pos, 0, ...chordStr.split(''));
        lastChordShown = chordHere;
      }

      cursor = pos + word.length;
      globalWordIndex += 1;
    }

    lines.push({ chordLine: chordLineChars.join(''), lyricLine: line });
  }

  return lines;
}

module.exports = { alignLyricsToChords };
