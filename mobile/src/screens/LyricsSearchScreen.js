import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';

import api from '../api';

export default function LyricsSearchScreen({ route, navigation }) {
  const { songId } = route.params;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get('/lyrics/search', { params: { q: query } });
      setResults(data);
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel buscar letras no letras.com.br agora.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(item) {
    setImporting(true);
    try {
      await api.post(`/songs/${songId}/lyrics/import`, { url: item.url });
      Alert.alert('Pronto', 'Letra importada e realinhada com os acordes.');
      navigation.navigate('Song', { id: songId });
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel importar essa letra.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Titulo ou artista (ex: Evidencias)"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>Resultados do letras.com.br — escolha a versao correta da musica.</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.url}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => handleImport(item)} disabled={importing}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemArtist}>{item.artist}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum resultado ainda.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  searchRow: { flexDirection: 'row', marginBottom: 8 },
  input: { flex: 1, backgroundColor: '#1d1d22', color: '#fff', borderRadius: 8, padding: 12, marginRight: 8 },
  searchButton: { backgroundColor: '#5b6cff', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  disclaimer: { color: '#666', fontSize: 11, marginBottom: 16 },
  item: { backgroundColor: '#1d1d22', borderRadius: 8, padding: 14, marginBottom: 10 },
  itemTitle: { color: '#fff', fontSize: 15, fontWeight: '500' },
  itemArtist: { color: '#8f8f99', fontSize: 12, marginTop: 2 },
  empty: { color: '#666', textAlign: 'center', marginTop: 30 },
});
