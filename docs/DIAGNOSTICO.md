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

## API (`apps/api`)

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
