import React from 'react';
import { ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import Lista_Ocorrencias from '../../Comum/Lista_Ocorrencias';
import Selo_Nivel from '../../Comum/Selo_Nivel';
import { AREA_HEXAGONO, type LocalInfo, type Resolucao } from '../../../lib/mapa';
import type { Nivel } from '../../../theme/niveis';
import * as S from './styles';

interface Props {
  info: LocalInfo | null;
  resolucao: Resolucao;
  carregando: boolean;
  erro: boolean;
  onFechar: () => void;
  onTentarDeNovo: () => void;
  /** nível no filtro ativo, o mesmo da cor do hexágono no mapa */
  nivel: Nivel | null;
  /** "Noite: nível 9 · Dia inteiro: nível 7" (vazio no dia inteiro) */
  linhaFiltro: string | null;
  /** espaço embaixo (painel de hora) */
  base?: number;
}

/** Balão com as estatísticas do hexágono tocado no mapa. */
const Balao_Hexagono = ({ info, resolucao, carregando, erro, onFechar, onTentarDeNovo, nivel, linhaFiltro, base = 0 }: Props) => {
  const theme = useTheme();
  return (
    <S.Container $base={base}>
      <S.Cabecalho>
        <S.Titulos>
          <S.Rotulo>{`Hexágono selecionado · ${AREA_HEXAGONO[resolucao]}`}</S.Rotulo>
          <S.Titulo numberOfLines={1}>{info?.distrito ?? (carregando ? 'Carregando…' : 'Fora de São Paulo')}</S.Titulo>
          {!!info?.subprefeitura && <S.Subtitulo numberOfLines={1}>{`Subprefeitura ${info.subprefeitura}`}</S.Subtitulo>}
        </S.Titulos>
        <S.Fechar onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12}>
          <X color={theme.colors.textSecondary} size={22} />
        </S.Fechar>
      </S.Cabecalho>

      {carregando && !info && <ActivityIndicator color={theme.colors.textPrimary} />}
      {erro && (
        <S.Erro onPress={onTentarDeNovo} accessibilityRole="button">
          <S.ErroTexto>Não foi possível carregar este hexágono. Tocar para tentar de novo.</S.ErroTexto>
        </S.Erro>
      )}
      {info && (
        <S.Rolagem>
          {nivel && (
            <S.Bloco>
              <Selo_Nivel nivel={nivel} compacto />
              {!!linhaFiltro && <S.LinhaFiltro accessibilityLiveRegion="polite">{linhaFiltro}</S.LinhaFiltro>}
            </S.Bloco>
          )}
          <S.Bloco>
            <S.Secao>{info.ano ? `Registros em ${info.ano}` : 'Registros'}</S.Secao>
            <Lista_Ocorrencias contagens={info.contagens} />
          </S.Bloco>
        </S.Rolagem>
      )}
    </S.Container>
  );
};

export default Balao_Hexagono;
