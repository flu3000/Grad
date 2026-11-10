-- Esquema inicial do Grad: PostGIS, subprefeituras, distritos e hexágonos H3 com nota de perigo.
-- Geometrias sempre em WGS84 (SRID 4326). Os dados são carregados pelos scripts locais com a chave secreta
-- (que ignora RLS); o app só lê.

create extension if not exists postgis with schema extensions;

-- Subprefeituras de São Paulo (GeoSampa). id = cd_identificador_subprefeitura.
create table public.subprefectures (
  id integer primary key,
  code text not null,
  name text not null,
  acronym text,
  area_km2 numeric,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

-- Distritos municipais de São Paulo (GeoSampa). id = cd_identificador_distrito.
create table public.districts (
  id integer primary key,
  code text not null,
  name text not null,
  acronym text,
  subprefecture_id integer not null references public.subprefectures (id),
  area_km2 numeric,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

-- Hexágonos H3 (calculados no script com h3-js) com a nota agregada dos BOs.
create table public.hex_cells (
  h3_index text primary key,
  resolution smallint not null check (resolution between 0 and 15),
  geom extensions.geometry(Polygon, 4326) not null,
  score double precision not null default 0 check (score >= 0),
  level smallint not null check (level between 1 and 5),
  counts jsonb not null default '{}'::jsonb,
  period text not null,
  updated_at timestamptz not null default now()
);

create index subprefectures_geom_idx on public.subprefectures using gist (geom);
create index districts_geom_idx on public.districts using gist (geom);
create index districts_subprefecture_id_idx on public.districts (subprefecture_id);
create index hex_cells_geom_idx on public.hex_cells using gist (geom);

-- RLS: leitura pública, nenhuma escrita pelo cliente (sem policies de insert/update/delete).
alter table public.subprefectures enable row level security;
alter table public.districts enable row level security;
alter table public.hex_cells enable row level security;

create policy "Leitura pública" on public.subprefectures for select to anon, authenticated using (true);
create policy "Leitura pública" on public.districts for select to anon, authenticated using (true);
create policy "Leitura pública" on public.hex_cells for select to anon, authenticated using (true);

-- Defesa em profundidade: mesmo sem policy, tira os privilégios de escrita dos papéis do cliente.
revoke insert, update, delete, truncate, references, trigger on public.subprefectures, public.districts, public.hex_cells
  from anon, authenticated;
