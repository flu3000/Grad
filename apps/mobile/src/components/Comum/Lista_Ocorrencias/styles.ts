import styled from 'styled-components/native';

export const Total = styled.Text`
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 4px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Linha = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: 7px 0px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

export const Nome = styled.Text`
  flex: 1;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Quantidade = styled.Text`
  font-size: 13px;
  font-weight: 700;
  margin-left: 8px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Vazio = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
