import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ErrorBoundary from './src/ErrorBoundary';
import HomeScreen from './src/screens/HomeScreen';
import SongScreen from './src/screens/SongScreen';
import LyricsSearchScreen from './src/screens/LyricsSearchScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ErrorBoundary>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1b1b1f' }, headerTintColor: '#fff' }}>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Chorde' }} />
          <Stack.Screen name="Song" component={SongScreen} options={{ title: 'Cifra' }} />
          <Stack.Screen name="LyricsSearch" component={LyricsSearchScreen} options={{ title: 'Buscar letra' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
