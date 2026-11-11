import styled from 'styled-components/native';

/** $base: espaço embaixo (o painel de hora, quando aberto). */
export const Container = styled.View<{ $base?: number }>`
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: ${({ $base = 0 }) => 12 + $base}px;
  max-height: 55%;
  padding: 14px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Cabecalho = styled.View`
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 10px;
`;

export const Titulos = styled.View`
  flex: 1;
`;

export const Rotulo = styled.Text`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Titulo = styled.Text`
  margin-top: 2px;
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Subtitulo = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Fechar = styled.TouchableOpacity`
  padding: 2px;
  margin-left: 8px;
`;

export const Rolagem = styled.ScrollView`
  flex-grow: 0;
`;

export const Bloco = styled.View`
  margin-bottom: 12px;
`;

export const Secao = styled.Text`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Erro = styled.TouchableOpacity`
  padding: 8px 0px;
`;

export const ErroTexto = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.danger};
`;

export const LinhaFiltro = styled.Text`
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;
