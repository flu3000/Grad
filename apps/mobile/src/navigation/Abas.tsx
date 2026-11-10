import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Bottom_Navigation_Bar from '../components/Tela_Principal/Bottom_Navigation_Bar';
import Area from '../screens/Tela_Principal/Area';
import Mapa from '../screens/Tela_Principal/Mapa';
import Perfil from '../screens/Tela_Principal/Perfil';
import type { AbasParamList } from './tipos';

const Tab = createBottomTabNavigator<AbasParamList>();

/** Tela principal: abas Mapa, Área e Perfil com a barra flutuante. */
const Abas = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <Bottom_Navigation_Bar {...props} />}>
    <Tab.Screen name="Mapa" component={Mapa} />
    <Tab.Screen name="Area" component={Area} />
    <Tab.Screen name="Perfil" component={Perfil} />
  </Tab.Navigator>
);

export default Abas;
