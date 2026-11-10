import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { useTheme } from 'styled-components/native';
import Linha_Interruptor from '../../../components/Comum/Linha_Interruptor';
import Opcao_Segmentada from '../../../components/Comum/Opcao_Segmentada';
import Tela_Rolavel from '../../../components/Comum/Tela_Rolavel';
import * as C from '../../../components/Comum/Tela_Rolavel/styles';
import { useAuth } from '../../../contexts/Auth_Context';
import { useConfig, type PreferenciaTema } from '../../../contexts/Config_Context';
import { appleDisponivel, emExpoGo, entrarCom, googleDisponivel, type Provedor } from '../../../lib/loginSocial';
import type { Intensidade } from '../../../theme/niveis';
import * as S from './styles';

const NOME_PROVEDOR: Record<string, string> = { google: 'Google', apple: 'Apple' };

/** Conta do usuário: convidado por padrão, com opção de vincular Google/Apple (só no app de desenvolvimento/loja). */
const Perfil = () => {
  const theme = useTheme();
  const { session, carregando, erro, entrarComoConvidado, sair } = useAuth();
  const { config, atualizar, restaurarPadrao } = useConfig();
  const [apple, setApple] = useState(false);
  const [entrando, setEntrando] = useState<Provedor | null>(null);

  useEffect(() => {
    appleDisponivel().then(setApple);
  }, []);

  const convidado = session?.user.is_anonymous ?? true;
  const provedores = (session?.user.identities ?? []).map((i) => NOME_PROVEDOR[i.provider]).filter(Boolean);

  const entrar = async (provedor: Provedor) => {
    setEntrando(provedor);
    try {
      const resultado = await entrarCom(provedor);
      if (resultado === 'vinculado') Alert.alert('Conta vinculada', `Sua conta ${NOME_PROVEDOR[provedor]} foi vinculada.`);
      if (resultado === 'entrou') Alert.alert('Pronto', `Você entrou com sua conta ${NOME_PROVEDOR[provedor]}.`);
    } catch (e) {
      Alert.alert('Não foi possível entrar', e instanceof Error ? e.message : 'Tente de novo em instantes.');
    } finally {
      setEntrando(null);
    }
  };

  const confirmarSaida = () =>
    Alert.alert(
      'Sair',
      convidado
        ? 'Você continuará usando o Grad como um novo convidado. Nada fica salvo na conta de convidado.'
        : 'Você continuará usando o Grad como convidado. Para voltar, entre de novo com a mesma conta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => sair() },
      ],
    );

  const algumLogin = googleDisponivel || apple;

  return (
    <Tela_Rolavel titulo="Perfil">
      <C.Secao>
        <C.Subtitulo>Conta</C.Subtitulo>
        {carregando ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : session ? (
          <>
            <C.Texto>{convidado ? 'Você está como convidado.' : (session.user.email ?? 'Conta vinculada')}</C.Texto>
            <C.TextoSecundario>
              {convidado
                ? 'Vincule uma conta para manter seu acesso ao trocar de celular.'
                : `Conta vinculada: ${provedores.join(' e ') || 'sim'}.`}
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
          {googleDisponivel && (
            <C.Botao onPress={() => entrar('google')} disabled={!!entrando} $desativado={!!entrando}>
              {entrando === 'google' ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <C.BotaoTexto>Continuar com Google</C.BotaoTexto>
              )}
            </C.Botao>
          )}
          {apple && (
            <S.BotaoApple
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              onPress={() => !entrando && entrar('apple')}
            />
          )}
          {!algumLogin && (
            <C.TextoSecundario>
              {emExpoGo
                ? 'O login com Google e Apple não funciona no Expo Go. Use o app de desenvolvimento do Grad (veja docs/LOGIN_SOCIAL.md).'
                : Platform.OS === 'ios'
                  ? 'Login social indisponível neste aparelho.'
                  : 'Login com Google ainda não configurado neste build.'}
            </C.TextoSecundario>
          )}
        </C.Secao>
      )}

      {session && (
        <C.BotaoSecundario onPress={confirmarSaida}>
          <C.BotaoSecundarioTexto>Sair</C.BotaoSecundarioTexto>
        </C.BotaoSecundario>
      )}

      <C.Secao style={{ marginTop: 16 }}>
        <C.Subtitulo>Configurações</C.Subtitulo>
        <Opcao_Segmentada<PreferenciaTema>
          rotulo="Tema"
          valor={config.tema}
          onMudar={(tema) => atualizar({ tema })}
          opcoes={[
            { valor: 'sistema', texto: 'Sistema' },
            { valor: 'claro', texto: 'Claro' },
            { valor: 'escuro', texto: 'Escuro' },
          ]}
        />
        <Opcao_Segmentada<Intensidade>
          rotulo="Cores dos hexágonos"
          valor={config.intensidade}
          onMudar={(intensidade) => atualizar({ intensidade })}
          opcoes={[
            { valor: 'suave', texto: 'Suaves' },
            { valor: 'normal', texto: 'Normais' },
            { valor: 'forte', texto: 'Fortes' },
          ]}
        />
        <Linha_Interruptor
          rotulo="Polícia, GCM e bombeiros no mapa"
          descricao="Aparecem ao aproximar o mapa de um bairro."
          valor={config.mostrarUnidades}
          onMudar={(mostrarUnidades) => atualizar({ mostrarUnidades })}
        />
        <Linha_Interruptor
          rotulo="Mostrar legenda no mapa"
          valor={config.mostrarLegenda}
          onMudar={(mostrarLegenda) => atualizar({ mostrarLegenda })}
        />
        <Linha_Interruptor
          rotulo="Centralizar em mim ao abrir"
          descricao="Ao abrir o app, o mapa vai para a sua localização."
          valor={config.centralizarAoAbrir}
          onMudar={(centralizarAoAbrir) => atualizar({ centralizarAoAbrir })}
        />
        <C.BotaoSecundario onPress={restaurarPadrao}>
          <C.BotaoSecundarioTexto>Restaurar padrão</C.BotaoSecundarioTexto>
        </C.BotaoSecundario>
      </C.Secao>

      <C.Secao>
        <C.Subtitulo>Sobre os dados</C.Subtitulo>
        <C.TextoSecundario>
          O mapa usa os boletins de ocorrência de 2025 publicados pela Secretaria da Segurança Pública de São Paulo.
          Cada tipo de crime tem um peso (crimes contra a vida pesam mais que furtos) e a cidade é dividida em
          hexágonos. O nível compara cada hexágono com o resto da cidade: nível 1 indica poucos registros, não
          garantia de segurança. As unidades de polícia, GCM e bombeiros vêm da base GeoSampa da Prefeitura.
        </C.TextoSecundario>
        <C.TextoSecundario style={{ marginTop: 8 }}>{`Versão ${Constants.expoConfig?.version ?? '–'}`}</C.TextoSecundario>
      </C.Secao>
    </Tela_Rolavel>
  );
};

export default Perfil;
