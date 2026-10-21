"""Deteccao de acordes por analise de croma + comparacao com templates (template matching).

Abordagem classica (nao precisa de modelo treinado): para cada janela de tempo calculamos o vetor
de croma (energia de cada uma das 12 classes de nota) e comparamos (similaridade de cosseno) com
24 templates de triade (12 maiores + 12 menores). O acorde escolhido e o de maior similaridade.
Em seguida suavizamos trocas de acorde muito curtas (ruido) para o resultado ficar legivel.
"""
import numpy as np
import librosa

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def _build_templates():
    templates = {}
    for i, root in enumerate(NOTE_NAMES):
        major = np.zeros(12)
        major[[i, (i + 4) % 12, (i + 7) % 12]] = 1
        templates[root] = major

        minor = np.zeros(12)
        minor[[i, (i + 3) % 12, (i + 7) % 12]] = 1
        templates[root + 'm'] = minor
    return templates

TEMPLATES = _build_templates()


def detect_chords(y, sr, min_segment_sec=1.0):
    """Retorna lista de {time, duration, chord} com os acordes detectados ao longo da faixa."""
    hop_length = 2048
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=hop_length)

    labels = []
    chord_names = list(TEMPLATES.keys())
    template_matrix = np.stack([TEMPLATES[c] for c in chord_names])

    for frame in chroma.T:
        norm = np.linalg.norm(frame)
        if norm < 1e-6:
            labels.append('N')
            continue
        frame_n = frame / norm
        sims = template_matrix @ frame_n / (np.linalg.norm(template_matrix, axis=1) + 1e-9)
        labels.append(chord_names[int(np.argmax(sims))])

    # agrupa frames consecutivos com o mesmo acorde em segmentos
    segments = []
    cur_label = labels[0]
    cur_start = times[0]
    for t, label in zip(times[1:], labels[1:]):
        if label != cur_label:
            segments.append({'time': float(cur_start), 'duration': float(t - cur_start), 'chord': cur_label})
            cur_label = label
            cur_start = t
    segments.append({'time': float(cur_start), 'duration': float(times[-1] - cur_start), 'chord': cur_label})

    # funde segmentos muito curtos (provavel ruido) com o segmento anterior
    merged = []
    for seg in segments:
        if merged and seg['duration'] < min_segment_sec and merged[-1]['chord'] != 'N':
            merged[-1]['duration'] += seg['duration']
        else:
            merged.append(seg)

    return [s for s in merged if s['chord'] != 'N']
