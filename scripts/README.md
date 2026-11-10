# Scripts de dados do Grad

Rodam **no seu computador**, com a chave secreta do Supabase em `scripts/.env` (não versionado).
Por padrão só simulam e mostram um relatório; só gravam no Supabase com `--gravar`.

| Script | O que faz |
|---|---|
| `importGeo.ts` | Subprefeituras e distritos da GeoSampa (EPSG:31983 → WGS84) → `subprefectures` e `districts` |
| `importPostos.ts` | Unidades de segurança da GeoSampa (`data/geosampa/seguranca/`) → `security_units`; `--baixar` atualiza os arquivos pelo WFS |
| `importCrimes.ts` | Planilha da SSP-SP → hexágonos H3 (resoluções 7, 8 e 9) com nota e nível → `hex_cells` |

## Passo a passo

```bash
git pull
```

```bash
npm --prefix scripts ci
```

```bash
cp scripts/.env.example scripts/.env
```

Preencha `SUPABASE_SECRET_KEY` em `scripts/.env` (painel → Project Settings → API Keys → *Secret keys*).
Coloque a planilha em `data/SSP-SP/` ou passe `--arquivo=`.

```bash
npm run data:import-geo -- --gravar
```

```bash
npm run data:import-crimes
```

Esse segundo comando **não grava**: lê todas as abas da planilha (ex.: `JAN_A_JUN_2025` e `JUL_A_DEZ_2025`) e gera
`scripts/out/relatorio_crimes_2025.json` com linhas por aba e por mês (avisa se um mês aparece em mais de uma aba,
o que indicaria BOs duplicados), linhas descartadas, contagem por categoria, os 50 textos de RUBRICA/NATUREZA que caíram em "outros",
os cortes de nível e quantos hexágonos ficam em cada nível. Revise (ou mande o relatório para o Claude
revisar) e ajuste `src/config/crimeWeights.ts` se algum crime grave estiver caindo em "outros". Depois:

```bash
npm run data:import-crimes -- --gravar
```

Opções: `--arquivo=caminho.xlsx`, `--periodo=2025` (só conta ocorrências desse ano; `--todas-as-datas` desliga o filtro). Para ver a pilha de um erro: `DEBUG=1`.

## Como a nota é calculada

1. Descarta linhas com lat/lng ausente ou 0 (localização sigilosa), pontos fora dos 96 distritos e duplicados
   (mesmo `NUM_BO` + `ANO_BO` + delegacia com a mesma categoria conta uma vez, mesmo em abas diferentes).
2. Classifica cada BO pela primeira regra de `src/config/crimeWeights.ts` que casar com `RUBRICA | NATUREZA_APURADA`.
3. Soma os pesos por hexágono H3 nas resoluções 7, 8 e 9 e divide pela área do hexágono → **score = peso/km²**.
4. **Nível 1..5:** hexágono sem ocorrência = 1; os demais pelos quintis do score na resolução 8, calculados só com
   os BOs que têm coordenada (os distribuídos somam na nota, mas não deslocam os cortes). Os mesmos cortes
   (em peso/km²) valem para 7 e 9, para a cor de um lugar não mudar quando o zoom troca de resolução.
5. **Estupro sem coordenada** (a SSP não publica a localização de crimes sexuais): se o BO é da capital, em espaço de
   circulação (via pública, terminal, comércio, lazer… — residência, escola, saúde e templo não contam) e o BAIRRO casa com o nome de um distrito
   (com abreviações como "Vl." → "Vila"), o peso 9 é dividido igualmente entre os hexágonos do distrito.
   Não vai para o centroide, para não criar uma mancha falsa num único hexágono. Lista em `DISTRIBUIR_SEM_LOCALIZACAO`.
6. A grade cobre todo o município (inclusive hexágonos sem BO), para o mapa não ter buracos.

Hexágonos na borda do município cobrem área de fora (sem BOs contados), então tendem a ter nota menor.

### Por que não normalizar por população no mapa
Taxa por habitante mede o risco de quem **mora** no lugar, mas o mapa responde "é perigoso **estar** aqui?".
Regiões como Sé, República e Paulista têm poucos moradores e muita gente circulando: a taxa por habitante
explodiria; parques e áreas industriais têm população perto de zero (divisão por zero). Além disso, a
população por hexágono exigiria a grade estatística do IBGE (Censo 2022). Por isso a cor usa peso/km²
com quintis; a taxa por 100 mil habitantes pode entrar depois como informação extra **por distrito**.
