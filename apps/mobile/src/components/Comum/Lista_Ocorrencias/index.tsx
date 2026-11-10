import React from 'react';
import { categoriasOrdenadas } from '../../../lib/categorias';
import type { Contagens } from '../../../lib/mapa';
import * as S from './styles';

/** Total de BOs e quantidade por tipo de crime (do mais frequente para o menos). */
const Lista_Ocorrencias = ({ contagens, limite }: { contagens: Contagens | null; limite?: number }) => {
  const total = contagens?.total ?? 0;
  if (total === 0) return <S.Vazio>Nenhum boletim de ocorrência com localização neste trecho.</S.Vazio>;
  const categorias = categoriasOrdenadas(contagens);
  const visiveis = limite ? categorias.slice(0, limite) : categorias;
  return (
    <>
      <S.Total>{`${total.toLocaleString('pt-BR')} ${total === 1 ? 'boletim de ocorrência' : 'boletins de ocorrência'}`}</S.Total>
      {visiveis.map((c) => (
        <S.Linha key={c.nome}>
          <S.Nome>{c.nome}</S.Nome>
          <S.Quantidade>{c.quantidade.toLocaleString('pt-BR')}</S.Quantidade>
        </S.Linha>
      ))}
    </>
  );
};

export default Lista_Ocorrencias;
