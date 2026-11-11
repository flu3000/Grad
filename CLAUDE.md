# CLAUDE.md — contexto do projeto Grad

Este arquivo é lido automaticamente pelo Claude Code. Mantenha-o curto e atualizado.

## O que é
Grad: app mobile que mostra um mapa de São Paulo colorido por nível de perigo, calculado a partir
de boletins de ocorrência da SSP-SP. Projeto pessoal; idioma do código e dos commits: **português**.

## Monorepo
- `apps/mobile` — Expo SDK 58, React Native 0.88, React 19.3, TypeScript estrito, styled-components (temas claro e
  escuro em `src/theme/colors.ts`, mesmas chaves; níveis e opacidades em `src/theme/niveis.ts`), react-native-maps,
  expo-location, React Navigation (abas), `@supabase/supabase-js`. Entrada: `index.js` → `App.tsx` →
  `src/navigation/Abas.tsx` (Mapa, Área, Emergência, Perfil). Configurações (tema, intensidade suave/normal, unidades
  no mapa, centralizar) em `src/contexts/Config_Context.tsx`, salvas no AsyncStorage.
  Paleta neutra (grafite/cinza-claro) com um azul de destaque (`accent`/`onAccent`); níveis em escala YlOrRd (9 classes + cinza no nível 1).
  Supabase em `src/lib/supabase.ts` (sessão criptografada: chave no SecureStore, dados no AsyncStorage) e chamadas do
  mapa em `src/lib/mapa.ts`; estado global em `src/contexts/` (sessão de convidado e local atual).
- `scripts` — ingestão local (TypeScript + tsx): GeoSampa e SSP-SP → Supabase. Pesos em `scripts/src/config/crimeWeights.ts`.
- `supabase` — backend: Postgres + PostGIS + Supabase Auth (sa-east-1), sem servidor próprio (`docs/DECISAO_BACKEND.md`).
  A antiga API Express + MongoDB foi removida na Fase 2.3 (está no histórico do Git); o Railway foi abandonado.
- `data` — GeoJSON da GeoSampa (distritos, subprefeituras e `seguranca/`: PM, Polícia Civil, GCM e Bombeiros) e do Rio (sem uso); as planilhas da SSP-SP ficam em `data/SSP-SP/` e o CNEFE em `data/cnefe/`, fora do Git.
- Endereços de BOs **nunca** saem do computador (geocodificação só com o CNEFE local; no banco e no app, só agregados).
- Cada pacote (`apps/mobile`, `scripts`) tem seu próprio `package.json` e `package-lock.json` (não há npm workspaces de propósito:
  evita problemas de hoisting com o Metro/Expo).

## Supabase
- `supabase/migrations/*.sql` versionadas com as mesmas versões do projeto remoto; detalhes em `docs/SUPABASE.md`.
- Tabelas com RLS de leitura pública e sem escrita pelo cliente; funções com `security invoker` e `set search_path = ''`
  (qualificar tudo: `extensions.st_*`, `public.tabela`).
- Rodar os advisors (segurança e performance) depois de toda mudança de esquema.
- O MCP registra a migration com o horário da aplicação: renomear o arquivo local para essa versão. Cada migration tem
  um rollback em `supabase/rollback/*.down.sql` (não aplicar sem o pedido do dono) e backup antes (`data:backup`).

## Comandos
- Instalar: `npm run install:all` (ou `npm ci` dentro de cada pacote)
- Dados (com `scripts/.env`): `npm run data:import-geo` e `npm run data:import-postos` (simulam; `-- --gravar` grava).
  BOs: `data:limpar → data:indice-cnefe → data:geocodificar → data:processar → data:consolidar → data:verificar →
  data:backup → data:gravar → data:conferir-banco / data:conferir-publico` (detalhes em `scripts/README.md`; o
  `data:gravar` simula e só grava com `-- --gravar`, nunca apaga). Tarefas pesadas com `--workers=4`, uma por vez.
- Mobile: `npm run mobile:start` abre no app de desenvolvimento; `npm run mobile:go` abre no Expo Go (validar deps nativas com `npx expo install --check` em `apps/mobile`);
  validar o build sem celular: `npx expo export --platform android --platform ios` em `apps/mobile`
