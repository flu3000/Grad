import React from 'react';
import * as S from './styles';

interface Props<T extends string> {
  rotulo: string;
  opcoes: { valor: T; texto: string }[];
  valor: T;
  onMudar: (valor: T) => void;
}

/** Escolha entre poucas opções (ex.: Sistema / Claro / Escuro). */
function Opcao_Segmentada<T extends string>({ rotulo, opcoes, valor, onMudar }: Props<T>) {
  return (
    <S.Bloco>
      <S.Rotulo>{rotulo}</S.Rotulo>
      <S.Grupo accessibilityRole="radiogroup" accessibilityLabel={rotulo}>
        {opcoes.map((o) => {
          const ativa = o.valor === valor;
          return (
            <S.Opcao
              key={o.valor}
              $ativa={ativa}
              onPress={() => onMudar(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativa }}
            >
              <S.Texto $ativa={ativa}>{o.texto}</S.Texto>
            </S.Opcao>
          );
        })}
      </S.Grupo>
    </S.Bloco>
  );
}

export default Opcao_Segmentada;
