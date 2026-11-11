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
├── migrations/     Migrations versionadas, com as mesmas versões aplicadas no projeto remoto
├── rollback/       Volta de uma migration (*.down.sql). NÃO é aplicada automaticamente: só com o pedido do dono
└── testes/         SQL de conferência (desempenho.sql: explain analyze e tamanhos; só lê)
```

| Migration | O que faz |
|---|---|
| `20261110005609_esquema_inicial` | PostGIS no schema `extensions`; tabelas `subprefectures`, `districts`, `hex_cells` (SRID 4326, índices GIST); RLS com leitura pública e sem escrita pelo cliente |
| `20261110005703_funcoes_mapa` | Funções `hexagons_in_view` e `locate_point` (security invoker, `search_path` vazio) |
| `20261110012322_resolucao_dinamica` | As duas funções passam a receber a resolução H3 (`res`, padrão 8) |
| `20261110121600_locate_point_com_contagens` | `locate_point` devolve também `counts` (total, peso e BOs por categoria) para a aba Área |
| `20261110151858_escala_de_10_niveis_por_resolucao` | 10 níveis, com cortes por resolução (percentis 15/30/45/60/72/82/90/95/98) |
| `20261110145922_escala_de_8_niveis` | Níveis passam de 5 para 8 (percentis 15/30/45/60/75/87/95 da resolução 8) e são recalculados |
| `20261110140840_unidades_de_seguranca` | Tabela `security_units` (PM, Polícia Civil, GCM e Bombeiros da GeoSampa) e função `security_units_in_view` |
| `20261110015508_corrige_geometrias_invalidas` | Gatilho que aplica `st_makevalid` em distritos/subprefeituras inválidos ao gravar (Lajeado e Guaianases vêm com autointerseção da GeoSampa) |
| `20261111140549_anos_periodos_horarios_e_enderecos` | Fase 3.7: tabelas `datasets`, `level_breaks`, `hex_stats` e `event_venues`; `hex_cells.area_km2`; `hexagons_in_view` e `locate_point` com ano, períodos e horas; nova `address_report`; `set_hex_cell_areas` e `mirror_year_to_hex_cells` (só `service_role`). Rollback em `supabase/rollback/` |

As migrations são aplicadas pelo MCP do Supabase, que registra a versão com o horário da aplicação; depois o arquivo
local é renomeado para essa versão (`list_migrations` tem que bater com `supabase/migrations/`). Antes de aplicar, rode
`npm run test:banco` (aplica todas as migrations num Postgres local) e, depois, os advisors.

A extensão `h3` **não** está disponível no projeto (só PostGIS 3.3.7). Os índices H3 e os polígonos dos
hexágonos são calculados no script de importação com `h3-js` e gravados em `hex_cells`.

### Tabelas

- `subprefectures(id, code, name, acronym, area_km2, geom MultiPolygon)` — `id` = `cd_identificador_subprefeitura` da GeoSampa.
- `districts(id, code, name, acronym, subprefecture_id → subprefectures, area_km2, geom MultiPolygon)` — `id` = `cd_identificador_distrito`.
- `hex_cells(h3_index pk, resolution, geom Polygon, score, level 1..10, counts jsonb, period, updated_at, area_km2)` — a
  grade inteira (17.636 hexágonos). `level/score/counts` **espelham o ano padrão** (hoje 2025, `period = '2025'`), sem o
  detalhe por período, para o app atual; o `data:gravar` copia o ano padrão de `hex_stats` com `mirror_year_to_hex_cells`.
- `datasets(year pk, first_month, last_month, last_complete_month, months_covered, complete, rows_valid, rows_distributed,
  rows_no_location, rows_geocoded, rows_swapped, rows_no_hour, period_factor, hour_factor, annual_factor,
  hidden_location jsonb, source_files, notes, imported_at)` — um ano de dados. `hidden_location` = % sem localização
  (sigilo) no ano e a frase fixa "A SSP não divulga a localização…", calculada com todos os anos.
- `level_breaks(resolution pk, breaks real[9], reference, updated_at)` — cortes fixos da escala (2023–2025 juntos).
- `hex_stats(h3_index → hex_cells, year → datasets, resolution, score, level, counts jsonb, weight/total/levels_by_period[4],
  weight/total/levels_by_hour[24], weight/total_by_month[12])`, pk `(h3_index, year)` — só hexágonos com BO no ano
  (linha ausente = nível 1). 60.607 linhas, 82 MB. `counts`: categorias, `total`, `peso`, `sem_periodo`, `sem_hora`,
  `geocodificado`, `trocado`, `distribuido_pelo_distrito` e `por_periodo` (categorias por período).
- `event_venues(name, year → datasets, lat, lng, radius_m, kind arena|rua, bos, median_per_day, peak_threshold, peak_days,
  pct_in_peak_days, top_days, geom Point)`, pk `(name, year)` — 11 locais × 4 anos.

Tamanho em 11/11/2026: banco 132 MB (`hex_stats` 82 MB, `hex_cells` 27 MB), de 500 MB do plano grátis.

Escrita: só pelos scripts com a chave secreta (ignora RLS). `anon` e `authenticated` não têm privilégio de
insert/update/delete (testado: `permission denied for table hex_cells`).

### Funções (chamar com `supabase.rpc`)

```ts
// Hexágonos no retângulo visível, na resolução pedida (7, 8 ou 9; max_cells opcional, padrão 5000, teto 20000).
// p_year nulo = ano padrão (o ano completo mais recente de datasets). with_periods / with_hours trazem os níveis.
supabase.rpc('hexagons_in_view', { min_lng, min_lat, max_lng, max_lat, res: 8, max_cells: 5000, p_year: 2026, with_periods: true, with_hours: true })
// → [{ h3_index, level, score, geometry /* GeoJSON Polygon */, levels_by_period /* [4] ou null */, levels_by_hour /* [24] ou null */ }]

