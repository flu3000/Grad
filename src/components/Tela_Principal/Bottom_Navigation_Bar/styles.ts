import styled from 'styled-components/native';

export const Wrapper = styled.View<{ bottomInset: number }>`
    position: absolute;
    display: flex;
    width: 85%;
    height: 72px;
    bottom: ${({ bottomInset }) => bottomInset}px;
    border-radius: 36px;
    background-color: ${({ theme }) => theme.colors.primary};
    align-self: center;
    align-items: center;
    justify-content: center;
`;

export const MainContainer = styled.View<{ bottomInset: number }>`
  display: flex;
  flex-direction: row;
  height: 72px;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border-radius: 36px;
  background-color: ${({ theme }) => theme.colors.primary};
  padding: 0px 4px;
`;

export const NavButton = styled.TouchableOpacity<{ bottomInset: number }>`
  border-radius: 32px;
  background-color: ${({ theme }) => theme.colors.textPrimary};
  align-items: center;
  height: 64px;
  aspect-ratio: 1;
  justify-content: center;
`;

export const TextInput = styled.TextInput`
  flex: 1;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.primary};
`;

export const IconButton = styled.TouchableOpacity`
  padding-left: 8px;
`;

export const StrengthBarContainer = styled.View`
  margin-top: 6px;
  height: 4px;
  width: 100%;
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

export const StrengthBar = styled.View<{ strength: number }>`
  height: 100%;
  width: ${({ strength }) => (strength / 5) * 100}%;
  background-color: ${({ strength }) => {
    if (strength <= 2) return '#dc2626';
    if (strength === 3) return '#f59e0b';
    return '#16a34a';
  }};
`;
