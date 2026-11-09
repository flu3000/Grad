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
│   ├── mobile/   App React Native + Expo SDK 54 (TypeScript, styled-components, react-native-maps)
│   └── api/      API Node.js + Express 5 + MongoDB/Mongoose (TypeScript), deploy no Railway
├── docs/
│   ├── DIAGNOSTICO.md           Situação atual, bugs e riscos encontrados
│   └── PROMPT_CONTINUIDADE.md   Prompt pronto para retomar o projeto com o Claude Code
├── CLAUDE.md     Instruções que o Claude Code lê automaticamente em toda sessão
└── package.json  Atalhos para rodar os dois apps a partir da raiz
```

Este repositório reúne os antigos `flu3000/Grad` (front) e `flu3000/Grad-back` (back), com o histórico
de commits dos dois preservado.

## Rodando localmente

Pré-requisitos: Node.js 22+, npm, uma instância MongoDB (ex.: MongoDB Atlas) e o app Expo Go
no celular (ou emulador Android/iOS).

```bash
npm run install:all          # instala as dependências dos dois apps
cp apps/api/.env.example apps/api/.env       # preencha MONGO_URI e os segredos JWT
cp apps/mobile/.env.example apps/mobile/.env
npm run api:import-geo       # popula o MongoDB com distritos/subprefeituras de SP (uma vez)
npm run api:dev              # API em http://localhost:3333
npm run mobile:start         # abre o Expo (QR code para o Expo Go)
```

## API — rotas existentes

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | – | Health check |
| POST | `/auth/anonymous` | – | Cria usuário convidado e devolve tokens |
| POST | `/auth/google` | – | Login com `idToken` do Google |
| POST | `/auth/apple` | – | Login com `idToken` da Apple |
| POST | `/auth/refresh` | – | Troca `refreshToken` por novos tokens |
| POST | `/auth/logout` | Bearer | Invalida o refresh token |
| POST | `/auth/link/google` | Bearer | Converte conta anônima em Google |
| POST | `/auth/link/apple` | Bearer | Converte conta anônima em Apple |
| GET | `/neighborhoods/getAll` | – | Polígonos de todos os distritos |
| POST | `/geo/locate` | – | `{lat, lng}` → distrito/subprefeitura |

## Deploy
A API roda no Railway. Depois da unificação, o serviço do Railway deve apontar para este repositório
com **Root Directory = `apps/api`** (build `npm run build`, start `npm start`).

## Licença
MIT — ver [LICENSE](LICENSE).
