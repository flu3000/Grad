import React, { useState } from 'react';
import { useTheme } from 'styled-components/native';
import { INFO_UNIDADE, TIPOS_UNIDADE } from '../../../lib/unidades';
import { NIVEIS, NIVEL_INFO, NIVEL_MAXIMO, corDoNivel, textoSobreNivel } from '../../../theme/niveis';
import * as S from './styles';

/**
 * Legenda compacta: faixa com os 10 níveis, o filtro ativo com a nota dos registros que ficam de fora e as unidades de
 * segurança (se ligadas). Toque para recolher/expandir.
 */
interface Props {
  comUnidades?: boolean;
  /** filtro ativo ("Noite", "18h–21h"); vazio no dia inteiro */
  filtro?: string | null;
  /** nota sobre os registros que o filtro deixa de fora */
  nota?: string | null;
}

const Legenda = ({ comUnidades = false, filtro, nota }: Props) => {
  const theme = useTheme();
  const [aberta, setAberta] = useState(true);
  return (
    <S.Container onPress={() => setAberta((a) => !a)} accessibilityRole="button" accessibilityLabel="Legenda do mapa">
      <S.Titulo>{aberta ? `Nível de registros${filtro ? ` · ${filtro}` : ''}` : filtro ? `Legenda · ${filtro}` : 'Legenda'}</S.Titulo>
      {aberta && (
        <>
          <S.Faixa>
            {NIVEIS.map((n) => (
              <S.Quadrado key={n} $cor={corDoNivel(n)} accessibilityLabel={`Nível ${n}: ${NIVEL_INFO[n].rotulo}`}>
                <S.Numero $cor={textoSobreNivel(n)}>{n}</S.Numero>
              </S.Quadrado>
            ))}
          </S.Faixa>
          <S.Extremos>
            <S.Texto>{NIVEL_INFO[1].rotulo}</S.Texto>
            <S.Texto>{NIVEL_INFO[NIVEL_MAXIMO].rotulo}</S.Texto>
          </S.Extremos>
          {!!nota && <S.Nota>{nota}</S.Nota>}
        </>
      )}
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
