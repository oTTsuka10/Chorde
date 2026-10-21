import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { getSong } from '../api';

function buildPrintHtml(title, lines) {
  const body = lines
    .map((l) => `<pre class="chord">${escapeHtml(l.chordLine)}</pre><pre class="lyric">${escapeHtml(l.lyricLine)}</pre>`)
    .join('\n');
  return `<html><head><meta charset="utf-8" />
    <style>
      body { font-family: monospace; padding: 24px; }
      h1 { font-family: sans-serif; }
      .chord { color: #5b6cff; margin: 0; font-weight: bold; }
      .lyric { margin: 0 0 8px 0; }
    </style></head>
    <body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function SongScreen({ route, navigation }) {
  const { id } = route.params;
  const [song, setSong] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    async function poll() {
      const data = await getSong(id);
      setSong(data);
      if (data.status === 'processing') {
        pollRef.current = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => clearTimeout(pollRef.current);
  }, [id]);

  async function handlePrint() {
    if (!song?.cifra?.lines) return;
    const html = buildPrintHtml(song.title, song.cifra.lines);
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    } else {
      await Print.printAsync({ uri });
    }
  }

  if (!song) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (song.status === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.statusText}>Analisando acordes e letra...</Text>
      </View>
    );
  }

  if (song.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.statusText}>Nao foi possivel gerar a cifra.</Text>
        <Text style={styles.errorText}>{song.errorMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
        <Text style={styles.printText}>Imprimir / Exportar PDF</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.lyricsButton} onPress={() => navigation.navigate('LyricsSearch', { songId: id })}>
        <Text style={styles.printText}>Buscar letra oficial (letras.com.br)</Text>
      </TouchableOpacity>
      <ScrollView style={{ flex: 1 }}>
        {song.cifra.lines.map((line, idx) => (
          <View key={idx} style={{ marginBottom: 6 }}>
            <Text style={styles.chordLine}>{line.chordLine}</Text>
            <Text style={styles.lyricLine}>{line.lyricLine}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  center: { flex: 1, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center', padding: 20 },
  statusText: { color: '#ccc', marginTop: 12, fontSize: 15 },
  errorText: { color: '#e06666', marginTop: 8, fontSize: 12, textAlign: 'center' },
  printButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  lyricsButton: { backgroundColor: '#2e2e38', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  printText: { color: '#fff', fontWeight: '600' },
  chordLine: { color: '#5b6cff', fontFamily: 'monospace', fontWeight: 'bold' },
  lyricLine: { color: '#eee', fontFamily: 'monospace' },
});
