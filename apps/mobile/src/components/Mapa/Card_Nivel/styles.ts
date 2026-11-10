import styled from 'styled-components/native';

export const Container = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 12px 14px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Indicador = styled.View<{ $cor: string }>`
  width: 12px;
  align-self: stretch;
  border-radius: 6px;
  margin-right: 12px;
  background-color: ${({ $cor }) => $cor};
`;

export const Textos = styled.View`
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
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Detalhe = styled.Text`
  margin-top: 2px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
