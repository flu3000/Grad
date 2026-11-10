import styled from 'styled-components/native';

export const Bloco = styled.View`
  margin-bottom: 14px;
`;

export const Rotulo = styled.Text`
  font-size: 15px;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Grupo = styled.View`
  flex-direction: row;
  padding: 3px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

export const Opcao = styled.TouchableOpacity<{ $ativa: boolean }>`
  flex: 1;
  padding: 9px 4px;
  border-radius: 9px;
  align-items: center;
  background-color: ${({ theme, $ativa }) => ($ativa ? theme.colors.textPrimary : 'transparent')};
`;

export const Texto = styled.Text<{ $ativa: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme, $ativa }) => ($ativa ? theme.colors.primary : theme.colors.textSecondary)};
`;
