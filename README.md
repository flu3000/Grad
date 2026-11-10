# Grad

Mapa interativo de segurança de São Paulo que mostra o quão perigosa é cada região,
com base nos boletins de ocorrência (BOs) públicos da SSP-SP.

## Como funciona (visão do produto)
- **Dados:** base de BOs registrados em São Paulo (SSP-SP, 2025).
- **Escala de gravidade:** cada tipo de crime recebe um peso (um roubo pesa mais que uma infração leve).
- **Grade hexagonal:** a cidade é dividida em hexágonos; cada um recebe uma nota de perigo
  pela densidade ponderada de crimes dentro dele.
- **Visualização:** hexágonos vão do neutro ao vermelho conforme a nota sobe.

## Estrutura do repositório (monorepo)

```
Grad/
├── apps/
│   └── mobile/   App React Native + Expo SDK 58 (TypeScript, styled-components, react-native-maps)
├── supabase/     Configuração do CLI e migrations SQL (esquema, RLS, funções do mapa)
├── scripts/      Importação local de distritos e BOs para o Supabase (ver scripts/README.md)
├── data/         GeoJSON da GeoSampa (e do Rio, ainda sem uso); planilha da SSP-SP fica fora do Git
├── docs/
│   ├── DIAGNOSTICO.md           Situação atual, bugs e riscos encontrados
│   ├── DECISAO_BACKEND.md       Por que o backend é o Supabase
│   ├── SUPABASE.md              Projeto, esquema, funções e configuração de Auth
│   └── PROMPT_CONTINUIDADE.md   Prompt pronto para retomar o projeto com o Claude Code
├── CLAUDE.md     Instruções que o Claude Code lê automaticamente em toda sessão
└── package.json  Atalhos para rodar o app e os scripts a partir da raiz
```

Este repositório reúne os antigos `flu3000/Grad` (front) e `flu3000/Grad-back` (back), com o histórico
de commits dos dois preservado. A API Express + MongoDB do antigo back foi removida na Fase 2.3; continua
disponível no histórico do Git.

## Backend
**Supabase** (Postgres + PostGIS + Supabase Auth, região São Paulo), sem servidor próprio: o app lê o mapa por
funções SQL (`supabase.rpc`) e as tabelas só aceitam escrita dos scripts locais com a chave secreta.
Detalhes em [docs/SUPABASE.md](docs/SUPABASE.md) e a justificativa em [docs/DECISAO_BACKEND.md](docs/DECISAO_BACKEND.md).

## Rodando localmente

Pré-requisitos: Node.js 22.9+, npm e o app Expo Go no celular (ou emulador Android/iOS).

```bash
npm run install:all          # instala as dependências do app e dos scripts
cp apps/mobile/.env.example apps/mobile/.env   # preencha a chave publicável do Supabase
npm run mobile:go            # abre no Expo Go (QR code)
npm run mobile:start         # abre no app de desenvolvimento do Grad (ver docs/LOGIN_SOCIAL.md)
npm run typecheck            # checagem de tipos do app e dos scripts
```

### Atualizar os dados do mapa (raramente)
Com `scripts/.env` preenchido (ver `scripts/.env.example`) e a planilha em `data/SSP-SP/`:

```bash
npm run data:import-geo        # simula; acrescente -- --gravar para gravar no Supabase
npm run data:import-crimes     # gera o relatório; acrescente -- --gravar para gravar
npm run data:import-postos     # polícia, GCM e bombeiros da GeoSampa; -- --gravar para gravar
```

Passo a passo e critérios do cálculo da nota em [scripts/README.md](scripts/README.md).

## Licença
MIT — ver [LICENSE](LICENSE).
