import React from 'react';
import { View, Text, ScrollView } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#111114', padding: 20, justifyContent: 'center' }}>
          <Text style={{ color: '#e06666', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
            Erro no app:
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            <Text style={{ color: '#ccc', fontSize: 12 }}>
              {String(this.state.error?.message || this.state.error)}
              {'\n\n'}
              {String(this.state.error?.stack || '')}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}
