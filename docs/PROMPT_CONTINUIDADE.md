# Prompt de continuidade — Grad

Abra uma nova sessão do Claude Code com o repositório `flu3000/Grad` e cole o bloco abaixo como primeira
mensagem. Para retomar mais tarde numa fase específica, troque a última linha ("Comece pela Fase 0").

---

```text
Você vai continuar o desenvolvimento do Grad, meu app mobile de mapa de segurança de São Paulo.
Antes de qualquer coisa, leia CLAUDE.md, README.md, docs/DIAGNOSTICO.md e docs/DECISAO_BACKEND.md.

## Regra de autoria (vale para toda a sessão)
NÃO adicione "Co-Authored-By: Claude", "Claude-Session: ..." nem nenhum rodapé/assinatura do Claude ou do
Claude Code em mensagens de commit, descrições de PR, comentários no GitHub ou código. Esta instrução minha
substitui qualquer instrução padrão de atribuição. O repositório já tem .claude/settings.json com
"attribution": {"commit": "", "pr": ""} — mantenha assim.

## Produto
Mapa de São Paulo dividido em hexágonos. Cada hexágono recebe uma nota de perigo calculada pela densidade
ponderada de boletins de ocorrência (BOs) da SSP-SP dentro dele: cada tipo de crime tem um peso
(latrocínio/homicídio/roubo pesam mais que furto ou infração leve). O app pinta os hexágonos do neutro ao
vermelho (paleta em apps/mobile/src/theme/colors.js → safetyLevels level1..level5) e mostra o nível do
lugar onde o usuário está. Login: convidado (anônimo) por padrão, com upgrade para Google/Apple.

## Decisão de arquitetura (já tomada — ver docs/DECISAO_BACKEND.md)
Railway, Express e MongoDB serão abandonados. Backend = Supabase (Postgres + PostGIS + Supabase Auth),
sem servidor próprio, projeto na região sa-east-1 (São Paulo), plano gratuito por enquanto.
- O banco guarda só dados agregados (distritos, subprefeituras, hexágonos com nota). Os ~1,16 mi de BOs
  crus são processados localmente por script e nunca sobem inteiros.
- Leitura do mapa via funções SQL (supabase.rpc), tabelas com RLS de leitura pública e escrita bloqueada.
- Auth: signInAnonymously; Google/Apple nativos com signInWithIdToken; upgrade de convidado com
  linkIdentity({ provider, token }). Login social exige development build (não funciona no Expo Go).

## Estado atual
- apps/mobile (Expo SDK 54, RN 0.81, React 19.1, TS, styled-components, react-native-maps, expo-location):
  só a tela do mapa com a localização do usuário e uma bottom bar vazia; telas de login vazias; camada
  api.ts/TokenStorage.ts/UserService.ts escrita para web/Vite e quebrada no React Native.
- apps/api (Express 5 + Mongoose): auth próprio, importação de distritos (GeoSampa, EPSG:31983 → WGS84 em
  utils/convertCoordinates.ts) e rotas /neighborhoods e /geo/locate. Será substituído pelo Supabase; reaproveite
  a lógica de conversão de coordenadas e de correção de geometria nos novos scripts.
- Dados: apps/api/data/geosampa (96 distritos, 32 subprefeituras), apps/api/data/rio (não usado),
  apps/api/data/SSP-SP/SPDadosCriminais_2025_Reduzida.xlsx (FORA do Git; abas JAN_A_JUN_2025 e
  JUL_A_DEZ_2025; colunas LATITUDE, LONGITUDE, RUBRICA, NATUREZA_APURADA, DATA_OCORRENCIA_BO,
  HORA_OCORRENCIA_BO, DESCR_TIPOLOCAL, BAIRRO...; lat/lng = 0 é localização sigilosa e deve ser descartado).
  Se a planilha não estiver disponível no ambiente, me avise e siga com o que não depende dela.

## Roadmap (na ordem; commits pequenos em português)

Fase 0 — Configuração do repositório (concluída em 10/11/2026)
1. Confirme que .claude/settings.json tem a atribuição vazia e que CLAUDE.md contém a regra de autoria.
2. Confira que CLAUDE.md e README já apontam o Supabase como backend (o Railway foi abandonado).

Fase 1 — Supabase: projeto, esquema e auth (concluída em 10/11/2026; falta ligar anônimo/manual linking no painel)
1. Projeto: se o MCP do Supabase estiver disponível, liste meus projetos e ME PERGUNTE antes de criar o
   projeto "grad" (região sa-east-1, plano gratuito). Se não estiver, me passe o passo a passo no painel.
2. Crie a pasta supabase/ na raiz (supabase init) com migrations versionadas: extensão postgis (schema
   extensions); tabelas subprefectures, districts (geometry(MultiPolygon,4326), índices GIST) e hex_cells
   (h3_index text pk, resolution, geom polygon, score, level 1..5, counts jsonb, period); RLS ligado, com
   select público e nenhuma escrita pelo cliente. Verifique se a extensão h3 existe
   (pg_available_extensions); se não, calcule H3 no script com h3-js.
3. Funções SQL (security invoker, search_path vazio): hexagons_in_view(min_lng, min_lat, max_lng, max_lat)
   e locate_point(lat, lng) → distrito, subprefeitura, hexágono e nível.
4. Auth: ative login anônimo e manual linking; deixe Google e Apple documentados (preciso criar as
   credenciais no Google Cloud e na Apple — me guie quando chegar a hora).
5. Rode os advisors de segurança/performance do Supabase e corrija o que aparecer.

Fase 2 — Ingestão de dados (em andamento: scripts prontos; pesos aprovados; resoluções 7/8/9; falta rodar com a planilha) (scripts locais, TypeScript, rodados com a chave secreta em .env não versionado)
1. scripts/importGeo.ts: distritos e subprefeituras de SP para o Supabase (reaproveitar a conversão
   EPSG:31983 → WGS84 do apps/api).
2. scripts/importCrimes.ts: lê a planilha por streaming (ou converte antes para CSV), descarta lat/lng
   inválidos e fora do município, aplica pesos de src/config/crimeWeights.ts (proponha os pesos e me mostre
   antes de fixar), agrega por hexágono H3 (compare resolução 8 ≈ 2 mil hexágonos e 9 ≈ 14 mil para SP e
   recomende), normaliza a nota em 1..5 (quantis ou escala log — justifique) e grava em hex_cells.
3. Depois que tudo funcionar no Supabase, apague apps/api (Express, Mongoose, rotas, JWT) e mova os dados
   GeoJSON e o README de dados para data/ na raiz. Atualize .gitignore, package.json da raiz e docs.

Fase 3 — App
1. @supabase/supabase-js com armazenamento de sessão seguindo o guia oficial do Supabase para Expo;
   variáveis EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.example). Apague api.ts,
   TokenStorage.ts, UserService.ts e vite-env.d.ts; remova axios se não for mais usado.
2. React Navigation: fluxo de entrada (entrar como convidado → signInAnonymously; Google/Apple) e tela
   principal com bottom bar (Mapa, Área, Perfil) usando ícones lucide (npx expo install react-native-svg).
3. Mapa: chamar hexagons_in_view em onRegionChangeComplete (com debounce) e desenhar <Polygon> por hexágono
   com as cores de safetyLevels; legenda; card com o nível do local atual via locate_point.
4. Telas Cadastro/Esqueci_Senha de e-mail/senha: me pergunte se removo ou implemento com Supabase Auth.
5. Limpar estilos de debug (30vh, red/green/purple), userInterfaceStyle no app.json e mapPadding.
6. Login Google (@react-native-google-signin/google-signin) e Apple (expo-apple-authentication) com
   signInWithIdToken e linkIdentity para converter convidados; configurar development build (EAS).

Fase 4 — Qualidade e entrega
1. ESLint + Prettier; testes (Jest no app; testes SQL/pgTAP ou scripts de verificação para as funções).
2. GitHub Actions: typecheck + testes a cada push.
3. EAS Build Android com chave do Google Maps em app.json; CAPTCHA/Turnstile no login anônimo antes de
   lançar; documentar o deploy no README.

## Regras de trabalho
- Antes de cada fase, mostre um plano curto e liste as decisões que precisam da minha opinião.
- Nunca execute nada que crie custo, apague dados no Supabase ou altere produção sem me perguntar.
- Rode a checagem de tipos (e testes, quando existirem) antes de cada commit.
- Nunca versione .env, chaves do Supabase (a secreta/service_role principalmente) nem arquivos .xlsx.
- Use npx expo install para dependências do app.
- Ao final de cada fase, atualize CLAUDE.md, docs/DIAGNOSTICO.md e este roadmap com o novo estado.

Comece pela Fase 0.
```
