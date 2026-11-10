-- Zoom dinâmico: hex_cells guarda as resoluções 7 (afastado), 8 (padrão) e 9 (próximo).
-- As funções passam a receber a resolução desejada. A assinatura muda, então as antigas são removidas.

drop function if exists public.hexagons_in_view(double precision, double precision, double precision, double precision, integer);
drop function if exists public.locate_point(double precision, double precision);

create function public.hexagons_in_view(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  res integer default 8,
  max_cells integer default 5000
)
returns table (h3_index text, level smallint, score double precision, geometry jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select h.h3_index, h.level, h.score, extensions.st_asgeojson(h.geom, 6)::jsonb
  from public.hex_cells h
  where h.resolution = res
    and extensions.st_intersects(
      h.geom,
      extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
  limit least(greatest(coalesce(max_cells, 5000), 0), 20000);
$$;

create function public.locate_point(lat double precision, lng double precision, res integer default 8)
returns table (
  district_id integer,
  district_name text,
  subprefecture_id integer,
  subprefecture_name text,
  h3_index text,
  level smallint,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326) as pt
  )
  select d.id, d.name, s.id, s.name, h.h3_index, h.level, h.score
  from p
  left join lateral (
    select d.id, d.name, d.subprefecture_id
    from public.districts d
    where extensions.st_covers(d.geom, p.pt)
    limit 1
  ) d on true
  left join public.subprefectures s on s.id = d.subprefecture_id
  left join lateral (
    select h.h3_index, h.level, h.score
    from public.hex_cells h
    where h.resolution = res and extensions.st_covers(h.geom, p.pt)
    limit 1
  ) h on true;
$$;

revoke execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer) from public;
revoke execute on function public.locate_point(double precision, double precision, integer) from public;
grant execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated, service_role;
grant execute on function public.locate_point(double precision, double precision, integer) to anon, authenticated, service_role;
