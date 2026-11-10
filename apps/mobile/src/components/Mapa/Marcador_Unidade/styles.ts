import styled from 'styled-components/native';

export const Pino = styled.View<{ $cor: string; $selecionada: boolean }>`
  width: ${({ $selecionada }) => ($selecionada ? 34 : 26)}px;
  height: ${({ $selecionada }) => ($selecionada ? 34 : 26)}px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $cor }) => $cor};
  border: 2px solid ${({ theme }) => theme.colors.onUnidade};
`;
