-- Corrige geometrias inválidas na gravação. A GeoSampa traz o distrito Lajeado e a subprefeitura
-- Guaianases com autointerseção em (-46.3866, -23.5216); com o gatilho, uma nova importação já entra válida.

create or replace function public.fix_invalid_geometry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.geom is not null and not extensions.st_isvalid(new.geom) then
    -- make_valid pode devolver uma coleção; fica só com os polígonos, sempre como MultiPolygon.
    new.geom := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(new.geom), 3));
  end if;
  return new;
end;
$$;

revoke execute on function public.fix_invalid_geometry() from public, anon, authenticated;

create trigger subprefectures_fix_geom
  before insert or update of geom on public.subprefectures
  for each row execute function public.fix_invalid_geometry();

create trigger districts_fix_geom
  before insert or update of geom on public.districts
  for each row execute function public.fix_invalid_geometry();

-- Corrige as linhas já importadas (dispara o gatilho).
update public.subprefectures set geom = geom where not extensions.st_isvalid(geom);
update public.districts set geom = geom where not extensions.st_isvalid(geom);
