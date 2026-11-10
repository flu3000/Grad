import React, { useState } from 'react';
import { useTheme } from 'styled-components/native';
import { INFO_UNIDADE, TIPOS_UNIDADE } from '../../../lib/unidades';
import { NIVEIS, NIVEL_INFO, corDoNivel } from '../../../theme/niveis';
import * as S from './styles';

/** Legenda dos níveis (e das unidades de segurança, se ligadas); toque para recolher/expandir. */
const Legenda = ({ comUnidades = false }: { comUnidades?: boolean }) => {
  const theme = useTheme();
  const [aberta, setAberta] = useState(true);
  return (
    <S.Container onPress={() => setAberta((a) => !a)} accessibilityRole="button" accessibilityLabel="Legenda do mapa">
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
      {aberta && comUnidades && (
        <>
          <S.Titulo style={{ marginTop: 10 }}>Segurança pública</S.Titulo>
          {TIPOS_UNIDADE.map((t) => {
            const Icone = INFO_UNIDADE[t].icone;
            return (
              <S.Linha key={t}>
                <S.Bolinha $cor={theme.colors.unidades[t]}>
                  <Icone color={theme.colors.onUnidade} size={10} strokeWidth={2.6} />
                </S.Bolinha>
                <S.Texto>{INFO_UNIDADE[t].rotulo}</S.Texto>
              </S.Linha>
            );
          })}
        </>
      )}
    </S.Container>
  );
};

export default Legenda;
