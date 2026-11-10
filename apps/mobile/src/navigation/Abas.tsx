import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Map, MapPin, Phone, User } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import Area from '../screens/Tela_Principal/Area';
import Emergencia from '../screens/Tela_Principal/Emergencia';
import Mapa from '../screens/Tela_Principal/Mapa';
import Perfil from '../screens/Tela_Principal/Perfil';
import type { AbasParamList } from './tipos';

const Tab = createBottomTabNavigator<AbasParamList>();

/** Tela principal: barra de abas padrão (Mapa, Área, Emergência, Perfil) presa embaixo da tela. */
const Abas = () => {
  const theme = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.primary, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Mapa" component={Mapa} options={{ tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
      <Tab.Screen
        name="Area"
        component={Area}
        options={{ title: 'Área', tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Emergencia"
        component={Emergencia}
        options={{ title: 'Emergência', tabBarIcon: ({ color, size }) => <Phone color={color} size={size} /> }}
      />
      <Tab.Screen name="Perfil" component={Perfil} options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tab.Navigator>
  );
};

export default Abas;
