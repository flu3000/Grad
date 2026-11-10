import styled from 'styled-components/native';

export const Container = styled.TouchableOpacity`
  padding: 10px 12px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Titulo = styled.Text`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Linha = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: 6px;
`;

export const Amostra = styled.View<{ $cor: string }>`
  width: 14px;
  height: 14px;
  border-radius: 3px;
  margin-right: 8px;
  background-color: ${({ $cor }) => $cor};
`;

export const Texto = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Bolinha = styled.View<{ $cor: string }>`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  margin-right: 8px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
`;
