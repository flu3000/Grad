-- Fase 3.7: vários anos, períodos do dia, horários e relatório por endereço.
--
-- Tabelas novas (leitura pública, escrita só pelo script com a chave secreta):
--   datasets      um ano de dados (cobertura, contagens de linhas, fatores de período/hora e anualização)
--   level_breaks  os 9 cortes da escala de 10 níveis por resolução (fixos: hexágonos de 2023–2025 juntos)
--   hex_stats     nota e contagens de um hexágono num ano, por período (4), hora (24) e mês (12);
--                 só hexágonos com BO: linha ausente = nível 1 (coalesce)
--   event_venues  locais de grandes eventos por ano (BOs no raio, dias de pico)
-- hex_cells ganha area_km2 e continua com level/score/counts do ano padrão (espelho), para o app atual.
--
-- Funções (todas security invoker, search_path vazio, nomes qualificados):
--   hexagons_in_view   + p_year, with_periods, with_hours (padrões mantêm a resposta de hoje + 2 colunas nulas)
--   locate_point       + p_year (mesmas colunas de hoje + year, períodos e horas)
--   address_report     nova: relatório agregado de um raio em volta do endereço
--   security_units_in_view  sem mudança
--   set_hex_cell_areas / mirror_year_to_hex_cells  só service_role (usadas pelo script de gravação)
--
-- Ano padrão (p_year nulo) = o ano completo mais recente de datasets.

-- ------------------------------------------------------------------------------------------------- tabelas

create table public.datasets (
  year smallint primary key check (year between 2000 and 2100),
  first_month smallint not null check (first_month between 1 and 12),
  last_month smallint not null check (last_month between 1 and 12),
  last_complete_month smallint not null check (last_complete_month between 0 and 12),
  months_covered smallint not null check (months_covered between 0 and 12),
  complete boolean not null,
  rows_valid integer not null check (rows_valid >= 0),           -- BOs com ponto (no mapa)
  rows_distributed integer not null default 0,                   -- BOs sensíveis sem ponto, distribuídos pelo distrito
  rows_no_location integer not null check (rows_no_location >= 0),
  rows_geocoded integer not null default 0,                      -- preenchidos pelo endereço (CNEFE)
  rows_swapped integer not null default 0,                       -- ponto da SSP trocado pelo do endereço
  rows_no_hour integer not null default 0,
  period_factor real not null default 1 check (period_factor >= 1),  -- peso total ÷ peso com período (cidade)
  hour_factor real not null default 1 check (hour_factor >= 1),      -- peso total ÷ peso com hora (cidade)
  annual_factor real not null default 1 check (annual_factor >= 1),  -- anualização do ano parcial (sazonal)
  source_files text[] not null default '{}',
  notes text,
  imported_at timestamptz not null default now()
);

create table public.level_breaks (
  resolution smallint primary key check (resolution between 0 and 15),
  breaks real[] not null check (cardinality(breaks) = 9),
  reference text not null,                                        -- ex.: 'hexágonos com BO de 2023–2025'
  updated_at timestamptz not null default now()
);

create table public.hex_stats (
  h3_index text not null references public.hex_cells (h3_index) on delete cascade,
  year smallint not null references public.datasets (year) on delete cascade,
  resolution smallint not null check (resolution between 0 and 15),
  score real not null check (score >= 0),
  level smallint not null check (level between 1 and 10),
  counts jsonb not null default '{}'::jsonb,
  weight_by_period real[] not null check (cardinality(weight_by_period) = 4),
  total_by_period integer[] not null check (cardinality(total_by_period) = 4),
  levels_by_period smallint[] not null check (cardinality(levels_by_period) = 4),
  weight_by_hour real[] not null check (cardinality(weight_by_hour) = 24),
  total_by_hour integer[] not null check (cardinality(total_by_hour) = 24),
  levels_by_hour smallint[] not null check (cardinality(levels_by_hour) = 24),
  weight_by_month real[] not null check (cardinality(weight_by_month) = 12),
  total_by_month integer[] not null check (cardinality(total_by_month) = 12),
  primary key (h3_index, year)
);

create index hex_stats_resolution_year_idx on public.hex_stats (resolution, year);
create index hex_stats_year_idx on public.hex_stats (year);

