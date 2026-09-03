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

`docs/PLANO-2026-09-02-EDITOR-COMO-USINA.md` (02/09/2026) é o mais recente:
o editor como usina — compositor, assinatura, fila `COMPOR`, via `compor` e o
sinal de geometria; regras na seção homônima acima.

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
  ~~A polaridade é MISTA: não construa veredito automático em cima dela.~~ —
  **superado em 11/08/2026**, ver "Crivo conferido pelo sistema" abaixo. O
  crivo agora É avaliado automaticamente (como PERGUNTA sobre uma peça pronta,
  nunca como instrução de geração — esta parte da regra continua valendo).
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

### Crivo conferido pelo sistema (11/08/2026)

O crivo de aprovação da bancada deixou de ser uma lista de caixas para marcar.
**O sistema confere o que consegue verificar sozinho, mostrando a evidência, e
o humano responde só o que exige olho** (decisão do Ciro, 10/08). Serviço em
`src/lib/brand/crivo-avaliacao.ts`, contrato puro em `approval-checklist.ts`,
rota `POST /api/projects/[id]/crivo/avaliar`, tela em `bancada-crivo.tsx`.

O que havia antes: o quadradinho significava "eu li", não "conforme"; o único
caminho para frente era marcar TUDO (14 perguntas no Wine Vix, 35 no Quintal);
e o aviso de que a polaridade era mista vivia numa frase que ninguém carrega na
cabeça. Virou pedágio que se paga sem ler — o oposto do que o desenho queria.

Regras que valem para código novo:

- **A avaliação NÃO recebe a imagem.** Ela responde por DADO: dia e hora em
  BRT, a copy, a base de conhecimento, o DNA, as fontes cadastradas. Quem olha
  pixel é o QA de visão (`creative-qa.ts`), que responde outra pergunta.
- **Reprova AVISA, nunca veta** — mesma regra da conferência de arte. A tela
  oferece "Voltar e ajustar" e "Agendar mesmo assim". A base pode estar velha,
  e travar publicação por metadado é pior que publicar com aviso.
- **Falha degrada para o crivo manual, nunca bloqueia.** `crivoManual()` é
  função pura justamente para a UI montar o piso sozinha quando nem a rota
  responde.
- 🔴 **Saída de modelo se valida por RECONCILIAÇÃO, não por parse.** Todo campo
  do schema é `.optional()`: com eles obrigatórios, o zod recusava a resposta
  INTEIRA quando o modelo omitia um só — e ele omite. Medido no By Rock: 15
  vereditos corretos descartados por falta de um campo, três tentativas
  seguidas caindo no crivo manual. O rigor mora em `reconciliarVeredito`, que
  trata cada campo como suspeito e devolve ao olho humano o que vier incompleto.
- 🔴 **O índice que o modelo declara NÃO é confiável.** No By Rock ele devolveu
  a lista inteira DESLOCADA em uma posição — respondia a pergunta N e carimbava
  N-1, pondo um ✅ verde em "Existe mais de uma oferta?" com evidência sobre
  CORES. Por isso cada resposta carrega um ECO (as primeiras palavras da
  pergunta, copiadas) e é amarrada pelo TEXTO; eco que não casa, ou casa com
  várias, é descartado. Vale para qualquer lista longa devolvida por LLM.
- 🔴 **"Você não viu a imagem" não sobrevive como regra de prompt.** Com outras
  tarefas na mesma chamada, o modelo respondeu "a arte contém emoji, o que é
  proibido" sobre uma arte que nunca recebeu, com evidência plausível. A trava
  é do CÓDIGO: o modelo declara `dependeDeVerAImagem` ANTES do veredito, e
  pergunta visual é forçada a `preciso-de-olho` com a justificativa inventada
  descartada junto.
- 🔴 **Inversão de polaridade por NEGAÇÃO é recusada.** Pedida a reescrita para
  "marcar = conforme", o modelo devolveu "A gramática NÃO está impecável?" e "A
  foto não acontece dentro do salão real?" — frases que fazem a pessoa marcar o
  oposto do que quis dizer, e que numa lista de 15 passam batido. Inversão de
  verdade reescreve em positivo ("Tem emoji?" → "A arte está sem emoji?").
  `inversaoAceitavel()` derruba junto algumas negativas válidas, e tudo bem: o
  fallback é a pergunta do DNA, que é segura porque a seção já define que
  marcar significa "está conforme". **Manter o texto do DNA é o default;
  inverter é o caso explícito.**
- **A polaridade oscilou três vezes durante a implementação** (não inverte
  nada → inverte tudo errado → nega tudo). Antes de mexer no prompt dessa
  parte, rode contra Wine Vix (11, quase tudo conforme-no-sim) **e** By Rock
  (7, cheio de reprova-no-sim): um projeto só não mostra a regressão.
- **`fieldValues.crivo` é gravado por MERGE**, nunca substituição — é o
  registro atômico da run, e telemetria não derruba fluxo (erro vira log).
- **Perguntas quebradas na importação se consertam por
  `scripts/corrigir-crivo-importado.ts`** (dry-run por padrão, `updateBrandDNA`,
  troca declarada uma a uma pelo texto exato). Escopo estreito de propósito:
  caminho de pasta vazado do `DNA.md` e frase truncada. Pergunta comprida ou
  estranha NÃO é defeito — é o crivo daquela marca.

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
- ~~`origem`/`sugestaoId` existem na coluna e no serviço, mas ainda não são
  preenchidos pela bancada~~ — **superado em 11/08/2026**: a fase de captura
  chegou, e quem preenche os dois é a rota `/agendar` (e `colocar-na-agenda`),
  com a `origem` saindo da COMPARAÇÃO de horários, nunca do rótulo que a
  superfície mandou. Ver "Captura de sinais: emissão e desfecho nas
  superfícies".

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

### Foto de cena é INSUMO; a galeria mostra PEÇA (11/08/2026)

A trilha `imagem` produz fotografia para virar arte depois; a trilha `arte`
produz a peça pronta. As duas gravam `Generation`, e por isso as fotos de cena
poluíam a galeria de Criativos e caíam na mesma pasta das artes no Drive.

- **O destino no Drive é escolhido pela TRILHA**: `imagem` vai para
  `Fotos/IA_LAGOSTA` (a pasta de acervo do cliente, criada na primeira vez por
  `ensureAIImagesFolder`); `arte` continua em `ARTES LAGOSTA`. O método
  `uploadAIGeneratedImage` já existia desde sempre e **nunca havia sido
  chamado** — nasceu para isso e ficou morto.
- **A Generation continua existindo para a trilha `imagem`** — é ela que faz
  acompanhar, conferir e melhorar funcionarem. O que muda é que a galeria não
  a LISTA. Não tente resolver isso deixando de criar a linha.
- 🔴 **Filtro Json do Prisma DESCARTA a linha que não tem o campo.**
  `NOT { fieldValues: { path: ['track'], equals: 'imagem' } }` devolveu **18 de
  491** no projeto 7 — escondia 473 artes legítimas, porque 473 linhas
  (template, arte antiga) simplesmente não têm `track`. O filtro correto é SQL
  com `COALESCE("fieldValues"->>'track', '') <> 'imagem'`, que trata ausente
  como visível. Vale para qualquer filtro por chave de `fieldValues`: a
  ausência é o caso COMUM, não a exceção.
- O `notIn` por id no caminho sem weekday é a solução de hoje porque as fotos
  de cena são poucas. Quando o acervo crescer, o caminho é **coluna espelho**
  de `track`, precedente de `Generation.sourcePageId`.

### A âncora de ambiente é referência de LUGAR, nunca de ENQUADRAMENTO (11/08/2026)

O preâmbulo de `anchor-ambient` mandava *"reproduce the architecture, furniture,
materials and light fixtures EXACTLY as they appear"*. O modelo leu isso como
ordem de recriar a FOTOGRAFIA: saíam cenas em grande-angular com o teto no
quadro, a comida da própria referência incorporada à composição, e o prato novo
encaixado por cima — montagem, não fotografia.

- **Separe as duas coisas explicitamente no preâmbulo.** Preservar o LUGAR
  (arquitetura, mobília, material do tampo, luz, cores) não é copiar a CÂMERA
  (altura, ângulo, focal, composição). Sem os dois limites escritos, o modelo
  funde os conceitos.
- 🔴 **Diga que a comida da foto de ambiente NÃO é conteúdo.** Ela aparece na
  referência e o modelo a trata como parte da cena a reproduzir. Todo prato da
  composição final tem de vir da referência de prato.
- **Material estrutural não se reinterpreta**: tampo de pedra ou laminado
  virava madeira. A regra é explícita no preâmbulo porque o modelo tende à
  madeira em cena de restaurante.
- **Física de apoio é o que denuncia montagem**: base do prato inteira em
  contato com o tampo, elipse coerente com a perspectiva, sombra de contato, e
  a mesa na MESMA altura e plano das outras do salão. Sem isso o prato flutua
  ou a mesa sobe acima da linha do ambiente.
- **Humanizar é permitido e ajuda** (outros pratos do menu, mãos com talheres,
  clientes desfocados ao fundo em ocupação moderada) — nunca casa lotada, nunca
  rosto em foco.

### Fila durável de geração de arte (F0.3, 10/08/2026)

A geração e a melhoria de arte por IA **não rodam mais no `after()` da
invocação que as pediu**. Cada pedido vira uma linha em `GenerationJob`
(`src/lib/ai/generation-queue.ts`) e é executado por
`/api/cron/generation-jobs`, de minuto em minuto, 3 por varredura.

- **O motivo**: uma arte chega a ~290s contra o `maxDuration = 300` da rota, e
  o MCP dividia esse teto entre vários `after()` — `confirmar-estilo-carrossel`
  dispara até 6, e o batch JSON-RPC resolve tools com `Promise.all`. Estourado
  o teto, a Generation ficava **PROCESSING para sempre**, sem recuperação.
  "after() encadeado" foi avaliado e **riscado**: `after()` morre com a
  invocação, que é exatamente o cenário de falha.
- **Tabela separada da Generation de propósito**: ali mora COMO o trabalho é
  executado (payload do runner, tentativas, arrendamento); na Generation, O QUE
  o usuário vê. `fieldValues` é Json sem índice — varrer por path seria scan, e
  ele já é o registro de auditoria que galeria, MCP e QA leem. Sem FK, mesmo
  precedente de `sourceGenerationId`.
- **Os portões de tentativa vivem na QUERY de quem varre** (`proximosJobs`:
  `attempts < maxAttempts` e `nextAttemptAt <= agora`); a reserva olha só o
  status, como em `renderPostArt`. Chamador novo que esqueça os portões queima
  as tentativas em minutos.
- **`maxAttempts` é 2 porque uma tentativa é uma chamada PAGA do modelo**
  (~US$0,10-0,19) — é o mesmo teto que `MAX_GENERATION_ATTEMPTS` já prometia.
  Durabilidade não pode virar cobrança extra.
- **A segunda geração NUNCA roda na mesma invocação.** Proporção divergente
  (geração) e texto divergente (melhoria) chamam `pedirNovaTentativa`, que
  devolve o job à fila; a Generation continua PROCESSING e quem acompanha nem
  percebe a troca de invocação. Sem `queueJobId` (teste E2E, script) vale o
  laço antigo.
- **As ROTAS HTTP enfileiram E disparam na hora** (`dispararJobAgora` dentro de
  `after()`): cada POST da bancada é UM job na SUA invocação, e a tela desiste
  de acompanhar em 8 minutos — esperar a varredura só adicionaria espera. **O
  MCP só enfileira**, porque lá uma invocação carrega várias tools.
- 🔴 **A varredura de órfãs IGNORA Generation ligada a `VideoProcessingJob`.**
  O export de vídeo cria a Generation PROCESSING e a entrega a OUTRA fila, cujo
  cron processa **um** job a cada 2 minutos — passar de 10 minutos em
  PROCESSING ali é normal, e marcá-la FAILED mataria um vídeo saudável.
  Produtor novo de Generation PROCESSING de vida longa precisa da mesma
  exceção (ou de um job na fila).
- Generation PROCESSING **sem job** e com mais de 10 minutos vira FAILED com
  motivo legível: são as órfãs anteriores à fila (havia 1 em produção em
  10/08). O `fieldValues` anterior é **preservado** — ele é o registro atômico
  da run.

### Captura de sinais de uso (F1 — núcleo, 11/08/2026)

O aprendizado por uso escreve numa tabela só: **`LearningSignal`**. Uma linha é
um fato — "isto foi proposto, aquilo foi escolhido" — e as duas metades
convivem nela. Serviço em `src/lib/aprendizado/` (`captura.ts`,
`diff-copy.ts`, `vocabulario.ts`, `uso-de-modelo.ts`).

- **Uma tabela, não duas.** A **decisão SEM sugestão** (escolha absoluta de
  copy/foto/horário) é o caso COMUM nas primeiras semanas — com tabelas
  separadas ela seria uma linha de desfecho com FK nula, o caso especial torto
  que o desenho tinha de evitar. Aqui é linha inteira com `sugeridoEm: null` e
  `desfecho: 'escolha-propria'`, o que a mantém fora do denominador do KPI sem
  filtro nenhum. O precedente do `GenerationJob` (tabela à parte) NÃO se
  aplica: lá separou-se COMO o trabalho roda de O QUE o usuário vê.
- **A sugestão é gravada quando é EMITIDA, não quando é aceita.** Sem isso a
  proposta ignorada some e a taxa de aceitação vira 100% por construção.
- **Falha de captura nunca derruba o fluxo principal** — toda função de
  `captura.ts` engole o próprio erro e devolve valor neutro (`null`,
  `'erro'`), o mesmo contrato de `sendWhatsAppText`. Registrar aprendizado não
  pode impedir alguém de agendar um post.
- **O desfecho não fecha no agendamento.** `desfechoVenceOAnterior` deixa
  evidência mais forte sobrescrever (`aceita-como-veio` → `editada`/`trocada`/
  `descartada`), nunca o contrário; o mesmo desfecho duas vezes é no-op. É o
  que impede a taxa de aceitação de inflar quando alguém edita depois.
- 🔴 **`Page.layers` só se lê por `src/lib/posts/page-layers.ts`.** O
  `parseLayers` de `arte-rapida.ts` decodifica UM nível e devolve `[]` **em
  silêncio** na string dupla-codificada — num diff de copy isso vira "o usuário
  não editou nada", que é o pior defeito possível aqui. `lerCamadas` distingue
  "página sem texto" de "não consegui ler", `diffDeCopy` carrega `ilegivel` e
  `desfechoPeloDiff` devolve `null` nesse caso. **Ilegível nunca vira
  aceitação.** `normalizeLayersString` e `textosDaPagina` mudaram de casa para
  esse módulo (puro, sem Prisma) e seguem re-exportados de onde estavam.
- **`normalizeForComparison` mudou para `src/lib/ai/text-comparison.ts`**, pelo
  mesmo motivo: o diff usa as MESMAS regras de "o mesmo texto" da conferência
  de arte, e o módulo antigo importa Prisma e o SDK de IA. Módulo que precise
  ser testável sem banco não pode tocar `@/lib/db` — ele **lança no import**
  quando falta `DATABASE_URL`.
- **`tipo`, `desfecho` e `superficie` são TEXT**, não enum do Postgres:
  precedente de `SocialPost.origem` e razão operacional — `migrate deploy` roda
  cada migration numa transação, e `ALTER TYPE … ADD VALUE` não pode ser usado
  no mesmo bloco em que o tipo é criado. A validação mora em `vocabulario.ts`.
- **Nenhum vínculo tem FK** (`postId`, `generationId`, `pageId`, `campaignId`):
  apagar o post, a arte, a página ou a campanha não pode arrastar o registro do
  que aconteceu. Mesmo precedente de `sourceGenerationId`.
- **Espelhos colunares**: `Page.usedCount`/`lastUsedAt` e
  `Generation.sourcePageId` existem porque `fieldValues` é Json SEM índice —
  minerar "qual modelo este cliente mais usa" exigia varredura por path.
  Incremento por `registrarUsoDeModelo`. Ordenar por "menos usado" exige
  `MENOS_USADO_PRIMEIRO`: em Postgres `ASC` é NULLS LAST, e sem `nulls:
  'first'` o já-usado vem antes do nunca-usado.

### Captura na via de TEMPLATES (F1 — superfícies, 11/08/2026)

A via de template é a MAIS usada e não gasta API de imagem. Estes são os sete
pontos onde a decisão passa e onde ela agora fica registrada:

| Ponto | Grava |
|---|---|
| `prepareCreative` | sugestão `modelo` com TODOS os candidatos oferecidos |
| `createArteRapida` | fecha a sugestão; `Page.usedCount`; `Generation.sourcePageId` |
| `ajustarArte` | decisão `copy` com o diff antes→depois (a correção explícita) |
| PATCH da página | decisão `copy`, superfície `editor`, quando o TEXTO muda |
| `agendarPost` | `slot` + `copy` (diff proposta × final) + `SocialPost.slotValues` |
| `processarAprovacao` | fecha a sugestão de slot; garante a linha de slot |
| `gerar-criativo/finalize` | `source`, `sourcePageId` colunar e contador de uso |

Regras que valem para código novo:

- **`prepareCreative` é o ÚNICO ponto que enxerga os modelos REJEITADOS.**
  Daí para a frente só circula `sourcePageId`. Registrar a lista na EMISSÃO é
  o que impede a taxa de aceitação de valer 100% por construção — e a linha só
  nasce com 2+ candidatos, porque com um só não houve preferência nenhuma.
- **O desfecho do modelo é atribuído por RECONCILIAÇÃO, não por id.** Nenhuma
  superfície devolve o `sugestaoId` de `prepareCreative` para
  `createArteRapida` (o MCP local reimplementa o handler; as skills passam só
  `sourcePageId`), então exigir o id deixaria toda proposta pendente. A
  atribuição é conservadora: mesma janela de 6h, mesmo projeto, e a página
  usada tem de estar entre os candidatos. `sinal-de-modelo.ts`.
- 🔴 **A chave de slot é COMPARTILHADA entre `agendarPost` e
  `processarAprovacao`** (`slot:post:<id>`, em `sinal-de-agendamento.ts`). O
  caminho normal é criar rascunho e depois aprovar: com chaves diferentes, o
  mesmo horário do mesmo post viraria duas linhas e a cadência de quem usa a
  agenda direito valeria o dobro. A aprovação continua sendo quem FECHA a
  sugestão de slot — isso é outra coisa, e acontece mesmo quando a linha já
  existe.
- **A captura do editor tem balde de 10 minutos por página.** O autosave bate
  a cada pausa da digitação; sem o balde, escrever uma headline vira uma dezena
  de linhas quase iguais. Fica a PRIMEIRA do balde, que é a mais valiosa —
  o lado "antes" dela ainda é o texto que a IA gerou. Só entra quando o TEXTO
  muda: `layersChanged` dispara também em arrastar caixa.
- 🔴 **`fieldValues.sourcePageId` é AMBÍGUO**: em `source: 'ajuste-arte'` ele
  aponta para a própria cópia ajustada, não para um modelo. A coluna
  `Generation.sourcePageId` nasceu SEM esse vício e é preenchida só quando
  aponta para modelo de verdade (`createArteRapida` e o `finalize`; o ajuste
  não a preenche). Leitor novo usa a coluna primeiro.
- 🔴 **O `finalize` grava nos DOIS livros-caixa na mesma requisição** —
  `Generation` e `AICreativeGeneration` —, então a união ingênua conta cada
  criação da UI duas vezes. `lerUsosDeModelo`
  (`src/lib/aprendizado/historico-de-artes.ts`) unifica a LEITURA e deduplica
  por janela de 60s; a linha da UI vence, sem perder o `generationId` do outro
  lado. **Uma linha fundida não pode fundir de novo**, senão uma leva de três
  artes do mesmo modelo colapsa numa só (defeito real, pego por teste).
  `scripts/inventario-uso-modelos.ts` já consome o helper. Nenhum dado
  histórico foi migrado — o que se padronizou é o `source` daqui para a frente.
- **Registro nasce DEPOIS de a arte existir**: contar uso de uma arte que
  falhou ao renderizar mentiria sobre a preferência do cliente. Mesma razão de
  o rodízio de referência de estilo só marcar uso depois do sucesso.
- **`decididoPor` é o `User.id` INTERNO, e a rota HTTP só LÊ** (`findUnique`
  por `clerkId`, sem criar): criar User a partir de código de auditoria é como
  nascem os Users fantasma.
### Captura de sinais: emissão e desfecho nas superfícies (F1, 11/08/2026)

Quem EMITE proposta agora registra (`sugerirPosts` → `slot`, `buscarNoAcervo` →
`foto`), e o que a bancada decide chega ao servidor por
`POST /api/projects/[id]/aprendizado/desfecho`.

- 🔴 **Toda emissão precisa de `chave` de idempotência.** `sugerirPosts` é
  chamado pela bancada (que refaz a consulta ao voltar para a aba), pela rota
  `/slots` e pela tool do MCP, e devolve **36 slots** com `dias: 14` (medido no
  projeto 3). Sem chave, uma semana de uso normal gravaria milhares de linhas
  para as mesmas dezenas de propostas e o denominador do KPI viraria ficção. A
  unidade é a PROPOSTA, não a chamada: slot é `(projeto, horário)`; busca no
  acervo é `(projeto, critérios, DIA)` — `limit` fica de fora, porque
  "Carregar mais" mostra mais da mesma lista. Helpers em
  `src/lib/aprendizado/chaves.ts`; `sugestoesJaEmitidas` faz a leva reemitida
  custar **um SELECT e zero escritas**.
- **A `versao` entra na chave.** Mudou a heurística (peso por recência, corte
  de campanha — tudo isso é F2), a safra nova não pode herdar o desfecho de uma
  proposta que era outra.
- 🔴 **O desfecho é CALCULADO no servidor, nunca declarado pela superfície.**
  `avaliarSlotSugerido` compara o horário proposto com o agendado
  (tolerância de 1 min) e decide `aceita-como-veio`/`sugerido-aceito` ou
  `editada`/`sugerido-editado` — a mesma comparação dá o desfecho do sinal e a
  `origem` gravada no post. Quem agenda (a bancada, ou o modelo no chat) tem
  todo incentivo a relatar acerto, e o card **deixa mudar data e hora** depois
  de o item ter nascido de um slot: aceitar o rótulo da tela contaria edição
  como aceitação. Sem os dois lados comparáveis, o sinal fica PENDENTE — nunca
  vira aceitação por omissão.
- **Uma foto: o que se mede é se levaram o TOPO.** A busca no acervo registra
  UM sinal por lista ranqueada (não um por foto — vinte linhas por busca
  inflariam o denominador com fotos que ninguém olhou), e o picker fecha o
  desfecho na PRIMEIRA foto escolhida daquela busca. Fechar a cada clique faria
  a segunda foto de um carrossel sobrescrever o "levou o topo" da primeira
  (`trocada` vence `aceita-como-veio`), virando toda seleção múltipla em recusa.
- **A copy da bancada é `escolha-propria`, e é de propósito.** Não há dica de
  copy ainda; registrar o que a pessoa escreveu no momento do GERAR é o corpus
  das primeiras semanas — sem ele o aprendizado só começa a existir quando o
  sistema já estiver sugerindo texto, tarde demais para saber o que ele deveria
  sugerir. Chave por `item.id` (a copy do card não é editável depois de montada,
  e "tentar de novo" não pode virar segundo sinal).
