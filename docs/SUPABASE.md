# Supabase do Grad

- **Projeto:** `grad` — ref `snuxiwwvlaryggezcezi`, região `sa-east-1` (São Paulo), plano gratuito,
  organização `flu3000`. Criado em 10/11/2026.
- **URL da API:** `https://snuxiwwvlaryggezcezi.supabase.co` (pública; vai em `EXPO_PUBLIC_SUPABASE_URL`).
- **Chaves:** a *publishable* pode ir no app (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, em `.env`); a *secret*
  (antiga `service_role`) só nos scripts locais, em `.env` não versionado. Nenhuma das duas entra no Git.

## Estrutura

```
supabase/
├── config.toml     Configuração do CLI (stack local e auth); anônimo e manual linking ligados
└── migrations/     Migrations versionadas, com as mesmas versões aplicadas no projeto remoto
```

| Migration | O que faz |
|---|---|
| `20261110005609_esquema_inicial` | PostGIS no schema `extensions`; tabelas `subprefectures`, `districts`, `hex_cells` (SRID 4326, índices GIST); RLS com leitura pública e sem escrita pelo cliente |
| `20261110005703_funcoes_mapa` | Funções `hexagons_in_view` e `locate_point` (security invoker, `search_path` vazio) |
| `20261110012322_resolucao_dinamica` | As duas funções passam a receber a resolução H3 (`res`, padrão 8) |
| `20261110015508_corrige_geometrias_invalidas` | Gatilho que aplica `st_makevalid` em distritos/subprefeituras inválidos ao gravar (Lajeado e Guaianases vêm com autointerseção da GeoSampa) |

A extensão `h3` **não** está disponível no projeto (só PostGIS 3.3.7). Os índices H3 e os polígonos dos
hexágonos são calculados no script de importação com `h3-js` e gravados em `hex_cells`.

### Tabelas

- `subprefectures(id, code, name, acronym, area_km2, geom MultiPolygon)` — `id` = `cd_identificador_subprefeitura` da GeoSampa.
- `districts(id, code, name, acronym, subprefecture_id → subprefectures, area_km2, geom MultiPolygon)` — `id` = `cd_identificador_distrito`.
- `hex_cells(h3_index pk, resolution, geom Polygon, score, level 1..5, counts jsonb, period, updated_at)`.

Escrita: só pelos scripts com a chave secreta (ignora RLS). `anon` e `authenticated` não têm privilégio de
insert/update/delete (testado: `permission denied for table hex_cells`).

### Funções (chamar com `supabase.rpc`)

```ts
// Hexágonos no retângulo visível, na resolução pedida (7, 8 ou 9; max_cells opcional, padrão 5000, teto 20000)
supabase.rpc('hexagons_in_view', { min_lng, min_lat, max_lng, max_lat, res: 8, max_cells: 5000 })
// → [{ h3_index, level, score, geometry /* GeoJSON Polygon */ }]

// Onde estou: distrito, subprefeitura e hexágono (sempre 1 linha; campos nulos fora de SP ou sem hexágono)
supabase.rpc('locate_point', { lat, lng, res: 8 })
// → [{ district_id, district_name, subprefecture_id, subprefecture_name, h3_index, level, score }]
```

### Zoom dinâmico
`hex_cells` guarda as resoluções 7 (≈ 5,2 km² por hexágono, 373 em SP), 8 (≈ 0,74 km², 2.278) e 9 (≈ 0,11 km², 14.985).
Sugestão para o app (Fase 3), pelo `latitudeDelta` da região do mapa: `> 0,15` → 7; `0,04–0,15` → 8; `< 0,04` → 9.

## Auth

### Feito no `config.toml` (stack local)
`enable_anonymous_sign_ins = true`, `enable_manual_linking = true`, limite de 30 logins anônimos/hora por IP.

### No painel (projeto remoto) — feito pelo dono em 10/11/2026
O MCP do Supabase não altera configurações de Auth. No painel do projeto `grad`:

1. **Authentication → Sign In / Providers** (ou *Settings* da seção Auth):
   - Ligue **Allow anonymous sign-ins**.
   - Ligue **Allow manual linking** (permite `linkIdentity` para converter convidado em Google/Apple).
2. Salve. (Alternativa por linha de comando: `npx supabase login`, `npx supabase link --project-ref snuxiwwvlaryggezcezi`
   e `npx supabase config push`, que envia o `config.toml` — revise o diff que ele mostra antes de confirmar.)

### Google (quando chegar a Fase 3.6)
1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e configure a *OAuth consent screen*.
2. Em *Credentials*, crie três *OAuth client IDs*: **Web** (usado pelo Supabase e como `webClientId` do
   `@react-native-google-signin/google-signin`), **Android** (package name do app + SHA-1 do certificado do EAS) e
   **iOS** (bundle identifier).
3. No Supabase: *Authentication → Providers → Google*: ligue, cole o Client ID **Web** e o secret; em
   *Authorized Client IDs* inclua também os IDs Android e iOS. Ative *Skip nonce check* só se o iOS exigir.
4. No app: `signInWithIdToken({ provider: 'google', token: idToken })`; para converter convidado,
   `linkIdentity({ provider: 'google', token: idToken })`.

### Apple (quando chegar a Fase 3.6; exige conta Apple Developer paga)
1. Em *Certificates, Identifiers & Profiles*, habilite **Sign in with Apple** no App ID do app.
2. No Supabase: *Authentication → Providers → Apple*: ligue e, em *Client IDs*, coloque o bundle identifier.
   No login nativo (`expo-apple-authentication`) não é preciso gerar o secret JWT; ele só é necessário para o fluxo web.
3. No app: `signInWithIdToken({ provider: 'apple', token: identityToken, nonce })`.

### Antes de lançar
Ativar CAPTCHA (Cloudflare Turnstile) em *Authentication → Attack Protection* para o login anônimo.

## Advisors (10/11/2026)
- Segurança: nenhum aviso.
- Performance: apenas `unused_index` (INFO) em índices de tabelas ainda vazias — esperado; reavaliar após a importação.
