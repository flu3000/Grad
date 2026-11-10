import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import MapView, { Polygon, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';
import Card_Nivel from '../../../components/Mapa/Card_Nivel';
import Balao_Hexagono from '../../../components/Mapa/Balao_Hexagono';
import Balao_Unidade from '../../../components/Mapa/Balao_Unidade';
import Legenda from '../../../components/Mapa/Legenda';
import Marcador_Unidade from '../../../components/Mapa/Marcador_Unidade';
import { useConfig } from '../../../contexts/Config_Context';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import {
  buscarHexagonos,
  centroDoHexagono,
  localizarPonto,
  type Hexagono,
  type LocalInfo,
  type Resolucao,
} from '../../../lib/mapa';
import { DELTA_MAXIMO_UNIDADES, buscarUnidades, type Unidade } from '../../../lib/unidades';
import type { TelaDaAba } from '../../../navigation/tipos';
import { mapStyleEscuro } from '../../../theme/mapStyle';
import { preenchimentoDoNivel, type Intensidade } from '../../../theme/niveis';
import * as S from './styles';

// Centro de São Paulo, usado enquanto a localização não chega (ou se for negada).
const REGIAO_SP: Region = { latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const DELTA_LOCAL = 0.03; // zoom ao centralizar no usuário (resolução 9)
const ESPERA_MS = 350; // espera depois do último movimento do mapa antes de buscar os hexágonos

interface PropsHex {
  hex: Hexagono;
  contorno: string;
  intensidade: Intensidade;
  selecionado: boolean;
  onSelecionar: (hex: Hexagono) => void;
}

const Hex = memo(({ hex, contorno, intensidade, selecionado, onSelecionar }: PropsHex) => (
  <Polygon
    coordinates={hex.coordenadas}
    fillColor={preenchimentoDoNivel(hex.nivel, intensidade)}
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
  const { config, esquema } = useConfig();
  const mostrarUnidades = useRef(config.mostrarUnidades);
  mostrarUnidades.current = config.mostrarUnidades;
  const regiaoAtual = useRef<Region>(REGIAO_SP);
  const mapa = useRef<MapView>(null);
  const centralizou = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requisicao = useRef<AbortController | null>(null);

  const [hexagonos, setHexagonos] = useState<Hexagono[]>([]);
  const [resolucao, setResolucao] = useState<Resolucao>(7);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeSel, setUnidadeSel] = useState<Unidade | null>(null);
  const consultaSelecao = useRef(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [ultimaRegiao, setUltimaRegiao] = useState<Region>(REGIAO_SP);

  const carregar = useCallback(async (regiao: Region) => {
    requisicao.current?.abort();
    const controle = new AbortController();
    requisicao.current = controle;
    setCarregando(true);
    const comUnidades = mostrarUnidades.current && regiao.latitudeDelta <= DELTA_MAXIMO_UNIDADES;
    // As unidades vêm em paralelo; se falharem, os hexágonos aparecem do mesmo jeito.
    const pedidoUnidades = comUnidades ? buscarUnidades(regiao, controle.signal).catch(() => null) : Promise.resolve([]);
    try {
      const { res, hexagonos: novos } = await buscarHexagonos(regiao, controle.signal);
      const novasUnidades = await pedidoUnidades;
      if (controle.signal.aborted) return;
      setHexagonos(novos);
      setResolucao(res);
      if (novasUnidades) setUnidades(novasUnidades);
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
      regiaoAtual.current = regiao;
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => carregar(regiao), ESPERA_MS);
    },
    [carregar],
  );

  // Toque num hexágono: abre o balão e consulta distrito, subprefeitura e contagens do centro dele.
  const selecionar = useCallback(
    async (hex: Hexagono, res: Resolucao) => {
      const id = ++consultaSelecao.current;
      setUnidadeSel(null);
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
  const selecionarUnidade = useCallback(
    (u: Unidade) => {
      fecharSelecao();
      setUnidadeSel(u);
    },
    [fecharSelecao],
  );

  // Ligar/desligar as unidades nas configurações recarrega a região atual.
  useEffect(() => {
    if (!config.mostrarUnidades) {
      setUnidades([]);
      setUnidadeSel(null);
    } else carregar(regiaoAtual.current);
  }, [config.mostrarUnidades, carregar]);

  // Primeira carga (cidade inteira) e limpeza ao sair da tela.
  useEffect(() => {
    carregar(REGIAO_SP);
    return () => {
      if (espera.current) clearTimeout(espera.current);
      requisicao.current?.abort();
    };
  }, [carregar]);

  // Centraliza no usuário uma única vez, quando a localização chega (se estiver ligado nas configurações).
  useEffect(() => {
    if (!coords || centralizou.current || !config.centralizarAoAbrir) return;
    centralizou.current = true;
    mapa.current?.animateToRegion({ ...coords, latitudeDelta: DELTA_LOCAL, longitudeDelta: DELTA_LOCAL }, 600);
  }, [coords, config.centralizarAoAbrir]);

  return (
    <S.Container>
      <MapView
        ref={mapa}
        style={{ flex: 1 }}
        initialRegion={REGIAO_SP}
        onRegionChangeComplete={aoMoverMapa}
        customMapStyle={esquema === 'escuro' ? mapStyleEscuro : []}
        userInterfaceStyle={esquema === 'escuro' ? 'dark' : 'light'}
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
              intensidade={config.intensidade}
              selecionado={selecionado}
              onSelecionar={aoTocarHex}
            />
          );
        })}
        {config.mostrarUnidades &&
          ultimaRegiao.latitudeDelta <= DELTA_MAXIMO_UNIDADES &&
          unidades.map((u) => (
            <Marcador_Unidade key={u.id} unidade={u} selecionada={unidadeSel?.id === u.id} onSelecionar={selecionarUnidade} />
          ))}
      </MapView>

      <S.Topo $topInset={insets.top}>
        <Card_Nivel onPress={() => navigation.navigate('Area')} />
        <S.LinhaInferior>
          {config.mostrarLegenda ? <Legenda comUnidades={config.mostrarUnidades} /> : <S.Espaco />}
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
      {unidadeSel && <Balao_Unidade unidade={unidadeSel} onFechar={() => setUnidadeSel(null)} />}
    </S.Container>
  );
};

export default Mapa;
