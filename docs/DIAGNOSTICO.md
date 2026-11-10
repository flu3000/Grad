# Diagnóstico do projeto Grad — 09/11/2026

Varredura completa dos dois repositórios originais (`flu3000/Grad` e `flu3000/Grad-back`) antes da unificação.

## Resumo

| | App mobile (`apps/mobile`) | API (`apps/api`) |
|---|---|---|
| Último commit de código | 19/02/2026 (Commit 5) | 27/02/2026 (Commit 15) |
| Commits | 6 | 14 |
| Compila (TypeScript) | Sim | Sim (`npm run build` ok) |
| Bundle Android (`expo export`) | Gera, mas só porque o código de login ainda não é usado | – |
| Testes automatizados | Nenhum | Nenhum |
| Vulnerabilidades (`npm audit`) | 39 (2 críticas, 19 altas) — maioria em ferramentas de dev | 13 (1 crítica, 5 altas) — corrigíveis com `npm audit fix` |
| Progresso estimado | ~15%: mapa com localização + esqueleto de tela de cadastro | ~40%: auth completo, importação de distritos, rota de geolocalização |

**O que já funciona:** API com login anônimo/Google/Apple e refresh token com rotação; MongoDB com
distritos e subprefeituras de SP (convertidos de UTM para WGS84) e consulta "em qual distrito está este
ponto"; app abre o mapa centrado na localização do usuário com uma barra de navegação flutuante.

**O que ainda não existe:** nada da parte central do produto — ingestão dos BOs, pesos por tipo de crime,
grade hexagonal, cálculo de nota e pintura do mapa. Também não há navegação entre telas nem login
funcionando no app.

## Problemas críticos (bloqueiam o app falar com a API)

1. **Variável de ambiente no formato do Vite, não do Expo.** `apps/mobile/src/services/api.ts:5` e `:26` usam
   `import.meta.env.VITE_API_URL`. O Expo só injeta variáveis com prefixo `EXPO_PUBLIC_` via
   `process.env.EXPO_PUBLIC_API_URL`. Hoje `baseURL` fica `undefined`. O arquivo `src/vite-env.d.ts` também é herança do Vite.
2. ~~**URL interna do Railway.**~~ *(Obsoleto em 10/11/2026: o Railway foi abandonado em favor do Supabase.)* O `.env` do app aponta para `https://grad-back.railway.internal`, endereço da
   rede privada do Railway, inacessível de um celular. É preciso usar o domínio público
   (`https://<servico>.up.railway.app`) ou `http://<IP-do-PC>:3333` em desenvolvimento.
3. **`localStorage` e `window.location` não existem no React Native.** `src/services/TokenStorage.ts` e
   `api.ts:37` vão quebrar em tempo de execução. Usar `expo-secure-store` (tokens) e React Navigation (redirecionar ao login).
4. **Rotas de vínculo de conta divergentes.** O app chama `/auth/link-google` e `/auth/link-apple`
   (`UserService.ts:47,57`); a API expõe `/auth/link/google` e `/auth/link/apple` (`auth.routes.ts:29-30`) → 404.

## API (`apps/api`) — removida na Fase 2.3 (10/11/2026); seção mantida como histórico

- **Import do dotenv fora de ordem** (`src/server.ts:1-2`): `app` é importado antes de `dotenv/config`, então
  `AuthController` cria o cliente Google com `GOOGLE_CLIENT_ID` vazio quando a API é iniciada com `npm start` + `.env`.
  Em dev (`tsx --env-file`) e no Railway não aparece. Corrigir importando `dotenv/config` primeiro.
- **`/neighborhoods/getAll` pesado** (`NeighborhoodController.ts:28`): devolve os 96 polígonos em resolução
  total (o export tem ~11 MB) e ignora buracos/anéis internos. Precisa simplificar geometria (ex.: `@turf/simplify`,
  já instalado) e/ou paginar por viewport.
- **`/geo/locate`** (`GeoController.ts:9`): `!lat || !lng` rejeita coordenada 0 e não valida tipo; deveria ser
  `GET` com query e validação via `zod` (já instalado, mas não usado).
- **Vincular conta** (`linkGoogle`/`linkApple`): permite sobrescrever uma conta que já é Google/Apple, não só a
  anônima. Restringir a `provider === "anonymous"`.
