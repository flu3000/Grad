import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Completa o app.json com o que depende de credenciais (lidas de variáveis de ambiente, nunca versionadas):
 * - Google Sign-In: o plugin exige o "iosUrlScheme", derivado do Client ID iOS do Google Cloud.
 * - Google Maps no Android: a chave da API é obrigatória fora do Expo Go (development build e produção).
 * Sem as variáveis, o app continua funcionando no Expo Go; só o login Google e o mapa do build Android ficam de fora.
 * Variáveis em apps/mobile/.env (local) e nas variáveis de ambiente do EAS (builds na nuvem). Ver docs/LOGIN_SOCIAL.md.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];

  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (googleIosClientId) {
    // "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc"
    const iosUrlScheme = `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`;
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }

  const mapsAndroidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (mapsAndroidKey) plugins.push(['react-native-maps', { androidGoogleMapsApiKey: mapsAndroidKey }]);

  return { ...config, name: config.name ?? 'Grad', slug: config.slug ?? 'grad', plugins };
};
