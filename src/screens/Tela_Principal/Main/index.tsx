import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Region } from 'react-native-maps';
import * as S from './styles';

const MapScreen = () => {
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

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });

      setLoading(false);
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
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      />
    </S.Container>
  );
};

export default MapScreen;
