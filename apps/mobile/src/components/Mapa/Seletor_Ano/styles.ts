import styled from 'styled-components/native';

export const Chip = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 17px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const ChipTexto = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Fundo = styled.Pressable`
  flex: 1;
  justify-content: center;
  padding: 24px;
  background-color: ${({ theme }) => theme.colors.shadow};
`;

export const Lista = styled.Pressable`
  padding: 16px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Titulo = styled.Text`
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Item = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 48px;
  padding: 8px 4px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

export const ItemTextos = styled.View`
  flex: 1;
`;

export const ItemTexto = styled.Text<{ $ativo: boolean }>`
  font-size: 15px;
  font-weight: ${({ $ativo }) => ($ativo ? '700' : '400')};
  color: ${({ theme, $ativo }) => ($ativo ? theme.colors.accent : theme.colors.textPrimary)};
`;

export const ItemDetalhe = styled.Text`
  margin-top: 2px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Rodape = styled.Text`
  margin-top: 10px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
