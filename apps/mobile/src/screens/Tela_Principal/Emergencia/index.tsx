import React from 'react';
import { Linking } from 'react-native';
import { ExternalLink, Phone } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import Tela_Rolavel from '../../../components/Comum/Tela_Rolavel';
import * as C from '../../../components/Comum/Tela_Rolavel/styles';
import { DELEGACIA_ELETRONICA, GRUPOS_CONTATOS } from '../../../lib/contatos';
import { ligar } from '../../../lib/telefone';
import * as S from './styles';

/** Telefones importantes, com toque para ligar, e o link da Delegacia Eletrônica. */
const Emergencia = () => {
  const theme = useTheme();
  return (
    <Tela_Rolavel titulo="Emergência">
      <S.Destaque onPress={() => ligar('190', 'Polícia Militar')} accessibilityRole="button" accessibilityLabel="Ligar para 190, Polícia Militar">
        <Phone color={theme.colors.onUnidade} size={26} />
        <S.DestaqueTextos>
          <S.DestaqueNumero>190</S.DestaqueNumero>
          <S.DestaqueNome>Em perigo agora? Ligue para a Polícia Militar.</S.DestaqueNome>
        </S.DestaqueTextos>
      </S.Destaque>

      {GRUPOS_CONTATOS.map((g) => (
        <C.Secao key={g.titulo}>
          <C.Subtitulo>{g.titulo}</C.Subtitulo>
          {g.contatos.map((c, i) => (
            <S.Contato
              key={c.numero}
              $ultimo={i === g.contatos.length - 1}
              onPress={() => ligar(c.numero, c.nome)}
              accessibilityRole="button"
              accessibilityLabel={`Ligar para ${c.numero}, ${c.nome}`}
            >
              <S.Numero>
                <S.NumeroTexto>{c.numero}</S.NumeroTexto>
              </S.Numero>
              <S.ContatoTextos>
                <S.Nome>{c.nome}</S.Nome>
                <C.TextoSecundario>{c.descricao}</C.TextoSecundario>
              </S.ContatoTextos>
              <Phone color={theme.colors.textSecondary} size={18} />
            </S.Contato>
          ))}
        </C.Secao>
      ))}

      <C.Secao>
        <C.Subtitulo>Boletim de ocorrência pela internet</C.Subtitulo>
        <C.TextoSecundario>
          Furto, perda de documentos, desaparecimento e outros casos sem violência podem ser registrados na Delegacia
          Eletrônica da Polícia Civil de SP.
        </C.TextoSecundario>
        <S.Link onPress={() => Linking.openURL(DELEGACIA_ELETRONICA)} accessibilityRole="link">
          <C.BotaoTexto>Abrir a Delegacia Eletrônica</C.BotaoTexto>
          <ExternalLink color={theme.colors.primary} size={16} />
        </S.Link>
      </C.Secao>

      <C.TextoSecundario>As ligações para esses números são gratuitas e funcionam mesmo sem crédito.</C.TextoSecundario>
    </Tela_Rolavel>
  );
};

export default Emergencia;
