import styled from 'styled-components/native';

export const Container = styled.View`
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  padding: 8px 14px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Linha = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
`;

export const Janela = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Detalhe = styled.Text`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Escala = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: 0 4px;
`;

export const Marca = styled.Text`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
