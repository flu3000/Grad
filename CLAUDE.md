# CLAUDE.md — contexto do projeto Grad

Este arquivo é lido automaticamente pelo Claude Code. Mantenha-o curto e atualizado.

## O que é
Grad: app mobile que mostra um mapa de São Paulo colorido por nível de perigo, calculado a partir
de boletins de ocorrência da SSP-SP. Projeto pessoal; idioma do código e dos commits: **português**.

## Monorepo
- `apps/mobile` — Expo SDK 54, React Native 0.81, React 19.1, TypeScript, styled-components (tema em
  `src/theme/colors.js`), react-native-maps, expo-location, axios. Entrada: `index.js` → `App.tsx`.
- `apps/api` — Express 5, Mongoose 9 (MongoDB com índices `2dsphere`), JWT (access 15 min / refresh 7 dias),
  login anônimo + Google + Apple. Entrada: `src/server.ts` → `src/app.ts`. Deploy no Railway (root `apps/api`).
- Cada app tem seu próprio `package.json` e `package-lock.json` (não há npm workspaces de propósito:
  evita problemas de hoisting com o Metro/Expo e mantém o deploy do Railway simples).

## Comandos
- Instalar: `npm run install:all` (ou `npm ci` dentro de cada app)
- API: `npm run api:dev` | build: `npm run api:build` | importar mapas: `npm run api:import-geo`
- Mobile: `npm run mobile:start` (validar deps nativas com `npx expo install --check` em `apps/mobile`)
- Checagem de tipos (rodar antes de todo commit): `npm run typecheck`
- Não há testes automatizados ainda.

## Convenções
- Pastas/arquivos de tela e componente em `Pascal_Snake_Case` (`Tela_Principal/Main/index.tsx` + `styles.ts`).
- Estilos sempre em `styles.ts` com styled-components e cores do tema (`theme.colors.*`), nunca hex solto.
- Rotas da API: `routes/*.routes.ts` → `controllers/*Controller.ts` → `models/*.ts`.
- Geometrias no banco sempre em WGS84 `[lng, lat]`. Os GeoJSON da GeoSampa vêm em EPSG:31983 e são
  convertidos por `utils/convertCoordinates.ts` no script `scripts/importGeo.ts`.
- Mensagens de commit em português, curtas e descritivas.

## Cuidados
- Nunca versionar `.env` (use `.env.example`) nem a planilha da SSP-SP (`apps/api/data/SSP-SP/*.xlsx`, ~100 MB).
- No app, variáveis de ambiente precisam do prefixo `EXPO_PUBLIC_` e são lidas com `process.env.EXPO_PUBLIC_*`.
  O código atual ainda usa `import.meta.env.VITE_API_URL` (herança de Vite) — ver `docs/DIAGNOSTICO.md`.
- React Native não tem `localStorage` nem `window.location`: use `expo-secure-store` para tokens e
  React Navigation para trocar de tela.
- Para dependências nativas no app, use `npx expo install <pacote>` (escolhe a versão compatível com o SDK).

## Estado atual e próximos passos
Ver `docs/DIAGNOSTICO.md` (bugs conhecidos) e `docs/PROMPT_CONTINUIDADE.md` (roadmap).
