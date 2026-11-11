import React from 'react';
import Slider from '@react-native-community/slider';
import { useTheme } from 'styled-components/native';
import { useFiltro } from '../../../contexts/Filtro_Context';
import { rotuloAcessivelHora } from '../../../lib/filtro';
import { janelaDaHora } from '../../../lib/tempo';
import * as S from './styles';

/** Altura do painel (os balões sobem esse tanto quando ele aparece). */
export const ALTURA_PAINEL_HORA = 92;

/** Painel do modo "Por hora": slider de 24 posições e a janela de 3 h que o nível usa. */
const Painel_Hora = () => {
  const theme = useTheme();
  const { hora, setHora, setTocando } = useFiltro();
  return (
    <S.Container style={{ height: ALTURA_PAINEL_HORA }}>
      <S.Linha>
        <S.Janela>{janelaDaHora(hora)}</S.Janela>
        <S.Detalhe>{`Hora ${hora}h · registros de 3 horas em volta`}</S.Detalhe>
      </S.Linha>
      <Slider
        style={{ width: '100%', height: 36 }}
        minimumValue={0}
        maximumValue={23}
        step={1}
        value={hora}
        onSlidingStart={() => setTocando(false)}
        onValueChange={(v) => setHora(Math.round(v))}
        minimumTrackTintColor={theme.colors.accent}
        maximumTrackTintColor={theme.colors.border}
        thumbTintColor={theme.colors.accent}
        accessibilityLabel={rotuloAcessivelHora(hora)}
        accessibilityHint="Arraste para trocar a hora do mapa"
      />
      <S.Escala>
        {['0h', '6h', '12h', '18h', '23h'].map((t) => (
          <S.Marca key={t}>{t}</S.Marca>
        ))}
      </S.Escala>
    </S.Container>
  );
};

export default Painel_Hora;
