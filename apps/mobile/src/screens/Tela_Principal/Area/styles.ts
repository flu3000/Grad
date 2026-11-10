import styled from 'styled-components/native';

export const Nome = styled.Text`
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;
