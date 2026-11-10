# Login Google/Apple e app de desenvolvimento (EAS)

O login social usa os SDKs nativos (`@react-native-google-signin/google-signin` e `expo-apple-authentication`) e entrega
o token de ID ao Supabase:
- Convidado → `linkIdentity({ provider, token })`: a conta Google/Apple é **vinculada** ao convidado atual.
- Se essa conta Google/Apple já pertence a outro usuário (ex.: reinstalou o app) → `signInWithIdToken`, que entra nele.

Código em `apps/mobile/src/lib/loginSocial.ts`. **Não funciona no Expo Go**: precisa do app de desenvolvimento do Grad
(development build), gerado na nuvem pelo EAS. No Expo Go o Perfil mostra um aviso e o resto do app funciona normalmente.

Identificadores do app (definidos em `apps/mobile/app.json`; só mudam sem dor antes de publicar nas lojas):
- Android `package` e iOS `bundleIdentifier`: **`com.flu3000.grad`**
- Projeto Supabase: `https://snuxiwwvlaryggezcezi.supabase.co`

Todos os comandos abaixo rodam dentro de `apps/mobile`.

## Custos
- **EAS Build:** o plano gratuito tem uma cota mensal de builds na nuvem (confira em expo.dev/pricing). Um build de
  desenvolvimento dura vários meses: só precisa refazer quando mudar algo nativo (novo pacote nativo, plugin, chave).
- **Google Cloud:** login com Google e Maps SDK for Android não cobram no uso de desenvolvimento (o Maps exige uma conta
  de faturamento ativa, mas tem cota gratuita mensal; configure alertas de orçamento).
- **Apple:** só para iOS, exige o Apple Developer Program (US$ 99/ano). Sem ele, dá para fazer tudo no Android.

## Ordem recomendada (Android)

### 1. Projeto no EAS
Com o `EXPO_TOKEN` no terminal (ou depois de `npx eas-cli login`):

```bash
npx eas-cli init
```

Isso cria o projeto em expo.dev e grava `extra.eas.projectId` e `owner` no `app.json`. Faça commit dessa mudança.

### 2. Chave do Google Maps (Android)
Sem ela o mapa fica em branco no app de desenvolvimento.
1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto "Grad".
2. APIs e serviços → Biblioteca → ative **Maps SDK for Android**.
3. APIs e serviços → Credenciais → **Criar credenciais → Chave de API**. Copie a chave.
4. Cadastre no EAS (vale para os builds na nuvem):

```bash
npx eas-cli env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value "SUA_CHAVE" --environment development --environment preview --environment production --visibility sensitive
```

5. Depois do passo 4, restrinja a chave a apps Android (package `com.flu3000.grad` + SHA-1 do passo 4).

### 3. Primeiro build de desenvolvimento

```bash
npx eas-cli build --profile development --platform android
```

Na primeira vez, aceite gerar a keystore (o EAS guarda). Ao terminar (~10–20 min), abra o link/QR no celular Android e
instale o APK "Grad".

### 4. SHA-1 do certificado

```bash
npx eas-cli credentials --platform android
```

Escolha o perfil `development` e copie o **SHA1 Fingerprint**. (O build de produção na Play Store terá outro SHA-1, que
será cadastrado na Fase 4.)

### 5. Credenciais OAuth do Google
No Google Cloud do mesmo projeto:
1. **Google Auth Platform → Branding/Público-alvo** (tela de consentimento): tipo Externo, nome "Grad", seu e-mail de
   suporte. Enquanto estiver "Em teste", adicione seu Gmail em **Usuários de teste**.
2. **Clientes → Criar cliente**:
   - **Aplicativo da Web** (nome "Grad Supabase"): em URIs de redirecionamento autorizados, coloque
     `https://snuxiwwvlaryggezcezi.supabase.co/auth/v1/callback`. Copie o **ID do cliente** e a **chave secreta**.
   - **Android**: package `com.flu3000.grad` e o SHA-1 do passo 4.
   - **iOS** (só se for fazer iOS): bundle ID `com.flu3000.grad`. Copie o ID do cliente.

### 6. Provedor Google no Supabase
Painel do projeto `grad` → Authentication → Sign In / Providers → **Google**:
- Ligue o provedor.
- **Client IDs**: o ID do cliente **Web** (e, separados por vírgula, os IDs Android e iOS).
- **Client Secret**: a chave secreta do cliente Web.
- **Skip nonce check**: ligue se for usar no iOS (o SDK do Google no iOS envia um nonce que o app não controla).

### 7. Variáveis no app
Em `apps/mobile/.env` (não versionado):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<ID do cliente Web>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ID do cliente iOS, se houver>
```

No app de desenvolvimento, o código JavaScript vem do seu computador, então essas variáveis são lidas do `.env` local.
Para builds `preview`/`production`, cadastre também no EAS (`npx eas-cli env:create`), junto com
`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### 8. Rodar e testar

```bash
npx expo start
```

Abra pelo app **Grad** instalado (não pelo Expo Go). Em Perfil → **Continuar com Google**. Deve aparecer
"Conta vinculada" e o Perfil passa a mostrar o e-mail. Para continuar usando o Expo Go: `npx expo start --go`.

## iOS (quando tiver o Apple Developer Program)
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → App ID `com.flu3000.grad` com
   **Sign in with Apple** ligado (o EAS também consegue criar isso no primeiro build).
2. Supabase → Providers → **Apple**: ligue e, em **Client IDs**, coloque `com.flu3000.grad`. Para o login nativo não é
   preciso gerar a chave secreta (ela só serve para o fluxo web).
3. Cadastre o iPhone e gere o build:

```bash
npx eas-cli device:create
```

```bash
npx eas-cli build --profile development --platform ios
```

4. Para Google no iOS, preencha `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` também no EAS **antes** do build (o plugin usa o ID
   para configurar o esquema de URL do app).

## Problemas comuns
- **"DEVELOPER_ERROR" no Google (Android):** SHA-1 ou package do cliente Android não batem com o build instalado.
- **"Unacceptable audience" no Supabase:** o ID do cliente usado no app não está em *Client IDs* do provedor.
- **Mapa em branco no app de desenvolvimento:** falta `GOOGLE_MAPS_ANDROID_API_KEY` no EAS, a API não está ativa ou a
  restrição da chave não inclui o SHA-1. Mudou a chave? Refaça o build.
- **`npx expo start` abre o app errado:** com o `expo-dev-client` instalado, o padrão é o app de desenvolvimento; use
  `npx expo start --go` para o Expo Go.
