import styled from 'styled-components/native';

export const Nome = styled.Text`
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const LinhaNivel = styled.View`
  flex-direction: row;
  align-items: center;
`;

export const Selo = styled.View<{ $cor: string }>`
  width: 52px;
  height: 52px;
  border-radius: 26px;
  margin-right: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
`;

export const SeloTexto = styled.Text`
  font-size: 22px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.background};
`;

export const ColunaNivel = styled.View`
  flex: 1;
`;

export const LinhaCategoria = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: 8px 0px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

export const Quantidade = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;
