import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type AbasParamList = {
  Mapa: undefined;
  Area: undefined;
  Emergencia: undefined;
  Perfil: undefined;
};

export type TelaDaAba<T extends keyof AbasParamList> = BottomTabScreenProps<AbasParamList, T>;