- **Sem tratamento central de erros, sem CORS, sem rate limit.** `/auth/anonymous` pode ser chamado em loop
  para criar usuários infinitos. Adicionar `express-rate-limit` e um middleware de erro.
- **Respostas expõem o documento inteiro do usuário** (incluindo `refreshToken`). Criar um `toJSON`/DTO.
- **Arquivos vazios / rascunhos:** `jobs/updateCrimeData.ts`, `services/auth.service.ts`, `services/crimeDataService.ts`,
  `middlewares/refreshToken.middleware.ts`, `utils/hash.ts`. `models/CrimeStats.ts` tem só a interface (sem schema/model).
- **`rotas_API.txt` descreve login por e-mail/senha** (criar usuário, verificar e-mail, esqueci senha) que não existe;
  o código implementa só login social/anônimo. A tela `Cadastro` do app também é de e-mail/senha. **Decisão pendente.**
- **Dependências sobrando:** `@types/bcryptjs` (sem bcrypt), `ts-node` (usa-se `tsx`). `importGeo.ts:21` calcula uma
  variável `geometry` que não é usada.
- **Rio de Janeiro:** dados em `data/rio/` mas não importados (`importGeo.ts:85`). O README fala só de SP.

## App (`apps/mobile`)

- **Sem navegação:** `App.tsx:15` renderiza `<Main />` direto. React Navigation está instalado mas não configurado.
- **Telas de Login e Esqueci_Senha são arquivos vazios** (`index.ts` sem export) — importá-los quebra o build.
- **Tela Cadastro:** `styles.ts:11` usa `30vh` (não suportado no RN) e cores de debug (`red`, `green`, `purple`).
  Os `useState` de e-mail/senha nunca recebem valor porque `Text_Input` guarda o texto só internamente.
  Botão de mostrar senha (ícones `Eye/EyeOff` importados) não implementado.
- **Bottom navigation** com três botões vazios e estilos copiados do input (`StrengthBar` etc. não usados).
- **Mapa:** `mapPadding` com valores estranhos (`bottom: -insets.bottom`); nenhum polígono ou hexágono desenhado.
  Para build Android de produção, `react-native-maps` exige chave do Google Maps em `app.json`
  (`android.config.googleMaps.apiKey`); no Expo Go funciona sem.
- **`react-native-svg`** (necessário para `lucide-react-native`) não está declarado no `package.json`; rodar
  `npx expo install react-native-svg`.
- `app.json` declara `userInterfaceStyle: "light"`, mas o tema é escuro.

## Repositório / infraestrutura

- **Planilha de 100 MB no histórico do Grad-back.** O "Commit 15 - apagando a tabela pra deploy" só mudou o
  `.gitignore`; o arquivo continuou versionado (a regra `data/*.xlsx` nem casava com `data/SSP-SP/...`). Isso deixa
  o clone com ~103 MB. **No repositório unificado o arquivo foi removido de todo o histórico** e agora é ignorado.
- `.idea/` (config do IDE) e `.env` estavam versionados no app — removidos do Git (os arquivos locais continuam).
- Sem CI (GitHub Actions), sem lint/prettier, sem testes.

## Dados disponíveis

- `geosampa/distritos.geojson` (96) e `subprefeituras.geojson` (32): EPSG:31983, convertidos na importação.
- `rio/bairros.geojson` (166) e `regioes_adm.geojson` (33): já em WGS84.
- SSP-SP 2025 (fora do Git): ~1,16 milhão de BOs com lat/lng, rubrica e natureza. Muitos com lat/lng = 0
  (sigilo) e nomes de bairro inconsistentes ("Sé" vs "SÉ") — usar lat/lng, não o nome do bairro.

## Atualização — 10/11/2026 (Fases 0 e 1)

- Projeto Supabase `grad` criado (sa-east-1, gratuito). Migrations em `supabase/migrations`: PostGIS, tabelas
  `subprefectures`, `districts`, `hex_cells` com RLS (leitura pública, escrita bloqueada) e as funções
  `hexagons_in_view` e `locate_point`. Advisors de segurança sem avisos. Detalhes em `docs/SUPABASE.md`.
- Extensão `h3` indisponível no Supabase: H3 será calculado no script com `h3-js`.
- Login anônimo e manual linking ligados no painel pelo dono.
- **Pendente:** a planilha da SSP-SP não existe no ambiente da nuvem; a importação de crimes (Fase 2.2)
  precisa rodar onde o arquivo estiver, ou o arquivo precisa ser disponibilizado.