create table public.event_venues (
  name text not null,
  year smallint not null references public.datasets (year) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null check (radius_m > 0),
  bos integer not null check (bos >= 0),                          -- BOs com ponto no raio, no ano
  median_per_day real not null,
  peak_threshold integer not null,                                -- BOs no dia para ser dia de pico
  peak_days integer not null check (peak_days >= 0),
  pct_in_peak_days real not null check (pct_in_peak_days between 0 and 100),
  top_days jsonb not null default '[]'::jsonb,                    -- [[data, BOs], ...] dos 5 dias com mais BOs
  geom extensions.geometry(Point, 4326) not null,
  primary key (name, year)
);

create index event_venues_geom_idx on public.event_venues using gist (geom);
create index event_venues_year_idx on public.event_venues (year);

alter table public.hex_cells add column area_km2 real check (area_km2 > 0);

-- RLS: leitura pública, nenhuma escrita pelo cliente.
alter table public.datasets enable row level security;
alter table public.level_breaks enable row level security;
alter table public.hex_stats enable row level security;
alter table public.event_venues enable row level security;

create policy "Leitura pública" on public.datasets for select to anon, authenticated using (true);
create policy "Leitura pública" on public.level_breaks for select to anon, authenticated using (true);
create policy "Leitura pública" on public.hex_stats for select to anon, authenticated using (true);
create policy "Leitura pública" on public.event_venues for select to anon, authenticated using (true);

revoke insert, update, delete, truncate, references, trigger
  on public.datasets, public.level_breaks, public.hex_stats, public.event_venues
  from anon, authenticated;

-- ------------------------------------------------------------------------------- hexagons_in_view

drop function if exists public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer);

-- Sem p_year/with_*: mesma resposta de hoje (h3_index, level, score, geometry) + 2 colunas nulas.
-- Sem nenhum ano em datasets (antes da primeira gravação), usa o nível de hex_cells.
create function public.hexagons_in_view(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  res integer default 8,
  max_cells integer default 5000,
  p_year integer default null,
  with_periods boolean default false,
  with_hours boolean default false
)
returns table (
  h3_index text,
  level smallint,
  score double precision,
  geometry jsonb,
  levels_by_period smallint[],
  levels_by_hour smallint[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with y as (
    select coalesce(p_year, (select max(d.year) from public.datasets d where d.complete))::smallint as year
  )
  select h.h3_index,
         case when s.h3_index is not null then s.level when y.year is null then h.level else 1::smallint end,
         case when s.h3_index is not null then s.score::double precision when y.year is null then h.score else 0::double precision end,
         extensions.st_asgeojson(h.geom, 6)::jsonb,
         case when with_periods then coalesce(s.levels_by_period, array[1, 1, 1, 1]::smallint[]) end,
         case when with_hours then coalesce(s.levels_by_hour, array_fill(1::smallint, array[24])) end
  from y
  cross join public.hex_cells h
  left join public.hex_stats s on s.h3_index = h.h3_index and s.year = y.year
  where h.resolution = res
    and extensions.st_intersects(h.geom, extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326))
  limit least(greatest(coalesce(max_cells, 5000), 0), 20000);
$$;

revoke execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer, integer, boolean, boolean) from public;
grant execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer, integer, boolean, boolean) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------------ locate_point

drop function if exists public.locate_point(double precision, double precision, integer);

