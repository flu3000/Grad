import { Alert, Linking } from 'react-native';

/** Pede confirmação e abre o discador. Ligações para números de emergência são gratuitas. */
export function ligar(numero: string, nome: string) {
  Alert.alert(`Ligar para ${numero}?`, nome, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Ligar',
      onPress: () =>
        Linking.openURL(`tel:${numero.replace(/[^\d+]/g, '')}`).catch(() =>
          Alert.alert('Não foi possível ligar', `Disque ${numero} no seu telefone.`),
        ),
    },
  ]);
}
