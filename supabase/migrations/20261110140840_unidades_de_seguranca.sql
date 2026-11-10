-- Unidades de segurança pública de São Paulo (GeoSampa): Polícia Militar, Polícia Civil, Guarda Civil Metropolitana e
-- Corpo de Bombeiros. Leitura pública, escrita só pelos scripts/MCP com a chave secreta.

create table public.security_units (
  id integer primary key,                -- cd_identificador da GeoSampa
  kind text not null check (kind in ('policia_militar', 'policia_civil', 'gcm', 'bombeiros')),
  name text not null,
  address text,
  neighborhood text,
  postal_code text,
  phone text,
  district_id integer references public.districts (id),
  source text not null default 'geosampa',
  geom extensions.geometry(Point, 4326) not null
);

create index security_units_geom_idx on public.security_units using gist (geom);
create index security_units_district_id_idx on public.security_units (district_id);

alter table public.security_units enable row level security;
create policy "Leitura pública" on public.security_units for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, references, trigger on public.security_units from anon, authenticated;

-- Unidades no retângulo visível do mapa, com o nome do distrito.
create function public.security_units_in_view(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_units integer default 400
)
returns table (
  id integer,
  kind text,
  name text,
  address text,
  neighborhood text,
  postal_code text,
  phone text,
  district_name text,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id, u.kind, u.name, u.address, u.neighborhood, u.postal_code, u.phone, d.name,
         extensions.st_y(u.geom), extensions.st_x(u.geom)
  from public.security_units u
  left join public.districts d on d.id = u.district_id
  where u.geom operator(extensions.&&) extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  limit least(greatest(coalesce(max_units, 400), 0), 1000);
$$;

revoke execute on function public.security_units_in_view(double precision, double precision, double precision, double precision, integer) from public;
grant execute on function public.security_units_in_view(double precision, double precision, double precision, double precision, integer) to anon, authenticated, service_role;
