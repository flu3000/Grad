import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';
import { Map, MapPin, User, type LucideIcon } from 'lucide-react-native';
import * as S from './styles';

const ICONES: Record<string, LucideIcon> = { Mapa: Map, Area: MapPin, Perfil: User };
const ROTULOS: Record<string, string> = { Mapa: 'Mapa', Area: 'Área', Perfil: 'Perfil' };

/** Barra de abas flutuante (Mapa, Área, Perfil), usada como tabBar do React Navigation. */
const Bottom_Navigation_Bar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <S.Wrapper $bottomInset={insets.bottom}>
      {state.routes.map((route, index) => {
        const ativo = state.index === index;
        const Icone = ICONES[route.name] ?? Map;
        const cor = ativo ? theme.colors.primary : theme.colors.textSecondary;
        const aoTocar = () => {
          const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!ativo && !evento.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <S.NavButton
            key={route.key}
            $ativo={ativo}
            onPress={aoTocar}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={ROTULOS[route.name]}
          >
            <Icone color={cor} size={22} />
            <S.Rotulo $ativo={ativo}>{ROTULOS[route.name] ?? route.name}</S.Rotulo>
          </S.NavButton>
        );
      })}
    </S.Wrapper>
  );
};

export default Bottom_Navigation_Bar;
