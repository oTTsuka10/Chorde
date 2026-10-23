import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import axios from 'axios';

const API_URL = 'http://192.168.1.172:3000';

// ===== API =====
async function uploadSong(fileUri, fileName, mimeType, title) {
  const res = await FileSystem.uploadAsync(`${API_URL}/songs/upload`, fileUri, {
    fieldName: 'audio',
    mimeType: mimeType || 'audio/mpeg',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    parameters: title ? { title } : {},
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`servidor: ${res.status}`);
  return JSON.parse(res.body);
}
async function listSongs() {
  const { data } = await axios.get(`${API_URL}/songs`);
  return data;
}
async function getSong(id) {
  const { data } = await axios.get(`${API_URL}/songs/${id}`);
  return data;
}

// ===== Home =====
function HomeScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try { setSongs(await listSongs()); } catch { setSongs([]); }
    finally { setLoading(false); }
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
      Alert.alert('Erro', 'Falha: ' + (e.message || e));
    } finally { setUploading(false); }
  }

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.uploadButton} onPress={handlePick} disabled={uploading}>
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={s.uploadText}>+ Adicionar musica (MP3)</Text>}
      </TouchableOpacity>
      <Text style={s.sectionTitle}>Musicas no servidor</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.songItem} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={s.songTitle}>{item.title}</Text>
              <Text style={s.songStatus}>{item.status === 'ready' ? 'Cifra pronta' : item.status === 'processing' ? 'Processando...' : 'Erro'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>Nenhuma musica enviada ainda.</Text>}
        />
      )}
    </View>
  );
}

// ===== Song =====
function SongScreen({ route, navigation }) {
  const { id } = route.params;
  const [song, setSong] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false; let attempts = 0;
    async function poll() {
      if (cancelled) return; attempts++;
      try {
        const data = await getSong(id);
        if (cancelled) return;
        setSong(data);
        if (data.status === 'processing' && attempts < 100) pollRef.current = setTimeout(poll, 3000);
      } catch { if (!cancelled) setSong({ id, status: 'error', errorMessage: 'Servidor offline. Tente novamente.' }); }
    }
    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [id]);

  async function handlePdf() {
    try {
      const fileUri = FileSystem.documentDirectory + 'cifra.pdf';
      const res = await FileSystem.downloadAsync(`${API_URL}/songs/${id}/pdf`, fileUri);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
      else Alert.alert('PDF', res.uri);
    } catch (e) { Alert.alert('Erro', 'Falha PDF: ' + (e.message || e)); }
  }

  if (!song) return <View style={s.center}><ActivityIndicator /></View>;
  if (song.status === 'processing') return (
    <View style={s.center}><ActivityIndicator size="large" /><Text style={s.statusText}>Analisando acordes e letra...</Text></View>
  );
  if (song.status === 'error') return (
    <View style={s.center}><Text style={s.statusText}>Erro</Text><Text style={s.errorText}>{song.errorMessage}</Text></View>
  );

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.printButton} onPress={handlePdf}><Text style={s.printText}>Exportar PDF</Text></TouchableOpacity>
      <ScrollView style={{ flex: 1 }}>
        {song.cifra.lines.map((line, idx) => (
          <View key={idx} style={{ marginBottom: 6 }}>
            <Text style={s.chordLine}>{line.chordLine}</Text>
            <Text style={s.lyricLine}>{line.lyricLine}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ===== Lyrics Search =====
function LyricsSearchScreen({ route, navigation }) {
  const { songId } = route.params;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/lyrics/search`, { params: { q: query } });
      setResults(data);
    } catch { Alert.alert('Erro', 'Falha na busca.'); }
    finally { setLoading(false); }
  }

  async function handleImport(item) {
    try {
      await axios.post(`${API_URL}/songs/${songId}/lyrics/import`, { url: item.url });
      Alert.alert('Pronto', 'Letra importada.');
      navigation.navigate('Song', { id: songId });
    } catch { Alert.alert('Erro', 'Falha ao importar.'); }
  }

  return (
    <View style={s.container}>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <TextInput style={{ flex: 1, backgroundColor: '#1d1d22', color: '#fff', borderRadius: 8, padding: 12, marginRight: 8 }}
          placeholder="Titulo ou artista" placeholderTextColor="#666" value={query} onChangeText={setQuery} onSubmitEditing={handleSearch} />
        <TouchableOpacity style={{ backgroundColor: '#5b6cff', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' }} onPress={handleSearch}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Buscar</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.url}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.songItem} onPress={() => handleImport(item)}>
              <Text style={s.songTitle}>{item.title}</Text>
              <Text style={s.songStatus}>{item.artist}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>Nenhum resultado.</Text>}
        />
      )}
    </View>
  );
}

// ===== App =====
const Stack = createNativeStackNavigator();
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1b1b1f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Chorde' }} />
        <Stack.Screen name="Song" component={SongScreen} options={{ title: 'Cifra' }} />
        <Stack.Screen name="LyricsSearch" component={LyricsSearchScreen} options={{ title: 'Buscar letra' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ===== Styles =====
import { TextInput } from 'react-native';
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  center: { flex: 1, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center', padding: 20 },
  uploadButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 20 },
  uploadText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  sectionTitle: { color: '#aaa', marginBottom: 10, fontSize: 13 },
  songItem: { backgroundColor: '#1d1d22', borderRadius: 8, padding: 14, marginBottom: 10 },
  songTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
  songStatus: { color: '#8f8f99', fontSize: 12, marginTop: 4 },
  empty: { color: '#666', textAlign: 'center', marginTop: 30 },
  statusText: { color: '#ccc', marginTop: 12, fontSize: 15 },
  errorText: { color: '#e06666', marginTop: 8, fontSize: 12, textAlign: 'center' },
  printButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  printText: { color: '#fff', fontWeight: '600' },
  chordLine: { color: '#5b6cff', fontFamily: 'monospace', fontWeight: 'bold' },
  lyricLine: { color: '#eee', fontFamily: 'monospace' },
});