- **A rota de desfecho é fire-and-forget e responde 200 mesmo quando o núcleo
  recusa o sinal** (`{ ok: false, resultado }`). 4xx só para pedido malformado:
  quem chama ignora a resposta, e um erro ali não pode aparecer na bancada.
  `useAprendizado` (`src/hooks/use-aprendizado.ts`) não é hook de dados — sem
  TanStack Query, sem toast, `void` + `catch`.
- **Gesto que vira sinal na bancada**: tirar o item da fila → `descartada`;
  digitar horário com um slot pré-selecionado → `editada` (o seletor já vem
  marcado, então digitar é recusa); agendar → o servidor decide; gerar → a copy.
  **"Limpar finalizados" NÃO registra descarte**: item em `erro` falhou por
  problema do sistema, e culpar a sugestão por isso seria mentira.
- **A expiração pega carona no cron diário `archive-expired-knowledge`**, antes
  do early return de "nada expirado" — mesma natureza de trabalho (o que venceu,
  vence), e cron novo custaria uma entrada no `vercel.json` para um `updateMany`
  que costuma tocar zero linha.
- **`origem`/`sugestaoId` do `SocialPost` passaram a ser preenchidos** pela rota
  `/agendar` e pela tool `colocar-na-agenda` (que ganhou o campo). A nota da
  F0.2 dizendo que ninguém preenche está superada — o que a proibia era não
  existir ainda quem definisse "sugestão".

### Feedback de arte: "Gostei" / "Preciso melhorar" (11/08/2026)

O par que faltava do registro atômico. Toda geração já grava
`{prompt, refs, params}` em `Generation.fieldValues` — COMO a arte nasceu —, e
este sinal diz se ela prestou, amarrado ao prompt exato que a produziu. Desde
que os vereditos automáticos foram desligados (crivo por atraso, QA por falso
negativo), é a única medida de qualidade que não é palpite. Serviço em
`src/lib/aprendizado/feedback-de-arte.ts`, rota
`POST|GET /api/generations/[id]/feedback`, UI em
`src/components/creatives/feedback-de-arte.tsx`, relatório pela tool
`ver-feedback-das-artes`.

- **Um clique resolve, nada bloqueia, nada atrasa, o texto é opcional.** São as
  quatro regras do desenho, e todas vieram do crivo: porta no fim do fluxo vira
  pedágio, e pedágio se paga sem ler. "Gostei" grava e não abre nada; "preciso
  melhorar" JÁ grava o veredito no clique e só então abre a caixa de texto —
  quem fechar sem escrever deixou o sinal mais importante.
- **A revisão mora no SERVIÇO, não no núcleo da captura.**
  `registrarDecisaoSemSugestao` faz `upsert` com `update: {}` (proposta que
  existe não é reescrita), o que ignoraria a segunda opinião. Aqui a última
  ação explícita vence, por compare-and-set no `updatedAt` — uma linha por
  arte, `chave = arte-feedback:gen:<generationId>`, `revisoes` contando as
  reescritas.
- **É decisão SEM sugestão** (`tipo: 'arte'`, `desfecho: 'escolha-propria'`): o
  sistema não propôs "esta arte está boa". Fica fora do denominador da taxa de
  aceitação sem precisar de filtro.
- **O espelho em `Generation.fieldValues.feedback` é MERGE verificado** (padrão
  do `fieldValues.crivo`) e é conveniência de leitura — a verdade é o
  `LearningSignal`. Falhar ali é log.
- **Só existe com `generationId`**: arte sem Generation não tem prompt atrás, e
  feedback sem prompt não ensina nada.
- 🔴 **O PhotoSwipe escuta `keydown` no DOCUMENT e não olha quem tem foco.**
  Seta ← → trocaria de arte no meio da frase digitada (e a troca zera o campo,
  porque o estado é por arte); Esc fecharia o lightbox junto. A barra flutuante
  para a propagação do teclado. Vale para qualquer campo de texto sobre o
  lightbox.
- **A barra do lightbox é IRMÃ, não filha do `.pswp`**: portal para o
  `document.body` com `zIndex: 100001` em estilo INLINE (o
  `--pswp-root-z-index` do pacote é 100000, e classe arbitrária de Tailwind já
  se provou não gerar CSS aqui). Entrar por `uiRegister` custaria os providers
  do app e ainda esbarraria na regra `[class*="container"]` do `globals.css`.
- **`usePhotoSwipe` ganhou `onSlideAtivo(elemento)`**, lido por REF e fora das
  dependências do efeito: função nova a cada render do chamador destruiria e
  recriaria o lightbox na cara de quem está olhando. Qual arte está aberta sai
  do `data-generation-id` do próprio card, nunca de um índice na lista — a
  lista se refiltra por baixo do lightbox aberto.
- **A prévia da bancada resolve o `generationId` pela FILA** (a store guarda
  `generationId` e `projectId` por item e por slide), porque ela recebe URLs e
  não ids. URL que não é da fila simplesmente não mostra o rodapé.

### Reconciliação diária do acervo (11/08/2026)

`/api/cron/reconciliar-catalogos` (05:00 UTC = 02:00 BRT) mantém o
`_image-catalog.json` de cada cliente igual ao que existe no Drive: tira a
entrada cuja foto foi apagada na curadoria (sugestão com miniatura quebrada — o
TERO acumulou 214) e cataloga a foto que o fotógrafo subiu (invisível para a
busca por tema até então). Serviço em
`src/lib/creatives/reconciliar-catalogo.ts`; o contrato puro (diff, teto,
relógio, rotação) em `src/lib/creatives/reconciliacao.ts`.

- **É um DIFF DE IDS, sem janela de `createdTime`.** Foi a janela de meses do
  `analyze-drive-images.ts` que deixou 501+56 fotos antigas fora do catálogo — e
  a foto nova encontrada no Bacana em 11/08 tinha 8 meses. Sem janela a operação
  é idempotente e o acervo atrasado converge em poucas rodadas.
- **Catálogo inexistente ou VAZIO pula o projeto.** Criar do zero é decisão
  manual: a primeira análise de um acervo inteiro são milhares de chamadas pagas
  de visão, e isso não pode ser disparado por um cron da madrugada. Catálogo
  vazio é o mesmo caso com outra roupa (a análise falhou inteira contra um
  modelo aposentado em 10/08).
- 🔴 **Poda grande demais é tratada como varredura quebrada, não como
  curadoria**: varredura vazia com catálogo cheio, ou mais de 50% das entradas
  órfãs, e a rodada não grava NADA. O catálogo no Drive é a única cópia e não há
  quem confira de madrugada — credencial, permissão ou pasta reapontada
  apagariam o acervo inteiro em silêncio.
- 🔴 **Varredura recursiva do Drive vai em LOTE de pais** (`'a' in parents or
  'b' in parents …`, `listChildrenOfFolders`). Medido no acervo real: uma
  consulta por pasta custa 324 chamadas e 78s no By Rock (1.015 fotos); em lotes
  de 20, 20 chamadas e 6,3s, resultado idêntico. Os 10 clientes inteiros levam
  ~64s — é o que faz a rodada caber numa invocação. **`listFiles` tem
  `pageSize: 50` FIXO**; quem lista acervo por lá sem paginar trunca em silêncio.
- **Foto que a visão RECUSA analisar entra no catálogo mesmo assim**, com a
  descrição que dá para fazer sem vê-la (a pasta) e `analiseBloqueada: true`.
  Aconteceu na primeira rodada real: a foto nova do Bacana estava em
  "Fotos - Clientes" e o Gemini devolveu `PROHIBITED_CONTENT`. Deixá-la fora
  faria o diff redescobri-la TODA madrugada — uma chamada paga por dia, para
  sempre, e um `erros: 1` permanente, que é como se ensina a equipe a ignorar o
  resumo do cron.
- **Orçamento de tempo: 240s dos 300s de `maxDuration`.** A rodada para de PEGAR
  trabalho aos 240s; a folga de 60s existe porque pode haver até 4 análises em
  voo e ainda falta gravar o catálogo — análise paga descartada é o pior
  desfecho. Quem ficou de fora sai no JSON e o cron do dia seguinte continua.
- **A ordem dos projetos ROTACIONA por dia.** Ordem fixa + relógio que corta faz
  o primeiro projeto ser reconciliado sempre e o último talvez nunca — starvation
  silenciosa, que é o defeito que este cron existe para resolver. É stateless
  (não há coluna de "última reconciliação" e a frente não abriu migration).
- **Teto de 120 fotos novas por projeto por rodada**, concorrência 4. Modelo em
  `GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'` — `gemini-2.0-flash` foi
  APOSENTADO e devolve 404 embora siga aparecendo no ListModels.
- **`writeFileAsJson` cria o stream DENTRO do retry**: `withRetry` reexecuta a
  closure, e um `Readable` já consumido subiria vazio na segunda tentativa —
  catálogo zerado sem erro nenhum.
### Destilação: pilares, campanhas retroativas e cadência v2 (F2, 11/08/2026)

A F2 transforma o registro bruto da F1 em coisas que a GERAÇÃO pode usar. O
que orienta o desenho é a lição de 10-11/08, quando o Ciro desligou o retry de
qualidade, a revisão visual e o crivo: **verificação que atrasa, erra ou
bloqueia treina o usuário a ignorá-la — qualidade entra na geração, não em
portões.** Por isso a saída da destilação é um bloco de prompt
(`perfilParaPrompt`), não mais uma tela para aprovar.

- **Taxonomia FECHADA por projeto** (`ContentPillar`, aba Marca): 5–8 pilares
  propostos por LLM a partir do histórico do PRÓPRIO cliente e aprovados por
  gente. Tema em texto livre não deduplica — "happy hour" e "drinks" viravam
  baldes diferentes. Tabela e não Json no BrandDNA porque o `slug` é chave de
  junção (`SocialPost.pilar`), a lista é editada item a item e a aprovação é
  por linha.
- 🔴 **`salvarPilares` SUBSTITUI a lista inteira**: pilar que não vier no payload
  é APAGADO, não preservado. Chamar com uma lista parcial perde os outros em
  silêncio — e, se algum post já estiver classificado no que sumiu,
  `SocialPost.pilar` fica apontando para slug inexistente (sem FK, então o banco
  não reclama). Antes de fundir ou remover pilar, conte os posts classificados
  nele. Medido em 11/08/2026 ao consolidar o By Rock de 8 para 6.
- **`proporPilares` ESCREVE** — grava as novidades como `aprovado: false`,
  `origem: 'llm'`, de propósito, para a proposta sobreviver a um refresh sem
  nunca virar taxonomia em uso. `taxonomiaAprovada` ignora não-aprovado, então
  propor não muda comportamento nenhum. Ela lê no máximo
  `MAX_TEXTOS_NA_PROPOSTA = 140` textos: é amostra, não censo.
- **Aprovar a taxonomia já basta para a proposta da semana sair COM tema**, sem
  classificar o histórico: `distribuirPilares` cai em peso uniforme e usa a
  ordem que o humano aprovou. A classificação é o que enche o
  `perfilParaPrompt` — e `classificarHistorico` retorna cedo enquanto a
  taxonomia aprovada estiver vazia.
- 🔴 **`outro` e `sem-texto` são baldes DIFERENTES, e a distinção não é
  preciosismo.** Medido em produção: só **10% a 26%** das publicações de cada
  cliente têm texto legível no banco (Wine Vix: 26 de 176 em 8 semanas) — o
  resto é story cuja copy existe apenas dentro do PNG, montado fora do Studio.
  Se "não deu para ler" caísse em `outro`, `outro` seria o maior pilar de todo
  cliente e a linha de base da detecção de campanha viraria ficção.
- 🔴 **`SocialPost.slotValues` está preenchido com o JSON `null` em ~3.800
  linhas.** `where "slotValues" is not null` conta todas elas (444 no Wine Vix)
  e o Prisma devolve `null` mesmo assim. Para contar de verdade:
  `"slotValues"::text <> 'null'`. Foi por isso que uma primeira medição de
  cobertura de texto quase saiu 10× otimista.
- **A classificação é constrangida no CÓDIGO, não no prompt**: `casarPilar`
  (rótulo que não existe na taxonomia vira `outro`, sem aproximação por
  semelhança) e `comPisoDeConfianca` (abaixo de 0,6 vira `outro`). Pedir isso
  ao modelo não é trava — ele responde com confiança alta para agradar.
- 🔴 **Empate de ECO entre textos IDÊNTICOS não é ambiguidade.** A reconciliação
  por eco (herdada do crivo) descartava os DOIS candidatos quando a mesma copy
  aparecia duas vezes no histórico — e isso custou **8 de 25** classificações
  num lote real do Wine Vix. Hoje, se os textos completos são iguais, o primeiro
  livre leva; o descarte continua valendo para textos diferentes que só
  compartilham o começo. Post não classificado volta a ser tentado na próxima
  passada (a idempotência olha `pilarVersao`), então rodar duas vezes aumenta a
  cobertura.
- 🔴 **Na detecção de campanha, `GAP_MAXIMO_DIAS` precisa ser MENOR que 7.** Com
  8, a rotina semanal do cliente virava UM aglomerado de 8 peças em 56 dias, sem
  nada "fora" para servir de linha de base — passava por campanha e teria tirado
  a rotina verdadeira da cadência. Campanha publica mais junto que uma vez por
  semana; é isso que a separa do hábito. O piso de densidade (0,4 peça/dia)
  cobre o caso de linha de base zero.
- **A campanha retroativa vira entrada CAMPANHAS `ARCHIVED` e SEM indexação** —
  e por isso NÃO passa por `criarEntradaBase`, que grava ACTIVE e indexa. Uma
  campanha encerrada indexada voltaria a alimentar copy, que é o defeito que a
  F0.1 veio corrigir. Confirmar marca `learningScope: CAMPANHA` junto com o
  `campaignId`: só o vínculo deixaria o post ensinando rotina.
- **A distribuição de PILARES também decai por recência** (11/08/2026,
  `src/lib/aprendizado/distribuicao-de-pilares.ts`, módulo PURO que reusa
  `pesoPorRecencia` de `cadencia.ts`). Até então o mesmo perfil tinha o *quando*
  pesado por recência e o *sobre o quê* contado com um `groupBy` chapado de 180
  dias. Medido no By Rock: **"Datas e Eventos" caía de 30% para 11%** (era o
  pilar nº 1, sustentado por Restaurant Week, Dia dos Pais e Carnaval — datas
  que já passaram) e **"Shows e Música ao Vivo" subia de 7% para 22%**, que é o
  que o cliente faz agora. Sem isso o sistema propõe Carnaval em agosto.
  ⚠️ O preço do peso é que amostra recente e pequena é amplificada (aqueles 22%
  vêm de 8 posts): `DistribuicaoDePilar.total` continua sendo a contagem CRUA
  justamente para quem lê saber quando não confiar.
- 🔴 **Pesar por recência, NUNCA cortar por idade.** Medido em 11/08: um corte
  em 40 dias deixaria cada cliente com 15 a 56 posts de texto — o Bacana com 15
  espalhados por 6 pilares, ele e o Wine Vix de volta ao cold start. Cortar
  troca dado velho por dado nenhum. E o receio de "treinar com cardápio e preço
  velhos" não se resolve por idade: preço, horário, data e promoção **já** não
  têm caminho até um prompt (três portas em `perfil.ts` + o lastro na base da
  dica de copy). O que a idade contamina é a MISTURA DE ASSUNTOS, e é isso que
  o decaimento corrige.
- **A cobertura do corpus é o KPI da migração para a bancada**
  (`scripts/cobertura-de-aprendizado.ts`, somente leitura). Medido em 11/08:
  **15% em 180 dias, mas 30% nos últimos 40** — e a fatia de arte feita no
  Studio sobe de 49% para 70% na mesma janela. A rota `/api/external/posts`
  aceita só `mediaUrls` e `caption`, então peça montada fora entra sem copy e
  vira `sem-texto`. O aprendizado vale exatamente o quanto do trabalho acontece
  aqui dentro.
- **Cadência v2** (`src/lib/posts/cadencia.ts`, módulo PURO): peso por recência
  (meia-vida 21 dias), histórico só com **POSTED**, campanha encerrada fora, e a
  regra única **"confirma, nunca cria"** para as duas evidências fracas — post
  de campanha em curso e post nascido de sugestão aceita sem edição (0,3 cada).
  Nenhuma das duas CRIA horário típico; as duas CONFIRMAM um que a rotina já
  sustenta. `postsPorSemana` passou a ser sobre semanas COM atividade.
- 🔴 **O decaimento é ancorado na ÚLTIMA ATIVIDADE do cliente, não no relógio.**
  Com a referência no relógio, o Espeto Gaúcho caía de 16 horários típicos para
  3 e a Bacana de 20 para 3 — não porque a rotina mudou, mas porque pararam de
  publicar por algumas semanas. O sistema emudeceria justamente com o cliente
  que precisa voltar a postar. Recência é comparação DENTRO do histórico, não
  relógio de validade.
- 🔴 **"Novidade" se mede por OCORRÊNCIA, não por fração de peso.** Com
  meia-vida de 21 dias os últimos 14 concentram a maior parte do peso até numa
  rotina de cinco semanas — pela fração, uma rotina consolidada era anunciada
  ao usuário como "novidade". Hoje `picoRecente` é "não existe nenhuma
  ocorrência anterior à janela".
- **`LIMIAR_DE_PESO = 1,75` foi calibrado contra os 9 clientes reais**,
  comparando horários típicos com o volume semanal de cada um (tabela no
  módulo). A v1 propunha à Bacana 20 horários para quem publica 11 vezes por
  semana. Não mexa no número sem repetir a medição — `calcularCadencia` aceita
  `limiarDePeso` justamente para isso, e `scripts/validar-cadencia-f2.ts` roda a
  comparação antes/depois contra produção **sem escrever nada** (ele não chama
  `sugerirPosts`, que REGISTRA cada slot emitido como `LearningSignal`).
- **Blindagem do perfil, em três portas**: na escrita `sanitizarParaPerfil`
  recusa qualquer texto com preço/horário/data/promoção (recusa, não mascara);
  na leitura `perfilParaPrompt` só olha alterações de causa `estilo`; e ainda
  passa uma conferência final linha a linha. Alteração de causa `fato` vira o
  alerta "a base pode estar desatualizada" e **não tem caminho até um prompt** —
  senão o perfil vira fonte clandestina do preço que só pode vir da base.
- **`api.delete` do cliente da casa não manda corpo** — por isso o "desfazer" da
  campanha entrou como `acao: 'desfazer'` no POST, em vez de virar uma segunda
  rota para a mesma decisão.

### Plano de conteúdo: a fila que chat e bancada dividem (F3, 11/08/2026)

`PlanoDeConteudo` + `ItemDePlano` são a leva vista pelas duas superfícies. Antes
disso a fila da bancada era `localStorage` puro (`lagosta.bancada`) e **nenhuma
rota escrevia nela** — o chat não conseguia montar uma semana que a bancada
enxergasse. Serviço em `src/lib/planos/`, rotas
`/api/projects/[projectId]/planos*`, tools `criar-plano`, `ver-plano`,
`editar-item-do-plano`, `regenerar-item`, `executar-plano`.

- **O plano registra INTENÇÃO; só `executar-plano` gasta.** Montar, editar e
  reprovar são de graça por contrato. É a mesma regra que já valia para
  sugestão: proposta nunca agenda nem cobra sozinha.
- 🔴 **O gate de crédito é MECÂNICO, não só prosa.** A 1ª chamada de
  `executar-plano` não escreve nada (tudo antes do `return` é leitura) e devolve
  a conta; só a 2ª, com `confirmar: true`, produz. O handler usa
  `args.confirmar === true` — qualquer outro valor NÃO confirma. A descrição
  proíbe auto-confirmação em palavras, inclusive quando "ela já disse pode fazer
  tudo" (ela ainda não tinha visto a conta) e quando a conta dá zero.
- 🔴 **Ler saldo é LEITURA**: `db.creditBalance.findUnique` pelo `User.id`
  interno. `getUserCredits`/`getUserFromClerkId` **CRIAM User** quando não
  existe — é assim que nascem os "Users fantasma" que já estão neste banco.
- **`ia` vai para a fila durável (F0.3); `template` renderiza na invocação.** O
  MCP **só enfileira, nunca chama `dispararJobAgora`** (lá uma invocação carrega
  várias tools, e o batch JSON-RPC resolve com `Promise.all`). Não existe
  `GenerationJobKind` para render de modelo e **não se cria um** — enum do
  Postgres é migration. O render em sequência tem orçamento de 210s dos 300s, a
  via template roda DEPOIS da IA (para um corte por tempo atingir só o trabalho
  barato de retomar), e a resposta **sempre diz quantos ficaram**: teto de
  cobertura que não aparece no relato é teto que mente.
- 🔴 **`createArteRapida` JÁ chama `registrarUsoDeModelo`** (`arte-rapida.ts:646`)
  e já fecha as sugestões de modelo e de foto. Chamar de novo dobra o contador.
- **Ninguém avisa o plano quando uma geração termina** — a fila durável não
  conhece plano. Quem reconcilia é `ver-plano` e o GET de `[planoId]`, lendo a
  `Generation` (`reconciliar.ts`), mesmo padrão de `sinal-de-modelo.ts`.
  `executar-plano` **não** reconcilia, para manter literal a promessa de que a
  1ª chamada não escreve.
- 🔴 **`na-fila → pronto` não é transição válida** (passa por `gerando`) — e é o
  caso comum quando o cron termina antes de alguém abrir o plano. O caminho é
  descoberto por **busca em largura sobre a própria `transicaoPermitida`**,
  nunca por uma cópia da tabela num segundo lugar.
- **`agendado` é terminal; `reprovado` não.** Depois que o item virou post, a
  verdade é o post — deixá-lo voltar criaria duas fontes de verdade. Reprovar
  precisa de saída, porque recusa com motivo é sinal, não beco: vira
  `registrarFeedbackDeArte` quando há arte, e o tipo `item-de-plano` quando a
  recusa é da proposta inteira. **Item reprovado é PULADO por `executar-plano`**
  — reproduzir o que alguém acabou de recusar gasta crédito para repetir o erro.
- 🔴 **Na hidratação da bancada, o servidor manda no CONTEÚDO e o estado mais
  AVANÇADO vence na SITUAÇÃO** (`para-bancada.ts`, mesma forma de
  `desfechoVenceOAnterior`). Sem isso a resposta que chega segundos depois do
  clique devolve à fila um card cuja geração já está paga, e clicar em Gerar de
  novo cobra duas vezes. `plano: null` significa "não há leva ativa", **nunca**
  "a consulta ainda não voltou" — por isso ele só orfaniza, não apaga.
- **O guard de reidratação do store continua valendo nas duas direções**;
  `temTrabalhoNoServidor` só mudou de casa para `para-bancada.ts` (puro,
  testável) porque a hidratação precisa da MESMA resposta, inclusive no
  carrossel, onde os ids vivem em `slides[]` e não no item.
- **`ItemDePlano.planoId` TEM FK com `onDelete: Cascade`** — é parentesco
  estrito. A regra "sem FK" da casa vale para vínculo FROUXO com entidade
  apagável (`postId`, `generationId`, `pageId`, `campaignId`, `sugestaoId`,
  `sourcePageId`), não para o dono da linha. `projectId` fica `Int` solto, sem
  relação com `Project` — precedente de `LearningSignal` e `GenerationJob`.
