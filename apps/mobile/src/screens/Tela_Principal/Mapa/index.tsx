import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import MapView, { Polygon, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';
import Card_Nivel from '../../../components/Mapa/Card_Nivel';
import Balao_Hexagono from '../../../components/Mapa/Balao_Hexagono';
import Legenda from '../../../components/Mapa/Legenda';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import {
  buscarHexagonos,
  centroDoHexagono,
  localizarPonto,
  type Hexagono,
  type LocalInfo,
  type Resolucao,
} from '../../../lib/mapa';
import type { TelaDaAba } from '../../../navigation/tipos';
import { mapStyleEscuro } from '../../../theme/mapStyle';
import { preenchimentoDoNivel } from '../../../theme/niveis';
import * as S from './styles';

// Centro de São Paulo, usado enquanto a localização não chega (ou se for negada).
const REGIAO_SP: Region = { latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const DELTA_LOCAL = 0.03; // zoom ao centralizar no usuário (resolução 9)
const ESPERA_MS = 350; // espera depois do último movimento do mapa antes de buscar os hexágonos

interface PropsHex {
  hex: Hexagono;
  contorno: string;
  selecionado: boolean;
  onSelecionar: (hex: Hexagono) => void;
}

const Hex = memo(({ hex, contorno, selecionado, onSelecionar }: PropsHex) => (
  <Polygon
    coordinates={hex.coordenadas}
    fillColor={preenchimentoDoNivel(hex.nivel)}
    strokeColor={contorno}
    strokeWidth={selecionado ? 3 : 0.5}
    zIndex={selecionado ? 1 : 0}
    tappable
    onPress={() => onSelecionar(hex)}
  />
));

interface Selecao {
  hex: Hexagono;
  resolucao: Resolucao;
  info: LocalInfo | null;
  carregando: boolean;
  erro: boolean;
}

const Mapa = ({ navigation }: TelaDaAba<'Mapa'>) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { coords } = useLocalAtual();
  const mapa = useRef<MapView>(null);
  const centralizou = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requisicao = useRef<AbortController | null>(null);

  const [hexagonos, setHexagonos] = useState<Hexagono[]>([]);
  const [resolucao, setResolucao] = useState<Resolucao>(7);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const consultaSelecao = useRef(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [ultimaRegiao, setUltimaRegiao] = useState<Region>(REGIAO_SP);

  const carregar = useCallback(async (regiao: Region) => {
    requisicao.current?.abort();
    const controle = new AbortController();
    requisicao.current = controle;
    setCarregando(true);
    try {
      const { res, hexagonos: novos } = await buscarHexagonos(regiao, controle.signal);
      if (controle.signal.aborted) return;
      setHexagonos(novos);
      setResolucao(res);
      setErro(false);
    } catch {
      if (!controle.signal.aborted) setErro(true);
    } finally {
      if (requisicao.current === controle) setCarregando(false);
    }
  }, []);

  const aoMoverMapa = useCallback(
    (regiao: Region) => {
      setUltimaRegiao(regiao);
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => carregar(regiao), ESPERA_MS);
    },
    [carregar],
  );

  // Toque num hexágono: abre o balão e consulta distrito, subprefeitura e contagens do centro dele.
  const selecionar = useCallback(
    async (hex: Hexagono, res: Resolucao) => {
      const id = ++consultaSelecao.current;
      setSelecao({ hex, resolucao: res, info: null, carregando: true, erro: false });
      const { latitude, longitude } = centroDoHexagono(hex);
      try {
        const info = await localizarPonto(latitude, longitude, res);
        if (id === consultaSelecao.current) setSelecao({ hex, resolucao: res, info, carregando: false, erro: false });
      } catch {
        if (id === consultaSelecao.current) setSelecao({ hex, resolucao: res, info: null, carregando: false, erro: true });
      }
    },
    [],
  );
  const aoTocarHex = useCallback((hex: Hexagono) => selecionar(hex, resolucao), [selecionar, resolucao]);
  const fecharSelecao = useCallback(() => {
    consultaSelecao.current++;
    setSelecao(null);
  }, []);

  // Primeira carga (cidade inteira) e limpeza ao sair da tela.
  useEffect(() => {
    carregar(REGIAO_SP);
    return () => {
      if (espera.current) clearTimeout(espera.current);
      requisicao.current?.abort();
    };
  }, [carregar]);

  // Centraliza no usuário uma única vez, quando a localização chega.
  useEffect(() => {
    if (!coords || centralizou.current) return;
    centralizou.current = true;
    mapa.current?.animateToRegion({ ...coords, latitudeDelta: DELTA_LOCAL, longitudeDelta: DELTA_LOCAL }, 600);
  }, [coords]);

  return (
    <S.Container>
      <MapView
        ref={mapa}
        style={{ flex: 1 }}
        initialRegion={REGIAO_SP}
        onRegionChangeComplete={aoMoverMapa}
        customMapStyle={mapStyleEscuro}
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton
        toolbarEnabled={false}
        mapPadding={{ top: insets.top + 96, right: 0, bottom: 0, left: 0 }}
      >
        {hexagonos.map((h) => {
          const selecionado = selecao?.hex.h3 === h.h3;
          return (
            <Hex
              key={h.h3}
              hex={h}
              contorno={selecionado ? theme.colors.textPrimary : theme.colors.hexStroke}
              selecionado={selecionado}
              onSelecionar={aoTocarHex}
            />
          );
        })}
      </MapView>

      <S.Topo $topInset={insets.top}>
        <Card_Nivel onPress={() => navigation.navigate('Area')} />
        <S.LinhaInferior>
          <Legenda />
          <S.Status>
            {carregando && <ActivityIndicator size="small" color={theme.colors.textPrimary} />}
            {erro && !carregando && (
              <S.Aviso onPress={() => carregar(ultimaRegiao)} accessibilityRole="button">
                <S.AvisoTexto>Falha ao carregar o mapa. Tocar para tentar de novo.</S.AvisoTexto>
              </S.Aviso>
            )}
          </S.Status>
        </S.LinhaInferior>
      </S.Topo>

      {selecao && (
        <Balao_Hexagono
          info={selecao.info}
          resolucao={selecao.resolucao}
          carregando={selecao.carregando}
          erro={selecao.erro}
          onFechar={fecharSelecao}
          onTentarDeNovo={() => selecionar(selecao.hex, selecao.resolucao)}
        />
      )}
    </S.Container>
  );
};

export default Mapa;
