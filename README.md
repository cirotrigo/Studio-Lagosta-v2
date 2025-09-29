# Template SaaS em Next.js

Um template pronto para produção em Next.js com autenticação (Clerk), banco de dados (PostgreSQL + Prisma), billing e sistema de créditos. Inclui UI com Radix + Tailwind, TypeScript e estrutura organizada para acelerar entregas.

> Template mantido pela **AI Coders Academy** — saiba mais em [`https://www.aicoders.academy/`](https://www.aicoders.academy/). Suporte: `suporte@aicoders.academy`.

## Início Rápido
```bash
# 1) Clonar e instalar
git clone <your-repo-url>
cd nextjs-saas-template
npm install

# 2) Variáveis de ambiente
cp .env.example .env.local
# Edite .env.local (Clerk, DATABASE_URL, chaves de AI/Stripe se necessário)

# 3) Banco de dados (dev)
npm run db:push

# 4) Rodar o app
npm run dev
# Acesse http://localhost:3000
```

Para visão geral completa, leia: [docs/README.md](docs/README.md)

## Recursos
- 🔐 Autenticação: Clerk com rotas protegidas e middleware.
- 💾 Banco: PostgreSQL + Prisma ORM, modelos prontos (usuários, créditos, billing).
- 💳 Pagamentos: pronto para integração com Stripe e webhooks.
- 🪙 Créditos: rastreamento/consumo de créditos por operação.
- 🤖 AI Chat: integração com Vercel AI SDK com provedores selecionáveis (OpenAI, Anthropic, Google, Mistral e OpenRouter) e streaming.
- 📎 Anexos no Chat: upload de arquivos para Vercel Blob e anexos clicáveis na conversa.
- 🎨 UI: Radix UI + Tailwind CSS.
- 🔒 Type-safe: TypeScript do frontend ao backend.

## Primeiros Passos
### Pré-requisitos
- Node.js 18+
- Banco PostgreSQL
- Conta no Clerk (obrigatório)
- (Opcional) Conta no Stripe

### Configuração
1. Clonar o repositório:
```bash
git clone <your-repo-url>
cd nextjs-saas-template
```
2. Instalar dependências:
```bash
npm install
```
3. Variáveis de ambiente:
```bash
cp .env.example .env.local
```
4. Editar `.env.local`:
   - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (e `CLERK_WEBHOOK_SECRET` se usar webhooks)
   - Banco: `DATABASE_URL`
   - App: `NEXT_PUBLIC_APP_URL`
   - Analytics (opcional): `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_FACEBOOK_PIXEL_ID`
   - Stripe (opcional): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - AI (opcional): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`
   - Uploads (opcional): `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
5. Preparar o banco (dev):
```bash
npm run db:push
```
6. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```
Acesse http://localhost:3000.

## Documentação
- Índice central: [docs/README.md](docs/README.md)
- Arquitetura: [docs/architecture.md](docs/architecture.md)
- Backend & API: [docs/backend.md](docs/backend.md), [docs/api.md](docs/api.md)
- Frontend: [docs/frontend.md](docs/frontend.md), [docs/components.md](docs/components.md)
- Autenticação: [docs/authentication.md](docs/authentication.md)
- Banco de Dados (Prisma): [docs/database.md](docs/database.md)
- Créditos: [docs/credits.md](docs/credits.md)
- Diretrizes de desenvolvimento: [docs/development-guidelines.md](docs/development-guidelines.md)

Guias de agentes (prompts e checklists): [agents/README.md](agents/README.md)

## AI Chat (Vercel AI SDK)
- Rota de API: `POST /api/ai/chat` usa `ai` (Vercel AI SDK) com `streamText` para respostas via SSE.
- Provedores suportados: OpenAI, Anthropic, Google, Mistral e OpenRouter (compatível com OpenAI via `baseURL`).
- Página protegida: `/ai-chat` com seletor de provedor/modelo e chat com streaming.
- Geração de imagem (OpenRouter): alternar “Modo: Imagem” na página; envia para `POST /api/ai/image` e retorna imagens como data URLs.
 - Anexos: botão de clipe para enviar arquivo ao Vercel Blob e inserir links nos prompts.

Créditos
- Custos por feature e créditos por plano são configuráveis pelo admin:
  - Página: `/admin/settings` (abas: custos e planos/mensalidade de créditos)
  - API pública: `GET /api/credits/settings` para a UI
  - Custos padrão: `ai_text_chat` e `ai_image_generation` (sobrepostos por overrides)
- Créditos por plano: defina `Free` e mapeie IDs do Clerk (`cplan_*`) para `{ name, credits }` no Admin (persistidos em `AdminSettings`)
- Enforced no backend via `validateCreditsForFeature`/`deductCreditsForFeature` e integrados na UI via `useCredits().getCost()`/`canPerformOperation()`.
- Reembolso automático:
  - Chat: se a chamada ao provedor falhar após o débito, o sistema reembolsa e retorna 502
  - Imagem: reembolsa em respostas inválidas/erros ou sem imagens

Configuração
- Defina as chaves no `.env.local` (somente as que for usar):
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`
- Abra `/ai-chat`, selecione provedor/modelo e envie mensagens.

Extensão
- Para adicionar modelos, edite `MODELS` em `src/app/(protected)/ai-chat/page.tsx`.
- Para novos provedores, use os clients do SDK (`@ai-sdk/*`) e ajuste `getModel` em `src/app/api/ai/chat/route.ts`.

### Uploads de Arquivos (Vercel Blob)
- API: `POST /api/upload` (multipart/form-data com campo `file`). Requer sessão (Clerk).
- Armazena em `uploads/<clerkUserId>/<timestamp>-<arquivo>` no Blob Store vinculado ao token.
- Retorna `{ url, pathname, contentType, size, name }`.
- Habilitar: defina `BLOB_READ_WRITE_TOKEN` em `.env.local`. O token já inclui Store/Região; não é preciso configurar no código.
- Base URL padrão: `https://blob.vercel-storage.com` (ou domínio customizado se configurado no Vercel Blob).
- Detalhes: veja `docs/uploads.md`.

## Estrutura do Projeto
```
src/
├── app/
│   ├── (public)/         # Rotas públicas (landing, auth)
│   ├── (protected)/      # Rotas protegidas (dashboard, billing)
│   └── api/              # API Routes (App Router)
├── components/
│   ├── ui/               # Componentes de UI reutilizáveis
│   └── credits/          # Componentes do sistema de créditos
├── hooks/                # Hooks React personalizados
└── lib/                  # Auth, DB, utilidades, domínios e queries
    └── queries/          # Camada de acesso a dados (DAL) para uso em Server Components
```

### Marca & Metadados
- Configuração central da marca: `src/lib/brand-config.ts`
  - Nome, descrição, palavras-chave, URL pública, logos/ícones e imagem OG
  - IDs de analytics/pixels (GTM, GA4, Meta Pixel)
- Usos:
  - Metadados globais em `src/app/layout.tsx`
  - Header/Footer públicos
  - Injeção de pixels via `AnalyticsPixels`
- Guia: veja `docs/brand-config.md`

## Recursos Principais
### Autenticação
- Páginas de login/cadastro com Clerk
- Rotas protegidas via middleware (`src/middleware.ts`)

### Banco de Dados
- Prisma ORM + PostgreSQL
- Modelos para usuários e créditos

### Acesso a Dados (padrão atualizado)
- Nunca importe o Prisma Client (`@/lib/db`) em Client Components ou no browser.
- Server Components não devem executar queries diretamente via Prisma. Em vez disso, consuma funções da camada de queries em `src/lib/queries/*`.
  - Exemplo: `getActivePlansSorted()` em `src/lib/queries/plans.ts` usado por `src/app/(public)/page.tsx`.
- API Routes (`src/app/api/*`) e Server Actions podem usar Prisma diretamente ou reutilizar funções da camada de queries.

### Créditos & Billing
- Utils de validação/uso em `src/lib/credits/*`
- Páginas de assinatura e handlers de webhook

#### Créditos: Fonte de Verdade no Servidor
- A UI lê o saldo sempre do backend: `GET /api/credits/me`.
- `useCredits()` usa React Query para buscar e manter atualizado (30s e ao focar a janela).
- Após consumir créditos (ex.: chat ou imagem), a UI chama `refresh()` para refetch imediato.
- Hook: `src/hooks/use-credits.ts` expõe `{ credits, isLoading, canPerformOperation, getCost, refresh }` e lê `GET /api/credits/settings` para custos dinâmicos.
- Health check de enums/Prisma: `GET /api/admin/health/credits-enum` (somente admin) valida o mapeamento `Feature → OperationType`.

#### Packs de Créditos (compra avulsa)
- Para crédito avulso (fora da assinatura), mapeie os `Stripe Price IDs` para a quantidade de créditos em `src/lib/clerk/credit-packs.ts`.
  - Exemplo:
    ```ts
    export const CREDIT_PACK_PRICE_TO_CREDITS = {
      'price_small_pack': 100,
      'price_medium_pack': 500,
    }
    ```
- O webhook do Clerk em `src/app/api/webhooks/clerk/route.ts` soma os créditos correspondentes quando recebe `invoice.payment_succeeded` contendo esses prices.
- Preencha seus Price IDs reais no arquivo acima. Se o pagamento for apenas renovação de assinatura, os créditos são atualizados pelos eventos `subscription.updated`.

#### Créditos no Backend (configuração e uso)
- Defaults: `src/lib/credits/feature-config.ts` (mapeadas para `OperationType`)
- Overrides persistentes (admin): `AdminSettings` + helpers em `src/lib/credits/settings.ts`
  - `getFeatureCost(feature)` e `getPlanCredits(planId)` retornam valores efetivos
- Validação e desconto transacional:
```ts
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { type FeatureKey } from '@/lib/credits/feature-config'

const feature: FeatureKey = 'ai_text_chat'
await validateCreditsForFeature(clerkUserId, feature)

await deductCreditsForFeature({
  clerkUserId,
  feature,
  projectId,
  details: { tasks: 3 },
  quantity: 3,
})
```
Observação: ajuste `FEATURE_CREDIT_COSTS` como base e/ou use `/admin/settings` para overrides.

#### Planos do Clerk → Créditos
- No Admin (`/admin/settings`), mapeie seus IDs de planos do Clerk (`cplan_*`) para um `name` (exibição interna) e `credits` (mensais).
- Não há plano gratuito fixo no código. Se houver, crie-o no Clerk e mapeie o ID do plano com nome e créditos no Admin.
- O webhook em `src/app/api/webhooks/clerk/route.ts` usa `getPlanCredits(planId)` passando o `subscription.plan_id` para atualizar o saldo mensal.

Importação de Planos (Clerk)
- No Admin → Settings (aba Planos), você pode:
  - Detectar planos via hook do Clerk (quando disponível) e adicioná-los rapidamente
  - Tentar importar via API do backend (`GET /api/admin/clerk/plans`, requer `CLERK_SECRET_KEY`)
  - Colar um JSON com a lista de planos e nomes

### Painel Admin
- Acesso: `/admin` (SSR guard + middleware). Configure `.env.local`: `ADMIN_EMAILS` ou `ADMIN_USER_IDS`.
- Funcionalidades:
  - Usuários: listar, ajustar créditos, excluir
  - Convidar usuário por e‑mail (via Clerk) com toasts
  - Convites pendentes: visualizar, reenviar e revogar
  - Sincronizar usuários do Clerk → DB (backup caso webhook falhe)
- Requisitos Clerk para convites:
  - Invitations e envio de e‑mails habilitados no projeto Clerk
  - Redirect permitido: `${NEXT_PUBLIC_APP_URL}/sign-up`
- APIs Admin relevantes:
  - `POST /api/admin/users/invite`
  - `GET  /api/admin/users/invitations`
  - `POST /api/admin/users/invitations/:id/resend`
  - `POST /api/admin/users/invitations/:id/revoke`
  - `POST /api/admin/users/sync` ({ pageSize?, maxPages? })
  - `GET  /api/admin/health/credits-enum`
  - `PUT  /api/admin/credits/:id` (ajuste por saldo)
  - `PUT  /api/admin/users/:id/credits` (ajuste via ID do usuário)
  - `DELETE /api/admin/users/:id` (desativa o usuário – soft delete)
  - `POST   /api/admin/users/:id/activate` (reativa o usuário)

Notas Prisma
- O Prisma Client é gerado em `prisma/generated/client`.
- O código usa esse client gerado (não `@prisma/client`) para evitar divergências de enums/tipos em runtime.
- Atalho de tipos: `src/lib/prisma-types.ts` reexporta `OperationType` do client gerado.

## Scripts
- `npm run dev` — Dev server
- `npm run build` — Gera Prisma Client e build de produção
- `npm start` — Servidor em produção
- `npm run lint` — Lint do Next/TypeScript
- `npm run typecheck` — Verificação de tipos
- `npm run db:push` — Sincroniza schema (dev)
- `npm run db:migrate` — Migrações Prisma
- `npm run db:studio` — Prisma Studio

## Deploy
Pronto para Vercel/Netlify/Node. Na Vercel:
- Configure variáveis de `.env.example` (Clerk, `DATABASE_URL`, Stripe, etc.)
- Use runtime Node (não Edge) para endpoints com Prisma
- Aponte webhooks (Clerk/Stripe) para rotas em `src/app/api/webhooks/*`

### Variáveis de Ambiente (produção)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- Outras de `.env.example`, conforme necessário

## Guias de Agentes
Use estes guias/prompts ao iniciar tarefas ou revisões:
- `AGENTS.md` — Diretrizes do Repositório (estrutura, scripts, estilo, PRs)
- `agents/README.md` — Índice dos Guias
- `agents/security-check.md` — Verificação de Segurança
- `agents/frontend-development.md` — Desenvolvimento Frontend
- `agents/backend-development.md` — Desenvolvimento Backend
- `agents/database-development.md` — Banco de Dados
- `agents/architecture-planning.md` — Arquitetura & Planejamento

## Guia Interno de Desenvolvimento (pt-BR)
Guia detalhado para Clerk, banco, deploy na Vercel e uso de agentes.

### Variáveis de Ambiente (copie de `.env.example` para `.env.local`)
- Clerk:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pública)
  - `CLERK_SECRET_KEY` (secreta)
  - `CLERK_WEBHOOK_SECRET` (webhooks)