// Onde estou: distrito, subprefeitura e hexágono (sempre 1 linha; campos nulos fora de SP ou sem hexágono)
supabase.rpc('locate_point', { lat, lng, res: 8, p_year: null })
// → [{ district_id, district_name, subprefecture_id, subprefecture_name, h3_index, level, score, counts,
//      year, levels_by_period, total_by_period, levels_by_hour, total_by_hour }]

// Relatório de um endereço (jsonb): hexágonos res 9 com o centro a até radius_m (100–2000, padrão 500),
// comparados com a escala da res 8
supabase.rpc('address_report', { lat, lng, radius_m: 500, p_year: null })
// → { year, complete, months, radius_m, district, subprefecture, hexagons, area_km2, total, score, level,
//     city_percentile, by_category, by_period[4] (total, score, level, top 3), by_hour[24], levels_by_hour[24],
//     time_precision (exact_hour_pct, period_only_pct, none_pct), day_night, evolution (todos os anos),
//     same_period (ano parcial × mesmos meses), security_units (mais próxima de cada tipo, quantas a 1 e 2 km),
//     event_venues (avisos), hidden_location (frase do sigilo) }      ou { error: 'sem_dados' }
```

Sem `p_year` nem `with_*`, `hexagons_in_view` e `locate_point` devolvem as colunas de antes, na mesma ordem (o app
atual não muda); as colunas novas vêm no fim. LGPD: no `address_report`, estupro com menos de 3 registros sai como
`"<3"`. Aviso de evento só quando o raio encosta no local e, no ano consultado, ≥ 15% dos BOs do local foram em dias de
pico (texto próprio para os locais de rua). Desempenho em 11/11/2026 (explain analyze): `address_report` ~15 ms com a
conexão aquecida (~120–180 ms na 1ª chamada de uma conexão nova); `hexagons_in_view` com horas numa tela res 9 ~41 ms
(~285 ms frio) e na cidade inteira em res 8 ~86 ms.

Funções do script de gravação (só `service_role`): `set_hex_cell_areas(p_areas jsonb)` e `mirror_year_to_hex_cells(p_year)`.

### Backup e rollback (Fase 3.7)

- Antes de gravar: `npm run data:backup` (cópia de `hex_cells` sem a geometria em `scripts/out/backup/`) e as
  definições das funções e políticas (`pg_get_functiondef` / `pg_policies`) em `scripts/out/backup/funcoes_<data>.sql`.
  Backup de 11/11/2026: 17.636 linhas.
- Voltar atrás (só com o pedido do dono): `npm run data:restaurar-backup -- --gravar` (devolve `level/score/counts/period`
  de `hex_cells`) e `supabase/rollback/20261111140549_anos_periodos_horarios_e_enderecos.down.sql` (remove as tabelas, a
  coluna e as funções novas e recria as 3 antigas como no backup); por fim, apagar o registro da migration. O rollback
  é testado no `test:banco`.

### Unidades de segurança

```ts
supabase.rpc('security_units_in_view', { min_lng, min_lat, max_lng, max_lat, max_units: 400 })
// → [{ id, kind, name, address, neighborhood, postal_code, phone, district_name, lat, lng }]
```

`kind`: `policia_militar`, `policia_civil`, `gcm` ou `bombeiros`. Carga com `npm run data:import-postos -- --gravar`.

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

### Google e Apple
Passo a passo (credenciais no Google Cloud/Apple, provedores no Supabase e app de desenvolvimento no EAS) em
[`LOGIN_SOCIAL.md`](LOGIN_SOCIAL.md). Resumo do que fica no Supabase:
- **Google:** Client IDs = ID do cliente Web (+ Android e iOS, separados por vírgula); Client Secret = segredo do cliente
  Web; *Skip nonce check* ligado se usar iOS.
- **Apple:** Client IDs = `com.flu3000.grad` (login nativo não precisa da chave secreta).

### Antes de lançar
Ativar CAPTCHA (Cloudflare Turnstile) em *Authentication → Attack Protection* para o login anônimo.

## Advisors (11/11/2026, depois da Fase 3.7)
- Segurança: só `auth_leaked_password_protection` (WARN), que já existia (vale só para e-mail/senha, que o app não usa).
- Performance: só `unused_index` (INFO) — `districts_subprefecture_id_idx` (já existia) e os índices das tabelas novas,
  ainda sem uso quando o advisor rodou (logo depois da migration).

## Advisors (10/11/2026)
- Segurança: `auth_leaked_password_protection` (WARN) — só vale para login por e-mail/senha, que o app não usa.
- Segurança: nenhum aviso.
- Performance: apenas `unused_index` (INFO) em índices de tabelas ainda vazias — esperado; reavaliar após a importação.
