import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from 'styled-components/native';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import { nomeDoPeriodo, periodoAtual } from '../../../lib/tempo';
import { NIVEL_INFO, corDoNivel } from '../../../theme/niveis';
import * as S from './styles';

/** Card com o nível de registros de onde o usuário está (via locate_point). */
const Card_Nivel = ({ onPress }: { onPress?: () => void }) => {
  const theme = useTheme();
  const { permissao, info, carregando, erro } = useLocalAtual();
  // Confere o período a cada minuto (o card pode ficar aberto na virada da tarde para a noite).
  const [agora, setAgora] = useState(() => periodoAtual());
  useEffect(() => {
    const t = setInterval(() => setAgora(periodoAtual()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nivelAgora = info?.niveisPorPeriodo?.[agora] ?? null;

  let titulo: string;
  let detalhe: string;
  if (permissao === 'negada') {
    titulo = 'Localização desativada';
    detalhe = 'Permita o acesso à localização para ver o nível de onde você está.';
  } else if (erro) {
    titulo = 'Sem informação';
    detalhe = erro;
  } else if (!info) {
    titulo = 'Buscando sua localização…';
    detalhe = '';
  } else if (!info.distrito) {
    titulo = 'Fora de São Paulo';
    detalhe = 'Por enquanto o Grad cobre apenas o município de São Paulo.';
  } else {
    titulo = info.nivel ? `Nível ${info.nivel} · ${NIVEL_INFO[info.nivel].rotulo}` : 'Sem dados para este ponto';
    detalhe = `${info.distrito} · Subprefeitura ${info.subprefeitura}`;
    if (nivelAgora) detalhe = `Agora (${nomeDoPeriodo(agora)}): nível ${nivelAgora} · ${detalhe}`;
  }

  return (
    <S.Container onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${titulo}. ${detalhe}`}>
      <S.Indicador $cor={info?.nivel ? corDoNivel(info.nivel) : theme.colors.border} />
      <S.Textos>
        <S.Rotulo>Onde você está</S.Rotulo>
        <S.Titulo numberOfLines={1}>{titulo}</S.Titulo>
        {!!detalhe && <S.Detalhe numberOfLines={2}>{detalhe}</S.Detalhe>}
      </S.Textos>
      {carregando && <ActivityIndicator size="small" color={theme.colors.textSecondary} />}
    </S.Container>
  );
};

export default Card_Nivel;