## Atualização — 10/11/2026 (Fase 2, parte 1)

- Pacote `scripts/` com `importGeo.ts` e `importCrimes.ts` (streaming com exceljs, filtro por distrito, H3 com h3-js).
  Testado com planilha sintética de 40 mil linhas (4 s); a real tem ~1,16 mi, estimativa de 1–3 min.
- Pesos aprovados (estupro 9; roubo de veículo/carga 6). Classificação por regras em ordem; o relatório lista
  os textos que caíram em "outros" para revisão antes de gravar.
- Nível 1..5 por quintis do peso/km² na resolução 8, com os mesmos cortes nas resoluções 7 e 9.
  **Reavaliar com os dados reais:** na resolução 9, poucos BOs por hexágono podem deixar o mapa "pipocado".
- Normalização por população: não usada na cor do mapa (ver justificativa no histórico da sessão e em
  `scripts/README.md`); candidata a informação complementar por distrito na aba Área.

## Atualização — 10/11/2026 (Fase 2, parte 2: dados reais)

- Distritos e subprefeituras gravados pelo dono. Dois bugs encontrados e corrigidos:
  - **Vínculo distrito → subprefeitura errado em 95 de 96 distritos.** O campo `cd_identificador_subprefeitura` do
    arquivo de distritos é o *código* da subprefeitura, não o identificador. O `importGeo.ts` legado (Mongo) tinha o
    mesmo erro. Corrigido no script novo e no banco; conferido espacialmente (96/96).
  - **Geometrias inválidas** (autointerseção) no distrito Lajeado e na subprefeitura Guaianases, vindas da GeoSampa.
    Corrigidas com gatilho `st_makevalid` (migration `corrige_geometrias_invalidas`).
- Relatório de crimes com a planilha real: 1.161.132 linhas, 318 mil sem localização, 463 mil fora do município
  (a planilha cobre o estado), ~380 mil válidas. A primeira aba não tem dados. Estupro aparece zerado: a SSP não
  publica localização de crimes sexuais nessa base.
- O aviso de meses repetidos entre abas era esperado (data da ocorrência ≠ data do registro). Agora os duplicados são
  removidos pelo número do BO + ano + delegacia.
- Novas categorias propostas: extorsão mediante sequestro (9), porte/posse de arma (3), tráfico (2), culposos (0).
- Estupro sem coordenada: proposta de distribuir o peso pela área do distrito (não no centroide, para não criar
  mancha falsa num hexágono), contando só local público. O relatório agora traz `semLocalizacao_diagnostico`
  (cidade, categoria, se o BAIRRO casa com um distrito, tipo de local) para decidir com os dados reais.
- Segundo relatório real: a planilha **não tem `NUM_BO`** (não dá para deduplicar por número). As abas são divididas pela
  data de registro (1º e 2º semestre de 2025) e trazem ocorrências antigas (desde 2005) e algumas de 2026. Agora, por padrão,
  só contam ocorrências dentro do período (`--todas-as-datas` desliga). O aviso de duplicação foi recalibrado (só meses com
  ≥ 1% das linhas e divididos ≥ 25% entre abas). Sem coordenada na capital: 87.765 BOs, 2.925 estupros (64% com bairro
  igual a nome de distrito).
- Pesos novos aprovados (culposo = 0: crime sem intenção, quase todo de trânsito). Estupro sem coordenada, na capital,
  em local público e com bairro = distrito passa a ser distribuído igualmente pelos hexágonos do distrito.
- Terceiro relatório real: 418 estupros distribuídos pelos distritos. Ajustes: cortes de nível calculados só com BOs
  com coordenada (os distribuídos tinham baixado o 1º corte de ~80 para 12); "local público" restrito a espaços de
  circulação (sem escola, saúde, templo, repartição); apreensão/mandado → peso 0; "Centro Histórico" → Sé.
  Bairros menores (Jardim Colina, Vila Fanton…) não casam com distrito: precisaria de tabela bairro → distrito.

## Atualização — 10/11/2026 (Fase 2: dados gravados e conferidos)

- `hex_cells`: 373 / 2.278 / 14.985 hexágonos (res. 7 / 8 / 9), 373.639 BOs com coordenada e 282 estupros distribuídos
  em cada resolução, período 2025, nenhuma geometria inválida. Níveis idênticos aos do relatório.
