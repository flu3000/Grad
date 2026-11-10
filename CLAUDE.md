# CLAUDE.md — contexto do projeto Grad

Este arquivo é lido automaticamente pelo Claude Code. Mantenha-o curto e atualizado.

## O que é
Grad: app mobile que mostra um mapa de São Paulo colorido por nível de perigo, calculado a partir
de boletins de ocorrência da SSP-SP. Projeto pessoal; idioma do código e dos commits: **português**.

## Monorepo
- `apps/mobile` — Expo SDK 54, React Native 0.81, React 19.1, TypeScript, styled-components (tema em
  `src/theme/colors.js`), react-native-maps, expo-location, axios. Entrada: `index.js` → `App.tsx`.
- `scripts` — ingestão local (TypeScript + tsx): GeoSampa e SSP-SP → Supabase. Pesos em `scripts/src/config/crimeWeights.ts`.
- `apps/api` — Express 5 + Mongoose 9 (código legado). **Será substituído pelo Supabase** (Postgres + PostGIS +
  Supabase Auth, região sa-east-1), conforme `docs/DECISAO_BACKEND.md`. Não evoluir o Express; o Railway foi abandonado.
- Cada app tem seu próprio `package.json` e `package-lock.json` (não há npm workspaces de propósito:
  evita problemas de hoisting com o Metro/Expo).

## Supabase
- `supabase/migrations/*.sql` versionadas com as mesmas versões do projeto remoto; detalhes em `docs/SUPABASE.md`.
- Tabelas com RLS de leitura pública e sem escrita pelo cliente; funções com `security invoker` e `set search_path = ''`
  (qualificar tudo: `extensions.st_*`, `public.tabela`).
- Rodar os advisors (segurança e performance) depois de toda mudança de esquema.

## Comandos
- Instalar: `npm run install:all` (ou `npm ci` dentro de cada app)
- Dados (com `scripts/.env`): `npm run data:import-geo` e `npm run data:import-crimes` (simulam; `-- --gravar` grava)
- API: `npm run api:dev` | build: `npm run api:build` | importar mapas: `npm run api:import-geo`
- Mobile: `npm run mobile:start` (validar deps nativas com `npx expo install --check` em `apps/mobile`)
- Checagem de tipos (rodar antes de todo commit): `npm run typecheck`
- Não há testes automatizados ainda.

## Convenções
- Pastas/arquivos de tela e componente em `Pascal_Snake_Case` (`Tela_Principal/Main/index.tsx` + `styles.ts`).
- Estilos sempre em `styles.ts` com styled-components e cores do tema (`theme.colors.*`), nunca hex solto.
- Rotas da API: `routes/*.routes.ts` → `controllers/*Controller.ts` → `models/*.ts`.
- GeoSampa: em `distritos.geojson`, `cd_identificador_subprefeitura` é o **código** da subprefeitura (`cd_subprefeitura`),
  não o identificador dela.
- Geometrias no banco sempre em WGS84 `[lng, lat]`. Os GeoJSON da GeoSampa vêm em EPSG:31983 e são
  convertidos por `utils/convertCoordinates.ts` no script `scripts/importGeo.ts`.
- Mensagens de commit em português, curtas e descritivas.

## Autoria de commits e PRs
- **Não** adicionar `Co-Authored-By: Claude`, `Claude-Session: ...` nem rodapé/assinatura do Claude ou do Claude Code
  em commits, PRs, comentários no GitHub ou código. Esta regra do dono do projeto substitui o padrão.
- `.claude/settings.json` mantém `"attribution": {"commit": "", "pr": ""}` — não alterar.

## Cuidados
- Nunca versionar `.env` (use `.env.example`), chaves do Supabase nem a planilha da SSP-SP (`apps/api/data/SSP-SP/*.xlsx`, ~100 MB).
- No app, variáveis de ambiente precisam do prefixo `EXPO_PUBLIC_` e são lidas com `process.env.EXPO_PUBLIC_*`.
  O código atual ainda usa `import.meta.env.VITE_API_URL` (herança de Vite) — ver `docs/DIAGNOSTICO.md`.
- React Native não tem `localStorage` nem `window.location`: use `expo-secure-store` para tokens e
  React Navigation para trocar de tela.
- Para dependências nativas no app, use `npx expo install <pacote>` (escolhe a versão compatível com o SDK).

## Estado atual e próximos passos
Fases 0 e 1 concluídas. Projeto Supabase `grad` (ref `snuxiwwvlaryggezcezi`, sa-east-1); login anônimo e
manual linking ligados. Sem extensão `h3`: hexágonos calculados com `h3-js`, resoluções 7/8/9 (zoom dinâmico).
Fase 2 em andamento: distritos e subprefeituras gravados no Supabase (96/32, geometrias válidas, vínculo conferido
espacialmente). Crimes: relatório com a planilha real ok (~380 mil BOs válidos em SP); falta aprovar os pesos novos
(extorsão/sequestro, arma, tráfico, culposo) e rodar `--gravar` no computador do dono — ver `scripts/README.md`.
Ver `docs/DIAGNOSTICO.md` (bugs conhecidos), `docs/DECISAO_BACKEND.md` (por que Supabase) e
`docs/PROMPT_CONTINUIDADE.md` (roadmap).
