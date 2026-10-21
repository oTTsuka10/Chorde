import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';

import { uploadSong, listSongs } from '../api';

export default function HomeScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSongs();
      setSongs(data);
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel carregar as musicas do servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadSongs(); }, [loadSongs]));

  async function handlePick() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
    if (result.canceled) return;
    const file = result.assets[0];
    setUploading(true);
    try {
      const song = await uploadSong(file.uri, file.name, file.mimeType, file.name);
      navigation.navigate('Song', { id: song.id });
      loadSongs();
    } catch (e) {
      Alert.alert('Erro', 'Falha ao enviar o audio para o servidor.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.uploadButton} onPress={handlePick} disabled={uploading}>
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.uploadText}>+ Adicionar musica (MP3)</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.micButton} onPress={() => navigation.navigate('MicChord')}>
        <Text style={styles.uploadText}>Detectar acordes pelo microfone</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Musicas disponiveis no servidor</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.songItem} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={styles.songTitle}>{item.title}</Text>
              <Text style={styles.songStatus}>
                {item.status === 'ready' ? 'Cifra pronta' : item.status === 'processing' ? 'Processando...' : 'Erro'}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma musica enviada ainda.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  uploadButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 10 },
  micButton: { backgroundColor: '#2e2e38', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 20 },
  uploadText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  sectionTitle: { color: '#aaa', marginBottom: 10, fontSize: 13, textTransform: 'uppercase' },
  songItem: { backgroundColor: '#1d1d22', borderRadius: 8, padding: 14, marginBottom: 10 },
  songTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
  songStatus: { color: '#8f8f99', fontSize: 12, marginTop: 4 },
  empty: { color: '#666', textAlign: 'center', marginTop: 30 },
});
