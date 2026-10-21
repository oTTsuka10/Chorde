"""Ponto de entrada do processamento: recebe o caminho de um audio, detecta acordes + letra
e imprime no stdout (ultima linha) o JSON final da cifra. Chamado pelo backend Node via
child_process (veja backend/processWorker.js).
"""
import sys
import json
import traceback

import librosa

from chords import detect_chords


def transcribe_lyrics(audio_path):
    """Transcreve a letra com tempos usando Whisper. Retorna lista de segmentos
    {start, end, text, words:[{start,end,word}]}. Se o Whisper falhar, retorna lista vazia.
    """
    try:
        import whisper
        model = whisper.load_model('base')
        result = model.transcribe(audio_path, word_timestamps=True)
        segments = []
        for seg in result.get('segments', []):
            words = [
                {'start': w['start'], 'end': w['end'], 'word': w['word'].strip()}
                for w in seg.get('words', [])
                if w.get('word', '').strip()
            ]
            segments.append({
                'start': seg['start'],
                'end': seg['end'],
                'text': seg['text'].strip(),
                'words': words,
            })
        return segments
    except Exception:
        sys.stderr.write('aviso: transcricao de letra indisponivel: ' + traceback.format_exc() + '\n')
        return []


def chord_active_at(chords, t):
    active = None
    for c in chords:
        if c['time'] <= t:
            active = c['chord']
        else:
            break
    return active


def build_lines(chords, lyric_segments):
    """Monta linhas no estilo cifra: uma linha de acordes posicionados por cima de cada linha
    de letra, inserindo o simbolo do acorde no ponto (em caracteres) onde ele muda.
    """
    lines = []
    last_chord_shown = None
    for seg in lyric_segments:
        lyric_line = seg['text']
        words = seg['words'] or [{'start': seg['start'], 'end': seg['end'], 'word': lyric_line}]
        chord_positions = []
        cursor = 0
        for w in words:
            idx = lyric_line.find(w['word'], cursor)
            if idx == -1:
                idx = cursor
            chord_here = chord_active_at(chords, w['start'])
            if chord_here and chord_here != last_chord_shown:
                chord_positions.append((idx, chord_here))
                last_chord_shown = chord_here
            cursor = idx + len(w['word'])

        chord_line = [' '] * max(len(lyric_line), 1)
        for idx, chord in chord_positions:
            chord_str = f'[{chord}]'
            chord_line[idx:idx] = list(chord_str)
        lines.append({'chordLine': ''.join(chord_line), 'lyricLine': lyric_line})

    if not lyric_segments and chords:
        chord_line = '  '.join(f"[{c['chord']}]" for c in chords)
        lines.append({'chordLine': chord_line, 'lyricLine': '(letra nao identificada)'})

    return lines


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'uso: analyze.py <arquivo_de_audio>'}))
        sys.exit(1)

    audio_path = sys.argv[1]
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    chords = detect_chords(y, sr)
    lyric_segments = transcribe_lyrics(audio_path)
    lines = build_lines(chords, lyric_segments)
    words = [w for seg in lyric_segments for w in seg['words']]

    output = {
        'duration': duration,
        'chords': chords,
        'lyrics': [{'time': s['start'], 'text': s['text']} for s in lyric_segments],
        'words': words,
        'lines': lines,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == '__main__':
    main()
