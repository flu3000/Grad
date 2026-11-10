import React from 'react';
import { Switch } from 'react-native';
import { useTheme } from 'styled-components/native';
import * as S from './styles';

interface Props {
  rotulo: string;
  descricao?: string;
  valor: boolean;
  onMudar: (valor: boolean) => void;
}

/** Linha com texto e um interruptor liga/desliga. */
const Linha_Interruptor = ({ rotulo, descricao, valor, onMudar }: Props) => {
  const theme = useTheme();
  return (
    <S.Linha>
      <S.Textos>
        <S.Rotulo>{rotulo}</S.Rotulo>
        {!!descricao && <S.Descricao>{descricao}</S.Descricao>}
      </S.Textos>
      <Switch
        value={valor}
        onValueChange={onMudar}
        trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
        thumbColor={theme.colors.card}
        accessibilityLabel={rotulo}
      />
    </S.Linha>
  );
};

export default Linha_Interruptor;
