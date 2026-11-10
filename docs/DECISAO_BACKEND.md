# Decisão de backend — Supabase (10/11/2026)

**Decisão:** sair do Railway + Express + MongoDB e usar **Supabase** (Postgres + PostGIS + Supabase Auth),
sem servidor Express próprio. O app fala direto com o Supabase pelo `@supabase/supabase-js`.

## Por que o Supabase serve bem ao Grad

| Necessidade do Grad | Como o Supabase resolve |
|---|---|
| Login como convidado e upgrade para Google/Apple | Supabase Auth tem **anonymous sign-ins** nativo e conversão com `linkIdentity` (inclusive com ID token nativo de Google/Apple). Substitui todo o `AuthController`, JWT e refresh feitos à mão. |
| Login Google/Apple nativo no celular | `signInWithIdToken` com o token do `@react-native-google-signin/google-signin` e do `expo-apple-authentication`. Há guia oficial para Expo. |
| Consultas geográficas (em qual distrito/hexágono estou, o que está na tela) | **PostGIS** (extensão suportada) com índice GIST; funções SQL expostas por `supabase.rpc(...)`. |
| Dados majoritariamente de leitura (mapa) | Tabelas de leitura pública via Row Level Security; sem servidor para manter. |
| Latência no Brasil | Região **sa-east-1 (São Paulo)**. |
| Custo | Plano gratuito suficiente no desenvolvimento; Pro a US$ 25/mês quando lançar. |

## Limites do plano gratuito (conferir em supabase.com/pricing)
- 500 MB de banco por projeto, 2 projetos ativos (projetos pausados não contam).
- **Projeto pausa após 7 dias sem requisições** — basta reativar no painel. Some no plano Pro.
- Sem backups automáticos no gratuito → manter os scripts de importação reprodutíveis (eles são o "backup").
- Login anônimo tem limite de 30 por hora por IP (ajustável); recomendado ativar CAPTCHA/Turnstile antes de lançar.

Consequência de projeto: **guardar no banco só o agregado por hexágono** (alguns milhares de linhas), nunca o
1,16 milhão de BOs crus. O cálculo pesado roda no seu computador, num script, e só o resultado sobe.

## Alternativas avaliadas
- **Manter Express + MongoDB Atlas em Railway/Render/Fly.io:** funciona, mas exige manter servidor, auth e
  deploy próprios. Railway não tem plano gratuito permanente (teste de 30 dias, Hobby US$ 5/mês); o Atlas M0
  tem 512 MB e limite de operações por segundo.
- **Firebase:** ótimo SDK mobile, mas Firestore não faz consultas geoespaciais por polígono; o modelo NoSQL
  atrapalha agregações.
- **Neon/Postgres puro + API própria:** mais trabalho para o mesmo resultado; não traz Auth pronto.

## O que muda no código
- `apps/api` (Express/Mongoose) foi substituído por `supabase/` (migrations SQL, funções) e
  `scripts/` (importação de distritos e crimes, rodados localmente com a chave secreta) e removido na Fase 2.3.
- `apps/mobile` passa a usar `@supabase/supabase-js`; somem `api.ts`, `TokenStorage.ts` e `UserService.ts`.
- Login Google/Apple nativo exige **development build** (EAS/`npx expo run:android`); no Expo Go só o login
  anônimo funciona.

## Pontos a verificar na implementação
- Se a extensão `h3` está disponível no projeto (`select * from pg_available_extensions where name like 'h3%';`).
  Se não estiver, calcular os hexágonos no script com `h3-js` e gravar índice + polígono no PostGIS.
