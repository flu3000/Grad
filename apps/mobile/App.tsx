import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from 'styled-components/native';
import { AuthProvider } from './src/contexts/Auth_Context';
import { LocalAtualProvider } from './src/contexts/Local_Atual_Context';
import Abas from './src/navigation/Abas';
import colors from './src/theme/colors';

const temaNavegacao: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.primary,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.textPrimary,
  },
};

/** Entra direto no mapa: a sessão de convidado é criada em segundo plano (ver Auth_Context). */
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider theme={{ colors }}>
        <AuthProvider>
          <LocalAtualProvider>
            <NavigationContainer theme={temaNavegacao}>
              <StatusBar style="light" />
              <Abas />
            </NavigationContainer>
          </LocalAtualProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
