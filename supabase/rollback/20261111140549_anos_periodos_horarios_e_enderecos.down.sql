-- ROLLBACK da migration anos_periodos_horarios_e_enderecos. NÃO é uma migration: só aplicar com o pedido do dono.
--
-- Ordem para voltar atrás:
--   1. npm run data:restaurar-backup -- --gravar   (devolve level/score/counts/period de hex_cells ao backup;
--      funciona antes ou depois deste arquivo, porque só mexe nessas colunas)
--   2. este arquivo (remove tabelas, coluna e funções novas e recria as 3 funções antigas exatamente como no backup
--      scripts/out/backup/funcoes_2026-11-11.sql)
--   3. apagar o registro da migration (último comando, comentado) e tirar o arquivo de supabase/migrations
--
-- Os dados das tabelas novas se perdem (podem ser regravados com npm run data:gravar).

begin;

drop function if exists public.address_report(double precision, double precision, integer, integer);
drop function if exists public.set_hex_cell_areas(jsonb);
drop function if exists public.mirror_year_to_hex_cells(smallint);
drop function if exists public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer, integer, boolean, boolean);
drop function if exists public.locate_point(double precision, double precision, integer, integer);

drop table if exists public.event_venues;
drop table if exists public.hex_stats;
drop table if exists public.level_breaks;
drop table if exists public.datasets;

alter table public.hex_cells drop column if exists area_km2;

-- funções antigas, como no backup (pg_get_functiondef)
CREATE OR REPLACE FUNCTION public.hexagons_in_view(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision, res integer DEFAULT 8, max_cells integer DEFAULT 5000)
 RETURNS TABLE(h3_index text, level smallint, score double precision, geometry jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select h.h3_index, h.level, h.score, extensions.st_asgeojson(h.geom, 6)::jsonb
  from public.hex_cells h
  where h.resolution = res
    and extensions.st_intersects(
      h.geom,
      extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
  limit least(greatest(coalesce(max_cells, 5000), 0), 20000);
$function$;

CREATE OR REPLACE FUNCTION public.locate_point(lat double precision, lng double precision, res integer DEFAULT 8)
 RETURNS TABLE(district_id integer, district_name text, subprefecture_id integer, subprefecture_name text, h3_index text, level smallint, score double precision, counts jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

-- security_units_in_view não muda na migration; recriada igual por garantia
CREATE OR REPLACE FUNCTION public.security_units_in_view(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision, max_units integer DEFAULT 400)
 RETURNS TABLE(id integer, kind text, name text, address text, neighborhood text, postal_code text, phone text, district_name text, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select u.id, u.kind, u.name, u.address, u.neighborhood, u.postal_code, u.phone, d.name,
         extensions.st_y(u.geom), extensions.st_x(u.geom)
  from public.security_units u
  left join public.districts d on d.id = u.district_id
  where u.geom operator(extensions.&&) extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  limit least(greatest(coalesce(max_units, 400), 0), 1000);
$function$;

revoke execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer) from public;
revoke execute on function public.locate_point(double precision, double precision, integer) from public;
revoke execute on function public.security_units_in_view(double precision, double precision, double precision, double precision, integer) from public;
grant execute on function public.hexagons_in_view(double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated, service_role;
grant execute on function public.locate_point(double precision, double precision, integer) to anon, authenticated, service_role;
grant execute on function public.security_units_in_view(double precision, double precision, double precision, double precision, integer) to anon, authenticated, service_role;

-- políticas RLS das tabelas antigas não mudam na migration (as das tabelas novas somem com elas)

commit;

-- delete from supabase_migrations.schema_migrations where version = '20261111140549';
