import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import { getSong, API_URL } from '../api';

export default function SongScreen({ route, navigation }) {
  const { id } = route.params;
  const [song, setSong] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (cancelled) return;
      attempts += 1;
      try {
        const data = await getSong(id);
        if (cancelled) return;
        setSong(data);
        if (data.status === 'processing' && attempts < 100) {
          pollRef.current = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (cancelled) return;
        setSong({ id, status: 'error', errorMessage: 'musica nao encontrada no servidor. Tente enviar novamente.' });
      }
    }

    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [id]);

  async function handleExportPdf() {
    try {
      const fileUri = FileSystem.documentDirectory + 'cifra.pdf';
      const downloadRes = await FileSystem.downloadAsync(`${API_URL}/songs/${id}/pdf`, fileUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadRes.uri);
      } else {
        Alert.alert('PDF baixado', downloadRes.uri);
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao exportar PDF: ' + (e.message || e));
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
      <TouchableOpacity style={styles.printButton} onPress={handleExportPdf}>
        <Text style={styles.printText}>Exportar PDF</Text>
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
