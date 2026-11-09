# Prompt de continuidade — Grad

Cole o bloco abaixo como primeira mensagem de uma nova sessão do Claude Code (web, desktop ou terminal)
com o repositório `flu3000/Grad` aberto. Ele funciona sozinho, mas o Claude também lê `CLAUDE.md` e
`docs/DIAGNOSTICO.md` automaticamente/sob demanda.

Para trabalhar uma fase por vez, troque a última linha ("Comece pela Fase 1") pela fase desejada.

---

```text
Você vai continuar o desenvolvimento do Grad, meu app mobile de mapa de segurança de São Paulo.
Leia primeiro CLAUDE.md, README.md e docs/DIAGNOSTICO.md na raiz do repositório.

## Produto
Mapa de São Paulo dividido em hexágonos. Cada hexágono recebe uma nota de perigo calculada pela
densidade ponderada de boletins de ocorrência (BOs) da SSP-SP dentro dele: cada tipo de crime tem um
peso (roubo/latrocínio/homicídio pesam mais que furto ou infração leve). O app pinta os hexágonos do
neutro ao vermelho (paleta em apps/mobile/src/theme/colors.js → safetyLevels level1..level5) e mostra
o nível do lugar onde o usuário está. Login: convidado (anônimo) por padrão, com upgrade para Google/Apple.

## Stack (monorepo, sem workspaces)
- apps/mobile: Expo SDK 54, React Native 0.81, React 19.1, TypeScript, styled-components, react-native-maps,
  expo-location, axios, React Navigation 7 (instalado, ainda não configurado).
- apps/api: Node 22, Express 5, Mongoose 9 (MongoDB com 2dsphere), JWT access 15min/refresh 7d,
  login anônimo/Google/Apple, deploy no Railway com Root Directory = apps/api.
- Dados: apps/api/data/geosampa (distritos/subprefeituras em EPSG:31983), apps/api/data/rio (WGS84, não usado),
  apps/api/data/SSP-SP/SPDadosCriminais_2025_Reduzida.xlsx (~1,16 mi de BOs, FORA do Git; colunas LATITUDE,
  LONGITUDE, RUBRICA, NATUREZA_APURADA, DATA_OCORRENCIA_BO, HORA_OCORRENCIA_BO, DESCR_TIPOLOCAL...;
  lat/lng = 0 significa localização sigilosa e deve ser descartado).

## Estado atual
API: auth completo, importação de distritos/subprefeituras, GET /neighborhoods/getAll, POST /geo/locate.
App: só a tela do mapa com localização do usuário e uma bottom bar vazia; telas de login vazias; camada de
serviços (api.ts, TokenStorage.ts, UserService.ts) escrita no estilo web/Vite e quebrada no React Native.
Nada da parte de crimes/hexágonos existe ainda.

## Roadmap (faça na ordem; cada fase em commits pequenos)

Fase 1 — Consertar a fundação
1. App: trocar import.meta.env.VITE_API_URL por process.env.EXPO_PUBLIC_API_URL (atualizar .env.example,
   apagar src/vite-env.d.ts); TokenStorage com expo-secure-store (async); remover window.location do
   interceptor e evitar múltiplos refresh simultâneos (fila/promise compartilhada + flag _retry).
2. Alinhar rotas de link: o app deve chamar /auth/link/google e /auth/link/apple.
3. API: importar 'dotenv/config' antes de tudo em server.ts; middleware central de erros; validação com zod;
   cors; express-rate-limit em /auth; não devolver refreshToken no JSON do usuário; link de conta só para
   usuários anônimos.
4. npm audit fix nos dois apps (sem --force); npx expo install react-native-svg; npx expo install --check.
5. Remover arquivos vazios ou implementá-los; remover deps não usadas (@types/bcryptjs, ts-node).

Fase 2 — Ingestão dos dados de crime (API)
1. Script scripts/importCrimes.ts que lê a planilha SSP-SP (via streaming, ex. biblioteca xlsx/exceljs em modo
   stream, ou converter antes para CSV), descarta lat/lng inválidos e fora do município de SP, e normaliza.
2. Tabela de pesos por NATUREZA_APURADA/RUBRICA em src/config/crimeWeights.ts (proponha os pesos e me mostre
   antes de fixar).
3. Grade hexagonal com h3-js (resolução 8 ou 9 — compare e recomende). Agregar por hexágono: contagem por tipo,
   soma ponderada e nota normalizada 1..5 (definir método: quantis ou log-escala; justificar).
4. Model CrimeStats/HexCell no Mongo (h3Index, score, level, counts, period) com índices adequados.
   Guardar só o agregado; nunca os 1,16 mi de BOs crus em produção.

Fase 3 — Endpoints do mapa (API)
1. GET /hexagons?bbox=minLng,minLat,maxLng,maxLat&res=8 → hexágonos visíveis com level (leve, cacheável).
2. GET /geo/locate?lat=&lng= → distrito, subprefeitura, hexágono e nível de perigo do ponto.
3. Simplificar geometrias de /neighborhoods (turf simplify) ou removê-lo se não for usado.

Fase 4 — App
1. React Navigation: stack de Auth (entrada como convidado + Google/Apple) e Main (mapa) com a bottom bar
   (Mapa, Busca/Área, Perfil) e ícones lucide.
2. No mapa: buscar /hexagons pelo viewport visível (onRegionChangeComplete, com debounce) e desenhar
   <Polygon> por hexágono com as cores de safetyLevels; legenda; card com o nível no local atual.
3. Login Google (expo-auth-session ou @react-native-google-signin) e Apple (expo-apple-authentication).
   Decidir: remover a tela de e-mail/senha (Cadastro/Esqueci_Senha) ou implementar backend para ela —
   me pergunte antes.
4. Limpar estilos de debug, 30vh, userInterfaceStyle no app.json, mapPadding.

Fase 5 — Qualidade e entrega
1. ESLint + Prettier nos dois apps; testes (Vitest/Jest + supertest na API, ao menos auth e /hexagons).
2. GitHub Actions: typecheck + testes em cada push.
3. EAS Build (Android) com chave do Google Maps em app.json; documentar deploy no README.

## Regras de trabalho
- Antes de começar uma fase, me mostre um plano curto e as decisões que precisam da minha opinião.
- Rode `npm run typecheck` (e testes quando existirem) antes de cada commit.
- Commits pequenos, mensagens em português. Não faça commit de .env nem de arquivos .xlsx.
- Use `npx expo install` para dependências do app.
- Ao final de cada fase, atualize CLAUDE.md e docs/DIAGNOSTICO.md com o novo estado.

Comece pela Fase 1.
```
