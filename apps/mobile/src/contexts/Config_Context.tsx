import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Intensidade } from '../theme/niveis';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

export interface Configuracoes {
  tema: PreferenciaTema;
  /** Intensidade das cores dos hexágonos no mapa. */
  intensidade: Intensidade;
  /** Mostrar as unidades de polícia, GCM e bombeiros no mapa (com zoom de bairro ou mais próximo). */
  mostrarUnidades: boolean;
  /** Ao abrir o mapa, centralizar na localização do usuário. */
  centralizarAoAbrir: boolean;
}

const PADRAO: Configuracoes = {
  tema: 'sistema',
  intensidade: 'normal',
  mostrarUnidades: true,
  centralizarAoAbrir: true,
};

const CHAVE = 'grad:configuracoes';

/** Lê a configuração salva aceitando versões antigas (ex.: intensidade "forte" e "mostrarLegenda", que saíram). */
function sanear(salvo: Partial<Configuracoes>): Configuracoes {
  const c = { ...PADRAO, ...salvo };
  return {
    tema: ['sistema', 'claro', 'escuro'].includes(c.tema) ? c.tema : PADRAO.tema,
    intensidade: c.intensidade === 'suave' ? 'suave' : 'normal',
    mostrarUnidades: c.mostrarUnidades !== false,
    centralizarAoAbrir: c.centralizarAoAbrir !== false,
  };
}

interface ConfigState {
  config: Configuracoes;
  /** Tema efetivo depois de resolver "sistema". */
  esquema: 'claro' | 'escuro';
  carregada: boolean;
  atualizar: (mudancas: Partial<Configuracoes>) => void;
  restaurarPadrao: () => void;
}

const ConfigContext = createContext<ConfigState | null>(null);

/** Configurações do app, salvas no aparelho. */
export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const sistema = useColorScheme();
  const [config, setConfig] = useState<Configuracoes>(PADRAO);
  const [carregada, setCarregada] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHAVE)
      .then((salvo) => {
        if (salvo) setConfig(sanear(JSON.parse(salvo) as Partial<Configuracoes>));
      })
      .catch(() => undefined) // configuração corrompida: fica o padrão
      .finally(() => setCarregada(true));
  }, []);

  const salvar = useCallback((nova: Configuracoes) => {
    setConfig(nova);
    AsyncStorage.setItem(CHAVE, JSON.stringify(nova)).catch(() => undefined);
  }, []);

  const atualizar = useCallback((mudancas: Partial<Configuracoes>) => salvar({ ...config, ...mudancas }), [config, salvar]);
  const restaurarPadrao = useCallback(() => salvar(PADRAO), [salvar]);

  const esquema = config.tema === 'sistema' ? (sistema === 'light' ? 'claro' : 'escuro') : config.tema;

  const valor = useMemo(
    () => ({ config, esquema, carregada, atualizar, restaurarPadrao }),
    [config, esquema, carregada, atualizar, restaurarPadrao],
  );
  return <ConfigContext.Provider value={valor}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigState {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig precisa estar dentro de <ConfigProvider>');
  return ctx;
}
