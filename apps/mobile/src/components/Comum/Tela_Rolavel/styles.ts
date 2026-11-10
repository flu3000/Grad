import styled from 'styled-components/native';

export const Fundo = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Rolagem = styled.ScrollView``;

export const Titulo = styled.Text`
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** Bloco de conteúdo padrão das telas. */
export const Secao = styled.View`
  padding: 16px;
  margin-bottom: 12px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.primary};
`;

export const Subtitulo = styled.Text`
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Texto = styled.Text`
  font-size: 15px;
  line-height: 22px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const TextoSecundario = styled.Text`
  font-size: 13px;
  line-height: 19px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Botao = styled.TouchableOpacity<{ $desativado?: boolean }>`
  margin-top: 10px;
  padding: 14px;
  border-radius: 12px;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.accent};
  opacity: ${({ $desativado }) => ($desativado ? 0.4 : 1)};
`;

export const BotaoTexto = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onAccent};
`;

export const BotaoSecundario = styled.TouchableOpacity`
  margin-top: 10px;
  padding: 14px;
  border-radius: 12px;
  align-items: center;
  border: 1px solid ${({ theme }) => theme.colors.textSecondary};
`;

export const BotaoSecundarioTexto = styled.Text`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
