import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export type Provedor = 'google' | 'apple';
export type ResultadoLogin = 'vinculado' | 'entrou' | 'cancelado';

/** No Expo Go não há os módulos nativos do Google nem o bundle id do Grad (o token da Apple não seria aceito). */
export const emExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleDisponivel = !emExpoGo && !!googleWebClientId && (Platform.OS !== 'ios' || !!googleIosClientId);

export async function appleDisponivel(): Promise<boolean> {
  if (emExpoGo || Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

class Cancelado extends Error {}

/** Token de ID do Google pelo login nativo. O módulo é carregado só aqui, porque não existe no Expo Go. */
async function tokenGoogle(): Promise<{ token: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const g = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  g.GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId });
  try {
    await g.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const resposta = await g.GoogleSignin.signIn();
    if (!g.isSuccessResponse(resposta)) throw new Cancelado();
    const token = resposta.data.idToken;
    if (!token) throw new Error('O Google não devolveu o token de ID (confira o webClientId).');
    return { token };
  } catch (e) {
    if (g.isErrorWithCode(e) && e.code === g.statusCodes.SIGN_IN_CANCELLED) throw new Cancelado();
    throw e;
  }
}

/** Token de ID da Apple. O nonce vai com hash para a Apple e cru para o Supabase, que confere os dois. */
async function tokenApple(): Promise<{ token: string; nonce: string }> {
  const nonce = Crypto.randomUUID();
  const nonceHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonceHash,
    });
    if (!credencial.identityToken) throw new Error('A Apple não devolveu o token de ID.');
    return { token: credencial.identityToken, nonce };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelado();
    throw e;
  }
}

/**
 * Entra com Google/Apple. Se a pessoa está como convidada, a conta é VINCULADA ao convidado atual (linkIdentity).
 * Se essa conta Google/Apple já pertence a outro usuário (ex.: reinstalou o app), entra nesse usuário.
 */
export async function entrarCom(provedor: Provedor): Promise<ResultadoLogin> {
  let credencial: { token: string; nonce?: string };
  try {
    credencial = provedor === 'google' ? await tokenGoogle() : await tokenApple();
  } catch (e) {
    if (e instanceof Cancelado) return 'cancelado';
    throw e;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.user.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({ provider: provedor, ...credencial });
    if (!error) {
      await supabase.auth.refreshSession();
      return 'vinculado';
    }
    if (error.code !== 'identity_already_exists') throw error;
  }

  const { error } = await supabase.auth.signInWithIdToken({ provider: provedor, ...credencial });
  if (error) throw error;
  return 'entrou';
}

/** Desconecta do Google no aparelho (para a próxima vez permitir escolher outra conta). */
export async function sairDoGoogle(): Promise<void> {
  if (!googleDisponivel) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const g = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    await g.GoogleSignin.signOut();
  } catch {
    // sem sessão do Google no aparelho: nada a fazer
  }
}
