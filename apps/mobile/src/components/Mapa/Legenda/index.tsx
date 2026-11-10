import React, { useState } from 'react';
import { NIVEIS, NIVEL_INFO, corDoNivel } from '../../../theme/niveis';
import * as S from './styles';

/** Legenda dos níveis; toque para recolher/expandir. */
const Legenda = () => {
  const [aberta, setAberta] = useState(true);
  return (
    <S.Container onPress={() => setAberta((a) => !a)} accessibilityRole="button" accessibilityLabel="Legenda dos níveis">
      <S.Titulo>{aberta ? 'Nível de perigo' : 'Legenda'}</S.Titulo>
      {aberta &&
        NIVEIS.slice()
          .reverse()
          .map((n) => (
            <S.Linha key={n}>
              <S.Amostra $cor={corDoNivel(n)} />
              <S.Texto>{`${n} · ${NIVEL_INFO[n].rotulo}`}</S.Texto>
            </S.Linha>
          ))}
    </S.Container>
  );
};

export default Legenda;