- **`trocar-arte-do-post` é o caminho para "usa aquela outra arte"** e só vale em
  RASCUNHO. Post nascido da bancada é `NOT_NEEDED` e está **fora** do alcance de
  `invalidateScheduledRenders`, ou seja, `ajustar-arte` não trocava nada nele.
  Nunca reduz a contagem de `mediaUrls` (troca só o índice pedido, com
  compare-and-swap); `Page.thumbnail` **nunca** é reusado (pode ser válido e
  mesmo assim velho); **página em CARROSSEL vira `NOT_NEEDED`**, porque
  `renderPostArt` grava `mediaUrls: [url]` e um post `RENDERED` de 3 slides
  perderia 2 no primeiro re-render; e `SocialPost.generationId` só muda quando o
  índice é 0, senão "melhorar com IA" pega o slide 3 e escreve sobre o slide 1.
- 🔴 **Com `strict: false`, `z.infer` marca TODA chave como opcional** (sem
  `strictNullChecks`, `undefined extends T` vale para tudo). Campo obrigatório no
  zod chega ao serviço tipado como opcional — o tipo de entrada precisa admitir
  isso, e a garantia fica na validação de runtime.
- **Mapeamento posicional da copy nos slots do modelo é simplificação
  conhecida**: `ItemDePlano.copyProposta` é `String[]` e `createArteRapida` quer
  slots chaveados. Sobra/falta preenche o que couber e **avisa** — nunca derruba
  a leva.

### A proposta da semana: `propor-semana` e a dica de copy (F3 trilho B, 11/08/2026)

`proporSemana` (`src/lib/planos/propor-semana.ts`) encadeia `sugerirPosts` →
assunto por slot → `buscarNoAcervo` → `montarDicasDeCopy` → `criarPlano`. Ela
**monta e persiste; nunca gera, nunca cobra, nunca agenda** — quem produz é
`executar-plano`, com o gate de confirmação.

- 🔴 **A F2 NÃO dá tema por slot.** `SugestaoSlot` não tem campo de pilar, e
  `modeloSugerido.temas` são as TAGS da página, não assunto. Quem escolhe o
  assunto é `propor-semana`, cruzando `taxonomiaAprovada` com a distribuição
  real de `montarPerfil`. **Não mova essa escolha para `sugerir-posts.ts`.**
- ~~Em produção há ZERO pilares e ZERO posts classificados (11/08/2026)~~ —
  **SUPERADO em 16/08/2026: a taxonomia foi aprovada e o histórico
  classificado.** Medido: **9 dos 11 projetos** têm 5 a 7 pilares aprovados
  (todos com `origem: 'humano'`) e entre **533 e 720 posts classificados** cada.
  Ficam de fora só Lagosta Criativa e Ciro Trigo, que não são cliente de
  restaurante. O caminho SEM tema deixou de ser o normal — mas
  `taxonomiaAprovada` devolvendo `[]` continua significando "este cliente ainda
  não tem taxonomia", nunca erro, e é o que vale para projeto novo.
- **Uma chamada de LLM para a leva INTEIRA**, não uma por slot: além de mais
  barata, é o que deixa o modelo ver a semana toda e não repetir o mesmo gancho.
  Molde: o classificador da F2.
- 🔴 **A vigência da base é conferida contra a DATA DO SLOT** (`vigenteEm(quando)`),
  nunca contra `new Date()`: campanha que vence antes do slot não pode entrar na
  copy daquele slot.
- 🔴 **Preço, horário, data e promoção só passam com LASTRO na base, e a trava é
  mecânica** (`aplicarGuardaDeDados` + `dadosProibidos`): o termo citado tem de
  aparecer numa entrada válida para aquela data, senão o **bloco inteiro** cai e
  vira aviso. Cai o bloco, não o valor — bloco mutilado ("HAPPY HOUR DAS ÀS")
  parece copy e não é. As entradas que sustentaram o que sobrou saem em `fontes`.
- **As perguntas do crivo entram como INSUMO do prompt**, não como portão — a
  copy nasce respeitando as regras. Não religue `crivo-avaliacao.ts` como modal.
  ⚠️ A polaridade da lista é MISTA: apresente-as como perguntas que alguém fará
  sobre a peça, nunca como afirmações.
- **`toneOfVoice` entra na copy** (a proibição vale só para prompt de IMAGEM), e
  **não se chama `escolherReferenciaDeEstilo`** aqui: aquilo é referência de
  imagem e marcar uso fora de uma geração quebraria o rodízio. O análogo para
  texto ("como esta marca reescreve") já vem dentro de `perfilParaPrompt`.
- 🔴 **A âncora do eco tem de ser LEGÍVEL.** Com `ref` opaca (`slot-1`) o
  gpt-4o-mini ignorou a instrução e copiou a própria headline no eco — **4 de 4
  dicas perdidas no By Rock**. Hoje a âncora é "story de quinta-feira, 19:00".
  E `ref` só desempata quando o eco não casa com NADA; nunca quando casa com
  várias.
- 🔴 **O dia da semana precisa de linha PRÓPRIA no prompt.** Enterrado na linha
  de data, o modelo anunciou no domingo o executivo de segunda a sexta e
  convidou para uma casa fechada aos domingos.
- **A dica de copy não cobra créditos** — precedente da revisão ortográfica
  (mesmo `gpt-4o-mini`, sem cobrança) e contrato da F3: proposta com pedágio é
  proposta que ninguém itera.
- **Cold start só quando NÃO há nenhum horário real.** Semear em volta de uma
  rotina magra inventaria ritmo que o cliente não tem. A grade-semente é
  registrada como sugestão (`semente-v1`, determinística) — sem isso o KPI
  mediria só quem já tem rotina — e vem rotulada item a item.
- 🔴 **A copy agora É sugerida, então a bancada FECHA o desfecho em vez de abrir
  decisão nova.** Card vindo de item de plano com dica registra `registrarDesfecho`;
  card montado à mão continua `escolha-propria`. Sem isso o mesmo texto viraria
  dois sinais com sentidos opostos — o defeito que a F1 já teve de corrigir
  (`e3236624`). O desfecho é CALCULADO pelo diff, nunca declarado pela tela.

### Cache da base: disjuntor no backend do Upstash (11/08/2026)

O cache de resultados da busca na base (`src/lib/knowledge/cache.ts`) estava
falhando em TODA busca, em silêncio, desde antes da F3. Consumidores atingidos:
chat, `generate-ai-text`, `find-similar-entries` e a dica de copy da F3.

- 🔴 **O Upstash responde HTTP 200 com `{"error": ...}` no corpo** quando o banco
  está suspenso, com rate limit da conta ou credencial inválida. O
  `@upstash/redis` só lança em resposta **não-2xx**, então o envelope de erro
  passa como sucesso e chega ao auto-pipeline — **ligado por padrão**
  (`enableAutoPipelining ?? true`), então TODO comando passa por lá —, que faz
  `res.map(...)` sobre um objeto e estoura `TypeError: res.map is not a function`.
  Status 2xx não é prova de sucesso nesta API.
- 🔴 **Erro engolido por `catch` + `console.error` não é conserto, é anestesia.**
  Dois commits (`5bb8af37`, `2e81caf6`) trataram o sintoma assim, e o defeito
  sobreviveu meses: nada quebrava, o cache nunca acertava, e cada busca pagava
  **~600ms em regime (~1,9s a frio)** em ida ao servidor mais duas linhas de erro
  — medido em 11/08 contra o banco real. Falha que se repete precisa de um
  estado que a registre, não só de um log.
- **O disjuntor guarda só o caminho quente.** Depois de 3 falhas seguidas o
  cache para de ser consultado (custo cai a **0ms**), avisa **uma vez** com
  diagnóstico acionável, e reabre sozinho após 60s (dobrando até 10 min) — quem
  consertar o banco não precisa redeployar. A invalidação (`invalidateProjectCache`)
  fica **fora** do disjuntor de propósito: é rara e sensível a correção, então
  vale mais pagar a ida do que pular um bump de versão em silêncio.
