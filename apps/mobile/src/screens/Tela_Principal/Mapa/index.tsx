import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState } from 'react-native';
import MapView, { Polygon, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';
import Card_Nivel from '../../../components/Mapa/Card_Nivel';
import Balao_Hexagono from '../../../components/Mapa/Balao_Hexagono';
import Balao_Unidade from '../../../components/Mapa/Balao_Unidade';
import Filtro_Periodo from '../../../components/Mapa/Filtro_Periodo';
import Legenda from '../../../components/Mapa/Legenda';
import Marcador_Unidade from '../../../components/Mapa/Marcador_Unidade';
import Painel_Hora, { ALTURA_PAINEL_HORA } from '../../../components/Mapa/Painel_Hora';
import Seletor_Ano from '../../../components/Mapa/Seletor_Ano';
import { useConfig } from '../../../contexts/Config_Context';
import { useFiltro } from '../../../contexts/Filtro_Context';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import { useReduzirMovimento } from '../../../hooks/useReduzirMovimento';
import { notaHora, notaPeriodo } from '../../../lib/anosDados';
import {
  PASSO_MS,
  dadosDoFiltro,
  fraseNivelDoFiltro,
  nivelNoFiltro,
  rotuloFiltro,
  temDadosDoFiltro,
  type Filtro,
} from '../../../lib/filtro';
import {
  buscarHexagonos,
  centroDoHexagono,
  localizarPonto,
  type Hexagono,
  type LocalInfo,
  type Resolucao,
} from '../../../lib/mapa';
import type { IndicePeriodo } from '../../../lib/tempo';
import { DELTA_MAXIMO_UNIDADES, buscarUnidades, type Unidade } from '../../../lib/unidades';
import type { TelaDaAba } from '../../../navigation/tipos';
import { mapStyleEscuro } from '../../../theme/mapStyle';
import { preenchimentoDoNivel, type Intensidade, type Nivel } from '../../../theme/niveis';
import * as S from './styles';

// Centro de São Paulo, usado enquanto a localização não chega (ou se for negada).
const REGIAO_SP: Region = { latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.3, longitudeDelta: 0.3 };
const DELTA_LOCAL = 0.03; // zoom ao centralizar no usuário (resolução 9)
const ESPERA_MS = 350; // espera depois do último movimento do mapa antes de buscar os hexágonos

interface PropsHex {
  hex: Hexagono;
  /** nível no filtro ativo: o polígono só é redesenhado quando ele (ou a seleção) muda */
  nivel: Nivel;
  contorno: string;
  intensidade: Intensidade;
  selecionado: boolean;
  onSelecionar: (hex: Hexagono) => void;
}

const Hex = memo(({ hex, nivel, contorno, intensidade, selecionado, onSelecionar }: PropsHex) => (
  <Polygon
    coordinates={hex.coordenadas}
    fillColor={preenchimentoDoNivel(nivel, intensidade)}
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
  const { ano, infoAno, modo, periodo, hora, tocando, setTocando, setPeriodo, setHora } = useFiltro();
  const reduzirMovimento = useReduzirMovimento();
  const anoRef = useRef(ano);
  anoRef.current = ano;
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const mostrarUnidades = useRef(config.mostrarUnidades);
  mostrarUnidades.current = config.mostrarUnidades;
  const regiaoAtual = useRef<Region>(REGIAO_SP);
  const mapa = useRef<MapView>(null);
  const centralizou = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requisicao = useRef<AbortController | null>(null);

  const [hexagonos, setHexagonos] = useState<Hexagono[]>([]);
  const hexagonosRef = useRef(hexagonos);
  hexagonosRef.current = hexagonos;
  const [resolucao, setResolucao] = useState<Resolucao>(7);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeSel, setUnidadeSel] = useState<Unidade | null>(null);
  const consultaSelecao = useRef(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [ultimaRegiao, setUltimaRegiao] = useState<Region>(REGIAO_SP);

  // Os hexágonos antigos ficam na tela até os novos chegarem (no play, o mapa não pisca nem volta ao dia inteiro).
  const carregar = useCallback(async (regiao: Region) => {
    requisicao.current?.abort();
    const controle = new AbortController();
    requisicao.current = controle;
    setCarregando(true);
    const comUnidades = mostrarUnidades.current && regiao.latitudeDelta <= DELTA_MAXIMO_UNIDADES;
    // As unidades vêm em paralelo; se falharem, os hexágonos aparecem do mesmo jeito.
    const pedidoUnidades = comUnidades ? buscarUnidades(regiao, controle.signal).catch(() => null) : Promise.resolve([]);
    try {
      const { res, hexagonos: novos } = await buscarHexagonos(
        regiao,
        { ano: anoRef.current, ...dadosDoFiltro(modoRef.current) },
        controle.signal,
      );
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
  const selecionar = useCallback(async (hex: Hexagono, res: Resolucao) => {
    const id = ++consultaSelecao.current;
    setUnidadeSel(null);
    setSelecao({ hex, resolucao: res, info: null, carregando: true, erro: false });
    const { latitude, longitude } = centroDoHexagono(hex);
    try {
      const info = await localizarPonto(latitude, longitude, res, anoRef.current);
      if (id === consultaSelecao.current) setSelecao({ hex, resolucao: res, info, carregando: false, erro: false });
    } catch {
      if (id === consultaSelecao.current) setSelecao({ hex, resolucao: res, info: null, carregando: false, erro: true });
    }
  }, []);
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

  // Trocar o ano recarrega o mapa e o hexágono selecionado.
  const selecaoRef = useRef(selecao);
  selecaoRef.current = selecao;
  const primeiroAno = useRef(true);
  useEffect(() => {
    if (primeiroAno.current) {
      primeiroAno.current = false;
      return;
    }
    carregar(regiaoAtual.current);
    const sel = selecaoRef.current;
    if (sel) selecionar(sel.hex, sel.resolucao);
  }, [ano, carregar, selecionar]);

  // Período/hora: busca os níveis uma vez por região; depois as cores mudam só no aparelho.
  useEffect(() => {
    const atuais = hexagonosRef.current;
    if (atuais.length && !temDadosDoFiltro(atuais[0], modo)) carregar(regiaoAtual.current);
  }, [modo, carregar]);

  // Play: avança o período (1,2 s) ou a hora (0,7 s), em loop.
  useEffect(() => {
    if (!tocando || modo === 'dia_inteiro') return;
    const t = setInterval(() => {
      if (modo === 'periodo') setPeriodo((p) => (((p + 1) % 4) as IndicePeriodo));
      else setHora((h) => (h + 1) % 24);
    }, PASSO_MS[modo]);
    return () => clearInterval(t);
  }, [tocando, modo, setPeriodo, setHora]);

  // O play pausa ao sair da aba, quando o app vai para segundo plano e se "reduzir movimento" for ligado.
  useEffect(() => navigation.addListener('blur', () => setTocando(false)), [navigation, setTocando]);
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') setTocando(false);
    });
    return () => assinatura.remove();
  }, [setTocando]);
  useEffect(() => {
    if (reduzirMovimento) setTocando(false);
  }, [reduzirMovimento, setTocando]);

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

  const filtro: Filtro = useMemo(() => ({ modo, periodo, hora }), [modo, periodo, hora]);
  const rotuloDoFiltro = modo === 'dia_inteiro' ? null : rotuloFiltro(filtro);
  const nota = !infoAno ? null : modo === 'periodo' ? notaPeriodo(infoAno) : modo === 'hora' ? notaHora(infoAno) : null;
  const base = modo === 'hora' ? ALTURA_PAINEL_HORA + 8 : 0;

  // O balão usa o hexágono da lista atual (que pode ter recebido os níveis do filtro depois do toque).
  const hexSelecionado = selecao ? (hexagonos.find((h) => h.h3 === selecao.hex.h3) ?? selecao.hex) : null;
  const nivelSelecionado = hexSelecionado ? nivelNoFiltro(hexSelecionado, filtro) : null;

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
        mapPadding={{ top: insets.top + 180, right: 0, bottom: base, left: 0 }}
      >
        {hexagonos.map((h) => {
          const selecionado = selecao?.hex.h3 === h.h3;
          return (
            <Hex
              key={h.h3}
              hex={h}
              nivel={nivelNoFiltro(h, filtro) ?? h.nivel}
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
        <S.LinhaFiltros>
          <Seletor_Ano />
          <Filtro_Periodo />
        </S.LinhaFiltros>
        <S.LinhaInferior>
          <Legenda comUnidades={config.mostrarUnidades} filtro={rotuloDoFiltro} nota={nota} />
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

      {modo === 'hora' && <Painel_Hora />}

      {selecao && hexSelecionado && (
        <Balao_Hexagono
          info={selecao.info}
          resolucao={selecao.resolucao}
          carregando={selecao.carregando}
          erro={selecao.erro}
          onFechar={fecharSelecao}
          onTentarDeNovo={() => selecionar(selecao.hex, selecao.resolucao)}
          nivel={nivelSelecionado ?? hexSelecionado.nivel}
          linhaFiltro={fraseNivelDoFiltro(nivelSelecionado, hexSelecionado.nivel, filtro)}
          base={base}
        />
      )}
      {unidadeSel && <Balao_Unidade unidade={unidadeSel} onFechar={() => setUnidadeSel(null)} base={base} />}
    </S.Container>
  );
};

export default Mapa;
