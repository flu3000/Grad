import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  carregando: boolean;
  erro: string | null;
  /** Tenta de novo criar a sessão de convidado (ex.: depois de erro de rede). */
  entrarComoConvidado: () => Promise<void>;
  /** Encerra a sessão; um novo convidado é criado em seguida. */
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Sessão do Supabase. Sem sessão salva, entra automaticamente como convidado (login anônimo).
 * O mapa funciona mesmo sem sessão (leitura pública); a sessão serve para o perfil e, depois, para vincular Google/Apple.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const criando = useRef(false);

  const entrarComoConvidado = useCallback(async () => {
    if (criando.current) return;
    criando.current = true;
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setErro('Não foi possível entrar como convidado. Verifique sua conexão e tente de novo.');
    setCarregando(false);
    criando.current = false;
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      if (data.session) setCarregando(false);
      else entrarComoConvidado();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => setSession(nova));
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [entrarComoConvidado]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    await entrarComoConvidado();
  }, [entrarComoConvidado]);

  return (
    <AuthContext.Provider value={{ session, carregando, erro, entrarComoConvidado, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
