import styled from 'styled-components/native';

/** $base: espaço embaixo (o painel de hora, quando aberto). */
export const Container = styled.View<{ $base?: number }>`
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: ${({ $base = 0 }) => 12 + $base}px;
  padding: 14px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Cabecalho = styled.View`
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 8px;
`;

export const Icone = styled.View<{ $cor: string }>`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  margin-right: 10px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
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
  font-size: 17px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Fechar = styled.TouchableOpacity`
  padding: 2px;
  margin-left: 8px;
`;

export const Linha = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Secundario = styled.Text`
  margin-top: 2px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Botoes = styled.View`
  flex-direction: row;
  margin-top: 12px;
`;

export const Botao = styled.TouchableOpacity`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 11px;
  margin-right: 8px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

export const BotaoTexto = styled.Text`
  margin-left: 6px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onAccent};
`;

export const Nota = styled.Text`
  margin-top: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
