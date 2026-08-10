# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context7 MCP Integration

**IMPORTANT**: This project has Context7 MCP server configured for up-to-date documentation access.

### When to Use Context7
Always use Context7 when you need:
- Code generation with latest library/framework syntax
- Setup or configuration steps for dependencies
- API documentation for libraries in our tech stack
- Version-specific examples (Next.js 15, Clerk, Prisma, TanStack Query, etc.)
- Up-to-date best practices beyond January 2025 knowledge cutoff

### How to Use
Simply include `use context7:` at the start of your prompt when requesting help with code implementation, library usage, or framework-specific features.

**Example:**
```
use context7: How to implement server actions with Prisma in Next.js 15?
```

## Development Commands

### Running the Application
```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production (runs prisma generate first)
npm run start        # Start production server
```

### Code Quality
```bash
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking (tsc --noEmit)
```

### Database Management
```bash
npm run db:push      # Push schema changes to database
npm run db:migrate   # Run database migrations
npm run db:reset     # Reset database (drop all data and recreate schema)
npm run db:studio    # Open Prisma Studio for database management
```

**Migration history (consolidated in July 2026)**: the 31 previous migrations
were squashed into a single `prisma/migrations/0_init/migration.sql`. The old
history could not be replayed — the baseline never created the `Prompt` and
`Organization` tables that `add_prompt_organization_visibility` tried to alter,
so every `prisma migrate dev` failed on the shadow database. That is why some
tables used to be created with direct SQL or `db push`.

Consequences:
- **Schema changes now go through `npx prisma migrate dev --name <change>`.**
  Reserve `db:push` for local experiments — do not use it to ship schema changes.
- ⚠️ **`migrate dev` só é seguro contra um banco local.** O `.env` aponta para
  PRODUÇÃO, e o banco tem drift (tabelas e colunas criadas fora do histórico por
  `db push`), então o `migrate dev` pede para **resetar o banco** para
  reconciliar. Contra produção, escreva o `migration.sql` à mão e aplique com
  `npx prisma migrate deploy`, que não usa shadow database nem reseta nada.
- `0_init` is idempotent (`IF NOT EXISTS`, `DO` blocks for enums and FKs), so it
  is a no-op on databases that already have the schema.
- Old clones must pull `main` before running any migration command, since the
  previous migration folders no longer exist on disk.

See `docs/SESSAO-2026-07-26-EDITOR-INSTAGRAM.md` § 9 for the full diagnosis.

### Branches do Neon (renomeados em 30/07/2026)

Projeto `studio-lagosta` (`patient-king-49987156`):

| Branch | Id | Compute | O que é |
|---|---|---|---|
| **`production`** (`default`) | `br-fancy-boat-adl32qyg` | `ep-fragrant-term-adnufsao` | **A produção.** Banco do `.env` **e** do env de produção da Vercel |
| `abandonado-producao-2025` | `br-dawn-heart-adi76dh9` | `ep-restless-silence-adjepguy` (idle) | A produção original, parada desde 31/12/2025 |
| `dev-local` | `br-young-boat-adv30d9f` | `ep-holy-flower-ada0j66v` | O banco de desenvolvimento |

**Até 30/07/2026 os nomes mentiam**: o branch chamado `dev` era a produção
(alguém ramificou a produção para ele em 31/12/2025, apontou tudo e nunca
renomeou), enquanto o chamado `production` estava abandonado. Renomear era
seguro porque a string de conexão vem do **endpoint**, não do nome — o que
ficou provado na prática (produção seguiu respondendo, sem tocar na Vercel).

Regras que sobrevivem ao conserto:

- **Nunca identifique a produção pelo NOME do branch nem pelo flag `default`** —
  identifique pelo **compute**: o dono do endpoint que está no `DATABASE_URL`.
  É o que `scripts/setup-dev-db.ts` faz, e por isso o `--recriar` dele recusa
  apagar o branch que serve a produção. Hoje o nome bate; ele já não batia.
- **O `default` foi movido para o `production`** em 30/07/2026, junto com o
  rename. No Neon o branch `default` não pode ser apagado, então a proteção
  agora está sobre a produção em vez de sobre o branch abandonado.
  `set_as_default` é só a designação: o compute ficou idêntico (0.25–2 CU,
  suspend 0s) e a API não disparou operação nenhuma.

### Banco de desenvolvimento (branch do Neon, 30/07/2026)

O `.env` continua apontando para **PRODUÇÃO** — scripts, MCP e `db:studio` são
ferramentas de operação e precisam disso. O que mudou é que os comandos que
alteram schema agora rodam contra um **branch do Neon** (`dev`), via
`scripts/dev-db.ts`.

- `npm run db:dev:setup` cria o branch e escreve o `.env.development.local`
  (automático com `NEON_API_KEY`; sem a chave, imprime o passo a passo do
  console). `--recriar` joga fora e refaz a partir da produção de hoje.
- `npm run db:dev:status` mostra qual banco cada camada resolve.
- **`db:migrate`, `db:push` e `db:reset` vão para o branch de dev**;
  `db:deploy` (`prisma migrate deploy`) é o caminho de produção;
  `db:studio` continua em produção e `db:studio:dev` abre o branch.
- **`npm run dev` usa o branch automaticamente** — o Next carrega
  `.env.development.local` antes de tudo. Consequência: o app local grava
  linhas no branch, mas Blob, Drive e APIs externas continuam sendo os de
  produção. Não é sandbox completo.

Armadilhas registradas:

- **Não trocar o runner por `dotenv -e .env.development.local -e .env`.** O
  dotenv-cli **ignora em silêncio** arquivo inexistente e cai no seguinte —
  com o `.env` apontando para produção, um arquivo de dev apagado faria
  `prisma migrate dev` (que propõe **resetar o banco**) rodar contra
  PRODUÇÃO. Testado em 30/07. O runner aborta nesse caso.
- **O guard compara o compute, não o host**: `ep-x-pooler.…` e `ep-x.…` são a
  mesma instância, então colar a URL *direta* de produção no `DATABASE_URL` de
  dev também é recusado.
- **`npx prisma migrate dev` cru continua perigoso** — ele lê o `.env`. Use
  sempre `npm run db:migrate`.
- **Branch do Neon é copy-on-write e envelhece**: nasce com os dados do
  momento e não acompanha a produção. Antes de testar algo que dependa de
  dado recente, `npm run db:dev:setup --recriar`. Isolamento verificado em
  30/07: escrita no `dev-local` não aparece na produção.
- **A `NEON_API_KEY` é opcional e mora no `.env`.** Sem ela o setup imprime o
  passo a passo do console. A API exige `org_id` no `GET /projects` (contas
  hoje pertencem a uma organização) — o script descobre isso sozinho via
  `/users/me/organizations`.
- Migration para produção continua sendo **escrita à mão + `db:deploy`** (ver
  § Database Management). O branch serve para *validar* a migration antes.

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15.3.5 with App Router
- **Authentication**: Clerk (with middleware protection)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS v4 with Radix UI components
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form with Zod validation
- **Language**: TypeScript (non-strict mode)

### Project Structure

```
src/
├── app/
│   ├── (public)/          # Unauthenticated routes
│   │   ├── sign-in/       # Clerk sign-in page
│   │   ├── sign-up/       # Clerk sign-up page
│   │   └── page.tsx       # Landing page
│   ├── (protected)/       # Authenticated routes (client-side protection)
│   │   ├── dashboard/     # Main dashboard
│   │   ├── billing/       # Subscription management
│   │   └── layout.tsx     # Protected layout with sidebar
│   ├── admin/             # Admin panel routes
│   │   ├── settings/      # Admin settings (split into features & plans)
│   │   │   ├── features/  # Feature cost configuration
│   │   │   ├── plans/     # Billing plans management (Clerk sync)
│   │   │   └── page.tsx   # Settings overview with navigation cards
│   │   ├── users/         # User management
│   │   ├── credits/       # Credit management
│   │   └── usage/         # Usage analytics
│   └── api/               # API routes (server-side)
│       ├── credits/       # Credit system endpoints
│       └── admin/         # Admin API endpoints
├── components/
│   ├── ui/                # Radix UI + Tailwind components
│   ├── app/               # Application-specific components (sidebar, topbar)
│   └── providers/         # React Query and theme providers
├── lib/
│   ├── db.ts              # Prisma client singleton
│   ├── auth-utils.ts      # Authentication helpers
│   ├── api-client.ts      # HTTP client for TanStack Query
│   └── utils.ts           # Utility functions (cn for className merging)
└── hooks/                 # Custom React hooks
    ├── admin/             # Admin-specific TanStack Query hooks
    └── use-*.ts           # General application hooks
```

### Authentication Flow
- Clerk handles authentication with middleware protection
- Public routes: `/`, `/sign-in/*`, `/sign-up/*`, `/api/health`
- Protected routes use client-side `useAuth` hook to verify authentication
- API routes use server-side `auth()` from Clerk
- Users are automatically created in database on first authentication via `getUserFromClerkId`

### Database Schema (Key Models)
- **User**: Linked to Clerk via `clerkId`, owns workspaces and AI agents
- **Workspace**: Container for AI agents with context artifacts
- **AIAgent**: Configurable agents with capabilities and system prompts
- **CreditBalance**: Tracks user credits (synced with Clerk)

### API Pattern
All API routes follow this pattern:
1. Authenticate user with `await auth()` from Clerk
2. Get or create database user with `getUserFromClerkId()`
3. Verify resource ownership when applicable
4. Return JSON response with appropriate status codes

