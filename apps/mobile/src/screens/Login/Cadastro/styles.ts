import styled from 'styled-components/native';

export const Wrapper = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const AppHeaderContainer = styled.View`
  height: 30vh;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: red;
  font-size: 24px;
`;

export const LogoText = styled.Text`
  font-size: 48px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

export const MainContainer = styled.View`
  height: 30%;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: green;
`;

export const MainHeadText = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
  background-color: purple;
`;