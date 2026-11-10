import styled from 'styled-components/native';

export const Destaque = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 16px;
  margin-bottom: 12px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.emergencia};
`;

export const DestaqueTextos = styled.View`
  flex: 1;
  margin-left: 14px;
`;

export const DestaqueNumero = styled.Text`
  font-size: 28px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.onUnidade};
`;

export const DestaqueNome = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.onUnidade};
`;

export const Contato = styled.TouchableOpacity<{ $ultimo: boolean }>`
  flex-direction: row;
  align-items: center;
  padding: 10px 0px;
  border-bottom-width: ${({ $ultimo }) => ($ultimo ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

export const Numero = styled.View`
  width: 56px;
  height: 40px;
  margin-right: 12px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.chip};
`;

export const NumeroTexto = styled.Text`
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const ContatoTextos = styled.View`
  flex: 1;
  margin-right: 8px;
`;

export const Nome = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const Link = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
  padding: 13px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.accent};
`;