-- Mesmas 8 colunas de hoje, na mesma ordem, + year, níveis e totais por período e por hora.
create function public.locate_point(
  lat double precision,
  lng double precision,
  res integer default 8,
  p_year integer default null
)
returns table (
  district_id integer,
  district_name text,
  subprefecture_id integer,
  subprefecture_name text,
  h3_index text,
  level smallint,
  score double precision,
  counts jsonb,
  year smallint,
  levels_by_period smallint[],
  total_by_period integer[],
  levels_by_hour smallint[],
  total_by_hour integer[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326) as pt,
           coalesce(p_year, (select max(d.year) from public.datasets d where d.complete))::smallint as year
  )
  select d.id, d.name, s.id, s.name, h.h3_index,
         case when st.h3_index is not null then st.level when p.year is null then h.level when h.h3_index is not null then 1::smallint end,
         case when st.h3_index is not null then st.score::double precision when p.year is null then h.score when h.h3_index is not null then 0::double precision end,
         case when st.h3_index is not null then st.counts when p.year is null then h.counts when h.h3_index is not null then '{"total": 0, "peso": 0}'::jsonb end,
         p.year,
         case when h.h3_index is not null then coalesce(st.levels_by_period, array[1, 1, 1, 1]::smallint[]) end,
         case when h.h3_index is not null then coalesce(st.total_by_period, array[0, 0, 0, 0]) end,
         case when h.h3_index is not null then coalesce(st.levels_by_hour, array_fill(1::smallint, array[24])) end,
         case when h.h3_index is not null then coalesce(st.total_by_hour, array_fill(0, array[24])) end
  from p
  left join lateral (
    select d.id, d.name, d.subprefecture_id
    from public.districts d
    where extensions.st_covers(d.geom, p.pt)
    limit 1
  ) d on true
  left join public.subprefectures s on s.id = d.subprefecture_id
  left join lateral (
    select h.h3_index, h.level, h.score, h.counts
    from public.hex_cells h
    where h.resolution = res and extensions.st_covers(h.geom, p.pt)
    limit 1
  ) h on true
  left join public.hex_stats st on st.h3_index = h.h3_index and st.year = p.year;
$$;

