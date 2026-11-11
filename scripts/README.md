# Scripts de dados do Grad

Rodam **no seu computador**. Os que leem ou gravam no Supabase usam a chave secreta em `scripts/.env` (não
versionado; modelo em `.env.example`). **Endereços de BOs nunca saem do computador**: a geocodificação é só com o
CNEFE local, e no banco ficam só dados agregados por hexágono. Tudo que grava no Supabase **simula por padrão** e
só grava com `-- --gravar`.

## Pipeline dos BOs (Fase 3.7)

```
limpar → indice-cnefe → geocodificar → processar → consolidar → verificar → backup → gravar → conferir-banco / conferir-publico
```

| Comando (`npm run …`) | O que faz | Saída |
|---|---|---|
| `data:limpar` | Estágio A: planilhas da SSP-SP (`data/SSP-SP/`) → partes limpas de 100 mil linhas; pula o que já foi extraído | `data/SSP-SP/limpo/` |
| `data:indice-cnefe` | Índice de endereços do CNEFE 2022 (IBGE) de São Paulo | `data/cnefe/indice.json.gz` |
| `data:geocodificar` | Geocodifica pelo CNEFE os BOs sem coordenada ou com ponto suspeito, calibra contra os pontos confiáveis da SSP | `scripts/out/cache/`, `out/geocodificacao/`, `out/verificacao_coordenadas.*` |
| `data:processar` | Estágio B: partes em paralelo → parciais (cache pelo hash das regras) | `scripts/out/cache/parciais/<hash>/` |
| `data:consolidar` | Estágio C: soma, cobertura, anualização, escala fixa, níveis, locais de evento e invariantes | `scripts/out/consolidado/final/` |
| `data:verificar` | Invariantes (75 checagens), números oficiais da SSP, comparação com o banco, amostras e mapa antes × depois, volume | `scripts/out/verificacao.md`, `verificacao_amostras.csv`, `verificacao_mapa.html` |
| `data:backup` | Só lê: copia `hex_cells` (sem a geometria) antes de gravar | `scripts/out/backup/hex_cells_<data>.json.gz` |
| `data:gravar` | Simula (e lê o banco); com `-- --gravar` faz upsert de `datasets`, `level_breaks`, `hex_stats`, `event_venues`, `hex_cells.area_km2` e espelha o ano padrão em `hex_cells`. **Nunca apaga.** Exige um `data:verificar` sem falhas posterior à consolidação | Supabase |
| `data:conferir-banco` | Só lê: banco × saída local (contagens por ano e resolução, 20 hexágonos sorteados, funções, `address_report` em 6 lugares, tempos) | terminal |
| `data:conferir-publico` | Só lê, com a chave **publicável** do app: formato das funções que o app usa e escrita negada (`42501`) | terminal |
| `data:restaurar-backup` | Simula; com `-- --gravar` devolve `level/score/counts/period` de `hex_cells` ao backup (parte do rollback) | Supabase |

Auxiliares: `data:diagnostico` (estrutura das planilhas), `data:comparar-banco` (2025 local × banco, passo a passo),
`data:comparar-geocodificacao` (efeito da geocodificação contra a linha de base da Etapa 1).
`data:import-crimes` roda limpar → processar → consolidar de uma vez e **não grava** (a gravação é o `data:gravar`).

Opções comuns: `--workers=N` (limpar, processar, consolidar, verificar; use `--workers=4` para não faltar memória e
não rode duas tarefas pesadas ao mesmo tempo), `--forcar` (limpar), `--partes=12-20` (processar). Para a pilha de um
erro: `DEBUG=1`.

Outros scripts: `data:import-geo` (subprefeituras e distritos da GeoSampa, EPSG:31983 → WGS84) e `data:import-postos`
(unidades de segurança; `--baixar` atualiza os arquivos pelo WFS).

### Testes

- `npm test` — testes do pipeline (limpeza, agregação, geocodificador, locais de evento).
- `npm run test:banco` — aplica **todas** as migrations num Postgres local (PGlite + PostGIS, em WebAssembly) com dados
  sintéticos e confere as funções, as permissões (`permission denied` para `anon`/`authenticated`) e o rollback. Não
  precisa da planilha nem do Supabase (serve para CI).

## Regras do processamento

1. **Linhas:** BO da capital (`COD IBGE = 3550308` ou ponto nos 96 distritos), ano pela data da ocorrência
   (2023–2026). Um BO conta **uma vez, na categoria mais grave** (`NUM_BO` + `ANO_BO` + delegacia). Tema 506 do STF
   (porte de maconha para uso) conta como não criminal.
