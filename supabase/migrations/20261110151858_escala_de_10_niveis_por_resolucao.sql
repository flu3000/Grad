-- Escala de perigo passa de 8 para 10 níveis e os cortes passam a ser calculados POR RESOLUÇÃO.
-- Com cortes únicos (da resolução 8), o nível mais alto no hexágono pequeno (res. 9) ia de ~50 a ~1.000 BOs, porque
-- áreas pequenas chegam a densidades que as maiores nunca atingem. Agora cada zoom compara hexágonos do mesmo tamanho.
-- Cortes = percentis 15, 30, 45, 60, 72, 82, 90, 95 e 98 do score dos hexágonos com BO de cada resolução
-- (nível 10 = 2% mais perigosos). Sem ocorrência (ou abaixo do 1º corte) = nível 1. Mesma regra de scripts/src/lib/scoring.ts.

alter table public.hex_cells drop constraint hex_cells_level_check;
alter table public.hex_cells add constraint hex_cells_level_check check (level between 1 and 10);

with cortes as (
  select resolution,
         percentile_cont(array[0.15, 0.30, 0.45, 0.60, 0.72, 0.82, 0.90, 0.95, 0.98]) within group (order by score) as c
  from public.hex_cells
  where (counts->>'total')::int > 0
  group by resolution
)
update public.hex_cells h
set level = case
      when h.score <= 0 then 1
      else 1 + (select count(*) from unnest(cortes.c) as corte where h.score > corte)
    end,
    updated_at = now()
from cortes
where cortes.resolution = h.resolution;