revoke execute on function public.locate_point(double precision, double precision, integer, integer) from public;
grant execute on function public.locate_point(double precision, double precision, integer, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------- address_report

-- Relatório de um endereço: agrega os hexágonos res 9 cujo centro está a até radius_m do ponto e compara com a
-- escala da res 8 (área parecida com a de um círculo de 500 m). Só dados agregados. LGPD: crimes sexuais com
-- menos de 3 registros aparecem como "<3".
create function public.address_report(
  lat double precision,
  lng double precision,
  radius_m integer default 500,
  p_year integer default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_raio integer := least(greatest(coalesce(radius_m, 500), 100), 2000);
  v_pt extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326);
  v_geog extensions.geography;
  v_ano smallint;
  v_ds public.datasets;
  v_cortes real[];
  v_hex text[];
  v_area double precision;
  v_score double precision;
  v_nivel smallint;
  v_total integer;
  v_peso double precision;
  v_sem_periodo integer;
  v_sem_hora integer;
  v_wp double precision[];
  v_tp bigint[];
  v_wh double precision[];
  v_th bigint[];
  v_niveis_h smallint[] := '{}';
  v_out jsonb;
  v_periodos jsonb := '[]';
  v_unidades jsonb;
  v_eventos jsonb;
  v_evolucao jsonb;
  v_mesmo_periodo jsonb;
  v_categorias jsonb;
  v_n8 integer;
  v_abaixo integer;
  v_d double precision;
  j integer;
  k constant text[] := array['madrugada', 'manha', 'tarde', 'noite'];
  sensiveis constant text[] := array['estupro'];
begin
  v_geog := v_pt::extensions.geography;
  v_ano := coalesce(p_year, (select max(d.year) from public.datasets d where d.complete));
  select * into v_ds from public.datasets d where d.year = v_ano;
  if v_ds.year is null then
    return jsonb_build_object('error', 'sem_dados', 'year', v_ano);
  end if;
  select b.breaks into v_cortes from public.level_breaks b where b.resolution = 8;

  -- hexágonos res 9 com o centro no raio (o && usa o índice; a caixa tem folga de 1 hexágono)
  select coalesce(array_agg(h.h3_index), '{}'),
         coalesce(sum(coalesce(h.area_km2, extensions.st_area(h.geom::extensions.geography) / 1e6)), 0)
    into v_hex, v_area
  from public.hex_cells h
  where h.resolution = 9
    and h.geom operator(extensions.&&) extensions.st_expand(
      v_pt, (v_raio + 400) / (111320.0 * cos(radians(lat))), (v_raio + 400) / 110574.0)
    and extensions.st_dwithin(extensions.st_centroid(h.geom)::extensions.geography, v_geog, v_raio);

  -- soma do ano: score ponderado pela área (já inclui a anualização do ano parcial)
  select coalesce(sum(s.score * coalesce(h.area_km2, extensions.st_area(h.geom::extensions.geography) / 1e6)), 0),
         coalesce(sum((s.counts ->> 'total')::integer), 0),
         coalesce(sum((s.counts ->> 'peso')::double precision), 0),
         coalesce(sum((s.counts ->> 'sem_periodo')::integer), 0),
         coalesce(sum((s.counts ->> 'sem_hora')::integer), 0)
    into v_score, v_total, v_peso, v_sem_periodo, v_sem_hora
  from public.hex_stats s
  join public.hex_cells h on h.h3_index = s.h3_index
  where s.h3_index = any (v_hex) and s.year = v_ano;
  v_score := case when v_area > 0 then v_score / v_area else 0 end;
  v_nivel := case when v_score <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where v_score > c) end;

  -- percentil na cidade: % dos hexágonos res 8 (com ou sem BO) com score menor
  select count(*) into v_n8 from public.hex_cells h where h.resolution = 8;
  select count(*) into v_abaixo from public.hex_stats s where s.resolution = 8 and s.year = v_ano and s.score < v_score;
  if v_score > 0 then
    v_abaixo := v_abaixo + v_n8 - (select count(*) from public.hex_stats s where s.resolution = 8 and s.year = v_ano);
  end if;

  -- arrays somados elemento a elemento
  select array_agg(w order by i), array_agg(t order by i) into v_wp, v_tp
  from (
    select g.i, coalesce(sum(s.weight_by_period[g.i]), 0)::double precision w, coalesce(sum(s.total_by_period[g.i]), 0)::bigint t
    from generate_series(1, 4) g(i)
    left join public.hex_stats s on s.h3_index = any (v_hex) and s.year = v_ano
    group by g.i
  ) x;
  select array_agg(w order by i), array_agg(t order by i) into v_wh, v_th
  from (
    select g.i, coalesce(sum(s.weight_by_hour[g.i]), 0)::double precision w, coalesce(sum(s.total_by_hour[g.i]), 0)::bigint t
    from generate_series(1, 24) g(i)
    left join public.hex_stats s on s.h3_index = any (v_hex) and s.year = v_ano
    group by g.i
  ) x;

  -- por categoria (números do jsonb; estupro sem ponto distribuído pelo distrito entra arredondado)
  select coalesce(jsonb_object_agg(cat, case when cat = any (sensiveis) and n > 0 and n < 3 then to_jsonb('<3'::text) else to_jsonb(n) end), '{}')
    into v_categorias
  from (
    select e.key as cat, round(sum(e.value::numeric))::integer as n
    from public.hex_stats s
    cross join lateral (
      select x.key, x.value::text as value from jsonb_each(s.counts) x
      where jsonb_typeof(x.value) = 'number'
        and x.key not in ('total', 'peso', 'sem_periodo', 'sem_hora', 'geocodificado', 'trocado')
      union all
      select y.key, y.value::text from jsonb_each(coalesce(s.counts -> 'distribuido_pelo_distrito', '{}')) y
    ) e
    where s.h3_index = any (v_hex) and s.year = v_ano
    group by e.key
  ) c
  where n > 0;

  -- períodos: total, nível (mesma conta do script: peso × 24/6 × fator de período × anualização ÷ área) e top 3
  for j in 1..4 loop
    v_d := case when v_area > 0 then v_wp[j] * 4 * v_ds.period_factor * v_ds.annual_factor / v_area else 0 end;
    v_periodos := v_periodos || jsonb_build_object(
      'period', k[j],
      'total', v_tp[j],
      'score', round(v_d::numeric, 1),
      'level', case when v_d <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where v_d > c) end,
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('category', cat, 'total', case when cat = any (sensiveis) and n < 3 then to_jsonb('<3'::text) else to_jsonb(n) end) order by n desc, cat)
        from (
          select e.key as cat, sum(e.value::integer)::integer as n
          from public.hex_stats s
          cross join lateral jsonb_each_text(coalesce(s.counts -> 'por_periodo' -> k[j], '{}')) e
          where s.h3_index = any (v_hex) and s.year = v_ano and e.key <> 'nao_criminal'
          group by e.key
          order by n desc, e.key
          limit 3
        ) t), '[]')
    );
  end loop;

  -- horas: janela de 3 h centrada, "equivalente a um dia" (mesma conta do script)
  for j in 0..23 loop
    v_d := case when v_area > 0
      then ((v_wh[((j + 23) % 24) + 1] + v_wh[j + 1] + v_wh[((j + 1) % 24) + 1]) / 3) * 24 * v_ds.hour_factor * v_ds.annual_factor / v_area
      else 0 end;
    v_niveis_h := v_niveis_h || (case when v_d <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where v_d > c) end)::smallint;
  end loop;

  -- evolução: todos os anos; para o ano parcial, os mesmos meses nos outros anos
  select jsonb_agg(jsonb_build_object('year', d.year, 'complete', d.complete, 'months', d.last_complete_month,
                                      'total', coalesce(a.total, 0), 'score', round(coalesce(a.score, 0)::numeric, 1),
                                      'level', case when coalesce(a.score, 0) <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where a.score > c) end)
                   order by d.year)
    into v_evolucao
  from public.datasets d
  left join lateral (
    select sum((s.counts ->> 'total')::integer) as total,
           case when v_area > 0 then sum(s.score * coalesce(h.area_km2, extensions.st_area(h.geom::extensions.geography) / 1e6)) / v_area end as score
    from public.hex_stats s join public.hex_cells h on h.h3_index = s.h3_index
    where s.h3_index = any (v_hex) and s.year = d.year
  ) a on true;

  select jsonb_build_object('months', p.last_complete_month, 'partial_year', p.year,
           'by_year', jsonb_agg(jsonb_build_object('year', d.year, 'total', coalesce(m.total, 0)) order by d.year))
    into v_mesmo_periodo
  from (select * from public.datasets x where not x.complete and x.last_complete_month > 0 order by x.year desc limit 1) p
  cross join public.datasets d
  left join lateral (
    select sum(t.n) as total
    from public.hex_stats s
    cross join lateral unnest(s.total_by_month[1:p.last_complete_month]) t(n)
    where s.h3_index = any (v_hex) and s.year = d.year
  ) m on true
  group by p.last_complete_month, p.year;

  -- unidades de segurança: a mais próxima de cada tipo e quantas a 1 e 2 km
  select jsonb_object_agg(k2.kind, jsonb_build_object(
           'nearest', n.j,
           'within_1km', (select count(*) from public.security_units u where u.kind = k2.kind and extensions.st_dwithin(u.geom::extensions.geography, v_geog, 1000)),
           'within_2km', (select count(*) from public.security_units u where u.kind = k2.kind and extensions.st_dwithin(u.geom::extensions.geography, v_geog, 2000))))
    into v_unidades
  from (select distinct u.kind from public.security_units u) k2
  left join lateral (
    select jsonb_build_object('id', u.id, 'name', u.name, 'address', u.address,
                              'distance_m', round(extensions.st_distance(u.geom::extensions.geography, v_geog)::numeric),
                              'lat', extensions.st_y(u.geom), 'lng', extensions.st_x(u.geom)) as j
    from public.security_units u
    where u.kind = k2.kind
    order by u.geom operator(extensions.<->) v_pt
    limit 1
  ) n on true;

  -- locais de evento cujo raio encosta na área do relatório
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', v.name, 'bos', v.bos, 'peak_days', v.peak_days, 'pct_in_peak_days', v.pct_in_peak_days,
           'distance_m', round(extensions.st_distance(v.geom::extensions.geography, v_geog)::numeric),
           'message', format('%s%% dos registros deste local (%s) aconteceram em %s dias de evento em %s',
                             replace(round(v.pct_in_peak_days::numeric)::text, '.', ','), v.name, v.peak_days, v.year))
           order by v.pct_in_peak_days desc), '[]')
    into v_eventos
  from public.event_venues v
  where v.year = v_ano and v.peak_days > 0
    and extensions.st_dwithin(v.geom::extensions.geography, v_geog, v_raio + v.radius_m);

  select jsonb_build_object(
    'year', v_ano,
    'complete', v_ds.complete,
    'months', v_ds.last_complete_month,
    'radius_m', v_raio,
    'district', (select jsonb_build_object('id', d.id, 'name', d.name) from public.districts d where extensions.st_covers(d.geom, v_pt) limit 1),
    'subprefecture', (select jsonb_build_object('id', s.id, 'name', s.name) from public.districts d join public.subprefectures s on s.id = d.subprefecture_id where extensions.st_covers(d.geom, v_pt) limit 1),
    'hexagons', cardinality(v_hex),
    'area_km2', round(v_area::numeric, 3),
    'total', v_total,
    'score', round(v_score::numeric, 1),
    'level', v_nivel,
    'city_percentile', case when v_n8 > 0 then round(100.0 * v_abaixo / v_n8, 1) end,
    'by_category', v_categorias,
    'by_period', v_periodos,
    'by_hour', to_jsonb(v_th),
    'levels_by_hour', to_jsonb(v_niveis_h),
    'time_precision', jsonb_build_object(
      'exact_hour_pct', case when v_total > 0 then round(100.0 * (v_total - v_sem_hora) / v_total, 1) else 0 end,
      'period_only_pct', case when v_total > 0 then round(100.0 * (v_sem_hora - v_sem_periodo) / v_total, 1) else 0 end,
      'none_pct', case when v_total > 0 then round(100.0 * v_sem_periodo / v_total, 1) else 0 end),
    'day_night', jsonb_build_object(
      'day', jsonb_build_object('total', v_tp[2] + v_tp[3],
        'level', (select case when x <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where x > c) end
                  from (select case when v_area > 0 then (v_wp[2] + v_wp[3]) * 2 * v_ds.period_factor * v_ds.annual_factor / v_area else 0 end as x) z)),
      'night', jsonb_build_object('total', v_tp[1] + v_tp[4],
        'level', (select case when x <= 0 then 1 else 1 + (select count(*) from unnest(v_cortes) c where x > c) end
                  from (select case when v_area > 0 then (v_wp[1] + v_wp[4]) * 2 * v_ds.period_factor * v_ds.annual_factor / v_area else 0 end as x) z))),
    'evolution', coalesce(v_evolucao, '[]'),
    'same_period', v_mesmo_periodo,
    'security_units', coalesce(v_unidades, '{}'),
    'event_venues', v_eventos
  ) into v_out;
  return v_out;
