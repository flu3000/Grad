import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { localizarPonto, type LocalInfo } from '../lib/mapa';
import { useFiltro } from './Filtro_Context';

type Permissao = 'pendente' | 'concedida' | 'negada';

interface LocalAtualState {
  permissao: Permissao;
  coords: { latitude: number; longitude: number } | null;
  info: LocalInfo | null;
  carregando: boolean;
  erro: string | null;
  /** Pede a permissão de novo (ou só reconsulta o nível do local). */
  atualizar: () => void;
}

const LocalAtualContext = createContext<LocalAtualState | null>(null);

// Só reconsulta o nível quando a pessoa anda mais que isso (o hexágono padrão tem ~900 m de diâmetro).
const DISTANCIA_MINIMA_M = 100;

/** Localização do usuário e o nível do lugar onde ele está (locate_point, no ano do filtro), compartilhados entre as abas. */
export function LocalAtualProvider({ children }: { children: React.ReactNode }) {
  const [permissao, setPermissao] = useState<Permissao>('pendente');
  const [coords, setCoords] = useState<LocalAtualState['coords']>(null);
  const [info, setInfo] = useState<LocalInfo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const ultimaConsulta = useRef(0);
  const { ano } = useFiltro();
  const anoRef = useRef(ano);
  anoRef.current = ano;

  const consultar = useCallback(async (latitude: number, longitude: number) => {
    const id = ++ultimaConsulta.current;
    setCarregando(true);
    try {
      const resultado = await localizarPonto(latitude, longitude, 8, anoRef.current);
      if (id === ultimaConsulta.current) {
        setInfo(resultado);
        setErro(null);
      }
    } catch {
      if (id === ultimaConsulta.current) setErro('Não foi possível consultar o nível deste local.');
    } finally {
      if (id === ultimaConsulta.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let assinatura: Location.LocationSubscription | null = null;
    let cancelado = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelado) return;
      if (status !== 'granted') {
        setPermissao('negada');
        return;
      }
      setPermissao('concedida');
      // A última posição conhecida chega na hora; o watch abaixo traz a posição precisa logo depois.
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima && !cancelado) {
        setCoords({ latitude: ultima.coords.latitude, longitude: ultima.coords.longitude });
        consultar(ultima.coords.latitude, ultima.coords.longitude);
      }
      assinatura = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: DISTANCIA_MINIMA_M },
        ({ coords: c }) => {
          setCoords({ latitude: c.latitude, longitude: c.longitude });
          consultar(c.latitude, c.longitude);
        },
      );
      if (cancelado) assinatura.remove();
    })().catch(() => {
      if (!cancelado) setErro('Não foi possível obter sua localização.');
    });
    return () => {
      cancelado = true;
      assinatura?.remove();
    };
  }, [consultar, tentativa]);

  // Trocar o ano no filtro reconsulta o local atual.
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  useEffect(() => {
    if (ano !== null && coordsRef.current) consultar(coordsRef.current.latitude, coordsRef.current.longitude);
  }, [ano, consultar]);

  const atualizar = useCallback(() => {
    if (permissao === 'concedida' && coords) consultar(coords.latitude, coords.longitude);
    else setTentativa((t) => t + 1);
  }, [permissao, coords, consultar]);

  return (
    <LocalAtualContext.Provider value={{ permissao, coords, info, carregando, erro, atualizar }}>
      {children}
    </LocalAtualContext.Provider>
  );
}

export function useLocalAtual(): LocalAtualState {
  const ctx = useContext(LocalAtualContext);
  if (!ctx) throw new Error('useLocalAtual precisa estar dentro de <LocalAtualProvider>');
  return ctx;
}