- URLs do Clerk (padrões do template):
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard`
- Banco: `DATABASE_URL=postgresql://user:password@host:5432/saas_template`
- App: `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- Stripe (opcional): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Configurar Clerk
1) Crie um app em dashboard.clerk.com e copie as chaves.
2) Defina `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` em `.env.local`.
3) Redirects/origens autorizadas:
   - Dev: `http://localhost:3000`
   - Produção: domínio `.vercel.app` e custom domain
4) Rotas de auth: `src/app/(public)/sign-in` e `src/app/(public)/sign-up`. Rotas protegidas: `src/app/(protected)`.
5) Webhooks (opcional): configure endpoint e `CLERK_WEBHOOK_SECRET`.

### Acesso Admin
- Defina ao menos um admin via variáveis de ambiente:
  - `ADMIN_EMAILS=admin@seudominio.com,ops@seudominio.com`
  - ou `ADMIN_USER_IDS=usr_123,usr_456` (IDs do Clerk)
- Acesse o painel: `/admin` (somente admins conseguem entrar). As APIs em `src/app/api/admin/*` validam admin no servidor.

### Configurar Banco de Dados (Prisma + Postgres)
#### Postgres via Docker (script automatizado)
Recomendado para desenvolvimento local. Requer Docker instalado e em execução.

