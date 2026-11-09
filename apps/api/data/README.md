# Dados

| Pasta | Conteúdo | No Git? |
|---|---|---|
| `geosampa/` | Distritos (96) e subprefeituras (32) de SP, em **EPSG:31983 (SIRGAS 2000 / UTM 23S)**. `grad.neighborhoods.geojson` é um export do MongoDB já convertido para WGS84. | Sim |
| `rio/` | Bairros (166) e regiões administrativas (33) do Rio, já em WGS84. Ainda **não** são importados. | Sim |
| `SSP-SP/` | Planilha de boletins de ocorrência da SSP-SP 2025 (~100 MB, ~1,16 milhão de linhas). | **Não** |

## Planilha SSP-SP (fora do Git)

O arquivo `SPDadosCriminais_2025_Reduzida.xlsx` tem ~100 MB e foi removido do histórico
ao unificar os repositórios (ele continua no repositório antigo `flu3000/Grad-back`).
Coloque-o manualmente em `apps/api/data/SSP-SP/`. Ele é ignorado pelo Git.

Estrutura: abas `JAN_A_JUN_2025` (585.428 linhas) e `JUL_A_DEZ_2025` (575.706 linhas), com as colunas
`NOME_MUNICIPIO, DATA_REGISTRO, DATA_OCORRENCIA_BO, HORA_OCORRENCIA_BO, DESC_PERIODO, DESCR_TIPOLOCAL,
BAIRRO, LOGRADOURO, NUMERO_LOGRADOURO, LATITUDE, LONGITUDE, NOME_MUNICIPIO_CIRCUNSCRICAO, RUBRICA, NATUREZA_APURADA`.

Atenção: vários registros têm `LATITUDE = 0` e `LONGITUDE = 0` (localização sigilosa, ex.: crimes sexuais) —
eles precisam ser descartados ou tratados à parte antes de entrar no mapa.

Sugestão: converter a planilha para CSV/Parquet uma vez e importar só o resultado agregado no MongoDB
(contagem ponderada por hexágono), em vez de ler o .xlsx em produção.
