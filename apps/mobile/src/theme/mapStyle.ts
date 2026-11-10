import type { MapStyleElement } from 'react-native-maps';

/** Estilo escuro do Google Maps (Android), combinando com o tema do app. No iOS o Apple Maps usa o modo escuro. */
export const mapStyleEscuro: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c3d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ea0b5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2533' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#1f3a33' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b3d52' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a5068' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a3a4d' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1b29' }] },
];
