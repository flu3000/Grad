import styled from 'styled-components/native';

/** Altura da barra; as telas usam para não ficar com conteúdo escondido atrás dela. */
export const ALTURA_BARRA = 72;

export const Wrapper = styled.View<{ $bottomInset: number }>`
  position: absolute;
  flex-direction: row;
  width: 85%;
  height: ${ALTURA_BARRA}px;
  bottom: ${({ $bottomInset }) => $bottomInset + 8}px;
  border-radius: 36px;
  background-color: ${({ theme }) => theme.colors.primary};
  align-self: center;
  align-items: center;
  justify-content: space-between;
  padding: 0px 4px;
  elevation: 6;
  shadow-color: ${({ theme }) => theme.colors.shadow};
  shadow-offset: 0px 4px;
  shadow-opacity: 1;
  shadow-radius: 8px;
`;

export const NavButton = styled.TouchableOpacity<{ $ativo: boolean }>`
  flex: 1;
  height: 64px;
  margin: 0px 2px;
  border-radius: 32px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $ativo }) => ($ativo ? theme.colors.textPrimary : 'transparent')};
`;

export const Rotulo = styled.Text<{ $ativo: boolean }>`
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme, $ativo }) => ($ativo ? theme.colors.primary : theme.colors.textSecondary)};
`;