### Component Architecture
- All components use `"use client"` directive when needed for interactivity
- UI components are built with Radix UI primitives + Tailwind styling
- Form components use React Hook Form with Zod schemas
- Data fetching uses TanStack Query for caching and state management

### Data Fetching with TanStack Query
This project uses TanStack Query (React Query) for all client-side API requests with a consistent approach:

#### API Client Pattern
- **Centralized HTTP Client**: All API calls use the `api` utility from `@/lib/api-client`
- **Error Handling**: Automatic error parsing and type-safe error responses
- **Type Safety**: Generic API client with TypeScript support

```typescript
// Example API client usage
import { api } from '@/lib/api-client';

// GET request
const data = await api.get<UserData>('/api/users/me');

// POST request with data
const result = await api.post('/api/users', { name: 'John' });
```

#### Custom Hooks Pattern
All data fetching is encapsulated in custom hooks following these conventions:

**Query Hooks (GET requests):**
```typescript
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users'),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}
```

**Mutation Hooks (POST/PUT/DELETE requests):**
```typescript
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userData: CreateUserData) =>
      api.post('/api/users', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

#### Hook Organization
- **`src/hooks/use-*.ts`**: General application hooks
- **`src/hooks/admin/use-admin-*.ts`**: Admin-specific hooks
- Each hook file exports related query and mutation hooks
- Hooks include proper TypeScript interfaces for request/response data

#### Caching Strategy
- **Query Keys**: Structured as arrays for easy invalidation (e.g., `['users', userId]`)
- **Stale Time**: Varies by data type (30s for real-time, 5min for settings)
- **Garbage Collection**: Automatic cleanup of unused cache entries
- **Background Refetching**: Keeps data fresh when window gains focus

#### Error Handling
- **ApiError Class**: Custom error type with status codes and response details
- **Consistent Error States**: All hooks provide standardized error information
- **User Feedback**: Automatic toast notifications for mutation errors

#### Important Rules
- **NEVER use fetch() directly** in client components - always use custom hooks
- **Server-side API routes** can use fetch() for external service calls
- **All mutations** should invalidate relevant queries for cache consistency
- **Loading states** are automatically handled by TanStack Query

### Environment Variables Required
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `CLERK_WEBHOOK_SECRET` - For Clerk webhooks
- `DATABASE_URL` - PostgreSQL connection string
- Additional Clerk URLs and optional Stripe keys (see .env.example)

### Path Aliases
- `@/*` maps to `./src/*`
- Components import example: `import { Button } from "@/components/ui/button"`

### TypeScript Configuration
- Strict mode is disabled (`"strict": false`)
- Path aliases configured for `@/` imports
- No implicit any warnings (`"noImplicitAny": false`)

### Admin Settings Management
The admin settings have been split into specialized pages for better organization:

#### Settings Structure
- **`/admin/settings`**: Overview page with navigation cards to sub-settings
- **`/admin/settings/features`**: Feature cost configuration (credits per functionality)
- **`/admin/settings/plans`**: Billing plans management (Clerk synchronization)

#### Billing Plans Management (Clerk Sync-Only)
- **Sync-Only Approach**: Plans cannot be created manually in the UI
- **Clerk Integration**: All plans must be created in Clerk Dashboard first
- **Synchronization Process**:
  1. Create billing plans in Clerk Dashboard
  2. Use "Sync with Clerk" button to import plans
  3. Configure credits and display names locally
  4. Save changes to persist settings
- **Local Configuration**: Only plan names and credit allocations are editable
- **Plan IDs**: Read-only, sourced directly from Clerk
- **Status Management**: Plans can be activated/deactivated locally

#### Feature Costs Configuration
- **Direct Management**: Feature costs can be edited directly
- **Validation**: Ensures non-negative integer values for credits
- **Real-time Updates**: Changes reflected immediately with proper validation

### Instagram Story Verification System
The application includes an independent verification system for Instagram Stories using the Instagram Graph API to confirm that posts scheduled via Buffer/Zapier were actually published.

#### Verification Approach (v1 - Simplified)
- **Primary Method (Plano A)**: Uses unique verification tags in captions
- **Fallback Method (Plano B)**: Matches by timestamp + media_type (expected to be primary method in production)
- **TAG Format Decision**: Uses `SL-{postId6chars}-{hash4chars}` format (without `#` prefix)
  - Chosen for better compatibility with Buffer's tag system
  - Original plan suggested `#SLTAG-{8chars}-{4chars}` but simplified for practical use
  - 6 characters of postId provide sufficient uniqueness for our scale

#### System Architecture
**Core Components**:
- `src/lib/posts/verification/tag-generator.ts` - Generates and validates unique tags
- `src/lib/posts/verification/story-verifier.ts` - Main verification logic with fallback
- `src/lib/instagram/graph-api-client.ts` - Instagram Graph API client
- `src/app/api/cron/verify-stories/route.ts` - Cron job endpoint (a cada 5 min;
  só passou a ser agendado no `vercel.json` em julho/2026 — antes o código
  existia mas nunca rodava, e o status VERIFIED vinha do sync do Zernio, isto é,
  do relato do próprio agendador)
- `src/app/api/webhooks/buffer/post-sent/route.ts` - Webhook handler that schedules verification

**Database Fields** (SocialPost model):
- `verificationTag` - Unique tag added to caption
- `verificationStatus` - Enum: PENDING, VERIFIED, VERIFICATION_FAILED, SKIPPED
- `verificationAttempts` - Retry counter (max 3 attempts)
- `nextVerificationAt` - Scheduled time for next verification attempt
- `verifiedStoryId` - Confirmed story ID from Instagram API
- `verifiedByFallback` - Boolean flag indicating if fallback method was used
- `verificationError` - Error code for debugging failed verifications

#### Verification Flow
1. **Post Creation**: TAG generated for STORY posts, added to caption before sending to Zapier
2. **Webhook Trigger**: Buffer webhook receives response, schedules verification (+5 min)
   - **IMPORTANT**: Verification is scheduled for ALL stories, regardless of Buffer's reported status
   - Buffer webhook is not reliable - posts may publish even if Buffer reports failure
   - Posts with `status: FAILED` are also verified to catch false negatives
3. **Cron Verification**: Every 5 minutes, cron job processes pending verifications:
   - Fetches stories from Instagram Graph API
   - Verifies ALL pending posts (both POSTED and FAILED status)
   - **Primary attempt**: Searches for TAG in story captions (Plano A)
   - **Fallback attempt**: If TAG not found, matches by timestamp (±5 min) + media_type (Plano B)
   - Accepts match only if exactly 1 candidate found (avoids false positives)
   - Retries with backoff: 5, 10, 15 minutes (max 3 attempts)
   - Respects 24-hour TTL for stories
4. **Result**: Post marked as VERIFIED (success), VERIFICATION_FAILED (not found/error), or SKIPPED (legacy/non-story)
   - If verified and post was FAILED, it means Buffer reported incorrectly

#### Fallback Method (Plano B) - Primary Expected Method
The fallback verification is robust and production-ready:
- **Time Window**: Matches stories within ±5 minutes of expected timestamp
- **Media Type Detection**: Compares image vs video based on URL patterns
- **Ambiguity Handling**: Rejects matches if multiple candidates found
- **Base Timestamp**: Uses `sentAt || bufferSentAt || scheduledDatetime || createdAt`
- **Expected Usage**: Primary method in production (TAGs serve as backup identifier)

#### Error Handling
- **Token Errors**: Detected and logged, manual token refresh required
- **Rate Limiting**: Automatic 15-minute delay before retry
- **Permission Errors**: Detected and logged with specific error codes
- **TTL Expiration**: Posts older than 24h marked as failed (stories expire)
- **Legacy Posts**: Posts created before launch date automatically skipped
- **API Errors**: Generic errors trigger standard retry logic

#### Environment Variables
- `INSTAGRAM_ACCESS_TOKEN` - Token global (usuário do sistema, via Facebook).
  Usado só para projetos **sem** token próprio.
- `INSTAGRAM_GRAPH_API_VERSION` - API version (default: v25.0)
- `INSTAGRAM_GRAPH_API_BASE_URL` - Override do host; normalmente não é preciso,
  o host é derivado do prefixo do token
- `VERIFICATION_FEATURE_LAUNCH_DATE` - Feature activation date (default: 2024-12-01)
- `CRON_SECRET` - Authentication for cron endpoints

#### Token por projeto (Instagram Login)

As contas dos clientes ficam em portfólios empresariais separados, fora do
alcance do token global. Cada projeto pode ter o seu:

- Campos: `Project.instagramAccessToken`, `instagramTokenExpiresAt`,
  `instagramAppScopedId`
- Cadastro: aba **Configurações** do projeto, ou
  `npm run ig:token -- <projectId> <TOKEN>`
- **Expiram em 60 dias**; `/api/cron/refresh-instagram-tokens` renova
  diariamente. Foi a falta disso que derrubou a integração em março/2026,
  sem ninguém perceber por meses.
- O id do Instagram Login é de outro espaço que o id de conta business
  (`1784...`) — não são intercambiáveis. Com token próprio, a conta é
  endereçada por `me`.
- **O token nunca deve chegar ao cliente**: `GET /api/projects/[id]` e o
  service de client-projects expõem apenas `hasInstagramToken`. Campos
  sensíveis novos no `Project` precisam do mesmo cuidado.

#### Métricas de story (atenção às mudanças da API)

- `impressions` foi **descontinuada** em março/2025; para stories use `views`.
- `exits`, `taps_forward` e `taps_back` **não existem mais** — substituídas por
  `navigation`.
- O Instagram rejeita a requisição **inteira** se uma métrica não existir na
  versão. `getInsights()` remove a recusada e refaz, intersectando com a lista
  que a própria API devolve no erro.
- Insights de story só existem nas 24h em que ele está no ar; `fetch-story-insights`
  roda de hora em hora e **recolhe** enquanto o story vive, porque os números
  crescem. Perdida a janela, o dado é irrecuperável.

#### Important Notes
- **PostStatus.VERIFYING**: Enum value exists but is NOT used; system uses `verificationStatus` field instead
- **Non-STORY Posts**: Automatically receive `verificationStatus: SKIPPED` (no verification needed)
- **Grouping Optimization**: Posts grouped by Instagram account to minimize API calls
- **Security**: All error messages sanitized to remove tokens before logging
- **Monitoring**: Verification results logged with structured data for debugging

### Janela de congelamento — até quando a arte é editável (03/08/2026)

O post só é entregue ao Zernio **5 minutos antes do horário**
(`FREEZE_WINDOW_MS` em `src/lib/posts/freeze-window.ts`). Antes disso a arte no
banco é a única fonte de verdade e pode ser editada à vontade; depois, o que
vai ao ar é a cópia que está no Zernio.

**O que havia antes**: o PRE-SEND do executor entregava TODO post futuro assim
que ficasse renderizado, sem teto de data — mediana de **39 segundos** após o
agendamento, com posts congelados por até 27 dias. Como nada no funil de render
fala com o Zernio, editar a arte depois disso não mudava o que era publicado:
**29 posts em 33 dias publicaram a versão velha, em silêncio**, com a agenda
mostrando a arte certa. O PRE-SEND não nasceu de incidente nenhum — entrou como
bullet do commit de rebrand `b7409a5` (17/04/2026); até ali o Studio era o
relógio, com `publishNow` fixo.

Regras que sobrevivem:

- **`laterPostId` não nulo significa INTOCÁVEL.** `invalidateScheduledRenders`
  não mexe nesses posts e os devolve em `congelados[]` — zerar `mediaUrls` de um
  post armado publicaria a arte velha do mesmo jeito **e** quebraria a capa na
  agenda e o `recover-stuck-post`, que reconstrói a publicação a partir dela.
  Quem chama a invalidação precisa contar isso a quem editou.
- **A invalidação devolve `{ invalidados, congelados }`, não `number`.** São 7
  chamadores; o `tsc` **não** pega quem interpola o retorno em template literal
  (foi assim que `rerender-agendados.ts` passou batido na primeira leva).
- **Encurtar a janela mexe em duas coisas opostas**: mais tempo editável, menos
  folga para o sistema se recuperar. Com 5 min a cadeia de retry (~7 min) já
  não cabe inteira. E a janela mudou **quem responde pelo horário**: com a
  entrega horas antes, queda do nosso cron era irrelevante; agora, se o cron
  estiver fora do ar nos minutos finais, ninguém publica.
- **`checkStuckPosts` ganhou o caso (c)**: SCHEDULED sem `laterPostId` que
  passou 6h do horário vira FAILED + aviso. Os casos (a) e (b) exigem POSTING e
  `laterPostId` — nenhum enxergava esse post, e havia **19 parados em silêncio**
  no banco. O piso de 7 dias existe para os zumbis antigos não virarem enxurrada
  no grupo.
- **`renderPostArt` (`src/lib/posts/render-post-art.ts`) reserva apenas por
  `renderStatus: PENDING`** — os portões de `renderAttempts < 3` e
  `nextRenderAt <= agora` vivem nas queries de quem chama, e o orçamento de
  tentativas é **compartilhado** entre o cron `render-stories` e o render de
  última hora do executor. Chamador novo que esqueça os portões queima as 3
  tentativas em 3 minutos e marca `RENDER_FAILED`, que é terminal.
- **Aviso de falha de arte tem trava de 15 min** (`registrarFalhaDeArte`): o
  `dedupeByPost` do batch só protege dentro de UMA execução do cron, e o post
  vencido volta a cada minuto. Log sempre, aviso uma vez.
- **`maxDuration` de rota vai INLINE, não no `vercel.json`**: o glob de lá é
  `app/api/**` e o projeto é `src/app/**` — nenhuma entrada casa. É por isso que
  11 crons declaram inline; `/api/cron/posts` não declarava e rodava no default
  da plataforma.
- **Voltar para rascunho reconstrói a arte** (`agenda-acoes.ts`, ramo REVERT):
  marca `renderStatus: PENDING` quando o post tem página e a arte veio do
  render. Sem isso havia uma ordem que publicava a versão antiga em silêncio —
  editar o template AINDA congelado (a invalidação pula), voltar para rascunho
  (não mexia em renderStatus) e aprovar (só força render com `mediaUrls`
  vazio). Justamente a sequência que a agenda recomenda.
  O guard `renderStatus === RENDERED` protege a arte MELHORADA com IA, que é
  `NOT_NEEDED` porque não vem da página; `mediaUrls` fica intacto de propósito,
  para o rascunho não ficar sem imagem se o render falhar.
- **O backlog anterior ao deploy não é alcançado**: quem já está no Zernio sob a
  regra antiga segue congelado, e a invalidação segue sem efeito nele.

### Retry de publicação e avisos de falha no WhatsApp

Post que falha **continua FAILED** (não existe status novo, não volta para
rascunho), ganha uma nova tentativa 1 minuto depois e, se a tentativa também
falhar, a equipe é avisada num grupo de WhatsApp via Evolution API.

`src/lib/posts/failure-handler.ts` é o ponto único: `handlePublishFailure`
decide entre agendar retry e avisar. `executeRetries` (`executor.ts`) reexecuta
e reagenda até 3 tentativas; `/api/cron/posts` roda a cada minuto e já chama os
dois — não precisa de cron novo.

#### Armadilhas

- **O retry já foi código morto por meses.** `scheduleRetry` só era chamado de
  dentro do próprio `executeRetries`, para agendar a tentativa seguinte. Nenhum
  ponto de falha criava o primeiro `PostRetry`, então post que falhava nunca era
  retentado. Quem liga o primeiro retry hoje é `handlePublishFailure`, chamado
  do `catch` do `sendToLater` (cobre os quatro ramos de erro de uma vez) e da
  varredura de posts travados. **Caminho novo que marque FAILED precisa chamar
  `handlePublishFailure`**, senão o post volta a morrer em silêncio.
- **`sendToLater` ignora qualquer post que já tenha `laterPostId`** e devolve
  `{ success: true, skipped: true }`. Retry nesses posts é um no-op que
  `executeRetries` grava como SUCCESS — pior que não retentar. Por isso
  `handlePublishFailure` só agenda retry quando `laterPostId` é null; post que
  já chegou ao Zernio é **notificado, nunca reenviado**. Limpar o `laterPostId`
  para forçar reenvio arriscaria publicação dupla, porque não dá para saber se
  o Zernio chegou a publicar.
- **Erro determinístico não vira retry**: crédito insuficiente, projeto sem
  conta do Instagram conectada, formato de imagem incompatível, e story cujo
  render falhou nas 3 tentativas. Todos avisam direto (`nonRetryableReason`).
- **Dedupe por janela de 30 minutos**: se já existe `PostRetry` recente para o
  post, `handlePublishFailure` sai sem fazer nada. É o que evita retry duplicado
  quando mais de um caminho marca o mesmo post como FAILED, e aviso duplicado
  quando a falha vem de dentro do próprio `executeRetries` — nesse caso a cadeia
  de retry é dona tanto da próxima tentativa quanto da mensagem.
- **O aviso sai na 2ª falha**, não na 1ª nem na última: `executeRetries` avisa
  quando o retry de `attemptNumber === 1` falha. As tentativas seguintes não
  avisam de novo.
- **Cron que pode falhar precisa ser embrulhado** em
  `withFailureNotificationBatch`, senão 5 posts falhando viram 5 mensagens no
  grupo em vez de uma. Já embrulhados: `posts`, `reminders`, `status-sync`,
  `check-stuck-posts`.

#### Notificação

`src/lib/notifications/evolution.ts` (cliente) e `post-failure-notifier.ts`
(mensagem e agrupamento). Envio: `POST {host}/message/sendText/{instancia}`,
header `apikey`, body `{ number, text }`; para grupo o `number` é o JID que
termina em `@g.us`.

- **Falha de notificação nunca propaga.** `sendWhatsAppText` devolve boolean e
  engole tudo — publicação não pode quebrar porque o WhatsApp caiu.
- Mensagem **em português, sem jargão de banco** (nada de FAILED/DRAFT/
  SCHEDULED): cliente, tipo de post, horário que era para sair no fuso de
  Brasília, motivo e link para `{APP_URL}/projects/{projectId}?tab=agenda`.
  Motivos longos do Zernio são colapsados e cortados em 220 caracteres.
#### Lembretes de publicação manual

Post com `publishType: REMINDER` não é publicado pelo sistema — alguém publica
na mão. `/api/cron/reminders` (a cada 5 min) manda pelo WhatsApp, 5 a 10 minutos
antes do horário, tudo que essa pessoa precisa: a arte, a legenda, o primeiro
comentário e a observação. Ver `src/lib/notifications/reminder-notifier.ts`.

- **Até julho/2026 isso era um webhook por projeto** (`Project.webhookReminderUrl`),
  e os 11 projetos apontavam para o mesmo n8n. A coluna, a rota
  `/api/projects/[projectId]/test-webhook` e o componente
  `reminder-webhook-config.tsx` foram **removidos** — não reintroduza o campo
  achando que sumiu por engano.
- **Uma mídia vai como imagem legendada** (uma mensagem só); com várias, o texto
  vai primeiro e as artes em seguida, numeradas, para a ordem do carrossel ficar
  clara.
- `reminderSentAt` só é gravado quando a mensagem principal sai. Arte extra que
  falha é apenas logada — reenviar tudo na rodada seguinte duplicaria o lembrete.
- **A janela vai de 2 horas atrás até 10 minutos à frente.** Era só
  `[+5min, +10min]`, e por isso lembrete criado com menos de 5 minutos de
  antecedência nunca disparava — ficava SCHEDULED para sempre. Cinco posts
  morreram assim entre janeiro e maio de 2026, todos apagados em 28/07.
  O que estiver vencido além das 2 horas **não** é avisado (lembrete de ontem
  só polui o grupo), mas sai no log em vez de sumir calado.
- Lembrete fora da janela normal recebe `late: true` e a mensagem muda de
  "Hora de publicar" para "Publicar agora".
- **Falha de envio grava PostLog sempre, mas avisa o grupo uma vez só.** Como o
  post continua elegível por 2 horas, sem essa trava a mesma falha viraria um
  aviso a cada 5 minutos.

#### Environment Variables

`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`,
`EVOLUTION_NOTIFY_GROUP_ID`. **Sem as quatro preenchidas o aviso vira log e
nada quebra** — o resto do fluxo segue normal. Valores só em ambiente, nunca no
código; o `.env.example` tem apenas os nomes.

### Galeria de criativos: grade, lightbox e o `globals.css` (10/08/2026)

Arco completo em `docs/SESSAO-2026-08-10-GALERIA-LIGHTBOX-E-RESPONSIVIDADE.md`
(PRs #26 a #29). Regras que valem para código novo:

- **`[class*="container"]` no `globals.css` pega classe de TERCEIRO.** A regra
  `.container, [class*="container"] { max-width: 100vw; overflow-x: hidden }`
  vive em `@layer base` e casa com qualquer classe que contenha a substring —
  pegou o `.pswp__container` do PhotoSwipe e **recortava o slide ativo**, que é
  transladado para fora da caixa do contêiner. Resultado: lightbox em branco ao
  navegar, com a `<img>` perfeitamente carregada. Biblioteca nova cujo CSS use
  "container" no nome da classe herda isso em silêncio.
- **Elemento com caixa correta que não aparece no `elementsFromPoint` do
  próprio centro é recorte de ancestral**, não falha de carregamento. Medir
  `complete`/`naturalWidth`/`opacity` não enxerga o problema; subir a árvore
  lendo `overflow` e `transform`, sim.
- **A grade da galeria é `grid` (ordem por LINHA), não `columns` (ordem por
  COLUNA).** Com colunas CSS a linha de cima mostrava os itens #1, #13, #25… —
  as artes mais recentes não ficavam em cima e o "próximo" do lightbox ia para
  o card de baixo. `items-start` é obrigatório: sem ele o item estica até a
  altura da linha e a `aspect-ratio` do card é ignorada, deformando a arte.
- **Não medir imagem baixando o original.** Um `new window.Image()` por card
  apontando para a arte original custava **38,22 MB e 54 downloads** numa carga
  da galeria. A proporção sai de graça do `onLoad` da `<Image>`, que já carrega
  a miniatura otimizada.
- **`data-pswp-*` sai do render, nunca de escrita imperativa concorrente.** O
  estado guarda a PROPORÇÃO; as dimensões vêm de `dimensoesParaLightbox()`.
  Gravar no estado o tamanho da MINIATURA fazia o re-render sobrescrever a
  correção e o lightbox abria a arte em 360px.
- **PhotoSwipe esconde as setas em tela de toque** e usa miniatura de
  placeholder só no primeiro slide. As duas coisas são revertidas em
  `src/hooks/use-photoswipe.css` e no filtro `placeholderSrc`. Ver
  `docs/photoswipe-lightbox.md`.

### Registro de mudanças recentes

`docs/SESSAO-2026-08-10-FASES-4-A-6.md` é o mais recente: crivo de aprovação,
QA por visão, referências de estilo em rodízio, a logo desenhada pelo modelo,
o menu do projeto com seletor de cliente e a bancada com acervo em modal. O
próximo passo combinado — cadência de postagem e dica de copy, evoluindo o que
o Claudinho fazia — está levantado em
`docs/PROXIMO-PASSO-CADENCIA-E-DICA-DE-COPY.md`.

`docs/SESSAO-2026-08-10-GALERIA-LIGHTBOX-E-RESPONSIVIDADE.md`:
lightbox que não navegava (três causas independentes), a galeria baixando a si
mesma em resolução cheia, e a responsividade no iPad e no celular.

`docs/SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md`: o
Studio passou a CRIAR arte por IA (não só melhorar), com bancada, carrossel
com visual coerente e referências por papel. O plano que originou o trabalho
está em `docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md`, com o placar das
fases. As regras duráveis estão na seção "Geração de arte por IA, bancada e
carrossel" mais abaixo.

`docs/SESSAO-2026-07-26-EDITOR-INSTAGRAM.md` detalha as 29 mudanças de julho/2026
em gradientes, vazamento entre páginas, fontes no export, integração do
Instagram, métricas, combinações tipográficas e histórico de migrations — com as
armadilhas descobertas em cada área.

`docs/SESSAO-2026-07-28-RENDER-AGENDADOS.md` fecha o arco: sombra que o
render nunca desenhou, invalidação automática da arte agendada ao editar
página/camada, e a troca de fonte com medição de caixa. Regras que ficaram:

- **O cron `render-stories` nunca revisita um post RENDERED.** Quem grava
  `Page.layers` em rota nova PRECISA chamar `invalidateScheduledRenders`
  (`src/lib/posts/invalidate-renders.ts`) — senão o post publica a arte
  antiga em silêncio. O PATCH de página só invalida em mudança visual REAL
  (o mesmo endpoint recebe thumbnail e autosave do PageSync).
- **A invalidação vale para RASCUNHO também** (desde 29/07/2026). A agenda
  mostra a arte do rascunho, então rascunho com arte velha mente igual a
  agendado — e a aprovação só manda renderizar quando o post está sem mídia,
  ou seja, publicaria a arte velha. `render-stories` renderiza DRAFT e
  SCHEDULED; `nextRenderAt: asc` mantém o agendado na frente.
- **`renderStatus: NOT_NEEDED` significa "a arte NÃO vem do render desta
  página"** — mídia trazida de fora (upload, Drive, import do Zernio). Arte que
  saiu de um render nasce RENDERED, mesmo já pronta na criação: era gravar
  NOT_NEEDED nela que congelava o post no PNG do momento em que foi criado,
  fora do alcance da invalidação. Vale para `agendarPost`
  (`src/lib/creatives/agendar.ts`) e para qualquer caminho novo.
- **`Page.thumbnail` nem sempre é publicável**: na criação é o PNG do render no
  Blob, mas o PageSync sobrescreve com um JPEG base64 de 150px assim que a
  página é aberta no editor. Quem for reusar o thumbnail como mídia precisa
  recusar `data:` e cair no render.
- **Mudou o código de render?** `scripts/rerender-agendados.ts` força o
  re-render do que já está RENDERED — só com o deploy no ar.
  `scripts/reparar-arte-congelada.ts` é o irmão para as linhas antigas gravadas
  como NOT_NEEDED (dry-run por padrão).
- **Fonte de projeto exige arquivo enviado** (`CustomFont` + blob): o
  `addGoogleFont` do editor carrega do CDN só no navegador, e o render cai em
  fallback. Arquivo TTF **estático** (napi-rs canvas não aplica eixo variável)
  e o peso pedido tem de existir no arquivo — faux-bold só existe no browser.
- **Trocar fonte muda a métrica**: medir a caixa com a fonte nova, senão o
  texto quebra e a linha extra é cortada pela altura.
- ~~O RenderEngine ainda ignora `letterSpacing`, fundo de texto, contorno,
  curved/blur e `richTextStyles`~~ — **desatualizado, corrigido em 03/08/2026**:
  todos esses já existem em `src/lib/render-engine.ts` (fundo :111, contorno
  :457, curvo :368, blur :408, rich-text via `flattenRichTextStyles`,
  letterSpacing :601). Sobra só o kerning (~1px). A linha contradizia a própria
  seção seguinte deste arquivo e já produziu diagnóstico falso.

`docs/SESSAO-2026-07-28-LETTERSPACING-AUTOEXPAND.md` (tarde do mesmo dia)
fecha as duas divergências de maior alcance da tabela e o Auto da caixa:

- **`letterSpacing` agora existe no render** — `ctx.letterSpacing` do napi-rs
  tem a mesma contagem do Konva (espaçamento após cada caractere, inclusive o
  último; medição, alinhamento e desenho de uma vez). Resta só o kerning, que
  o Konva descarta e o canvas mantém (~1px por par kernado).
- **Todo texto quebra linha no render**, com ou sem `textboxConfig` — o
  fallback antigo espremia os glifos via maxWidth do `fillText`. Nenhum
  `fillText` de texto usa mais maxWidth: palavra maior que a caixa transborda,
  como no editor.
- **O modo Auto re-mede quando o mundo muda sem mudar a camada**: fonte que
  termina de carregar (`fontsTick` via `document.fonts`, nas DUAS assinaturas
  — a de quebra e a de render/cache), altura alterada por fora (undo, alça do
  transformer) e `textTransform`/`fontStyle`. A trava por assinatura + o guard
  de |diff| < 1 são o que evita o loop de update — não remover nenhum dos dois.
- **A altura medida é arredondada para CIMA (`Math.ceil`), nunca `round`**: o
  nó da tela tem altura fixa e o Konva descarta a próxima linha INTEIRA quando
  ela não cabe por qualquer fração de pixel. Com `round`, toda altura cujo
  total de linhas tem decimal < 0,5 era gravada curta e a última linha sumia —
  em `lineHeight` 1.2 e 3 linhas isso pegava 12 de 29 tamanhos de fonte, daí o
  "some e volta a cada ajuste". O render server-side não trunca quando
  `autoExpand` está ligado, então o defeito era só do editor: a prévia mentia
  para menos.
- **Auto-height nativo do Konva foi avaliado e rejeitado** (§4 do doc): a
  altura fixa do nó na tela é o contrato visível com o render server-side, que
  corta pela altura gravada; height auto esconderia a dessincronia.

`docs/SESSAO-2026-07-29-MELHORIA-IA-CRIATIVOS.md` traz a melhoria com IA para a
agenda e corrige três defeitos do editor. Regras que ficaram:

- **Melhorar com IA vale para RASCUNHO e AGENDADO** (regra invertida em
  01/08/2026 pelo Ciro: a arte criada é o esboço e a melhoria é o acabamento
  da criação — ~100% das artes passam por ela). Publicado/publicando/falhou
  seguem recusados antes de cobrar crédito; a aplicação ao post é guardada por
  `status in [DRAFT, SCHEDULED]` no runner. `pedido` até 1200 chars (instrução
  vem da análise visual do chat via conferir-arte). `colocar-na-agenda` aceita
  só o `generationId` da melhorada (resolve o resultUrl sozinho, NOT_NEEDED).
- **A melhoria NUNCA reduz a quantidade de mídias do post.** O runner gravava
  `mediaUrls: [nova]`, o que em carrossel agendado apagava todos os outros
  slides — em silêncio e sem volta, porque a melhoria também marca
  `NOT_NEEDED` e tira o post do alcance do re-render. Hoje ele lê a lista,
  troca **só** a posição de `applyToPostMediaIndex` (default 0) e escreve com
  compare-and-swap em `mediaUrls`. A agenda manda o slide que está NA TELA;
  quem não informa índice (galeria, MCP) mexe no primeiro e preserva o resto.
- **Slide ≠ arte da Generation pula a conferência de texto**: os textos
  esperados são de UMA arte, e conferir o slide 3 contra os textos do slide 1
  reprovaria arte correta. A trava é estreita de propósito
  (`midias.length > 1 && midias[i] !== original.resultUrl`) — post de imagem
  única, inclusive re-renderizado pelo cron, continua sendo conferido.
- **Post melhorado vira `renderStatus: NOT_NEEDED`**, senão `render-stories` e
  `invalidateScheduledRenders` sobrescrevem a arte em minutos. O preço é que
  editar o template deixa de atualizar a arte daquele post.
- **`agendarPost` grava `SocialPost.generationId`** (explícito ou derivado por
  `resultUrl === mediaUrls[0]`). É o vínculo que habilita a melhoria; posts
  anteriores a 29/07 não têm e **não dá para recuperar** — as 4 causas estão no
  cabeçalho de `scripts/backfill-post-generation-id.ts`.
- **`PROCESSING` é o status do banco**; `PENDING`/`POSTING` só existem no canal
  SSE do export de vídeo. Componente que renderize criativo precisa tratar
  PROCESSING, senão cai num `<Image>` sem src e vira miniatura quebrada.
- **Nunca localizar o stage por `querySelector`/`Konva.stages`** — com o
  workspace contínuo há N stages montados e o primeiro do DOM não é o da página
  aberta. Use `getStageInstance()`. Foi o que quebrou o export de vídeo fora da
  página 1.
- **Lightbox pré-carrega vizinhos**: vídeo criado em `contentLoad` não pode ter
  `autoplay` — play/pause vão em `contentActivate`/`contentDeactivate`, senão a
  trilha toca ao abrir uma imagem.
- **No workspace contínuo o zoom redimensiona o slot DOM de cada página** (não
  há `transform: scale`). Toda mudança de zoom precisa repor o scroll por
  âncora relativa (página do centro + fração dentro dela) num `useLayoutEffect`
  e marcar `programmaticUntilRef` — senão o conteúdo desliza *e* o
  `handleScroll` troca a página ativa sozinho. Escalar `scrollTop` pela razão
  dos zooms não funciona: gap, cabeçalho e padding são fixos em px de tela.
  `animateZoom` não vale no modo `embedded` (quem escala ali é o React).
- **A direção de arte do aprimoramento é editável por projeto**
  (`Project.artImprovementPrompt`, aba Configurações). O padrão vive em
  `src/lib/ai/art-direction.ts` — módulo sem dependências, porque o card de
  configuração é client.
- **No padrão a FOTOGRAFIA é a protagonista** (~90% da composição) e o bloco de
  texto ocupa 15–20% da altura, nunca mais de 25%. O teto foi reinstaurado em
  30/07 depois de teste real: sem ele o modelo faz título desproporcional e
  sacrifica a foto. O impacto vem de peso, cor, contraste e posição — não de
  tamanho. **Não "libere" esse limite de novo sem repetir o teste.**
- **A identidade do cliente é injetada pelo SISTEMA, fora do bloco editável**
  (`buildBrandIdentitySection`): nome, tipografia por papel, paleta e, quando
  preenchidos, `brandStyleDescription` e `cuisineType`. É o que faz a mesma
  direção render peças diferentes por marca — e um prompt de projeto mal escrito
  não pode apagá-la. As fontes são o sinal confiável (os 11 projetos têm as
  três); `brandStyleDescription` só o Wine Vix tem, e `cuisineType` está vazio
  em todos.

`docs/SESSAO-2026-07-30-QUALIDADE-MELHORIA-E-FASE4.md` fecha a confiabilidade
da melhoria: verificação de texto, resolução nativa, linhagem e a Fase 4 de
limpeza. Regras que ficaram:

- **Todo texto conhecido entra no prompt como `[TEXTO EXATO — VERBATIM]`** —
  última seção do prompt, acima até do pedido do cliente — e a arte gerada é
  **conferida por visão** (gpt-4o-mini transcreve; comparação uppercase, sem
  acento, espaços colapsados, PONTUAÇÃO MANTIDA). Divergiu → regenera (2
  gerações no total); persistiu → Generation FAILED e **o post fica com a arte
  original**. Sem texto esperado (upload externo, export do editor) →
  `textCheck: 'skipped'`; visão fora do ar → skipped também, nunca derruba a
  melhoria. Auditoria em `fieldValues` (`textCheck`, `textCheckAttempts`).
- **O pipeline da melhoria vive em `src/lib/ai/creative-improvement-runner.ts`**,
  não na rota — a rota improve só valida e dispara `after()`. Teste E2E importa
  o runner e roda o caminho real sem sessão Clerk (protocolo: projeto 8,
  `publishType: REMINDER`, +7 dias, cleanup completo).
- **A melhoria gera em resolução NATIVA** (STORY 1088x1936, FEED 1088x1360,
  SQUARE 1088x1088 — múltiplos de 16, sempre ≥ saída final): o resize final é
  downscale, nunca upscale. O `FORMAT_TO_INPUT_SIZE` de `cost-estimates.ts` é
  **legado congelado** para linhas de uso antigas — não sincronizar com o
  `creative-improvement-format.ts`; linhas novas gravam `inputSize` nos details.
- **Dedução de créditos falhando NÃO desfaz melhoria pronta**: loga alto, grava
  `fieldValues.creditDeductionError` e a arte segue aplicada. Descartar arte
  verificada por soluço de cobrança é o pior dos dois erros.
- **Linhagem é coluna**: `Generation.sourceGenerationId` (sem FK de propósito —
  apagar a origem não arrasta a melhoria). A rota improve grava; as 500
  melhorias antigas foram backfilladas. É o que liga badge "✨ melhorada",
  antes/depois e "melhorar de novo" na galeria.
- **`Project.userId` é o id INTERNO do User, não o clerkId** — dedução de
  créditos e qualquer fluxo Clerk recebem `user_…`. Já existe User fantasma no
  banco criado por essa confusão; não criar outro.
- **Rotas legado `brand-style`/`design-system`/`art-templates`: remoção em dois
  tempos.** Hoje só logam `[deprecated]` por handler (o `generate-art` ainda lê
  o que escrevem); apagar de verdade só depois de 2+ semanas sem warn nos logs
  de produção, por decisão do Ciro. `TOM_DE_VOZ` segue no enum, marcado como
  legado na página /knowledge.
- **CI mínimo no ar** (`.github/workflows/ci.yml`): typecheck + lint em
  push/PR. Lint com ERRO agora quebra o CI — a main foi zerada nesta sessão.

### Geração de arte por IA, bancada e carrossel (09/08/2026)

O Studio passou a **criar** arte por IA, não só melhorar. Motor em
`src/lib/ai/creative-generation-{service,runner}.ts`, tela em
`/projects/[id]/bancada`, e no chat pelas tools `gerar-imagem`,
`criar-carrossel`, `confirmar-estilo-carrossel`, `ver-carrossel`. O arco
inteiro está em `docs/SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md`.

Regras que valem para código novo:

- **A logo NUNCA é INVENTADA — mas desde 10/08/2026 ela é DESENHADA pelo
  modelo** (`logoMode: 'modelo'`, o default). A regra anterior era "nunca
  desenhada pela IA", e nasceu do caso certo pelo motivo errado: em 09/08 o
  gpt-image inventou a logomarca do By Rock porque **nunca recebeu o arquivo**.
  Recebendo, ele reproduz — teste real de 10/08 no mesmo By Rock: palheta,
  "By Rock" manuscrito e STEAKHOUSE conferem, e a marca integra melhor à
  composição do que a colagem.
  O que sustenta a troca é a rede: `conferirLogo` (`creative-qa.ts`) compara
  por visão o que o modelo desenhou com o arquivo oficial e **regera** quando
  diverge ou quando aparece mais de uma. Marca ausente NÃO reprova — o prompt
  autoriza deixar o canto vazio, e arte sem marca é editável.
  **Nunca desligue essa conferência sem voltar o default para `compor`.**
- **`logoMode: 'compor'` (colar o PNG com sharp) continua existindo** e é o
  caminho de fidelidade garantida — use em marca de wordmark fino, onde o
  modelo tende a errar letra. Mas saiba do efeito colateral medido: **o modelo
  desenha a logo mesmo com o "DO NOT DRAW"**, então a peça sai com DUAS (a
  dele, no canto reservado, e a colada). Enquanto isso não for resolvido no
  prompt, `compor` exige olhar a peça.
- **`Project.logoUrl` está NULL nos 10 projetos** — a logo mora na tabela
  `Logo` (aba Assets). `loadBrandContext` já cai nela; consumidor novo de
  identidade usa o loader, nunca um `select` próprio.
- **Referências têm PAPEL** (`subject`, `anchor-ambient`, `anchor-dish`,
  `style`, `series-guide`, `brand-card`, `logo`) e o preâmbulo que declara cada
  papel é escrito pelo BACKEND — nunca deixado a cargo do LLM. Tetos: 1
  subject, 3 âncoras, 2 style; refs demais causam deriva visual.
- **A ÂNCORA MANDA, o prompt só descreve a ação.** Descrever arquitetura por
  texto faz o modelo inventar um lugar genérico. Ambiente se ancora em foto
  real (anchor sheet em `ProjectAnchorImage`, injetada sozinha na trilha
  `imagem`).
- **Duas trilhas que nunca se misturam**: `imagem` (cena SEM texto, prompt de
  12 parágrafos físicos em inglês, validado contra 17 buzzwords e contra os
  termos de carne crua que disparam o filtro) e `arte` (peça com a copy
  verbatim, conferida por visão).
- **Capa de carrossel é foto PURA** — o serviço recusa copy no slide 1. O
  primeiro slide com texto é o GUIA, e os demais só são gerados depois que
  alguém CONFIRMA o look dele. A coerência vem da arte do guia como referência
  + LOOK SPINE + o guia decodificado por visão
  (`carousel-guide-decoder.ts`); sem o último, a cor de destaque varia entre
  slides.
- **Retentativa por divergência de texto usa o tempo MEDIDO** da geração
  anterior (×1,2), não um teto fixo. O teto de 45s fazia a retentativa abortar
  no meio quando a geração levava 131s. Vale nos dois runners.
- **Toda geração grava `{prompt, refs, params, veredito}`** em
  `Generation.fieldValues`, no sucesso e na falha — é o registro que permite
  aprender com cada run.
- **Migration continua sendo escrita à mão + `db:deploy`** (as duas desta
  sessão foram assim).

### Crivo, QA e coerência de carrossel (10/08/2026)

Fecha as Fases 4 a 6 do plano. Detalhe em
`docs/SESSAO-2026-08-10-FASES-4-A-6.md`; o desligamento do Claudinho está
documentado (e NÃO executado) em `docs/DESLIGAMENTO-CLAUDINHO.md`.

- 🔴 **`DATABASE_URL=… npx prisma …` NÃO aponta para o banco que você escreveu:
  o Prisma CLI ignora a variável inline e usa o `.env`, que é PRODUÇÃO.**
  Provado com uma URL inválida de propósito — o CLI reportou o endpoint de
  produção mesmo assim. É pior que a armadilha do `dotenv-cli` já registrada,
  porque a incantação parece explícita. **Sempre `npx tsx scripts/dev-db.ts …`**,
  que compara o compute e recusa produção.
- **O manual do designer vence o card auto-gerado.** `Project.brandManualUrl`
  (upload) tem prioridade absoluta em `getBrandReferenceCard` — é a prática que
  o insta-automatico já tinha, e a diferença de qualidade é grande. Sem manual,
  cai no card desenhado pelo Studio.
- **`BrandDNA.approvalChecklist` NUNCA entra em prompt de geração.** É a única
  seção do DNA que não é instrução para o modelo: são perguntas binárias que
  gente lê antes de agendar. Mora em coluna própria, e não dentro de
  `contentRules`, justamente porque `contentRules` vai verbatim para o prompt.
  A polaridade é MISTA (há pergunta que reprova no "sim" e outra no "não"):
  não construa veredito automático em cima dela.
- **Proporção se confere com assert, nunca com resize.** A finalização usa
  `resize(fit: 'cover')`, que CORTA em silêncio quando a proporção diverge — e
  o corte come a faixa do texto. `checarProporcao` (`creative-qa.ts`) roda antes,
  com tolerância de 2%; fora dela, regera em vez de cortar.
- **QA por visão reprova execução, nunca gosto**: só legibilidade e texto
  cortado na borda. Reprovou na última tentativa, a peça é ENTREGUE com a
  ressalva no `fieldValues` — o texto está certo, e descartar arte
  legível-com-ressalva é pior do que entregar anotada. Visão fora do ar nunca
  derruba a peça.
- 🔴 **QA que reprova PRECISA guardar o candidato.** O `continue` para retentar
  aposta num orçamento que pode ser recusado logo depois — e aí não sobra nada:
  crédito gasto, arte pronta, FAILED. Quatro artes do Espeto morreram assim em
  10/08. Sempre `melhorCandidato`, entregue com a ressalva quando a retentativa
  não acontece.
- **A retentativa quase nunca acontece no formato story**: geração ~110-128s
  contra `maxDuration = 300` da rota, e duas não cabem numa invocação. A margem
  é ADITIVA (o que a checagem consome, ~20s), não proporcional — mas isso só
  recupera casos de borda. `MAX_GENERATION_ATTEMPTS = 2` é 1 na prática até
  alguém retentar em OUTRA invocação.
- **O teto de texto da GERAÇÃO é de ÁREA (~1/5 do quadro), o da MELHORIA é de
  ALTURA (15–20%, nunca >25%)** — e a divergência é de propósito. Um teto de
  altura proíbe a coluna alta e estreita, que é o layout que o modelo escolhe
  quando o espaço livre da foto é vertical (as artes aprovadas do Espeto fazem
  isso). `art-direction.ts` é protegido: não alinhe os dois sem repetir o teste
  de 29-30/07.
- **O prompt precisa DAR AUTONOMIA, não só limites.** Regra 10 de
  `buildArtePrompt`: o modelo lê a foto e põe o texto onde ela é calma, variando
  a diagramação entre peças. Sem essa licença, dez regras viram receita e todas
  as peças saem iguais. Pela mesma razão a logo não tem canto cravado na peça
  avulsa (só no slide irmão de carrossel, onde o LOOK SPINE manda repetir).
- **Separador de lista (`·`, `|`) é DIAGRAMAÇÃO, não conteúdo**: na comparação
  de texto ele vira ESPAÇO. Virando ponto, a arte que desenhava o mesmo
  conteúdo quebrando a linha nunca casava com o esperado.
- **No slide IRMÃO do carrossel, o guia vence o DNA e vem ANTES dele.**
  `visualStyle` e `composition` saem do prompt (o guia já é a marca aplicada e
  aprovada; descrevê-la em prosa é concorrência), e o LOOK SPINE sobe. Medido:
  o arranjo anterior punha o LOOK SPINE aos 85% de um prompt de 13 mil chars,
  atrás de 8,5 mil de DNA. O elemento gráfico do guia entra como ordem curta no
  TOPO do LOOK SPINE — citar não bastava, ele já era citado 3 vezes.
- **Descrição de fotografia do DNA não autoriza relumiar a foto.** O prompt
  injeta `visualStyle` inteiro, e DNA que fala em "luz dramática" convivia com
  "não reluza". A ressalva explícita existe no bloco de fidelidade — não a
  remova achando que é redundante.
- 🔴 **`sharp(x).extract(r).stats()` IGNORA o `extract`** e devolve a
  estatística da imagem INTEIRA. Materialize o recorte com `.toBuffer()` antes
  de medir. Foi isso que fez a escolha de canto do `logo-compositor` medir os
  quatro cantos IGUAIS desde que existe — a logo ia sempre para o canto
  reservado, e o mecanismo de fugir do bloco de copy nunca funcionou. Vale para
  qualquer medição por região.
- 🔴 **`bg-zinc-400` não gera CSS neste repo** — computa `rgba(0,0,0,0)`,
  medido no navegador em 10/08/2026. Cor de fundo fora do conjunto já usado
  vai em estilo INLINE. Some à família de classes mortas (`sm:w-28`,
  `w-[7rem]`, `lg:max-w-sm`, `sm:ml-auto`).
- **Selo de marca precisa de fundo CINZA MÉDIO**: as logos dos clientes ocupam
  os dois extremos de luminância (Quintal e TERO em 255, Bacana 252, contra
  Wine Vix 54 e By Rock 89). Fundo claro engole as brancas, escuro engole as
  pretas — e as intermediárias são coloridas, então quem as separa é a matiz.
- **A logo do projeto é a ASSINATURA, não o ícone** (alinhado com o `LOGO_MAP`
  do insta-automatico em 10/08). Como metade delas é branca (Quintal, TERO e
  Bacana com luminância 255/255/252), o compositor passou a exigir **contraste**
  entre a logo e o canto, além de calma: canto claro e liso é o mais calmo do
  quadro e o pior lugar para logo branca. `isProjectLogo` é singular na prática
  (`orderBy isProjectLogo desc, take 1`) — marcar duas vira sorteio por
  `createdAt`.
- **Artes aprovadas viram referência de estilo, em RODÍZIO** (`styleRefAt` /
  `styleRefUsedAt` na Generation + `style-references.ts`). Uma por geração,
  sempre a menos usada, e nunca em carrossel (lá quem manda é o slide-guia).
  Referência fixa faz toda peça sair igual — o rodízio é o mecanismo, não um
  detalhe. O uso só é registrado DEPOIS de a arte existir.
- 🔴 **Em Postgres, `ORDER BY … ASC` é NULLS LAST.** No rodízio isso punha a
  referência JÁ USADA (timestamp) antes das nunca usadas (NULL), e a mesma arte
  saía cinco vezes seguidas. Sempre `{ sort: 'asc', nulls: 'first' }` explícito
  quando "nunca aconteceu" tem de vir primeiro — vale para qualquer fila por
  "menos usado/mais antigo" no repo.
- **Módulo consumido pela bancada não pode importar o Prisma.**
  `parseApprovalChecklist` vive em `src/lib/brand/approval-checklist.ts`, sem
  dependências, porque `brand-context.ts` puxa `@/lib/db` e a bancada é client
  (mesma razão de `art-direction.ts`).
- **`virar-regra` ACRESCENTA, `atualizar-dna` SUBSTITUI.** Correção aprovada na
  conversa vira linha do DNA com data e motivo, sob o cabeçalho `Regras
  aprendidas na prática:`. Só grava com `confirmado` — devolve `antes`/`depois`
  primeiro.
- **O dev server do painel Browser roda no diretório do projeto original,
  mesmo em sessão de worktree** (confirmado por `lsof -d cwd`). Mudança feita
  em worktree não é verificável por ele.

### Imagem: caixa é janela, não elástico (04/08/2026)

- **`keepRatio` do Konva só vale nas alças dos CANTOS.** As do meio mudam um
  eixo só, e por isso arrastar uma lateral esticava a foto. Hoje elas passam por
  `cropForResizedBox` (`src/lib/image-fit.ts`): a escala e o enquadramento são
  congelados no `transformstart` e a caixa passa a revelar/esconder imagem, com
  a borda OPOSTA à alça parada. O resultado é gravado em `style.crop`, que o
  render server-side já lê com precedência — editor e arte não divergem.
- **Sem `objectFit: 'cover'` e sem `style.crop` o KonvaImage ESTICA** (é o
  default de quase toda camada). A primeira lateral arrastada tira a foto da
  deformação, porque a escala escolhida é a menor dos dois eixos.
- **No modo contínuo o stage tem o tamanho EXATO da página**: o que a camada
  tem para fora dela não é desenhado nem clicável. Era isso que sumia com as
  alças do recorte in-canvas — elas agora ficam presas à janela visível
  (medida do stage, não de `design.canvas`, porque no modo clássico o stage é
  do tamanho do container). Overlay novo que desenhe fora da página precisa da
  mesma trava.
- **Enquanto o recorte está aberto o stage embutido ganha 35% de folga** e
  transborda o slot da coluna por `position: absolute` — é o que deixa ver a
  foto inteira. O slot NÃO muda de tamanho de propósito: crescê-lo empurraria
  as páginas vizinhas e a coluna saltaria. Foto maior que a folga continua
  coberta pelas alças presas à borda.
- **Evento de transform nasce no nó que o transformer segura**: com máscara ou
  flip quem é transformado é o Group, e o `onTransform` estava no KonvaImage de
  dentro — eventos do Konva sobem, não descem, então nunca disparava.

### DNA da Marca (30/07/2026)

A identidade vive na tabela `BrandDNA` (1:1 com Project; tom de voz, regras,
composição, estilo visual, direção fotográfica) e é editada na aba **Marca** do
projeto (ex-Assets — o value da tab continua `assets` para os links antigos).
Regras que valem para código novo:

- **DNA ≠ base de conhecimento.** DNA entra INCONDICIONALMENTE em todo prompt
  de geração; a base é buscada por relevância (minScore/topK/teto de tokens) e
  por isso NUNCA deve guardar identidade — `TOM_DE_VOZ` na base não chegava ao
  gerador de copy da UI, e é por isso que a aba Marca oferece importação dessas
  entradas para o DNA.
- **Identidade se lê pelo loader único** `loadBrandContext`
  (`src/lib/brand/brand-context.ts`) — nada de `select` próprio de campos de
  marca em consumidor novo. Consomem hoje: improve, chat, generate-ai-text
  (wizard) e o bloco `brand.dna` do MCP `escolher-modelo`.
  `dna.visualStyle` tem prioridade sobre o legado `brandStyleDescription`.
- **`toneOfVoice` NÃO entra em prompt de imagem** (os textos são reproduzidos
  verbatim; instrução de tom só confunde o modelo). Entra em copy e chat.
- **A prévia da aba Marca usa `buildPromptSections`** — a MESMA função do
  improve. Mudou a montagem do prompt, a prévia acompanha sozinha; nunca
  duplicar o texto da prévia à mão.
- **Escrita do DNA é serviço** (`updateBrandDNA`), não código de rota — e o
  MCP já embrulha o mesmo serviço: `consultar-dna` devolve o BrandContext com
  `secoesVazias` (convite para completar) e `atualizar-dna` grava por seção
  (SUBSTITUI, não acrescenta; `null` limpa). A descrição de
  `criar-entrada-base` redireciona identidade para o DNA — a categoria
  TOM_DE_VOZ da base é legado.
- No formatador da base (`search.ts`), entrada que estoura o teto de tokens é
  **pulada** (`continue`) — o `return`/`break` antigo fazia um CARDAPIO longo
  eliminar as categorias seguintes inteiras.

`docs/SESSAO-2026-07-31-MCP-AUTONOMIA-ARTES.md` fecha o ciclo de autonomia do
conector MCP: 6 tools novas (melhorar-arte, ver-melhoria, conferir-arte,
ajustar-arte, marcar-como-modelo, listar-modelos), `startImprovement` extraído
da rota improve (casca fina), `renderPageAndRegister` compartilhado. Regras:

- **`extractExpectedTexts` lê 4 formas** (`slotValues`, `texts`, `textos`,
  `textosLivres`) — antes a arte-livre não era lida e a melhoria de arte do MCP
  saía sem verificação de texto. Forma nova de gravar textos em Generation
  precisa entrar lá.
- **`Project.userId` é o id INTERNO do User** (confirmado nos dados). O
  `resolverDono` do tools.ts resolve por `User.id` primeiro e devolve interno +
  clerk; passar esse cuid por `getUserFromClerkId` já criou 2 Users fantasma.
- **`ajustar-arte` recusa página-modelo** e chama `invalidateScheduledRenders`
  ao gravar `Page.layers` — as duas regras da casa valem para qualquer tool nova.
- **Dedupe de melhoria**: `sourceGenerationId` + PROCESSING + janela de 10 min
  no serviço — retry do modelo no chat não pode virar segunda cobrança.
- `/api/mcp` tem `maxDuration = 300` por causa do `after()` da melhoria.
- **Gestão de agenda (01/08, total 28 tools)**: `ver-agenda` devolve situação
  em PT/hora BRT/capa (nunca reintroduzir enum+UTC cru — é o que fazia o chat
  vazar jargão); `sugerir-posts` lê cadência do histórico (não há campo de
  cadência configurada — decisão de 01/08); `postar-agora` = agendado
  now+3min com gate de confirmação; `editar-post` SÓ rascunho (aprovado →
  voltar-para-rascunho primeiro, senão editaria publicação armada sem
  re-aprovação).

`docs/SESSAO-2026-08-01-AUTOCORRECAO-GEOMETRICA.md` fecha o texto que vazava
da caixa no export (By Rock, template 140): validação geométrica + escada de
autocorreção pré-render nos três geradores de arte. Regras:

- **Todo gerador de arte passa por `aplicarAutofixOuFalhar`** (text-autofix)
  DEPOIS do reflow e ANTES de persistir — as camadas corrigidas são as
  persistidas (editor = export). Gerador novo precisa entrar no mesmo funil.
- **Colisão se mede pelos GLIFOS** (padding 6px descontado, tolerância 4px),
  nunca pelas caixas gravadas — templates têm caixas sobrepostas por design
  que funcionam com 1 linha (o próprio Layout 2 do 140 é assim).
- **A escada nunca toca conteúdo/quebra/fonte/cor/posição** e nunca trunca:
  fontSize (piso 80% e 24px@1080) → lineHeight (piso 0.92) → expandir caixa →
  `TEXTO_NAO_CABE` (422) com diagnóstico. Bloqueio devolve camadas ORIGINAIS.
- **`reflowLayersAfterFill` cresce caixa sem olhar vizinho** — é esperado; a
  colisão resultante é problema do autofix, não do reflow.
- Flags `textAutofixEnabled` em Project e Template (default true): desligada
  cria como antes + `avisos[]`. Relatório `autocorrecao` sempre na resposta e
  no fieldValues; log `[text-autofix]` é a telemetria de template apertado.
- `fieldValues.pageId` em toda Generation nova — é como conferir-arte acha as
  camadas para diagnosticar `sobreposicao` (vs "texto faltando").
- **`fontWeight` que não é múltiplo de 100 quebra o parser do napi-rs** (250,
  310…, vindos do usWeightClass real gravado pela normalização): texto sai
  GIGANTE no macOS e INVISÍVEL na Vercel. `buildFontString` saneia via
  `cssFontWeight()` — os dados ficam com o peso real do arquivo; camada nova
  de código que monte font string por fora precisa do mesmo saneamento.
- Colisão usa TINTA com baseline `middle` (igual ao renderLines) e tolerância
  `max(4px, 0.18×fontSize)`; overflow vertical é PARIDADE COM O TRUNCAMENTO
  (linhas cortadas), não diferença de fórmula — caixa menor que a fórmula com
  a mesma contagem de linhas é design válido, não defeito.
- **Camada de imagem NUNCA guarda thumbnailLink do Drive** (lh3 é assinado e
  expira em horas) — sempre a cópia permanente `drive-cache/{fileId}-s1920.jpg`
  via `resolveImageUrl`. O legado (77 páginas) foi reapontado em 01/08 por
  `scripts/reparar-lh3-legado.ts`; em 39 delas a foto original foi recuperada
  (fileId reconstruído de Generation/slotValues/doc da semana, bytes vindos do
  Drive, de `uploads/` do Blob ou do arquivo do fotógrafo). Nas outras 38 a
  foto tinha sido excluída do Drive na curadoria de julho **sem cópia em lugar
  nenhum** — as 15 visivelmente quebradas ganharam fotos novas do acervo em
  02/08 e as 23 cobertas por outra imagem seguem com a camada morta por baixo.
  **Apagar foto do acervo mata páginas que apontavam para ela**: antes de
  expurgar, varra `Page.layers` e `Generation.fieldValues`.

`docs/SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md` cobre o dia seguinte: padrão do
texto novo, setas do teclado, alinhamento pela margem de segurança, âncora
vertical com crescimento da caixa e a remoção do negrito. Três armadilhas de lá
valem para qualquer mexida no editor:

- **Camada de texto é cacheada como bitmap** quando `fontSize > 24`. Campo novo
  que afete o desenho precisa entrar na assinatura de invalidação em
  `konva-editable-text.tsx`, senão o controle simplesmente não funciona.
- **Alinhamento vive em duas telas** (painel de propriedades e
  `alignment-toolbar`); mudou a regra, mude nas duas.
- **UI do app NUNCA é montada em `createRoot` avulso.** Componente dentro da
  árvore do Konva não pode renderizar DOM; a saída é publicar um pedido num
  store (`rich-text-edit-store.ts`) e deixar um host na árvore DOM abrir o
  modal (`RichTextEditorHost`, montado no `EditorCanvas`). O modal de Rich Text
  era criado com `createRoot(document.body…)` e ficava SEM providers: abrir o
  seletor de cor chamava `useBrandColors` → `useQuery` sem QueryClient →
  exceção sem error boundary → o React derrubava aquela raiz inteira. O modal
  sumia e não reabria, porque o `open` continuava `true` na camada.
- **Modal aberto sobre o canvas precisa desarmar os atalhos globais**: o
  `keydown` do `EditorCanvas` só ignorava input/textarea/contenteditable, então
  Backspace com uma palavra selecionada no editor de Rich Text apagava a
  CAMADA. Hoje ele sai cedo quando `getRichTextEditRequest()` existe.
- **O crescimento automático da caixa é do editor**, não do `render-engine`: um
  `slotValues` mais longo que o texto do template é cortado na altura gravada.
- **A entrelinha mora em dois campos** e o render server-side prefere
  `textboxConfig.autoWrap.lineHeight` sobre `style.lineHeight`. Escreva sempre
  nos dois — escrever em um só faz o editor e a arte agendada divergirem, e o
  download do editor (`stage.toDataURL()`, que lê o `style`) **não** revela isso.

### Arte pronta trazida de fora (upload local, 03/08/2026)

`src/lib/creatives/arte-enviada.ts` (`importarArte`) põe na galeria de
Criativos um arquivo que já está pronto — export de skill, Photoshop, Canva,
arte que o cliente mandou. A superfície é a tool **`upload-creative`** do MCP
**local** (`scripts/mcp-server.ts`), que recebe CAMINHOS de arquivo (ou uma
pasta) e lê os bytes do disco.

- **Não renderiza nada**: os bytes enviados viram o `resultUrl` da Generation
  tal e qual. Re-renderizar só reencodaria e arriscaria diferença.
- Mesmo assim a arte nasce como **Page editável** (uma camada de imagem em tela
  cheia, no template coletor `Arte Enviada[ — Feed| — Quadrado]`, criado no
  primeiro uso). É o que dá editor, `ajustar-arte` e `conferir-arte` de graça.
- **Agendar por `pageId` deixa a arte sujeita a re-render** (o post nasce
  RENDERED e `invalidateScheduledRenders` o devolve à fila quando a página
  muda). Quem quer o arquivo intocado agenda por `generationId`.
- **O formato sai da PROPORÇÃO** (`classificarFormato`), não do
  `inferTemplateType` do persist — aquele chama de STORY tudo mais alto que
  largo, e o feed 4:5 caía no coletor de story. Corte em 1,5, entre 1,25 e 1,78.
- Teto de 25MB e 20 arquivos por chamada; PNG/JPG/WebP (o formato real é lido
  pelo sharp, não pela extensão). Arquivo com falha **não derruba a leva** — a
  resposta traz `artes[]` e `falhas[]`.
- **O conector remoto (`/api/mcp`) não tem como fazer isso**: os argumentos de
  tool são texto do modelo e o servidor está na Vercel, sem acesso ao disco de
  quem conversa. Pelo celular/claude.ai o caminho continua sendo `pedir-foto`.

### Escopo de aprendizado do post (F0.2, 10/08/2026)

`SocialPost.learningScope` (`ROTINA` default | `CAMPANHA` | `PONTUAL`) decide o
que o sistema pode aprender com cada post. Vocabulário em
`src/lib/posts/learning-scope.ts` (módulo SEM Prisma — o compositor da bancada
é client).

- **Capturar sempre, marcar por item, filtrar na agregação.** Nunca introduza
  um interruptor global de captura: esquecido desligado perde sinal, que é
  IRREVERSÍVEL; esquecido ligado contamina. E uma leva normal mistura os três
  tipos, então a marca é do ITEM. O "modo aprendizado" da bancada é açúcar de
  UI (`escopoPadrao`, que **de propósito fica fora do `partialize`** do store:
  padrão persistido é o interruptor esquecido ligado com outro nome).
- **Quem filtra é o consumidor.** `sugerirPosts` tira PONTUAL do HISTÓRICO e
  mantém no cálculo de slot ocupado — post pontual ocupa o horário do mesmo
  jeito. CAMPANHA ainda conta na cadência; separar o sub-perfil é da fase de
  destilação.
- **`campaignId` não tem foreign key**, mesmo precedente de
  `Generation.sourceGenerationId`: arquivar a campanha não pode arrastar o
  post. Consequência: todo leitor é defensivo — campanha inexistente ou sem
  `expiresAt` produz silêncio, nunca erro (`campanha-vigencia.ts`).
- **Campanha vencida AVISA, nunca veta** (`aprovar-rascunhos`, `ver-agenda`,
  e a rota de aprovação): a campanha pode ter sido prorrogada e o prazo da
  base pode estar velho. Recusar publicação por metadado é pior que publicar.
- **`decididoPor` é o `User.id` INTERNO (cuid), NUNCA o clerkId** — e falhar
  ao resolvê-lo não pode derrubar o agendamento (é auditoria): `quemDecidiu`
  no MCP engole o erro, e a rota HTTP busca o User só para LEITURA, sem criar
  linha (criar é justamente como nascem os Users fantasma).
- `origem`/`sugestaoId` existem na coluna e no serviço, mas ainda não são
  preenchidos pela bancada: quem define "sugestão" é a fase de captura, e
  rotular "aceitou o horário sugerido" como `sugerido-aceito` contaminaria o
  corpus com uma semântica que não é a dela.

### Página nasce CONTEÚDO; modelo é promoção deliberada (10/08/2026)

`Page.isTemplate = true` significa "layout reutilizável do cliente" e é o que
enche o pool que `prepareCreative` (`arte-rapida.ts`, escolhe `candidates[0]`),
`sugerirPosts` (modeloDoDia) e `listar-modelos` consultam. O default do schema
é `false` — quem grava `true` está cadastrando acervo, não salvando uma arte.

- **A tool `create-page` do MCP local marcava MODELO por default** (`?? true`),
  e a skill `create-template-pages` a usa para montar as peças da semana: toda
  arte datada virava candidata permanente. Era a origem estrutural da poluição
  que forçou a despromoção de 22 modelos em 10/08. Hoje o default é `false` e a
  promoção é explícita (`isTemplate: true`) ou posterior (`marcar-como-modelo`).
- **Quem cria Page com `isTemplate: true` de propósito**: `create-template` do
  MCP local (existe para cadastrar layout temático) e
  `POST /api/projects/[id]/modelos` (o "criar modelo" da UI). Todo o resto —
  editor, duplicar, `persist.ts`, `arte-enviada.ts`, `create-from-template`,
  `gerar-criativo/finalize` — cria conteúdo, explícita ou implicitamente.
- **Nada exige que a página seja modelo para virar post**: `get-template-pages`
  não filtra por `isTemplate` e `create-post`/`render-story` não olham o campo.
  Quem filtra é só o acervo (`plan-week`, `prepare-creative`, `sugerir-posts`,
  `model-pages`, `template-pages`), que é justamente o que se quer limpo.
- **Modelo não pode ser apagado pela UI** (`DELETE` de página devolve 403
  `template_page`): conteúdo marcado por engano fica preso até ser despromovido.
- Curadoria do que já existe é outra frente, com aprovação item a item:
  `scripts/inventario-uso-modelos.ts` — **despromover, nunca excluir**.

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations
