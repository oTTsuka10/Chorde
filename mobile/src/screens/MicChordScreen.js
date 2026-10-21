import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import { detectChordFromWavBase64 } from '../audio/chordDetector';
import { estimateKey, predictNextChords } from '../audio/musicTheory';

const WINDOW_MS = 900;

// Grava em janelas curtas e encadeadas (nao e um stream continuo amostra-a-amostra): cada janela
// e analisada assim que termina, dando uma deteccao "quase em tempo real" (~1s de atraso).
// No Android, a gravacao em WAV/PCM bruto via expo-av pode nao ser suportada em todos os
// aparelhos/versoes — nesse caso, use um dev client com um modulo nativo de audio (fora do Expo Go).
const RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.wav',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export default function MicChordScreen() {
  const [listening, setListening] = useState(false);
  const [currentChord, setCurrentChord] = useState('--');
  const [predictions, setPredictions] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const recordingRef = useRef(null);
  const loopRef = useRef(false);

  useEffect(() => () => stopLoop(), []);

  async function requestMic() {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  async function recordOneWindow() {
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(RECORDING_OPTIONS);
    await recording.startAsync();
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS));
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    return base64;
  }

  async function loop() {
    while (loopRef.current) {
      try {
        const base64 = await recordOneWindow();
        const { chord, confidence } = detectChordFromWavBase64(base64);
        if (chord !== 'N' && confidence > 0.3) {
          setCurrentChord(chord);
          setHistory((prev) => {
            const next = [...prev, chord].slice(-16);
            const key = estimateKey(next);
            setPredictions(predictNextChords(chord, key, 4));
            return next;
          });
        }
      } catch (e) {
        setError(e.message);
        loopRef.current = false;
        setListening(false);
      }
    }
  }

  async function start() {
    setError(null);
    const granted = await requestMic();
    if (!granted) {
      setError('Permissao de microfone negada.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    loopRef.current = true;
    setListening(true);
    loop();
  }

  function stopLoop() {
    loopRef.current = false;
    setListening(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Toque um instrumento perto do microfone. A deteccao roda em janelas de ~1s (quase tempo
        real), nao amostra a amostra.
      </Text>

      <View style={styles.chordBox}>
        <Text style={styles.chordLabel}>Acorde detectado</Text>
        <Text style={styles.chordValue}>{currentChord}</Text>
      </View>

      <TouchableOpacity style={[styles.button, listening && styles.buttonStop]} onPress={listening ? stopLoop : start}>
        <Text style={styles.buttonText}>{listening ? 'Parar' : 'Iniciar deteccao pelo microfone'}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>Proximo acorde provavel (teoria musical)</Text>
      <FlatList
        data={predictions}
        keyExtractor={(item) => item.chord}
        renderItem={({ item }) => (
          <View style={styles.predictionRow}>
            <Text style={styles.predictionChord}>{item.chord}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${item.probability}%` }]} />
            </View>
            <Text style={styles.predictionPct}>{item.probability}%</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Comece a detectar para ver as previsoes.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111114', padding: 16 },
  hint: { color: '#8f8f99', fontSize: 12, marginBottom: 16 },
  chordBox: { alignItems: 'center', backgroundColor: '#1d1d22', borderRadius: 12, padding: 24, marginBottom: 16 },
  chordLabel: { color: '#8f8f99', fontSize: 12, textTransform: 'uppercase' },
  chordValue: { color: '#5b6cff', fontSize: 48, fontWeight: '700', marginTop: 6 },
  button: { backgroundColor: '#5b6cff', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonStop: { backgroundColor: '#e06666' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  error: { color: '#e06666', marginBottom: 12, fontSize: 12, textAlign: 'center' },
  sectionTitle: { color: '#aaa', marginTop: 8, marginBottom: 10, fontSize: 13, textTransform: 'uppercase' },
  predictionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  predictionChord: { color: '#fff', width: 48, fontWeight: '600' },
  barTrack: { flex: 1, height: 10, backgroundColor: '#242430', borderRadius: 6, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%', backgroundColor: '#5b6cff' },
  predictionPct: { color: '#8f8f99', width: 40, textAlign: 'right' },
  empty: { color: '#666', textAlign: 'center', marginTop: 10 },
});
