import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import axios from 'axios';

const API_URL = 'http://192.168.1.172:3000';

const ALL_CHORDS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
];

async function uploadSong(fileUri, fileName, mimeType, title) {
  const res = await FileSystem.uploadAsync(`${API_URL}/songs/upload`, fileUri, {
    fieldName: 'audio', mimeType: mimeType || 'audio/mpeg',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    parameters: title ? { title } : {},
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`servidor: ${res.status}`);
  return JSON.parse(res.body);
}
async function listSongs() { const { data } = await axios.get(`${API_URL}/songs`); return data; }
async function getSong(id) { const { data } = await axios.get(`${API_URL}/songs/${id}`); return data; }
async function updateChord(id, lineIndex, oldChord, newChord) {
  const { data } = await axios.patch(`${API_URL}/songs/${id}/chord`, { lineIndex, oldChord, newChord });
  return data;
}

function ChordPickerModal({ visible, currentChord, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Trocar acorde (atual: {currentChord})</Text>
          <ScrollView style={{ maxHeight: 350 }}>
            <View style={s.chordGrid}>
              {ALL_CHORDS.map((chord) => (
                <TouchableOpacity key={chord} style={[s.chordOption, chord === currentChord && s.chordOptionActive]}
                  onPress={() => { onSelect(chord); onClose(); }}>
                  <Text style={s.chordOptionText}>{chord}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity style={s.closeButton} onPress={onClose}>
            <Text style={s.closeButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function CifraLine({ line, lineIndex, onChordPress }) {
  const parts = line.chordLine.split(/(\[[^\]]+\])/).filter(p => p.length > 0);
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {parts.map((part, i) => {
          if (part.startsWith('[') && part.endsWith(']')) {
            const chord = part.slice(1, -1);
            return (
              <TouchableOpacity key={i} onPress={() => onChordPress(lineIndex, chord)}>
                <Text style={s.chordLine}>{chord}</Text>
              </TouchableOpacity>
            );
          }
          return <Text key={i} style={s.chordSpacer}>{part}</Text>;
        })}
      </View>
      <Text style={s.lyricLine}>{line.lyricLine}</Text>
    </View>
  );
}

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
    } catch (e) { Alert.alert('Erro', 'Falha: ' + (e.message || e)); }
    finally { setUploading(false); }
  }
  return (
    <View style={s.container}>
      <TouchableOpacity style={s.uploadButton} onPress={handlePick} disabled={uploading}>
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={s.uploadText}>+ Adicionar musica (MP3)</Text>}
      </TouchableOpacity>
      <Text style={s.sectionTitle}>Recentes</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <FlatList data={songs.slice(0, 5)} keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.songItem} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={s.songTitle}>{item.title}</Text>
              <Text style={s.songStatus}>{item.status === 'ready' ? 'Cifra pronta' : item.status === 'processing' ? 'Processando...' : 'Erro'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>Nenhuma musica enviada ainda.</Text>} />
      )}
    </View>
  );
}

function MusicasScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const loadSongs = useCallback(async () => {
    setLoading(true);
    try { setSongs(await listSongs()); } catch { setSongs([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { loadSongs(); }, [loadSongs]));
  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>Todas as musicas (A-Z)</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <FlatList data={songs} keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.songItem} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={s.songTitle}>{item.title}</Text>
              <Text style={s.songStatus}>{item.status === 'ready' ? 'Cifra pronta' : item.status === 'processing' ? 'Processando...' : 'Erro'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>Nenhuma musica enviada ainda.</Text>} />
      )}
    </View>
  );
}

