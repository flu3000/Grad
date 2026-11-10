import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from 'styled-components/native';
import Tela_Rolavel from '../../../components/Comum/Tela_Rolavel';
import * as C from '../../../components/Comum/Tela_Rolavel/styles';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import { categoriasOrdenadas } from '../../../lib/categorias';
import { NIVEL_INFO, corDoNivel } from '../../../theme/niveis';
import * as S from './styles';

const MAX_CATEGORIAS = 6;

/** Detalhes do lugar onde o usuário está: distrito, subprefeitura, nível e principais ocorrências. */
const Area = () => {
  const theme = useTheme();
  const { permissao, info, carregando, erro, atualizar } = useLocalAtual();

  if (permissao === 'negada') {
    return (
      <Tela_Rolavel titulo="Sua área">
        <C.Secao>
          <C.Texto>Sem acesso à localização, não dá para saber em que área você está.</C.Texto>
          <C.Botao onPress={atualizar}>
            <C.BotaoTexto>Permitir localização</C.BotaoTexto>
          </C.Botao>
          <C.TextoSecundario>Se nada acontecer, libere a localização do Grad nos ajustes do celular.</C.TextoSecundario>
        </C.Secao>
      </Tela_Rolavel>
    );
  }

  if (!info) {
    return (
      <Tela_Rolavel titulo="Sua área">
        <C.Secao>
          {erro ? (
            <>
              <C.Texto>{erro}</C.Texto>
              <C.Botao onPress={atualizar}>
                <C.BotaoTexto>Tentar de novo</C.BotaoTexto>
              </C.Botao>
            </>
          ) : (
            <ActivityIndicator color={theme.colors.textPrimary} />
          )}
        </C.Secao>
      </Tela_Rolavel>
    );
  }

  if (!info.distrito) {
    return (
      <Tela_Rolavel titulo="Sua área">
        <C.Secao>
          <C.Texto>Você está fora do município de São Paulo, que é a única cidade coberta por enquanto.</C.Texto>
        </C.Secao>
      </Tela_Rolavel>
    );
  }

  const categorias = categoriasOrdenadas(info.contagens).slice(0, MAX_CATEGORIAS);
  const total = info.contagens?.total ?? 0;

  return (
    <Tela_Rolavel titulo="Sua área">
      <C.Secao>
        <C.Subtitulo>Distrito</C.Subtitulo>
        <S.Nome>{info.distrito}</S.Nome>
        <C.TextoSecundario>Subprefeitura {info.subprefeitura}</C.TextoSecundario>
      </C.Secao>

      <C.Secao>
        <C.Subtitulo>Nível de perigo aqui</C.Subtitulo>
        {info.nivel ? (
          <S.LinhaNivel>
            <S.Selo $cor={corDoNivel(info.nivel)}>
              <S.SeloTexto>{info.nivel}</S.SeloTexto>
            </S.Selo>
            <S.ColunaNivel>
              <S.Nome>{NIVEL_INFO[info.nivel].rotulo}</S.Nome>
              <C.TextoSecundario>{NIVEL_INFO[info.nivel].descricao}</C.TextoSecundario>
            </S.ColunaNivel>
          </S.LinhaNivel>
        ) : (
          <C.Texto>Ainda não há dados para este ponto.</C.Texto>
        )}
        {carregando && <ActivityIndicator style={{ marginTop: 8 }} color={theme.colors.textSecondary} />}
      </C.Secao>

      <C.Secao>
        <C.Subtitulo>Ocorrências em 2025 (raio de ~500 m)</C.Subtitulo>
        {total === 0 ? (
          <C.Texto>Nenhum boletim de ocorrência com localização neste trecho.</C.Texto>
        ) : (
          <>
            <C.Texto>{`${total.toLocaleString('pt-BR')} boletins de ocorrência`}</C.Texto>
            {categorias.map((c) => (
              <S.LinhaCategoria key={c.nome}>
                <C.TextoSecundario>{c.nome}</C.TextoSecundario>
                <S.Quantidade>{c.quantidade.toLocaleString('pt-BR')}</S.Quantidade>
              </S.LinhaCategoria>
            ))}
          </>
        )}
      </C.Secao>

      <C.TextoSecundario>
        Fonte: boletins de ocorrência da SSP-SP de 2025 com localização. O nível compara este trecho com o resto da
        cidade, ponderando a gravidade de cada crime. Casos de estupro, publicados sem localização exata, são distribuídos
        pelo distrito.
      </C.TextoSecundario>
    </Tela_Rolavel>
  );
};

export default Area;
