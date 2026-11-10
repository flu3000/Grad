import React from 'react';
import { NIVEL_INFO, corDoNivel, type Nivel } from '../../../theme/niveis';
import * as S from './styles';

/** Círculo com o número do nível, o rótulo e a explicação curta. */
const Selo_Nivel = ({ nivel, compacto = false }: { nivel: Nivel; compacto?: boolean }) => (
  <S.Linha>
    <S.Selo $cor={corDoNivel(nivel)} $compacto={compacto}>
      <S.SeloTexto $compacto={compacto}>{nivel}</S.SeloTexto>
    </S.Selo>
    <S.Coluna>
      <S.Rotulo $compacto={compacto}>{NIVEL_INFO[nivel].rotulo}</S.Rotulo>
      <S.Descricao>{NIVEL_INFO[nivel].descricao}</S.Descricao>
    </S.Coluna>
  </S.Linha>
);

export default Selo_Nivel;
