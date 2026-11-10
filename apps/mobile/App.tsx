import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from 'styled-components/native';
import { AuthProvider } from './src/contexts/Auth_Context';
import { ConfigProvider, useConfig } from './src/contexts/Config_Context';
import { LocalAtualProvider } from './src/contexts/Local_Atual_Context';
import Abas from './src/navigation/Abas';
import { temaClaro, temaEscuro } from './src/theme/colors';

/** Aplica o tema escolhido nas configurações (claro, escuro ou o do sistema). */
function AppComTema() {
  const { esquema, carregada } = useConfig();
  const colors = esquema === 'claro' ? temaClaro : temaEscuro;

  const temaNavegacao: Theme = useMemo(() => {
    const base = esquema === 'claro' ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.primary,
        text: colors.textPrimary,
        border: colors.border,
        primary: colors.accent,
      },
    };
  }, [esquema, colors]);

  // Evita piscar o tema errado enquanto a configuração salva é lida.
  if (!carregada) return null;

  return (
    <ThemeProvider theme={{ colors, esquema }}>
      <NavigationContainer theme={temaNavegacao}>
        <StatusBar style={esquema === 'claro' ? 'dark' : 'light'} />
        <Abas />
      </NavigationContainer>
    </ThemeProvider>
  );
}

/** Entra direto no mapa: a sessão de convidado é criada em segundo plano (ver Auth_Context). */
export default function App() {
  return (
    <SafeAreaProvider>
      <ConfigProvider>
        <AuthProvider>
          <LocalAtualProvider>
            <AppComTema />
          </LocalAtualProvider>
        </AuthProvider>
      </ConfigProvider>
    </SafeAreaProvider>
  );
}
