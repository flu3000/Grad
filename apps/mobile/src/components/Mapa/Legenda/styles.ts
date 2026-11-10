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

export const Faixa = styled.View`
  flex-direction: row;
  margin-top: 6px;
`;

export const Quadrado = styled.View<{ $cor: string }>`
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
`;

export const Numero = styled.Text<{ $cor: string }>`
  font-size: 9px;
  font-weight: 700;
  color: ${({ $cor }) => $cor};
`;

export const Extremos = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: 3px;
`;

export const Linha = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: 6px;
`;

export const Texto = styled.Text`
  font-size: 11px;
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
