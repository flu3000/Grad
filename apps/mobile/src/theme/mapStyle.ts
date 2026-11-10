import type { MapStyleElement } from 'react-native-maps';

/** Estilo escuro neutro do Google Maps (Android), combinando com o tema escuro. No iOS o Apple Maps usa o modo escuro. */
export const mapStyleEscuro: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1B1E23' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A929C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14161A' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#33383F' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#1D2620' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2E35' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#383D45' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#24282E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0D1014' }] },
];