2. **Categoria e peso:** primeira regra de `src/config/crimeWeights.ts` que casar com `RUBRICA | NATUREZA_APURADA`.
   Pesos: latrocínio e homicídio 10; estupro e extorsão mediante sequestro 9; lesão seguida de morte 8; roubo de
   veículo e de carga 6; roubo 4; lesão dolosa e porte de arma 3; furto de veículo e tráfico 2; furto 1; outros 0,5;
   culposo e não criminal 0.
3. **Coordenada:**
   - o ponto da SSP vale, salvo **ponto padrão** (`src/config/pontosPadrao.ts`: coordenadas que a SSP usa quando não
     sabe o local, como Perus e Liberdade) ou ponto suspeito (poucas casas decimais);
   - sem ponto, com ponto padrão ou suspeito: geocodifica pelo endereço (próxima seção). Sigilo e crimes sexuais
     **nunca** são geocodificados;
   - estupro sem coordenada em local de circulação, com BAIRRO = distrito: peso dividido entre os hexágonos do
     distrito (`DISTRIBUIR_SEM_LOCALIZACAO`).
4. **Score = peso/km²** por hexágono H3 (resoluções 7, 8 e 9). A grade cobre o município inteiro (sem buracos).
5. **Escala fixa, 10 níveis:** cortes = percentis 15/30/45/60/72/82/90/95/98 dos hexágonos com BO de **2023, 2024 e
   2025 juntos**, separados por resolução; os mesmos cortes valem para todos os anos, períodos e horas (dá para
   comparar anos). Sem BO = nível 1.
6. **Períodos e horas:** madrugada 0–5h, manhã 6–11h, tarde 12–17h, noite 18–23h. Densidade do período = peso × 24/6
   × fator de período ÷ área; da hora = janela de 3 h centrada × 24/3 × fator de hora ÷ área. Os fatores da cidade
   (peso total ÷ peso com período/hora, ~1,005 e ~1,25) compensam os BOs sem horário.
7. **Ano parcial (2026):** só meses completos (95% da curva de atraso de registro); nota anualizada pela
   **sazonalidade** dos anos completos (meses 1–8 = 66,96% do ano → fator 1,4934).

### Geocodificação pelo CNEFE (níveis aprovados)

O geocodificador (`src/lib/geocodificador.ts`) normaliza o endereço e tenta, em ordem:

| Nível | Regra | Aceito quando o distrito vem de |
|---|---|---|
| `conhecido` | Lista curada `src/config/enderecosConhecidos.ts` (terminais, estações, estádios, Autódromo, Anhembi…); coordenada = mediana dos pontos confiáveis da SSP no mesmo endereço | qualquer origem |
| `exato` | Mesmo logradouro e número no CNEFE | ponto da SSP, BAIRRO ou localidade |
| `interpolado` | Entre os dois números vizinhos (até 200 números de distância) | ponto da SSP ou BAIRRO |
| `curto` | Logradouro com menos de 1 km (centro do logradouro) | só BAIRRO = distrito |
| — | Sem distrito nenhum | não geocodifica |

**Trava da interpolação:** só interpola se os dois vizinhos estiverem a **no máximo 400 m** um do outro. Se estiverem
mais longe, **não geocodifica** (nem pelo vizinho mais próximo: nesses casos ~30% dos erros passavam de 1 km). Só
existe um vizinho de um lado: aceita se estiver a até 50 números. Custa ~200 BOs por ano e reduziu os erros acima de
1 km do interpolado de 8,7% para 6,5% (mediana 74 m, p90 697 m na calibração). Número fora da faixa do logradouro
quando há outro logradouro com o mesmo nome na cidade: não usa o `curto`.

### Locais de evento

`src/config/locaisDeEvento.ts`: 11 locais (8 `arena`, 3 `rua`: Paulista, Centro e Barra Funda). **Dia de pico** = dia
com BOs no raio ≥ máx(10, 5 × a mediana diária do local no ano). Um local fica na lista com ≥ 3 dias de pico e ≥ 5%
dos BOs nesses dias (2023–2026). Os BOs continuam no mapa e na nota; o `address_report` só **avisa** quando o raio
encosta no local e, no ano consultado, ≥ 15% dos BOs do local caíram em dias de pico.

### Por que não normalizar por população no mapa
Taxa por habitante mede o risco de quem **mora** no lugar, mas o mapa responde "é perigoso **estar** aqui?".
Regiões como Sé, República e Paulista têm poucos moradores e muita gente circulando: a taxa por habitante
explodiria; parques e áreas industriais têm população perto de zero (divisão por zero). Por isso a cor usa peso/km²
com percentis; a taxa por 100 mil habitantes pode entrar depois como informação extra **por distrito**.