end;
$$;

revoke execute on function public.address_report(double precision, double precision, integer, integer) from public;
grant execute on function public.address_report(double precision, double precision, integer, integer) to anon, authenticated, service_role;

-- --------------------------------------------------------------------- funções do script de gravação

-- Área de cada hexágono (km², calculada no script com o h3-js, a mesma usada no score). p_areas = {h3: km²}.
create function public.set_hex_cell_areas(p_areas jsonb)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with u as (
    update public.hex_cells h
    set area_km2 = (a.value)::real
    from jsonb_each_text(p_areas) a
    where h.h3_index = a.key
    returning 1
  )
  select count(*)::integer from u;
$$;

-- Espelha um ano de hex_stats em hex_cells.level/score/counts/period (o app atual lê hex_cells).
-- Hexágono sem linha no ano = nível 1, score 0. counts sem o detalhe por período (fica só em hex_stats).
create function public.mirror_year_to_hex_cells(p_year smallint)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with u as (
    update public.hex_cells h
    set level = coalesce(s.level, 1),
        score = coalesce(s.score, 0),
        counts = coalesce(s.counts - 'por_periodo', '{"total": 0, "peso": 0}'::jsonb),
        period = p_year::text,
        updated_at = now()
    from public.hex_cells h2
    left join public.hex_stats s on s.h3_index = h2.h3_index and s.year = p_year
    where h.h3_index = h2.h3_index
      and exists (select 1 from public.datasets d where d.year = p_year)
    returning 1
  )
  select count(*)::integer from u;
$$;

revoke execute on function public.set_hex_cell_areas(jsonb) from public, anon, authenticated;
revoke execute on function public.mirror_year_to_hex_cells(smallint) from public, anon, authenticated;
grant execute on function public.set_hex_cell_areas(jsonb) to service_role;
grant execute on function public.mirror_year_to_hex_cells(smallint) to service_role;
