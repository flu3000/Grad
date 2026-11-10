import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as S from './styles';

/** Tela rolável com o espaçamento do topo (área segura). A barra de abas fica abaixo, fora da tela. */
const Tela_Rolavel = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <S.Fundo>
      <S.Rolagem
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32, paddingHorizontal: 16 }}
      >
        <S.Titulo>{titulo}</S.Titulo>
        {children}
      </S.Rolagem>
    </S.Fundo>
  );
};

export default Tela_Rolavel;
