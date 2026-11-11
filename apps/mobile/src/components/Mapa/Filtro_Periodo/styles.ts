import styled from 'styled-components/native';

export const Rolagem = styled.ScrollView`
  flex: 1;
`;

export const Botao = styled.TouchableOpacity<{ $ativo?: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $ativo }) => ($ativo ? theme.colors.accent : theme.colors.surface)};
  border: 1px solid ${({ theme, $ativo }) => ($ativo ? theme.colors.accent : theme.colors.border)};
`;

export const Chip = styled.TouchableOpacity<{ $ativo: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border-radius: 17px;
  background-color: ${({ theme, $ativo }) => ($ativo ? theme.colors.accent : theme.colors.surface)};
  border: 1px solid ${({ theme, $ativo }) => ($ativo ? theme.colors.accent : theme.colors.border)};
`;

export const ChipTexto = styled.Text<{ $ativo: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme, $ativo }) => ($ativo ? theme.colors.onAccent : theme.colors.textPrimary)};
`;

export const ChipDetalhe = styled.Text<{ $ativo: boolean }>`
  font-size: 12px;
  color: ${({ theme, $ativo }) => ($ativo ? theme.colors.onAccent : theme.colors.textSecondary)};
`;
