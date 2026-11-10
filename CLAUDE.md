# CLAUDE.md — contexto do projeto Grad

Este arquivo é lido automaticamente pelo Claude Code. Mantenha-o curto e atualizado.

## O que é
Grad: app mobile que mostra um mapa de São Paulo colorido por nível de perigo, calculado a partir
de boletins de ocorrência da SSP-SP. Projeto pessoal; idioma do código e dos commits: **português**.

## Monorepo
- `apps/mobile` — Expo SDK 54, React Native 0.81, React 19.1, TypeScript estrito, styled-components (tema em
  `src/theme/colors.js`, níveis em `src/theme/niveis.ts`), react-native-maps, expo-location, React Navigation (abas),
  `@supabase/supabase-js`. Entrada: `index.js` → `App.tsx` → `src/navigation/Abas.tsx` (Mapa, Área, Perfil).
  Supabase em `src/lib/supabase.ts` (sessão criptografada: chave no SecureStore, dados no AsyncStorage) e chamadas do
  mapa em `src/lib/mapa.ts`; estado global em `src/contexts/` (sessão de convidado e local atual).
- `scripts` — ingestão local (TypeScript + tsx): GeoSampa e SSP-SP → Supabase. Pesos em `scripts/src/config/crimeWeights.ts`.
- `supabase` — backend: Postgres + PostGIS + Supabase Auth (sa-east-1), sem servidor próprio (`docs/DECISAO_BACKEND.md`).
  A antiga API Express + MongoDB foi removida na Fase 2.3 (está no histórico do Git); o Railway foi abandonado.
- `data` — GeoJSON da GeoSampa e do Rio (sem uso); a planilha da SSP-SP fica em `data/SSP-SP/`, fora do Git.
- Cada pacote (`apps/mobile`, `scripts`) tem seu próprio `package.json` e `package-lock.json` (não há npm workspaces de propósito:
  evita problemas de hoisting com o Metro/Expo).

## Supabase
- `supabase/migrations/*.sql` versionadas com as mesmas versões do projeto remoto; detalhes em `docs/SUPABASE.md`.
- Tabelas com RLS de leitura pública e sem escrita pelo cliente; funções com `security invoker` e `set search_path = ''`
  (qualificar tudo: `extensions.st_*`, `public.tabela`).
- Rodar os advisors (segurança e performance) depois de toda mudança de esquema.

## Comandos
- Instalar: `npm run install:all` (ou `npm ci` dentro de cada pacote)
- Dados (com `scripts/.env`): `npm run data:import-geo` e `npm run data:import-crimes` (simulam; `-- --gravar` grava)
- Mobile: `npm run mobile:start` (validar deps nativas com `npx expo install --check` em `apps/mobile`);
  validar o build sem celular: `npx expo export --platform android --platform ios` em `apps/mobile`
- Checagem de tipos (rodar antes de todo commit): `npm run typecheck`
- Não há testes automatizados ainda.
- `npm audit`: não usar `--force` no app (troca o SDK do Expo); ver a seção de dependências em `docs/DIAGNOSTICO.md`.

## Convenções
- Pastas/arquivos de tela e componente em `Pascal_Snake_Case` (`Tela_Principal/Main/index.tsx` + `styles.ts`).
- Estilos sempre em `styles.ts` com styled-components e cores do tema (`theme.colors.*`), nunca hex solto.
- GeoSampa: em `distritos.geojson`, `cd_identificador_subprefeitura` é o **código** da subprefeitura (`cd_subprefeitura`),
  não o identificador dela.
- Geometrias no banco sempre em WGS84 `[lng, lat]`. Os GeoJSON da GeoSampa vêm em EPSG:31983 e são
  convertidos por `scripts/src/lib/geometry.ts` no `scripts/importGeo.ts`.
- Mensagens de commit em português, curtas e descritivas.

## Autoria de commits e PRs
- **Não** adicionar `Co-Authored-By: Claude`, `Claude-Session: ...` nem rodapé/assinatura do Claude ou do Claude Code
  em commits, PRs, comentários no GitHub ou código. Esta regra do dono do projeto substitui o padrão.
- `.claude/settings.json` mantém `"attribution": {"commit": "", "pr": ""}` — não alterar.

## Cuidados
- Nunca versionar `.env` (use `.env.example`), chaves do Supabase nem a planilha da SSP-SP (`data/SSP-SP/*.xlsx`, ~100 MB).
- No app, variáveis de ambiente precisam do prefixo `EXPO_PUBLIC_` e são lidas com `process.env.EXPO_PUBLIC_*`
  (`apps/mobile/.env`, ver `.env.example`). Só a chave **publicável** do Supabase vai no app, nunca a secreta.
- React Native não tem `localStorage` nem `window.location`: tokens ficam no `LargeSecureStore` de `src/lib/supabase.ts`
  e a troca de tela é pelo React Navigation.
- Para dependências nativas no app, use `npx expo install <pacote>` (escolhe a versão compatível com o SDK).

## Estado atual e próximos passos
Fases 0 e 1 concluídas. Projeto Supabase `grad` (ref `snuxiwwvlaryggezcezi`, sa-east-1); login anônimo e
manual linking ligados. Sem extensão `h3`: hexágonos calculados com `h3-js`, resoluções 7/8/9 (zoom dinâmico).
Fase 2 (itens 1 e 2) concluída: distritos e subprefeituras (96/32) e 17.636 hexágonos (373.639 BOs de 2025, mais 282
estupros sem coordenada distribuídos pelo distrito) gravados no Supabase e conferidos. Pesos aprovados (inclui
extorsão/sequestro 9, arma 3, tráfico 2, culposo 0). Fase 2.3 concluída: `apps/api` removido, dados em `data/`.
Fase 3 (itens 1 a 5) feita: app entra como convidado automaticamente, mapa com hexágonos por zoom (7/8/9), legenda,
card do local atual e abas Área e Perfil. Telas de e-mail/senha removidas (decisão do dono). Próximo: Fase 3.6
(login Google/Apple com `linkIdentity` + EAS development build).
Ver `docs/DIAGNOSTICO.md` (bugs conhecidos), `docs/DECISAO_BACKEND.md` (por que Supabase) e
`docs/PROMPT_CONTINUIDADE.md` (roadmap).
