import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { anoPadrao, buscarAnos, type Ano } from '../lib/anos';
import { periodoAtual, type IndicePeriodo } from '../lib/tempo';

export type ModoFiltro = 'dia_inteiro' | 'periodo' | 'hora';

interface FiltroState {
  /** anos disponíveis (null enquanto carrega) */
  anos: Ano[] | null;
  erroAnos: boolean;
  recarregarAnos: () => void;
  /** ano selecionado; null = ainda carregando (as consultas usam o ano padrão do banco) */
  ano: number | null;
  infoAno: Ano | null;
  setAno: (ano: number) => void;
  modo: ModoFiltro;
  setModo: (modo: ModoFiltro) => void;
  periodo: IndicePeriodo;
  setPeriodo: (p: IndicePeriodo) => void;
  hora: number;
  setHora: (h: number) => void;
  /** animação de períodos/horas rodando no mapa */
  tocando: boolean;
  setTocando: (t: boolean) => void;
}

const FiltroContext = createContext<FiltroState | null>(null);

/** Filtros do mapa e das telas (ano, período, hora), compartilhados entre as abas. Ficam só na sessão. */
export function FiltroProvider({ children }: { children: React.ReactNode }) {
  const [anos, setAnos] = useState<Ano[] | null>(null);
  const [erroAnos, setErroAnos] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [ano, setAnoState] = useState<number | null>(null);
  const [modo, setModoState] = useState<ModoFiltro>('dia_inteiro');
  const [periodo, setPeriodo] = useState<IndicePeriodo>(() => periodoAtual());
  const [hora, setHora] = useState(() => new Date().getHours());
  const [tocando, setTocando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setErroAnos(false);
    buscarAnos()
      .then((lista) => {
        if (cancelado) return;
        setAnos(lista);
        setAnoState((atual) => atual ?? anoPadrao(lista));
      })
      .catch(() => {
        if (!cancelado) setErroAnos(true);
      });
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  const recarregarAnos = useCallback(() => setTentativa((t) => t + 1), []);
  const setAno = useCallback((a: number) => setAnoState(a), []);
  // Trocar de modo para a animação e começa pelo período/hora de agora.
  const setModo = useCallback((m: ModoFiltro) => {
    setTocando(false);
    setModoState(m);
    if (m === 'periodo') setPeriodo(periodoAtual());
    if (m === 'hora') setHora(new Date().getHours());
  }, []);

  const infoAno = useMemo(() => anos?.find((a) => a.ano === ano) ?? null, [anos, ano]);

  const valor = useMemo(
    () => ({ anos, erroAnos, recarregarAnos, ano, infoAno, setAno, modo, setModo, periodo, setPeriodo, hora, setHora, tocando, setTocando }),
    [anos, erroAnos, recarregarAnos, ano, infoAno, setAno, modo, setModo, periodo, hora, tocando],
  );
  return <FiltroContext.Provider value={valor}>{children}</FiltroContext.Provider>;
}

export function useFiltro(): FiltroState {
  const ctx = useContext(FiltroContext);
  if (!ctx) throw new Error('useFiltro precisa estar dentro de <FiltroProvider>');
  return ctx;
}
