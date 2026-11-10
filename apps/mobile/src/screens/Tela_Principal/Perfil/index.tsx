import React from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { useTheme } from 'styled-components/native';
import Tela_Rolavel from '../../../components/Comum/Tela_Rolavel';
import * as C from '../../../components/Comum/Tela_Rolavel/styles';
import { useAuth } from '../../../contexts/Auth_Context';

/** Conta do usuário: hoje sempre convidado; vincular Google/Apple chega na Fase 3.6. */
const Perfil = () => {
  const theme = useTheme();
  const { session, carregando, erro, entrarComoConvidado, sair } = useAuth();
  const convidado = session?.user.is_anonymous ?? true;

  const confirmarSaida = () =>
    Alert.alert(
      'Sair',
      convidado
        ? 'Você continuará usando o Grad como um novo convidado. Nada fica salvo na conta de convidado.'
        : 'Você continuará usando o Grad como convidado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => sair() },
      ],
    );

  return (
    <Tela_Rolavel titulo="Perfil">
      <C.Secao>
        <C.Subtitulo>Conta</C.Subtitulo>
        {carregando ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : session ? (
          <>
            <C.Texto>{convidado ? 'Você está como convidado.' : session.user.email ?? 'Conta vinculada'}</C.Texto>
            <C.TextoSecundario>
              {convidado
                ? 'Vincule uma conta para manter seu acesso ao trocar de celular.'
                : 'Sua conta está vinculada.'}
            </C.TextoSecundario>
          </>
        ) : (
          <>
            <C.Texto>{erro ?? 'Você não está conectado.'}</C.Texto>
            <C.Botao onPress={entrarComoConvidado}>
              <C.BotaoTexto>Entrar como convidado</C.BotaoTexto>
            </C.Botao>
          </>
        )}
      </C.Secao>

      {convidado && (
        <C.Secao>
          <C.Subtitulo>Vincular conta</C.Subtitulo>
          <C.Botao $desativado disabled accessibilityState={{ disabled: true }}>
            <C.BotaoTexto>Continuar com Google</C.BotaoTexto>
          </C.Botao>
          <C.Botao $desativado disabled accessibilityState={{ disabled: true }}>
            <C.BotaoTexto>Continuar com Apple</C.BotaoTexto>
          </C.Botao>
          <C.TextoSecundario style={{ marginTop: 8 }}>Em breve.</C.TextoSecundario>
        </C.Secao>
      )}

      {session && (
        <C.BotaoSecundario onPress={confirmarSaida}>
          <C.BotaoSecundarioTexto>Sair</C.BotaoSecundarioTexto>
        </C.BotaoSecundario>
      )}

      <C.Secao style={{ marginTop: 16 }}>
        <C.Subtitulo>Sobre os dados</C.Subtitulo>
        <C.TextoSecundario>
          O mapa usa os boletins de ocorrência de 2025 publicados pela Secretaria da Segurança Pública de São Paulo.
          Cada tipo de crime tem um peso (crimes contra a vida pesam mais que furtos) e a cidade é dividida em
          hexágonos. O nível compara cada hexágono com o resto da cidade: nível 1 indica poucos registros, não
          garantia de segurança.
        </C.TextoSecundario>
      </C.Secao>
    </Tela_Rolavel>
  );
};

export default Perfil;
