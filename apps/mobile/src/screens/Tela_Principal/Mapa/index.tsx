import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import MapView, { Polygon, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';
import Card_Nivel from '../../../components/Mapa/Card_Nivel';
import Legenda from '../../../components/Mapa/Legenda';
import { ALTURA_BARRA } from '../../../components/Tela_Principal/Bottom_Navigation_Bar/styles';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import { buscarHexagonos, type Hexagono } from '../../../lib/mapa';
import type { TelaDaAba } from '../../../navigation/tipos';
import { mapStyleEscuro } from '../../../theme/mapStyle';
import { preenchimentoDoNivel } from '../../../theme/niveis';
import * as S from './styles';

// Centro de São Paulo, usado enquanto a localização não chega (ou se for negada).
const REGIAO_SP: Region = { latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const DELTA_LOCAL = 0.03; // zoom ao centralizar no usuário (resolução 9)
const ESPERA_MS = 350; // espera depois do último movimento do mapa antes de buscar os hexágonos

const Hex = memo(({ hex, contorno }: { hex: Hexagono; contorno: string }) => (
  <Polygon
    coordinates={hex.coordenadas}
    fillColor={preenchimentoDoNivel(hex.nivel)}
    strokeColor={contorno}
    strokeWidth={0.5}
  />
));

const Mapa = ({ navigation }: TelaDaAba<'Mapa'>) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { coords } = useLocalAtual();
  const mapa = useRef<MapView>(null);
  const centralizou = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requisicao = useRef<AbortController | null>(null);

  const [hexagonos, setHexagonos] = useState<Hexagono[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [ultimaRegiao, setUltimaRegiao] = useState<Region>(REGIAO_SP);

  const carregar = useCallback(async (regiao: Region) => {
    requisicao.current?.abort();
    const controle = new AbortController();
    requisicao.current = controle;
    setCarregando(true);
    try {
      const { hexagonos: novos } = await buscarHexagonos(regiao, controle.signal);
      if (controle.signal.aborted) return;
      setHexagonos(novos);
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
        mapPadding={{ top: insets.top + 96, right: 0, bottom: ALTURA_BARRA + insets.bottom + 16, left: 0 }}
      >
        {hexagonos.map((h) => (
          <Hex key={h.h3} hex={h} contorno={theme.colors.hexStroke} />
        ))}
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
    </S.Container>
  );
};

export default Mapa;
