import styled from 'styled-components/native';

export const Linha = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 10px 0px;
`;

export const Textos = styled.View`
  flex: 1;
  margin-right: 12px;
`;

export const Rotulo = styled.Text`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Descricao = styled.Text`
  margin-top: 2px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
