import React from 'react';
import { Navigation, Phone, X } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import { ligar } from '../../../lib/telefone';
import { INFO_UNIDADE, abrirRota, type Unidade } from '../../../lib/unidades';
import * as S from './styles';

/** Balão com os dados de uma unidade de segurança: tipo, endereço, distrito e atalhos para rota e ligação. */
const Balao_Unidade = ({ unidade, onFechar }: { unidade: Unidade; onFechar: () => void }) => {
  const theme = useTheme();
  const info = INFO_UNIDADE[unidade.tipo];
  const Icone = info.icone;
  const local = [unidade.bairro, unidade.distrito && unidade.distrito !== unidade.bairro?.toUpperCase() ? `distrito ${unidade.distrito}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <S.Container>
      <S.Cabecalho>
        <S.Icone $cor={theme.colors.unidades[unidade.tipo]}>
          <Icone color={theme.colors.onUnidade} size={18} />
        </S.Icone>
        <S.Titulos>
          <S.Rotulo>{info.rotulo}</S.Rotulo>
          <S.Titulo numberOfLines={2}>{unidade.nome}</S.Titulo>
        </S.Titulos>
        <S.Fechar onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12}>
          <X color={theme.colors.textSecondary} size={22} />
        </S.Fechar>
      </S.Cabecalho>

      {!!unidade.endereco && <S.Linha>{unidade.endereco}</S.Linha>}
      {!!local && <S.Secundario>{local}</S.Secundario>}
      {!!unidade.cep && <S.Secundario>{`CEP ${unidade.cep}`}</S.Secundario>}

      <S.Botoes>
        <S.Botao onPress={() => abrirRota(unidade)} accessibilityRole="button">
          <Navigation color={theme.colors.primary} size={16} />
          <S.BotaoTexto>Como chegar</S.BotaoTexto>
        </S.Botao>
        <S.Botao
          onPress={() => ligar(unidade.telefone ?? info.telefone, unidade.telefone ? unidade.nome : info.servico)}
          accessibilityRole="button"
        >
          <Phone color={theme.colors.primary} size={16} />
          <S.BotaoTexto>{unidade.telefone ? 'Ligar' : `Ligar ${info.telefone}`}</S.BotaoTexto>
        </S.Botao>
      </S.Botoes>
      {!unidade.telefone && (
        <S.Nota>{`A base da Prefeitura não traz o telefone desta unidade. O botão liga para o ${info.telefone} (${info.servico}).`}</S.Nota>
      )}
    </S.Container>
  );
};

export default Balao_Unidade;
