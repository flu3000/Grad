import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Region } from 'react-native-maps';
import * as S from './styles';
import Bottom_Navigation_Bar from '../../../components/Tela_Principal/Bottom_Navigation_Bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MapScreen = () => {
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          'Precisamos da sua localização para exibir o mapa corretamente.'
        );
        setLoading(false);
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        });
      } catch {
        Alert.alert(
          'Erro',
          'Não foi possível obter sua localização.'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <S.LoadingContainer>
        <ActivityIndicator size="large" color="#1E40AF" />
      </S.LoadingContainer>
    );
  }

  if (!region) {
    return <S.FallbackContainer />;
  }

  return (
    <S.Container>
      <MapView
        style={{ flex: 1 }}
        region={region}
        showsUserLocation
        showsMyLocationButton
        mapPadding={{
          top: insets.bottom,
          right: insets.bottom,
          left: insets.bottom,
          bottom: -insets.bottom, // altura da sua bottom nav
        }}
      />
      <Bottom_Navigation_Bar />
    </S.Container>
  );
};

export default MapScreen;