import styled from 'styled-components/native';

export const Linha = styled.View`
  flex-direction: row;
  align-items: center;
`;

export const Selo = styled.View<{ $cor: string; $compacto: boolean }>`
  width: ${({ $compacto }) => ($compacto ? 40 : 52)}px;
  height: ${({ $compacto }) => ($compacto ? 40 : 52)}px;
  border-radius: ${({ $compacto }) => ($compacto ? 20 : 26)}px;
  margin-right: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
`;

export const SeloTexto = styled.Text<{ $compacto: boolean }>`
  font-size: ${({ $compacto }) => ($compacto ? 18 : 22)}px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.background};
`;

export const Coluna = styled.View`
  flex: 1;
`;

export const Rotulo = styled.Text<{ $compacto: boolean }>`
  font-size: ${({ $compacto }) => ($compacto ? 16 : 20)}px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Descricao = styled.Text`
  font-size: 13px;
  line-height: 18px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