Comando padrão:
```bash
npm run db:docker
```
O script `scripts/setup-postgres-docker.mjs`:
- Cria (se necessário) um volume Docker para persistir dados
- Sobe um PostgreSQL em um container nomeado
- Mapeia a porta local escolhida e imprime a `DATABASE_URL` pronta para colar no `.env.local`

Personalização via variáveis de ambiente:
- `PG_CONTAINER_NAME` (padrão: `saas-postgres`)
- `PG_DB` (padrão: `saas_template`)
- `PG_USER` (padrão: `postgres`)
- `PG_PASSWORD` (padrão: `postgres`)
- `PG_PORT` (padrão: `5432`)
- `PG_IMAGE` (padrão: `postgres:16`)
- `PG_VOLUME` (padrão: `saas_postgres_data`)

Exemplos:
```bash
# Porta alternativa e credenciais próprias
PG_PORT=5433 PG_DB=app PG_USER=app PG_PASSWORD=secret npm run db:docker

# Alterar nome do container e volume
PG_CONTAINER_NAME=my-db PG_VOLUME=my_db_volume npm run db:docker
```

Comandos úteis do Docker (após criar o container):
```bash
docker stop saas-postgres        # parar
docker start saas-postgres       # iniciar
docker logs -f saas-postgres     # logs
```

