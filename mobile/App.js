import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import SongScreen from './src/screens/SongScreen';
import LyricsSearchScreen from './src/screens/LyricsSearchScreen';
import MicChordScreen from './src/screens/MicChordScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1b1b1f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Chorde' }} />
        <Stack.Screen name="Song" component={SongScreen} options={{ title: 'Cifra' }} />
        <Stack.Screen name="LyricsSearch" component={LyricsSearchScreen} options={{ title: 'Buscar letra' }} />
        <Stack.Screen name="MicChord" component={MicChordScreen} options={{ title: 'Detectar pelo microfone' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