- **Desligar o cache é decisão de ops, não de código**: sem
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` o caminho vira no-op limpo e a busca segue
  normal (só refazendo o embedding). As duas variáveis agora estão no
  `.env.example` — antes só o `UPSTASH_VECTOR_*` estava, e o cache era invisível
  para quem montava o ambiente.
- **Redis e Vector são bancos SEPARADOS.** Em 11/08 o Redis estava rate-limited
  e o Vector saudável (136 vetores) — ou seja, a busca funcionava e só o cache
  estava morto. Ao diagnosticar, teste os dois endpoints antes de concluir.

### O desfecho da copy fecha em TRÊS superfícies (11/08/2026)

Desde que `propor-semana` passou a **emitir** a copy como sugestão, editar essa
copy depois tem de FECHAR aquela proposta — nunca abrir uma decisão nova.

- 🔴 **São três os pontos, e o de maior volume é o agendamento**:
  `ajustarArte` (chat), o PATCH da página (autosave do editor) e
  `registrarCopyDoPost` (dentro de `agendarPost` — todo post que entra na
  agenda passa por ele). Os três chamam `fecharDicaDeCopyDaPagina`
  (`src/lib/aprendizado/fechar-copy-por-pagina.ts`) e só caem em
  `registrarDecisaoSemSugestao` quando o resultado é `sem-plano`.
  Abrir a linha paralela faria o mesmo texto virar dois sinais com sentidos
  opostos **e** deixaria a proposta expirar — inflando o denominador do KPI
  duas vezes. É o defeito que a F1 já corrigiu uma vez no slot (`e3236624`).
- **O vínculo é `pageId`/`generationId`, nunca `postId`**: o `ItemDePlano` só
  recebe `postId` quando transiciona para `agendado`, o que acontece DEPOIS de
  o post existir — no instante da captura aquele campo ainda está vazio.
- **A PÁGINA vence a arte na busca do item**, porque `ajustar-arte` cria uma
  Generation nova a cada ajuste; casar por arte só vale para a via `ia`. E a
  busca **não olha `sourcePageId`** — editar a página-MODELO não é editar a
  copy proposta para uma peça.
- **`erro` NÃO cai na escolha absoluta.** Sem saber se havia dica, abrir a
  linha paralela pode ser justamente o defeito; perder um sinal é o preço
  barato.
- 🔴 **Teste desta captura precisa de copy em `fieldValues.slotValues`.** Sem
  ela `agendarPost` resolve `copyFinal` como nulo e `registrarCopyDoPost` sai
  na primeira linha — o teste passa sem exercitar nada. Aconteceu de verdade em
  11/08; a prova está em `scripts/validar-desfecho-no-agendamento.ts`.
- 🔴 **O risco desta mudança é gravar de MENOS, e só o CONTROLE pega isso.** Se
  o resolvedor deixasse de devolver `sem-plano`, todo post comum perderia a sua
  linha de copy em silêncio — e é quase só disso que o corpus das primeiras
  semanas é feito. Por isso a prova tem três posts: copy usada como veio
  (`aceita-como-veio`), copy mexida (`editada` — sem ela, um fio trocado que
  passasse a proposta como se fosse o texto final deixaria tudo em aceitação
  para sempre) e post sem leva (`escolha-propria`).
- **`slotEmBrasilia` e as chaves moram em `sinal-de-agendamento-contrato.ts`.**
  O serviço arrasta o Prisma por dois caminhos (`captura` e
  `fechar-copy-por-pagina`), e `@/lib/db` lança no import sem `DATABASE_URL`:
  apontado para o serviço, o teste dessas três funções não carregava e as 9
  asserções nunca rodaram. O mesmo split desfaz o CICLO que o fechamento criou
  (`sinal-de-agendamento` → `fechar-copy-por-pagina` → `sinal-de-copy-do-plano`
  → `sinal-de-agendamento`).
- 🔴 **O guard por compute dos scripts de validação falha ABERTO sem `.env`** —
  e worktree não herda o `.env`, que é gitignored. Em
  `validar-desfecho-no-agendamento.ts` ele agora recusa rodar nesse caso; os
  outros scripts com o mesmo molde ainda voltam em silêncio, achando que
  conferiram.
- **Fechado ANTES de o corpus acumular, de propósito**: o volume era zero
  porque `propor-semana` tinha nascido no dia anterior. Captura errada não se
  conserta retroativamente — a mesma razão de registrar a sugestão na EMISSÃO.

### Resolução: a trilha `imagem` entrega o NATIVO (12/08/2026)

O resize de finalização (`creative-generation-runner.ts`) passou a valer **só na
trilha `arte`**. A trilha `imagem` grava a cena no tamanho que o modelo devolveu.

O que havia antes: toda geração era reduzida ao tamanho exato de publicação. Esse
resize é da trilha `arte` e lá está certo — nasceu para normalizar os múltiplos de
16 do gpt-image (1088 → 1080, downscale de 0,7%) e seu propósito documentado era
**parar de fazer upscale**. A trilha `imagem` caiu nele por herança, no mesmo
commit que expôs `resolution` (`6a15cb62`, 09/08), sem que a interação fosse
discutida — a mensagem daquele commit é minuciosa sobre prompt, papéis e
verificação, e não diz uma palavra sobre finalização.

- 🔴 **Medido em 12/08: o 4K É honrado e era jogado fora.** `nano-banana-pro` em
  9:16 devolve **3072x5504 (16,9 MP)** e era gravado em 1080x1920 (2,07 MP) —
  **87,7% dos pixels no lixo**, na única peça do fluxo que precisa de margem
  para recorte. Era isso, e não nitidez, que obrigava a casa a sair para o
  Higgsfield (que devolve exatamente o mesmo 3072x5504).
- 🔴 **1K era UPSCALE e foi RECUSADO.** O pro devolve **768x1376** em 1K —
  menor que 1080x1920 nos dois eixos —, então ele reintroduzia justamente o
  defeito que a trilha `arte` corrigiu em maio. A recusa (`RESOLUCAO_DOMINADA`,
  em `startArtGeneration`, espelhada no enum do MCP e no zod da rota) tem
  motivo que sobrevive ao resize condicional: 1K custa o **mesmo** que 2K nos
  dois modelos e entrega **1/4** dos pixels. Estritamente dominado.
- **O teto da cena nativa é de BYTES, nunca de pixels.** Item de plano sem copy
  nasce na trilha `imagem` (`execucao.ts:293`) e pode virar post; o limite de
  imagem do Instagram é 8 MB e o 4K saiu com 7,69 MB. Reencodar preserva os
  16,9 MP; reduzir dimensão desfaria o conserto para resolver o problema errado.
- **A escada de qualidade começa ALTA (95) porque o degrau caro é reencodar**,
  não a qualidade: medido no mesmo 4K, a variância do laplaciano cai para 80,6%
  já no q=95 e só chega a 74,8% no q=80. Quem está abaixo do teto passa
  **intocado** (é o caso do 2K) — e é essa passagem livre que vale mais que o
  número escolhido.
- **`fieldValues.finalSize` agora grava o que o arquivo É**, não o alvo. Na
  falha continua sendo o alvo, que é o registro honesto do que se pediu.
- **A logo não é afetada**: o bloco inteiro vive dentro de `if (track ===
  'arte')`, então `logoParaCompor` é sempre null na trilha `imagem`. E
  `conferir-arte` já reduz para 640px antes da visão, então arquivo grande não
  encarece a conferência.
- **A capa de carrossel NÃO entra nisto**: `carousel-service.ts` usa
  `track: 'arte'` nos dois pontos, inclusive na capa sem copy. Ela continua
  saindo no tamanho de publicação, como peça que é.
- `scripts/medir-resolucao-trilha-imagem.ts` refaz a medição (1K/2K/4K
  comparados no MESMO 1080 final). Dry-run por padrão, imprime a conta e só
  `--confirmar` gasta; não toca no banco nem em crédito, só na fatura do Google.
  ⚠️ O cliente Gemini **não expõe seed**, então as imagens são cenas diferentes
  — a nitidez do laplaciano mede a CENA quando n=1. A comparação que NÃO serve
  é "2K reduzida × 2K nativa": arquivos de tamanhos diferentes, o maior sempre
  ganha.

### Custo de imagem: a tabela existia e nunca era alcançada (12/08/2026)

`estimateUsdCost` (`src/lib/credits/cost-estimates.ts`) alimenta
`/api/admin/spending`. Medido em 12/08: das **68 linhas** `AI_IMAGE_GENERATION`
do histórico, **68 caíam no fallback** de $0,012/crédito. Nenhuma precisa.

- 🔴 **A causa era o `details`, não o preço.** A dedução do arte-ia gravava só
  `{generationId, track, model, formato, elapsedSeconds}` — sem `resolution`
  (trilha imagem) e sem `inputSize`/`quality` (trilha arte), nada casava chave.
  E como `ai_art_generation` e `ai_image_generation` mapeiam para o **mesmo**
  OperationType (`feature-config.ts:23,31`), o maior consumidor do sistema era
  exatamente o que o painel estimava no chute. Efeito: **o painel lia 4,7× a
  mais** (US$ 47,70 contra US$ 10,14 reais).
- **Os preços antigos não eram chute — eram do Replicate.** O que envelheceu foi
  a arquitetura: `gemini-image-client.ts` chama o SDK do Google direto. Eles
  ficaram preservados sob o prefixo `replicate.` e são usados quando
  `details.apiProvider === 'replicate'`, que hoje é só o fallback de
  `generate-image/route.ts`. **O provider muda o preço do MESMO modelo** — por
  isso ele entra na chave, e não numa nota de rodapé.
- **A trilha `arte` cai no ramo `AI_IMAGE_GENERATION`, não no
  `AI_CREATIVE_IMPROVEMENT`** (mesmo OperationType), e usa gpt-image, cobrado
  por tamanho e qualidade. O ramo passou a tratar `model.startsWith('gpt-image')`
  com a chave da melhoria.
- ⚠️ **As 68 linhas antigas continuam no fallback** — elas não têm os campos
  novos, e só rodada nova nasce precisa. O painel vai mostrar um degrau. Dá para
  backfillar a partir de `Generation.fieldValues` (que sempre teve `resolution`
  e `inputSize`); não foi feito.
- Preços oficiais do Google levantados em 12/08/2026: `nano-banana-pro` US$
  0,134 em 1K/2K e **US$ 0,24 em 4K**; `nano-banana-2` US$ 0,101; gpt-image-2
  high em 1088x1936 US$ 0,165. Em créditos: 10 / 15 / 30 na trilha imagem e 25
  na arte. A tool `gerar-imagem` devolve `creditosCobrados` e declara o preço —
  sem isso, quem escolhe modelo e resolução escolhe às cegas, que foi como uma
  leva de 12 peças custou R$ 15,68 para entregar o mesmo arquivo de R$ 6,60.

### 🔴 `quantity` multiplica; preço de TABELA vai em `creditsTotal` (12/08/2026)

`deductCreditsForFeature`/`validateCreditsForFeature` calculam
`getFeatureCost(feature) * Math.max(1, quantity)`. Os três caminhos de imagem
passavam em `quantity` o retorno de `calculateCreditsForModel`, que já é um
valor **em créditos** — então ele era multiplicado pelo custo da feature
(`ai_image_generation` = 5). Cobrança real medida na `UsageHistory` antes do
conserto: **50** onde deveria ser 10, e **150** onde deveria ser 30 (12 linhas
a 150, 31 a 50). As doze peças do By Rock custaram 1.800 créditos.

- **`creditsTotal` é o caminho para preço de TABELA** (`creditosADebitar`, em
  `credits/deduct.ts`): quando presente, ele É o total e o custo da feature não
  entra na conta. Usado por `startArtGeneration`, `generateStoredAiImage` e
  `POST /api/ai/generate-image`.
- **`quantity` continua sendo multiplicador, e isso está CERTO** para feature de
  preço fixo — `POST /api/ai/image` passa `quantity = count` (3 imagens × 5 = 15)
  e não foi tocada. Não unifique os dois: são semânticas diferentes de propósito.
- **A trilha `arte` escapava por acidente** (passava `quantity: 1` e o custo de
  `ai_art_generation` já é 25). É o único ponto onde os dois modelos mentais
  coincidiam — e é por isso que ninguém tinha percebido.
- **Os estornos (`refundCreditsForFeature`) seguem só com multiplicador**, e
  isso basta hoje: nenhum dos três caminhos de imagem estorna. Caminho novo que
  cobre por `creditsTotal` **e** estorne precisa levar o total para o estorno,
  senão devolve 5× o cobrado.
- **Validação e dedução usam o MESMO helper**, então nunca divergem: quem passou
  na validação debita exatamente aquilo.
- ⚠️ **As 68 linhas antigas da `UsageHistory` ficam com o valor velho** — o
  conserto vale daqui para frente. Quem for ler série histórica de créditos
  precisa saber que há um degrau em 12/08/2026.

### O registro de uso só existe desde 30/07/2026

`UsageHistory` tem **87 linhas no total**, a mais antiga de 30/07/2026 — mas
`AIGeneratedImage` tem **788**, de out/2025 a ago/2026. O painel de gastos cobre
duas semanas, não dez meses.

- **O cron de limpeza não explica**: `cleanup-db` (semanal, `0 2 * * 0`) apaga
  `UsageHistory` com mais de **90 dias**, e maio/junho/julho estão DENTRO da
  janela. Na janela há **101 imagens e ZERO linhas com `aiImageId`**.
- **As 68 linhas de `AI_IMAGE_GENERATION` têm todas `generationId`** — são do
  arte-ia, que nasceu em 09/08. Nenhuma veio de `generateStoredAiImage` nem da
  rota `/api/ai/generate-image`, embora as duas chamem `deductCreditsForFeature`.
- **Nem todo criador de `AIGeneratedImage` cobra, e alguns não devem mesmo**:
  `POST /api/projects/[id]/ai-images` só REGISTRA uma URL pronta e
  `tools/generate-art` também não deduz. O que falta explicar é por que os dois
  caminhos que DEDUZEM não deixaram linha na janela de retenção — ficou em
  aberto.

### A terceira casa do 1K: `quick-generate` e a dimensão fictícia (12/08/2026)

Procurando o mesmo defeito fora do arte-ia, ele apareceu em
`generateStoredAiImage` (`src/lib/ai/generate-image-service.ts`), cujo único
chamador é `POST /api/gerar-criativo/quick-generate` — a Arte Rápida.

- **`resolution: '1K'` era estritamente dominado, igual ao caso do arte-ia**:
  no `nano-banana-pro` 1K e 2K custam os MESMOS 15 créditos. A rota pedia 1K
  fixo e o serviço tinha `?? '1K'` como padrão; ambos foram para 2K. Agrava:
  a imagem vira CAMADA de uma página 1080x1920, então o 1K (768x1376) ainda
  seria **esticado no render**.
- 🔴 **`calculateDimensions` gravava dimensão FICTÍCIA** — tabela fixa por
  proporção que não olhava nem a resolução pedida nem o buffer. **788 linhas
  de `AIGeneratedImage`** (out/2025 a ago/2026) dizem 576x1024 em 9:16, quando
  o 1K real é 768x1376 e o 2K é 1536x2752. Hoje a dimensão é MEDIDA no buffer
  (`medirDimensoes`), com a tabela como fallback quando o sharp não lê.
- **Não era cosmético.** `AIGeneratedImage.width/height` alimentam o
  `data-pswp-*` do lightbox — a mesma armadilha já registrada na galeria, com o
  lightbox abrindo a arte menor do que ela é — e o `calculateCanvasPlacement`
  (`ai-images-panel.tsx:166,650`), que POSICIONA e ESCALA a imagem ao cair no
  canvas do editor. A área subestimada ia de 1,8× (1K) a 7,2× (2K).
- ⚠️ **As 788 linhas antigas continuam com a dimensão errada** — só linha nova
  nasce medida. Backfill é possível relendo o `fileUrl`; não foi feito.
- **`generateStoredAiImage` NUNCA redimensiona** — o buffer vai direto para o
  Blob. O upscale desse caminho, quando acontece, é no render da página, não na
  finalização. São defeitos parecidos em casas diferentes: no arte-ia o resize
  era explícito; aqui é consequência de pedir pouco pixel para um slot grande.

### O tier do gpt-image virou escolha, e o padrão é `low` (12/08/2026)

`runImageEdit` cravava `quality: 'high'` desde que existe — o caminho mais caro
do sistema, sem ninguém ter escolhido. Hoje o tier é parâmetro
(`src/lib/ai/qualidade-arte.ts`, módulo PURO porque a galeria é client), o
padrão é `low` para compor e `high` quando há ajuste na foto, e trocar é um
botão na mão de quem aprova.

Medido com `scripts/medir-qualidade-trilha-arte.ts` (mesma peça do Espeto
Gaúcho, 3 repetições por tier, o juiz sendo o `verifyImageTexts` da produção):

| tier | texto | tempo | fatura |
|---|---|---:|---:|
| low | 3/3 | 38s | US$ 0,008 |
| medium | 3/3 | 60s | US$ 0,045 |
| high | 3/3 | 125s | US$ 0,165 |

Os três desenharam o lettering íntegro — til do "Ã" no lugar, traço fechado,
sem artefato, conferido em 1:1. O `low` sai por 1/20 do `high`.

- 🔴 **Os tiers baratos INVENTAM número, e nenhum verificador pega.** No selo do
  Google apareceu contagem de avaliação fabricada em **2 de 3** peças no `low` e
  **1 de 3** no `medium`, contra **0 de 3** no `high` — dado factual e
  verificável sobre o negócio do cliente, a mesma classe de "nunca invente preço,
  horário, endereço ou promoção". `verifyImageTexts` confere se o texto esperado
  ESTÁ presente e **não tem regra contra texto A MAIS**, então as três passaram
  com veredito verde. **Não leia o ✅ da conferência como "não inventou nada".**
  Fechar isso é trabalho em aberto: a transcrição já volta do verificador, então
  a regra caberia ali.
- **A conferência NUNCA regera sozinha** — regra de 10/08/2026, reafirmada em
  12/08 ao introduzir a escolha. Uma escada automática (low → medium ao reprovar
  o texto) chegou a ser escrita e foi DESFEITA pelo Ciro: o comparador produz
  falso negativo ("R$ 9,90" vs "R$9,90"), e regerar por conta própria gasta
  chamada paga para corrigir o que muitas vezes não está errado. O verificador
  avisa; quem decide é o olho.
- **O tier entra no HASH DE DEDUPE** (`q` em `startArtGeneration`). Sem isso,
  pedir "o mais caro" logo depois de uma geração em andamento cairia no dedupe e
  devolveria a peça barata — exatamente o que a pessoa acabou de recusar. Mesma
  lição do `finalPrompt`, que também não estava no hash.
- 🔴 **`fieldValues.prompt` NÃO serve como `finalPrompt` ao refazer.** O que está
  gravado é o prompt FINAL (preâmbulo de referências + corpo); devolvê-lo como
  `finalPrompt` faz o runner prefixar o preâmbulo DE NOVO e a peça nasce com a
  descrição das imagens duplicada. `POST …/arte-ia/[generationId]/refazer`
  reconstrói pelo caminho normal — pedido + copy (de `slotValues`) + referências.
- **Só `source === 'arte-ia'` pode ser refeita**: arte de template ou de upload
  não tem prompt nem referências para reconstituir, e o botão nem aparece.
- 🔴 **Compor é barato, EDITAR A FOTO é caro** (`qualidadePadraoPara`, decisão do
  Ciro em 12/08). Os dois testes dizem coisas OPOSTAS: desenhar letra sobre a
  foto empatou nos três tiers, mas pedir para cortar a picanha ao meio e revelar
  o ponto separou — o `low` devolveu mancha rosa lisa, sem fibra legível e com
  transição abrupta da crosta (parecia pintado, não cortado), enquanto `medium`
  e `high` renderam fibra com direção e gradiente de cocção. A nitidez foi
  monotônica: 700 / 754 / 870. Faz sentido físico: microtextura é o que o tier
  barato sacrifica, e ela é irrelevante para uma letra. Por isso
  `instrucaoImagem` presente ⇒ padrão `high`. **Em créditos não muda nada** (a
  trilha arte cobra 25 flat); sobe a fatura e o tempo (~43s → ~125s).
- **Os rótulos falam de TEMPO e CUSTO, nunca de "qualidade baixa"** — os três
  tiers desenharam texto íntegro, então "qualidade baixa" mentiria sobre o que se
  escolhe. E "low/medium" não é vocabulário de quem cuida do Instagram de
  restaurante (mesma regra que proíbe DRAFT/SCHEDULED na conversa).
- **O menu vive FORA do `<a>` do card** (`gallery-item.tsx`, barra de ações é
  irmã do anchor) — dentro dele, o clique navegaria. E é menu, não dois botões,
  porque a barra já chega a cinco e no celular o card tem ~120px.

### Escolher um modelo passou a mandar na diagramação (16/08/2026)

Relatado pelo Ciro na Real Gelateria: escolheu um modelo na bancada, a arte saiu
com outra diagramação e a headline em CAIXA ALTA — contra o Title Case do modelo
e contra o próprio DNA da marca. Eram **três causas somadas**, e nenhuma delas
era o modelo de imagem desobedecendo.

- 🔴 **`buildTypographyLock` mandava "caixa alta" para TODA marca.** Linha curta
  e imperativa aos 36% do prompt, contra a regra da marca aos 62%, enterrada em
  9.180 caracteres de DNA (54% do prompt inteiro). Medido nos 11 clientes: **10
  declaram a própria caixa no DNA**, e em 4 o hardcode contradizia o que estava
  escrito (Real Gelateria e Wine Vix pedem Title Case; O Quintal proíbe caixa
  alta contínua fora de uma fonte; Empório Fonseca pede caixa mista). Era
  redundante onde acertava e mandava onde errava. **Tirar não basta**: o
  gpt-image cai sozinho em caixa alta na manchete, então o lock agora DIZ de
  onde a caixa vem (identidade, ou o modelo quando houver).
- 🔴 **O papel `style` nunca prometeu layout** — o preâmbulo dele fala em
  "tonal register, luminosity and graphic mood", de propósito. Escolher um
  modelo na bancada usava esse papel, então mudava só qual imagem entrava como
  referência de clima. O papel novo é **`style-guide`**: molde do `series-guide`
  do carrossel, com os limites duros do `style` (o texto e a foto dele não são
  conteúdo). O que o distingue no runner é o **`generationId`** da referência —
  que existia na bancada e **morria no schema da rota**.
- **Com modelo escolhido, `visualStyle` e `composition` do DNA SAEM do prompt**,
  mesmo precedente do slide irmão: o modelo JÁ É a marca aplicada e aprovada, e
  descrevê-la em prosa é concorrência que vence por volume. Era a regra
  aprendida "título na parte superior, serviço no rodapé" que jogava a manchete
  para o topo contra um modelo que a põe embaixo. `contentRules` FICA —
  proibição não é estilo.
- **Procedência é conferida, e id que não confere é DESCARTADO, nunca recusado**:
  o pior desfecho seria derrubar uma geração paga por causa de um vínculo. Sem o
  marcador, a referência segue valendo como clima.
- Medido com `scripts/medir-modelo-a-seguir.ts` (não toca no banco, não gasta
  crédito; só a fatura da OpenAI, e só com `--confirmar`): mesma foto, mesma
  copy, mesmas 5 imagens, só o papel mudando. **Antes**: "TERÇA MERECE" em caixa
  alta, bloco no topo, 6 de 10 textos em caixa alta, conferência de texto
  REPROVADA. **Depois**: "Terça / merece" em duas caixas como o modelo, bloco no
  terço inferior esquerdo, filete com ponto central, 1 de 6 em caixa alta,
  conferência aprovada.
- ⚠️ **O canto da logo NÃO segue o modelo** — na peça avulsa ele continua sendo
  escolha do gerador (`instrucaoLogoPeloModelo(null)`), e no teste o selo foi
  para o canto superior direito enquanto o modelo o tem no inferior direito.
  Está de acordo com o DNA da Real, então ficou como está; se um dia o modelo
  tiver de mandar nisso também, o lugar é esse argumento.

### 🔴 A caixa da arte é a caixa da STRING, não do prompt (16/08/2026)

Segundo round do mesmo relato: com o conserto acima no ar, a headline voltou em
caixa alta. Causa DIFERENTE — a copy chegou gritada (`"DESACELERE E DESFRUTE"`),
e o prompt reproduz verbatim.

- 🔴 **Instrução no prompt NÃO vence a string literal. Não tente de novo.**
  Medido com 2 repetições: a linha "se um bloco vier todo em maiúsculas, isso
  NÃO é ordem de desenhá-lo em caixa alta — trate a caixa como decisão sua"
  produziu 2 de 2 peças em CAIXA ALTA. O `- "DESACELERE E DESFRUTE"` três linhas
  acima vence qualquer regra sobre ele. A mesma copy apresentada como
  "Desacelere e desfrute" saiu em caixa natural, 2 de 2. Há um comentário
  guardando esse lugar no `buildArtePrompt`.
- **Mudar a caixa NUNCA reprova arte**: `normalizeForComparison` termina em
  `.toUpperCase()`. Trocar palavra continua reprovando.
- 🔴 **Quem grita é o CHAT, não o gerador da casa**: 85% das copies de planos
  com `origem: 'chat'` têm o 1º bloco todo em maiúsculas (55 de 65), contra
  **0 de 31** em `propor-semana` e 0 de 3 na bancada. É como se escreve manchete
  num briefing. As descrições de `criar-plano`, `editar-item-do-plano` e
  `gerar-imagem` agora pedem caixa natural — mas isso só alcança copy NOVA.
- 🔴 **Title Case, nunca caixa de frase.** Os blocos reais em caixa alta estão
  cheios de nome próprio ("PRAIA DO CANTO", "RUA ELESBÃO LINHARES, 52", "ESPETO
  GAÚCHO"); caixa de frase produz "Praia do canto", que é erro visível. Title
  Case acerta nome próprio por construção, e o preço — capitalizar substantivo
  comum — lê como estilo editorial. Validado contra os 63 blocos distintos do
  banco.
- 🔴 **Proteção de sigla por TAMANHO não funciona**: proteger todo token de até
  3 letras (para salvar "OFF" e "DJ") salvou "EM", "NO", "DO", "OS" e "RUA", e
  saía "Adega E Bistrô NA Praia DO Canto". Palavra curta comum é a MAIORIA das
  palavras curtas — sigla é exceção, e exceção se enumera (`SIGLAS`).
- 🔴 **A correção NÃO é neutra, e por isso é opt-in por cliente**
  (`PROJETOS_COM_CAIXA_NATURAL`, hoje 1, 2, 11 e 12). Medido no By Rock, cujo
  DNA pede "caixa alta para manchetes que precisam de impacto visual": com a
  correção ligada a manchete saiu em Title Case nas 2 rodadas — a regra da marca
  vive a ~68% de um DNA longo e não segurou sozinha. Lista explícita, não
  derivada da prosa do DNA. Mudou o DNA de alguém? Meça antes de mexer na lista.
- `scripts/medir-modelo-a-seguir.ts` serve aos dois casos (referência escolhida
  à mão ou vinda do rodízio): compara o prompt GRAVADO na geração com o do
  builder atual, sem tocar no banco nem em crédito.

### 🔴 O decodificador de guia descartava resposta boa, em silêncio (16/08/2026)

`carousel-guide-decoder.ts` é o que transforma "copie o estilo" em lista de
decisões. Ele vinha falhando muito mais do que ninguém sabia — e falha em
silêncio (`catch` → null → segue só com o SPINE textual), então o CARROSSEL
também rodava degradado sem sinal nenhum.

- 🔴 **Schema rígido recusava a resposta INTEIRA por um campo omitido** — a
  mesma lição que o crivo aprendeu em 11/08 e que não tinha sido aplicada aqui.
  Medido: o modelo devolveu os três níveis de texto, alinhamento e posição do
  bloco, e omitiu `veuDeLeitura` e `tratamentoDaFoto`; tudo foi descartado. Hoje
  todo campo é `.optional()` e campo ausente simplesmente NÃO VIRA LINHA.
- 🔴 **`elementosGraficos: []` é uma AFIRMAÇÃO; ausente não afirma nada.** A
  lista vazia vira "não acrescente nenhum" no prompt. Colapsar os dois faz a
  peça nova perder a assinatura da marca, ou ganhar a ordem de não ter o que
  ninguém verificou. `GuiaLido.elementosGraficos` é `string[] | null`, e os dois
  spines só fazem a afirmação quando `Array.isArray`.
- 🔴 **Elemento gráfico volta como STRING ou como OBJETO** (`{tipo, posicao}`) —
  as duas formas são aceitas e normalizadas. Pedir "descreva cada um com a
  posição" fez o modelo passar a responder em objeto, e `z.array(z.string())`
  perdeu duas rodadas seguidas logo depois de a enumeração fazer ele enfim
  ENXERGAR o filete que vinha ignorando.
- 🔴 **A CAIXA é calculada no CÓDIGO a partir do texto transcrito, nunca
  perguntada** (`caixaDoTexto`). Em 3 rodadas a temperatura 0, o gpt-4o-mini
  classificou "Feliz" como ALTA em 2 e Title Case em 1 — enquanto a
  TRANSCRIÇÃO saiu idêntica nas três. Ele lê as letras com fidelidade e erra o
  rótulo; e como a caixa vira instrução na peça nova, o rótulo errado
  reintroduzia a caixa alta que o conserto acabara de remover. Mesma trava do
  crivo: o modelo declara o fato, o código tira a conclusão.
- **Ornamento fino perto do texto exige enumeração no prompt.** Sem listar
  "filete, linha fina, losango, ponto entre linhas, selo, moldura, barra, faixa,
  ícone", ele devolvia lista vazia para uma arte que tem filete com losango
  central logo abaixo da manchete.

### Modelo sem dia declarado é CURINGA da semana (16/08/2026)

`casaComDia` só dá match quando o texto CONTÉM o nome do dia, e não havia
curinga: modelo genérico só aparecia na sugestão se declarasse um dia.
`escolherModeloDoDia` (`src/lib/posts/dia-semana.ts`) resolve — ESPECÍFICO
primeiro, curinga como reserva.

- 🔴 **Tirar a tag do dia NÃO libera o modelo — REMOVE ele da sugestão.** Foi
  o que quase se fez com os "Story base (3 layouts)" de TERO e Wine Vix, que
  tinham `quinta` carimbada justamente porque era a única forma de aparecer.
  Medido antes de gravar: sem `quinta` e sem curinga, os dois clientes caíam de
  2 dias cobertos para 1 e não ganhavam nenhum outro. A saída é CÓDIGO, e o
  script de dado (`liberar-modelo-base-de-dia-fixo.ts`) só é seguro DEPOIS
  dele. Cobertura real depois dos dois: TERO 1→7, Wine Vix 1→7, By Rock 3→7.
- **A prioridade mora no módulo puro, não em quem chama**: `sugerirPosts` e o
  inventário de curadoria (`scripts/inventario-uso-modelos.ts`) PRECISAM casar
  do mesmo jeito — divergir despromove um modelo que a sugestão ainda enxerga,
  e o dia some em silêncio. É a mesma razão pela qual `casaComDia` já morava
  lá.
- 🔴 **O curinga recebe UMA chave de cobertura (`dia:*`), nunca as sete.** Com
  sete ele viraria "único cobridor" de todo dia e a proteção contra chave órfã
  nunca o deixaria ser despromovido. `dia:*` é o que ele é — a reserva — e
  perder o último curinga do cliente tira a reserva de todos os dias.
- **A query de modelos ganhou `orderBy` (`usedCount asc, name asc`).** Ela não
  tinha nenhum, então "o primeiro que casa" dependia da ordem do Postgres — com
  dois modelos do mesmo dia (o By Rock tem dois de sábado e dois de terça) a
  escolha era arbitrária. O curinga amplia isso de um dia para todos os sem
  específico. `usedCount` é `Int` não-nulo: a armadilha do `ASC` ser NULLS LAST
  vale para `lastUsedAt`, não aqui.
- `modeloSugerido` carrega `curinga: boolean` — quem monta a proposta não pode
  dizer "o modelo de sábado" sobre um layout de base.

### Tag de tema de modelo: o vocabulário vem dos PILARES (16/08/2026)

- 🔴 **Tag de DIA não serve para busca por tema, e era o que 8 dos 20 modelos
  tinham de único.** `prepareCreative` casa o tema pedido contra
  `Page.tags` + `Template.tags` e FALHA quando nada bate; o dia já é resolvido
  por outro caminho (`casaComDia`, que lê o NOME da página e do template). Ou
  seja: a tag de dia era redundante E deixava o modelo inalcançável por
  assunto. Corrigido por `scripts/taguear-modelos-sem-tema.ts`, com as tags
  lidas da copy real de cada arte, declaradas uma a uma. "Só dia" caiu de 8
  para 0; alcançáveis por tema subiram de 6 para 14.
- **O vocabulário de tema NÃO se inventa: são os pilares.** `ContentPillar` já
  é "a taxonomia fechada de temas de UM cliente", com slug normalizado e
  aprovada por gente. `scripts/semear-tags-de-tema.ts` leva os slugs aprovados
  para `ProjectTag` (a sugestão do TagInput) — 53 tags em 9 clientes. Um
  segundo vocabulário de temas recriaria o problema que os pilares vieram
  resolver ("happy hour" e "drinks" em baldes diferentes).
- **`ProjectTag` é só autocomplete** — semear não muda busca de ninguém. Quem
  casa modelo com tema é `Page.tags` + `Template.tags`.
- **Os dois vocabulários foram alinhados** (`scripts/alinhar-tags-aos-pilares.ts`,
  16/08): 7 modelos ganharam o slug do pilar ao lado da tag própria.
  ACRESCENTA, nunca substitui — `ribs` e `barbecue` continuam, porque alguém
  vai pedir "o story de ribs" e `prepareCreative` casa por `includes`; as duas
  portas levam à mesma arte. O script confere que o slug é pilar APROVADO
  daquele cliente antes de gravar: sem isso, um erro de digitação vira tag
  órfã que busca nenhuma alcança.
- 🔴 **Os 6 "Story base" ficam FORA do alinhamento, de propósito.** São
  CURINGA da semana; dar tema a eles os prenderia a um assunto — o mesmo erro
  da tag `quinta`, desfeito no mesmo dia.
- 🔴 **O gargalo não são as tags, são os MODELOS**: medido depois do
  alinhamento, só **9 dos 30 pilares aprovados têm algum modelo**
  (Wine Vix: 0 de 6; TERO: 1 de 7; O Quintal: 1 de 6; By Rock: 5 de 6). Pedir
  "story de harmonização" no Wine Vix não acha modelo e cai na geração por IA
  — o que funciona, mas custa crédito e não usa a diagramação aprovada da
  marca. Tag nova não resolve isso; modelo novo resolve.
- ⚠️ **Fica aberto**: `ProjectTag` tem lixo herdado (dia da semana, `Template`,
  `Página 1`, `Quarta-feira (Cópia)`) — limpar é destrutivo e não foi feito. E
  dois modelos não têm pilar correspondente (By Rock "Delivery", sem pilar de
  delivery; Wine Vix "Página 1", copy genérica) — inventar encaixe seria pior
  que a divergência, já que a taxonomia é fechada por decisão da F2.

### Promover página a modelo voltou ao editor (16/08/2026)

O editor ganhou o botão **Marcar modelo** (header no desktop; dentro do menu
"O que você quer fazer?" no celular) — um popover com o switch de
`Page.isTemplate` **e** as tags de tema no MESMO lugar. Componente em
`src/components/templates/page-model-control.tsx`.

O que havia antes: a única porta WEB para `isTemplate: true` era
`POST /api/projects/[id]/modelos`, que CRIA um modelo em branco. Página já
desenhada não tinha como ser promovida — a aba Modelos lista só
`isTemplate: true` (`/api/templates/[id]/template-pages`), então a página comum
nunca aparecia lá nem para virar modelo, nem para receber tag. Promover uma
arte existente só dava pelo MCP.

- 🔴 **O botão não estava faltando: foi REMOVIDO de propósito** no commit
  `10fd26f0` (09/05/2026), com a justificativa "Modelos created via the new
  flow are born with isTemplate=true; the toggle was confusing". A premissa
  valia para modelo criado do zero e deixou órfã a PROMOÇÃO. Ficaram três
  órfãos vivos: `ToggleTemplateButton`, `useToggleTemplate` e a rota PATCH —
  hoje os dois últimos voltaram a ter dono. O componente antigo em
  `src/components/template/` (SINGULAR) segue morto; o editor vivo é
  `src/components/templates/` (PLURAL), e a semelhança já produziu
  diagnóstico errado.
- **Switch e tags moram JUNTOS porque modelo sem tag não é achado por tema**:
  `prepareCreative` casa o tema contra `Page.tags` + `Template.tags` e FALHA
  quando nada bate. Separar os controles produz o "modelo mudo" que forçou a
  despromoção em massa de 10/08. A ordem é imposta pelo código — a rota de
  tags exige `isTemplate: true`, então o campo só destrava depois de marcar.
- **Promover é CURADORIA, não edição.** A rota `toggle-template` usava
  `hasTemplateWriteAccess` (qualquer membro da org) enquanto as outras portas
  (`/modelos`, `.../tags`) exigem `hasProjectOwnership`. Com o botão escondido
  era latente; exposto, vira porta lateral — o membro promove pelo editor e
  toma 403 ao taguear, deixando no pool exatamente o modelo sem tag. Gate
  alinhado; a UI lê o mesmo `canCurate` de `GET /api/projects/[id]`.
- **Estado de UI derivado de `Page` depende do CONTEÚDO do campo, não da
  REFERÊNCIA — e quem segura isso hoje é a biblioteca, não o nosso código.**
  O autosave chama `useUpdatePage({ skipInvalidation: true })`, que SUBSTITUI o
  objeto inteiro da página no cache `['pages', templateId]` (`use-pages.ts:145`)
  pela resposta do PATCH, a cada pausa da digitação no canvas. Um efeito com a
  referência do array na dependência remontaria o rascunho a cada autosave —
  apagando as tags sendo escritas e o botão "Salvar tags" junto. **Medido: isso
  NÃO acontece hoje**, porque o `replaceEqualDeep` do `@tanstack/query-core`
  (structural sharing, `query.js:61`) preserva a referência quando o conteúdo é
  igual. A proteção é frágil por depender de a rota nunca parar de mandar
  `tags`: sem o campo, `?? []` cria array novo a cada render e o wipe volta.
  Por isso a dependência é `JSON.stringify` do conteúdo.
- 🔴 **`['pages', templateId]` e `['template-pages']` são caches DIFERENTES da
  mesma verdade.** O hook de tags invalida o segundo (aba Modelos); o editor lê
  o primeiro. Sem escrita cirúrgica no `['pages']`, reabrir o popover sem
  recarregar mostrava as tags ANTIGAS — o popover desmonta ao fechar e
  reconstrói o rascunho desse cache. Invalidar sairia caro: refetch de
  `['pages']` traz todas as páginas COM layers só por causa de uma lista.
- **A invalidação de `['template-pages']` passou a ser por PREFIXO.** A aba
  Modelos consulta um endpoint que devolve as páginas de TODOS os templates do
  projeto, mas cacheia sob o id do PRIMEIRO (`seedTemplateId`); promover página
  de outro template não invalidava essa entrada.
- 🔴 **`side="bottom"` do `SheetContent` é `h-auto` SEM teto nem rolagem**
  (`ui/sheet.tsx:69`). Conteúdo novo em sheet de baixo empurra opções para fora
  da tela em aparelho baixo. Teto e scroll vão no USO, nunca no componente
  compartilhado.
- **Fora do `agendaMode` nos dois layouts**: ali o editor é o ajuste rápido de
  UM post vindo da agenda. O ramo mobile não tem esse if, então expor sem
  guardar divergia celular × desktop.
- **A tool `marcar-como-modelo` do MCP recebeu o MESMO gate** (16/08/2026):
  `assertCuradorDoProjeto`, ao lado de `assertProjetoPermitido`. Ver o bloco
  abaixo — ENXERGAR um cliente e mandar na curadoria dele são portas
  diferentes, e só a primeira existia no conector.

### Curadoria no conector MCP: ver ≠ mandar (16/08/2026)

`assertProjetoPermitido` responde "esta conta enxerga o cliente?" — e era o
único gate de toda tool, inclusive das que fazem CURADORIA. Promover página a
modelo pelo conector bastava enxergar; pela web, exige curador desde sempre
(`/modelos`, `.../tags`) e agora também no editor.

- **`assertCuradorDoProjeto` compõe, não substitui**: chama o gate de acesso
  primeiro e só então checa curadoria. Os dois 403 são distintos de propósito
  (`PROJETO_SEM_ACESSO` × `PROJETO_SEM_CURADORIA`) — a causa e a saída são
  diferentes, e a mensagem diz QUAL conta está conectada, pela mesma razão de
  12/08: a identidade do portador é invisível de dentro da conversa.
- 🔴 **No MCP não existe "organização ativa".** O token OAuth traz só o
  `userId`, então `hasProjectOwnership` (que decide pelo `orgId` da SESSÃO) não
  tem tradução direta. A regra aqui é ser admin de ALGUMA org com que o projeto
  é compartilhado — o mesmo critério que `projetosVisiveis` já usa para
  enxergar. Não tente reusar o helper da web achando que é equivalente.
- **O papel vem do Clerk, não do banco.** `orgsDoUsuario` devolvia só os ids;
  virou `participacoesDoUsuario`, com `role` por organização (mesmo cache de
  60s). `orgsDoUsuario` continua existindo como projeção, para
  `projetosVisiveis` não mudar.
- **Clerk fora do ar degrada para MENOS poder, nunca para mais**: sem
  participações sobra o dono no banco, e o ramo `ownerClerkId` continua no OR
  justamente para isso.
- **O segredo de serviço (Claudinho) passa** — mesma decisão que faz
  `projetosVisiveis` devolver `null` para ele: já opera em nome do dono.
- 🔴 **O caso que prova a mudança é o MEMBRO COMUM**, e só ele: dono, estranho
  e admin já eram decididos pelo gate ANTIGO, então um teste com esses três
  passa sem exercitar nada. Como forjar papel no Clerk não é possível,
  `ehCuradorDoProjeto(projectId, clerkUserId, participacoes)` é exportada e
  recebe as participações por PARÂMETRO — é o que torna a matriz (dono / admin
  / membro / papel custom "co-admin" / admin de outra org / Clerk mudo)
  verificável contra o banco real.
- Só `marcar-como-modelo` escreve `isTemplate` no conector remoto; as demais
  ocorrências são leitura e filtro. Tool nova que faça curadoria (promover,
  taguear modelo) usa `assertCuradorDoProjeto`, não `assertProjetoPermitido`.

### 🔴 O modelo a seguir estava DITANDO o texto da peça nova (17/08/2026)

Cinco artes seguidas do O Quintal Parrilla reprovadas — o placar do cliente no
dia foi **0 "gostei" contra 5 "preciso melhorar"** —, com cinco queixas que são
quatro defeitos somados, todos nascidos do papel `style-guide` (a "arte de
referência" escolhida na bancada):

- *"Você está incluindo endereço e funcionamento sem que seja solicitado"* e
  *"misturou a cópia da arte de referência com a copy solicitada"*;
- *"o título foi deslocado para o meio e na cópia estava alinhado no canto
  superior esquerdo"*;
- *"a foto está ficando muito escura"*;
- *"é preciso respeitar as margens do Instagram de topo e rodapé"*.

🔴 **A causa nº 1 é a mesma lei já registrada para a caixa das letras: a STRING
literal no prompt vence QUALQUER regra escrita sobre ela.** `descricaoDoGuia`
transcrevia os níveis do modelo *com as palavras* — `3. apoio — "Funcionamento -
11h às 00h"`, `4. apoio — "R. Aleixo Netto, 1158…"` — logo abaixo do cabeçalho
"repita a MESMA estrutura, trocando só as palavras". Contra isso, o preâmbulo do
papel `style-guide` mandava, em inglês e duas vezes, *nunca* copiar texto da
referência. Perdeu. Reproduzido em 17/08 com o prompt de produção: a peça de
controle saiu com o horário e o endereço do post antigo, verbatim.