- Checagem de tipos (rodar antes de todo commit): `npm run typecheck`
- Testes (rodar antes de todo commit dos scripts): `npm test` (pipeline) e `npm run test:banco` (aplica todas as
  migrations num Postgres local — PGlite + PostGIS — e confere funções, permissões e rollback; rodar antes de aplicar
  uma migration). O app ainda não tem testes.
- `npm audit`: não usar `--force` no app (troca o SDK do Expo); ver a seção de dependências em `docs/DIAGNOSTICO.md`.
- O SDK precisa ser o mesmo do Expo Go instalado no celular (a loja só oferece o mais recente). Neste ambiente da nuvem,
  rodar o CLI do Expo com `EXPO_OFFLINE=1` (a rede bloqueia a API do Expo).
- O app precisa continuar abrindo no Expo Go: módulos nativos fora do Expo Go (`node_modules/expo/bundledNativeModules.json`),
  como o Google Sign-In, só são carregados com `require` dentro da função e quando `emExpoGo` é falso.
- Identificadores: `com.flu3000.grad` (Android `package` e iOS `bundleIdentifier`), esquema `grad`.
- Credenciais do Google/Maps entram por variável de ambiente (`.env` local e `eas env`), lidas em `app.config.ts`.

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
- Este ambiente da nuvem ("Grad") libera GeoSampa e o projeto Supabase; Node precisa de `NODE_USE_ENV_PROXY=1` para usar o proxy.

## Estado atual e próximos passos
Fases 0 e 1 concluídas. Projeto Supabase `grad` (ref `snuxiwwvlaryggezcezi`, sa-east-1); login anônimo e
manual linking ligados. Sem extensão `h3`: hexágonos calculados com `h3-js`, resoluções 7/8/9 (zoom dinâmico).
Fase 2 (itens 1 e 2) concluída: distritos e subprefeituras (96/32) e 17.636 hexágonos (373.639 BOs de 2025, mais 282
estupros sem coordenada distribuídos pelo distrito) gravados no Supabase e conferidos. Pesos aprovados (inclui
extorsão/sequestro 9, arma 3, tráfico 2, culposo 0). Fase 2.3 concluída: `apps/api` removido, dados em `data/`.
Fase 3 (itens 1 a 5) feita: app entra como convidado automaticamente, mapa com hexágonos por zoom (7/8/9), legenda,
card do local atual, balão com estatísticas do hexágono tocado e abas Área e Perfil (barra de abas padrão). Telas de
e-mail/senha removidas (decisão do dono). Fase 3.6 em código: login Google/Apple (`src/lib/loginSocial.ts`, vincula o
convidado com `linkIdentity`), `expo-dev-client`, `eas.json` e `app.config.ts` (plugins que dependem de credenciais);
falta o dono criar as credenciais e o primeiro build — passo a passo em `docs/LOGIN_SOCIAL.md`.
Escala de perigo com **10 níveis**, cortes calculados **por resolução** (percentis 15/30/45/60/72/82/90/95/98 dos
hexágonos com BO daquele tamanho; nível 10 = 2% mais perigosos).
Fase 3.7 (dados) concluída em 11/11/2026: 2023–2026 (2026 até agosto, anualizado pela sazonalidade), BO uma vez na
categoria mais grave, Tema 506, pontos padrão, geocodificação local pelo CNEFE (níveis aprovados e trava de 400 m),
**escala fixa** (cortes de 2023–2025 juntos, os mesmos para todo ano, período e hora). No banco: `hex_stats` (por ano,
período, hora e mês), `datasets`, `level_breaks`, `event_venues` e `address_report`; `hex_cells` espelha 2025 para o app
atual. Falta: números oficiais da SSP (dono baixa para `data/SSP-SP/oficial/`) e o app (Etapa 6, branch nova da `main`).
Extras (antes do login social): unidades de segurança no mapa (tabela `security_units` + `security_units_in_view`, 340
unidades da GeoSampa, sem telefone próprio), aba Emergência com telefones úteis e configurações com tema claro/escuro.
Ver `docs/DIAGNOSTICO.md` (bugs conhecidos), `docs/DECISAO_BACKEND.md` (por que Supabase) e
`docs/PROMPT_CONTINUIDADE.md` (roadmap).
