-- Desempenho das funções depois da gravação (Fase 3.7). Só lê. Rodar no SQL Editor do Supabase (ou pelo MCP).
-- Alvos: address_report < 150 ms; hexagons_in_view com horas < 300 ms (tela inteira de São Paulo em res 9 é o pior caso).

-- 1. hexagons_in_view: app de hoje (sem ano, só o nível) num zoom de bairro em res 9
explain (analyze, buffers, format text)
select * from public.hexagons_in_view(-46.68, -23.58, -46.63, -23.54, 9, 2000);

-- 2. hexagons_in_view com 2026, períodos e horas, na mesma caixa
explain (analyze, buffers, format text)
select * from public.hexagons_in_view(-46.68, -23.58, -46.63, -23.54, 9, 2000, 2026, true, true);

-- 3. hexagons_in_view com horas na cidade inteira em res 8 (pior caso realista)
explain (analyze, buffers, format text)
select * from public.hexagons_in_view(-46.83, -24.01, -46.36, -23.36, 8, 5000, null, true, true);

-- 4. address_report (plpgsql: o explain mostra só o tempo total; rodar 3 vezes e olhar a última)
explain (analyze, format text) select public.address_report(-23.5614, -46.6559, 500);
explain (analyze, format text) select public.address_report(-23.5503, -46.6339, 500);
explain (analyze, format text) select public.address_report(-23.7035, -46.6985, 500, 2026);

-- 5. locate_point
explain (analyze, buffers, format text)
select * from public.locate_point(-23.5614, -46.6559, 8, 2025);

-- 6. tamanhos depois da gravação
select c.relname as tabela,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       pg_size_pretty(pg_relation_size(c.oid)) as dados,
       pg_size_pretty(pg_indexes_size(c.oid)) as indices,
       c.reltuples::bigint as linhas_aprox
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
select pg_size_pretty(pg_database_size(current_database())) as banco;
