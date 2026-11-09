import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { ThemeProvider } from 'styled-components/native';
import colors from './src/theme/colors';
import Cadastro from './src/screens/Login/Cadastro'
import Main from './src/screens/Tela_Principal/Main';
import { SafeAreaProvider } from 'react-native-safe-area-context';


export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider theme={{colors}}>
        <Main />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}