Regras que ficam:

- **As palavras do modelo NÃO entram no prompt. Não as reintroduza.** A
  transcrição continua sendo pedida à visão, mas só como INSUMO INTERNO: dela
  saem a caixa medida (`caixaDoTexto`) e a régua da conferência
  (`GuiaLido.textos`). O que vai ao prompt é a FORMA — onde, em que cor, em que
  caixa, em que tamanho.
- 🔴 **A última porta do vazamento é o ELEMENTO GRÁFICO**: a visão situa o
  ornamento citando a vizinhança entre aspas ("ícone de relógio antes de
  'Funcionamento - 11h às 00h'"), e essa linha entra DUAS vezes no prompt, uma
  delas como ordem imperativa no topo do MODELO SPINE. A instrução pede posição
  pelo PAPEL do texto; `semPalavrasDoModelo` é a trava mecânica.
- 🔴 **`gpt-4o-mini` NÃO enxerga ONDE o texto está — ele numera as zonas pela
  ORDEM em que as lê.** Medido nas duas artes de referência do Quintal, 2
  rodadas cada, temperatura 0: na peça cuja manchete está na banda 6 de 8 (66%
  da altura), o mini respondeu 3 e 4, e disse "centro" para um bloco alinhado à
  esquerda nas duas artes; o `gpt-4o` acertou banda e lado em 4 de 4. O
  decodificador é `gpt-4o` desde então — "barato" não se sustenta quando é UMA
  chamada por geração contra os US$ 0,165 da geração que ela dirige.
- 🔴 **A posição é lida como BANDA numerada (1 a 8) e o rótulo é conclusão do
  CÓDIGO** (`faixaDaBanda`), mesma trava de `caixaDoTexto` e do crivo. Pedindo
  o rótulo direto, saía `"canto inferior esquerdo, começando a ~30% da altura"`
  — a média contraditória entre a manchete do alto e o serviço do rodapé, que o
  gpt-image resolveu empilhando tudo no meio do quadro. O que faz a leitura
  funcionar é mandar medir a DISTÂNCIA ATÉ A BORDA DE CIMA com dois exemplos de
  calibração, e proibir explicitamente decidir pela ordem de leitura.
- **Uma arte tem ZONAS de texto, não um bloco só.** Manchete no alto e serviço
  no rodapé são duas, e juntá-las é erro — tanto na leitura (`zonas[]`) quanto
  no SPINE, que agora manda replicar a posição *de cada zona*.
- **Safe area em PIXEL DA PEÇA REAL** (`regraDeSafeArea`), com a fração como
  fallback. O caminho foi: "~250px" escrito para 1080x1920 numa peça que sai
  1088x1936 → fração (~1/8 e ~7/8) → e a fração ainda deixou logo e CTA
  terminando entre 93% e 95% da altura nas cinco peças. Contra a IMAGEM do
  modelo — que tem a marca quase colada na borda — só um número confere: "nada
  abaixo de 1694px" é verificável, "o último oitavo" é interpretável. Mesmo
  princípio de física-não-adjetivo do prompt da trilha `imagem`.
  A regra vive em TRÊS lugares de propósito: nas regras de composição, colada ao
  bloco da logo (onde "canto calmo" era lido como "o canto do quadro") e no
  bloco de serviço (onde "rodapé" puxa para a borda). E ela **vence a margem do
  modelo**: a arte de referência foi feita sem esta regra.
  🔴 **Feed e quadrado NÃO têm faixa reservada** — o Instagram não desenha por
  cima deles, e reservar 1/8 ali é margem inventada que come a peça. Por isso a
  regra recebe o `formato`, e o chamador que não informa tamanho continua com a
  versão em fração.
  ⚠️ Este último passo (o número em pixel) foi escrito mas **não medido em arte
  gerada** — a rodada de 17/08 terminou antes.
- **O véu de leitura é LOCAL** (a faixa onde o texto pousa, no máximo ~1/3 do
  quadro): "sutil" não bastava porque não dizia ONDE, e o modelo escurecia a
  cena inteira. Não cabendo o texto sem apagar a foto, o texto é que muda de
  lugar.
- 🔴 **SERVIÇO (horário e endereço) tem lugar fixo no RODAPÉ, e esse lugar NÃO
  vem do modelo** (`blocos-de-servico.ts`, pedido do Ciro em 17/08/2026). O
  parágrafo do modelo manda copiar as zonas dele — mas ele é uma peça ANTIGA e
  pode não ter linha de serviço nenhuma; quando a copy tem e ele não, o
  gpt-image pendura o horário junto da manchete. É a ÚNICA zona que o prompt
  manda CRIAR contra o modelo, e a exceção está escrita nos dois lugares (colada
  à copy e no item 1 do MODELO SPINE).
  ⚠️ **O classificador é conservador de propósito**: frase que só MENCIONA uma
  hora ("Almoço com a família e amigos, a partir das 11h") é APOIO, não serviço
  — mandá-la ao rodapé rebaixaria a promessa da peça a letra miúda. O corte é o
  que SOBRA da frase depois de tirar o dado (≤ 20 caracteres), calibrado contra
  as cinco copies reais da leva.
- 🔴 **Zona do modelo sem conteúdo na copy fica VAZIA — e isso precisa ser dito
  de duas formas.** Copiar a diagramação de uma peça mais completa que a atual
  cria pressão para preencher, e o gpt-image preenche do jeito dele. As duas
  formas foram medidas na mesma leva de 17/08:
  - **ícone ÓRFÃO**: o modelo tem relógio e pin ao lado do horário e do
    endereço, o MODELO SPINE manda desenhar os elementos "obrigatoriamente", e a
    peça de sobremesas saiu com os dois ícones sozinhos no canto, apontando para
    nada. `elementosQueFazemSentido` tira o ícone de serviço da ordem quando a
    copy não tem serviço — e ainda o proíbe POR NOME, porque a descrição do
    modelo continua dizendo que ele existe.
  - **texto DUPLICADO**: sem nada para pôr na zona de rodapé, a peça de almoço
    repetiu a linha de apoio — o mesmo texto duas vezes na mesma arte. A regra
    ("cada bloco aparece UMA ÚNICA VEZ") mora colada à lista de copy.
- 🔴 **A MARCA não é ornamento nem nível de texto — ela tem bloco próprio, e as
  outras duas portas precisam ser FECHADAS.** Medido em 17/08/2026 no almoço
  executivo: o decodificador devolveu `"selo à direita do serviço"` como
  elemento gráfico e uma `Zona 3 (assinatura)` como zona de texto; o MODELO
  SPINE promoveu o selo a "DESENHE ESTES ELEMENTOS GRÁFICOS, obrigatoriamente";
  e o bloco da logo, em paralelo, mandou reproduzir o arquivo oficial. A peça
  saiu com o lockup completo no topo **mais o símbolo sozinho no rodapé** —
  "está colocando o ícone da logo mais a logo, não precisa disso". Hoje
  `DA_MARCA` (selo|logo|logotipo|logomarca|marca|emblema|símbolo|brasão|
  monograma|assinatura) tira a marca da lista de ornamentos, a zona de
  assinatura vira UMA linha dizendo onde ela mora (nunca níveis para letrar) e
  não conta como zona de texto, e o bloco da logo passou a dizer "UMA MARCA POR
  PEÇA, e ela é o ARQUIVO INTEIRO".
  ⚠️ `\bmarca\b` não casa com "marcador": o marcador entre linhas continua
  sendo ornamento legítimo. E selo DECORATIVO de verdade (um "10 anos") seria
  descartado junto — risco aceito, porque desenhar a marca duas vezes é defeito
  que o cliente reprova e perder um ornamento não é.
- 🔴 **Quem identifica a marca é o NOME DELA, não o rótulo que a visão deu.** O
  filtro por papel foi só o primeiro passo e não bastou: medido nas TRÊS
  referências do O Quintal, a mesma marca voltou como `"selo"`, como
  `"assinatura"` e como `"título"` — e o emblema, como `"ícone circular"`. Pelo
  rótulo, a marca do modelo do "Puxadinho" passou como nível de texto e a logo
  foi para o topo ("a logomarca ficou posicionada no topo e não posicionou como
  na referência"). `ehAMarca` casa o TEXTO transcrito contra
  `brand.projectName` nos dois sentidos (a arte traz o lockup completo ou só o
  nome), a separação é NÍVEL A NÍVEL (a zona real é mista: assinatura + duas
  linhas de serviço) e ainda há uma linha no SPINE cobrindo o que escapar do
  apelido.
- **O canto da logo passou a seguir o modelo** (`cantoDaAssinatura`): a posição
  lida da assinatura vira o canto reservado no bloco da logo. Isto REVOGA a
  decisão de 16/08 de deixar o canto livre na peça avulsa — ela valia enquanto
  ninguém sabia onde a referência põe a marca. Marca CENTRALIZADA não vira
  canto (chutar lado seria inventar), e aí o canto volta a ser livre.
- 🔴 **Horário por EXTENSO conta como horário.** "das 11h à meia-noite" não
  casava com o padrão (que exigia dígito dos dois lados), então o bloco não
  virou serviço, ficou na sequência de cima E foi parar no rodapé pela zona do
  modelo — o mesmo horário duas vezes na arte. `HORA` aceita "meia-noite" e
  "meio-dia", e o padrão aceita "à", "até" e "a partir do". É como a casa
  escreve horário de bar.
- 🔴 **Mandar o serviço para o rodapé exige dizer de onde ele SAI.** A regra
  genérica de não repetir NÃO segurou o caso mais óbvio, e isso foi medido duas
  vezes na peça de funcionamento: a copy lista o horário como 2º bloco (logo
  abaixo da manchete) e o modelo escolhido tem zona de manchete com DOIS níveis,
  então o gpt-image punha o horário no subtítulo **e** no rodapé, atendendo às
  duas forças — e ainda perdia o CTA por falta de lugar. Com a linha "eles saem
  da sequência de cima… se sobrar um nível lá sem conteúdo, ele não existe nesta
  peça", a mesma peça saiu com a copy completa e sem repetição. Regra de POSIÇÃO
  precisa fechar a porta de saída, não só abrir a de entrada.
- **Vazamento agora AVISA, nunca reprova** (`vazamentoAlerta`, irmão de
  `numerosAlerta`): a transcrição da arte pronta é comparada com os textos do
  modelo. Frase abaixo de 12 caracteres normalizados não conta, e **o NOME DA
  MARCA é descontado antes da medida** — toda peça leva a assinatura, a visão
  transcreve o wordmark da logo como texto e o decodificador lê o nome como um
  nível do modelo, então sem o desconto o alarme tocaria em quase toda geração.
  Os números já vinham acusando o defeito em 3 das 5 peças ("11, 00, 1158") sem
  que ninguém lesse aquilo como "copiou o post antigo".

**Medido** com `scripts/medir-modelo-a-seguir.ts --da-geracao <id> --confirmar`
(mesma foto, mesma copy, mesmas 5 referências; só o prompt muda). Antes: **10
blocos de texto** na peça — manchete inventada a partir do tema, a copy pedida
rebaixada a texto de apoio, mais `Funcionamento - 11h às 00h` e
`R. Aleixo Netto, 1158 - Praia do Canto, Vitória` copiados do post antigo, com o
salão inteiro escurecido e a marca colada nas duas bordas. Depois: **4 blocos**
— exatamente a copy pedida, manchete no alto como no modelo, serviço no rodapé,
foto clara. ⚠️ Sobrou uma linha com o nome da marca no bloco de serviço (o
modelo preenche o slot que a copy não usou) e o rodapé ainda encosta na faixa
reservada: as duas coisas são visíveis na peça e valem uma segunda medição.

### 🔴 A caixa da manchete e o tratamento da foto (TERO, 17/08/2026)

A semana do TERO foi refeita por IA depois de 30 reprovações na via de modelo, e
as duas primeiras peças voltaram reprovadas por três coisas: *"a headline deve
ser em caixa alta"* (nas duas), *"a foto ficou muito contrastada você não
precisa alterar a imagem"* e *"o horário e o CTA podem ficar no rodapé"*.

- 🔴 **A lei da caixa perdeu pela TERCEIRA vez, agora contra o MODELO SPINE.**
  O prompt do almoço trazia `1. título · caixa ALTA` mais a regra "esta regra
  vence qualquer outro palpite sobre caixa", e o DNA pedia caixa alta em dois
  pontos. Contra a linha `- "Almoço executivo"` no bloco de copy, os três
  perderam. **Nenhuma instrução sobre a caixa funciona — nem a identidade, nem o
  lock de tipografia, nem o modelo escolhido à mão.** Só mudar a string funciona.
- **Por isso `PROJETOS_COM_CAIXA_NATURAL` virou `CAIXA_DA_MANCHETE`**, um mapa
  com as duas direções (`natural` | `alta`). `natural` vale para a copy inteira;
  `alta` vale **só para o primeiro bloco** — o apoio é Montserrat 300/400 e o
  CTA sai em caixa natural nas artes aprovadas da marca, então gritar tudo
  trocaria um defeito por outro. Cliente fora do mapa recebe a copy como ela foi
  escrita, que continua sendo o default.
- 🔴 **O que quebrou o TERO foi o conserto da Real Gelateria.** Até 16/08 a copy
  chegava GRITANDO por acidente (85% das copies do chat), e era esse acidente
  que protegia quem pede caixa alta. As descrições das tools passaram a pedir
  caixa natural a TODOS — acertando quem pede Title Case e desprotegendo o
  resto. Mexeu na caixa de um lado, confira o outro.
- 🔴 **O `tratamentoDaFoto` do modelo virava ordem de RELUMIAR a foto nova** —
  mesma forma do vazamento de palavras consertado no mesmo dia. O spine dizia
  "Tratamento da foto: temperatura neutra, **contraste alto**", que é a descrição
  da foto ANTIGA, e a regra 8 mandava igualar a luminosidade. Contra isso, o
  "NÃO RELUMIE" ficava seis parágrafos acima e perdeu: instrução colada à
  referência vence instrução geral. Hoje a linha é **opt-in** e só o carrossel a
  recebe (`decodificarGuia(buffer, { paraSerie: true })`) — lá o guia estabelece
  o look de uma série que precisa parecer a mesma sessão de fotos.
- **A licença de "ajuste global MUITO sutil de contraste, exposição e nitidez"
  foi RETIRADA do bloco de fidelidade.** Ela nunca foi necessária para peça
  nenhuma e era a brecha que o modelo esticava; quem quer mexer na foto pede, e
  o pedido já vira a EXCEÇÃO logo abaixo (`instrucaoImagem`). O preâmbulo do
  papel `style` também deixou de mandar casar a *luminosity* — o que se casa com
  a referência é a camada gráfica.
- **Medido** com `scripts/medir-modelo-a-seguir.ts --da-geracao <id> --confirmar
  --so-depois` (US$ 0,165, zero créditos): a manchete saiu "ALMOÇO / EXECUTIVO"
  no lockup de dois níveis, a foto voltou à luz original e o typo que o modelo
  tinha desenhado ("acompahamentos") saiu correto.
- 🔴 **A conferência de texto aprovou a arte com o typo.** `verifyImageTexts`
  compara por `includes` depois de normalizar, então "acompahamentos" jamais
  conteria "acompanhamentos": o `passed` só é possível se a TRANSCRIÇÃO por
  visão tiver lido a palavra certa — o modelo corrigiu o erro em silêncio ao ler.
  **O ✅ da conferência não é prova de grafia correta**, e some-se isto ao que já
  estava registrado (ela também não pega texto A MAIS).
- **No DNA ficaram duas escritas** (aprovadas pelo Ciro): a regra aprendida que
  manda horário **e CTA** para o rodapé mesmo sem endereço na peça — a anterior
  condicionava tudo à presença do endereço, e era por isso que a peça de happy
  hour saiu com tudo empilhado no topo —, e a remoção do parágrafo que
  autorizava "a foto melhorada em luz, cor, textura e nitidez", herdado do
  pipeline do Higgsfield. ⚠️ A mesma autorização **continua** em
  `photoDirection` ("a foto se melhora, nunca se modifica"), que hoje não entra
  na trilha `arte` — se um dia entrar, ela volta a conflitar.

**Na via de MODELO, o defeito é outro e continua aberto.** As 30 reprovações das
12h vieram dos templates gerados na madrugada de 17/08 (317 Happy Hour, 318
Rolha free, 319 Sobremesas) e de um modelo de dez/2025 sem camada de imagem
("Pag.08", template 86). O autofix RODOU e gravou `aplicada: true` nas quatro
peças conferidas — mas só encolhendo o `titulo-n1`, porque as duas caixas do
lockup **já nascem colidindo em 19 a 38px** no template. As colisões que o Ciro
reprovou (pré-título sobre a manchete no layout Rodapé; apoio de duas linhas
sobre a linha de serviço) não foram sequer detectadas. Refazer por IA é
contorno, não conserto.

### TERO: a logo voltou ao `compor`, e "11h30" é hora (17/08/2026, noite)

Três reprovações da Roberta no TERO, já com todos os consertos do dia no ar.
As causas e o que ficou:

- 🔴 **A logo do TERO não é desenhável pelo gpt-image.** A ligadura E+R saiu
  "TERRO" (14/08), "TLRO" e "BRASA X E VINHO" (17/08, duas artes seguidas) —
  soletração e ligadura explícitas no preâmbulo perderam quatro vezes.
  `LOGO_MODE_POR_PROJETO` em `logo-compositor.ts` devolve o TERO ao `compor`
  (o arquivo oficial colado por sharp) como DEFAULT do projeto. O efeito
  colateral documentado do compor (duas marcas, 10/08) ganhou a linha que
  faltava no `instrucaoAreaReservada`: a marca vista nas referências pertence
  ao post antigo — "this image contains NO brand mark at all". Se a segunda
  marca voltar, reforça-se ali; não se volta o TERO para `modelo`.
- 🔴 **"11h30" quebrava o classificador de serviço**: a HORA só aceitava "11h"
  e o "30" virava número solto — a janela casava "30 às 16h", a sobra estourava
  o teto e o funcionamento ficava pendurado na manchete. Minutos após o "h"
  fazem parte da hora, e o INTERVALO DE DIAS ("de terça a sexta") é descontado
  da sobra como o horário — mas dia SOZINHO segue sendo assunto ("Sexta é dia
  de churrasco" não é serviço).
- **O véu ganhou a palavra que faltava: SUAVE** ("um sussurro de sombra… a foto
  continua nítida POR BAIXO do véu"). "Local" resolveu o escurecimento global;
  a densidade dentro da faixa ainda saía tarja.
- ⚠️ **Tensão em aberto do modelo-livre**: a Roberta reprovou "a arte não é
  semelhante ao template escolhido" — expectativa de layout igual, que o modo
  livre (decisão do Ciro no mesmo dia) deliberadamente não entrega. Se a
  equipe preferir semelhança no TERO, o caminho é
  `PROJETOS_COM_MODELO_ESTRITO.add(3)` — decisão de produto, não de código.

### A logo composta respeita o STORY, e o duplicar carrega o horário (17/08/2026, noite)

- 🔴 **`comporLogo` agora recebe o `formato`**: em story, só os cantos
  INFERIORES concorrem e a margem VERTICAL sobe para a mesma safe area do
  texto (1/8 da altura). A colisão foi real — a logo composta do TERO saiu
  duas vezes no topo esquerdo, sob o avatar que o Instagram desenha: a margem
  era 5,5% da LARGURA nos dois eixos (~3% da altura no 9:16), e o prompt nunca
  teve chance de impedir, porque a composição é pós-geração, por código. Quem
  chamar `comporLogo` sem formato mantém o comportamento antigo (feed/legado).
- **O duplicar da bancada passou a CARREGAR `quando`** (data e horário do card
  original) — pedido do Ciro, revertendo a decisão do mesmo dia: quem duplica
  está refazendo a arte daquele slot, e o card antigo costuma ser removido em
  seguida. Dois cards no mesmo horário continuam possíveis; agendar é ação
  explícita e a tela mostra o horário.

### Assinatura tipográfica por projeto: TERO (17/08/2026, noite)

Depois de conversar com a Roberta, o Ciro manteve o modelo-livre no TERO mas
pediu "um pouco mais de semelhança ao template escolhido… as artes precisam ser
mais delicadas e sofisticadas; a queixa é o título muito grande". A resposta
não foi voltar ao layout travado: foi dar ao gerador a ASSINATURA da marca —
`assinatura-tipografica.ts` (puro, mapa por projeto, TERO = 3), um bloco que
entra COLADO ao typography lock em toda peça avulsa e no guia de carrossel
(nunca no slide irmão, onde o LOOK SPINE manda).

- **A fonte da verdade são as 24 artes PUBLICADAS do TERO na galeria do
  Claudinho** (`insta.lagostacriativa.com.br/galeria`, filtro Publicada),
  analisadas uma a uma em 17/08: manchete serifada PEQUENA (~4-6% da altura por
  linha, lockup ≤ ~12%) em caixa alta com tracking largo; lockup de DUAS VOZES
  (uma linha cobre, outra branca); palavra-chave do apoio em cobre; losango
  pequeno como separador da casa; serviço miúdo e espaçado. 23 das 24 seguem o
  sistema à risca. A sofisticação vem do ESPAÇO, nunca do tamanho — que é
  exatamente o inverso do que o gerador fazia.
- **O bloco fala do TEXTO, nunca de POSIÇÃO** — posição é do modo livre, e um
  bloco que dissesse "rodapé" ou "terço inferior" competiria com ele. E não tem
  NENHUMA palavra de exemplo entre aspas: string literal vira texto desenhado
  (lei medida três vezes nesta semana). Há teste para as duas restrições.
- **A logomarca ficou de fora DE PROPÓSITO** — o Ciro não gosta do
  posicionamento dela nas artes do Claudinho ("é melhor pegar a análise do
  texto"). A logo do TERO segue o `compor` decidido mais cedo.
- Projeto novo ganha assinatura repetindo o método: filtrar as PUBLICADAS do
  cliente na galeria do Claudinho, ler o padrão (caixa, tamanho relativo,
  destaque, separadores) e escrever o bloco — nunca copiar o do TERO.
- **Calibragem da 1ª rodada real (22:17-22:21)**: "tracking largo/generoso" sem
  número foi lido ao EXTREMO (as letras da manchete quase desmontaram a
  palavra) — virou "~1/5 do corpo da letra, NUNCA mais". E o losango, que
  existe nas artes publicadas, saiu da assinatura por decisão do Ciro: o
  gpt-image o soltava ÓRFÃO no quadro — o separador é LINHA FINA, só. Adjetivo
  de intensidade em assinatura precisa de número e teto; ornamento pequeno e
  solto é o que o gpt-image mais perde.

### Modelo-livre: o pêndulo voltou — estilo sim, layout não (17/08/2026)

Depois de uma noite inteira consertando o `style-guide` para obedecer MAIS, o
Ciro avaliou o resultado e inverteu a direção: **"o Claudinho estava fazendo
artes melhores quando não travava muito o modelo — o modelo já manda bem e é
bem criativo, agora está engessando muito"**. O spine estrito ("same placement,
same alignment, in the same minute", zonas com percentuais, "variação é
DEFEITO") produzia peças tecnicamente obedientes e esteticamente piores. A
lição de arquitetura: **prescrição de POSIÇÃO compete com a leitura da foto, e
o gpt-image compõe melhor lendo a foto do que seguindo coordenadas.**

- **O papel do modelo escolhido foi REDEFINIDO**: ele passa as FONTES em uso, a
  caixa/cor/proporção de cada nível e os ornamentos — e a POSIÇÃO volta a ser
  do gerador (a regra 10, autonomia, volta a valer com modelo presente).
  `buildModeloSpineLivre` + preâmbulo `STYLE MODEL` + leitura por visão
  `semPosicoes` (descrição de posição vira instrução de lugar por osmose; no
  modo livre ela não pode nem constar).
- **É o PADRÃO de todos os clientes desde 17/08/2026** — nasceu como
  experimento só no Quintal, o Ciro aprovou no mesmo dia ("funcionou melhor") e
  a promoção foi imediata: quem opera todos os clientes é a mesma equipe, e
  dois comportamentos para o mesmo gesto da bancada seria pior que qualquer uma
  das duas semânticas. O caminho de volta de uma marca que regredir é
  `PROJETOS_COM_MODELO_ESTRITO` (opt-out, vazio hoje) em `modelo-livre.ts` —
  nunca reescrever o prompt. O spine estrito continua no código, coberto por
  teste, exatamente para esse retorno.
- **O CARROSSEL não passa pelo modo livre, de propósito**: o LOOK SPINE do
  slide irmão segue estrito, porque a série é uma peça só e slides com layouts
  diferentes é o defeito que ele existe para evitar.
- **O que NÃO afrouxou**, porque veio de feedback do MESMO cliente no MESMO
  dia: palavras do modelo fora do prompt, UMA marca por peça no canto da
  referência, serviço no rodapé (é conteúdo, não layout), safe area, véu
  local, texto contido/foto protagonista (regras 1, 2 e 4 — "o assunto da foto
  nunca deve ser coberto" é a regra 4, integral nos dois modos).
- **Liberdade ≠ menos regra: é regra sobre a coisa CERTA.** O modo livre
  continua cheio de ordens — sobre tipografia, caixa, cor, quantidade. O que
  saiu foi só a coordenada. Se o experimento aprovar, a migração dos outros
  clientes é adicionar o id ao Set.
- O dry-run de `medir-modelo-a-seguir.ts` passou a GRAVAR os prompts
  (`prompt-antes/depois.txt`) — inspecionar o que seria mandado é o objetivo
  dele, e sem os arquivos a única saída era gastar para ler.
- **O card da galeria tem o PAR de botões de iteração**: "Gerar de novo"
  (refazer — mesmos insumos, outra rodada; útil no modo livre porque sem seed
  cada rodada é uma diagramação nova) e "Duplicar na bancada" (`CopyPlus` ao
  lado da lixeira — mesmo briefing, referência NOVA). O duplicar
  (`duplicar-para-bancada.ts`, puro) carrega copy/foto/pedido/formato e **deixa
  a referência de estilo para trás de propósito**: carregá-la pré-selecionada
  faria o clique mais fácil ser regenerar o que a pessoa acabou de rejeitar. O
  card nasce local na fila da bancada (sem `itemDePlanoId`, protegido da
  hidratação). Mesmo gate do refazer: só `source: 'arte-ia'`.
- **A regra 5 (quebras de linha) cobre TODAS as linhas, não só a última**: a
  manchete do Espeto saiu com o artigo sozinho na primeira linha ("As" /
  "promoções!") e a regra só proibia palavra sozinha na última. Sem exemplo
  entre aspas na regra, de propósito — string literal no prompt vira texto
  desenhado.

### O conector MCP: apelido, filtro por nome e parâmetro recusado (12/08/2026)

Cinco arestas do conector remoto, levantadas na produção real das peças do By
Rock e consertadas juntas.

- 🔴 **`finalPrompt` entrou no hash de dedupe.** Faltava, e o buraco era
  exatamente o formato de uma sessão de direção: mesmo `pedido`, mesmas
  referências, `promptPronto` reescrito, dentro dos 10 minutos → colidia e
  devolvia a peça anterior, que é a que acabou de ser recusada. O hash hoje tem
  `p, c, f, t, r, cg, so, q, fp`.
- **`ver-melhoria` virou `ver-geracao`**, com o nome antigo em `APELIDOS` e
  `melhoriaId` ainda aceito ao lado de `geracaoId`. O nome mentia: `gerar-imagem`
  mandava acompanhar por uma tool cuja descrição dizia servir só para melhorias,
  e quem gerava arte nova ia procurar uma que não existe. **Apelido em
  `APELIDOS` NÃO aparece em `tools/list`** — quem só cria o apelido e mantém o
  nome antigo na lista não resolve nada, porque o modelo escolhe pela lista.
- 🔴 **Parâmetro desconhecido é RECUSADO, não descartado** (`parametrosDesconhecidos`
  em `runMcpTool`). Todo `inputSchema` já declarava `additionalProperties: false`
  e nada enforçava: chamar a listagem do acervo com um filtro inexistente
  devolvia o acervo inteiro misturado, **com cara de resultado válido**. O erro
  cita a chave e lista as aceitas. A guarda respeita a declaração — tool que
  queira aceitar extras é só não fechar a porta.
- **`buscar-fotos` ganhou `fileName`** (exato ou prefixo) e
  **`listar-fotos-da-pasta` ganhou `folder`** — o serviço
  (`listarImagensDoDrive`) já aceitava pasta por nome desde sempre; só a tool
  não expunha. Quem já sabe qual foto quer não tinha como pedi-la.
- ⚠️ **O MCP LOCAL (`scripts/mcp-server.ts`) segue descartando em silêncio**:
  ele usa `server.tool(nome, desc, shapeZod, handler)` e o SDK monta
  `z.object(shape)`, que STRIPA chave desconhecida antes do handler — não há
  onde interceptar sem trocar a forma de registro. A guarda acima vale só para
  o conector remoto.

### A trilha `imagem` ganhou conferência, e o acervo ganhou rodízio (12/08/2026)

**A7 — fidelidade da cena.** A trilha `imagem` não tinha conferência nenhuma:
`textCheck` saía `skipped` com o motivo "peça não leva texto", o que é verdade
e responde a PERGUNTA ERRADA. O risco dela nunca foi texto — é o prato ter
mudado (aconteceu: numa cena de bar noturno o prato azul virou branco, sem
aviso). Ganhou peso quando a trilha passou a entregar o nativo, porque a cena
virou insumo de arte e o erro se propaga para a peça publicada.
`conferirFidelidadeDaCena` (`creative-qa.ts`) compara a cena com a foto
`subject`.

- 🔴 **O teto é deliberadamente ALTO, e o motivo é histórico.** A revisão visual
  por IA já foi ligada e DESLIGADA nesta casa (10/08/2026) por falso negativo
  repetido — "alarme falso ensina quem aprova a ignorar o aviso, que é pior do
  que não ter aviso". Por isso: pergunta estreita (cor, componentes,
  quantidade), prompt que LISTA o que não é divergência (enquadramento, ângulo,
  luz, fundo e arranjo mudam de propósito — a cena é nova), e **só
  `confianca: 'alta'` vira aviso**. Média e baixa passam calado.
- Avisa, nunca reprova; visão fora do ar devolve `pulada`. O aviso entra em
  `fieldValues.cenaAlerta` e aparece na galeria e na bancada, no mesmo lugar do
  alerta de texto.

**B5 — uso de foto.** `PhotoUsage` (tabela nova) passa a registrar que uma foto
do acervo foi usada. Antes, NENHUM caminho do Studio escrevia o `usageHistory`
do `_image-catalog.json` — o único `push` vivo é o do gerador CLI antigo —,
então `ultimoUso()` devolvia `'2000-01-01'` para toda foto, o `sort` de "menos
usadas primeiro" ordenava um campo CONSTANTE, e toda foto respondia
`ultimoUso: 'nunca'`. A regra do DNA de não repetir foto na semana nunca teve
como ser cumprida, nem para foto usada dentro do Studio.

- 🔴 **No BANCO, não no JSON do Drive**, por duas razões: o catálogo é arquivo
  único e duas gerações simultâneas fariam read-modify-write uma por cima da
  outra; e **regerar o catálogo zera `usageHistory`** (`reconciliar-catalogo.ts`
  cria entrada com `[]`), então o histórico morria a cada recatalogação.
- **O catálogo segue sendo lido como legado**: `mesclarUsos` funde as duas
  fontes e vence a data mais recente — jogar o legado fora faria foto realmente
  usada voltar ao topo do rodízio.
- **Escreve DEPOIS do sucesso** (`arte-ia` runner e `createArteRapida`): contar
  uso de foto cuja arte falhou mentiria sobre a preferência do cliente — mesma
  razão pela qual o rodízio de referência de estilo só marca uso quando a arte
  existe. E `registrarUsoDeFoto` **nunca lança**: telemetria de curadoria não
  derruba arte que já foi paga.
- **`marcar-foto-como-usada`** cobre o buraco central: peça montada FORA do
  Studio. Aceita `quando` (AAAA-MM-DD) para marcar publicação passada com a
  data real — sem isso o rodízio acharia que a foto acabou de sair.
- 🔴 **Quase não existe histórico para semear, e isso mede outra coisa.**
  `scripts/semear-uso-de-fotos.ts` reconstrói o uso passado, e o rendimento é
  de **42 usos a partir de 7.832 posts publicados**: 7.769 deles (99,2%) NÃO
  têm vínculo recuperável com foto do Drive. A causa é estrutural e já
  conhecida — a peça foi montada FORA do Studio e `/api/external/posts` aceita
  só `mediaUrls` e `caption`. É o mesmo número, por outro ângulo, da cobertura
  do corpus de aprendizado: **o sistema só sabe o que acontece dentro dele**.
  Semeado em 12/08 (28 no Espeto Gaúcho, 6 no projeto 7, 3+3+2 nos demais); as
  fotos semeadas foram para as posições 519–530 de 547 na busca do projeto 6.
- **`origem: 'historico'` é separada de propósito** — uso RECONSTRUÍDO, não
  observado. Dá para auditar e desfazer (`--desfazer`) sem tocar no que foi
  capturado ao vivo.
- **A fonte `backgroundImageUrl` foi RECUSADA**: ela guarda URL do Blob com o
  nome original do arquivo, e casá-lo com o catálogo por NOME é heurística —
  nome repete entre pastas, e marcação errada empurra para o fim da fila uma
  foto que nunca foi usada. Eram 2 linhas; não pagam o risco.

### Fechamento do plano do MCP: prompt, lote, duplicata (12/08/2026)

Os oito itens que faltavam das seções A e B. Regras que valem para código novo:

- **O teto do `promptPronto` é AVISO, não bloqueio — e agora é 4000.** Era 1500
  e nunca bloqueou nada (`validateImagePrompt` só devolve `issues`, o runner só
  loga). Produzia o pior dos dois: quem LIA a descrição se limitava e cortava as
  proibições — que são o que segura o DNA —, quem ignorava passava. Os prompts
  reais da produção tinham ~2.900. **Nunca corte proibição para caber.**
- 🔴 **Exclusão de elemento vai COLADA à referência de que fala**
  (`referencias[].excluir`), nunca num bloco geral de proibições: o modelo
  precisa saber de QUAL imagem tirar o objeto. Dizer "não copie a garrafa"
  dentro do `pedido` não segurou — a garrafa de Tabasco vazou em 2 de 6 peças
  do By Rock, nítida e com rótulo legível.
- 🔴 **No MCP LOCAL, `server.tool(nome, desc, shape, handler)` ESTRIPA chave
  desconhecida** antes do handler — resposta plausível e errada. A saída é
  `registerTool`, que aceita schema completo além de raw shape (SDK ≥ 1.27), e
  aí `.strict()` cabe. `toolEstrita` embrulha as 24 tools sem mudar a forma de
  chamada. O conector remoto usa outro caminho (`parametrosDesconhecidos`).
- 🔴 **Lote de geração é SEQUENCIAL, nunca `Promise.all`.** Cada item valida
  créditos e cria a Generation; doze em paralelo fariam doze validações lerem o
  MESMO saldo antes de qualquer dedução, e o lote inteiro passaria com saldo
  para uma peça só. Em série o item N enxerga o consumo dos anteriores. Item
  inválido não derruba o lote (`itens[].erro`), teto de 12, `loteId` em
  `fieldValues` — sem tabela nova, precedente do `carouselGroupId`.
- **`md5Checksum` vem de GRAÇA no listing do Drive** — é metadado, não exige
  baixar o arquivo. É o que permite detectar duplicata por CONTEÚDO: no By Rock,
  `ambiente-05.jpg` e `ambiente-f3a8697.jpg` são iguais byte a byte, e a
  duplicata fazia o rodízio "variar" entre duas cópias da mesma imagem.
- 🔴 **A reconciliação é um DIFF DE IDS e não toca em entrada existente** — por
  desenho. Campo novo no catálogo só chega às fotos NOVAS; sem um backfill
  explícito, a detecção de duplicata nasceria inócua no acervo atual. Vale para
  qualquer campo que se acrescente ao `_image-catalog.json`.
- **A guarda de nome de cliente alheio é de SAÍDA, não de entrada.** O prompt já
  diz de quem é a foto (`Analise esta foto do restaurante "X"`) e ainda assim
  boa parte das descrições do TERO menciona "By Rock". Nome de outro cliente da
  carteira vira "o restaurante" — SUBSTITUI, não apaga a frase: descrição
  mutilada some da busca por tema, que é o oposto do objetivo.
- **`buscar-fotos` ganhou `offset`, e `limit` nunca teve teto** — o que faltava
  era a descrição dizer isso. O retorno traz `catalogacao` (total, sem
  descrição, sem tags, duplicadas), porque catálogo regerado na taxonomia v2 só
  tem a pasta: a busca por TEMA não alcança essas fotos e quem buscava não tinha
  como saber — a resposta voltava curta e parecia acervo pequeno.

### 🔴 O conector via MCP era mais restrito que o app web (12/08/2026)

`projetosVisiveis` (`src/lib/mcp/tools.ts`) olhava só
`organization.ownerClerkId` — o DONO da organização. Mas
`hasProjectWriteAccess` (`projects/access.ts`) dá acesso a **todos os membros**
de uma organização com que o projeto é compartilhado, e é assim que o site se
comporta.

Efeito medido: um `org:admin` abria o site e via os 11 clientes; abria o
conector e via **ZERO**, com "Sem acesso ao projeto 6" em cada tool. Nada na
conversa explicava por quê — e a hipótese natural (token de outra conta) estava
certa em parte e mandava para o conserto errado.

- **Membro conta, não só dono.** A participação vive no CLERK, não no banco: o
  app web a recebe pronta no `orgId` da sessão, mas o token OAuth do MCP traz só
  o `userId`. `orgsDoUsuario` consulta o Clerk, com cache de 60s por instância —
  sem ele seria uma ida à API por tool, já que quase toda uma chama
  `assertProjetoPermitido`.
- **Clerk fora do ar degrada para MENOS acesso, nunca para mais**: devolve lista
  vazia de organizações e sobra o que o banco sabe sozinho (os projetos que a
  pessoa possui, e o `ownerClerkId`, que por isso foi MANTIDO no OR).
- 🔴 **Erro de permissão precisa dizer QUEM está conectado.** "Sem acesso ao
  projeto 6" e uma lista vazia mandavam procurar permissão no lugar errado. Hoje
  as duas superfícies dizem o e-mail da conta do token e o que fazer. Vale para
  qualquer negativa de acesso no conector: a identidade do portador é invisível
  de dentro da conversa.
- **Diagnóstico de token**: `McpOAuthToken` guarda `userId`, `expiresAt` e
  `revokedAt`. Foi por ali que a troca de conta apareceu — os tokens do dia
  passaram a sair para outro `user_…` a partir de certo horário.

### App de bolso (PWA): bancada, agenda e criativos no celular (13/08/2026)

O site virou PWA instalável ("Lagosta de Bolso") — plano e decisões em
`docs/PLANO-2026-08-12-APP-MOBILE-BANCADA-AGENDA.md`. Regras que valem para
código novo:

- **A arte aparece INTEIRA, na proporção em que foi gerada — nunca cortada.**
  Requisito do Ciro (13/08): `object-contain` sobre `bg-muted`, contêiner na
  proporção do formato (`aspectClassForPostType`). Os quatro `object-cover`
  da agenda foram trocados; componente novo que exiba arte segue o mesmo.
- **Ícones do PWA**: `scripts/gerar-icones-pwa.ts` (sharp sobre SVG inline)
  gera `public/icons/*`. Maskable é arquivo SEPARADO com quadro cheio — o
  launcher recorta com a própria máscara; reusar o ícone de cantos
  transparentes vazaria os cantos. O "L" é path, não `<text>` (fonte no
  librsvg depende da máquina). O manifest é estático; o ícone dinâmico do
  admin não o afeta — trocar o ícone do app instalado exige regerar os PNGs.
- **A tabbar mobile só monta no ramo normal do layout protegido** — o ramo
  full-bleed é o editor de canvas, e a barra cobriria a área de trabalho.
- 🔴 **Post de LEMBRETE nunca passa pelo publicar-agora do PUT.** O executor
  ignora `publishType: REMINDER` de propósito; armar o PUT nesses posts podia
  até mandar lembrete ao Zernio. O caminho é a tela de publicação manual
  (`/projects/[id]/agenda/[postId]/publicar`: salvar no rolo, copiar legenda
  e 1º comentário, abrir Instagram). Ela NÃO marca o post como publicado —
  quem confirma publicação de story é a verificação de sempre.
- **Post congelado (`congelado` da API) não mostra Publicar Agora** — antes
  o botão aparecia; esconder é deliberado, junto com editar/melhorar.
- **Card da grade da agenda não é mais um `<button>` único**: virou `<div>`
  com botão interno, porque ação rápida dentro dele criaria botão dentro de
  botão (HTML inválido). Overlay novo entra como irmão do botão interno.
- 🔴 **Arquivar entrada da base é `PUT { status: 'ARCHIVED' }`, NUNCA o
  DELETE** — o DELETE da rota apaga a entrada E os vetores de vez. E o
  `expiresAt` fica FORA do payload de edição: na rota, ausente = não mexe,
  `null` = LIMPA o prazo da campanha em silêncio.
- **`POST /api/projects/[id]/executar-plano`** replica o gate do MCP: sem
  `confirmar === true` literal nada é escrito e volta a conta. O disparo
  imediato (F0.3) é da ROTA, em `after()`, limitado a 3 jobs e só quando o
  handler consumiu < 60s — o resto sai pelo cron em ≤ 1 min. O diálogo da
  conta fala em PEÇAS, nunca em créditos; saldo curto avisa, não veta.
- **Upload de foto do celular → acervo** (`acervo-upload.ts`): a pasta
  "Fotos do Celular" nasce FILHA DIRETA da raiz de imagens do projeto — a
  mesma que `reconciliarCatalogo` varre, então a foto é catalogada na rodada
  das 02:00. Bytes ORIGINAIS para o Drive (insumo não se reencoda; sem EXIF
  rotate). HEIC do iPhone é farejado no cabeçalho e recusado com orientação
  (sharp 0.33.5 não decodifica HEVC; o Safari costuma transcodificar ao
  escolher do rolo). 🔴 Garantir pasta exige paginação completa da listagem
  — `listFiles` tem pageSize 50 fixo e raiz cheia criaria pasta duplicada.
  Projeto SEM catálogo continua fora da busca por tema (o cron o pula) —
  a foto aparece só por pasta até a análise manual.
- 🔴 **Nunca chamar `/slots` para uma LISTA de clientes** — cada chamada
  emite sugestões como `LearningSignal`; em lista, geraria sinal para
  cliente que ninguém abriu. O resumo do seletor da bancada agrega UMA
  chamada ao calendário global. Na bancada do projeto, a cobertura reusa a
  MESMA queryKey de slots do compositor (uma ida por página).
- **O calendário global não traz `slotValues`** (o por projeto também não) e
  "expande" posts recorrentes com `isRecurringPlaceholder: true` no 1º dia
  da janela — quem agrega descarta os placeholders, senão conta post que
  não existe.
- **"A semana está coberta ✓" exige ritmo aprendido**: `sugestoes` vazio com
  `cadencia` vazia é cold start, não cobertura.
- 🔴 **`/api/drive/thumbnail` devolvia o ORIGINAL** — `getThumbnailStream`
  ignorava o `size` e mandava os bytes inteiros (`alt: 'media'`), contando
  com o `<Image>` do Next para reduzir; o seletor de fotos renderiza
  `unoptimized`, então 40 células decodificavam ~48MB de bitmap cada e o
  Safari do iPhone matava a aba ("Um problema ocorreu repetidamente" na
  bancada, 13/08). Hoje o serviço honra o tamanho: `thumbnailLink` do
  Google (lh3, consumido no servidor — o link é assinado e expira, nunca
  repassar ao cliente) com fallback sharp (`.rotate()` para o EXIF).
  Consumidor de miniatura passa `?size=` explícito — também é o
  cache-buster contra os originais que ficaram no cache do navegador.
  O pipeline de IA não passa por essa rota (extrai o `fileId` e baixa o
  original direto), então miniatura pequena não afeta geração.

### A voz isolada: o stem que a separação sempre produziu e ninguém guardava (22/08/2026)

A biblioteca de músicas passou a guardar **três** arquivos por faixa — original,
instrumental e **voz isolada**. Não há separação nova: o MVSEP (`sep_type: 48`,
MelBand Roformer) **sempre** devolveu os dois stems, o cliente baixava os dois,
salvava o instrumental e jogava a voz fora. Colunas `hasVocalsStem` /
`vocalsUrl` / `vocalsSize` em `MusicLibrary`, espelhando o instrumental.

- 🔴 **`getFileName` nunca casou com a resposta REAL da API.** Ele procurava
  `name`/`filename`/`file_name`/`title`, e o MVSEP não manda nenhum desses — o
  nome vem em **`download`** e o tipo em **`type`**. Medido em 22/08 contra o
  job real: os dois arquivos liam `'unknown.mp3'`, então TODA a classificação
  por nome era morta e o código caía sempre no palpite final ("pega o último
  arquivo"). Acertava por sorte, porque a ordem do MVSEP é `[Vocals, Other]`.
  Log que imprime `unknown` para tudo é sinal de leitor quebrado, não de API
  pobre.
- 🔴 **O instrumental se chama "Other", não "instrumental".** É `type: "Other"`
  no modelo de DOIS stems — e só ali: num modelo de quatro (bateria, baixo,
  outros, voz) "other" é uma faixa própria. Por isso a inferência
  `other → instrumental` é aplicada **apenas com exatamente 2 arquivos**.
- 🔴 **A ordem da classificação importa: "no_vocals" CONTÉM "vocal".** O
  instrumental é decidido PRIMEIRO e a voz é procurada só no que sobrou.
  Invertido, os dois arquivos trocam de lugar — e esse defeito sai CALADO: o
  vídeo publica a faixa cantada achando que é o playback.
- **"music" ficou de fora das marcas de instrumental**, de propósito: o título
  da faixa vem embutido no nome do arquivo e "Music Box" cairia lá. O
  complemento (com 2 arquivos, o que não é voz é instrumental) resolve o mesmo
  caso sem depender do título.
- **A classificação mora em módulo PURO** (`src/lib/mvsep/classificar-stems.ts`),
  sem Prisma — `@/lib/db` lança no import sem `DATABASE_URL`, e esta é a decisão
  que mais precisa ser conferida sozinha. `scripts/validar-classificacao-de-stems.ts`
  roda 12 casos (inclusive a forma real da API) sem banco, sem rede e sem custo.
- **A voz é ADITIVA e nunca derruba o instrumental.** Se o download dela falhar,
  o job termina `completed` com o instrumental — regredir a separação que já
  funcionava por causa do arquivo novo seria trocar um problema por outro pior.
  Mesma razão pela qual o ZIP segue sem o stem que não baixou, e o export de
  vídeo cai no original quando o stem pedido ainda não existe (nunca vídeo mudo).
- 🔴 **O resultado do MVSEP EXPIRA em poucos dias.** Medido em 22/08: jobs de 2
  dias antes ainda respondiam `done`; o de 3 dias já era `not_found`. Por isso
  `scripts/recuperar-voz-das-musicas.ts` tenta primeiro o `mvsepJobHash` guardado
  (de graça) e só depois oferece `--reprocessar`, que custa uma separação nova
  por faixa — e o cron processa **UMA a cada 2 minutos**. Dry-run por padrão.
- **`audioVersion` virou `original | instrumental | vocals`** nas 8 casas onde
  o enum vive (tipo da página, dois zods de rota, modal, painel do editor, botão
  de export, `process-video-job`). Enum de áudio novo precisa passar por todas —
  o `tsc` pega as de tipo, mas não os textos de rótulo.

### 🔴 O download do YouTube trava quando a aba fecha (22/08/2026)

A última etapa de um download — baixar o MP3 do CDN e subir para o Blob — roda
**no NAVEGADOR**, não no servidor: o CDN do RapidAPI (123tokyo.xyz) responde 404
para IPs de datacenter e só serve IPs residenciais (com CORS aberto). Isso está
documentado em `video-download-client.ts` e foi confirmado em 22/08 — daqui, de
IP residencial, o mesmo link responde 206.

A consequência não estava documentada e derrubou **3 downloads num dia**:

- 🔴 **Nenhum ramo do cron cobre `downloading` COM link.** Os três ramos de
  `process-youtube-downloads` pegam `downloading + startedAt < 2h` (limpeza),
  `pending + videoApiStatus=processing` (refresh) e `downloading + SEM link`
  (check). Um job com link e sem música não é visto por nenhum — medido: 0, 0 e
  0 contra dois jobs parados. Só o navegador o resolve, e só com a página
  aberta. Fechada a aba, ele fica parado até o expurgo de 2h marcá-lo como
  falho — e o link assinado (`s=` na URL) expira mais ou menos junto.
- 🔴 **A tela mostrava progresso falso.** Nesse estado a copy era
  "Preparando download... 50%" com spinner e barra, sem botão nenhum —
  indistinguível de trabalho em andamento. Hoje há um ramo próprio ("Falta
  baixar o arquivo") com **Baixar agora**, e ele exige o orçamento automático
  esgotado para não piscar ao abrir a página.
- 🔴 **O retry automático era um laço.** No erro o guard por link era zerado, e
  como `job` é repolado a cada 5s o efeito reentrava para sempre, martelando o
  CDN e piscando o erro. Agora são no máximo `MAX_TENTATIVAS_AUTO = 2` por
  link; esgotado, só no botão.
- **`scripts/destravar-downloads-do-youtube.ts`** faz o papel do navegador e
  completa o que ficou para trás (dry-run por padrão). **Só funciona de máquina
  com IP residencial** — de dentro da Vercel o CDN recusa. Ele confere a
  expiração do link antes de tentar.
- ⚠️ **`startYoutubeDownloadJob` é código morto** (nenhum chamador) e cria o job
  com `videoApiStatus` NULO — estado que o ramo de refresh não enxerga. Se
  alguém voltar a usá-la, precisa gravar `videoApiStatus`, senão nasce um job
  invisível para o cron e para o expurgo.

### O registro único de tools MCP (25/08/2026)

As 48 tools do conector vivem em **`src/lib/mcp/catalogo/`** (um arquivo por
domínio), declaradas UMA vez com `definirTool` — schema zod (`.strict()`
aplicado pelo construtor), `annotations` obrigatórias, `acesso` declarado,
`superficies` — e executadas pela porta única
(`src/lib/mcp/registro/porta.ts`): apelido → superfície → coerção → validação →
gate → handler. O desenho nasceu da análise do framework Invokta (24/08);
7 commits `a20b8b94..626f69ef`. Regras que valem para código novo:

- **Tool nova = uma declaração no catálogo.** `tools/list` (com annotations),
  validação real de `required`/`type`/`enum` na porta, o registro no servidor
  local e a verificação das INSTRUCTIONS derivam dela. `tools.ts` virou só os
  helpers de acesso/identidade (`projetosVisiveis`, asserts, `resolver*`,
  `itemParaChat`) — os handlers os alcançam por `await import()`.
- 🔴 **Arquivo de domínio do catálogo carrega SEM env**: import estático só de
  módulo puro (zod, `registro/`); db e serviços entram por `await import()`
  RELATIVO dentro do handler (o tsx do servidor local resolve `@/`, mas a
  regra é relativo). É o que deixa `scripts/validar-registro-mcp.ts` rodar no
  CI sem `DATABASE_URL` — e o próprio import do catálogo é metade do teste.
- **Comportamentos calibrados por incidente são preservados verbatim**: a
  mensagem de parâmetro desconhecido (12/08) e a coerção de string JSON ANTES
  do parse (23/08 — estritar sem coerção recusaria chamada que funciona).
  Chave desconhecida ANINHADA aponta o caminho (`"itens.0" não aceita…`),
  nunca os parâmetros da raiz.
- **Vocabulário que não pode entrar estático vira espelho + sentinela**:
  `CATEGORIAS_DA_BASE`/`SECOES_DO_DNA` (base-e-dna.ts) e o "Máximo 60" de
  criar-plano são cravados no catálogo e conferidos no load de
  `catalogo/integracao.ts` contra os donos (enum do Prisma,
  `BRAND_DNA_FIELDS`, `MAX_ITENS_POR_PLANO`) — divergiu, o boot quebra.
- 🔴 **As 6 tools inglesas do servidor local (list-posts, list-projects,
  get-knowledge, prepare-creative, create-arte-rapida, list-drive-images) NÃO
  são duplicatas**: os contratos divergem (list-posts usa dateFrom/status EN e
  devolve lista crua) e as skills consomem ESSAS formas. São camada de
  compatibilidade explícita; os nomes PT do catálogo são os canônicos, e o
  stdio serve os dois (72 tools). Migrar as skills aposenta a camada.
- **Snapshot é a rede da migração e o padrão para MUDAR schema**: os literais
  antigos vivem como fixtures em `validar-registro-mcp.ts` (48 snapshots).
  Mudança deliberada de schema atualiza o fixture no mesmo commit — o teste
  existe para pegar mudança INVOLUNTÁRIA no que o modelo vê.
- **INSTRUCTIONS moram em `src/lib/mcp/instrucoes.ts`** (módulo puro) e a
  seção D do script recusa nome de tool hifenizado que não exista no catálogo
  (allowlist explícita para ênclise: "grave-a"). Foi o que aposentou de vez o
  caso `ver-melhoria` recomendado 13 dias depois de morrer.
- **O batch JSON-RPC do route.ts é SEQUENCIAL** — `Promise.all` deixava 12
  `gerar-imagem` num array lerem o mesmo saldo antes de qualquer dedução.
  Batching saiu da spec MCP em 2025-06-18; recusar arrays fica para quando a
  telemetria mostrar zero chegando.
- **Bug consertado na travessia**: `ver-geracao` exigia `melhoriaId`
  (`requireString`) — quem seguia a instrução do próprio `gerar-imagem` e
  chamava com `geracaoId` tomava erro. Hoje qualquer um dos dois vale.
- **Gate mecânico de `executar-plano` intocado** (1ª chamada devolve a conta;
  só `confirmar: true` literal produz): é gate de COBRANÇA, e converter o
  envelope para erro da taxonomia seria mudança de comportamento — fica como
  decisão futura deliberada, nunca efeito colateral de migração.
- `scripts/gerar-catalogo-tools.ts` emite o catálogo em markdown para as
  skills pararem de descrever tools à mão.

### Canvas de design: arte em HTML, sem crédito (25-26/08/2026)

Caminho alternativo à geração por IA: a peça é escrita em HTML (`.dc.html`),
editada num canvas publicado (skill `/design`), renderizada com Chrome
headless no tamanho de publicação e ingerida por `upload-creative`. **Zero
crédito de imagem.** Nasceu do placar do O Quintal Parrilla na via de IA —
0 "gostei" contra 14 "preciso melhorar" — e já rodou num segundo cliente
(carrossel de domingo do By Rock, 4 slides de feed).

**O manual é `docs/SESSAO-2026-08-25-CANVAS-DE-DESIGN.md`** — a seção 3 é o
passo a passo para outro cliente e a **seção 4 tem as armadilhas medidas**.
Leia antes de escrever qualquer artboard; as três que mais custaram:

- 🔴 **Imagem entra por `<img src="...">`; `url()` no CSS NÃO resolve** (4.7).
  A substituição só alcança o atributo `src`. Sintoma: na mesma peça, a logo
  aparece e a foto de fundo some — quatro slides publicados com fundo preto,
  sem erro nenhum. As imagens estavam certas no estado e o `--check` passou:
  o defeito é só a forma de citar. A doc da própria ferramenta afirma que
  `url()` funciona em qualquer aspa — **não funciona**, não gaste rodada
  variando aspas ou caminho. Fundo é `<img>` absoluto atrás, véu como camada
  irmã, texto em fluxo por cima.
- 🔴 **O editor faz layout por FLUXO, não posicionamento livre** (4.1): cada
  linha como item direto do flex é o que funciona; não há arrastar para
  coordenada arbitrária — posição exata se ajusta no gerador.
- 🔴 **Nenhum bloco pode herdar do pai** (4.2): tamanho em `em` sobre `--base`
  do raiz faz a fonte encolher e o item pular para o topo ao ser movido.
  px absoluto em cada bloco.

**Arquivos de trabalho por leva** em `design-canvas/<cliente>-<assunto>/`,
com o `render.py` da leva ao lado — o renderizador NÃO é compartilhado: cada
série tem formato, véu e fontes próprios (o do Quintal é 1080x1920 e resolve
holes; o do By Rock é 1080x1350 e é estático). **A foto do render vem de
`fotos/` (original), nunca da versão comprimida que o canvas embute** — no
canvas ela cabe em ~50 KB, que serve para revisar layout e não para publicar.

### A melhoria de artes na carteira inteira (02/09/2026)

Plano em `docs/PLANO-2026-09-01-MELHORIA-DE-ARTES.md` (F0–F6), executado em
02/09 depois do teste real de 01/09 no Quintal. Regras que valem para código
novo:

- 🔴 **A régua protege o que EXISTE; o buraco é o que o prompt sugere e a copy
  não tem.** O happy hour do Quintal voltou com "Rua Fernandes Tourinho, 133 ·
  Savassi, Belo Horizonte" e `textCheck: passed` (01/09). `passed` confere o que
  falta; `blocosAMais` (`text-comparison.ts`, puro) confere o que sobra, e
  separa bloco com DADO (endereço, hora, preço, cidade — `pareceDado`) de
  decoração. **Só avisa** (`textoAMaisAlerta`, decisão do Ciro) — a galeria e o
  `ver-geracao` mostram, o runner nunca regera por isso.
- **Régua sem bloco de serviço vira PROIBIÇÃO de criar rodapé** (regra 1 de
  `regras-da-melhoria.ts`), toda régua ganha CONTAGEM DE BLOCOS ("exatamente N,
  nem um a mais"), e os fatos oficiais da base (endereço, horário —
  `loadFatosDoCliente`) entram SÓ quando a régua tem serviço, como conferência.
  Sem serviço eles seriam justamente o dado que o modelo usaria para preencher.
- **`blocosDeServico` reconhece a linha dos modelos do Studio**: "Quinta, das
  11h às 00h · Praia do Canto, Vitória-ES" sobrava 31 chars e não era serviço.
  Dia no COMEÇO da linha é descontado; localidade (bairro/cidade/UF) junto de um
  horário é serviço.
- **`fieldValues.regua`** (`banco | linhagem | visao | nenhuma`) é gravado por
  extenso — `textCheckReason` mentia por omissão. E os `textos` propagam também
  pelo ramo de falha de cobrança, que os apagava.
- 🔴 **"quinta" está dentro de "Quintal".** `casaComDia` casava por substring e
  TODO template de "O Quintal Parrilla — …" era de quinta: foi assim que
  `escolher-modelo("funcionamento")` devolveu "Celebrações Especiais" pelo
  fallback só-dia. Hoje casa por TOKEN (`dia-semana.ts`), tema sem match é
  `NO_TEMPLATE_MATCH` com sugestão explícita (nunca o primeiro da lista), e
  `casaTemaComTags` exige ≥ 4 letras e início de token. Modelo errado com copy
  certa é pior que cair na IA.
- **A arte de MODELO passou a parecer a de IA** (`src/lib/creatives/halo/`):
  `renderShape` desenha `effects.blur` num offscreen com stack blur nos pixels
  da PRÓPRIA forma (folga 3× o raio); o `ShapeNode` do editor usa
  `Konva.Filters.Blur` + cache com offset; `aplicar-halo.ts` agrupa os textos
  em blocos, mede a luz da foto COMO ELA APARECE (cover, sem
  `extract().stats()`), calibra pelo alvo da cor (tinta ZERO em foto escura) e
  troca as camadas `veu*` por halos entre a foto e o texto. `createArteRapida`
  faz isso na família `lote-tema-2026-08` (ou página com véu), best-effort.
  ⚠️ O stack blur do Konva alcança ~R px; o `blur(R)` do canvas é gaussiano e
  desmancha mais longe — se a peça sair "dura", o lugar é o `blurRadius` em
  `montarCamadaDeHalo`, não o `_halo.py`.
- **Layout pela foto** (`layout-pela-foto.ts`, puro): nos templates "(3
  layouts)" o irmão é escolhido pela energia e luz das faixas (calma em cima →
  Topo; embaixo → Rodapé; < 12% → Dividido), salvo `layoutFixo`. Medido em
  02/09: funcionamento e happy hour foram ao rodapé, o executivo ao topo.
- **A grade da base manda no horário** (`grade-da-base.ts`, puro, desconfiado
  de propósito: só linha que DECLARA slot; linha de funcionamento e de feed
  ficam fora). `sugerirPosts` substitui a cadência nos dias que a grade cobre
  (`origem: 'grade'`, safra `grade-v1`). Quinta do Quintal: 08h/09h/14h.
- **Apagar rascunho devolve a foto ao rodízio**: `desfazerUsoDeFotoDoPost`
  roda ANTES do delete nos TRÊS caminhos, subindo a linhagem — o post aponta
  para a MELHORIA e o `PhotoUsage` está na original. **Explorar não é decidir**:
  `buscar-fotos` tem `explorando`, e sinal de foto expira em 24h.
- **As duas portas têm a MESMA melhoria**: `applyToItemDePlanoId`/`applyToPlanoId`/
  `applyToSlideOrdem` atravessam modal → fila local → rota → serviço → runner,
  que reaponta o item (ou slide) por `transicionarItem` ao terminar. A prévia da
  bancada tem "Melhorar com IA" só em card vindo do plano. No MCP,
  `melhorar-arte` aceita `itemId` (OU `postId`) e `editar-item-do-plano` aceita
  `generationId` ("usa esta arte"). A bancada ainda troca a via de `template`
  para `ia` ao apertar Gerar — registrado, não mudado.
- **A régua por construção do canvas é o `entrega.json`** (`design-canvas/
  _entrega.py`): `[{arquivo, textos[], quando?, tema?, itemId?}]`, com
  `textos: []` como AFIRMAÇÃO de foto pura. Os 5 geradores das levas com halo
  o escrevem; `upload-creative` lê por `entregaPath` e sobe cada render COM a
  sua copy numa chamada, com destino opcional na bancada (`planoId`). Skill
  `agendar-artes` atualizada.
- **O prompt da GERAÇÃO e o da melhoria falam em HALO, não em véu** (Ciro,
  02/09/2026: "a geração precisa usar o halo no lugar do véu"). Regras 4/4b/4c
  do `image-prompt-builder` e regra 3 das regras da casa: mancha escura
  DESFOCADA só atrás do bloco de texto, sem borda, no máximo ~1/3 do quadro;
  proibido gradiente de faixa de borda a borda, tarja, topo ou rodapé inteiros
  escurecidos. O LOOK SPINE do carrossel repete "halo de leitura".
  🔴 **A regra geral não segurou o rodapé**: medido em produção na Wine Vix
  (02/09), a manchete pousou num halo local e o gpt-image ainda escureceu o
  quinto inferior INTEIRO, de borda a borda, para as duas linhas de serviço —
  "rodapé" puxa para faixa tanto quanto para a borda. O halo do serviço é dito
  DENTRO de `[SERVIÇO — LUGAR FIXO NO RODAPÉ]` (`blocos-de-servico.ts`):
  instrução colada ao bloco vence a regra geral, lição de 17/08.
- 🔴 **A caixa da arte de origem manda no prompt da melhoria** (Bacana,
  02/09/2026: "as letras devem ser em caixa alta"). `aplicarCaixaDaOrigem`
  transcreve a origem e põe cada bloco em [TEXTO EXATO] na caixa em que a
  arte já o mostra, decidido pela MAIORIA das letras (a visão transcreve o
  wordmark da logo em minúsculo e derrubava a unanimidade); no primeiro bloco
  o mapa `CAIXA_DA_MANCHETE` vence (Bacana = `alta`). A régua da conferência
  segue a copy como veio.
- 🔴 **Texto a mais desconta o que JÁ ESTAVA na origem**: o print de cardápio
  dentro do mockup (Lagosta Criativa) disparava o alerta em toda rodada. Quando
  sobra texto a mais, a origem é transcrita e o que está nela sai do alarme.
- 🔴 **A logo na melhoria segue o `compor` da geração** (`logo-na-melhoria.ts`):
  com o arquivo oficial como referência o gpt-image ainda redesenhou o selo da
  Wine Vix com letras aproximadas, e casar o selo desenhado por correlação de
  bordas NÃO achou (0,12 no lugar certo — polaridade e proporções mudam). Para
  projeto em `compor` (TERO, Lagosta, Wine Vix) o prompt reserva o canto, a
  logo não vai como referência e o PNG oficial é colado por `comporLogo` no
  canto mais calmo com contraste. Sem logo escolhida, a oficial do projeto
  entra por padrão (`loadImprovementAssets`).
- **Medir antes de mexer no prompt**: `scripts/medir-melhoria.ts` (KPI
  semanal, também no relatório de domingo), `medir-melhoria-da-carteira.ts`
  (1 story + 1 feed por cliente, n rodadas, folha de contato) e
  `spike-melhoria-com-mascara.ts` (F5: máscara do `images.edit` a partir das
  caixas de texto da página; a medida é a diferença de pixels FORA da máscara,
  que tem de ser zero). Dry-run por padrão nos três.
- **Modelos do Quintal saneados em 02/09**: página legada `Pag.01` despromovida,
  "17h" de fábrica → 16h, e o lote regenerado com halo + tema `funcionamento`
  (`sanear-modelos-quintal.ts`, `criar-templates-por-tema.ts --projeto 2`). Não
  há modelo de ALMOÇO EXECUTIVO no pool — o teste caiu no de parrilla; cadastrar
  é curadoria, não código.

### Halo: a leitura do texto sobre a foto sem véu (01/09/2026)

O véu — gradiente que escurecia a faixa INTEIRA do topo ou do rodapé — foi
reprovado duas vezes pelo Ciro ("muito marcado", "essa estratégia não vai
funcionar"). No lugar entrou o **halo**: uma caixa escura atrás do bloco de
texto, com `filter: blur()` nela mesma, que desmancha nas bordas e escurece só
onde a letra cai. Nasceu no By Rock e foi portado em 8 sessões paralelas (uma
por cliente, prompts em `design-canvas/_halo-sessoes/`). O módulo compartilhado
é **`design-canvas/_halo.py`** — o docstring dele É o manual, com o roteiro de
11 defeitos na ordem em que apareceram. Leia antes de portar para cliente novo.

- 🔴 **`filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`.**
  `backdrop-filter` desfoca a FOTOGRAFIA (lente fora de foco); `filter`
  desmancha só a mancha e deixa a foto nítida por baixo. É o coração da ideia.
- 🔴 **Não herde os números do By Rock** (tinta 0,62–0,97, raio 124–158). O
  blur é uma gaussiana de desvio `raio`: caixa mais baixa que ~2× o raio nunca
  chega à tinta cheia no miolo, que é onde a letra cai. Cada cliente calibrou o
  seu (TERO 74–96, Empório 72–96, Seu Quinto 78–112) e a `escala` da marca foi
  de 0,34 (Espeto) a 1,55 (Empório) — o oposto um do outro, os dois medidos.
- **A tinta sai de um ALVO por cor de texto** (`alvo_por_contraste` +
  `tinta_para_alvo`, WCAG 3:1), não de um número arbitrado: creme pede fundo
  ≤139, verde do Quintal ≤69, e **foto já escura recebe tinta ZERO** (16 de 63
  blocos no TERO, 6 de 43 no Espeto). Há cor que o halo NÃO serve — o vermelho
  `#F4301A` do Espeto exigiria fundo ≤51, que é o véu de volta; quem resolve é
  sombra presa ao GLIFO. Ornamento fino (<8px) não vota no alvo.
- 🔴 **Mede-se o RETÂNGULO DO TEXTO, por percentil, nunca a faixa nem a média.**
  A média deixa o texto sumir sobre a mancha clara pequena (cadeira branca no
  TERO: média 54, 15% da área acima de 200). O retângulo vem de uma sonda de
  `getBoundingClientRect` no Chrome — e ela precisa esperar as IMAGENS, não só
  `document.fonts.ready`: lockup de marca sem altura declarada mede 0px antes
  de carregar (corrida real no Espeto). Retângulo degenerado derruba a geração.
- 🔴 **Saturação HSV MENTE quando a tinta tem cor**: o marrom do Espeto
  "ganhava" 2,4% pelo HSV com a foto visivelmente morta. Compare em CIELAB
  contra a foto ORIGINAL (`medir_cor.py` do Espeto).
- **Duas arquiteturas, e a armadilha 4.1 do canvas decide qual**: halo como
  FILHO do bloco (`envolver_linhas`, `width: fit-content`) quando o artboard é
  estático; camada IRMÃ absoluta com a caixa MEDIDA (Quintal) quando cada linha
  precisa seguir item direto do flex para o editor mover. Filho de bloco exige
  `position: relative; z-index: 1` em todo irmão opaco (o print de avaliação
  do TERO saiu cinza) e nos selos absolutos (Real).
- **Tudo que dependia do véu precisa do próprio halo** — a logo principalmente
  (quase sumiu no By Rock, no Real e no Empório). EXCETO disco opaco e colorido
  (o Q do Seu Quinto): ali a mancha só suja, e quem protege é a escolha da
  VARIANTE por contraste de cor.
- **Fundo claro, liso e uniforme é o pior caso** (tijolo do Quintal: desvio
  22). Ali a mancha só some com raio e margem grandes (`margem = 1,4 × raio`
  põe o texto no platô). Tinta no teto de 0,95 é sinal de CURADORIA — aquela
  foto não carrega aquela linha ali — e o gerador imprime a lista.
- 🔴 **Leva publicada ou agendada NÃO se regera só para trocar o mecanismo.**
  O Espeto (semana no ar) recusa sobrescrever os artboards sem `CONFIRMAR=1`,
  e todo gerador mantém `MODO=veu` reproduzindo o antigo — no Espeto, byte a
  byte contra os 34 publicados, e foi essa prova que pegou dois defeitos.
- **Situação por cliente em 01/09/2026**: By Rock semana 1 já está na agenda
  com halo (17 posts, 01/09 18h); Wine Vix (24 rascunhos) e Quintal (14
  rascunhos) têm artboards e renders com halo na pasta, mas a agenda ainda
  carrega a arte de véu de 31/08 — trocar é decisão do Ciro; TERO está com o
  halo pronto **aguardando o aval dele** (a semana foi cancelada, não há post);
  Espeto segue no véu até a próxima leva; Bacana, Empório, Seu Quinto e Real
  têm só o PADRÃO (2–3 artboards) portado. O canvas publicado do Bacana ainda
  é o do véu (resemear pelo `/design`), e o DNA do Empório descreve o véu como
  mecanismo da marca — prosa desatualizada, não regra.
- **No git só entra código, artboard, json e relatório** (`.gitignore`):
  fotos, previews, renders, amostras e o bundle do canvas (`<leva>.html`, até
  10 MB de base64) ficam fora — eram 3,5 GB. Render e bundle se refazem.

### A sugestão de fotos aprende: score, prata da casa e a semana como conjunto (30/08/2026)

O acervo deixou de ser ordenado só por "menos usada primeiro" (medido: 12% de
aceitação, 53% das trocas fora do top-10 — a foto ruim nunca escolhida morava
no topo para sempre). Plano completo e placar em
`docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md`. Regras que valem para código novo:

- **A ordem do acervo é o score de `ranquearAcervo`**
  (`src/lib/creatives/ranquear-acervo.ts`, PURO): destaque > escolha (correção
  > busca; no tema > global) > rejeição desce; o rodízio virou DESEMPATE, e
  entre nunca-avaliadas vale a semente diária (hash por `driveFileId+dia` —
  estável dentro do dia, porque a paginação por offset exige). Score ORDENA,
  nunca esconde. A safra é `acervo-v2` — mudou a heurística, suba a versão.
- 🔴 **Script/validação NUNCA chama `buscarNoAcervo`** — ela registra um
  `LearningSignal` por busca. Os insumos saem por `lerCatalogoDoProjeto` +
  `montarInsumosDeRanking` (exports de `acervo.ts` sem registro) +
  `filtrarAcervo`/`ranquearAcervo` puros. O backtest
  (`scripts/validar-ranking-do-acervo.ts`) existe assim.
- 🔴 **`QUALIDADE_ALTA = 0` é MEDIÇÃO, não esquecimento**: 93–99% de cada
  acervo está marcado 'alta' — era um muro sem informação que enterrava a foto
  certa (backtest 30/08). `BAIXA` −6 fica ('baixa' é raro e informativo). Não
  restaurar sem re-medir.
- **O que o backtest ensinou**: com qualquer sinal aprendido da foto, top-3 em
  91,7% (mediana 1,5); sem sinal, não há o que aprender — **corpus é a
  alavanca, não peso**. `ranquearAcervo(entrada, pesos?)` aceita pesos para
  calibração offline.
- **`PhotoDestaque` mora no BANCO** (corrida + regeração do catálogo, as duas
  razões do `PhotoUsage`); despromover é `revogadoEm`, NUNCA delete; a semente
  (`scripts/semear-destaques.ts`) jamais ressemeia revogado. Curadoria exige
  curador nas três portas (rota web espelha `/modelos`; MCP
  `marcar-foto-destaque` usa acesso `curador`; o picker mostra a estrela e
  trata o 403). Semeada em produção em 30/08: 105 destaques.
- **`catalogadaEm` só existe nas entradas NOVAS do catálogo** (reconciliação
  carimba; o diff não retoca as antigas — aqui isso é o comportamento certo:
  ausência = sem boost de novidade). Teto da reconciliação: 200 fotos
  novas/cliente/noite; quem corta primeiro numa leva gigante é o orçamento de
  240s, e o excedente rola.
- 🔴 **Fechamento fiel ao card**: `fecharSugestaoDeFoto` aceita `fotoDoCard`, e
  quando a foto usada é a que o card mostrou o desfecho é `aceita-como-veio`
  mesmo fora do topo — a descida na lista foi do SISTEMA (dedupe de
  pasta/arquivo), não da pessoa. Caminho novo que crie arte de item de plano
  precisa passar `fotoDoCard` (hoje: `executar-plano.ts` → `createArteRapida`).
- **`ItemDePlano.fotoCandidatas`** = `[{ driveFileId, fileName, vaga:
  'score'|'exploracao', sugestaoId }]`; a `[0]` é a escolhida; o `sugestaoId`
  é o do sinal da BUSCA (o do item é o do SLOT — não confundir). Uma das 3
  vagas é exploração quando existir — é a cota que impede a ossificação da
  prata da casa.
- **`marcar-foto-como-usada` aceita `geracaoId`**, e ele importa: a colheita
  da correção pós-produção junta `troca-de-arte.generationId` ×
  `PhotoUsage.generationId` — sem o id, a foto escolhida ao refazer via
  canvas/upload fica invisível para o aprendizado.
- **`tipoDaPasta` casa por PREFIXO DE TOKEN, nunca substring** ("05_sobremesas"
  não é ambiente por conter "mesa"). Na escolha da semana, pasta vence tipo, e
  tipo só desempata entre livres.
- **`propor-semana` não emite carrossel (slides) hoje** — a regra "slides
  irmãos da mesma pasta" está documentada no ponto certo
  (`proposta-de-semana.ts`) para quando emitir.
- **O motivo da troca** (`escura`/`prato-antigo`/`nao-e-o-assunto`/`repetida`/
  `outro`, `MOTIVOS_DE_TROCA_DE_FOTO`) é opcional e pós-fato: o desfecho posta
  na troca, o chip anota depois (`anotarMotivoDaTroca`, merge cirúrgico com
  compare-and-set). Motivo inválido é DESCARTADO em silêncio — a rota de
  desfecho é fire-and-forget e continua 200.
- **KPI vivo**: `scripts/medir-sugestao-de-fotos.ts` (largada do `acervo-v2`:
  12,2% aceitação, 53,5% trocas fora do top-10);
  `scripts/relatorio-lacunas-do-acervo.ts` é o insumo do brief de fotógrafo
  (lacunas reais em 30/08: ambiente/Espeto, Happy Hour/By Rock, Almoço
  Executivo/TERO).

### O halo como efeito do editor: fundo justo à tinta (02/09/2026)

O halo do canvas de design entrou no editor Konva como extensão do efeito
`background` do texto (`fit: 'texto'` cobre só as linhas escritas; `blur`
borra a mancha nos próprios pixels). Plano e placar em
`docs/PLANO-2026-09-02-HALO-NO-EDITOR.md`; contrato puro em
`src/lib/creatives/halo/fundo-de-texto.ts`, editor em
`konva-text-background.tsx`, controles em `fundo-de-texto-controls.tsx`
(painel Efeitos e painel Gradientes, o MESMO componente).

- **A tinta é medida pela MESMA função nos dois motores** (`retanguloDasLinhas`,
  a conta do `_sceneFunc` do Konva.Text): o editor passa o `textArr` do nó, o
  servidor as linhas de `layoutTextLines` — extraído dos três renderers de
  `textMode` para a mancha medir a MESMA quebra do desenho. Paridade medida por
  perfil de luminância: ≤ 15 níveis de diferença dentro da mancha.
- 🔴 **O teto do stack blur é ~180, por OVERFLOW de int32 — não 255 pela
  tabela.** `(sum * mul[r]) >> shg[r]` com shift com sinal estoura 2³¹ entre o
  raio 180 e 190; raio 200 devolve faixas verticais e a mancha SOME, no Konva e
  no port. `escalaDoBlur` borra em buffer reduzido (`k = ceil(raio/160)`,
  `pixelRatio: 1/k` no cache do editor, offscreen a `1/k` no servidor) — a
  mancha é lisa, a redução é invisível e o custo fica limitado. O port satura
  em 180 para quem não passar pela escala. Vale para `ShapeNode` e
  `renderShapeBlurred` também (os halos que o servidor cria por bloco).
- 🔴 **O cache do `ShapeNode` sem `pixelRatio` nascia no devicePixelRatio**: em
  retina o borrão do editor saía com METADE do raio da arte publicada. Sempre
  declarar o pixelRatio de um cache que vai receber filtro.
- **Tinta em `opacity` do NÓ, nunca misturada na cor**: mudar a opacidade não
  refaz o cache do blur; o raio refaz (por isso o desfoque grava ao soltar).
- 🔴 **`Rect` irmão ANTERIOR do `Konva.Text` não vê o ref do texto no primeiro
  commit** (React liga refs e roda layout effects na ordem da árvore). Halo
  salvo abria em 0×0 até a próxima mudança; `pronto` reexecuta um frame
  depois. Todo componente-irmão que dependa do nó de outro precisa disso.
- **O fundo agora acompanha a ROTAÇÃO e SEGUE o arraste** (desenhado dentro do
  transform no servidor; reposicionado no `dragmove`/`transform` no editor). O
  Rect antigo lia `layer.position` do estado e ficava parado até o dragend.
- 🔴 **`api.get` devolve TEXTO quando a resposta não é JSON**: um redirect para
  `/sign-in` na chamada de cores virou `colors.map is not a function` e derrubou
  o editor. `useBrandColors` garante array; consumidor novo de lista faz o mesmo.
- **Textos AGRUPADOS dividem UMA mancha** (`bloco-de-fundo.ts`, F4): os textos
  de um grupo estilo Canva (`metadata.groupId`, Cmd+G) com fundo ligado viram
  um bloco — a união das tintas, desenhada pelo LÍDER (menor `order`) com a
  configuração dele; os membros não desenham. Sem grupo, cada texto tem a sua,
  e manchas vizinhas se sobrepõem (tinta 0,6 vira 0,84). O bloco é pelo GRUPO,
  não por proximidade, de propósito: mancha que se funde sozinha ao aproximar
  textos é surpresa; agrupar é gesto. O servidor enxerga os irmãos por
  `options.camadasDoDesign` (renderDesign preenche; renderLayer avulso cai no
  fundo por texto). Texto girado ou curvo fica fora do bloco.
- 🔴 **Follow por eventos de ATRIBUTO (`xChange`…), nunca por `dragmove`**: o
  arraste em grupo move os irmãos com `position()` por código, sem evento de
  drag neles. `Node._setAttr` dispara `<attr>Change` em qualquer escrita.
- **Reflow em grupos manuais foi MANTIDO** (decisão de 02/09): editor e
  servidor leem o mesmo `groupId`; refluir só de um lado divergiria a arte.
- Rich-text e texto curvo continuam sem fundo, como já eram.

### O editor como usina: compositor, assinatura e via `compor` (02/09/2026)

Plano em `docs/PLANO-2026-09-02-EDITOR-COMO-USINA.md` (F0–F5 + §8 templates +
§9 área livre), executado no mesmo dia e testado na leva de setembro da
Lagosta Criativa (63 peças). O que nasceu: `src/lib/compositor/` (a usina),
`src/lib/creatives/layer-contract.ts` (o contrato do Layer), a fila `COMPOR`,
a via `compor` dos planos, cinco tools no conector (`ver-assinatura`,
`compor-arte`, `compor-leva`, `reverter-arte`, `ver-ajustes-da-assinatura`)
e o sinal `geometria`. Regras que valem para código novo:

- **A copy chega por PAPEL e por LINHA** (`pre`, `headline`, `apoio`, `cta`,
  `servico`), e o compositor RESPEITA a quebra: ele mede cada linha com a
  fonte real, encolhe até 80% e, se não couber, recusa com ORÇAMENTO
  (`TEXTO_NAO_CABE_NA_COLUNA`, caracteres que cabem). Quebrar por conta
  própria mudaria o ritmo da frase — `copyParaBlocos` só o faz para item de
  plano, que não carrega papel.
- **A assinatura mora em DUAS casas de propósito** (§8 do plano): o ESTILO por
  papel numa PÁGINA do projeto (template `Assinatura`, página `isTemplate`
  com a tag `assinatura`, camadas de texto chamadas pelo papel) — porque a
  equipe edita página, não JSON; e os NÚMEROS (margens, safe area, faixa de
  tinta, raio, largura da logo) em `Project.assinatura`. Sem página o
  compositor RECUSA (`ASSINATURA_INCOMPLETA`): compor sem assinatura seria
  inventar a marca. Cadastro por `scripts/criar-pagina-de-assinatura.ts`
  (`--projeto <id>` ou `--todos`), com os kits em
  `scripts/lib/kits-de-assinatura.ts` — LIDOS do `PADRAO.md`/`gerar.py` do
  canvas de cada cliente. **Os 10 projetos de restaurante têm assinatura em
  produção desde 02/09/2026** (Ciro: "ajuste em todos os clientes").
  O que cada kit NÃO reproduz e fica como ajuste no editor: a segunda voz da
  headline (Quintal DomaniCP→Amithen, TERO âmbar+creme, By Rock 2ª linha
  vermelha, Wine Vix palavra dourada, Espeto palavra vermelha, Real palavra
  menta), o extrude sólido do Seu Quinto (sombra deslocada sem blur no lugar),
  ícones de serviço e filetes. 🔴 By Rock: o canvas rodava em Anton + Barlow
  (Google Fonts, não cadastradas) — o kit segue o DNA (Mortella na manchete,
  Metrisch no resto), e a manchete pode pedir corpo menor. TERO: `Montserrat
  Light` não está cadastrada; o apoio cai na regular.
- 🔴 **A posição vem da FOTO, nunca do template** (§9). `mapa-de-calma.ts`:
  grade 6×10 sobre a foto COMO APARECE (cover, no corte candidato), pontuação
  por calma (energia de borda), tinta necessária (p98 vs alvo da cor) e
  preferência; cobrir o ASSUNTO **descarta** (fração maior entre "do assunto"
  e "do bloco" — uma só deixava o texto pousar no prato quando o prato ocupa
  meio quadro). O ENQUADRAMENTO é candidato também: foto que sobra no eixo
  ganha três cortes (`cropPosition`), e o render já o lê.
- **O halo é `effects.background` no grupo de texto**, não shape solta — é o
  que faz a mancha SEGUIR o texto quando a equipe o move. A tinta anda numa
  FAIXA (`faixaTexto`, 0,26–0,58 na Lagosta), decidida pela necessidade,
  nunca perseguindo alvo (decisão do Ciro, PADRAO.md §5.0). Só a logo leva
  shape (`halo-marca`), porque o efeito é de texto.
- **A régua (`regua.ts`) mede a peça RENDERIZADA sem os textos** (cor
  transparente, halo mantido) e compara o p98 com o alvo da cor; corrige a
  tinta UMA vez dentro da faixa e AVISA — nunca reprova. `TOLERANCIA_DO_ALVO
  = 12`: um ponto acima não é defeito visível; sem ela toda peça de headline
  laranja (alvo 76) saía "fora" e o aviso virava ruído. Medido na leva: a
  maioria das peças com fundo claro fica no teto da faixa e ainda acima do
  alvo — é o preço da mancha invisível, e quem segura a leitura é a sombra
  presa ao glifo.
- 🔴 **Feed e quadrado usam `safeTopo` 120**, não 96: o autofix confere a
  margem de segurança do EDITOR (`CANVAS_MARGIN.top`), e a primeira prova
  acusou "pre invade a margem" em toda peça de feed. O compositor não pode
  pousar texto onde o editor o acusa.
- **`provar: true` renderiza em memória e não grava nada** — é o dry-run que
  fez o canvas ser iterável. Toda leva grande começa por UMA prova.
- **Fila: o MCP só enfileira** (`compor-leva`, `executar-plano`); a bancada
  compõe na hora (`gerarItemPorModelo` com via `compor`). O cron pega até 12
  composições em série DEPOIS do lote de IA, dentro de 200s. `maxAttempts`
  3, porque não há chamada paga.
- **`persistAndRenderCreative` aceita `generationId`** e FECHA a Generation
  PROCESSING da fila em vez de criar outra — a bancada segue o id que tem.
- **Snapshot em `fieldValues.layersSnapshot`** e `reverter-arte`: o "git" de
  uma peça. Página promovida a modelo não reverte (mataria curadoria).
- **`LearningSignal tipo 'geometria'`** nasce no PATCH da página, só em
  página com a tag `compositor`, balde de 10 min — mover, encolher, realinhar,
  esconder, com tolerância de 3px/2% para ruído de arraste. Destilado por
  `destilar-geometria.ts` em PROPOSTAS (n ≥ 5), nunca aplicado sozinho.
- **Contrato do Layer (F0)**: `fontWeight` múltiplo de 100, entrelinha nos
  DOIS campos, `order` renumerado, `autoExpand` ligado, `objectFit` em
  imagem — `prepararCamadasParaGravar` em toda porta de escrita de
  `Page.layers` vinda de fora do editor (`create-page`/`create-template` do
  MCP local já passam). `FEED_PORTRAIT` não existe em `TemplateType`.
- **Templates** (§8): o contêiner fica; a página-modelo como layout a
  preencher NÃO se cadastra mais (14 usos em 128, 0/33 no placar); o kit vira
  a página de assinatura. A curadoria das 147 existentes é do próximo
  planejamento — despromover, nunca excluir.
- **O que o editor perde em relação ao canvas, aceito**: gradiente em texto
  (a headline da Lagosta sai sólida), sombra de três camadas presa ao glifo
  (o editor tem uma), e o assunto do catálogo ainda não é preenchido pela
  análise de visão (o compositor usa a estimativa por energia; `assunto`
  em frações na entrada do catálogo é o contrato, quando existir).

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations
