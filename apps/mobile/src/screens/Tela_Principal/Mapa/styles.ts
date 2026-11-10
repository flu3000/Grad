import styled from 'styled-components/native';

export const Container = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

/** Faixa sobre o mapa com o card do local atual e a legenda. */
export const Topo = styled.View<{ $topInset: number }>`
  position: absolute;
  top: ${({ $topInset }) => $topInset + 8}px;
  left: 12px;
  right: 12px;
`;

export const LinhaInferior = styled.View`
  flex-direction: row;
  align-items: flex-start;
  margin-top: 8px;
`;

export const Status = styled.View`
  flex: 1;
  align-items: flex-end;
  padding-left: 8px;
`;

export const Aviso = styled.TouchableOpacity`
  max-width: 220px;
  padding: 8px 10px;
  border-radius: 10px;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.danger};
`;

export const AvisoTexto = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.danger};
`;