Defina a `DATABASE_URL` no `.env.local` com a URL impressa pelo script, por exemplo:
```env
DATABASE_URL="postgresql://app:secret@localhost:5433/app"
```

Depois, rode:
```bash
npm run db:push      # ambiente de desenvolvimento
# ou
npm run db:migrate   # migrações versionadas
```
Opção A — Docker local (manual):
```
docker run --name saas-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=saas_template -p 5432:5432 -d postgres:16
```
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_template`

Opção B — Gerenciado (Neon, Supabase, RDS): crie a base e copie a URL.

Sincronizar/Migrar:
- Rápido (dev): `npm run db:push`
- Versionado (recomendado): `npm run db:migrate`
- Inspecionar: `npm run db:studio`

Observações:
- `npm run dev` e `npm run build` executam `prisma generate` automaticamente.
- O Prisma Client é gerado em `prisma/generated/client` e não é versionado (gitignored). Se faltar, rode `npx prisma generate`.
- Mantenha `userId`/`workspaceId` em modelos multi-tenant.

### Rodar Localmente
1) `npm install`
2) Configure `.env.local`
3) Inicie banco (`db:push` ou `db:migrate`)
4) `npm run dev` → http://localhost:3000
5) Valide sign-in/sign-up e acesso às rotas protegidas

## Webhooks do Clerk (Local)
Para integrar o Clerk localmente, você precisa expor seu `localhost` através de um túnel público. Sem um endpoint público, o Clerk não consegue entregar as chamadas do webhook ao seu ambiente de desenvolvimento.

Passos rápidos
- Inicie o app: `npm run dev`
- Inicie um túnel (escolha uma opção):
  - Vercel Dev Tunnel (se suportado pelo seu CLI): `npm run dev:tunnel`
  - Cloudflare Tunnel (recomendado): `npm run tunnel:cf` (requer `cloudflared` instalado)
  - ngrok (alternativa): `npm run tunnel:ngrok` (requer `ngrok` instalado)
- No Clerk → Webhooks → Add endpoint
  - URL: `https://<URL-DO-TUNEL>/api/webhooks/clerk`
  - Copie o “Signing secret” e adicione em `.env.local`: `CLERK_WEBHOOK_SECRET=whsec_...`
