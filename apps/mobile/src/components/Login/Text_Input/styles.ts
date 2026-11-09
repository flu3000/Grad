import styled from 'styled-components/native';

export const Wrapper = styled.View`
  width: 80%;
  margin-bottom: 12px;
`;

export const MainContainer = styled.View`
  height: 48px;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.textPrimary};
  padding: 0px 12px;
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
