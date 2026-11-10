-- locate_point passa a devolver também as contagens do hexágono (total, peso e BOs por categoria),
-- usadas pela aba Área do app. O tipo de retorno muda, então a função é recriada.

drop function if exists public.locate_point(double precision, double precision, integer);

create function public.locate_point(lat double precision, lng double precision, res integer default 8)
returns table (
  district_id integer,
  district_name text,
  subprefecture_id integer,
  subprefecture_name text,
  h3_index text,
  level smallint,
  score double precision,
  counts jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326) as pt
  )
  select d.id, d.name, s.id, s.name, h.h3_index, h.level, h.score, h.counts
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
  ) h on true;
$$;

revoke execute on function public.locate_point(double precision, double precision, integer) from public;
grant execute on function public.locate_point(double precision, double precision, integer) to anon, authenticated, service_role;