function DeteccaoScreen() {
  const [status, setStatus] = useState('Toque no botao para iniciar');
  const [listening, setListening] = useState(false);
  const listenRef = useRef(true);
  async function startDetection() {
    try {
      const Audio = require('expo-av').Audio;
      setStatus('Solicitando permissao...');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { setStatus('Permissao negada'); return; }
      setListening(true); listenRef.current = true;
      setStatus('Ouvindo... toque um acorde');
      const REC_OPTS = {
        android: { extension: '.wav', outputFormat: Audio.AndroidOutputFormat.DEFAULT, audioEncoder: Audio.AndroidAudioEncoder.DEFAULT, sampleRate: 22050, numberOfChannels: 1, bitRate: 128000 },
        ios: { extension: '.wav', audioQuality: Audio.IOSAudioQuality.MEDIUM, outputFormat: Audio.IOSOutputFormat.LINEARPCM, sampleRate: 22050, numberOfChannels: 1, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
      };
      while (listenRef.current) {
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(REC_OPTS);
        await rec.startAsync();
        await new Promise(r => setTimeout(r, 1500));
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          const { detectChordFromWavBase64 } = require('./src/audio/chordDetector');
          const { chord, confidence } = detectChordFromWavBase64(base64);
          if (chord !== 'N' && confidence > 0.2) setStatus('Detectado: ' + chord + ' (' + Math.round(confidence * 100) + '%)');
          else setStatus('Ouvindo...');
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      }
      setListening(false); setStatus('Parado');
    } catch (e) { setListening(false); setStatus('Erro: ' + (e.message || String(e))); }
  }
  return (
    <View style={s.container}>
      <View style={s.detectionBox}>
        <Text style={s.detectionLabel}>Deteccao de Tom</Text>
        <Text style={s.detectionStatus}>{status}</Text>
      </View>
      <TouchableOpacity style={[s.uploadButton, listening && s.stopButton]}
        onPress={() => { if (listening) { listenRef.current = false; setListening(false); } else startDetection(); }}>
        <Text style={s.uploadText}>{listening ? 'Parar' : 'Iniciar deteccao'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SongScreen({ route, navigation }) {
  const { id } = route.params;
  const [song, setSong] = useState(null);
  const [modal, setModal] = useState({ visible: false, lineIndex: -1, chord: '' });
  const pollRef = useRef(null);
  useEffect(() => {
    let cancelled = false; let attempts = 0;
    async function poll() {
      if (cancelled) return; attempts++;
      try {
        const data = await getSong(id);
        if (cancelled) return; setSong(data);
        if (data.status === 'processing' && attempts < 100) pollRef.current = setTimeout(poll, 3000);
      } catch { if (!cancelled) setSong({ id, status: 'error', errorMessage: 'Servidor offline.' }); }
    }
    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [id]);
  async function handleChordSelect(newChord) {
    try { const updated = await updateChord(id, modal.lineIndex, modal.chord, newChord); setSong(updated); }
    catch { Alert.alert('Erro', 'Falha ao trocar acorde.'); }
  }
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
    <View style={s.center}><ActivityIndicator size="large" /><Text style={s.statusText}>Analisando acordes e buscando letra...</Text></View>
  );
  if (song.status === 'error') return (
    <View style={s.center}><Text style={s.statusText}>Erro</Text><Text style={s.errorText}>{song.errorMessage}</Text></View>
  );
  return (
    <View style={s.container}>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <TouchableOpacity style={[s.printButton, { flex: 1, marginRight: 5 }]} onPress={handlePdf}><Text style={s.printText}>PDF</Text></TouchableOpacity>
        <TouchableOpacity style={[s.lyricsButton, { flex: 1, marginLeft: 5 }]} onPress={() => navigation.navigate('LyricsSearch', { songId: id })}><Text style={s.printText}>Buscar letra</Text></TouchableOpacity>
      </View>
      <Text style={s.hintText}>Toque em um acorde para troca-lo</Text>
      <ScrollView style={{ flex: 1 }}>
        {song.cifra.lines.map((line, idx) => (
          <CifraLine key={idx} line={line} lineIndex={idx} onChordPress={(li, ch) => setModal({ visible: true, lineIndex: li, chord: ch })} />
        ))}
      </ScrollView>
      <ChordPickerModal visible={modal.visible} currentChord={modal.chord}
        onSelect={handleChordSelect} onClose={() => setModal({ visible: false, lineIndex: -1, chord: '' })} />
    </View>
  );
}

function LyricsSearchScreen({ route, navigation }) {
  const { songId } = route.params;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  async function handleSearch() {
    if (!query.trim()) return; setLoading(true);
    try { const { data } = await axios.get(`${API_URL}/lyrics/search`, { params: { q: query } }); setResults(data); }
    catch { Alert.alert('Erro', 'Falha na busca.'); }
    finally { setLoading(false); }
  }
  async function handleImport(item) {
    try { await axios.post(`${API_URL}/songs/${songId}/lyrics/import`, { url: item.url }); Alert.alert('Pronto', 'Letra importada.'); navigation.navigate('Song', { id: songId }); }
    catch { Alert.alert('Erro', 'Falha ao importar.'); }
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
        <FlatList data={results} keyExtractor={(item) => item.url}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.songItem} onPress={() => handleImport(item)}>
              <Text style={s.songTitle}>{item.title}</Text>
              <Text style={s.songStatus}>{item.artist}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>Nenhum resultado.</Text>} />
      )}
    </View>
  );
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1b1b1f' }, headerTintColor: '#fff', tabBarStyle: { backgroundColor: '#1b1b1f' }, tabBarActiveTintColor: '#5b6cff', tabBarInactiveTintColor: '#666' }}>
      <Tab.Screen name="Inicio" component={HomeScreen} options={{ title: 'Inicio' }} />
      <Tab.Screen name="Musicas" component={MusicasScreen} options={{ title: 'Musicas' }} />
      <Tab.Screen name="Deteccao" component={DeteccaoScreen} options={{ title: 'Deteccao' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1b1b1f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Song" component={SongScreen} options={{ title: 'Cifra' }} />
        <Stack.Screen name="LyricsSearch" component={LyricsSearchScreen} options={{ title: 'Buscar letra' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  center: { flex: 1, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center', padding: 20 },
  uploadButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 20 },
  stopButton: { backgroundColor: '#e06666' },
  uploadText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  sectionTitle: { color: '#aaa', marginBottom: 10, fontSize: 13 },
  songItem: { backgroundColor: '#1d1d22', borderRadius: 8, padding: 14, marginBottom: 10 },
  songTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
  songStatus: { color: '#8f8f99', fontSize: 12, marginTop: 4 },
  empty: { color: '#666', textAlign: 'center', marginTop: 30 },
  statusText: { color: '#ccc', marginTop: 12, fontSize: 15 },
  errorText: { color: '#e06666', marginTop: 8, fontSize: 12, textAlign: 'center' },
  printButton: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  lyricsButton: { backgroundColor: '#2e2e38', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  printText: { color: '#fff', fontWeight: '600' },
  chordLine: { color: '#5b6cff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15 },
  chordSpacer: { color: 'transparent', fontFamily: 'monospace', fontSize: 15 },
  lyricLine: { color: '#eee', fontFamily: 'monospace', fontSize: 14 },
  hintText: { color: '#555', fontSize: 11, marginBottom: 10 },
  detectionBox: { backgroundColor: '#1d1d22', borderRadius: 12, padding: 30, alignItems: 'center', marginBottom: 20 },
  detectionLabel: { color: '#8f8f99', fontSize: 12, textTransform: 'uppercase' },
  detectionStatus: { color: '#5b6cff', fontSize: 20, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1d1d22', borderRadius: 16, padding: 20, width: '85%', maxHeight: '70%' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  chordGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  chordOption: { backgroundColor: '#2a2a30', borderRadius: 8, padding: 12, margin: 4, minWidth: 60, alignItems: 'center' },
  chordOptionActive: { backgroundColor: '#5b6cff' },
  chordOptionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  closeButton: { backgroundColor: '#333', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: '#fff', fontSize: 14 },
});