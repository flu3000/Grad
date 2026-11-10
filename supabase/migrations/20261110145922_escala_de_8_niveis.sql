-- Escala de perigo passa de 5 para 8 níveis, com faixas mais estreitas no topo (o antigo nível 5 juntava de ~900 a
-- ~10.000 de peso/km²). Cortes = percentis 15, 30, 45, 60, 75, 87 e 95 do score dos hexágonos da resolução 8 que têm
-- BOs com localização; os mesmos cortes valem para as resoluções 7 e 9 (a cor de um lugar não muda com o zoom).
-- Hexágono sem ocorrência (ou abaixo do 1º corte) = nível 1. Mesma regra de scripts/src/lib/scoring.ts.

alter table public.hex_cells drop constraint hex_cells_level_check;
alter table public.hex_cells add constraint hex_cells_level_check check (level between 1 and 8);

with cortes as (
  select percentile_cont(array[0.15, 0.30, 0.45, 0.60, 0.75, 0.87, 0.95]) within group (order by score) as c
  from public.hex_cells
  where resolution = 8 and (counts->>'total')::int > 0
)
update public.hex_cells h
set level = case
      when h.score <= 0 then 1
      else 1 + (select count(*) from unnest(cortes.c) as corte where h.score > corte)
    end,
    updated_at = now()
from cortes;
