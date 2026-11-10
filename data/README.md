# Dados

Fontes brutas usadas pelos scripts de `scripts/` para alimentar o Supabase.

| Pasta | Conteúdo | No Git? |
|---|---|---|
| `geosampa/` | Distritos (96) e subprefeituras (32) de São Paulo, em **EPSG:31983 (SIRGAS 2000 / UTM 23S)**. Convertidos para WGS84 por `scripts/importGeo.ts`. | Sim |
| `rio/` | Bairros (166) e regiões administrativas (33) do Rio de Janeiro, já em WGS84. **Ainda não usados.** | Sim |
| `SSP-SP/` | Planilha de boletins de ocorrência da SSP-SP 2025 (~100 MB, ~1,16 milhão de linhas). Lida por `scripts/importCrimes.ts`. | **Não** |

## GeoSampa

No arquivo `distritos.geojson`, o campo `cd_identificador_subprefeitura` guarda o **código** da subprefeitura
(`cd_subprefeitura` em `subprefeituras.geojson`, ex.: 9 = "09" = Sé), e não o `cd_identificador_subprefeitura` dela.
O distrito Lajeado e a subprefeitura Guaianases vêm com uma autointerseção; o banco corrige com `st_makevalid`.

## Planilha SSP-SP (fora do Git)

Coloque o arquivo `.xlsx` em `data/SSP-SP/` (o script usa o primeiro `.xlsx` da pasta) ou passe `--arquivo=`.
Ele é ignorado pelo Git e foi removido do histórico ao unificar os repositórios (continua no antigo `flu3000/Grad-back`).

Estrutura observada no arquivo de 2025:
- 3 abas: a 1ª sem dados; a 2ª e a 3ª com os registros do 1º e do 2º semestre (divididas pela **data de registro**;
  trazem também crimes antigos registrados em 2025, que o script descarta por padrão).
- Colunas: `NOME_MUNICIPIO, DATA_REGISTRO, DATA_OCORRENCIA_BO, HORA_OCORRENCIA_BO, DESC_PERIODO, DESCR_TIPOLOCAL,
  BAIRRO, LOGRADOURO, NUMERO_LOGRADOURO, ENDERECO_COMPLETO, LATITUDE, LONGITUDE, PRECISAO,
  NOME_MUNICIPIO_CIRCUNSCRICAO, RUBRICA, NATUREZA_APURADA`. Não há número do BO.
- Cobre o estado inteiro; `LATITUDE`/`LONGITUDE` = 0 ou vazio indica localização sigilosa (ex.: crimes sexuais).

Detalhes do processamento em [`scripts/README.md`](../scripts/README.md).
