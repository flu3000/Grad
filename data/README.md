# Dados

Fontes brutas usadas pelos scripts de `scripts/` para alimentar o Supabase.

| Pasta | Conteúdo | No Git? |
|---|---|---|
| `geosampa/` | Distritos (96) e subprefeituras (32) de São Paulo, em **EPSG:31983 (SIRGAS 2000 / UTM 23S)**. Convertidos para WGS84 por `scripts/importGeo.ts`. | Sim |
| `geosampa/seguranca/` | Unidades de segurança pública (GeoSampa, EPSG:31983): Polícia Militar (159), Polícia Civil (93), GCM (48) e Bombeiros (40), com nome, endereço, bairro e CEP. **Sem telefone** e sem Delegacias da Mulher. Atualizar com `npm run data:import-postos -- --baixar`. | Sim |
| `rio/` | Bairros (166) e regiões administrativas (33) do Rio de Janeiro, já em WGS84. **Ainda não usados.** | Sim |
| `SSP-SP/` | Planilhas anuais de BOs da SSP-SP (`SPDadosCriminais_AAAA.xlsx`, 130–210 MB cada). Lidas por `npm run data:limpar`. | **Não** |
| `SSP-SP/limpo/` | Partes limpas (`<ano>/<arquivo>__<aba>__parte_0001.csv.gz`, 100 mil linhas) + `manifesto.json`. Geradas pela limpeza; têm endereços. | **Não** |
| `SSP-SP/_antigo/` | Arquivos substituídos (ex.: a planilha reduzida de 2025 no formato antigo). O pipeline ignora pastas que começam com `_`. | **Não** |
| `cnefe/` | (Etapa 2) CNEFE 2022 do IBGE para geocodificação local. | **Não** |

## GeoSampa

No arquivo `distritos.geojson`, o campo `cd_identificador_subprefeitura` guarda o **código** da subprefeitura
(`cd_subprefeitura` em `subprefeituras.geojson`, ex.: 9 = "09" = Sé), e não o `cd_identificador_subprefeitura` dela.
O distrito Lajeado e a subprefeitura Guaianases vêm com uma autointerseção; o banco corrige com `st_makevalid`.

## Planilhas SSP-SP (fora do Git)

Coloque os arquivos em `data/SSP-SP/`, soltos com o ano no nome (`SPDadosCriminais_2024.xlsx`) ou em pastas por ano
(`data/SSP-SP/2025/...`); a pasta do ano tem prioridade. Elas são ignoradas pelo Git e **nunca são alteradas**: a
limpeza grava o resultado em `data/SSP-SP/limpo/`.

Arquivos em uso (formato novo, os 4 anos iguais): 2023, 2024, 2025 e 2026 (registros até 30/09/2026).

### Estrutura (formato novo)
- **3 abas**: legenda (`CAMPOS_DA_TABELA_SPDADOS`) + BOs de **JAN–JUN** + BOs de **JUL–DEZ**, divididos pela **data de
  registro**. A **posição da legenda muda** (1ª aba em 2023, última em 2024, 2025 e 2026) e os nomes das abas variam: o
  pipeline acha as abas pelo cabeçalho. Cabeçalho na linha 1.
- **A legenda só descreve os campos** (não traz os limites dos períodos nem valores possíveis). Resumo:
  `NUM_BO`/`ANO_BO` (número e ano do BO), `DATA_REGISTRO`, `DATA_OCORRENCIA_BO`, `HORA_OCORRENCIA_BO`,
  `DESC_PERIODO` (período da ocorrência), `DESCR_TIPOLOCAL`/`DESCR_SUBTIPOLOCAL` (tipo de local), `BAIRRO`,
  `LOGRADOURO`, `NUMERO_LOGRADOURO`, `LATITUDE`/`LONGITUDE`, `..._CIRCUNSCRICAO` (delegacia/município do local do fato),
  `RUBRICA` (natureza jurídica), `DESCR_CONDUTA`, `NATUREZA_APURADA` (classificação validada pela SPDados),
  `MES_ESTATISTICA`/`ANO_ESTATISTICA` (mês em que o BO entra na estatística oficial = mês do registro em 99,4%),
  `CMD`/`BTL`/`CIA` (área da PM) e `COD IBGE` (município).
- **Nomes mudam entre anos** (mapa em `scripts/src/lib/colunas.ts`): `COD IBGE` (2026) × `CD_IBGE` (2023–2025);
  `..._CIRCUNCRIÇÃO` (com erro de grafia, 2023–2025); 2023 e 2024 não têm `DESCR_TIPOLOCAL` (só o subtipo).
- **Valores**: datas e horas vêm como serial do Excel e fração do dia; `"NULL"` = vazio; coordenada `0` com logradouro
  "VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS" = **sigilo** (100% dos estupros, boa parte das lesões); coordenada `0`
  com endereço real **não** é sigilo; `NUMERO_LOGRADOURO = 0` = sem número; `BAIRRO` com grafias variadas.
- **Hora**: a SSP preenche a hora **ou** o `DESC_PERIODO` (quase nunca os dois). Limites confirmados em 2026 (24,5 mil BOs
  com os dois, 0 conflitos): madrugada 0–5h, manhã 6–11h, tarde 12–17h, noite 18–23h. Cerca de 66% dos BOs têm hora
  exata, 33% só o período, 1% nenhum. Não há pico artificial em 00:00 (vale como hora real); os minutos :00 e :30 são
  arredondamento da vítima.
- **Município**: `COD IBGE = 3550308` é a capital. A limpeza mantém o BO com esse código **ou** com o ponto dentro dos 96
  distritos (cerca de 400 BOs por ano divergem em cada sentido).
- **Registro tardio**: cerca de 1,5% dos BOs de um ano estão no arquivo do ano seguinte (o ano do crime vem da data da
  ocorrência). 91% dos BOs são registrados no mês do fato e 98% até o mês seguinte.
- **2025**: o primeiro arquivo (reduzido, formato antigo, sem `NUM_BO` nem `COD IBGE`) foi trocado pelo completo
  em 10/11/2026 e está em `_antigo/2025/`. Os dois batem em linhas, meses e categorias; o novo tem o sigilo aplicado a
  mais 4.864 BOs (principalmente furto e furto de veículo), que tinham coordenada no antigo.

Detalhes do processamento em [`scripts/README.md`](../scripts/README.md).