- `locate_point` (como `anon`): Sé, Paulista, Luz e Largo 13 → nível 5; Cantareira → 1; Guarulhos → nulo (fora de SP);
  distrito e subprefeitura corretos em todos os pontos testados.
- `hexagons_in_view`: cidade inteira na res. 7 = 372 hexágonos (~79 KB de GeoJSON) em ~45 ms.
- Advisors: segurança sem avisos; performance só `unused_index` no índice da FK `districts.subprefecture_id` (mantido).
- **Para avaliar na Fase 3:** o nível 5 junta scores de ~900 a ~10.000 peso/km² (Sé ≈ 6.400, Cidade Tiradentes ≈ 970).
  Se o mapa ficar pouco informativo no centro, dá para usar o `score` para variar a intensidade dentro do nível 5.

## Atualização — 10/11/2026 (Fase 2.3)

- `apps/api` (Express, Mongoose, rotas, JWT) removido; continua no histórico do Git.
- Dados movidos para `data/` (`geosampa/`, `rio/` e `README.md`); `grad.neighborhoods.geojson` (export do MongoDB) apagado.
- `package.json` da raiz sem os atalhos `api:*`; `install:all` e `typecheck` cobrem `apps/mobile` e `scripts`.
- **Pendente na Fase 3:** `apps/mobile/.env.example` ainda tem `VITE_API_URL` apontando para o Railway; será trocado
  por `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Atualização — 10/11/2026 (Fase 3, itens 1 a 5)

- App reescrito sobre o Supabase. Resolvidos os problemas críticos do início deste documento: `VITE_API_URL`, URL do
  Railway, `localStorage`/`window.location` e rotas de vínculo divergentes (os arquivos `api.ts`, `TokenStorage.ts`,
  `UserService.ts`, `vite-env.d.ts` e `interfaces/User.ts` foram apagados; axios removido).
- Navegação por abas (Mapa, Área, Perfil) com a barra flutuante; entra direto no mapa como convidado.
- Mapa: hexágonos por resolução conforme o zoom (`latitudeDelta` > 0,15 → 7; > 0,04 → 8; senão 9), busca 350 ms
  depois do último movimento, cancelando a anterior; legenda; card do local atual (`locate_point`) e estilo escuro.
- Nível 1 passou a ser cinza neutro ("poucos registros"), não verde.
- Telas de e-mail/senha (Cadastro, Login, Esqueci_Senha) e `Text_Input` removidas. Estilos de debug, `30vh`,
  `mapPadding` negativo e `userInterfaceStyle: light` corrigidos. TypeScript em modo estrito.
- Verificado aqui: `tsc` estrito e `expo export` para Android e iOS sem erros; funções do mapa testadas no banco como
  `anon`. **Não testado em celular** (o ambiente da nuvem não roda o app nem acessa o Supabase por HTTP).
- **Pendente:** build Android de produção precisa da chave do Google Maps em `app.json` (Fase 4.3); o nível 5 ainda
  junta scores muito diferentes (avaliar no celular).

## Dependências e `npm audit` — 10/11/2026

- **App atualizado do Expo SDK 54 para o 58** (React Native 0.88, React 19.3, react-native-maps 1.29), porque o Expo Go
  da loja só abre projetos do SDK mais recente. Dependências nativas alinhadas com `expo install --fix`.
  `react-native-get-random-values` (fora do Expo Go 58) trocado por `expo-crypto` no armazenamento da sessão.
  `newArchEnabled` e `android.edgeToEdgeEnabled` saíram do `app.json` (obrigatórios desde o SDK 55).
- `apps/mobile`: 5 vulnerabilidades moderadas, todas no CLI do Expo (`glob` 13 e `minimatch` 10 em `@expo/cli` e
  `@expo/fingerprint`), que roda só no computador de desenvolvimento. O npm sugere "corrigir" voltando para o Expo 53;
  **não** usar `npm audit fix --force`. Os `overrides` de `ws`/`postcss` do SDK 54 não são mais necessários.
- `scripts`: 0 vulnerabilidades (`overrides` de `uuid` → 11.x; o exceljs só usa `v4`, que não mudou).
- Os avisos `npm warn deprecated` (inflight, glob, rimraf, fstream…) vêm de dependências indiretas e não afetam o uso.

## Atualização — 10/11/2026 (Fase 3: ajustes e item 6)

- Barra de abas: trocada a barra flutuante por uma barra padrão presa embaixo (React Navigation), com o tema do app.
- Mapa: tocar num hexágono abre um balão com distrito, subprefeitura, nível, total de BOs e BOs por tipo (via
  `locate_point` no centro do hexágono, na resolução visível). Componentes `Selo_Nivel` e `Lista_Ocorrencias` reutilizados
  na aba Área.
- Item 6 (código pronto, **não testado**: depende de credenciais e de um development build):
  - `src/lib/loginSocial.ts`: Google (`@react-native-google-signin/google-signin` 17) e Apple (`expo-apple-authentication`,
    com nonce). Convidado → `linkIdentity`; se a conta já existir (`identity_already_exists`) → `signInWithIdToken`.
  - No Expo Go o Perfil mostra um aviso; o módulo do Google só é carregado fora do Expo Go.
  - `app.json`: `com.flu3000.grad`, esquema `grad`, `usesAppleSignIn`; `app.config.ts` adiciona os plugins do Google
    Sign-In e do Google Maps (Android) quando as variáveis existem; `eas.json` com perfis development/preview/production.
  - Pendente do dono: credenciais Google Cloud (OAuth Web/Android/iOS e chave do Maps), provedores no Supabase,
    `eas init` e primeiro build (`docs/LOGIN_SOCIAL.md`). iOS exige Apple Developer Program.

## Atualização — 10/11/2026 (extras antes do login social)

- **Unidades de segurança no mapa:** 340 unidades oficiais da GeoSampa (PM 159, Polícia Civil 93, GCM 48, Bombeiros 40)
  em `security_units`. Marcadores com ícone por força aparecem com zoom de bairro (`latitudeDelta` ≤ 0,15); toque abre
  balão com endereço, bairro, distrito, CEP, "Como chegar" e "Ligar".
  - A base **não tem telefones** das unidades: o botão liga para o número geral (190, 197, 153, 193). O OpenStreetMap
    (Overpass) poderia completar, mas recusou a conexão a partir do ambiente da nuvem; tentar de outro lugar.
  - Delegacias da Mulher (DDM) **não** estão na camada da Polícia Civil da GeoSampa.
  - Nomes/endereços padronizados no script (caixa, "R" → "Rua", repetições como "Rua Rua"); acentos ausentes na fonte.
- **Aba Emergência:** 190, 192, 193, 197, 181, 153, 191, 180, 100, 188, 199, 156 com toque para ligar (com confirmação)
  e link para a Delegacia Eletrônica.
- **Configurações (Perfil):** tema Sistema/Claro/Escuro (com mapa claro/escuro), intensidade das cores dos hexágonos,
  unidades no mapa, legenda e centralizar ao abrir; salvas no aparelho.
- Testado deste ambiente pela internet: `hexagons_in_view`, `locate_point`, `security_units_in_view`, login anônimo e
  bloqueio de escrita do cliente — todos ok.

## Atualização — 10/11/2026 (8 níveis e nova paleta)

- **Escala de 8 níveis.** O nível 5 antigo (20% mais perigosos) ia de ~900 a ~10.000 de peso/km². Agora os cortes são
  os percentis 15, 30, 45, 60, 75, 87 e 95 dos hexágonos com BO (res. 8): 36 / 203 / 428 / 590 / 804 / 1.090 / 1.683.
  Distribuição na res. 8: 881 / 246 / 247 / 246 / 247 / 197 / 131 / 83. Recalculado direto no banco a partir do
  `score` (sem rodar a planilha de novo); o script usa a mesma regra. Ex.: Sé e Paulista = 8; Moema, Cidade Tiradentes e
  Parelheiros (que estavam no mesmo nível 5) = 6.
- **Paleta:** fundo grafite (escuro) e cinza-claro/branco (claro), um único azul de destaque para botões e itens ativos,
  vermelho só para emergência; níveis em escala sequencial YlOrRd (ColorBrewer) com nível 1 cinza. Mapa escuro do
  Android em tons neutros. Legenda virou uma faixa compacta com os 8 níveis.
- **Configurações:** saíram a intensidade "forte" (escondia o mapa) e o interruptor da legenda (ela já recolhe com um
  toque). Configurações antigas salvas no aparelho são convertidas automaticamente.
- **Atenção:** versões do app anteriores a esta só conhecem 5 níveis; usar a versão nova com o banco atual.
