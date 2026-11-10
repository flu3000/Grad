import styled from 'styled-components/native';
import * as AppleAuthentication from 'expo-apple-authentication';

/** Botão oficial "Continuar com Apple" (exigência das diretrizes da Apple). */
export const BotaoApple = styled(AppleAuthentication.AppleAuthenticationButton)`
  height: 48px;
  margin-top: 10px;
`;