- Envie um “Test event” no Clerk para validar.

Notas
- A rota do webhook está em `src/app/api/webhooks/clerk/route.ts` e valida as assinaturas Svix.
- Algumas versões do Vercel CLI não suportam `vercel dev --tunnel`. Use Cloudflare/ngrok se o túnel do Vercel não estiver disponível.
- Guia completo: veja `docs/dev-webhooks.md`.

Requisitos das ferramentas de túnel
- Cloudflare Tunnel: instalar `cloudflared` (ex.: macOS `brew install cloudflare/cloudflare/cloudflared`).
- ngrok: instalar e autenticar `ngrok` (ex.: `brew install ngrok/ngrok/ngrok` e `ngrok config add-authtoken <TOKEN>`).

## Documentação Complementar
- Admin detalhado: `docs/admin.md`
- Créditos e sincronização: `docs/credits.md`
- Uploads de arquivos: `docs/uploads.md`


### Deploy na Vercel
1) Importe o repositório
2) Configure variáveis de ambiente (Clerk, `DATABASE_URL`, Stripe)
3) Build & Runtime:
   - Build padrão do Next (gera Prisma Client)
   - Runtime Node (não Edge) para Prisma
4) Banco: use provedor acessível pela Vercel (Neon/Supabase); habilite pooling se necessário
5) Clerk produção: adicione domínios `.vercel.app` e customizados
6) Webhooks: aponte Stripe/Clerk para `src/app/api/webhooks/*` e defina `*_WEBHOOK_SECRET`
7) Pós-deploy: teste auth, rotas protegidas, acesso ao DB e créditos

### Usar os Agents (prompts)
- Leia `AGENTS.md` e `agents/README.md`
- Copie o prompt do arquivo em `agents/` pertinente e inclua contexto (arquivos/rotas/contratos)
- Anexe o guia do agente na descrição do PR
 - Para recursos que consomem créditos, use as keys: `ai_text_chat` e `ai_image_generation` (custos em `src/lib/credits/feature-config.ts`)

### Solução de Problemas (FAQ)
- Prisma em produção: use runtime Node e confirme `prisma generate` no build
- Login falha no deploy: verifique domínios/redirects no Clerk e variáveis na Vercel
- `DATABASE_URL` inválida: teste conexão localmente; confirme SSL/Pooling no provedor
- Tipos/ESLint: execute `npm run typecheck` e `npm run lint` antes do PR

## Licença
MIT
