import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from 'styled-components/native';
import Tela_Rolavel from '../../../components/Comum/Tela_Rolavel';
import * as C from '../../../components/Comum/Tela_Rolavel/styles';
import { useFiltro } from '../../../contexts/Filtro_Context';
import { useLocalAtual } from '../../../contexts/Local_Atual_Context';
import { rotuloAno, rotuloFonte } from '../../../lib/formatacao';
import Lista_Ocorrencias from '../../../components/Comum/Lista_Ocorrencias';
import Selo_Nivel from '../../../components/Comum/Selo_Nivel';
import { AREA_HEXAGONO } from '../../../lib/mapa';
import * as S from './styles';

/** Detalhes do lugar onde o usuário está: distrito, subprefeitura, nível e principais ocorrências. */
const Area = () => {
  const theme = useTheme();
  const { permissao, info, carregando, erro, atualizar } = useLocalAtual();
  const { infoAno } = useFiltro();

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

  return (
    <Tela_Rolavel titulo="Sua área">
      <C.Secao>
        <C.Subtitulo>Distrito</C.Subtitulo>
        <S.Nome>{info.distrito}</S.Nome>
        <C.TextoSecundario>Subprefeitura {info.subprefeitura}</C.TextoSecundario>
      </C.Secao>

      <C.Secao>
        <C.Subtitulo>{infoAno ? `Nível de registros aqui · ${rotuloAno(infoAno)}` : 'Nível de registros aqui'}</C.Subtitulo>
        {info.nivel ? (
          <Selo_Nivel nivel={info.nivel} />
        ) : (
          <C.Texto>Ainda não há dados para este ponto.</C.Texto>
        )}
        {carregando && <ActivityIndicator style={{ marginTop: 8 }} color={theme.colors.textSecondary} />}
      </C.Secao>

      <C.Secao>
        <C.Subtitulo>{`Registros${infoAno ? ` em ${rotuloAno(infoAno)}` : ''} (hexágono de ${AREA_HEXAGONO[8]})`}</C.Subtitulo>
        <Lista_Ocorrencias contagens={info.contagens} />
      </C.Secao>

      <C.TextoSecundario>
        {`Fonte: boletins de ocorrência com localização (${infoAno ? rotuloFonte(infoAno) : 'SSP-SP'}). ` +
          'Um boletim mede o que foi registrado, não todo crime que aconteceu. O nível (de 1 a 10) compara este trecho ' +
          'com áreas do mesmo tamanho no resto da cidade, ponderando a gravidade de cada crime. Casos de estupro, ' +
          'publicados sem localização exata, são distribuídos pelo distrito.'}
      </C.TextoSecundario>
    </Tela_Rolavel>
  );
};

export default Area;
