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

### 🔴 O checkout é COMPARTILHADO: commite por worktree

Várias sessões do Claude trabalham no MESMO diretório ao mesmo tempo. O
working tree não é seu — é terreno de ninguém. Medido em 04/09/2026: **três
sessões tropeçaram nisso numa única noite**, e uma delas perdeu trabalho de
verdade.

- 🔴 **`git checkout -- <arquivo>` é DESTRUTIVO e SILENCIOSO** num arquivo que
  outra sessão está editando. Não há conflito, não há erro, não há aviso: o
  trabalho dela simplesmente desaparece. Foi assim que **107 linhas do
  `CLAUDE.md` de outra sessão sumiram** — para separar hunks próprios dos dela
  numa edição concorrente, alguém fez `cp` do arquivo, `git checkout --`,
  reaplicou os próprios hunks e restaurou os dela a partir da cópia. **O
  backup-instantâneo não protege a janela** entre o `cp` e o restore: tudo o
  que ela escreveu naqueles dois minutos foi apagado e não voltou.
- 🔴 **Commit vai para o branch em que o CHECKOUT está, não para o "seu".**
  Se outra sessão deixou o diretório num branch de feature, o seu commit cai
  no PR dela. Aconteceu duas vezes na mesma noite, uma delas com dois commits
  já empurrados quando alguém percebeu. **Confira `git branch --show-current`
  antes de commitar**, sempre.
- 🔴 **Nunca `git add -A` / `git add .`** — você leva o trabalho de outra
  sessão junto, no meio, e sem revisão. Rode `git status` e adicione arquivo
  por arquivo.

**O que fazer em vez disso: commitar por WORKTREE.**

```bash
git worktree add --detach /tmp/wt HEAD   # (ou: git worktree add /tmp/wt main)
# edite e commite LÁ, sem tocar no working tree compartilhado
git -C /tmp/wt push origin HEAD:meu-branch
git worktree remove /tmp/wt
```

O worktree tem árvore de arquivos própria e compartilha só o `.git`, então
nada do que você faz nele alcança o diretório em que as outras sessões estão
trabalhando. É o único jeito de rebasear, separar hunks ou resetar sem apagar
trabalho alheio sem perceber.

Dois complementos medidos em 05/09/2026, na quarta vez que isso quase aconteceu:

- **Para rodar typecheck e testes no worktree**, aponte os artefatos gerados por
  symlink em vez de reinstalar: `ln -sfn <repo>/node_modules <wt>/node_modules` e
  o mesmo para `prisma/generated`. Sem o segundo, o `tsc` acusa
  `Cannot find module './generated/client'` e você lê como erro do seu código.
  **Desfaça os symlinks ANTES de `git worktree remove`.**
- 🔴 **Antes de descartar qualquer coisa do compartilhado, compare linha a linha
  com o que já está na `main`.** Foi isso que evitou o quarto incidente: o
  arquivo tinha 128 linhas sujas, das quais 114 já estavam na main e 14 eram
  rascunho velho de quem tinha sido apagado — e nenhuma pertencia à terceira
  sessão, que também estava editando ali. `git checkout --` às cegas teria
  repetido o estrago original.

Quando for inevitável mexer no compartilhado: `git stash push -- <caminhos>`
com os caminhos EXATOS (nunca `-a`, nunca sem caminho), devolva imediatamente,
e confira o retorno linha a linha. Mesmo assim a janela existe — o worktree é
o caminho seguro.

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
- 🔴 **Branch do Neon é copy-on-write e envelhece**: nasce com os dados do
  momento e não acompanha a produção. Antes de testar algo que dependa de
  dado recente, `npm run db:dev:setup -- --recriar`. Isolamento verificado em
  30/07: escrita no `dev-local` não aparece na produção.
  **O modo de falha é traiçoeiro** (custou uma sessão em 04/09/2026): uma
  migração rodou em produção, a aba local seguiu mostrando o estado ANTIGO, e
  a conclusão natural — "o código não funcionou" — estava errada; o banco é
  que era outro. Por isso `npm run db:dev:status` passou a dizer quantos dias
  o branch está atrás da produção, e não só qual banco cada camada resolve.
  **Recriar troca o compute**, então o `npm run dev` que estiver de pé segura
  a conexão do branch APAGADO: reinicie o servidor depois de recriar.
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
- ⚠️ ~~`bg-zinc-400` não gera CSS neste repo~~ — **diagnóstico ERRADO, desfeito
  em 05/09/2026.** A classe está no CSS gerado; o que estava quebrado era o
  método de medição. Leia a última seção deste arquivo antes de escrever
  `style={{…}}` para fugir de uma classe do Tailwind.
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

- 🔴 **`criar-plano` cria leva NOVA, e a bancada mostra só a ativa mais
  recente** (`planoAtivo`, `createdAt desc`): criar outra para acrescentar peças
  a uma semana em andamento TIRA a anterior da tela. Para acrescentar,
  `anexarAoAtivo: true` (o mesmo `anexarItensAoPlanoAtivo` da rota web; `inicio`
  e `fim` deixam de ser obrigatórios). Até 15/09/2026 o conector não tinha essa
  porta, e anexar 4 flyers do By Rock exigiu script tsx.
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

- 🔴 **Desde 12/09/2026 `propor-semana` é automação SÓ QUANDO PEDIDA** (decisão
  do Ciro em 11/09, plano "Marca simples, copy melhor"): quem escreve a copy da
  semana é o Claude, no chat, pelas 4 etapas da programação semanal, e a
  descrição da tool deixou de dizer "é por onde começar". Ela só entra quando a
  pessoa pede com todas as letras a proposta automática do Studio. O código e
  as regras abaixo continuam valendo para quando ela roda.

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

Medido em 09-10/09/2026 (§7 do doc), ao gerar 3 stories de teste do Espeto:

- 🔴 **O aviso de "título não cabe" só valia para a ÚLTIMA peça da leva.** A
  sonda do halo roda o layout duas vezes, então havia um `del AVISOS[:]` por
  passada — que zerava também os avisos da peça ANTERIOR. Duas das três peças
  do teste estouravam a largura e **zero avisos saíram**. Consertado com um
  acumulador (`TODOS_AVISOS`) em `espeto-semana1` e no teste; os outros 22
  geradores não têm o defeito (não fazem a passada dupla). Gerador novo que
  copie o do Espeto herda a sonda: `del AVISOS[:]` exige o acumulador junto.
- **A colisão da headline com a marca NÃO é falta de conta.**
  `UTIL_STORY_COM_MARCA = UTIL - 210` existe e já é aplicada em `split` e
  `topo`. Faltava o aviso chegar — não mexa na constante.
- **Tempo, nas MESMAS 3 peças**: Pillow 9,5s (~3,2s/peça) × compositor 33-41s
  (~11-14s/peça). Mas o Pillow exclui montar a pasta e baixar as fotos, e só
  foi rápido porque o cliente já tinha gerador; o compositor inclui tudo e não
  exige preparo. Primeira peça de um cliente → compositor; vigésima de uma
  leva montada → Pillow. O cronômetro é o menor pedaço: a copy levou ~20 min
  nos dois.
- 🔴 **O gerador não OLHA as artes com estrela — ele CARREGA o padrão delas.**
  É código determinístico; a referência entra por DESTILAÇÃO, quando alguém lê
  as artes aprovadas e escreve o sistema no `gerar.py` (o da Real declara as
  fontes no docstring: manual do designer, DNA, 6 `styleRefAt` + 6 "gostei" +
  5 publicadas, 29/08/2026). O preço é que a destilação **tem data e
  envelhece**: marcar arte nova com estrela não muda o gerador. Antes de usar
  um, compare o sinal aprovado mais recente do cliente com a data no
  docstring. Na Real, em 10/09: 28/08 contra 29/08 — em dia.

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
  do `image-prompt-builder` e a regra do halo nas regras da casa da melhoria
  (era a 3, virou a **4** na renumeração de 04/09): mancha escura
  DESFOCADA só atrás do bloco de texto, sem borda;
  ⚠️ **o teto de "~1/3 do quadro" continua só na GERAÇÃO** — saiu do prompt da
  melhoria em 04/09, porque numa peça cujo texto ocupa ~80% da altura ele é
  impossível de cumprir e o modelo resolvia escurecendo tudo (ver a seção
  "A melhoria PRESCREVIA layout"). Não o reintroduza ali sem reler aquilo;
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

### Canal da arte: quem assina e por onde entrou (03/09/2026)

A Roberta filtrava a galeria por ela e via "artes que não fez". Medido: o
filtro é exato por `createdBy = clerkId`, e as dela eram dela — o que estava
quebrado era o OUTRO lado: **1.289 das 3.013 artes da carteira em 60 dias
estavam assinadas com `Project.userId`** (o id INTERNO do dono, cuid), que
não é membro do Clerk. Elas caíam num avatar "Usuário" sem nome e o card
mostrava "?". Três produtores faziam isso: a API externa do Claudinho
(`/api/external/creatives` → `createArteRapida`), o MCP local
(`upload-creative`, `create-arte-rapida`) e a mídia de post.

- **`Generation.canal`** (TEXT, indexado; precedente de `SocialPost.origem`):
  `claudinho` | `claude-ai` | `claude-code` | `studio`. É ORTOGONAL ao autor —
  `createdBy` continua sendo quem assina — e é decidido na **porta de
  entrada**, nunca no serviço: o mesmo `createArteRapida` serve ao Claudinho
  (rota externa) e ao conector. Módulo puro em `src/lib/creatives/canal.ts`.
- **No catálogo MCP o canal sai do principal** (`canalDoPrincipal`, tools.ts):
  token OAuth → `claude-ai`; principal de serviço com `clientId:
  'claude-code-local'` (o que o servidor stdio se declara) → `claude-code`;
  serviço sem marcador → `claudinho`. O handler não recebe a superfície, só
  o principal — por isso o marcador mora no `clientId`.
- **O filtro "Origem" da galeria** (`?origem=`) aceita os 4 canais mais
  `melhoria` (= `sourceGenerationId IS NOT NULL`, venha de onde vier).
  `studio` inclui canal NULO. Valor desconhecido é ignorado, nunca erro.
- **Id que não é clerkId é AUTOMAÇÃO** na UI (`ehClerkId`): o seletor de
  membros o rotula "Automações (Claudinho / Claude)" com ícone de robô, e o
  card mostra o canal em vez do avatar. Quem separa os canais é o filtro de
  origem, não o de membro.
- 🔴 **O histórico não separa Claudinho de Claude Code**, nem `claude-ai` de
  `studio`: as duas duplas gravavam assinatura idêntica. O backfill
  (`scripts/backfill-canal-das-artes.ts`, dry-run por padrão) marca id
  interno + `arte-enviada|arte-rapida|compositor|ajuste-arte` como
  `claude-code` (65 linhas de `arte-rapida` em toda a base, quase todas de
  ago-set/2026) e clerkId como `studio`. O rótulo só é EXATO daqui para
  frente.
- **Selecionar todas** entrou na barra da galeria: alcança o que está
  CARREGADO (páginas de 60); com mais por vir, o rótulo diz "as N carregadas".
  Baixar e excluir em lote já existiam e agora têm como ser usados de verdade.

### Quem assina a arte pedida pelo Claude: a pessoa do MAC (04/09/2026)

O Ciro e a Roberta usam a MESMA conta do Claude em Macs diferentes, e toda
arte pedida pelo conector ou pelo servidor local saía assinada pelo DONO do
projeto ("Automações"). A identidade não pode vir do Claude — vem da máquina.

- **`.studio-autor` na raiz do repositório** (gitignored, um por Mac) guarda o
  e-mail de login no Studio; `scripts/mcp-wrapper.sh` o exporta como
  `STUDIO_AUTOR`, e `src/lib/mcp/autor-local.ts` resolve o User e monta o
  principal do servidor local como PESSOA (`kind: 'user'`, `clientId`
  `claude-code-local`). Valor que não é usuário do Studio AVISA no stderr e
  cai no comportamento antigo — assinar errado em silêncio não.
- **`createdBy` opcional em `persistAndRenderCreative`, `comporPeca`
  (`autor`), `enfileirarPeca`, `createArteRapida` e `importarArte`**: quem
  pediu assina (no conector, o dono do token OAuth; no local, a pessoa do
  Mac); sem isso, o dono do projeto. `decididoPor` continua sendo a auditoria.
- **`canalDoPrincipal` olha o `clientId` local ANTES do tipo**: o principal do
  Mac agora é `user`, e sem essa ordem a arte do Claude Code viraria
  `claude-ai`.
- Servidor stdio lê o arquivo só ao subir: mudou o `.studio-autor`, reinicie o
  Claude Code. O `.mcp.json` do repositório tem o caminho ABSOLUTO deste Mac —
  em outra máquina o servidor entra pelo `claude mcp add` com o caminho local.

### 🔴 A melhoria PRESCREVIA layout, e desmontava a peça (04/09/2026)

Relatado pelo Ciro: a Roberta pedia melhoria e a IA não obedecia. Testado por
ela na Wine Vix, e a causa não era o modelo ignorar o pedido — era o **sistema
dando uma contra-ordem**, mais enfática e mais acima no prompt que o pedido
dela. `regras-da-melhoria.ts` inverteu: **preserva, não prescreve.**

- 🔴 **A arte era uma AGENDA e a regra mandava desmontá-la.** 13 blocos, 6
  deles "Funcionamento - 10h às 22h" / "Happy Hour - 16h às 19h", um par por
  dia. `blocosDeServico` classificou os 6 como serviço — corretamente — e a
  regra 1 então mandava "MOVA para o rodapé: isto é uma correção, não uma
  opção" e "ele sai da sequência de cima". Mas os dias existem só para rotular
  aqueles horários, e `[TEXTO EXATO]` manda reproduzir os 13 na ordem: duas
  ordens incompatíveis. O gpt-image cumpriu **as duas** — manteve a lista por
  dia E criou o rodapé, que saiu sendo a programação inteira REPETIDA. Nas duas
  rodadas de produção; uma delas com o pedido "Não inclua textos extras".
  A regra fora calibrada (17/08, 01/09) para UMA linha de horário perdida perto
  da manchete. **Não crie a guarda "e se a peça inteira for uma agenda?"** — a
  variação é grande demais (peça com serviço e sem, comunicado que foge do DNA,
  peça de um título só), e qualquer regra que decida layout sozinha erra em
  alguma delas. Decisão do Ciro: **sem pedido o modelo só REDIAGRAMA — posiciona
  melhor o texto em relação à imagem e não muda mais nada; com pedido, manda o
  pedido.**
- 🔴 **O ícone era autorizado por padrão, e ela desligava na mão.** O único
  ponto do prompt que o permitia era a regra de serviço ("um ícone pequeno pode
  separar horário de endereço"). Medido nos 74 pedidos da Roberta entre 01/08 e
  04/09: **36 (49%) eram, também, uma proibição** — "não inclua ícones" 34
  vezes, "não mude as fontes" 11, "não mude o tamanho" 5, "não mude as cores" 4,
  "não mude o alinhamento" 3. Pedido que é majoritariamente proibição é o sinal
  de que o padrão está errado, não o usuário.
- 🔴 **Falar em rodapé de serviço ABRE o slot do endereço inventado.** Com
  `temEndereco(régua)` falso, `fatosDoClienteNaMelhoria` corretamente NÃO injeta
  o endereço real — e o modelo preenche o slot que o prompt sugeriu com um
  plausível: "Dom. Pedro II, 716 | Higienópolis, São José do Rio Preto - SP",
  num cliente de Vitória (o mesmo mecanismo do Quintal em 01/09). Não dizendo
  nada sobre rodapé, o slot não existe. `textoAMaisAlerta` pegou; a conferência
  de texto deu `passed`, porque ela só confere o que FALTA.
- **`instrucaoDeEstrutura` substituiu `instrucaoDeServicoNaMelhoria`**, que
  segue exportada e testada como caminho de volta (precedente do spine estrito
  do modo livre). Saíram também "DESTAQUE AS PALAVRAS-CHAVE" (obrigava mexer em
  cor e peso — o Ciro pediu destaque 3× em 01/09 e a Roberta proibiu 15×; dois
  donos pedindo o oposto na mesma regra fixa é o sinal de que a decisão não é do
  sistema) e "TEXTO EM BLOCOS", absorvida na forma preservadora. **Ficou o que é
  preservação**: foto intocável sem pedido, não inventar dado, contagem de
  blocos, arte sem texto, halo em vez de véu, margem.
- **O `[PEDIDO DO CLIENTE]` passou a vencer as REGRAS DA CASA nominalmente.** A
  formulação antiga listava "palavras, família tipográfica, paleta e logo" como
  limite intransponível — quem pedisse "destaque o dia em dourado" pedia algo
  declarado proibido. Os dois limites que ficaram são MECÂNICOS: as palavras
  (conferidas por visão depois — mudar uma REPROVA a arte, foi o que derrubou 3
  tentativas de "altere o horário 11h30 para 11h" no Bacana em 02/09) e a logo
  (composta por código).
- 🔴 **TIRAR A LICENÇA DAS REGRAS DA CASA NÃO BASTA: ELA TAMBÉM VIVE NO DNA DE
  CADA CLIENTE.** Varredura dos 11 projetos (05/09/2026, 21 inconsistências
  confirmadas por verificação adversarial): `BrandDNA.composition` e
  `visualStyle` descrevem LAYOUT, e essa prosa é injetada inteira em
  [IDENTIDADE DA MARCA] a ~22-35% do prompt — contra a regra 1, a ~72-79%.
  Verbatim do banco: "Endereço e horário, quando entram na arte, vão SEMPRE no
  rodapé" e "separe o TÍTULO na parte superior" (Real Gelateria); "O rodapé pode
  apresentar informações de funcionamento com ícones de relógio" e "linha fina
  com losango central" (Real); "ícone de relógio antes do horário e alfinete de
  mapa antes do endereço" (Espeto, By Rock, Empório Fonseca); ornamento e selo
  em quase todos. **A premissa "o único ponto do prompt que autorizava ícone era
  a regra de serviço" era FALSA para 4 dos 11 clientes** — inclusive para aquele
  onde o defeito foi medido.
  🔴 Pior: a regra ANTIGA tinha a arbitragem ("Onde a identidade da marca fala em
  'endereço no rodapé', isso vale para peças que TÊM endereço na copy — esta não
  tem") e a reescrita a removeu JUNTO com a autorização. A regra 1 ganhou a
  cláusula de volta, agora geral e nominal: vence as descrições de LUGAR e de
  ORNAMENTO da identidade, e **não** a paleta nem a tipografia — que é o que faz
  a peça continuar sendo daquela marca. Regra nova que contradiga seção anterior
  do prompt PRECISA se declarar vencedora, como as regras 6 e 7 já fazem.
- ⚠️ **EM ABERTO, e é risco de publicação**: `[FATOS DO CLIENTE]` pode injetar
  endereço que o DNA do próprio cliente PROÍBE na arte. Na Real Gelateria o
  `contentRules` diz "Nunca o endereço completo na arte: só o NOME da unidade e o
  horário, nunca a rua e o número" e "a fábrica de Piúma nunca aparece em
  comunicação" — e os fatos entram com a rua, o número e o endereço da fábrica.
  O portão é `temEndereco(expectedTexts)`, que dá falso positivo porque
  `LOCALIDADE` casa "praia" no NOME da unidade ("Real Praia do Canto"). Não
  consertado nesta leva: exige decidir entre estreitar `temEndereco` e filtrar os
  fatos pelas proibições do DNA.
- 🔴 **A LICENÇA DO PEDIDO PRECISA SER ESTREITA — e errar isso é pior que não
  ter cláusula.** A 1ª redação abria com "as regras 1 a 4 acima descrevem o que
  fazer quando ninguém pede nada", e o modelo lia: há um pedido, logo elas não
  valem — inclusive o "não repita nenhum bloco". Medido com o pedido REAL da
  Roberta, que só PROÍBE ("não inclua ícones. Não inclua textos extras") e não
  pede mudança nenhuma: numa leva de 2 rodadas o rodapé duplicado voltou nas
  DUAS (8 e 7 blocos repetidos) — **pior que o prompt antigo na mesma leva**.
  Com a cláusula estreitada ("NAQUILO QUE ELE PEDIR" + "pedido que apenas
  PROÍBE não revoga nada, acrescenta uma restrição"), 4 rodadas seguidas sem
  duplicação. **Metade do que a equipe escreve é proibição** — 34 dos 74
  pedidos —, então este é o formato que mais importa acertar.
- **Medido** com `scripts/medir-regras-da-melhoria.ts` (A/B do prompt antes ×
  depois na MESMA arte; dry-run por padrão, não escreve no banco, não cobra
  crédito, ~US$ 0,008/rodada em `low`). Na agenda da Wine Vix, contando as
  rodadas em que o rodapé duplicado apareceu:

  | | rodadas com duplicação |
  |---|---|
  | antes · pedido vazio | **4 de 4** (2, 2, 3, 3 blocos repetidos) |
  | depois · pedido vazio | **0 de 4** |
  | antes · pedido da Roberta | **5 de 6** (2, 3, 3, 5, 7 — uma rodada limpa) |
  | depois · pedido da Roberta, cláusula larga | 2 de 6 (8 e 6 numa leva; 0 nas outras 4) |
  | depois · pedido da Roberta, cláusula estreita | **0 de 4** |

- 🔴 **A MÉTRICA DE DUPLICAÇÃO CONTA POR CONTINÊNCIA, NUNCA POR IGUALDADE.** A
  1ª versão de `duplicacao()` comparava as strings normalizadas com `Map.get` e
  só enxergava a repetição quando a visão transcrevia o rodapé duplicado com as
  MESMAS quebras da origem. O rodapé agrupado costuma ser lido como uma linha só
  ("SEXTA-FEIRA | Funcionamento - 10h às 22h"), que não casa com "Funcionamento
  - 10h às 22h" por igualdade mas o CONTÉM. Rodada sobre a peça defeituosa REAL,
  devolvia `repetidos: 0` — a métrica dizia "limpo" sobre o defeito que existe
  para medir. A re-medição das artes já geradas mudou os números **do braço
  ANTES** (uma rodada saltou de 0 para 5) e não mexeu em nenhuma do DEPOIS: o
  defeito da métrica escondia defeito do prompt antigo, não inventava melhora do
  novo. Contar os dois lados pelo mesmo critério é o que mantém a linha de base
  honesta.

  🔴 **n=2 não decide nada aqui**: a variância entre rodadas do MESMO prompt é
  enorme (a cláusula larga deu 0,0,0,0 numa leva e 8,6 na outra). Foi só com 4+
  rodadas por braço que o sinal apareceu. Quem for mexer neste prompt de novo
  precisa medir com pelo menos 4 — e com o pedido VAZIO **e** um pedido que só
  proíbe, porque eles se comportam diferente.
- 🔴 **O script de medição tem de terminar na peça COMO ELA É ENTREGUE.** A 1ª versão do
  script chamava `runImageEdit` cru e parava aí — mas nos projetos em `compor`
  (Wine Vix é um) a logo NÃO é desenhada pelo modelo: o prompt reserva o canto
  e `finalizarLogoDaMelhoria` cola o PNG oficial DEPOIS. As peças medidas saíam
  sem marca nenhuma e a régua acusava "faltou WINE VIX" nas quatro rodadas —
  ruído que esconderia uma falha de régua de verdade. Com a logo composta, as
  quatro fecham `régua OK`.
- ⚠️ **Pedido que manda MOVER continua duplicando.** A "passe o horário de cada
  dia para um rodapé agrupado" o modelo monta o rodapé pedido **e** mantém a
  lista (11 e 8 repetidos). A cláusula "MOVER É MOVER, NUNCA COPIAR" reduziu e
  não fechou. **Não resolva endurecendo mais o prompt** — foi assim que a
  rigidez nasceu. O pedido era adversarial de propósito e é ambíguo nesta peça
  (tirando os horários, os dias ficam sem nada embaixo).

- ⚠️ **O escurecimento da foto NÃO foi resolvido.** A luz média caiu 43% a 62%
  em relação à origem nas rodadas novas (contra 52% a 61% nas antigas) — melhora
  no caso de pedido vazio, mas varia e às vezes piora, com a regra 9 no prompt
  dizendo que a fotografia é INTOCÁVEL. A causa é outra: numa peça cujo texto
  ocupa ~80% da altura, "halo local de no máximo 1/3 do quadro" é impossível de
  cumprir. A regra 4 ganhou a saída por escrito ("escolha a região mais calma e
  mantenha o resto com o brilho original"), que ajuda e não fecha.
- ⚠️ **Também em aberto**: pedido que manda MUDAR um dado ("altere o horário
  11h30 para 11h", 7 dos 74) é impossível por construção — `[TEXTO EXATO]` é a
  última seção e vence o pedido, e a conferência reprova a arte por ela ter
  feito o que foi pedido. Gastou 3 tentativas seguidas no Bacana em 02/09.

### A logo composta cai sobre a copy; o portão dos fatos abria sozinho (05/09/2026)

Testando duas melhorias da Wine Vix, o Ciro viu a logo colada **em cima de
"Happy Hour - 16h às 19h"**, cobrindo a palavra "Happy". Diagnóstico dele: "você
pode colocar a logo onde existe texto e não tem como você encaixar ela
economicamente na arte".

- 🔴 **`compor` serve à GERAÇÃO e não serve à MELHORIA.** Na geração o prompt
  reserva o canto ANTES de a diagramação existir, e o modelo compõe em volta do
  vazio. Na melhoria a arte já está diagramada — e desde 04/09 as regras da casa
  mandam PRESERVAR essa diagramação, então não há canto a reservar.
  `comporLogo` escolhe por calma (desvio-padrão) e contraste, medidas que **não
  distinguem área escura vazia de área escura com uma linha de texto**. Ele não
  tem como saber onde a copy está. `MELHORIA_NAO_COMPOE` (`logo-na-melhoria.ts`)
  tira a Wine Vix do `compor` **só na melhoria**; a geração continua compondo.
- ⚠️ **O preço foi aceito conscientemente**: em 02/09 a melhoria da Wine Vix
  redesenhou as letras do selo ("W|NE", "V|X") com o arquivo oficial como
  referência. Trocamos um defeito CERTO (logo sobre a copy, que estraga a peça
  em silêncio) por um PROVÁVEL (letra aproximada, que quem aprova enxerga).
- 🔴 **`conferirLogo` NÃO É CHAMADA EM LUGAR NENHUM** — nem na geração, nem na
  melhoria. A QA que compara por visão a marca desenhada com o arquivo oficial
  existe em `creative-qa.ts` e está órfã. Ligá-la é o conserto de verdade deste
  trade-off, e é o que permitiria devolver mais clientes ao `modelo`.
- 🔴 **A seção `[FATOS DO CLIENTE]` FOI REMOVIDA da melhoria (05/09/2026).** Ela
  injetava endereço e horário oficiais da base "só para conferir" um endereço
  que a copy já tivesse — e o que produziu foi dado DESENHADO: "Rua Fernandes
  Tourinho, 133 · Savassi" numa peça de Vitória (Quintal, 01/09) e "Dom. Pedro
  II, 716 | Higienópolis, São José do Rio Preto - SP" (Wine Vix, 04/09). Dado
  disponível no prompt vira dado na arte; o portão só decidia a frequência.
  E o portão abria sozinho: `temEndereco` aceitava localidade, e "praia" casa em
  "Real Praia do Canto, loja principal", que é NOME de unidade — na Real
  Gelateria isso levava ao prompt a rua, o número e o endereço da fábrica, os
  três proibidos na arte pelo `contentRules` do próprio cliente.
  🔴 **O conserto NÃO é filtrar os fatos pelas proibições do DNA** (decisão do
  Ciro): **as proibições do DNA valem na criação da COPY**. Ali são aplicadas, e
  depois a copy passa pelo olho de quem pede a melhoria. Quando a arte chega à
  melhoria, o que ela mostra já foi decidido e revisado duas vezes — não há o
  que conferir nem por que acrescentar. `[TEXTO EXATO]` é a verdade da peça e a
  regra 1 já proíbe criar bloco. `temEndereco` e `loadFatosDoCliente` foram
  removidas por falta de consumidor, e sobra uma consulta a menos à base por
  melhoria.
  ⚠️ **Resíduo conhecido**: o `[IDENTIDADE DA MARCA]` ainda cita dados dentro
  das próprias proibições — "a fábrica de Piúma nunca aparece em comunicação"
  põe o endereço da fábrica no prompt para proibi-lo. Medido em 05/09 no prompt
  real da Real Gelateria. Risco baixo (a frase diz "nunca"), e **não se resolve
  tirando `contentRules` da melhoria**: ele também carrega regra de ARTE que ela
  usa ("o texto NUNCA cobre o produto da foto", "gradiente leve, nunca a ponto
  de escurecer a fotografia"). Resolver exigiria separar, no DNA, proibição de
  COPY de proibição de ARTE.

- 🔴 **"Não modifique a foto" não é alcançável por prompt** — e a resposta já
  existe no código. `images.edit` regenera o quadro inteiro: a fotografia é
  redesenhada mesmo com a regra 7 dizendo que é intocável (medido: luz média
  caindo 43% a 65%). O mecanismo certo é a MÁSCARA, que `runImageEdit` já
  aceita: a área transparente é a única que o modelo pode redesenhar, o resto
  sai pixel por pixel. Spikeado em 01/09 (`scripts/spike-melhoria-com-mascara.ts`)
  e nunca promovido. ⚠️ O limite conhecido: a máscara do spike sai das caixas de
  texto de `Page.layers`, e **60 das 74 melhorias medidas não têm página**
  (arte de canvas ou upload) — para essas seria preciso derivar as faixas de
  texto por visão. É o caminho, não um ajuste de prompt.

### 🔴 A melhoria não acrescenta contraste: o halo saiu do prompt (05/09/2026)

Relatado pelo Ciro no almoço de feriado do Quintal (post `cmtoe5bb20001l804x5qdygl5`):
"o melhorar com IA está aplicando um contraste que em algum momento eu pedi,
mas está escurecendo muito a imagem e gostaria de retirar essa funcionalidade".
Medido na peça: luz média de 102,7 na origem para 83,1 na melhorada (-19%), com
o terço inferior inteiro escurecido, sem pedido nenhum.

- 🔴 **A licença era a regra 4 das REGRAS DA CASA ("HALO DE LEITURA, NÃO VÉU")**
  — nascida de um pedido do próprio Ciro em 02/09 ("a geração precisa usar o
  halo no lugar do véu"), portada da geração para a melhoria em 01/09 e
  reforçada em 04/09. Ela dizia "quando o texto precisar de contraste, use uma
  mancha escura desfocada". Na MELHORIA isso está errado por desenho: a peça já
  chega com a leitura resolvida (o halo da assinatura do compositor, o do
  canvas), aprovada por quem cuida da marca; qualquer licença de "contraste"
  aqui só produz escurecimento a mais. Na GERAÇÃO a regra do halo continua (lá a
  peça nasce do zero) — não misture as duas.
- **A regra 4 agora é "NENHUM CONTRASTE ACRESCENTADO"**: nem halo, nem véu, nem
  gradiente, nem sombra, nem escurecimento parcial ou total. O que a origem já
  tem atrás do texto fica EXATAMENTE como está (e acompanha o texto se ele
  mudar de lugar); texto ilegível se resolve só por POSIÇÃO (regra 3). A regra
  1 deixou de listar "o contraste de leitura" entre o que a melhoria melhora.
- 🔴 **A licença vivia em TRÊS lugares além da regra, e a regra os revoga PELO
  NOME** (lei da casa: instrução que não se declara vencedora perde para a mais
  enfática): o DNA do cliente — o `composition` do Quintal descreve "Gradiente
  de Leitura… opacidade máxima na borda entre 35% e 55%" e o `visualStyle`,
  "Dark warm como véu e fundo: 8 a 15%", prosa do tempo do véu que continua
  injetada inteira em [IDENTIDADE DA MARCA]; a direção de arte
  (`art-direction.ts`, `[COMPOSIÇÃO DOS TEXTOS]` autorizava "um degradê discreto
  atrás do texto" — a linha foi trocada, mas `Project.artImprovementPrompt` de
  projeto pode carregar a versão antiga); e a própria regra 1. O DNA NÃO foi
  editado: é documento da marca e a decisão de tirar o "gradiente de leitura"
  de lá é do Ciro.
- ⚠️ **O que o prompt NÃO resolve**: `images.edit` regenera o quadro inteiro e
  a luz média cai mesmo com a foto declarada intocável (regra 7). O mecanismo
  é a MÁSCARA (`scripts/spike-melhoria-com-mascara.ts`, nunca promovido) —
  não outra linha de prompt. Foi o que sobrou na medição abaixo: os 13-18%
  que ficam são a regeneração do quadro (a foto inteira sai um pouco mais
  escura e quente), não uma camada por cima.
- **Medido** com `scripts/medir-regras-da-melhoria.ts --so=depois --rodadas=4
  --tier=low --gen=<origem>` antes e depois da mudança, na MESMA arte de
  origem (luz 102,7), pedido vazio. ⚠️ Passe a geração de ORIGEM em `--gen`:
  o script melhora a arte que a geração passada tem como `resultUrl`, e com o
  id da melhoria a linha de base sai "melhorando a melhorada".

  | | luz média das 4 rodadas |
  |---|---|
  | prompt com halo autorizado | 84,1 / 74,6 / 77,6 / 76,6 (**-18% a -27%**, foto inteira escurecida em 4 de 4) |
  | prompt sem contraste | 88,6 / 84,7 / 85,7 / 89,0 (**-13% a -18%**, sem véu nem faixa em 4 de 4 — o texto pousa direto na foto) |

### 🔴 A régua por visão exigia a LOGO como texto (TERO, 03/09/2026)

A Roberta não conseguia melhorar nenhuma arte do TERO: as duas tentativas
falhavam por "texto divergente" com blocos que NÃO são copy — `"TRO"` e
`"BRASA E VINHO"`. Medido com o transcritor de produção nas artes de origem:
`transcreverTextosDaArte` lê a logo como texto (`TERO`, `BRASA E VINHO` e,
pela ligadura E+R, `TRO`), e a peça gerada nunca a traz — no projeto em
`compor` o prompt reserva o canto e o PNG oficial é colado DEPOIS da
conferência (`finalizarLogoDaMelhoria` vem depois de `verifyImageTexts`).
Defeito determinístico: 100% das melhorias de arte do canvas/upload do TERO
reprovavam, nas duas tentativas do job. A logo do Quintal fez o mesmo em 02/09
(`"PARRILLA BAR"`).

- **A régua por visão passa por `semTextosDaMarca`** (`text-comparison.ts`,
  puro): a logo oficial é transcrita à parte (uma chamada de visão a mais) e
  saem da régua o bloco contido num texto da logo, o bloco cujas palavras são
  todas da marca/genérico de casa, e a palavra curta a UMA edição de uma
  palavra da marca (a ligadura mal lida: `TRO`, `TLRO`, `TERRO`). A régua do
  BANCO e da LINHAGEM não passam por ali — copy aprovada não traz logo.
- **Copy que CITA a marca fica** ("SABORES TERO", "VEM PRO TERO"): tem palavra
  que não é da marca. E a distância de uma edição vale só para marca e logo,
  nunca para os genéricos — senão "MAR" cai por parecer "BAR".
- A transcrição COMPLETA da origem (com a logo) continua servindo à caixa
  (`aplicarCaixaDaOrigem`) e ao desconto do texto a mais; o que muda é só o
  que a conferência EXIGE. Os blocos descontados ficam em
  `fieldValues.textosDaMarcaDescontados`.
- Casos reais em `scripts/validar-regua-sem-marca.ts` (sem banco, sem API).

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
- **O halo é definido VISUALMENTE na página de assinatura** (03/09/2026, ao
  ler as quatro primeiras assinaturas ajustadas pelo Ciro): se ALGUM papel da
  página tem `effects.background` ligado, a página é a verdade papel a papel
  — cor, ajuste caixa/texto, margem, desfoque, cantos E opacidade vêm dela,
  EXATAMENTE (Ciro, 03/09: "não precisa ajustar de acordo com a luminosidade";
  a modulação pela foto e a correção da régua só valem no modo calibrado pela
  casa, quando nenhum papel tem fundo). Papel sem fundo sai sem mancha. **O
  GRUPO da peça é o grupo da página** (Cmd+G): a mancha é a do líder, como o
  editor desenha — nunca juntar nem separar agrupamentos ("o halo ficava por
  cima de algumas fontes porque juntou o de cima com o de baixo"). O
  agrupamento é o ESQUELETO: o bloco com a manchete é o principal e o mapa só
  escolhe o HORIZONTAL (a âncora vertical é a da página); os outros ficam na
  âncora e no alinhamento que têm na página. As MARGENS também vêm da página
  (onde o primeiro texto começa e o último termina). Logo sem sombra e sem halo.
  A sombra segue a mesma lei: camada sem sombra na página = peça sem sombra.
  `Page.background` NÃO é mais lido (o editor grava `#ffffff` ao pôr foto de
  referência na página); fundo liso e mancha da logo vêm de `Project.assinatura`.
- 🔴 **COPY PRIMEIRO, CAMPOS DEPOIS** (Ciro, 11/09/2026; substitui a regra de
  04/09 "não adicione campos; a copy é feita em cima dos campos que existem no
  template"). A redação aprovada: *A assinatura define a identidade visual e oferece composições iniciais. Os campos são opcionais. A mensagem determina quais blocos e grupos de leitura a peça precisa. O Claude pode escolher outra variante, acrescentar camadas com estilos da assinatura e reorganizar a composição. Nenhum texto é descartado por ausência de campo. Fatos vêm da base; a caixa vem da string; safe area e avatar permanecem respeitados. O verificador informa problemas e não veta a peça.* Nada é escrito para
  preencher espaço. Até a camada extra (F3) existir, o que já dá é deixar o
  campo vazio, escolher a variante que tem o campo (`ver-assinatura` lista os
  papéis por variante) ou `criar-arte` com `textosLivres`; papel que a variante
  não tem volta como `PAPEIS_INCOMPATIVEIS` — nunca some em silêncio. A regra
  nova entrou de uma vez em todos os lugares onde a antiga estava ativa
  (CLAUDE.md, `docs/FORMAS-DE-ARTE.md`, `instrucoes.ts`, descrição de
  `compor-arte`, comentários do compositor): regra velha e nova convivendo era
  o defeito. O que continua: a página do formato é a verdade daquele formato
  (o `completarComStory` segue removido — papel de feed não vem da story);
  `copyParaBlocos(copy, { papeis })` distribui a copy do item de plano sobre os
  papéis do formato — no modo `estrito` (o executor semanal) o que não cabe
  LANÇA `PAPEIS_INCOMPATIVEIS` (com `textosSemPapel`); no modo legado o excedente ainda é CORTADO
  sem aviso, que é a perda posicional que o PR 5 da F1 vai fechar; o
  alinhamento da headline na
  página é PREFERÊNCIA do rodízio (a foto ainda manda); o serviço reserva a
  própria altura quando o bloco principal também vai ao rodapé.
- **A régua entende texto ESCURO**: para cor de texto com luz < 128 a
  pergunta inverte (p2 do fundo ≥ alvo claro) e ela só confere, nunca corrige
  — mancha clara é desenho da equipe (Real: apoio verde sobre creme).
- **Mais de uma página por formato = VARIANTES** (`escolherVariante`, 03/09/2026,
  pergunta do Ciro "posso criar mais variações?"): TODA página do template
  "Assinatura" conta (duplicar no editor basta). A escolha é pela MENSAGEM
  (`avaliarVariantes`, Ciro: "escolher o template de acordo com a mensagem, e
  saber quais aceitam o horário de funcionamento"): +10 por ter todos os
  papéis que a peça pede e −4 por papel que falta (a story sem `servico` não
  serve para a peça de funcionamento — aconteceu na sexta da Real), −1 por
  papel que sobra, +3 por palavra do tema no nome/tags da página, ±2 pela tag
  `clara`/`escura` contra a luz da foto; empate → rodízio pela chave da peça.
  Papel pedido que a variante escolhida não tem é RECUSADO antes de gravar
  (`PAPEIS_INCOMPATIVEIS`, com a lista do que falta) — nunca sai da peça em
  silêncio; a saída é outra variante ou `criar-arte` com `textosLivres`, com a
  copy preservada (só a manchete é obrigatória para compor). `ver-assinatura`
  lista as variantes com os papéis
  e `aceitaServico`. Nome/tag da página é o que faz o tema casar: vale nomear
  as variantes pelo que elas servem. O compositor NÃO varia cor de fonte nem
  cor do halo por conta própria — variação de estilo é página nova; o que ele
  varia sozinho é posição, enquadramento, canto da logo e a TINTA do halo
  (dentro da faixa). A variante usada fica em `composicao.assinatura.variante`.
- **Variantes como DESIGNS de uma leva (Espeto, 04/09/2026)**: o Ciro achou os
  designs da semana 1 (canvas: 3 arranjos + promoção com preço) melhores que
  os da semana 2 (compositor, 20 peças no mesmo arranjo). A resposta foi
  `scripts/criar-variantes-assinatura-espeto.ts`: três PÁGINAS novas no
  template Assinatura, clonadas da página que ele ajustou — "Promoção"
  (headline2 vermelha; `apoio` = descrição Barlow branco, `servico` = PREÇO
  Bevan amarelo; tags promocao/preco/rodizio/marmitex), "Rodapé" e "Topo".
  🔴 Numa variante os PAPÉIS podem mudar de sentido — a copy é escrita
  contra a variante (`ver-assinatura` mostra fonte/cor por papel): na
  Promoção o preço vai no `servico`, nunca "a partir das 17h". A 2ª linha da
  manchete vira `headline2` quando a página o tem: deixe a palavra-chave na
  2ª linha. Rodar o script de novo SOBRESCREVE as páginas pelo nome.
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
- 🔴 **O destino padrão de uma leva é a AGENDA, como rascunho — a bancada só
  com pedido explícito** (Ciro, 04/09/2026: "eu não pedi para colocar na fila
  da bancada, os posts devem ser colocados lá somente se solicitado; o padrão
  deveria ser colocar na agenda"). Semana pedida pelo chat: compor a peça
  (`compor-arte`/`compor-leva`) e `colocar-na-agenda` **com o `pageId` da
  peça, nunca com o `generationId`** (Ciro, 04/09: "não é preciso gerar o
  criativo para agendar, você pode agendar a página diretamente para eu
  conseguir editar depois") — são `pageId` + `templateId` no post que dão o
  botão "Editar Template" na agenda e fazem a edição refluir para a arte;
  por `generationId` o post nasce sem página e o botão some. Carrossel de
  fotos vai com as URLs do acervo. `criar-plano`
  só quando a pessoa disser "bancada". A semana 2 do Espeto (07–13/09) foi
  parar no plano e teve de ser movida; as instruções do conector
  (`src/lib/mcp/instrucoes.ts`, etapas 2-4) já dizem isso.
- **Fila: o MCP só enfileira** (`compor-leva`, `executar-plano`); a bancada
  compõe na hora (`gerarItemPorModelo` com via `compor`). O cron pega até 12
  composições em série DEPOIS do lote de IA, dentro de 200s. `maxAttempts`
  3, porque não há chamada paga.
- **`persistAndRenderCreative` aceita `generationId`** e FECHA a Generation
  PROCESSING da fila em vez de criar outra — a bancada segue o id que tem.
  🔴 **O `comporPeca` só cumpria isso na promessa** (medido em 04/09/2026,
  Espeto Gaúcho, `compor-leva` com 20 itens): ele anotava o id da fila em
  `fieldValues.generationIdDaFila` e NÃO o entregava ao persist — nasciam 20
  Generations COMPLETED duplicadas, as 20 da fila ficavam PROCESSING para
  sempre (a varredura de órfãs PULA Generation que tem job, então nem FAILED
  viravam), `fecharJob` marcava o job FAILED sem `lastError`, e os itens do
  plano ficavam `proposto` com a arte pronta na galeria. Hoje a entrada do
  persist é montada em `persistencia.ts` (puro, testado) com o `generationId`;
  **quem reaponta o item do plano é a FILA** (`reapontarItemDoPlano` em
  `fila.ts`: `na-fila` ao enfileirar, `pronto` com generationId/pageId ao
  terminar, `erro` na falha definitiva — caminhando por `caminhoAte`, nunca
  derrubando a peça); e `fecharJob` escreve por que falhou quando o runner
  deixa a Generation aberta. Teste em `__tests__/fila.test.ts`. A limpeza das
  40 linhas do incidente é `scripts/limpar-compor-duplicado-2026-09-04.ts`
  (dry-run por padrão; preserva o que item ou post referenciam).
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
- **A aba de Templates tem QUATRO seções** (03/09/2026, `src/lib/templates/
  classificar.ts`, puro): assinatura · modelos da equipe · programação ·
  arquivo (recolhido; pasta automática VAZIA não tem card — vale para o
  arquivo e, desde 04/09, para a programação também). A seção diz quem criou e
  para quê. **A peça composta vai para a pasta da SEMANA da data prevista, E
  DO FORMATO** (`pasta-da-semana.ts`: segunda a domingo em BRT, categoria
  `programacao`), pedido de uma arte, de uma sexta ou da semana inteira caindo
  no mesmo lugar; sem data vai para `Avulsas · <mês>` e é MOVIDA para a semana
  quando o post é agendado (`moverPaginaParaSemana`, chamado de `agendarPost`,
  nunca derruba o agendamento). A API de templates devolve `situacao` (peças,
  na agenda, publicadas, rascunhos, falhas) para as pastas.
  🔴 `Template` tem FK com cascade a partir de `Generation`: NUNCA apagar
  pasta "vazia" sem antes reapontar as Generations — e `SocialPost.templateId`
  é SetNull, então apagar também tira o "Editar Template" do post. Por isso a
  pasta esvaziada some da ABA, nunca do banco.
- **Story e feed em pastas SEPARADAS, ordem de postagem, nome com data e
  slide** (04/09/2026, pedido do Ciro depois de revisar a Lagosta: "eu me
  perco"). São três defeitos que andavam juntos e viraram uma correção só:
  - **Uma pasta por semana E por formato**: `pastaDaPeca(quando, formato)`.
    A pasta 395 tinha 13 stories e 17 páginas de feed intercaladas, e a
    aprovação de cada frente corre separada. A chave da tag ganhou o sufixo
    (`semana:2026-09-07:story`) e é ela que `garantirPasta` procura; a tag SEM
    formato CONTINUA nas tags, porque é por ela que se filtra a semana inteira
    (`chaveDaSemana` casa as duas formas — nunca depender da ordem do array).
    Cada pasta leva o `type`/`dimensions` do seu formato: o rótulo deixou de
    ser mentira. Nome: "Stories · Semana 7 a 13/09".
  - 🔴 **`Page.order` é GRAVADO na composição** (`ordemNaPasta`): antes toda
    peça nascia no default 0 do schema e o editor listava na ordem arbitrária
    do Postgres — as 30 páginas da 395 tiveram de ser renumeradas à mão. A
    ordem é minutos desde a segunda 00:00 BRT × 100 + o slide, e é
    DESEMPATADA contra o que já está na pasta: sem o desempate, carrossel
    composto sem declarar o slide empata tudo no mesmo número e a pasta volta
    à ordem arbitrária (medido em 04/09 numa leva real do Empório — quatro
    slides com `order` 549000).
  - 🔴 **O slide é REGISTRADO por quem compõe** (`spec.carrossel` →
    `Generation.slideOrder`, a coluna que o carrossel de IA já usava), nunca
    deduzido depois. A única forma de recuperá-lo em peça antiga é casar o
    `SocialPost.mediaUrls` pelo nome do arquivo do render
    (`<pageId>-<epoch>.png`) — é o que a migração faz, e é frágil de propósito
    ali. `carouselGroupId` fica nulo: cada slide é composto sozinho, e um
    grupo de um só seria pior que nenhum.
  - **Nome da página**: "Qua 09/09 · 19:30 · Seu Quinto · slide 2/5" — com a
    DATA (não só o dia da semana) e o número do slide; sem eles os quatro
    slides do mesmo carrossel saíam com nomes IDÊNTICOS. O formato saiu do
    nome da página porque já é o começo do nome da pasta.
  - **A capa do carrossel costuma ser foto do acervo**, então as peças
    compostas começam no slide 2 — o número é a posição como ela sai no
    Instagram, não o índice das peças compostas.
  - Migração: `scripts/separar-pastas-por-formato.ts` (dry-run por padrão,
    `--projeto <id>` ou `--todos`). O formato de mais páginas FICA na pasta
    atual (renomeada); os outros vão para a pasta do seu formato. Ele reaponta
    `Generation.templateId` e `SocialPost.templateId` das páginas que mudam de
    casa, e **não apaga nada**. 🔴 O período da pasta sai da TAG dela, nunca da
    data das páginas: em 04/09 a pasta "Semana 14 a 20/09" da Lagosta guardava
    páginas agendadas para 10/09 e, pelas datas, reivindicava a chave da
    semana errada — duas pastas com a mesma tag, que é o que a tag existe para
    impedir. 🔴 Mas a PÁGINA vai para a pasta da PRÓPRIA data, e a distinção
    é a lição: "de que semana é esta PASTA" sai da tag dela; "para que pasta
    vai esta PÁGINA" sai da data da peça. Confundir as duas deixou 14 páginas
    da Lagosta com o nome de uma semana ("Qui 10/09") dentro da pasta de
    outra — nome e pasta dizendo coisas diferentes sobre a mesma peça, que é
    a confusão que a separação veio resolver. Sem data (avulsas), aí sim a
    origem manda: é o único caso em que não há data para consultar.
  - Os coletores "Arte Composta" não são mais alimentados;
    `scripts/organizar-programacao.ts` moveu as 63 peças da Lagosta.
- **O card da pasta: capa em mosaico, nome fora do card e o botão Agendar**
  (04/09/2026, ao ver a aba depois da separação):
  - **O nome mora FORA do card** (`LegendaDoCard`), em até TRÊS linhas
    (`line-clamp-3`: com duas, o nome longo do arquivo — mediana 36 e máximo
    56 caracteres — continua cortado nos cards de 171px do celular). Ele
    vivia só no overlay de hover com `truncate`, e "Stories · Semana 14 a
    20/09" não cabe na largura de um card — a semana ficava cortada justamente
    na parte que identifica a pasta.
  - **A capa é o CONJUNTO, não a primeira peça**: a pasta não tem
    `thumbnailUrl` própria (nasce de `garantirPasta`), e a miniatura de uma
    arte solta não diz que aquilo é a semana de stories. `capa` vem da API com
    até 4 miniaturas de página; com 3, a primeira ocupa a linha inteira —
    buraco na grade lê como peça que faltou.
    🔴 **Miniatura `data:` fica de fora**: o PageSync sobrescreve
    `Page.thumbnail` com um JPEG base64 assim que a página é aberta no editor,
    e mandar isso numa listagem multiplicaria o payload por pasta.
  - 🔴 **`grid-rows-2` NÃO gera CSS neste repo** (medido: a classe nem aparece
    na folha de estilo) — o mosaico usa `gridTemplateRows` em estilo INLINE.
    `grid-cols-*` funciona; não dá para inferir uma da outra. Some à família
    de classes mortas.
  - **`GET|POST /api/templates/[id]/agenda-das-paginas`** dá o horário previsto
    de cada peça e o post que já existe, e agenda uma peça como RASCUNHO no
    horário que a composição previu — é o botão "Agendar" / a etiqueta
    "Agendado" na faixa de cada página do workspace contínuo.
    🔴 Fica em cache PRÓPRIO (`['agenda-das-paginas', templateId]`), **nunca**
    dentro de `['pages', templateId]`: o autosave do editor substitui o objeto
    da página naquele cache a cada pausa da digitação, com o retorno do PATCH
    — que não traz estes campos.
    🔴 **O horário NÃO vem do cliente**: é lido no servidor da spec da
    Generation, para o botão não poder agendar em data diferente da que a tela
    mostrou. E o servidor recusa (409) peça que já tem post — o botão
    desativado não segura dois cliques rápidos.
  - 🔴 **`agendarPost` NÃO infere o tipo pelo tamanho**: sem `postType` ele
    grava `STORY` (`input.postType ?? 'STORY'`). Agendar uma peça de feed sem
    dizer o tipo cria um story de 1080x1350. Todo caminho novo que agende
    precisa derivar o tipo do formato.
  - `Page.order` codifica dia e hora, mas só DENTRO da semana — para peça
    remarcada para outra semana ele daria a data errada. Por isso o horário
    previsto sai sempre da spec, nunca da ordem nem do nome.
- **Templates** (§8): o contêiner fica; a página-modelo como layout a
  preencher NÃO se cadastra mais (14 usos em 128, 0/33 no placar); o kit vira
  a página de assinatura. A curadoria das 147 existentes é do próximo
  planejamento — despromover, nunca excluir.
- **O que o editor perde em relação ao canvas, aceito**: gradiente em texto
  (a headline da Lagosta sai sólida), sombra de três camadas presa ao glifo
  (o editor tem uma), e o assunto do catálogo ainda não é preenchido pela
  análise de visão (o compositor usa a estimativa por energia; `assunto`
  em frações na entrada do catálogo é o contrato, quando existir).

### 🔴 A arte do slide de carrossel não seguia a página (04/09/2026)

Editar a copy de uma página no editor tinha dois desfechos opostos, e ninguém
via a diferença: em peça de imagem ÚNICA o PATCH chama
`invalidateScheduledRenders`, o post volta para `PENDING` e o cron
`render-stories` refaz a arte; em SLIDE DE CARROSSEL **não acontecia nada** —
o post seguia com o render antigo em `mediaUrls` e publicaria o texto velho,
em silêncio.

A causa não era esquecimento: post de carrossel é `NOT_NEEDED` e sem `pageId`
de propósito, porque `renderPostArt` grava `mediaUrls: [url]` e um post
`RENDERED` de 5 slides perderia 4 no primeiro re-render. A proteção evitava o
estrago e, no mesmo movimento, abandonava a edição. Medido na conferência de
04/09 (projeto 8): das 65 artes agendadas, **11 não batiam com o texto da
página** — 7 eram slides parados desde a composição, e 2 tinham sobreposição
de texto visível. Nada disso apareceu em log, aviso ou status.

O conserto é `src/lib/compositor/recompor.ts` (serviço) e `defasagem.ts`
(contrato puro), na fila durável. Regras que valem para código novo:

- 🔴 **`invalidateScheduledRenders` tem um COMPANHEIRO obrigatório.** Quem
  muda o visual de uma página chama os dois: a invalidação devolve à fila de
  render quem RENDERIZA da página; `pedirRecomposicaoDaArteCongelada` refaz a
  arte de quem não renderiza (slide de carrossel, arte agendada por
  `generationId`). Cada uma sozinha deixa metade das artes publicando o
  antigo. As cinco portas já chamam as duas: PATCH da página, PUT do template,
  PATCH de camada, `ajustarArte` e `reverterCamadasDaArte`.
- 🔴 **A defasagem se mede por CONTEÚDO, nunca por carimbo de hora.**
  `Page.updatedAt` muda em qualquer escrita — em 04/09 um `update` de `order`
  em 30 páginas apagou o sinal de uma vez. A comparação é o texto de
  `Page.layers` contra o de `Generation.fieldValues.layersSnapshot`, lidos por
  `lerCamadas`/`copyDeCamadas` (ilegível **nunca** vira "em dia").
- 🔴 **Recompor, não só re-renderizar.** Re-renderizar a página como está
  reproduz a colisão: a caixa foi medida para o texto ANTIGO (foi assim que o
  apoio saiu impresso por cima da manchete em duas peças). O caminho é pegar a
  `fieldValues.spec`, trocar só a copy pela que está na página e chamar
  `comporPeca`, que mede cada linha na fonte real e encolhe até caber.
- 🔴 **`comporPeca` roda em `provar: true` e a gravação é feita à mão, na
  MESMA página.** Deixar o compositor persistir criaria página nova (em outra
  pasta, com outro nome) e o post continuaria apontando para a antiga — editar
  de novo deixaria de ter efeito para sempre. O `provar` também evita os
  efeitos colaterais da persistência: pasta da semana, `registrarUsoDeFoto` e
  a transição do item do plano. Recompor é refazer A MESMA peça.
- 🔴 **Recompor só quando a página é a que o compositor pousou.** A
  recomposição reconstrói TODAS as camadas: se alguém moveu uma caixa,
  escondeu um bloco ou acrescentou camada, isso iria embora em silêncio. Nesse
  caso a arte é só re-renderizada como está (a edição chega ao post do mesmo
  jeito) com o aviso de que a diagramação não foi medida de novo. A **altura**
  de caixa de texto não conta como ajuste manual: ela é derivada
  (`autoExpand`) e cresce sozinha quando o texto muda — contá-la faria a
  recomposição nunca acontecer.
- 🔴 **Nem toda spec tem foto.** Duas peças tinham `spec.foto` indefinida
  porque a imagem foi posta à mão no editor depois de compor: recompor pela
  spec devolveu a peça com FUNDO PRETO, sem erro nenhum. A PÁGINA é a verdade
  sobre a foto (`fotoDaPagina`), e trocar a URL derruba junto o `driveFileId`
  antigo, que levaria o assunto errado do catálogo.
- 🔴 **O casamento post↔arte é por URL EXATA, nunca pelo prefixo do nome do
  arquivo.** `renderPostArt` nomeia por POST (`<postId>-<epoch>.png`) e o
  compositor por PÁGINA (`<pageId>-<epoch>.png`); supor uma coisa só produziu
  9 falsos "página que não existe mais" no diagnóstico. A URL do Blob tem
  sufixo aleatório, então a igualdade é inequívoca.
- **A troca é cirúrgica**: `montarNovasMidias` (o mesmo de
  `trocar-arte-do-post`) troca UMA posição, com compare-and-swap sobre o array
  inteiro. A contagem de mídias nunca diminui. O alcance é o MESMO da
  invalidação — `DRAFT`/`SCHEDULED`, `laterPostId: null` —, e post que a
  invalidação atende é pulado (`alcancadoPelaInvalidacao`), senão as duas
  trocariam a mídia uma da outra.
- **`headline2` volta a ser `headline` na spec.** `comporPeca` parte a
  manchete em duas vozes quando a assinatura tem `headline2`; devolvê-lo como
  papel faria `validarSpec` recusar a peça inteira e o slide continuaria com o
  texto velho.
- **A RECUSA (`TEXTO_NAO_CABE_NA_COLUNA`) não vira log.** Ela é correta — a
  linha não cabe na coluna nem a 80% da fonte —, e fica gravada em
  `Generation.fieldValues.recusaDaRecomposicao` (chave própria, por merge,
  nunca substituição — ver abaixo) **e** no histórico de cada post afetado,
  com o orçamento de caracteres. Em geral a arte continua sendo a antiga, e
  quem editou decide; quando a MESMA rodada já trocou o PNG antes de falhar (a
  página mudou durante o render), a recusa grava `arteTrocada: true` e o
  histórico do post diz que a imagem já foi trocada. Nada regenera sozinho
  além disso.
  🔴 **E a recusa NÃO substitui o registro do re-render** (C6-01 da
  pré-revisão do HEAD f0eee811, 12/09/2026): ela mora em
  `fieldValues.recusaDaRecomposicao` (`em`, `erro`, `errorCode`, `detalhes`),
  gravada pelo merge raso de `mesclarFieldValuesDaArte`, e não toca
  `recomposicao`. Gravar `recomposicao: registro('recusada')` trocava o
  registro INTEIRO enquanto o PNG re-renderizado ficava — apagava
  `estado: 're-renderizada'`, o marcador `copyVisualRegravada` e
  `urlsAnteriores`, e os leitores voltavam a confiar no snapshot e na copy de
  OUTRA versão da mídia (R13/R37/R38/R42 do PR 6). Recusa é comum (texto que
  não cabe, página que virou modelo, tentativas esgotadas com o Blob fora). O
  próximo registro de sucesso (`feita` ou `re-renderizada`) grava
  `recusaDaRecomposicao: null`. Nasceu num commit de integração no branch do
  PR 6 e **desceu para o PR 0 por cherry-pick em 12/09/2026** — o PR 0 é o
  dono. Linha que já
  foi recusada antes disso perdeu o registro do re-render, e ele não se
  reconstrói.
- **A fila é a de sempre (`kind: COMPOR`), com o `generationId` da arte que já
  existe** — uma peça tem uma arte, e a fila tem um job por arte.
  `enfileirarRecomposicao` REABRE job já terminado (diferente de
  `enfileirarComposicao`, cujo `update: {}` engoliria a edição seguinte em
  silêncio) e **não carrega spec**: ela é lida da arte na hora de executar, o
  que faz o job trabalhar sempre sobre a versão mais nova. O runner LANÇA na
  falha definitiva (é o que faz `executarJob` gravar `falharJob` com o
  motivo); `fecharJob` sozinho leria a Generation COMPLETED e diria DONE.
- **O PATCH só ENFILEIRA.** Refazer a arte leva dezenas de segundos e aquele
  PATCH é o autosave. Medido em 04/09: o levantamento custa ~1,4s (duas idas
  ao banco) e roda dentro de `after()`.
- **A varredura por conteúdo é `scripts/recompor-artes-defasadas.ts`**
  (dry-run por padrão), e é ela que pega o que já está parado: post da agenda
  → `mediaUrls` → Generation → página → texto contra o snapshot.
- ⚠️ **Arte sem `layersSnapshot`** — a de `arte-rapida`, a do canvas de design
  (`upload-creative`) e tudo anterior ao compositor — não tem como ser
  conferida por conteúdo, e toda mudança visual nela cai no re-render puro
  (não dá para afirmar que está em dia, e refazer é barato perto de publicar o
  texto velho).
- 🔴 **"Sem snapshot" NÃO é o mesmo que "exposta", e o relatório precisa
  separar as duas.** Página sem CAMADA DE TEXTO — a do canvas de design, que é
  uma imagem em tela cheia com a copy dentro do PNG — não tem copy editável, e
  o defeito não se aplica a ela. Medido em 04/09/2026: as **53** páginas sem
  snapshot da carteira eram **todas** assim (`source: arte-enviada`, zero
  camadas de texto, nenhuma com `slotValues` de régua). Contá-las como "não
  deu para conferir" fazia o relatório soar alarmante sem nada a alarmar — e
  convidava a "consertar" 53 peças agendadas re-renderizando arte que
  `importarArte` guarda intacta de propósito ("os bytes enviados viram o
  `resultUrl` tal e qual").
- **Placar da carteira em 04/09/2026** (`--dias 30`, 145 posts, 160 páginas):
  **0 defasadas**, 36 congeladas conferidas contra o snapshot e em dia, 71
  atendidas pela invalidação (imagem única), 53 sem texto editável, **0 sem
  como conferir**. As 11 do projeto 8 já tinham sido consertadas na mão — o
  zero é a confirmação disso, não a ausência do problema.
- ⚠️ **Depois de uma recomposição, `reverter-arte` volta para a peça
  RECOMPOSTA**, não para a composição original: o snapshot é atualizado junto.
  É o que se quer (reverter desfaz o ajuste manual, não a edição de copy),
  mas a entrega original deixa de ser alcançável.
- ⚠️ **A recomposição REESCREVE `Page.layers`** (sem isso o editor e a arte
  publicada divergiriam para sempre). Enquanto a pessoa continua digitando, o
  autosave dela escreve o estado do navegador por cima da geometria recomposta
  e enfileira outra rodada; converge quando ela para de digitar.
- **`fieldValues.recomposicao.urlsAnteriores` guarda as últimas 5 URLs da
  arte.** Refazer sobrescreve `Generation.resultUrl`, e um post que perdeu o
  compare-and-swap ficaria com uma URL que nenhuma Generation tem mais —
  invisível para toda varredura seguinte. O rastro é o resgate.

### Remarcar um post leva as páginas da arte junto (04/09/2026)

Post remarcado deixava a `Page` para trás: na pasta da semana antiga e com o
nome carregando a data velha — "Sex 18/09 · 09:00 · Coronel Picanha" num post
que passou a sair em 25/09. Como a pasta da semana é o que a equipe abre para
revisar e aprovar a programação, pasta e nome mentindo a data desfaziam
justamente o que a separação por formato veio resolver.

- **`refilarPaginasDoPost(postId, quando, userId)`** (`compositor/pastas.ts`) é
  a irmã de `moverPaginaParaSemana`, não uma extensão dela: aquela só aceita
  peça que ainda está em coletor ou nas avulsas (`ehComposta && emAvulsas`) e
  **não renomeia** — existe para a peça que ACABOU de ganhar data. Página já
  arquivada numa pasta de semana cai fora do gate dela e fica parada.
- **Está ligada nos QUATRO pontos que escrevem a data de um post existente**,
  mapeados por varredura: o PUT de `posts/[postId]` (arrastar no calendário,
  "Re-agendar" e o formulário de edição chegam TODOS ali — é o de maior
  volume), o PATCH de `external/posts/[postId]`, `reagendarPost`
  (`agenda-acoes.ts`, a tool do conector) e o `update-post` do MCP local.
  Caminho novo que mude `scheduledDatetime` precisa chamá-la, senão a página
  volta a ficar para trás em silêncio.
- 🔴 **O id no nome do arquivo do render NEM SEMPRE é o da página**: o
  compositor nomeia por PÁGINA (`<pageId>-<epoch>.png`) e o render de post
  avulso nomeia pelo POST. Sem descartar o id do próprio post, o carrossel
  adota uma página que não existe.
- 🔴 **Mídia única NÃO é slide.** Story e post de imagem única também têm a arte
  nomeada pelo id da página; sem o corte por `mediaUrls.length > 1` a peça
  avulsa vira "slide 1" e a ordem sai deslocada dentro do minuto.
- **Best-effort, sempre**: refilar não pode derrubar um reagendamento — mesmo
  contrato de `moverPaginaParaSemana` e de `sendWhatsAppText`. Modelo
  (`isTemplate`) e página que não é do compositor são pulados com aviso.
- ⚠️ **Trocar `mediaUrls` também envelhece o nome** (o "slide 2/5" muda), e
  isso NÃO dispara refile hoje — a função trataria, o gatilho é que não existe.
- `scripts/validar-refile-ao-remarcar.ts` prova o caminho real indo e voltando
  num rascunho e confere que o estado final é idêntico ao inicial. Ele CRIA a
  pasta da semana de destino (efeito inerente do `garantirPasta`) e não a
  remove.

### O diretor de arte: quem escreve o prompt do gpt-image OLHA a peça (05/09/2026)

Plano e medições em `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`. O Ciro
levou ao ChatGPT uma tabela de horários exportada do editor (Real Gelateria)
com oito palavras de pedido e voltou uma peça editorial na marca; a mesma
peça pelo Studio saía igual à origem. **Não é o modelo: o ChatGPT usa o mesmo
`gpt-image-2` da API.** A diferença é o processo — um LLM com visão planeja e
escreve um prompt curto; o gerador recebe liberdade; a pessoa itera uma
mudança por vez. Executado no mesmo dia (F0–F6). Regras que valem para código
novo:

- 🔴 **O paredão NÃO protege — medido, n = 4 × 4 peças.** O prompt de produção
  da melhoria tinha 22 mil caracteres com "não crie nada" e "a fotografia é
  intocável" escritos; acrescentou um selo em 4 de 4 rodadas, inventou uma foto
  numa, errou a grafia da tagline em outra. Um prompt de 1,4 mil com o MANUAL DA
  MARCA como imagem saiu limpo em 4 de 4. **Não acrescente regra ao prompt do
  gpt-image.** Regra nova vai para o system prompt do planejador
  (`src/lib/ai/diretor-de-arte.ts`), onde texto longo é lido; o planejador
  decide quais três ou quatro ESTA peça precisa. O prompt gerado tem teto
  (`TETO_DO_PROMPT_PLANEJADO` = 2.600) e é conferido por código: toda copy
  verbatim entre aspas, nenhum nome de fonte solto. Falhou o planejador →
  cai no prompt de código (`buildPrompt`/`buildArtePrompt`), nunca derruba a
  peça. `fieldValues.planejador|planejadorMs|leitura|prompt` registram a run.
- 🔴 **NOME DE FONTE VIRA TEXTO DESENHADO.** Primeira geração com o planejador
  no Quintal: o prompt dizia "line 2 in Amithen" e a peça saiu com "Amithen"
  letrado no lugar da copy — a régua de texto PASSOU (ela confere o que falta).
  `fontesForaDaReferencia` recusa prompt com família da marca fora da linha
  "Image N is the type specimen…"; a fonte se cita pelo PAPEL. É a lei da
  string literal (16-17/08) com outra roupa.
- **A melhoria tem TRÊS MODOS** (`modo-da-melhoria.ts`, puro): `rediagramar`
  (a peça já foi diagramada por quem cuida da marca — só posição do conjunto,
  respiro, quebra), `redesenhar` (matéria-prima — refaz no estilo da marca com
  manual + prancha como referência; copy e foto intocadas) e `refinar` (UMA
  mudança pedida; **o único em que a copy pode mudar** — o planejador devolve
  `copyFinal`, que vira a régua; "troque a frase X por Y" era impossível por
  construção). O padrão sai da ORIGEM (`modoPadraoDaMelhoria`): melhoria
  anterior → refinar; compositor/canvas/post → rediagramar; export do editor,
  arte-rapida, ajuste-arte, arte-ia → redesenhar. **Redesenhar peça com
  diagramação aprovada pinta por cima da foto em 1 de 4 rodadas** (Quintal,
  Wine Vix) e em 4 de 4 quando a foto é escura (TERO) — daí o padrão
  preservador para essas origens. Modal, rota (`modo` no zod), serviço, runner
  e tool `melhorar-arte` passam o modo; `refinar` sem pedido é recusado antes
  de cobrar.
- **A melhoria agora manda o manual do designer e a prancha tipográfica**
  (`brand-card`/`type-specimen` em `ReferenceImage`), como a geração já fazia;
  em `refinar` só a prancha (o manual inteiro convida a redesenhar o que se
  pediu para manter). Tier: `redesenhar` → `medium` (`QUALIDADE_ARTE_REDESENHO`;
  lettering novo e ornamento fino), os outros seguem no `low`; ajuste na foto
  continua `high`.
- **Planejador é `gpt-5.2`** (`OPENAI_PLANNER_MODEL`), sem `temperature`
  (gpt-5* recusa). O `gpt-4o` misturou a preserve list do refinar num
  redesenho e descreveu a tarefa em adjetivos. Custa 10-30s e centavos por
  peça; anexa ao planejador só as imagens que ele precisa VER (origem, fundo,
  manual, foto, modelo) — logo, prancha e âncoras vão pelo papel.
- **Na geração (`arte`, peça avulsa) o planejador substitui `buildArtePrompt`**;
  o que é mecânico vai colado ao fim do prompt planejado: o bloco da logo e
  `regraDeSafeArea` em pixel. Carrossel e peça com cartão de documento NÃO
  passam por ele (LOOK SPINE e faixa em pixel são mecânicos e medidos).
  `ARTE_PLANNER=off` desliga sem deploy. Com o planejador o preâmbulo por papel
  não é prefixado — o prompt já descreve cada imagem pelo índice.
- ⚠️ **`images.edit` regenera o quadro**: mesmo com "foto intocada" no prompt e
  no planejador, a foto da Wine Vix voltou desfocada num redesenho. Não é
  prompt — é a máscara (`spike-melhoria-com-mascara.ts`), como já registrado.
- ⚠️ **Dedução de crédito em paralelo estoura a transação** (`P2028`, três
  melhorias simultâneas na validação da carteira). A melhoria continua valendo
  (`creditDeductionError`), mas o ramo de falha reescreve o `fieldValues` —
  ele PRECISA carregar as mesmas chaves do ramo feliz (foi assim que o TERO
  saiu sem `planejador` no registro).
- **Scripts**: `medir-melhoria-estilo-chatgpt.ts` (o A/B da F0, 4 peças,
  dry-run), `testar-melhoria-com-diretor.ts` e `testar-geracao-com-diretor.ts`
  (caminho REAL, cobram crédito, deixam a arte na galeria — é como o Ciro quer
  avaliar), `validar-melhoria-na-carteira.ts` (uma peça por cliente).
- **Comparação lado a lado com o ChatGPT em produção (05/09/2026, noite)**, o
  MESMO pedido e a MESMA arte do Espeto Gaúcho pela agenda e pelo ChatGPT:
  - `refinar` ("troque a frase X por Y, aumente um pouco o serviço"): os dois
    acertaram a troca; **os dois perderam o acento de "família"** e a régua
    aprovou os dois, porque `normalizeForComparison` tira acento de propósito.
    Daí `acento.ts` (`divergenciasDeAcento` → `acentoAlerta`, AVISO, nunca
    reprova) e o tier subindo para `medium` quando o refino TROCA texto
    (`tierSubiuPorTextoNovo`). "Um pouco maior" no Studio fez o endereço quase
    encostar na logo; o planejador agora traduz adjetivo em número (~10-15%,
    ~25%, ~40%) e manda manter a folga da marca.
  - `redesenhar` (arte + manual + prancha nos dois): o ChatGPT centralizou e
    pôs a marca no topo; o Studio manteve a estrutura e **acrescentou uma faixa
    marrom no rodapé** porque o manual do Espeto a menciona — a regra "nenhum
    contraste acrescentado" agora se declara vencedora sobre manual e DNA, em
    todos os modos. O ChatGPT entrega 941x1672 (precisa de upscale); o Studio
    sai em 1080x1920 no post.
  - ~~O "manual" do Espeto (`brandManualUrl`) diz Roadhawk/Coolvetica/
    Montserrat; `brand.fonts` diz Bevan/Caveat/Barlow Condensed.~~ —
    **resolvido em 05/09/2026 pelo manual GERADO**, ver a seção seguinte.

### O manual de marca GERADO e o estilo lido das peças aprovadas (05/09/2026)

Pedido do Ciro: "corrige o manual do Espeto com as fontes certas… incluindo
alguns assets para serem usados como separadores de texto, ícones, para ser
capaz de fazer artes mais criativas… Analise as artes de referência de todos
os clientes para personalizar o estilo da marca de cada um." Três peças novas:

- **`BrandDNA.estiloDasReferencias` (Json)** — o estilo OBSERVADO nas peças
  aprovadas, lido por visão (`gpt-5.2`) em `src/lib/ai/analise-de-referencias.ts`
  a partir de URLs à mão + `styleRefAt` + "gostei" (até 8). Contrato PURO em
  `src/lib/brand/estilo-das-referencias.ts`: tipografia por papel, caixa da
  manchete, cores de destaque, **separadores e ícones de vocabulário FECHADO**
  (`SEPARADORES`, `ICONES`), ornamentos, diagramação, foto, logo, evitar,
  resumo. Fica FORA de `BRAND_DNA_FIELDS` (não é editado à mão, é medido) e
  entra em `BrandContext.estiloDasReferencias` pelo loader único.
  🔴 **O schema que o modelo recebe é de TEXTO LIVRE (`estiloBrutoSchema`) e o
  vocabulário é reconciliado no CÓDIGO (`normalizarEstilo`)** — com enum no
  schema a Lagosta Criativa perdeu a resposta INTEIRA por um item fora da
  lista. Item que não casa vira ornamento descrito, nunca é jogado fora.
  Rodado em 05/09: 8 dos 11 clientes gravados; em 06/09 o Ciro marcou
  referências no Seu Quinto e no Empório Fonseca e os dois entraram (10 de 11
  — só Ciro Trigo, que não é restaurante, fica sem estilo). `scripts/analisar-referencias-de-estilo.ts`
  (`--projeto`/`--todos --exceto 6`, `--urls`, `--confirmar`; dry-run por
  padrão). ⚠️ `--todos` não recebe URLs: quem foi analisado com URLs à mão
  entra em `--exceto`, senão a rodada sobrescreve.
- **O planejador recebe o estilo como "ESTILO OBSERVADO NAS PEÇAS APROVADAS"**
  (`contextoDaMarca`), declarado vencedor sobre a prosa do DNA quando divergem
  — o DNA descreve intenção, isto mede. Em `redesenhar` o SYSTEM agora manda
  USAR os separadores e ícones do manual como a marca os usa (relógio antes do
  horário, filete entre manchete e apoio, tag atrás do CTA) e proibir só o que
  NÃO está no manual: na primeira rodada real ele escreveu "no icons" em bloco
  para uma marca cujas peças aprovadas têm ícone em toda linha de serviço.
- **`src/lib/ai/manual-de-marca.ts` desenha o manual (1080x1920)** com as
  fontes REAIS (`registerProjectFonts` + napi-rs canvas, a mesma via do
  `brand-reference-card.ts`), logo (com caixa na cor escura da marca quando
  ≥ 8% dos pixels opacos são claros e a logo não é predominantemente escura —
  a MÉDIA de luminância não denuncia o arco branco do selo do Espeto),
  paleta, tipografia por papel na caixa medida, separadores a traço (do
  estilo), **ícones e gráficos OFICIAIS da aba Assets** (uma variante por
  família, `-vermelho` antes de `-amarelo` antes de `-branco`; sombras e
  arquivos sem categoria ficam de fora quando há categorizados; PNG aparado
  com `sharp().trim()` — filete de 2px numa prancha de 1080 virava nada) e o
  "Como a marca usa" lido das peças. `scripts/gerar-manual-de-marca.ts`
  (`--projeto`/`--todos`, dry-run em `.tmp-medicao-estilo-chatgpt/manuais/`;
  `--aplicar` sobe ao Blob e troca `Project.brandManualUrl`, registrando a URL
  anterior em `manuais/ANTERIORES.txt`).
  **Aplicado só no Espeto** (era o manual com as fontes erradas; anterior
  `brand-manual/6-espeto-gaucho.png`). Os outros 10 manuais foram gerados em
  dry-run para avaliação — o manual do designer continua valendo neles até o
  Ciro decidir.
- 🔴 **EXEMPLO NO PROMPT VIRA RESPOSTA.** O SYSTEM da análise dizia que
  "evitar" era "o que nunca aparece (véu escuro inteiro, selo redondo,
  gradiente de borda a borda, emoji, moldura, sombra dura)" — e os 10
  clientes voltaram com ESSA lista, quase verbatim. No Seu Quinto a visão
  descreveu a manchete com "sombra curta deslocada" e ainda assim pôs "sombra
  dura" em evitar; o Ciro corrigiu ("sempre tem uma sombra nítida na
  headline, sempre com duas cores da paleta"). O prompt não dá mais exemplos
  ali (só "ausência VERIFICADA nestas peças"), o schema ganhou
  `efeitoDaManchete` (nenhum | sombra-dura | sombra-suave | contorno; o manual
  desenha a amostra com ele, em duas cores da paleta) e a análise foi refeita
  nos 10 clientes. A regra do Seu Quinto está no DNA (`visualStyle`, regras
  aprendidas) e o planejador foi avisado: o estilo observado vence a prosa do
  DNA, mas as "Regras aprendidas na prática" — decisões do dono — vencem tudo.
- 🔴 **A cor de destaque do manual nunca é a primeira do estilo às cegas**: a
  primeira cor lida é quase sempre o BRANCO do texto principal, e a segunda
  voz da manchete saiu branca sobre fundo claro. Vale a primeira cor VIVA
  (luminância entre 40 e 200), senão a da paleta.
- **Medido no Espeto** (`testar-melhoria-com-diretor.ts --modo=redesenhar`
  sobre peça do compositor, `cmtp69b3o0001swcx9lkppw83`): manchete em Bevan
  condensada branco + "500G" em vermelho, serviço em Barlow Condensed, CTA em
  Caveat, preço em amarelo, logo uma vez, sem véu — as fontes certas pela
  primeira vez numa melhoria do Espeto. Régua OK; `textoAMaisAviso` acusou
  "CHURRASCARIA" (é o arco da logo, transcrito como texto).

### Novo Post: data primeiro, agendamento rápido e Repostar (05-06/09/2026)

Plano e medições em `docs/PLANO-2026-09-05-REPOSTAR-NA-ABA-CRIATIVOS.md`.
Regras que valem para código novo:

- 🔴 **`cleanupGenerations` reaponta os POSTS antes de apagar o blob**
  (`reapontarMidiasDosPosts`, `src/lib/cleanup/reapontar-midias.ts`, nas três
  passagens: Pass A, Pass B-recovery e o `cleanupGenerationBlobs` diário). Até
  05/09 só `Generation.resultUrl` era reapontado para o Drive e
  `SocialPost.mediaUrls` ficava com a URL recém-apagada: **40% das artes de
  posts com mais de 90 dias respondiam 404** — a arte existia, o endereço do
  post é que tinha morrido. Vale para QUALQUER status: com repost, um post
  SCHEDULED pode apontar para arte de 85 dias, e o cron de domingo entregaria
  URL morta ao Zernio. `scripts/reapontar-midias-mortas.ts` (dry-run por
  padrão) reparou o histórico em 06/09/2026: **1.311 posts** reapontados pela
  Generation; **459** sem Generation não têm conserto (criativo apagado à mão
  pela galeria apaga blob E linha).
- **A mídia de um post antigo se resolve pela Generation, nunca pela
  `mediaUrls`** — é a URL que o cleanup mantém viva. O card de repost ainda se
  esconde no `onError` da imagem.
- **A fonte do repost é o `SocialPost` POSTED, nunca a galeria**: só 36% dos
  posts publicados têm Generation alcançável pela aba (76% nos últimos 90
  dias). A chave de "mesma arte" é a **URL da imagem** sem query
  (`chaveDaImagem`): 1.374 posts têm `generationId` cuja mídia publicada é
  OUTRA (a melhoria cria arte nova) — contar por Generation zeraria o contador
  de quem mais reposta.
- **Semáforo, não portão; ordena, nunca esconde; só STORY.** Medido nos 2.605
  reposts reais: 47% têm menos de 14 dias (verde ≥14 · âmbar 7-13 · vermelho
  <7, tudo visível); 51% caem fora de dia+faixa (o ranking de
  `src/lib/posts/repostar.ts` ordena, `jaAgendadas` é o único filtro); 2.595
  são story (feed repostado fica duplicado no perfil). Aviso de prazo é
  ESTREITO (data, mês, urgência, data comemorativa — 5% das legendas);
  🔴 `pareceDado` dispara em 97% e não serve aqui.
- **`horariosTipicosDoProjeto` é a leitura da cadência SEM emissão** (a mesma
  conta de `sugerirPosts`: cadência v2 + grade da base). 🔴 **Nunca chame
  `sugerirPosts` do formulário** — ela registra um `LearningSignal` por slot.
- **O "+" da agenda manda só o DIA** (`novoPostHref(id, dia, { soDia: true })`
  → `?dia=AAAA-MM-DD`); a hora vem dos horários típicos daquele dia da semana
  (`horarioPadrao`, `src/lib/posts/quando.ts`, puro). Antes cravava 10:00 nos
  dois chamadores, e o picker inventava "amanhã 12:00".
- **O formulário é QUANDO → MÍDIA → LEGENDA (só feed) → "Mais opções"**, com
  STORY e SCHEDULED como padrão (92% e 73% dos 2.684 posts de 90 dias).
  Recorrente (0), lembrete (1%), 1º comentário (0 de 216) moram em "Mais
  opções" com a mesma regra de negócio. 🔴 **Story não tem campo de legenda**:
  o envio grava `caption: ''` para story desde sempre, e o campo antigo
  descartava o que a pessoa digitava. Mídia que já chega escolhida (galeria,
  editor) abre com as fontes recolhidas e "Trocar mídia".
- **"Agendar e próximo"** (`proximoHorario`): agenda e reabre no horário típico
  seguinte do mesmo dia, sem sair da tela. Os dois botões são `type="submit"`
  do mesmo form; o secundário arma um ref no `onClick`.
- **`LearningSignal tipo: 'repost'`** — UMA proposta por `(projeto, 'repost',
  diaBRT, HH, safra)` (`chaveDoRepost`); o formulário reconsulta a cada toque
  e a chave é o que impede o denominador de virar ficção. O desfecho é
  CALCULADO na rota `POST /posts` (`fecharPropostaDeRepost`): mídia ou
  Generation entre os candidatos → `aceita-como-veio`; faixa existia e usou
  outra → `trocada`; sem proposta para o slot → nada.
- **`sugerir-repost` no conector** (catálogo `agenda.ts`, fixture em
  `validar-registro-mcp.ts`): mesma função de serviço, `superficie: 'chat'`.
- ⚠️ **"Usar a legenda anterior" ficou de fora, de propósito**: a faixa só
  existe em story e o formulário não tem legenda de story. Os 53% de reposts
  com a mesma legenda vêm do conector e do compositor, que gravam a caption
  do story — reaproveitá-la é trabalho do chat, não deste formulário.

### A rodada de revisão do Espeto: a régua lia a origem por visão e reprovava peça certa (06/09/2026)

O Ciro revisou a semana 07–13/09 do Espeto pedindo ajustes com IA: 24
melhorias, 20 concluídas, **4 FAILED** — e as quatro eram defeito do sistema,
não da peça. Os pedidos reais da rodada ("use mais elementos da marca",
"destaque o valor", "deixe mais divertida", "tire da frente do rosto do
garçom") são o formato que vale medir.

- 🔴 **A peça do COMPOSITOR não tinha régua de banco.** `extractExpectedTexts`
  lia `slotValues`/`texts`/`textos`/`textosLivres`, e o compositor grava a
  copy em `layersSnapshot` — TODA melhoria da semana caía na régua por VISÃO,
  que transcreveu a origem como "PICAHNA,PICAHNA SUINA,LINGUICA" e "ESPACO
  GAUCHO" (o arco do selo). A arte nova saiu certa ("picanha", e a logo
  redesenhada) e a conferência reprovou três vezes (duas na mesma peça, o
  Ciro tentou de novo). Hoje `layersSnapshot` é a última forma lida
  (`textosDaPagina`, uma linha por bloco) — régua exata, `regua: 'banco'`,
  sem OCR. Replay offline das três falhas contra a transcrição gravada:
  **3 de 3 passam**.
- **A régua por visão tolera UM erro de grafia por palavra** (`casarComTolerancia`,
  Damerau/OSA ≤ 1, só palavra de 5+ letras — número, preço e hora exatos) e
  AVISA (`grafiaAlerta`), nunca reprova: o modelo corrige a grafia ao desenhar
  E ao ler, então "PICAHNA"→"PICANHA" é ruído de OCR de um dos lados. O traço
  (`-`) virou espaço na normalização, como `·` e `|`: "frango - a partir"
  colava em "FRANGO-A" e reprovava contra "FRANGO A".
- **Palavra longa a duas edições da marca é a marca** (`semTextosDaMarca`):
  "ESPACO" ~ "ESPETO". E o desconto do texto a mais compara palavra a palavra
  com a mesma tolerância — a placa da fachada voltava como "CHURRASCARIA & CIA"
  numa leitura e "CHURRASCO & CIA" na outra, e o alerta tocava em toda rodada.
- 🔴 **O filtro de segurança da OpenAI olha a FOTO, e para esta foto é
  DETERMINÍSTICO**: `safety_violations=[sexual]` num salão cheio com famílias
  e crianças (Sex 11/09, `cmtmfvn5v0081sw712x35e42v`), pedido "distribua
  melhor os textos". Sondado com `runImageEdit` cru: **4 de 4 recusas**, duas
  delas com prompt neutro ("reproduce this image exactly as it is") — não é o
  prompt, não é o planejador, não é sorteio. A recusa não custa a chamada; o
  runner retenta UMA vez (`filtroDeSeguranca.retentado`, ~20s) porque em outra
  foto pode ser ruído, e na segunda recusa a mensagem diz "tente com outra
  foto" em vez de um request ID. Para essa peça a melhoria por IA não existe:
  é editor ou outra foto.
- 🔴 **O ramo FAILED gravava só `error` e `textCheck`** — sem modo, régua,
  textos, planejador nem prompt; o diagnóstico teve de ser refeito à mão a
  partir da transcrição. `registroDaRun` vive fora do try e é preenchido
  conforme a run decide; o catch espalha as mesmas chaves do ramo feliz.
- **"Vem pro fogo" entrou no DNA do Espeto** como proibição (`virarRegra`,
  contentRules), pelo feedback do Ciro na peça de quarta: "Não use mais esse
  termo… Vou aprovar dessa vez mas não uso mais."

### A busca de fotos enxerga a foto: laço fechado, lexical de verdade, embedding e catálogo v3 (07/09/2026)

Plano em `docs/PLANO-2026-09-07-BUSCA-DE-FOTOS.md`. Nasceu da pauta de
fotografia de 07/09 acusando "AS BUSCAS MORRERAM" para croissant, gelato e
crepe na Real Gelateria — um acervo com 113, 2.380 e 145 fotos deles.
Medição em `scripts/medir-busca-de-fotos.ts` (leitura; NUNCA chama
`buscarNoAcervo`, que registra sinal).

- 🔴 **`expirada` mede FECHAMENTO, não busca.** 81% das buscas da carteira
  expiravam (488 de 603 desde 08/08) enquanto `PhotoUsage` registrava 1.131
  usos: compositor, canvas e chat usavam a foto sem fechar a busca. A pauta
  lia isso como "nenhuma serviu" e o ranking transformava cada expiração em
  rejeição das 3 do topo (~1.460 rejeições fabricadas). Hoje
  `registrarUsoDeFoto` fecha a busca (ponto único por onde todo uso passa;
  `historico`/`usedAt` no passado não fecham), `expirada` é NEUTRA no
  contrato do sinal, `busca-morta` exige ≥ 2 `trocada`, e a busca VAZIA
  (`total: 0`) passa a ser registrada — é ela que diz "falta no acervo".
- **Tema de uma palavra acertava 98%; composto, 16%** (23 temas reais da
  Real). `casaComTema` era OR por substring (`"cheio"` casava `"recheio"`),
  ignorava a descrição e não sabia que sorvete é gelato. Hoje
  `gruposDoTema` (palavra + sinônimos de `sinonimos-do-acervo.ts` + pilar) com
  MAIORIA (0,6), `raiz()` por token, `calcularIdf(todas)` como raridade e
  `COMPLETUDE` (casar tudo vale um destaque). Composto foi a 66% só com
  texto. `palavrasDoTema`/`casaComTema` mantêm o OR sem dicionário — são a
  régua das medições de PILAR (pauta, curadoria, cobertura).
- 🔴 **IDF do acervo INTEIRO, nunca da lista filtrada** — por isso
  `buscarNoAcervo` calcula uma vez e passa a `filtrarAcervo` e a
  `ranquearAcervo`. E palavra em toda foto tem idf 0 mas CASOU: o piso de 0,1
  mantém o casamento contando.
- **Maioria que zera relaxa para OR**: "noite fachada noturna luzes" tem 3
  fotos de noite e nenhuma "luzes"; devolver vazio é pior que devolver as 3.
- **F2: Gemini Embedding 2 + pgvector no Neon** (decisão do Ciro, chave
  paga). `PhotoEmbedding` guarda DOIS vetores por foto (imagem e
  descrição+tags) no MESMO modelo, 1.536 dims via MRL, versão na linha. O
  tema vira vetor, as 60 mais parecidas entram no pelotão mesmo sem casar
  palavra, e a similaridade vai a `ranquearAcervo` como insumo pré-calculado
  (`similaridade`, peso 60) — o módulo continua puro. Medido: 4 embeddings
  em 1,2s, coseno texto↔imagem entre 0,30 e 0,45, por isso a similaridade é
  NORMALIZADA por posição (`normalizarPorRank`, imagem 0,9 + texto 0,1),
  nunca coseno cru. Nada disto derruba a busca: sem chave/vetor/tabela, a
  lista é a lexical. Safra `acervo-v3`.
- 🔴 **A régua lexical NÃO mede a via semântica** ("todas as palavras do
  tema estão no texto da foto" dá zero a uma foto de salão lotado para
  "salão cheio"). Quem julga é `scripts/julgar-busca-de-fotos.ts` (visão
  sobre o top-5, vereditos em cache). Calibrado assim (Real, catálogo v3
  estável, 07/09): a lexical acerta 40% dos temas reais e 12% dos visuais;
  o vetor de imagem 43%/32%; a fusão 46%/24%. RRF não ganhou nos reais e um
  gate "só quando a lexical é fraca" custou os visuais. 🔴 Calibrar com o
  catálogo MUDANDO (reenriquecimento em curso) deu um ponto diferente — meça
  com o catálogo parado. 5 dos 13 temas
  reais são impossíveis (0/5 em todo método) — a sopa de palavras do chat
  pede o que o acervo não tem.
- 🔴 **`files.list` do Drive NÃO devolve `md5Checksum` neste acervo** (245
  fotos listadas, zero com hash, com o `fields` pedindo), embora o
  `files.get` devolva. Era por isso que o backfill da reconciliação nunca
  preencheu nada e `md5` estava vazio em 100% das 12.694 entradas. O
  indexador guarda o hash do `get` em `PhotoEmbedding` e o cron o copia de
  lá (+ até 200 gets por rodada).
- **Catálogo v3** (`catalogo-de-fotos.ts`, puro): UM schema zod tolerante no
  lugar de três interfaces divergentes, o prompt de visão ÚNICO do cron e do
  script, vocabulário FECHADO de tags (pilares + pastas + canônicas; fora
  dele vai para `tagsLivres`) e os campos que só a foto respondia: `assunto`
  (um só), `elementos`, `enquadramento`, `momento`, `lotacao`, `pessoas`.
  `enriquecer-catalogo.ts --v3` reanalisa só o que não é v3; depois
  `indexar-embeddings-de-fotos.ts` reembeda SÓ o texto de quem mudou.
- **Indexação roda fora da Vercel** (Mac): `indexar-embeddings-de-fotos.ts`
  (dry-run por padrão, ≈ US$ 0,00012/imagem, downloads do Drive em paralelo
  dentro do lote — em série eram 45 fotos/min). O dia a dia é do cron
  `reconciliar-catalogos`, que indexa a foto NOVA no mesmo passo em que a
  cataloga.

### O manual como design system e as DUAS PORTAS da peça avulsa (08/09/2026)

Arco em `docs/SESSAO-2026-09-08-MANUAL-E-DUAS-PORTAS.md`. Medido direto na API
nos nove clientes (07-08/09, tier `low`): **a peça sai melhor com MENOS imagens
e MENOS regra**. Foto + arte de referência + prompt de cinco linhas venceu; cada
imagem do sistema a mais (prancha, âncora, card, arquivo da logo) afastou a
peça do que a referência pedia. Receita do Ciro, confirmada: "enviar a arte
escolhida de referência e a copy que o usuário escreveu", sem lista de "não".

- **Duas portas no runner** (`creative-generation-runner.ts`, antes de
  `ordered`): com `style-guide` → porta `referencia` (foto + referência +
  `prompt-da-referencia.ts`); sem referência e com `brandManualUrl` → porta
  `manual` (foto + manual + `prompt-do-manual.ts`). Carrossel, peça com
  cartão, `finalPrompt` do MCP, sem foto ou sem manual seguem no planejador.
  `ARTE_PORTAS=off` desliga. `fieldValues.porta` é a telemetria; `refsUsadas`
  tem 2 itens. ⚠️ **Ainda não medido em produção** — só na API direta.
- **Texto de porta mora em módulo PURO com teste**, nunca no runner. O runner
  só cola ao fim o que é MECÂNICO: o bloco da logo (canto reservado) e a safe
  area em pixel. A copy passa por `copyComCaixaDaMarca` antes — a caixa é da
  STRING (lei de 16-17/08).
- 🔴 **Prompt e compositor leem a MESMA variável de canto** (`cantoParaCompor`):
  com referência, o canto da assinatura dela; na porta do manual,
  `cantoDaLogoDoEstilo`; senão `LOGO_CORNER`. Ler variáveis diferentes é o
  defeito de 07/09 (canto superior reservado, marca colada no rodapé).
- **A referência do rodízio (`style`) só conta como usada se ENTROU nas
  imagens** — na porta do manual ela fica de fora e marcá-la queimaria a vez.
- **O manual é um design system 16:9 (3000x1688)**, `manual-de-marca.ts`: logo
  num PAINEL cinza médio inteiro (caixa escura atrás da logo era COPIADA pelo
  modelo em 4 de 8 peças), cada elemento no próprio ladrilho claro/escuro pelo
  contraste DELE (ícone vermelho sobre faixa vermelha não lê), alfabetos
  desenhados na largura do painel sem peso forçado (`700` sintetizava negrito
  falso na Amithen), SEM prosa de uso (vai no prompt). Vertical "para o
  gpt-image receber no formato do story" não era razão técnica: o único limite
  da referência é o lado maior ≤ 3000px.
- **O prompt do manual é o molde do prompt do Ciro**, genérico para qualquer
  foto e por cliente: cor de destaque ENCAIXADA na paleta (a leitura vê a cor
  sob a luz da foto), caixa do mapa da casa (`CAIXA_DA_MANCHETE`) vencendo a
  leitura, direção estética SEM as orações sobre tarja/véu/degradê (elas
  contradizem a regra do fundo), nome de fonte nunca (vira texto desenhado),
  serviço no rodapé por `blocosDeServico`, textos exatos por último.
- `scripts/prompts-do-manual.ts` escreve os prompts por cliente e, com
  `--gerar`, testa direto na API (só fatura OpenAI, ~US$ 0,01/peça);
  `scripts/gerar-manual-de-marca.ts --todos --aplicar` regenera e aplica os
  manuais (URLs anteriores em `.tmp-medicao-estilo-chatgpt/manuais/ANTERIORES.txt`).

### Gradientes da marca e ícone nas combinações de texto (10/09/2026)

Pedido da Roberta: o verde da arte "Comece a Semana com Sabores Real" (feita
pelo Claudinho) não saía no editor, e a Real precisava do gradiente e de um
bloco de texto com os ícones de local e horário prontos para usar.

- **Gradiente de uma marca só mora em `GRADIENTES_POR_PROJETO`**
  (`src/lib/assets/gradients-library.ts`); o painel Gradientes mostra a seção
  "Gradientes da marca" apenas no projeto da chave. Hoje: Real (1), Verde Real
  e Creme, no rodapé e no topo. Mesmo precedente de mapa por projeto de
  `CAIXA_DA_MANCHETE` e `LOGO_MODE_POR_PROJETO`. Cliente novo = entrada no mapa
  e deploy; se virar rotina, o caminho é uma tabela por projeto, como a
  `FontCombination`.
- 🔴 **Toda parada de um gradiente de marca tem a MESMA cor; só a opacidade
  muda.** O preset "Preto para Transparente" com a cor trocada numa ponta
  deixava a outra em `#000000` com opacidade 0 — o editor (Konva) e o render
  (napi-rs) interpolam cor e opacidade separados, sem pré-multiplicar, e o
  meio acinzenta. `gradients-library.test.ts` trava isso.
- **A curva foi MEDIDA, não chutada**: a foto original do acervo alinhada à
  arte do Claudinho, opacidade estimada linha a linha, ângulo e curva
  ajustados simulando a interpolação do canvas, e conferência final com o
  `CanvasRenderer`. Resultado: 11° (mais alto do lado do texto), 11 paradas,
  sólida no pé e sumindo perto do meio da arte. Duas paradas lineares deixam um
  "degrau" visível onde o verde começa. O topo é o espelho vertical (169°).
- **Combinação de texto aceita ícone** (`FontComboElement.icon`: url, largura,
  altura e deslocamento em px na base 1080, relativos ao canto superior
  esquerdo do texto). `buildComboLayers` emite a camada de imagem logo depois
  do texto, no mesmo `groupId` e `stackOrder` — o reflow da pilha empurra texto
  e ícone juntos. `capturarCombinacao` devolve o ícone ao salvar: pela marca
  `metadata.iconeDe` ou, sem ela, pela geometria (à esquerda do texto, com o
  centro na altura da caixa, a no máximo três larguras de distância).
- **A arte sem modelo (`createArteLivre`) aplica o ícone também**, porque usa o
  mesmo `buildComboLayers`; `listar-combinacoes-de-texto` marca `icone: true`
  no elemento que tem um.
- **Dados criados junto**: template 427 "Real Gelateria — Gradientes e textos
  da marca" (6 páginas de CONTEÚDO, não modelos), elementos 429–432 (alfinete
  e relógio em creme e em Verde Real) e as combinações "Local e horário — creme
  sobre verde" e "— verde sobre creme". ⚠️ Enquanto este código não está no ar,
  o editor antigo ignora o `icon` (mostra só os textos) e **apaga o ícone** se
  alguém salvar a combinação por lá.
- 🔴 **Ao abrir as páginas, os ícones do grupo subiam — e o editor SALVAVA
  isso.** Dois defeitos do crescimento automático de texto
  (`konva-editable-text.tsx`), que existiam antes e só apareceram com camada
  que não é texto dentro do grupo:
  1. Quando vários textos do grupo são medidos no mesmo instante, a pilha
     desloca os de baixo, mas cada texto regravava a própria posição com o y
     lido no render — desfazendo o deslocamento. Só as camadas que não são
     texto ficavam deslocadas. Com âncora no topo, a medida agora grava só a
     altura (`ajusteDeAlturaMedida`, `src/lib/texto-altura-automatica.ts`).
  2. As MINIATURAS de página também mediam: o `onChange` delas é no-op, mas o
     reflow da pilha escreve direto no editor, então cada miniatura montada
     empurrava o grupo de novo (os ícones da página 5 subiram em dobro). Texto
     com `disableInteractions` não mede mais.
  ⚠️ Consequência da correção 1: num grupo cuja altura gravada difere da que o
  editor mede, os TEXTOS de baixo passam a acompanhar a pilha ao abrir a
  página, como a regra sempre quis (e como o `reflowComboStack` do servidor
  já fazia). Para não mexer em nada ao abrir, a altura gravada precisa ser a
  medida — nas páginas da Real ela já é (74, 120, 48, 48).
- **Os ícones se ajustam DENTRO da edição da combinação** (pedido do Ciro, no
  mesmo dia): o painel lista o ícone de cada texto e deixa trocar, pôr e tirar
  (`panels/combo-icones.tsx`); o nome da linha seleciona o ícone no canvas
  para mover e redimensionar. Antes eles não estavam travados — o modo de foco
  escurecia toda imagem a 12% sobre o fundo #141414, e o ícone sumia de vista.
  Hoje ele só escurece a imagem que NÃO é ícone de texto (`ehIconeDeTexto`).
- 🔴 **O controle de ícone não pode morar na aba Elementos**: trocar de aba
  desmonta o painel de Texto e o estado `editando` (os ids que o salvar
  captura) se perde. Pela mesma razão, ícone POSTO durante a edição entra em
  `editando.layerIds` — o salvar só enxerga esses ids.
- **Trocar a imagem mantém o CENTRO e a ÁREA** (`caixaDoIconeTrocado`,
  `src/lib/font-combinations-icones.ts`): manter a caixa com `contain`
  encolheria o relógio quadrado dentro da caixa alta do alfinete. Ícone novo
  copia tamanho, vão e altura de um ícone que já existe na combinação
  (`iconeNovoParaTexto`); sem nenhum, usa a proporção dos ícones da Real.
- **"Salvar seleção como combinação" leva os ícones selecionados** junto com os
  textos; antes filtrava só texto e a combinação nova nascia sem ícone.

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations

### 🔴 "Essa classe não gera CSS neste repo" era o MÉTODO de medição (05/09/2026)

Este arquivo e a memória do projeto carregavam uma família inteira de "classes
mortas" (`bg-zinc-400`, `grid-rows-2`, `sm:w-28`, `w-[7rem]`, `lg:max-w-sm`,
`sm:ml-auto`, `sm:inline-flex`, margem negativa, `h-[…vh]`, `min-w-[7rem]`,
`bottom-1.5`…), com a receita de fugir delas por estilo INLINE. **Não existe
classe morta. O que havia era uma medição que não podia dar outro resultado.**

O método usado nas três rodadas foi *injetar o elemento na página servida pelo
app e ler `getComputedStyle`*. Tailwind é **JIT**: ele gera regra só para a
classe que ENCONTRA no fonte varrido. Uma classe que ainda não está em lugar
nenhum do `src/` não tem regra — e não teria em projeto Tailwind nenhum. A
medição perguntava "esta classe que eu ainda não escrevi existe na folha de
estilo?", e a resposta é sempre não.

A própria memória tinha registrado o sintoma sem reconhecer a causa: *"vale a
variante que JÁ EXISTE em outro ponto do código-fonte, não a variante em si"* —
`sm:max-w-sm` vive e `lg:max-w-sm` morre, `top-1.5` vive e `bottom-1.5` morre,
`h-[calc(100dvh-12rem)]` vive e `h-[calc(100dvh-10rem)]` morre. Isso é a
descrição exata do JIT, não de uma build quebrada.

**A prova, medida em 05/09/2026** compilando `src/app/globals.css` com o
`@tailwindcss/postcss` **do projeto** (4.1.17), com os 9.001 `.tsx` de
`.claude/worktrees/` no caminho: `.grid-rows-2`, `.bg-zinc-400` (com
`--color-zinc-400: oklch(70.5% 0.015 286.067)` definido), `.sm\:w-28`,
`.lg\:max-w-sm`, `.sm\:ml-auto`, `.sm\:inline-flex` e `.border-emerald-500`
estão **todas** no CSS gerado — porque hoje elas aparecem no fonte, ainda que
só dentro dos comentários que as declaram mortas. E uma classe INÉDITA
acrescentada na hora a um arquivo do `src/` (`grid-rows-3`) sai na compilação
seguinte. Não há teto de arquivos, não há classe fora do alcance da varredura,
e **escopar `@source` não resolveria nada** — não há o que resolver.

O que fica:

- 🔴 **Nunca meça uma classe injetando o elemento no navegador.** Escreva a
  classe no fonte, deixe o dev server reconstruir (ou compile o CSS) e SÓ
  ENTÃO meça. Sem isso a medição responde outra pergunta.
- 🔴 **`grep` no fonte também não prova**: o scanner é textual e não distingue
  código de comentário — ele gera a classe a partir do próprio comentário que
  a declara morta. Hoje a ÚNICA ocorrência de `grid-rows-2` no repositório é
  esse comentário. Prova é o seletor no CSS COMPILADO.
- **Classe que não aplica com a regra presente é outra coisa**: precedência
  (`dark:bg-zinc-100` do Button vencendo `bg-…` sem prefixo — ver "Modificador
  vence classe sem prefixo") ou recorte de ancestral (`[class*="container"]` do
  `globals.css`, ver a seção da galeria). As duas continuam valendo e são
  reais; o que era falso é "o Tailwind não gerou".
- **O estilo inline que já está no ar NÃO foi revertido**, e não precisa ser:
  funciona, e trocá-lo em massa mexeria em tela publicada por estética de
  código. O que muda é a REGRA — não escreva inline novo por causa desta
  crença.
- ⚠️ **Limite**: esta medição é de COMPILAÇÃO de CSS. Não voltei ao navegador
  para confirmar que `grid-rows-2` desenha a grade no card; quem reabilitar uma
  dessas classes confere na tela depois de reconstruir.

### O diretor de arte religado dentro das portas, com o briefing do Ciro como molde (08/09/2026)

O PR #107 (08/09, madrugada) pôs as duas portas ANTES do diretor de arte
(`elegivelParaPlanejador = !porta`), e como os 11 projetos ganharam
`brandManualUrl` no mesmo dia, toda peça avulsa com foto passou a sair de um
MOLDE FIXO (`prompt-do-manual` / `prompt-da-referencia`). Era o "sempre o
mesmo prompt" que o Ciro pediu para acabar. A medição de 07-08/09 comparou
"poucas imagens + prompt curto" contra "todas as imagens do sistema" — a
lição válida é a das IMAGENS, não a do molde; porta contra diretor nunca foi
medido.

- **A porta decide as IMAGENS; o diretor escreve o BRIEFING.** O gpt-image
  recebe foto (Imagem 1) + manual (Imagem 2). O diretor (`gpt-5.2`,
  `diretor-de-arte.ts`, `SYSTEM_GERACAO`) escreve o prompt; o molde da porta
  é o caminho de volta quando ele não responde (`planejador: 'fallback'` +
  `porta` no `fieldValues`). `ARTE_PLANNER=off` desliga o diretor;
  `ARTE_PORTAS=off`, as portas.
- 🔴 **A referência escolhida à mão é ANALISADA, não enviada** (decisão do
  Ciro, 08/09): o diretor a vê (`visivelAoGerador: false`) e traduz em
  instruções — zona do bloco, fontes por papel, cores, ornamentos, canto da
  marca; o gpt-image não a recebe, então o texto e a cena do post antigo não
  têm por onde vazar. Sem manual ela ainda vai como imagem (seria a única
  fonte de fontes e logo). `ARTE_REFERENCIA_COMO_TEXTO=off` volta a mandá-la.
  A referência vista pelo diretor CONTA no rodízio (`registrarUsoDaReferencia`).
- **O briefing sai em PORTUGUÊS, por seções, no molde do briefing que o Ciro
  escreveu para o happy hour da Wine Vix**: abertura + direção estética, FOTO
  DE FUNDO, IDENTIDADE VISUAL, LOGOTIPO (versão do painel do manual, posição,
  tamanho relativo), BLOCO PRINCIPAL, uma seção por bloco da copy, ÁREA
  LIVRE, RODAPÉ (só com serviço), HIERARQUIA VISUAL, EVITE (3 a 6 itens
  desta peça), TEXTOS FINAIS. Teto 4.500 caracteres (o molde tem ~4.300).
  O que o sistema anexa DEPOIS continua mecânico: bloco da marca e safe area
  em pixel.
- 🔴 **Halo, véu, degradê e os tetos numéricos de tamanho SAÍRAM do diretor
  da geração** (Ciro: "deixe isso para o gpt-image; ele pode confiar mais").
  Legibilidade se resolve por POSIÇÃO e cor do texto. `tratamentoDeFotoNoPrompt`
  RECUSA briefing que prescreva qualquer um deles. Na MELHORIA a regra "nenhum
  contraste acrescentado" continua como estava (05/09) — são system prompts
  diferentes.
- **A foto chega com MEDIDA**: `leitura-da-foto.ts` (puro) resume o mapa de
  calma do compositor (`mapa-de-calma.ts`, ~100ms, sobre a foto como aparece
  na peça) em nove regiões calma/agitada × escura/clara, o assunto estimado em
  % e as três regiões mais calmas em ordem; e o catálogo v3 da foto (assunto,
  elementos, enquadramento, pessoas, lotação) entra como texto — até aqui
  NENHUM prompt de geração lia o catálogo. Regra da casa: o modelo declara, o
  código mede. Medido na Wine Vix: o diretor pousou o bloco na região que a
  medição apontou (inferior-esquerda) e reservou o canto oposto para a marca.
- 🔴 **As travas mecânicas do briefing** (`problemasDoBriefing`, cada uma com
  teste em `__tests__/diretor-de-arte-geracao.test.ts`): copy verbatim entre
  aspas; nome de fonte só em linha "Imagem N"/"Image N"; sem tratamento de
  foto; serviço na copy ⇒ seção RODAPÉ (`blocosDeServico`); frase da
  referência (`GuiaLido.textos`, ≥ 12 chars, fora da copy) fora do briefing;
  **caixa da copy intocada** (`caixaAlterada` — o By Rock saiu com "RENDE PRA"
  / "GALERA" na quebra sugerida a partir de "Rende pra galera": a caixa é do
  mapa `CAIXA_DA_MANCHETE`, nunca do diretor; `copyEstaNoPrompt` não pega
  porque normaliza para maiúsculas); **marca nunca no superior-esquerdo em
  story** (`logoNoCantoDoAvatar` — a regra estava no prompt desde 07/09 e o
  diretor a ignorou). Recusa vira feedback e o diretor reescreve (3 rodadas).
- **`scripts/ver-prompt-do-diretor.ts`** mostra o briefing de um caso real
  (`--projeto`, `--foto`, `--copy`, `--referencia`, `--rodadas`) sem gerar
  imagem, sem tocar no banco: uma chamada do planejador por rodada (~20-45s).
  Saída em `.tmp-diretor/`. É o dry-run antes de gastar crédito.
- ⚠️ **Não medido em produção com feedback real** — como as portas de ontem.
  O que se sabe: 3 briefings reais (Wine Vix com e sem referência, By Rock)
  no molde, copy inteira, sem vazamento, posição pela medição. Quando o bloco
  já vai ao terço inferior, o diretor põe o serviço como última linha do
  bloco em vez de rodapé separado — aceito, é a mesma zona.
- ⚠️ O prompt do manual e o da referência (moldes) continuam no código como
  fallback e cobertos por teste; não os apague.

### 🔴 A foto intocada: máscara medida e recusada, tom casado por código adotado (08/09/2026)

Quatro clientes, doze gerações reais no dia (~US$ 0,10 e 25 créditos cada),
todas medidas em CIELAB contra a foto original cortada. O que se sabe:

- **Nenhum prompt segura a foto.** Sem tratamento nenhum, o `images.edit`
  escurece o quadro INTEIRO: L* -26% (porta antiga), -33% e -41% (diretor
  novo, com "sem alterar luz, cor, contraste" escrito), -20% (Real, molde). O
  croma real até CAI; o que lê como "saturada" é a foto escura com sombras
  fechadas. O ChatGPT, na mesma tarefa, admitiu ter recriado ponte e skyline.
- 🔴 **A máscara do gpt-image-2 é ORIENTAÇÃO, não garantia.** Controle (foto
  reencodada) = 0,6 de diferença fora das zonas; peça gerada COM máscara =
  29,8, sinal negativo nas nove regiões. Reduz o estrago pela metade (63 →
  30) e não zera. O humanizar de 07/09 já tinha visto ("objeto protegido
  movido").
- **O que zera é código** (`mascara-da-geracao.ts`, `restaurarFotoForaDasZonas`):
  LUT por canal calculado nos pixels fora das zonas + recomposição da foto
  original fora delas, com feather DENTRO da zona. Diferença fora: 0,0.
  🔴 O sharp devolve o raw borrado em 3 canais mesmo para entrada de 1 — ler
  com o stride errado espalhava alpha por onde não havia zona (8,8 de
  resíduo que parecia feather). 🔴 O texto TRANSBORDA a zona ("sabore" com o
  "s" cortado): o que o modelo pintou numa faixa em volta da zona
  (diferença > 60 depois do LUT) é mantido.
- 🔴 **E mesmo assim a máscara PERDEU em 2 de 4 clientes**, por três defeitos
  que a recomposição não conserta: o modelo pinta fundo CHAPADO dentro da
  zona (TERO: -82 de luz na faixa do título; By Rock: retângulo preto atrás
  da manchete — o véu de volta, com borda); ignora a zona (CTA do By Rock
  caiu fora e foi apagado; a faixa de transbordo manteve um pedaço do bolo
  REDESENHADO, com emenda); e perde o ENQUADRAMENTO que o modelo faria
  sozinho — o By Rock de 24/08, com o modelo reenquadrando o bolo para baixo,
  é a melhor peça do conjunto. Corte nosso no centro = assunto no meio =
  texto colidindo. Wine Vix e TERO saíram bem; By Rock, mal.
- 🔴 **Decisão do Ciro (08/09, fim do dia): "não vamos usar" a máscara.** O
  caminho de máscara foi REMOVIDO do runner e do diretor (nada de `zonas`,
  nada de corte nosso); o módulo `mascara-da-geracao.ts` fica pelo
  `casarTomGlobal` e pela passada cirúrgica. Detalhe e tabelas em
  `docs/SESSAO-2026-09-08-DIRETOR-MASCARA-E-TOM.md`.
- **Adotado: SEM máscara + `casarTomGlobal`** (LUT por canal levando o
  histograma da peça inteira ao da foto, depois da geração, antes do QA e da
  logo). Offline nas peças existentes: L* 26,4 → 44,5 (Vix), 46,0 → 57,7
  (Real), igual à foto; enquadramento do modelo preservado; sem retângulo,
  sem emenda. O texto claro só clareia um pouco. Não corrige mudança LOCAL
  (fundo chapado, objeto movido). `ARTE_TOM_CASADO=off` desliga. Telemetria:
  `fieldValues.tomCasado`.
- **O diretor devolve um `diagnostico`** (intacto, problema principal,
  hierarquia — a lição estruturada da conversa do ChatGPT), gravado no
  `fieldValues` como auditoria.
- 🔴 **Serviço: o diretor insistia em tratar "Funcionamento - 10h às 22h" como
  APOIO da manchete** (2-3 recusas seguidas, ~1 min cada, e na terceira caía
  no molde). A trava por posição de seção não bastava; o que resolveu foi o
  CONTEXTO apontar os blocos de serviço, classificados por `blocosDeServico`
  ("← SERVIÇO: vai SÓ na seção RODAPÉ"). Depois disso, 1ª tentativa. A trava
  `servicoSemRodape` olha SEÇÕES (BLOCO/TEXTO/TÍTULO…), não "qualquer lugar
  antes": citar o horário na FOTO DE FUNDO não é pendurar.
- **Rodapé miúdo** (Ciro, 08/09): pedir "50 px" rendeu ~30. O diretor agora
  pede proporção ("metade da altura de uma linha da manchete") além de ~2,8%
  da altura. Não medido ainda.
- ⚠️ **Real Gelateria: o diretor foi recusado 3× por escrever "gradiente"** —
  o DNA dela descreve "gradiente de leitura" e ele ecoa. A trava
  `tratamentoDeFotoNoPrompt` está certa; o que falta é o DNA parar de
  descrever véu (decisão do Ciro, como no Quintal em 05/09). Caiu no molde,
  sem máscara e sem tom casado naquela rodada (o tom casado entrou depois).

### A passada cirúrgica: onde a máscara serve, e o que ela não garante (08/09/2026)

`src/lib/ai/passada-cirurgica.ts` + `scripts/passada-cirurgica.ts`: uma
correção LOCAL numa peça pronta ("aumente o rodapé"), com máscara só na zona
e a peça original recomposta fora dela pelo mesmo `restaurarFotoForaDasZonas`
(a própria peça é a referência de tom). Disparada por gente, nunca por revisor
automático. Medido no rodapé da Wine Vix, 5 tentativas de ~30s e ~US$ 0,008:

| tentativa | fora da zona | dentro da zona |
|---|---|---|
| 1 ("dobro") | 0,2 | trocou fonte e cor, endereço estourou a zona e foi cortado |
| 2 ("50%", fonte e cor nomeadas) | 0,1 | certa — mas fantasma da linha antiga |
| 3 | 0,0 | fantasma de novo |
| 4 (feather curto) | 0,2 | faixa chapada (tarja) no rodapé inteiro |
| 5 (zona até 99,5%) | 0,0 | limpa, texto maior — fonte virou SERIFA |

- 🔴 **O fantasma era MEU, não do modelo**: a borda suave da recomposição
  mistura a peça antiga, e a zona terminava (97%) em cima da linha antiga
  (94%). A zona tem de conter o conteúdo antigo COM FOLGA; encurtar o feather
  (tentativa 4) deixa a emenda visível. O feather fica o padrão.
- **Fora da zona é garantido; dentro é cara ou coroa.** Em 5 rodadas o
  modelo obedeceu fonte, cor, tamanho e "sem tarja" ao mesmo tempo UMA vez
  (a 2). Pedir "mesma fonte" não segura mais que pedir "não escureça". Vale
  como botão de ajuste fino com o olho de quem aprova; não vale como etapa
  automática.
- **Tamanho de texto é NÚMERO no compositor e SORTE no gpt-image.** Para
  "aumente o rodapé" o caminho determinístico é a peça ser página do editor
  (a via `compor`, onde `fontSize` é um campo). O gpt-image é pintor, não
  tipógrafo.

### 🔴 A arte agendada por página desenha a PÁGINA (10/09/2026)

Relatado pelo Ciro na Real Gelateria: abriu pela agenda os stories do Dia do
Milk-shake (compostos e agendados pelo chat), editou texto e espaçamento,
converteu uma linha para rich text e clicou em "Salvar e Voltar". A arte
re-renderizou e voltou para a agenda sem nenhuma das edições. O contorno foi
gerar o criativo, apagar o post e agendar o criativo.

- 🔴 **O render aplicava `SocialPost.slotValues` por cima da página, e na via
  de conteúdo esse campo é só uma CÓPIA do texto do dia do agendamento.** O
  remendo de 03/09 (`seguirCopyDaPagina`) fazia a cópia seguir a página no
  PATCH do editor, mas só enquanto ela ainda era IGUAL ao texto anterior.
  Linha do tempo real, lida dos sinais `copy`/`geometria` das páginas: às
  15:35 um `ajuste-arte` pelo chat reescreveu a página por outro caminho, as
  duas divergiram, e dali em diante nenhuma edição chegou mais à arte.
  Renderizado localmente com o pipeline de produção: só a página sai idêntica
  ao criativo de contorno; com a cópia por cima, o rich text pinta os
  caracteres errados, e no story de sexta o apoio velho, em duas linhas, cai
  em cima da linha de serviço (estava agendado para publicar assim).
- **A semântica é gravada na ESCRITA** (`src/lib/posts/copy-segue-a-pagina.ts`):
  quem copia o texto da página — `agendarPost` e `trocar-arte-do-post` por
  página — grava `slotValues` com `_copiaDaPagina: true`. `slotValuesParaRender`
  devolve nada para post marcado, e `renderStoryImage` desenha a página como
  está: sem aplicar slot e sem refluir, então o espaçamento acertado à mão
  sobrevive. O remendo do PATCH saiu.
- 🔴 **A MARCA NÃO BASTA — quem decide é o que a página É (20/09/2026).** Até
  aqui, "sem a marca vale a regra antiga" significava que um `true` esquecido
  em QUALQUER um dos seis escritores de `slotValues` reintroduzia o defeito
  inteiro, em silêncio. E aconteceu: a Real Gelateria editou o feed do Dia
  Nacional do Sorvete (template 466), salvou, a invalidação funcionou, o cron
  re-renderizou — e a arte saiu com a manchete anterior ("Amanhã, Seu Gelato /
  Vem em Dobro"), porque aquele post estava sem a marca. **Qual escritor a
  perdeu continua sem explicação**: a leva inteira da semana da Real (12 posts
  de 15/09) saiu sem marca, com o código de marcação em produção desde 10/09 e
  marcando em 15/09 de manhã e em 16/09. Varredura da carteira: 35 posts com
  página PRÓPRIA e sem marca, 7 deles já com a copy divergindo da página.
  Hoje `slotValuesParaRender(slotValues, paginaEhModelo)` decide pelo que a
  página é: **modelo (`isTemplate`) → os slots vencem** (layout compartilhado,
  N posts, cada um com a sua copy); **página de conteúdo → a página manda**,
  marca ou não. Confere com os dados: dos 90 posts com página e `slotValues`,
  os 9 da via de template são todos `isTemplate` (abril/2026, `plan-week`) e
  os 81 da via de conteúdo, nenhum. `applySlotValues` só troca o conteúdo de
  camada que já existe, então página sem camada de texto renderiza igual dos
  dois lados. A marca continua valendo e é o sinal mais forte (recusa os slots
  até em página modelo); o que ela deixou de ser é obrigatória.
- **A cópia acompanha o que foi DESENHADO**: `renderPostArt` regrava o
  `slotValues` com `RenderStoryResult.copyDaPagina` — e quem decide é o
  RENDER (`aplicouSlots`), não a marca, pelo mesmo motivo; sai já MARCADA, de
  modo que o re-render cura a marca que faltou, sem backfill. É o que o corpus
  e a conferência de texto da melhoria leem.
- 🔴 **Rich text é copy.** `textosDaPagina` e `copyDosPapeis` liam só
  `type: 'text'`: converter uma linha fazia o bloco sumir da copy — do corpus,
  da conferência e da recomposição, que refaria o slide sem ele e reescreveria
  `Page.layers` em texto simples. Camada que muda de tipo passa a contar como
  ajuste manual em `medirDefasagem` (re-render como está, nunca recompor).
- 🔴 **Post com várias mídias nunca volta para a fila de render**
  (`renderDaPaginaCobreAMidia`, na invalidação E em
  `alcancadoPelaInvalidacao`). `renderPostArt` grava `mediaUrls: [url]`; o
  carrossel de sexta da Real (4 fotos, `RENDERED`, com `pageId`) estava a uma
  edição da página de virar uma imagem só. A regra é de CONTAGEM, não de URL:
  o agendador do editor grava `renderedImageUrl` cru e `mediaUrls` normalizado.
- **"Salvar e Voltar" descarrega o autosave antes de sair**
  (`usePageSync().descarregar()`, também no botão de voltar). O
  `router.back()` desmontava o editor e cancelava o timer de 800ms do
  PageSync: a edição feita logo antes do clique nunca chegava ao banco.
- **Backfill `scripts/marcar-copia-da-pagina.ts`** (dry-run por padrão): marca
  o post vivo que comprovadamente carrega cópia da página (sinal
  `copy:post:<id>`, troca de arte por página, ou página do compositor — nunca
  página-modelo), sincroniza a cópia e devolve à fila a arte que já estava com
  texto divergente. Rodado em 10/09/2026: 56 marcados, 1 arte refeita (o story
  de sexta da Real), 2 pulados (rascunhos de abril do By Rock em
  página-modelo). Seguro antes do deploy; **rode de novo depois dele**, porque
  o código antigo agenda sem a marca.
- ⚠️ **Escritor NOVO de `slotValues` a partir da página precisa de
  `comoCopiaDaPagina`.** Sem a marca, a cópia volta a ser aplicada por cima e o
  defeito reaparece em silêncio na primeira escrita de camadas por outro
  caminho.

### O compositor sem halo: gradiente de leitura e destaque com [colchetes] (11/09/2026)

Decisão do Ciro: "prefiro que deixe de usar o halo, e aprenda a usar o gradiente
de forma sutil", e destaque de palavra-chave com rich text, marcado na copy com
`[]` ("sem marcação a peça sai sem destaque"). Vale para TODA peça do
compositor — `compor-arte`, `compor-leva`, a fila COMPOR, o `executar-plano`
via compor, o Gerar da bancada e a recomposição —, porque todos terminam em
`comporPeca`. Módulos puros com teste: `src/lib/compositor/gradiente-de-leitura.ts`
e `destaques.ts`.

- **Uma camada de gradiente por BORDA que tem texto**; topo e rodapé em camadas
  INDEPENDENTES (pedido explícito). A faixa vai da borda até ~1,9× o alcance do
  texto mais distante, presa entre 30% e 62% da altura e nunca terminando antes
  do texto; a força (opacidade na borda) é a necessidade medida sob o texto,
  dentro de [0,45; 0,9]. Sem foto, sem gradiente. Números em
  `Project.assinatura.gradiente` (JSON, sem migration).
- **Código, e não os templates de gradiente**: a usina compõe sem ninguém
  escolher camada, e o gradiente precisa nascer onde o texto pousou — o que só
  se sabe depois de medir a foto. Os templates são GABARITO: a curva padrão é a
  `CURVA_REAL` que a Roberta mediu (template 427), normalizada para a faixa. A
  COR, nesta ordem: camada de gradiente na página de assinatura (a equipe
  desenha; manda também na curva) → `Project.assinatura.gradiente.cor` → o
  gradiente da marca que contrasta com o texto (`GRADIENTES_POR_PROJETO`, hoje
  só a Real) → a mancha.
- 🔴 **O fundo de texto da página de assinatura NÃO é mais copiado, e o
  `halo-marca` saiu.** As 10 páginas ainda têm halo ligado em todos os papéis
  (medido em 11/09) — é lido só para diagnóstico. `Project.assinatura.halo`,
  `diagnostico.halos` (sempre vazio) e os valores antigos de
  `tratamentoDeTexto` ficam aceitos como legado; nenhum devolve o halo.
- **A régua corrige a FORÇA do gradiente da borda** (uma vez, dentro da faixa),
  não mais a opacidade do fundo. E mede rich text: apaga a cor dos TRECHOS
  também, senão o destaque contava como fundo.
- Logo numa borda sem texto, sobre canto claro (necessidade > 0,5), ganha um
  gradiente fraco (metade da necessidade) — é o que substituiu o halo-marca.
- **Destaque**: `[palavra]` numa linha da copy → o bloco sai como camada
  `rich-text`. Estilo: a camada rich-text do papel na página de assinatura
  (primeiro trecho que difere da base) → `Project.assinatura.destaque`
  (`{ fill, fontFamily, pesado }`); `pesado` escolhe a versão mais pesada da
  MESMA família do papel entre as fontes cadastradas (`familiaMaisPesada`: ~300
  acima, ao menos Medium — é o que a equipe fazia à mão). Sem estilo, sai texto
  comum com aviso; sem colchetes, sem destaque. Regra em `destaqueDoPapel`.
- 🔴 **Papel que JÁ É da cor de destaque não destaca nada** — o CTA vermelho do
  Espeto, a manchete dourada do Empório. Medido em 11/09: 8 dos 10 clientes têm
  papel da cor de destaque em alguma variante. Distância RGB < 90 usa
  `destaque.alternativa` (também da paleta); sem ela fica só o peso, e sem peso
  nada. Semeado por `scripts/semear-destaque-da-marca.ts`.
- 🔴 **O renderer de rich text IGNORA `effects.shadow` da camada** e só desenha
  sombra por trecho: com sombra na assinatura, os trechos cobrem o conteúdo
  INTEIRO. E o medidor do servidor não mede rich text: a altura sai do texto
  simples (mesmo corpo e entrelinha) e a largura soma o quanto os trechos
  alargam na família pesada — sem isso a linha que "cabia" transbordava.
- 🔴 **Os colchetes são marcação e saem em todo caminho que desenha texto
  simples**: `startArtGeneration` (IA), `decidirGeracao`, `mapearCopyParaSlots`
  (template), o nome da página e o `diff-copy` do aprendizado (senão toda copy
  aceita como veio contaria como editada). Na volta, `specComACopyDaPagina`
  reconstrói os colchetes a partir do rich text (`linhasComColchetes`) — sem
  isso o destaque sumiria na primeira edição de texto. `copyParaBlocos` não
  conta os colchetes no teto nem corta a linha dentro de um.
- **Quem escreve a copy marca**: instruções do conector, descrições de
  `compor-arte`, `compor-leva`, `criar-plano` e `editar-item-do-plano`, e o
  prompt da dica de copy (safra `dica-copy-v2`).
- ⚠️ Rich text não passa pelo autofix de colisão (`text-geometry` só enxerga
  `text`): o compositor empilha pela própria medida. Escritor NOVO de camada
  rich-text precisa medir a altura sozinho.
- ⚠️ **Em produção desde 11/09/2026** (merge 6f1ebed7), junto com a troca da
  assinatura do Quintal e do TERO pelos modelos da marca — o Ciro autorizou
  subir antes de revisar as 10 amostras de gradiente, que continuam nas pastas
  "AMOSTRA · Gradiente e destaque — não agendar". As primeiras peças compostas
  de cada cliente são a revisão que falta.

### Combinações de texto no compositor: papel, elementos e logo no grupo (11/09/2026)

Pedido do Ciro: o compositor aproveitar da assinatura também ícones, filetes e
outros elementos, usando (e editando) as combinações de texto da aba Texto. Até
aqui a usina lia só texto, logo e gradiente da página de assinatura; o resto
ficava para trás. Plano em `docs/PLANO-2026-09-11-COMBINACOES-NO-COMPOSITOR.md`,
núcleo em `src/lib/compositor/combinacoes.ts` (puro, com teste).

- **Um grupo de texto é um ARRANJO**: o grupo da página de assinatura (Cmd+G) ou
  uma combinação salva. Carrega o estilo de cada texto, o vão vertical antes de
  cada um e os ELEMENTOS presos a cada texto. O compositor continua escolhendo
  onde o bloco pousa pela foto; o arranjo diz como ele é por dentro.
- **Só serve à usina texto com PAPEL** (`pre`, `headline`, `headline2`, `apoio`,
  `cta`, `servico`): `metadata.compositor.papel` (o painel grava), o nome da
  camada ou o rótulo. Combinação com algum texto sem papel fica de fora — é o
  que mantém o catálogo base ("Sabor de Verdade") longe das peças até alguém
  revisá-lo.
- **O elemento se mede pela TINTA do texto, nunca pela caixa**: na página a
  caixa costuma ser larga, e na peça ela é justa. `lado` (`antes`, `depois`,
  `acima`, `abaixo`) + `eixo` (`inicio`, `centro`, `fim`) dizem a que borda ele
  se prende (`caixaDoOrnamento`); preso à base, o filete acompanha o texto que
  cresce. Forma do editor guarda o MOLDE da camada + `tamanhoDaCamada` + `ajuste`
  (o Konva gira em torno da origem, então a caixa visível ≠ posição), e a logo no
  grupo vira elemento com `logo: true` — a peça não ganha outra no canto.
- **Associação pela geometria** (`associarIcones` / `associarOrnamentos`):
  imagem à esquerda, na faixa do texto, é o ícone; o resto na mesma faixa (centro
  dentro da caixa ou metade da altura do menor sobreposta — o divisor vertical é
  mais alto que a linha) é `antes`/`depois`; fora dela, o texto mais perto na
  vertical, e entre dois a distâncias parecidas fica o de BAIXO (o filete some
  junto com o apoio que falta).
- **Elemento ao lado de uma linha que a peça não tem sai** (o alfinete da
  segunda linha do serviço quando só há horário). Papel com vários textos (Local
  + Horário) recebe uma linha por texto, casando horário com relógio e endereço
  com alfinete (`blocosDeServico` + pistas do ícone) antes da ordem; na volta,
  `copyDosPapeis` junta os textos do mesmo papel de cima para baixo.
- **Escolha** (`escolherArranjo`): o grupo da página e as combinações que cobrem
  os papéis do grupo; −1 por papel sem copy, +3 por palavra do tema no nome,
  empate em rodízio pela chave da peça. Os arranjos usados ficam em
  `spec.preferencias.arranjos`: a recomposição refaz A MESMA peça.
- **Elementos entram DEPOIS do autofix**, presos à caixa final (o autofix pode
  encolher a fonte), e o gradiente de leitura cobre o grupo com eles.
- **O gradiente de cada borda segue a camada que a página desenhou naquela
  borda** (`bordaDaCamadaDeGradiente`: segmento explícito ou ângulo; 169° topo,
  11° rodapé). Ler só a primeira camada prendia o rodapé à força do topo.
- 🔴 **As margens derivadas da página saem da METADE em que cada texto mora.**
  Página com todo o texto no rodapé dava `safeTopo` de 1281 px.
- **Provar antes de a usina usar**: `comporPeca(spec, { provar: true,
  paginasDeAssinatura: [ids] })` compõe com páginas em espera sem gravar nada —
  `scripts/provar-combinacoes-no-compositor.ts`. Nunca em produção.
- 🔴 **O editor ANTERIOR a este deploy descarta os campos novos** ao salvar uma
  combinação (o zod antigo stripa `papel`, `ornamentos`, `destaque`). Combinação
  gravada com eles não pode ser editada no app antigo — grave os dados da usina
  junto com o deploy.
- 🔴 **O vão entre os textos de um grupo vem da página, e página que DESENHA POR
  CIMA não tem vão.** As variantes Promoção, Rodapé e Topo do Espeto guardam a
  manchete inteira ("COSTELA⏎NO BAFO") na caixa da voz 1 e põem a voz 2 sobre a
  última linha. Lido ao pé da letra, isso é um vão de −75px, e na peça, em que
  cada voz tem só as suas linhas, as duas se sobrepunham: TEXTO_NAO_CABE nas três
  variantes. `vaoDaPagina` aceita sobreposição de até meia linha (lockup
  apertado); além disso devolve `null` e a peça usa o ritmo da casa (a voz 2
  encosta na 1), como o compositor sempre fez. Pego pela prova das assinaturas
  de TODOS os clientes antes do merge — com os modelos do Quintal e do TERO
  sozinhos, não aparecia.

### A assinatura do Quintal e do TERO são os modelos da marca (11/09/2026)

Os modelos recriados no editor a partir das artes de referência (Quintal 3,
TERO 7) viraram as variantes de STORY da usina, por decisão do Ciro, no mesmo
deploy do compositor de arranjos (PRs #119 e #121). Troca feita por
`scripts/trocar-assinatura-pelos-modelos.ts` (dry-run por padrão).

- **As páginas foram MOVIDAS para o template "Assinatura", não copiadas.** A aba
  Modelos lista as páginas-modelo de TODOS os templates do projeto
  (`/api/templates/[id]/template-pages`), então a cópia apareceria duas vezes, e
  as duas versões divergiriam na primeira edição. Com uma página só, editar o
  modelo no editor é editar a assinatura. Os templates "Modelos da marca" (457 e
  458) ficaram vazios.
- **As stories antigas foram arquivadas, nunca apagadas**: template
  "Assinatura — arquivada em 11/09/2026", categoria
  `__system_assinatura_arquivada__` (seção Arquivo da aba Templates; a listagem
  só esconde a categoria do export do Konva), páginas com `isTemplate: false` e a
  tag `assinatura` trocada por `assinatura-arquivada`. Voltar atrás é mover as
  páginas de volta.
- **As páginas de feed ficaram**: os modelos são só story. A de feed do Quintal
  se chama "Assinatura — story" e mesmo assim é lida como feed, porque
  `formatoDaPagina` testa o TAMANHO de feed (1080x1350) antes do nome "story".
- 🔴 **A troca só vale com o compositor de arranjos no ar.** O código anterior
  lia papel só de `type === 'text'`: o serviço e o apoio em rich-text dos modelos
  sumiam da escolha de variante, e ícones, filetes e a logo do grupo eram
  ignorados. Página de assinatura com elemento ou rich-text não pode voltar para
  um deploy anterior ao #121.
- ⚠️ **O script que recriou os modelos (`recriar-modelos-da-marca.ts`, fora do
  repo) procura as páginas no template "Modelos da marca" pelo nome.** Rodado de
  novo, ele RECRIA os modelos lá em vez de atualizar os que estão na assinatura.
- **Provas**: `provar-combinacoes-no-compositor.ts --assinatura` prova as páginas
  que a usina lê hoje, cada uma com a copy dela (página de feed prova peça de
  feed); `--paginas` prova páginas em espera. Antes do merge rodaram também as
  últimas peças reais de cada cliente, recompostas com a spec gravada: 47 de 50.
  As 3 recusas eram do Wine Vix e já aconteciam em produção — copy com `apoio`
  de 04/09 e a página de story editada sem apoio horas depois. Recusa por papel
  que a variante perdeu não é regressão do compositor: é a página que mudou.
- ⚠️ A prova tira a copy da própria página. Em página que desenha a voz 2 por
  cima da manchete, a manchete da prova sai com a última linha repetida — é
  artefato da prova, não da usina (a copy real chega com as linhas uma vez só).

### A peça segue o modelo ajustado: lado, margens, peso e encaixe (11/09/2026)

O Ciro ajustou os modelos do Quintal e do TERO no editor, e a comparação
`provar-combinacoes-no-compositor.ts --assinatura --comparar` (o modelo
renderizado como está, ao lado da peça com a mesma copy e a mesma foto, e a
tabela papel a papel de posição, corpo e cor) mostrou seis divergências. Cinco
eram da usina:

- 🔴 **A preferência de posição NUNCA valia o lado do modelo.** Em
  `candidatosDePosicao` só o ALINHAMENTO vinha da página; a âncora seguia
  sorteada pelo rodízio, e como a preferência de 0,6 pede as duas, o lado do
  modelo pontuava 0,30 como os outros. Medido: o Almoço executivo do Quintal
  (esquerda no modelo) perdia para a direita por 0,469 × 0,438; o do TERO, por
  0,666 × 0,660; o feed do Quintal (centro), por 0,823 × 0,794. Hoje a âncora
  da página entra no rodízio; o sorteio só completa o que a página não diz. Os
  pesos do mapa não mudaram — a foto ainda vira o lado quando o outro é
  claramente melhor ou cobre o assunto.
- 🔴 **A margem de baixo NÃO conta a logo solta no canto.** Ela conta os textos
  e os elementos que moram no grupo deles (ícone, filete, a logo ao lado do
  serviço). No "Convite do dia" do Quintal a logo terminava 32 px abaixo do
  CTA: o grupo descia até encostar nela, e ela fugia para o canto de cima.
- 🔴 **A margem lateral é a do lado em que o texto alinha, e cada grupo leva a
  sua.** A caixa larga de um texto alinhado à esquerda chega perto da borda
  direita sem que a tinta chegue — o endereço do Happy wine dava 40 px e o bloco
  todo encostava na esquerda, 47 px além do modelo. E uma margem só para todos
  os grupos punha o serviço com ícone do Happy hour 18 px para dentro. Hoje a
  margem de cada grupo de página é a caixa dos textos dele na borda em que
  alinham, menos o quanto os elementos passam da tinta (`margemDoGrupo`);
  virado pelo mapa, leva a mesma distância à borda oposta.
- 🔴 **O peso da fonte chega como TEXTO do editor** (`"100"`, `"bold"`), e
  `estiloDaCamada` só lia número: o "HOUR" em Montserrat 100 do Happy hour saía
  no peso normal.
- 🔴 **A regra de vão do Espeto (sobrepor mais de meia linha = sem vão) desfazia
  encaixe legítimo**: o "quintal" em script entra 44 px em "é dia de" no
  Convite do dia, e descolava 55 px. Hoje só é "desenhado por cima" o texto que
  REPETE uma linha do anterior ou COMEÇA numa delas; o resto mantém o vão da
  página, com teto de meia altura.
- 🔴 **Encaixe de desenho não é colisão.** O compositor marca a camada com
  quanto a página sobrepõe (`metadata.compositor.encaixe`), e `checkTextGeometry`
  soma isso à tolerância vertical entre textos do MESMO grupo. Sem a marca, o
  autofix encolhia a manchete até desfazer o encaixe ("Almoço" 88 → 77 px;
  "Sexta é dia de" 97 → 93). Entre grupos diferentes a marca não vale nada.
- ⚠️ A sexta divergência era da PROVA: a camada "headline Copy" do feed antigo
  do Quintal é a segunda voz para a assinatura (`papelDoNome`), mas
  `copyDosPapeis` da defasagem só aceita o nome exato do papel, e a copy da
  prova saía sem "Quintal".
- **A logo da página é conferida contra a caixa de cada TEXTO**, não contra o
  retângulo do grupo: a linha longa do serviço esticava o retângulo do rodapé
  do Convite do dia até a logo, e ela ia para o canto de cima.

Depois do deploy, a recomposição das peças reais (`scripts/recompor-pecas-reais.ts`,
rodada antes e depois, folha contra folha) pegou mais três coisas:

- 🔴 **O canto gravado na spec (`cantoDaMarca`) cai quando encosta no texto.** O
  chat grava canto em boa parte das peças (30 dias: Bacana 38 de 39, Quintal 21
  de 32, Real 7 de 31), e `escolherCanto` obedecia o pedido mesmo colidindo:
  sem canto livre na lista do pedido, devolvia o próprio pedido. Com o lado da
  página valendo, a variante da Real alinhada à direita pôs pré-título e
  manchete debaixo da logo "Real" do canto de cima. Hoje o pedido que encosta
  cai com aviso, e vale a posição da página e depois o canto livre.
- 🔴 **Recompor fixa a posição original** (`specComAPosicaoOriginal`): âncora e
  alinhamento de `fieldValues.composicao.posicao` entram na spec da
  recomposição, a não ser que ela já peça posição. Sem isso, a primeira edição
  de texto de uma peça composta antes de 11/09 mudaria o lado do bloco.
- 🔴 **Caixa alta de modelo é PROPRIEDADE da camada, não texto digitado em
  maiúsculas.** Os 7 modelos recriados do TERO traziam o exemplo escrito em
  caixa alta sem `textTransform`; a usina copia o estilo, não a caixa do
  exemplo, e depois da troca as manchetes saíram em caixa mista — a assinatura
  antiga tinha `uppercase` em pré-título, manchete, apoio e CTA. Corrigido nos
  dados (uppercase só nas camadas já escritas em caixa alta). Quem recriar
  modelo marca `textTransform: 'uppercase'` onde a referência usa caixa alta de
  propósito.
- ⚠️ **A prova dos modelos não pega esse tipo de regressão**: ela compõe com a
  copy da própria página, que já vem em maiúsculas. Troca de assinatura pede
  também a recomposição das peças reais com a spec gravada, antes e depois.

### A Real ajustada: recuo no grupo, vão entre grupos e a régua por texto (11/09/2026)

O Ciro ajustou os seis modelos da Real Gelateria (template 461, em espera), e a
mesma comparação (`--comparar`) mostrou divergências que eram todas da usina,
nenhuma dos modelos:

- 🔴 **Texto recuado dentro do grupo saía rente.** Na segunda, "Funcionamento"
  começa em x=70 e as unidades em x=160, ao lado dos ícones; `posicionar` punha
  todo texto do grupo no mesmo x, e como o ícone passa 86 px da tinta, a margem
  do grupo caía no piso de 24: as três linhas saíam em x=116 e os ícones a 30 px
  da borda. Hoje `arranjoDasCamadas` grava o `recuo` de cada texto (da tinta até
  a borda em que o grupo alinha; só texto alinhado como o grupo; até 2 px é arraste
  e não conta — 3 px já pode ser alinhamento ótico, como o apoio 7 px para
  dentro da manchete serifada no Feriado do TERO), e `empilhar(blocos, gap, lado)` monta a pilha
  recuada, em que o ícone que mora no recuo não empurra a coluna. O recuo vale
  no lado em que o grupo alinha na página; virado pelo mapa, o grupo sai rente.
  🔴 **Recuo que abriga elemento SOLTO não vale**: a peça só desenha elemento
  de grupo, e na assinatura antiga da Real o relógio está fora do grupo — o
  serviço entrava 47 px sozinho, com o vão vazio. O ícone no grupo (a segunda
  dos modelos) mantém o recuo; solto, ele é zerado.
- 🔴 **O vão entre dois grupos era o ritmo fixo de 1,6 gap, não o da página.** Na
  terça o apoio ficava a 24 px de "Funcionamento" (61 no modelo, Δy=+37); a
  segunda subia 14 px e a quarta 5. Hoje o arranjo guarda a `faixaDaTinta` (do
  topo da primeira tinta à base da última) e o vão entre dois grupos da MESMA
  borda é o da página, descontado o que os elementos passam das pilhas. Bordas
  diferentes, página de outro formato, sobreposição ou vão maior que um quarto
  da altura ficam no ritmo da casa. Era o resíduo de "Δy entre grupos" que as
  comparações do Quintal e do TERO já mostravam.
- 🔴 **A margem do grupo nunca chegava ao principal.** `margemPara` foi declarada
  em `candidatosDePosicao` (f9c24278) e não era usada: o principal caía na
  margem da assinatura, a do texto mais rente da página inteira. Na Real batia
  por coincidência, porque o principal é o grupo mais rente em todos os modelos.
- 🔴 **A régua mede cada TEXTO, não a união do grupo.** Com o recuo certo, a
  segunda passou a acusar "foto clara demais" no próprio modelo: o marrom de
  "Funcionamento" (alvo 69) era julgado pelo pires claro que só passa sob as
  linhas creme. E o dourado da segunda voz do Dia dos Pais (luz 132) sobre o
  creme era medido como texto CLARO, com alvo 0, porque o corte de texto escuro
  era fixo em 128. Hoje cada camada tem o próprio retângulo, o próprio sentido
  (escuro quando a mancha é clara e o texto é 48 mais escuro que ela) e o
  próprio alvo; o grupo vale o pior, e a força do gradiente se corrige pelo
  texto claro mais longe do alvo.

Medido. Real (`--comparar`, 6 modelos): antes 3 de 6 peças fora do modelo
(Δy de −14, +37 e −5; serviço da segunda em x=116); depois as 6 com Δx = Δy = 0
em todos os papéis. TERO (8 páginas): Δy = 0 em todos os papéis menos o apoio do
Happy hour (−3), com o recuo ótico seguindo o modelo. Quintal (3 stories): Δy = 0.
Peças reais recompostas (últimas 5 de 10 clientes, geometria por camada antes ×
depois): 36 iguais e 11 mudaram, todas para a posição da página (Wine Vix
pré-título 55 → 70; TERO apoio +7 e serviço +13 pelo vão da página; By Rock −6 e
Lagosta +20 pela margem do grupo); as 3 recusas antigas do Wine Vix nos dois
lados; nenhum aviso novo e 12 a menos (invasão de margem e "foto clara demais"
falsos). ⚠️ Sobra um aviso real: o dourado da segunda voz do Dia dos Pais sobre o
creme fica abaixo de 3:1 onde a foto escurece — é o desenho do modelo.

### O revisor da arte: medida e visão antes de agendar (11/09/2026)

Pedido do Ciro: revisar a arte feita no EDITOR antes de concluir a programação
("o título está muito grande", "o horário de funcionamento não deu leitura") e
devolver os comandos para ajustar no editor. Diante do desenho só por código,
ele insistiu na visão: "tem detalhes que por código não está dando para ver — se
desse, o compositor não errava". Módulos em `src/lib/creatives/revisao/`
(contrato, versão, executor e regras PUROS, com teste; a visão com reconciliação
pura; o serviço `revisar-arte.ts`), a tool `revisar-arte` (só leitura) e
`ajustar-arte` com `ajustes` + `versaoEsperada`. O desenho passou pela revisão do
Codex antes de ser escrito.

- **Duas camadas, uma saída.** O código mede — a régua com correção em memória,
  a geometria dos glifos, corpo e entrelinha contra a variante da assinatura com
  que a peça foi composta (ou contra o modelo de onde a arte saiu), o assunto da
  foto, as fontes — e a visão (gpt-5.2) olha a peça renderizada com cada bloco
  marcado (T1, T2… e L1 para a logo) e recortes em resolução real. Os dois viram
  ACHADOS no mesmo formato, e o número de todo ajuste é do CÓDIGO: a visão
  escolhe a correção num vocabulário fechado (subir, reduzir-entrelinha,
  mais-gradiente…), nunca o valor.
- **A visão ARBITRA o que a medida aproxima.** Leitura que a régua acusou e a
  visão não viu vira sugestão; assunto só estimado pela textura e não confirmado
  sai; o que a visão confirma vira evidência do achado medido, sem comando
  duplicado. Visão fora do ar deixa a revisão só com as medidas (cobertura "não
  avaliada") — nunca derruba a revisão.
- **Na visão valem as lições do crivo e do decodificador**: schema de texto livre
  com todo campo opcional e o rigor na reconciliação; a resposta aponta pela
  MARCA desenhada, nunca por índice; evidência observável obrigatória; confiança
  baixa descartada; no máximo 6 achados.
- 🔴 **A cedilha cortada é do EDITOR, não da arte.** Medido em 11/09 em manchetes
  com entrelinha 0,9–0,94 (Lobster em "direção.", Amithen em "Bora votar"): a
  tinta passa 5 a 8px da caixa gravada, o render do servidor desenha a letra
  inteira, e o cache do Konva (`textNode.cache()`, que liga acima de 24px)
  recorta na altura da caixa. O revisor acusa (`tinta-fora-da-caixa`, sem
  ajuste); o conserto é no cache do editor, nunca na altura da caixa — ela é o
  contrato com o render (ver "O modo Auto re-mede…").
- 🔴 **Peso de fonte não é fonte faltando.** A carteira cadastra cada peso como
  família própria ("Lato Bold", "Didot HTF B06 Bold") e o render usa o estilo do
  arquivo que existe: conferir o peso pedido contra o do arquivo deu **45 falsos
  alarmes em 30 peças reais**. Só a família ausente do registro conta.
- **A régua acusa demais em cor saturada e com sombra presa ao glifo** (18 de 30
  peças na primeira calibração): o alvo de luminância do vermelho do Espeto pede
  fundo quase preto, e a régua apaga a sombra antes de medir. Esses casos descem
  um nível de severidade e dizem por quê; a visão decide o resto.
- **Assunto estimado pela textura precisa cobrir 40% do bloco** (com 25% ele
  acusava 8 de 30 peças sem nada visível); o do catálogo continua nos 25% do
  mapa de calma.
- **Um ajuste por camada por rodada.** Dois achados que mexem nas mesmas camadas
  não empilham deltas calculados sobre a geometria antiga — o segundo espera a
  revisão seguinte. Corpo e entrelinha nas MESMAS camadas se fundem num comando;
  gradiente na mesma borda fica com a força maior; reduzir o gradiente só quando
  TODOS os blocos daquela borda sobram (um folgado não tira a leitura do vizinho).
- **O executor preserva a diagramação.** Corpo novo re-mede a altura e refaz a
  pilha pelo delta — rich text incluído, que o `combo-stack-reflow` não enxerga —;
  o elemento ao lado do texto (relógio, alfinete) acompanha o centro dele; grupo
  da metade de baixo mantém a BASE; a entrelinha vai nos dois campos; o encaixe
  da voz 2 escala com o corpo; o gradiente muda por `comForca`, e borda sem
  gradiente ganha um logo acima da foto.
- **A versão é do conteúdo** (`versaoDaPagina`: hash de dimensões, fundo e
  camadas com as chaves ordenadas), nunca `updatedAt` nem a URL. Com
  `versaoEsperada`, `ajustar-arte` recusa página que mudou (`VERSAO_DIVERGENTE`,
  409) e grava com compare-and-set em `updatedAt`. **`versaoEsperada` é
  OBRIGATÓRIA quando vierem `ajustes`** (`VERSAO_OBRIGATORIA`, 400; decidido em
  12/09/2026 na revisão do Codex): ajuste calculado sobre uma versão só se
  aplica a ela. Chamada sem `ajustes` (texto, foto, nome) continua sem exigir
  versão. Ajuste recusado volta com o motivo; nenhum aplicável e nada mais a
  mudar é `AJUSTE_SEM_EFEITO`.
- **As regras da casa continuam valendo no ajuste**: a escrita é a de
  `ajustarArte` (recusa página-modelo, `invalidateScheduledRenders` +
  `pedirRecomposicaoDaArteCongelada`, Generation nova com `fieldValues.revisao`).
  Ajuste de diagramação não muda copy e por isso não gera sinal de copy — a
  correção do revisor não pode virar "preferência da equipe" no aprendizado.
- 🔴 **A arte do compositor fica no template ANTIGO depois que a página muda de
  pasta** (`moverPaginaParaSemana`, ao agendar): buscar a Generation da página
  filtrando por `templateId` perdia a referência de corpo e o assunto. A busca é
  por projeto + `fieldValues.pageId`.
- 🔴 **`levantarPagina` (recomposição) só lê Generations do PROJETO da página**
  (REV-2CEB-02, 12/09/2026): `fieldValues.pageId` é gravado sem conferir o dono
  (o `konva-export` aceita `body.pageId`), e uma Generation de OUTRO projeto
  apontando para a página era a "arte mais recente" — o job de recomposição
  nascia preso a ela. A prova do PR 6 cria exatamente essa linha, e rodando ao
  mesmo tempo derrubou a prova deste PR em 2 de 3 rodadas: o "flake" de 6a/6h
  era isolamento por projeto, não tempo. A prova agora cria a alheia de
  propósito e confere que o job nasce na Generation certa.
- 🔴 **O ajuste do revisor INVALIDA a miniatura da página junto das camadas**
  (REV-127-F01, P1 da revisão FINAL, 12/09/2026): `Page.thumbnail` é o PNG do
  render ANTERIOR, e `agendarPost` o reutiliza como mídia (post `RENDERED`)
  quando a página ainda não tem post. Peça composta sem post + ajuste cujo
  render falha = a invalidação não acha post nenhum, a recuperação sai sem
  slide (`enfileirarRecomposicaoDaPagina` devolve null), e o agendamento
  seguinte pela página nascia com a versão velha, fora do cron de renders
  pendentes. Com o thumbnail nulo na MESMA escrita das camadas, o post nasce
  `PENDING` (`nextRenderAt` agora) e o cron desenha a página ajustada; o
  render que dá certo regrava a miniatura. Prova 9h.
- 🔴 **A recuperação forçada regrava a copy VISUAL da Generation que reutiliza**
  (REV-127-F02, P2): o re-render passa por `renderPageAndRegister` com o
  `generationId` da arte mais recente da página — que pode ser a de um AJUSTE
  anterior, cujos `slotValues` afirmavam o texto que o ajuste seguinte
  escondeu (render falhou → recuperação). A URL trocava e `lerProcedencia`
  seguia devolvendo o texto ausente como `copyVisual`; agendar por
  `generationId` ou pela URL registrava texto que a imagem não mostra.
  `copyVisualDasCamadas` (puro, `procedencia-da-copy.ts`) é a MESMA conta do
  `slotValuesFinais` do ajuste, e entra no patch do re-render só quando a arte
  JÁ carrega copy visual (a arte do compositor não ganha uma inventada); a
  copy de APRENDIZADO e a trava ficam como estão (merge no banco). Prova 9i.
  🔴 **E a regravação deixa MARCA** (integração com o R38/R42 do PR 6,
  12/09/2026): `recomposicao.copyVisualRegravada: true`, DENTRO do registro do
  re-render e só quando os `slotValues` do mesmo patch foram regravados. Sem
  a marca, `re-renderizada` + `slotValues` não diz se a copy é deste PNG ou de
  outra versão da mídia (página ilegível mantém a copy, arte re-renderizada
  antes deste código também) — e o PR 6 invalida essa copy. Como o merge é
  raso, a próxima escrita de `recomposicao` apaga a marca junto com o registro
  antigo. Nasceu num commit de integração no branch do PR 6
  (`feat/f2-contexto-da-semana`) e **desceu para o PR 0 por cherry-pick em
  12/09/2026** — o PR 0 é o dono.
- 🔴 **`copyVisualDasCamadas` recebe `Page.layers` COMO ESTÁ NO BANCO e
  decodifica por `lerCamadas`** (REV-93D-01, 12/09/2026): a rota de edição
  de camada grava a lista como STRING JSON (há página duplamente codificada)
  e o render desenha essas páginas normalmente — lendo o valor bruto, toda
  string virava `{}` e a recuperação apagava a copy visual de uma arte cujo
  PNG tem texto. `null` = ilegível (o re-render mantém a copy que tinha e
  avisa); `{}` = legível sem texto visível. Prova 9j, em JSON simples e duplo.
- 🔴 **Antes de SUBSTITUIR a copy visual, a copy anterior vira proposta de
  aprendizado quando a arte não tem uma** (`preservarPropostaDeAprendizado`,
  REV-93D-02): `lerProcedencia` usa `slotValues` como `copyProposta` sem
  `copyDeAprendizado` (a arte rápida grava só `slotValues`), e a recuperação
  forçada que regrava a copy visual sem o texto que o revisor escondeu fazia
  a proposta perder esse texto — ao agendar com página e Generation,
  `copyParaDecisao` (que conta a camada escondida pelo revisor) voltava a
  acusar uma ADIÇÃO humana. É UMA instrução condicional no Postgres (só com
  `slotValues` objeto e `copyDeAprendizado` não-objeto): um ajuste
  concorrente, que grava a proposta certa, nunca é sobrescrito. Prova 9j.
- **No chat** (instruções do conector): compor → `revisar-arte` → `ajustar-arte`
  com os ajustes → revisar de novo, no máximo DUAS rodadas; o que sobrar vira
  observação para a pessoa, e a revisão nunca trava a agenda. `ARTE_REVISAO_VISAO=off`
  desliga a visão; `OPENAI_REVISOR_MODEL` troca o modelo.
- `scripts/revisar-pecas-reais.ts` roda o revisor nas últimas peças do
  compositor de cada cliente, sem gravar (`--sem-visao` só mede), e imprime o
  placar por regra: regra que acusa em quase toda peça boa é limite para
  recalibrar, não defeito da carteira. Recalibrado em 12/09/2026 com a régua
  texto a texto da main (20 peças, 2 por cliente, 30 dias): 22 ajustes e UM
  ponto como problema — o serviço em texto escuro sobre a camisa escura da Real
  ("milk-shake em dobro"), que é defeito real e sem ajuste mecânico.
  `scripts/revisar-antes-depois.ts` renderiza a peça antes e depois dos
  ajustes EM MEMÓRIA (nada gravado) — é a evidência da calibração de gosto.
  `scripts/validar-revisor-da-arte.ts` é a prova de integração no branch de
  dev (versão, projeto errado, modelo, autosave no meio, imagem única, slide
  de carrossel, render falhando); ela sobe PNG ao Blob de produção e apaga no
  cleanup. 🔴 **Fixture criada em OUTRO projeto entra na lista do cleanup no
  INSTANTE da criação** (`generationsAlheias`, apagada pelo id exato no
  `finally` externo, e a exclusão que não acontece CONTA como falha): o cleanup
  filtra por projeto e marca e não a alcançaria, e um `try/finally` local com
  `.catch(() => undefined)` deixava a órfã no outro projeto quando o passo
  quebrava antes dele, com a prova verde (REV-052-01). 🔴 **A prova lê cada imagem do Blob UMA
  vez por URL, com nova tentativa espaçada em 403/429/5xx** (só no processo
  dela, trocando `CanvasRenderer.nodeImageLoader`): as provas 29 a 33 pararam
  no mesmo ponto com o desafio anti-bot do Blob sobre a logo que ela renderiza
  dezenas de vezes, e esperar três `curl` com 200 antes de lançar não segurava.
  E o processo sai explicitamente no fim — as provas 32 e 33 ficaram penduradas
  uma hora com conexões de banco abertas depois do resumo.
- **Gradiente se aponta pelo id.** Sem `camadas`, o ajuste só mexe no gradiente
  de LEITURA da borda (o que o compositor desenhou) ou cria um; o gradiente que a
  equipe desenhou à mão só muda quando o ajuste traz o id dele, e as regras nunca
  propõem enfraquecê-lo. Antes, "criar gradiente" numa borda com o gradiente da
  equipe alterava o dela, que a régua nem reconhece como gradiente de leitura.
- 🔴 **O delta da pilha sai do MESMO medidor dos dois lados** (antes e depois do
  ajuste). A altura gravada pode ter vindo do editor; comparar a medida nova do
  servidor com ela deslocava o bloco pela diferença entre os medidores, não pela
  mudança pedida. E o reflow de preenchimento só roda quando algum TEXTO foi
  trocado: com ajustes e nenhum texto novo, normalizar a pilha antes deslocaria a
  base do grupo que o executor preserva.
- **Gosto nunca passa de sugestão.** Posição estranha, respiro desequilibrado e
  desalinhado vistos pela visão ficam em sugestão mesmo com confiança alta — na
  recalibração de 11/09 o respiro saía aviso em 7 de 20 peças boas.
- **Revisão sem achado não é aprovação quando a cobertura tem buraco**: o resumo
  diz o que não foi avaliado (visão que não rodou ou concluiu só em parte, regra
  medida em parte), e visão com item que não pôde ser lido
  (`visaoConclusiva: false`) não rebaixa nem tira nada.
- **A agenda é avisada mesmo quando o render falha**: `Page.layers` já está
  gravado quando `renderPageAndRegister` roda, então a invalidação e a
  recomposição rodam no `catch` antes de o erro subir.
- ⚠️ **Depois de um ajuste, a página deixa de ser recomposta.** A arte mais nova
  dela passa a ser a do ajuste (Generation de `renderPageAndRegister`, sem
  `layersSnapshot` nem spec), e `lerArteDaPagina` usa a mais recente: uma edição
  de copy posterior cai no re-render como está. Os ajustes sobrevivem, mas o
  texto novo não é medido de novo — revise a peça outra vez depois de editar a
  copy.
- ⚠️ Rich text é medido como texto simples (a largura dos trechos destacados é
  aproximada, cobertura "parcial").
- 🔴 **A copy de APRENDIZADO da Generation não é a copy VISUAL** (REV-2CEB-01 da
  revisão de 2ceb25fc): `lerProcedencia` devolve as duas — `copyProposta`
  (`copyDeAprendizado` vence `slotValues`; é o lado "antes" do diff do
  agendamento, com a camada escondida pelo revisor contada como presente) e
  `copyVisual` (os `slotValues` como a ARTE os mostra). Sem página (só
  `generationId`, ou `mediaUrls` casada pela URL) a cópia que o post carrega é a
  VISUAL: com a de aprendizado, o post afirmava um CTA que o PNG não tem, e
  `textoDoPost` o levava ao histórico. A prova 9g agenda só pela Generation e
  pela URL e confere que o texto escondido não está no post.
- **A prova-dev-24 (2ceb25fc) fechou com 6 falhas em 6h/6m–6r que NÃO se
  reproduziram**: a prova-dev-25, no mesmo commit, fechou 128 ok / 0 falhas com
  um vigia lendo do banco as Generations da 2ª página a cada 15 s — spec e
  snapshot presentes em 6h. Em 24 a arte lida em 6h estava sem spec e sem
  snapshot (o log do recompor diz "Esta arte não guardou a spec"), com as
  páginas já apagadas pelo cleanup quando a investigação começou. Fica como
  ocorrência não explicada; a chain passou a NÃO disparar a revisão quando a
  prova tem falha.

- 🔴 **Esconder por ajuste do revisor NÃO é a pessoa apagando o texto** (REV-9E-01
  da revisão FINAL do Codex, 12/09/2026). O ajuste `visibilidade` grava na
  camada `metadata.revisao.ocultaPeloRevisor` (com a página, no mesmo write —
  sobrevive ao render que falha); mostrar de novo tira a marca. O APRENDIZADO
  lê a página por `copyParaDecisao` (a escondida pelo revisor conta como
  presente) nos quatro pontos — `agendarPost`, `ajustarArte` (antes e depois),
  o PATCH do editor —, enquanto o render e a cópia que o post carrega
  (`slotValues`) seguem `copyDeCamadas`: a marca nunca muda o que a arte
  mostra. Camada escondida SEM a marca é decisão humana e conta como remoção;
  e no PATCH do editor `reconciliarMarcasDoRevisor` tira a marca da camada que
  estava visível e chega escondida (a pessoa a escondeu). Módulo puro
  `revisao/oculta-pelo-revisor.ts`; prova no passo 9 (com render OK, com
  render falhando, e o controle humano virando `editada`).
- 🔴 **A proposta do diff sem plano é `fieldValues.copyDeAprendizado`, não os
  `slotValues`** (REV-8AD-01). Os `slotValues` da Generation do ajuste são a
  copy VISÍVEL; contra a página lida por `copyParaDecisao` eles acusavam o
  texto escondido pelo revisor como ADICIONADO pela pessoa
  (`versusProposta: 'editada'`). O ajuste grava as duas: `slotValues` para o
  que a arte mostra, `copyDeAprendizado` (com as ocultações mecânicas) para o
  aprendizado; `lerProcedencia` (`procedencia-da-copy.ts`, puro) lê a de
  aprendizado primeiro. Prova 9e, sem leva nem dica.
- 🔴 **A marca sai em todo gesto HUMANO sobre a camada** (REV-8AD-02): ao
  MOSTRAR pelo editor (`reconciliarMarcasDoRevisor` tira a marca de qualquer
  camada que chega visível) e ao esconder pelo chat (`hidden: true` no
  `bakeLayers` passa por `semMarcaDoRevisor`). Marca antiga que sobrevivesse
  encobriria a remoção humana. Prova 9f pelos dois caminhos.
- **Falha dentro do passo 9 LANÇA, nunca `abortar`** (REV-8AD-03):
  `process.exit` não passa pelo `finally`, e o cleanup do Blob e do banco
  ficaria para trás.
- **A prova captura a URL da arte IMEDIATAMENTE depois de cada render** e o
  cleanup varre também `recomposicao.urlsAnteriores`: dois renders seguidos
  sobre a mesma Generation sobrescrevem `resultUrl`, e o 1º PNG do passo 6d
  ficava no Blob de produção (REV-9E-02). E falha do `del` CONTA como falha
  da prova, com "encontrados" e "apagados" separados (REV-9E-03) — resíduo no
  Blob não passa no gate.
- **A recuperação da arte CONGELADA depois de um ajuste** (rodadas da revisão
  do Codex em 12/09/2026, REV-01 a REV-11 e a revisão FINAL, prova em
  `scripts/validar-revisor-da-arte.ts`, passos 6a–6m): quando o render do ajuste
  falha, `ajustarArte` pede a recomposição FORÇADA — re-render da página como
  está, nunca pela spec. O pedido vive no payload do job (`recompor.forcar`,
  `forcaPedidaEm`, `forcaTentada`, `forcaAtendida`), promovido por
  compare-and-set num job PENDING/RUNNING (com orçamento próprio), e
  `fecharJob`/`falharJob` devolvem o job à fila enquanto houver força NOVA por
  atender — nunca DONE nem FAILED com pedido pendente; a própria forçada que
  falha em 3/3 é FAILED terminal, reabrível pela edição seguinte.
- 🔴 **A trava `somenteReRender` nasce JUNTO da gravação do ajuste, NA MESMA
  TRANSAÇÃO** (`travarRecomposicaoDaArte(pageId, motivo, tx)`, chamada por
  `ajustarArte` antes do render): a arte do compositor (spec e snapshot) não
  conhece o ajuste, e uma recomposição pela spec o desfaria. Até a revisão
  FINAL a marca só era gravada pelo re-render forçado bem-sucedido — com o
  render e as recuperações falhando, a edição de texto seguinte reabria o job
  normal e recompunha (REV-F01); e fora da transação um worker lia a página já
  ajustada com a arte ainda sem trava e recompunha por cima (REV-D01). Se a
  trava falhar, a página não é gravada. 🔴 **Dentro da transação nada usa
  `db`**: medido em 12/09/2026 no pool do dev, uma leitura pelo cliente raiz
  com a transação interativa aberta no MESMO cliente fica presa até o
  timeout dela (P2028 aos 20s) — a prova de dev (6o) lê a página por um
  `PrismaClient` próprio, e a busca da arte da página filtra por
  `projectId` (JSON path sem o índice do projeto varria a tabela: 1,9s
  contra 0,75s).
- 🔴 **`Generation.fieldValues` de uma arte que dois lados escrevem se grava por
  MERGE NO BANCO** (`mesclarFieldValuesDaArte`, `src/lib/creatives/
  mesclar-field-values.ts`: jsonb `||` sobre a linha atual, numa instrução
  só), nunca por `{ ...fieldValues }` capturado antes. O worker da fila lê a
  arte no começo, trabalha dezenas de segundos e gravava o objeto inteiro: a
  trava `somenteReRender` que o revisor gravasse nesse intervalo (na
  transação do ajuste) era apagada, e a edição de texto seguinte recompunha
  pela spec e desfazia o ajuste (REV-R01 da revisão do Codex, 12/09/2026).
  Reler antes de um `update` incondicional só encurta a janela. Passam pelo
  merge: a escrita da recomposição, o `renderPageAndRegister` com
  `generationId` (o re-render e a fila `COMPOR` — o persist manda só o patch
  no lote com as colunas), a própria trava e o registro da recusa. Escritor
  NOVO de `fieldValues` de arte que já existe usa o helper; `update` com o
  objeto inteiro é a corrida de volta. A prova de dev (6p) grava a trava no
  meio da execução do worker e confere que ela sobrevive à escrita dele.
- 🔴 **O runner confere a VERSÃO VISUAL da página depois de refazer a arte**
  (`versaoGravada`, o hash de `versaoDaPagina`), nunca só a copy: só a força de
  um gradiente salva durante o render não muda copy nem diff geométrico, e o
  re-render forçado fechava DONE com o slide em G1 e a página em G2 (REV-F02).
  Divergiu → `pedirNovaTentativa` e a execução ACABA ali (a seguinte desenha a
  página atual); sem orçamento, falha explícita (`PAGINA_MUDOU_DURANTE`, pelo
  `falharJob` de sempre) — nunca DONE com o slide velho nem força marcada como
  atendida (REV-D02).
- **A recomposição RECUSA (`PAGINA_MUDOU_DURANTE`) quando a página mudou entre o
  levantamento e a leitura que compõe, ou entre a composição e a gravação**
  (compare-and-set em `updatedAt`; o PNG é apagado). O executor lê o job FRESCO
  ao reservar (`reservarJob`), porque a força pode chegar entre a varredura e a
  reserva.
- **"Menos gradiente" nunca é proposto sobre gradiente desenhado à mão** — nem
  com a régua satisfeita (`ehGradienteDeLeitura` na regra; o apontamento da
  visão fica como observação). E `revisar-antes-depois.ts` renderiza sobre o
  MESMO fundo do serviço (`convertPageToDesignData`): página sem fundo é branca.
- 🔴 **A página que mudou DURANTE a recomposição é re-renderizada COMO ESTÁ no
  retry, em dia ou não** (`recompor.renderizarComoEsta` no payload do job,
  gravado por `marcarRenderComoEsta` ANTES de devolver o job à fila; revisão
  FINAL do Codex, REV-FINAL-01 e REV-C19-01, 12/09/2026). A divergência de
  versão detectada no fim da execução pode ser SÓ de gradiente (paradas e
  força), que o diff de conteúdo não vê: sem o marcador o retry dizia "em dia"
  e fechava DONE com o slide velho. E o marcador vale mesmo quando o editor
  também mudou o TEXTO antes do retry — condicioná-lo a "em dia" deixava esse
  caso recompor pela spec e apagar o gradiente salvo. O marcador sai do
  payload quando a execução o consome; não escreve a trava `somenteReRender`
  (o ajuste do editor não é ajuste do revisor).
- **A redução de força da visão (`menos-gradiente`) respeita a necessidade de
  CADA texto da borda** com a conta da régua (`max(piso, atual − passo,
  …necessárias)`; REV-FINAL-02): texto legível AGORA não é texto com folga.
  Redução abaixo do mínimo (0,08) vira observação — e a conta é em MILÉSIMOS
  (`reducaoAtingeOMinimo`): `0.6 − 0.52` dá 0,0799… em ponto flutuante, e a
  redução exatamente no mínimo era descartada (REV-C19-02).
- 🔴 **A recuperação de job expirado é compare-and-set sobre o que LEU**
  (`recuperarJobsPerdidos`: tentativas, orçamento e payload; perdeu a corrida
  → relê e decide de novo). Entre a leitura dos vencidos e a escrita terminal,
  um ajuste cujo render falhou pode PROMOVER o job (força nova no payload,
  `maxAttempts` ampliado): com o filtro só por id e status, a recuperação
  gravava FAILED por cima da força aceita, com orçamento disponível, e o
  carrossel ficava com a arte anterior (REV-127-01 da revisão FINAL do Codex,
  12/09/2026). Prova 6s.
- **`menos-gradiente` da visão com texto ESCURO na borda fica como observação**
  (REV-127-02): a conta da necessidade é a do texto claro (o gradiente
  escurece; sem ele o fundo fica claro demais); para texto escuro a
  desigualdade é a inversa e a mesma conta propunha tirar o clareamento de
  que o texto depende. Grupo de sentidos mistos idem.
- 🔴 **Texto visível que o medidor não mede não vira regra "avaliada"**
  (REV-127-03): curvo, `fitty` e `auto-resize-*` fazem `measureTextLayerBox`
  devolver `null` sem exceção, e a geometria simplesmente os omitia — colisão,
  corte e margem saíam avaliadas sem ter olhado a camada, e a visão ficava sem
  marca dela. `revisarArte` compara os textos visíveis com as métricas e passa
  `textosSemMetrica`; `avaliarPeca` rebaixa para `parcial`, com os ids, tudo
  que depende da métrica (inclusive a visão). Prova 6t.

**Da revisão FINAL do Codex sobre 618e45f7 (BLOQUEADO, REV-FINAL-01…02, 12/09/2026):**

- 🔴 **O render do ajuste só PUBLICA se a página ainda estiver na versão que
  ele desenhou** (REV-FINAL-01). A proteção de versão cobria a escrita das
  CAMADAS; a miniatura e a Generation eram gravadas sem conferir nada.
  Intercalação real: numa peça sem post, o ajuste A grava V1 e renderiza; o
  ajuste B lê V1, grava V2 e publica; A termina por último, regravava a
  miniatura e virava a Generation mais recente com V1 — e `agendarPost`
  reutiliza a miniatura como mídia `RENDERED`, fora da fila de renders.
- **`renderPageAndRegister` recebe `versaoEsperada`** (o hash de
  `versaoDaPagina` das camadas que renderizou) e publica numa transação só:
  trava a linha da página (`SELECT … FOR UPDATE`), relê a versão, grava
  miniatura e Generation. Mudou → PNG apagado, nada publicado,
  `PAGINA_MUDOU_DURANTE` (409; no ajuste, com `ajusteGravado: true`). Quem
  gravou a versão seguinte responde pela arte dela; a agenda é avisada como no
  render que falha.
- 🔴 **A conferência é pelo CONTEÚDO, nunca `updatedAt`.** O autosave do
  PageSync que só troca a miniatura move o carimbo sem mudar o desenho, e
  descartar por ele recusaria ajuste bom. Os outros chamadores (fila COMPOR,
  recomposição, arte nova) não passam versão e seguem como antes — a
  recomposição já confere a versão no runner.
- 🔴 **Mapa de copy por camada usa `chaveUnicaDeTexto`** (`page-layers.ts`, a
  regra `#2`, `#3` de `textosDaPagina`), nunca `Object.fromEntries` por
  `name ?? id` (REV-FINAL-02). `copyVisualDasCamadas` colapsava duas camadas
  de mesmo nome ("Texto" em texto simples e em rich text): o PNG mostrava as
  duas, e a copy visual regravada pela recuperação, a conferência de texto e o
  post agendado por Generation/URL ficavam só com a última. O conteúdo entra
  inteiro, sem trim. Generation antiga já colapsada é regravada com os dois na
  próxima recuperação forçada.
- Provas: `ajuste-render-atrasado.test.ts` (A parado no `put`, B completo, A
  liberado por último; e o autosave de miniatura no meio, que NÃO descarta),
  `copy-visual-nomes-repetidos.test.ts` (as três codificações de
  `Page.layers`) e o passo 9k da prova de integração (costura
  `_prova.antesDePublicar`; escrito, ainda não rodado).

**Da revisão do commit 90aa3739 (BLOQUEADO, REV-90AA-01, 12/09/2026):**

- 🔴 **A costura de prova que roda ENTRE o upload e a publicação recebe a URL
  do PNG** (`antesDePublicar({ url })`) e a registra para a limpeza ANTES de
  fazer qualquer outra coisa. O PNG de A já está no Blob quando o passo 9k
  roda o ajuste B: se B lançar, A sai sem apagar nada; se o `del` da versão
  descartada falhar, `persist` só avisa (não pode derrubar o 409 esperado). Nos
  dois casos a URL não estava em Generation nenhuma nem no conjunto `blobs`, e
  a prova terminava verde com resíduo no Blob de PRODUÇÃO.
- **A limpeza de Blob da prova mora em `scripts/lib/limpeza-de-blobs.ts`**
  (`apagarBlobsDaRodada`, sem Prisma nem SDK): só URLs do Blob, sem repetição,
  falha ao apagar devolve erro e as URLs que ficaram — e quem chama conta como
  falha da prova (REV-9E-03). Tentar de novo o PNG que `persist` já apagou não
  custa nada; é o que pega a exclusão que virou só aviso.
- Provas: `ajuste-render-atrasado.test.ts` (a costura recebe a URL antes da
  publicação; se lançar, a URL já foi entregue) e
  `src/lib/__tests__/limpeza-de-blobs-da-prova.test.ts`.

**Da revisão FINAL do Codex sobre 0352c590 (BLOQUEADO, REV-127-INTEGRAL-01…02, REV-0352-01, 12/09/2026):**

- 🔴 **Id de camada criada pelo revisor se confere contra TODAS as camadas,
  escondidas inclusive — nunca só a primeira colisão** (REV-127-INTEGRAL-01).
  `aplicarAjustes` criava o gradiente de leitura e, se o id existia, tentava só
  `-revisao`. Criar, ocultar e recriar deixa `gradiente-leitura-rodape` e
  `…-revisao` ocultos na página; a terceira criação repetia `…-revisao`, e dois
  ids iguais em `Page.layers` fazem o ajuste seguinte por id atingir as DUAS
  camadas (o `Map` escolhe uma, a substituição por `l.id === alvoId` escreve nas
  duas, visibilidade inclusive). Hoje `idLivre` procura `-revisao`,
  `-revisao-2`… até achar um id livre; os ids existentes nunca mudam.
- 🔴 **Lista de saída do modelo cortada por teto é COBERTURA PARCIAL e nunca
  rebaixa achado medido** (REV-127-INTEGRAL-02). `reconciliarVisao` parava no
  6º achado com `break`, sem contar o resto: a visão saía "avaliada" e, se o 7º
  confirmava a falta de leitura medida, a leitura era rebaixada a sugestão
  dizendo que a visão não a viu. Hoje o achado válido e distinto além do teto
  conta em `truncados` (item inválido além dele segue em `descartados`); o
  estado da visão chega a `avaliarPeca` por `insumosDaVisao` (num lugar só,
  para ninguém esquecer o corte), e a regra trata `visaoTruncados > 0` como
  parcial mesmo com `visaoConclusiva: true` — a trava mora na regra, não só em
  quem chama.
- 🔴 **Gate de falha nunca é `if (erro)`: string vazia é falsy** (REV-0352-01).
  A exclusão do Blob que rejeitava com `new Error('')` ou `throw ''` devolvia
  `erro: ''` e a prova terminava com código zero e URLs no Blob de produção.
  Hoje a mensagem nunca sai vazia (texto padrão quando vem vazia) e a prova
  decide por `limpezaFalhou(r)` = `erro !== null` ou sobra de URL.
- Varredura: em `src/lib/creatives/revisao/` o único id com sufixo gerado é o do
  gradiente criado, e a única lista de saída de modelo com teto é a da visão.
  O `.slice(0, 5)` dos recortes é ENTRADA do modelo (a peça inteira e a marcada
  vão junto), e os `slice` de `descricao`/`evidencia`/`motivo` cortam texto,
  não lista.
- Provas: `aplicar-ajustes.test.ts` (quatro ciclos criar/ocultar com ids únicos
  e o ajuste por id que só toca a camada indicada), `visao.test.ts` (sete
  achados → `truncados: 1`; repetição não é corte; `insumosDaVisao`),
  `regras.test.ts` (cadeia reconciliar → insumos → avaliar com a confirmação da
  leitura em 7º: parcial e `problema`; controle dentro do teto: avaliada) e
  `limpeza-de-blobs-da-prova.test.ts` (rejeição com mensagem vazia e o gate
  `limpezaFalhou`). Cada correção desfeita por mutação faz a sua prova falhar.

**Da pré-revisão do commit 65b40096 (BLOQUEADO, C0-01…02, 12/09/2026):**

- 🔴 **A visão só rebaixa o achado MEDIDO que ela RECEBEU marcado** (C0-01).
  O laço que manda "texto sem leitura" para sugestão, e tira o assunto
  estimado, rodava ANTES de a revisão saber que a visão não teve marca daquele
  texto. Duas variantes, as duas com a régua medindo o horário fora do alvo e
  a visão devolvendo lista vazia: (A) o horário é texto sem métrica (curvo,
  fitty, auto-resize), que não ganha marca T, e era rebaixado dizendo que "a
  visão olhou e não viu", enquanto a cobertura, logo depois, virava parcial
  porque a visão não o recebeu (relatório contraditório); (B) a medição dos
  textos falhou, nenhum texto ganhou marca, TODA leitura medida descia e a
  visão ficava "avaliada". Hoje a cobertura é decidida antes: achado com
  alguma camada fora de `visaoCamadasMarcadas` (que `insumosDaVisao(visao,
  marcas)` preenche; sem o campo, a regra deriva de `blocosDeTexto`, a mesma
  conta de `marcasDaPeca`) continua medido e deixa a visão parcial, com os
  ids. Com `motivoSemMedida`, a visão nunca sai "avaliada".
- 🔴 **Confirmação da visão vale para TODOS os achados a que se aplica, nunca
  só ao primeiro** (C0-02). "Gradiente claro demais" apontado para a peça
  inteira (sem marca) confirmava, por `find`, só o primeiro `texto-sem-leitura`
  da lista; o horário ficava sem a confirmação e descia com a nota falsa de
  que a visão não viu problema de leitura. Hoje é `filter`: cada irmão recebe
  o olhar. Item com marca continua confirmando só o que cruza a marca.
- Varredura em `regras.ts` dos pontos em que a presença da visão muda a classe
  de um achado medido: o laço de arbitragem (leitura → sugestão; assunto
  estimado → sai) passa pela checagem de marca, e a confirmação por irmão
  (que protege do rebaixamento) é por `filter`. `contradicaoDaMedida` só anota
  o achado da própria visão, e os desmentidos descartam apontamentos DA
  visão, não achados medidos.
- **O cleanup do banco e a exclusão do Blob da prova são passos independentes**
  (nota não bloqueante da mesma pré-revisão): `limparBancoEBlobs`
  (`scripts/lib/limpeza-de-blobs.ts`) roda o banco num `try`, apaga o Blob
  mesmo que ele lance (com as URLs juntadas até ali) e devolve `erroDoBanco`,
  nunca vazio, que a prova conta como falha.
- Provas: `regras.test.ts` (texto sem métrica e medição que falhou, os dois
  mantendo `problema` e a visão parcial, com o controle marcado que ainda
  desce; o assunto estimado sem marca que fica; a peça inteira confirmando as
  duas leituras, com o controle só em T1), `visao.test.ts` (`insumosDaVisao`
  leva as camadas marcadas) e `limpeza-de-blobs-da-prova.test.ts` (banco que
  lança não impede o Blob). Cada correção desfeita por mutação faz a sua prova
  falhar.

**Da pré-revisão do commit 400277a5 (APTO COM NOTAS, C0-11) e da pré-revisão do PR 3 (C3-11), 12/09/2026:**

- **Texto VAZIO não entra em achado de leitura** (C0-11). O medidor devolve
  `null` para conteúdo vazio (sem métrica, sem marca), `textosSemMetrica` exige
  conteúdo, mas a régua mede a CAIXA de todo texto visível. Num grupo
  `{cta: "Reserve já", servico: ""}` sobre foto clara, o achado nascia com
  `['cta', 'servico']`, severidade de serviço e "o horário não dá leitura", e a
  regra do C0-01 bloqueava o rebaixamento dizendo que a visão "não recebeu
  marca" de uma camada sem nada para ver. Hoje a seção 6 tira do achado todo
  texto sem conteúdo (`textoSemConteudo`, o mesmo critério de
  `textosSemMetrica`), e grupo só de textos vazios não gera achado. A
  checagem de marca não precisou de filtro próprio: o único produtor de
  `texto-sem-leitura` é a seção 6. ⚠️ A régua continua medindo a caixa vazia
  no p98 do GRUPO — isso é anterior e fica fora deste conserto.
- **Lacuna de teste fechada**: a regra "medição falhou ⇒ visão parcial" agora
  tem prova SEM achado de leitura (antes a mesma prova tinha `naoVistas`
  preenchido, e tirar `|| e.motivoSemMedida` não quebrava nada).
- 🔴 **A marca do revisor só sobrevive se a BASE também está escondida COM
  ela** (C3-11). O editor guarda a camada no estado local e reenvia a marca
  que o servidor já tirou: mostrar → esconder de novo → qualquer edição, e
  `reconciliarMarcasDoRevisor` mantinha a marca porque só olhava se a base
  estava escondida. O esconder humano virava mecânico e o contrato recebia
  depois uma revisão `equipe` restaurando o bloco. Hoje é
  `if (a && !ocultaPeloRevisor(a))` — base visível cai no mesmo ramo; camada
  nova (sem base) mantém a marca; o autosave logo depois do ajuste também.
- **As mensagens do cleanup da prova dizem o que aconteceu**: tudo em
  `criados` começa em zero e cresce com a contagem de cada delete (o resumo
  afirmava uma página que não tinha sido apagada); a linha do banco só diz que
  o Blob foi apagado quando foi; e cada consulta que descobre URL é anunciada
  antes de rodar (`descoberta.pendente/feita`), então as que não rodaram saem
  listadas como "URLs NÃO descobertas". Tudo em `falhasDoCleanup`, testado sem
  banco.
- **Dois commits do PR 0 que nasceram no branch do PR 6 desceram por
  cherry-pick**: `copyVisualRegravada` (o marcador da copy visual regravada no
  re-render) e `recusaDaRecomposicao` (a recusa em chave própria, C6-01), com
  os testes do harness do PR 0 passando aqui sem nada do PR 6.
- 🔴 **A prova 6n lê a recusa em `recusaDaRecomposicao`** (C6-11 da
  pré-revisão do PR 6): ela lia `recomposicao` e ficaria vermelha em toda
  rodada com o C6-01 — e o conserto tentador seria reverter o C6-01. Agora ela
  exige também `recomposicao.estado === 're-renderizada'` (o registro do
  re-render que a mesma rodada gravou antes de lançar) e `arteTrocada: true`.
- **A recusa sabe se a imagem já foi trocada** (C6-12): o runner guarda o
  resultado da recomposição antes das checagens seguintes e passa
  `arteTrocada` e os posts trocados a `registrarRecusa`; o histórico usa
  `mensagemDaRecusaNoHistorico` e o conselho é neutro ("confira a página e
  salve de novo" — a mudança pode ter sido a foto). O docstring deixou de
  dizer que a galeria e `ver-geracao` leem a recusa: hoje só o histórico do
  post avisa, e a chave na arte é diagnóstico.
- Provas: `regras.test.ts` (grupo com texto vazio: achado só com o CTA,
  sugestão e visão avaliada; só vazio: sem achado; controle curvo: problema e
  parcial; medição que falhou sem achado: parcial),
  `oculta-pelo-revisor.test.ts` e `patch-da-pagina-marca-do-revisor.test.ts`
  (mostrar → esconder → editar, na função pura e pelo PATCH real da página),
  `limpeza-de-blobs-da-prova.test.ts` (mensagens e consultas não rodadas) e
  `copy-visual-regravada-marcador.test.ts` (histórico por post e
  `arteTrocada`). A 6n da prova foi só tipada, não rodada aqui.

### O contrato da copy autoral (F1 de "Marca simples, copy melhor", 12/09/2026)

Quem escreve é o Claude, no chat; o Studio é guardião da FIDELIDADE. Até
aqui a copy viajava como `string[]` posicional (`ItemDePlano.copyProposta`) ou
como `Bloco[]` por papel (`spec.blocos`), e o caminho até a arte cortava,
reordenava ou transformava o texto em pelo menos uma dezena de pontos sem
registro (seção 6 do plano). `src/lib/copy-autoral/` é o contrato — módulo
PURO (zod), sem Prisma, com teste de ida e volta exata.

- **Por bloco: `id` estável (do autor), `funcao` (pre · headline · apoio · cta ·
  servico · livre), `grupoDeLeitura` (os blocos que se leem como UMA frase —
  do AUTOR, nunca deduzido do papel), `ordem` explícita (a ordem do array não
  é contrato), `linhas` EXATAS (caixa, acento, quebra e `[colchetes]` como
  escritos), `fatos` (as entradas da base que sustentam preço, horário, data,
  promoção) e `estilo` (`herdaDe`, e a segunda voz da manchete DECLARADA por
  linha em `linhasNaVoz2` — até aqui a última linha mudava de voz sozinha).**
- **Na copy: `versao`, `origem` (quem escreveu, quando, por onde), `revisoes`
  (toda mudança com autor claude · equipe · sistema · desconhecido, data,
  motivo e blocos tocados) e `lacunas` (o que o contrato NÃO sabe).**
- 🔴 **Campo OMITIDO ≠ bloco VAZIO.** O autor que não escreveu o CTA não
  manda o bloco; o que quer a camada sem texto manda `linhas: []`. No legado
  os dois viravam "sem texto".
- 🔴 **O adaptador do legado DECLARA o que não sabe e NÃO INVENTA**:
  autoria `desconhecido` (nunca "claude" por palpite), ordem pela posição
  registrada em `lacunas`, sem grupos de leitura, e a lista posicional sai
  com função `livre` — atribuir papel pela posição era justamente a
  transformação silenciosa (`copyParaBlocos`) que o contrato existe para
  expor. `copyComparavel()` é falso para autoria desconhecida: legado entra
  na métrica como "não comparável", nunca como fidelidade comprovada.
- 🔴 **Adaptador nunca devolve contrato que o leitor rejeita** (PR2-01 da
  revisão final do Codex, 13/09/2026). O legado aceita o que o contrato não
  comporta — a API de itens aceita 2.000 caracteres por item, o contrato 300
  por linha e 12 linhas por bloco —, e a primeira versão devolvia sucesso que
  voltava `copy: null` na releitura. Hoje a saída passa por
  `validarCopyAutoral`: `converterListaLegada`/`converterBlocosLegados`
  devolvem `{ copy: null, problemas, original }` e `copyDeListaLegada`/
  `copyDeBlocosLegados` LANÇAM `CopyLegadaIncompativel`. **Nunca truncar nem
  redistribuir texto para caber** — é a transformação silenciosa que o
  contrato existe para expor.
- 🔴 **Histórico cheio é RECUSA, nunca compactação** (PR2-02). A revisão
  aceita até 80 ids tocados (trocar 40 blocos por 40 novos toca os dois lados),
  e com 200 revisões `aplicarRevisao` lança `HistoricoDaCopyCheio` (com a copy
  intacta e as mudanças pendentes). Não há saída sem perda: toda remoção
  precisa ficar registrada e revisão tem um autor só, então apagar ou fundir
  revisão antiga descarta autoria. **Quem chama `aplicarRevisao` num caminho
  que não pode falhar (autosave do editor) precisa tratar a recusa** —
  `historicoCheio(copy)` responde antes, sem exceção.
- 🔴 **As DUAS INVARIANTES do módulo são testadas por varredura de fronteira,
  não caso a caso** (auditoria do PR 2, 13/09/2026, depois de quatro rodadas
  do Codex achando um teto por vez — PR2-01 a PR2-04). (1) **Tudo que o
  módulo PRODUZ o leitor ACEITA, com conteúdo idêntico**; quando não dá, a
  recusa é explícita e a entrada fica intacta. (2) **Validar a parte concorda
  com validar o todo nas regras LOCAIS.** `__tests__/invariantes.test.ts` lê
  os tetos do PRÓPRIO zod e gera teto-1 · teto · teto+1 · vazio · omitido ·
  duplicado · fora do alfabeto em todo campo; tipo de schema que ela não
  conhece quebra o teste. Campo novo com limite entra sozinho — função
  produtora nova entra na varredura no mesmo commit.
- 🔴 **`aplicarRevisao` confere o RESULTADO inteiro no leitor antes de
  devolver.** Conferir campo a campo deixou escapar um teto por rodada:
  ids tocados (PR2-02), histórico (PR2-02), metadados (PR2-03 — motivo vazio
  ou de 301, `em`/`superficie` acima de 40). Hoje metadado fora do teto ou
  bloco novo que o contrato não comporta lança `RevisaoDaCopyInvalida`
  (original intacta, `problemas` completos; os de metadado começam por
  "revisão nova:"), e `tentarAplicarRevisao` devolve a mesma decisão sem
  exceção. **Mudança de comportamento para quem chama**: bloco inválido
  deixou de voltar como copy que o leitor rejeita — quem conferia DEPOIS
  (`copy-do-item.ts`, na F4) precisa trocar para `tentarAplicarRevisao`, e
  quem não pode falhar (autosave do editor via `copyEfetivaDasCamadas`) trata
  as duas exceções. Metadado vazio é RECUSADO, nunca omitido em silêncio
  (`superficie: ''` sumia; `em: ''` virava inválido).
- 🔴 **Regra LOCAL mora uma vez só**: `problemasLocaisDoBloco` (segunda voz só
  na manchete, só em linha que existe) e `problemasLocaisDaRevisao` (campos e
  remoções listados em `blocos`) são chamadas por `problemasDeCoerencia` E por
  `validarBlocoAutoral`/`validarRevisaoDaCopy`. Regra local nova entra nelas —
  escrita só em `problemasDeCoerencia`, o validador do elemento solto volta a
  aprovar o que a copy recusa (PR2-04). Regra de CONJUNTO (id repetido, ordem,
  grupo, revisão citando bloco que não existe) fica só na copy.
- **O que o ADAPTADOR inventa cabe no contrato por construção**: o id nascido
  do papel tem teto (56 + sufixo), a lacuna cita no máximo 60 caracteres do
  papel (com "…") e papéis desconhecidos além das vagas viram UMA lacuna de
  resumo. Antes, papel de 61+ caracteres ou 18 papéis desconhecidos viravam
  `CopyLegadaIncompativel` de um texto que cabia — recusa espúria.
- **A única conversão de saída é `blocosParaOCompositor`** (contrato →
  `Bloco[]` por papel, em ordem), e ela não transforma texto: bloco `livre`
  volta em `semPapel` em vez de sumir — quem chama decide (recusa, camada
  extra da F3, aviso). O PR 4 faz o compositor consumir o contrato direto.
- **Revisão é diff EXATO** (`aplicarRevisao`/`diferencasDeBlocos`): mudar a
  caixa ou o acento aparece como revisão de quem mexeu, e `autorDoBloco` diz
  quem foi o último a tocar em cada bloco. Sem mudança não há revisão vazia.
- **Validação devolve TODOS os problemas** (id repetido, ordem repetida ou
  com buraco, grupo de um bloco só, voz 2 fora da manchete ou em linha
  inexistente, revisão citando bloco que não existe), nunca só o primeiro.
- ~~Nada persiste ainda~~ — **o PR 3 gravou o contrato** (seção seguinte). Nenhum
  backfill inventa copy original para o histórico: página, item e arte antigos
  ficam sem contrato, e o adaptador do legado só entra quando uma spec nova
  chega só com `blocos`.

### A persistência do contrato da copy (PR 3 de "Marca simples, copy melhor", 12/09/2026)

Migration aditiva `20260912120000_copy_autoral`: `Page.copyAutoral` e
`ItemDePlano.copyAutoral` (JSONB, nulos). Na arte, `Generation.fieldValues.copyAutoral
= { original, efetiva, comparavel, lacunas? }`. Módulos: `src/lib/copy-autoral/efetiva.ts`
(camadas → contrato, puro), `persistir.ts` (a única casa do módulo que importa o
Prisma), `src/lib/planos/copy-do-item.ts` (puro). Prova de integração no branch de
dev: `scripts/validar-copy-autoral.ts`.

- 🔴 **A PÁGINA guarda a EFETIVA, a GENERATION guarda o ORIGINAL.** A efetiva é o
  original + a revisão do SISTEMA com o que o compositor mudou ao desenhar
  (`copyEfetivaDasCamadas`, superfície `compositor`). Medido na primeira rodada da
  prova: com a página guardando o original, a primeira edição da EQUIPE levava a
  culpa pela seta que o compositor põe no CTA e pelo destaque `[]` que ele não
  desenhou sem estilo cadastrado. O contrato da página descreve o que a página
  MOSTRA; a edição seguinte é diferenciada contra ele, e cada bloco tem o autor
  certo (`autorDoBloco`). O texto verbatim do autor está em
  `fieldValues.copyAutoral.original` (e em `ItemDePlano.copyAutoral`).
- **`comparavel` só é verdadeiro com autoria conhecida.** Spec que chega só com
  `blocos` (legado) vira contrato ADAPTADO com `origem.autor: 'desconhecido'` e
  entra na métrica como "não comparável" — nunca como fidelidade comprovada.
- 🔴 **Quem grava camadas grava a revisão do contrato NA MESMA ESCRITA**
  (`revisaoDaPaginaComCamadas`, puro, em `revisar-pagina.ts`): o PATCH do editor
  (`equipe`, `editor` — disparado por QUALQUER mudança de camadas, e o diff
  exato decide se há revisão: só o destaque do rich text, ou uma quebra, revisa;
  autosave idêntico não), `ajustarArte` (`equipe` com `canal: 'studio'`, `claude`
  no resto), `reverterCamadasDaArte` (`sistema`, `reverter-arte`) e a
  recomposição. Calculada num `after()`, dois autosaves fora de ordem deixavam
  a página com as camadas B e o contrato de A (R02 da revisão do Codex). Página
  SEM contrato fica sem (`sem-contrato`), nunca lança. A Generation do ajuste
  leva `original` (o contrato da página, já revisado) e `efetiva` (as camadas
  finais). `registrarRevisaoDaPagina` (com Prisma, compare-and-set no contrato
  lido) é só o caminho tardio para quem tem o `pageId` e camadas já gravadas.
- **A recomposição leva à spec o contrato DA PÁGINA como ela está** (lido das
  camadas atuais sobre o contrato gravado) e tira os blocos dele; ao terminar,
  grava a efetiva recomposta na página e em `fieldValues.copyAutoral.efetiva`
  (o `original` fica). Manter o contrato velho na spec fazia `validarSpec`
  recusar a recomposição e o slide ficava com o texto antigo (R01).
- **Bloco VAZIO de propósito não vira bloco do compositor**
  (`blocosParaOCompositor` o pula; ele continua no contrato): o schema exige
  linha, e o item de plano com `cta: []` caía em `SPEC_INVALIDA` na fila.
- **Texto solto lido como bloco `extra-<id>` é relido ESTÁVEL** (o bloco casa
  também pelo id que a leitura anterior deu à camada; ids únicos) — antes a
  segunda leitura esvaziava o bloco e criava outro com o mesmo id, e o
  contrato deixava de ser lido (R03). Duplicar página leva o contrato (R08).
- **O compositor ainda transforma texto, e o contrato EXPÕE isso em vez de
  esconder**: a seta no CTA e o destaque não desenhado saem em `ver-geracao`
  como `copy.blocosDiferentes` e na revisão do sistema. Tirar as transformações
  é o PR 4 — não "corrija" a efetiva para bater com o original.
- 🔴 **`validarSpec` deriva `blocos` de `copyAutoral`** (a única conversão
  sancionada, `blocosParaOCompositor`) e recusa: bloco `livre` COM texto (a camada
  livre chega na F3 — recusar é o oposto de sumir em silêncio) e `blocos` que não
  batem com o contrato quando os dois vêm. `blocos` passou a ser opcional na spec;
  sem contrato continua obrigatório.
- **Item de plano: o contrato manda, `copyProposta` é o ESPELHO posicional**
  (um item por bloco com texto, linhas unidas por `\n`) — é o que a bancada,
  `executar-plano` e as vias de template/IA leem até o PR 5. Contrato inválido
  recusa o item (`COPY_AUTORAL_INVALIDA`, 400). Edição só da lista (bancada) vira
  revisão da `equipe` quando casa posição a posição (mesmo número de blocos com
  texto; a segunda voz por índice acompanha a linha que sumiu); quando não casa,
  o contrato é DESCARTADO COM AVISO — manter um contrato que não descreve mais o
  texto seria mentir para a métrica. `montarSpecDoItem` leva o contrato à spec.
- **No conector**: `compor-arte`, `compor-leva`, `criar-plano` e
  `editar-item-do-plano` aceitam `copyAutoral` (com ele `blocos`/`texto` são
  dispensáveis); `editar-item-do-plano` assina a revisão como `claude`;
  `ver-geracao` devolve `copy` (escrita × desenhada, `comparavel`,
  `blocosDiferentes`, `lacunas`). Os quatro snapshots do registro foram atualizados
  no mesmo commit.
- ⚠️ **A migration ainda não foi aplicada em produção** (regra da casa: escrita à
  mão + `db:deploy`, com o OK do Ciro); no branch de dev está aplicada. O código
  sem a coluna falha na leitura de `Page.copyAutoral` — não subir o código antes
  do schema.
- 🔴 **A camada escondida pelo REVISOR não é remoção autoral** (rebase do PR 3
  sobre o PR 0, 12/09/2026). O ajuste `visibilidade` do revisor grava na camada
  `metadata.revisao.ocultaPeloRevisor`; `revisaoDaPaginaComCamadas` lê as
  camadas por `camadasParaDecisao` (a escondida pelo revisor conta como
  presente), então o PATCH do editor, `ajustarArte` (`claude`/`equipe`),
  `reverterCamadasDaArte` e `registrarRevisaoDaPagina` não assinam o bloco
  vazio como edição de quem pediu — nem mostrar a camada de novo vira adição.
  Camada escondida SEM a marca continua sendo remoção autoral. A efetiva da
  ARTE (`copyEfetivaDasCamadas` sobre as camadas cruas: Generation do ajuste,
  recomposição, compositor) segue dizendo o que foi DESENHADO, como revisão do
  sistema — a marca nunca muda o que a arte mostra. Leitor novo que decida
  AUTORIA a partir de camadas precisa do mesmo `camadasParaDecisao`. Teste em
  `revisar-pagina.test.ts` (com a marca: sem revisão; edição em outro bloco:
  só aquele bloco; controle sem a marca: revisão da equipe).

**Da pré-revisão do commit bf85cb26 (BLOQUEADO, C3-01…02, 12/09/2026):**

- 🔴 **`ajustarArte` SEM `versaoEsperada` também grava por compare-and-set**
  (C3-01, P2). O ajuste só de foto ou de nome, vindo do chat, lia a página,
  levava segundos resolvendo imagem, medindo e rodando o autofix, e gravava com
  `update` cru: se o editor salvasse texto novo no meio, a revisão calculada
  contra a leitura antiga saía `sem-mudanca`, as camadas velhas iam por cima e a
  página ficava **camadas X, contrato Y** — e a próxima edição no editor
  assinava como `equipe` a volta do texto. Hoje, perdida a corrida, a página é
  RELIDA e o ajuste só segue se o CONTEÚDO (`versaoDaPagina`) e o contrato
  continuam os que ele leu; senão nada é gravado e volta 409
  `PAGINA_MUDOU_DURANTE_O_AJUSTE` (`ajusteGravado: false`), que o conector
  devolve como erro, sem retentar. **Não troque a releitura por um
  compare-and-set puro em `updatedAt`**: o carimbo muda em qualquer escrita, e
  com o editor aberto o autosave grava miniatura e camadas idênticas a cada
  pausa — todo ajuste do chat tomaria 409 falso. Vale para página com e sem
  contrato (sem contrato, gravar por cima apagava a edição da equipe em
  silêncio). O ramo COM `versaoEsperada` ficou como estava (compare-and-set
  estrito). Teste em `ajustar-arte-concorrencia.test.ts`.
- **No PATCH, a marca `ocultaPeloRevisor` é reconciliada contra a leitura
  PROTEGIDA** (C3-02, P3): contra a base fresca antes da prévia e de novo contra
  `fresca` a cada volta do compare-and-set, antes de medir a diferença e revisar
  o contrato — nunca contra `existingPage`. O autosave não espera o PATCH em voo:
  mostrar a camada (P1) e escondê-la de novo fazia P2 manter a marca antiga lida
  antes de P1, e a remoção humana nunca entrava no contrato nem no aprendizado.
  Troca consciente: aba desatualizada que regrave escondida e marcada uma camada
  que outra aba mostrou conta como remoção de quem gravou por último. Teste em
  `src/app/api/templates/[id]/pages/[pageId]/__tests__/patch-marca-do-revisor.test.ts`.
- **As duas regras cobrem também a reconciliação com as camadas ANTERIORES do
  PR 5** (`camadasAnteriores`): as anteriores de `ajustarArte` são a leitura que
  o compare-and-set protege, e as do PATCH são a `fresca` contra a qual a marca
  foi reconciliada. Leitura nova de "como a página estava" que entre numa decisão
  de autoria precisa ser a mesma que a escrita substitui.

**Da pré-revisão do commit 046d2a5e (BLOQUEADO, C3-11…12, 12/09/2026):**

- 🔴 **A marca do revisor só sobrevive se a BASE também a tem** (C3-11, P2).
  O editor nunca recebe a remoção da marca feita no servidor (o `design` só é
  recarregado quando muda o id da página), então depois de mostrar e esconder de
  novo uma camada que o revisor ocultou, QUALQUER autosave seguinte reenviava a
  marca; como a base estava escondida SEM marca, a regra antiga ("tira a marca
  só se a base estava visível") a mantinha, e o contrato ganhava uma revisão da
  `equipe` devolvendo o bloco sobre uma camada que a página mostra escondida —
  mais uma decisão falsa de copy no corpus. A regra passa a ser `a &&
  !ocultaPeloRevisor(a)` → sem marca. **A correção mora em
  `src/lib/creatives/revisao/oculta-pelo-revisor.ts`, que é código do PR 0: foi
  aplicada lá e chega ao PR 3 pelo rebase** — não se mexe nesse módulo no PR 3.
- **`ajustarArte` recusa a página promovida a MODELO no meio do ajuste**
  (C3-12, P3). A releitura do compare-and-set conferia conteúdo e contrato, mas
  não `isTemplate`: "Marcar modelo" durante os segundos do ajuste deixava gravar
  camadas e criar Generation numa página-modelo. Hoje as DUAS escritas
  protegidas (com e sem `versaoEsperada`) levam `isTemplate: false` no `where`,
  e quem perde a corrida relê a página e lança a MESMA recusa da leitura inicial
  (`PAGINA_E_MODELO`, 400, `erroDePaginaModelo`). O `where` cobre o escritor que
  não move o carimbo; o toggle do editor move, e aí quem pega é a releitura.
- **O 409 `PAGINA_MUDOU_DURANTE_O_AJUSTE` não convida a repetir**: a mensagem
  manda rever a arte como ela está (conferir-arte), contar à pessoa que ela mudou
  e confirmar antes de ajustar de novo. Repetir na hora regravaria o texto que a
  equipe acabou de editar. O código do erro ficou o mesmo.
- **A comparação do contrato na releitura tem teste próprio** (só o contrato
  muda, conteúdo idêntico → 409), embora hoje nenhum escritor mude só o
  contrato: sem o caso, apagar `mesmoContrato` passava por todos os testes.
- 🔴 **Quem grava camadas TRATA as duas recusas do contrato; nenhuma vira 500
  nem derruba peça** (restack sobre o PR 2, `e3c1f75f` e `9238098f`, 13/09/2026).
  `HistoricoDaCopyCheio` e `RevisaoDaCopyInvalida` (camada com linha acima de
  300, mais de 12 linhas, mais de 40 blocos) chegam por `copyEfetivaDasCamadas`
  a todo caminho que grava camadas: use `tentarCopyEfetivaDasCamadas` (devolve
  `ok: false` + aviso com o que fazer) e `revisaoDaPaginaComCamadas`, que devolve
  `historico-cheio`/`copy-invalida` — `recusaDaRevisao(r)` dá o aviso. A
  regra de produto é uma só: **as camadas e a arte seguem, o contrato fica como
  estava (nunca a 201ª revisão), e o aviso sai** — no PATCH do editor
  (`avisoDaCopy` na resposta + log), no `ajustarArte` e no `reverter-arte`
  (`avisos`), na recomposição (avisos do registro) e no compositor
  (`fieldValues.avisosDaCopyAutoral` e `diagnostico.avisos`). Na spec sem
  contrato, que não limita caracteres, o compositor usa `converterBlocosLegados`
  e segue SEM contrato com aviso quando o legado não cabe. No plano, o erro vira
  4xx explícito (`COPY_HISTORICO_CHEIO` 409, `COPY_LEGADA_INCOMPATIVEL` e
  `COPY_REVISAO_INVALIDA` 400) com o que fazer; `orientacaoDosProblemas` traduz
  problema de LIMITE em instrução ("quebre a linha"). Quem descarta a revisão
  inválida usa `tentarAplicarRevisao`, nunca confere DEPOIS de `aplicarRevisao`
  (ela já lança). **As lacunas da leitura das camadas entram no contrato só até
  o teto do schema** (`lacunasQueCabem`, com uma de resumo); a lista inteira
  segue em `CopyEfetiva.lacunas` para o registro da arte. ⚠️ Com `strict:
  false`, `!x.ok` NÃO estreita a união: use `x.ok === false` antes de ler `aviso`.

**Da revisão FINAL do Codex sobre abac9b34 (BLOQUEADO, PR3-F01…F07, 18/09/2026):**

- 🔴 **Toda escrita de `Page.layers` em página que pode ter contrato passa por
  `gravarCamadasComRevisao`** (`src/lib/copy-autoral/persistir.ts`) ou tem o
  mesmo laço escrito no lugar (PATCH do editor, `ajustarArte`, recomposição):
  relê a página, calcula as camadas SOBRE ela, revisa o contrato sobre ela e
  grava por compare-and-set em `updatedAt` (4 voltas, depois 409
  `PAGINA_MUDOU_DURANTE`). Escrita humana passa `humana: true` (a marca do
  revisor é reconciliada contra a mesma base). Faltava em três portas: a
  reversão (F01 — lia o contrato fora da escrita; um PATCH no meio deixava
  camadas X com contrato Y, e no ramo com revisão apagava a revisão
  concorrente), o PATCH de CAMADA (`use-auto-save-layer`) e o PUT do TEMPLATE
  (F03 — gravavam camadas sem revisar o contrato; a edição seguinte levava a
  autoria errada). O PATCH de camada funde a camada na página RELIDA: o
  autosave de outra camada no meio não é desfeito. Porta nova que grave
  camadas usa a função — `tx.page.update({ data: { layers } })` cru é o
  defeito de volta.
- 🔴 **Quem troca o PNG de uma arte que carrega `fieldValues.copyAutoral` grava
  o registro de novo** (`registroDaCopyDaArte`, puro, em
  `src/lib/copy-autoral/registro-da-arte.ts`; F02). O re-render da recomposição
  (página ajustada à mão, recuperação forçada) trocava o PNG e mantinha a
  `efetiva` antiga, que `ver-geracao` mostrava como `desenhada` com
  `comparavel: true`. A efetiva é medida nas camadas que o PNG desenha, sobre o
  contrato da página; sem como medir (histórico cheio, copy que não cabe,
  camadas ilegíveis), `efetiva: null`, `comparavel: false` e o motivo em
  `lacunas` — **nunca a efetiva antiga como se fosse a da imagem nova**. Arte
  sem registro não ganha um. Vale também para a recomposição que troca a
  imagem sem conseguir ler o contrato (`copyDaArteIndisponivel`).
- 🔴 **A segunda voz da manchete é RECONSTRUÍDA das camadas presentes**
  (`comSegundaVoz` em `efetiva.ts`; F05): `linhasNaVoz2` nunca é herdado do
  contrato na leitura das camadas. Sem `headline2` visível o índice sai; manchete
  não desenhada sai sem ele. Herdado, o índice apontava para linha inexistente
  (revisão válida recusada, contrato velho) ou sobrevivia às linhas reunidas na
  primeira voz (mudança sem registro). `herdaDe` fica.
- **O espelho posicional do item leva as strings EXATAS do contrato** (F06):
  `espelhoDoContrato` não apara nada, e só o bloco sem texto (vazio ou só
  linhas em branco — o que a bancada já filtra) fica de fora. A lista
  posicional num item COM contrato é comparada como veio. Aparar convertia a
  normalização do sistema em revisão da `equipe` quando a bancada reenviava o
  espelho ao salvar outro campo.
- **Campo omitido não é campo vazio** (F07): `{ copyAutoral: null }` sem
  `copyProposta` remove só o contrato — a lista fica (`CopyDoItem.copyProposta`
  `undefined` = não mexe). Limpar a lista é pedir `copyProposta: []`.
- 🔴 **`atualizarItem` grava condicionado à versão lida** (F04): `updateMany`
  com `updatedAt`; perdida a corrida o item é relido e a edição recalculada (as
  duas revisões ficam no histórico; a lista de quem grava por último vale, como
  sempre valeu); depois de 3 voltas, 409 `ITEM_MUDOU_DURANTE` com nada gravado.
  Harness de teste que mocke `itemDePlano.update` para `atualizarItem` precisa
  de `updateMany`.

**Da revisão FINAL do Codex sobre cc14f30a (BLOQUEADO, PR3-R8-01…03, 18/09/2026):**

- 🔴 **Superfície que edita copy de um item com contrato edita BLOCO a BLOCO,
  nunca um texto concatenado** (R8-01). O modal "Editar a peça" da bancada
  juntava os blocos num textarea e separava por quebra de linha: bloco de duas
  linhas virava dois, linhas vazias sumiam, e salvar SÓ a legenda descartava o
  contrato (mudou o número de blocos) ou registrava a normalização como revisão
  da `equipe`. Hoje é um campo por bloco (`blocosParaEdicao`), a copy volta
  como a lista ORIGINAL quando não foi editada (`copyDaEdicao`) e o patch só
  leva `copyProposta` quando ela mudou (`patchDaEdicaoDoItem`, em
  `para-bancada.ts`). O teste segue o caminho real — item do servidor → card →
  modal → patch → `atualizarItem`; testar só a hidratação pulava justamente a
  transformação do modal. Varredura: o compositor da bancada e o
  `gerar-arte-ia-modal` ainda usam "um bloco por linha", mas criam item/arte
  NOVOS (sem contrato a preservar); duplicar card e duplicar da galeria copiam
  o espelho exato e o item novo nasce sem contrato.
- 🔴 **Bloco ÚNICO da função leva TODAS as camadas dela** (R8-02,
  `copyEfetivaDasCamadas`). O compositor reparte um bloco em várias camadas do
  mesmo papel (`servico` e `servico-2` pelo arranjo; `distribuirLinhas` faz o
  mesmo com qualquer papel), e a leitura dava a 1ª camada ao bloco e criava
  OUTRO bloco `servico` com a 2ª: `Page.copyAutoral` ficava com dois serviços
  e a recomposição seguinte morria em `papel repetido`, com o slide preso na
  imagem velha. As linhas voltam juntas de cima para baixo; quando são as
  MESMAS do bloco em outra ordem, fica a ordem do autor (quem reordenou foi o
  arranjo — horário no grupo do relógio, endereço no do alfinete). Numa camada
  só, reordenar continua sendo edição. Com vários blocos da função, uma camada
  por bloco na ordem vertical, como antes. `copyDosPapeis` passou a juntar o
  papel repetido como `copyDosPapeisComDestaque` já fazia.
- 🔴 **Camada "usada" se marca por OBJETO, nunca por id** (varredura do R8-02).
  O contador `${papel}-${n}` de `compor.ts` recomeça em CADA grupo: o serviço
  repartido entre dois grupos da página (Happy wine do TERO) sai com duas
  camadas de id `servico`, e com `usadas` por id a segunda sumia da leitura —
  o endereço deixava o contrato e a recomposição o apagava. ⚠️ O id duplicado
  continua nascendo no compositor (é do PR 4); aqui só a leitura ficou imune.
- 🔴 **Os blocos DERIVADOS do contrato passam pelo mesmo schema dos
  explícitos** (R8-03, `validarSpec`). O contrato aceita linha vazia e até 12
  linhas; o compositor não. Sem a conferência, `enfileirarPeca` gravava o job
  e o worker recusava com `SPEC_INVALIDA` ao revalidar a spec expandida — o
  mesmo conteúdo com dois destinos. A recusa é na porta, sem cortar texto, e
  toda spec aceita revalida igual depois da ida e volta do payload.
- Provas: `atualizar-item-copy.test.ts` (o modal real, legenda só e uma linha
  editada), `recompor-servico-repartido.test.ts` (spec → persistência →
  edição da manchete → recomposição, com o `validarSpec` real, a troca do
  slide e a capa; o arranjo que inverte as linhas; os dois grupos com id
  repetido; dois blocos da função) e `spec-blocos-derivados.test.ts` (linha
  vazia e sete linhas recusadas antes do banco). Cada correção desfeita por
  mutação faz a sua prova falhar.

**Da revisão do Codex sobre cd98cd6d (BLOQUEADO, PR3-R9-01…03, 20/09/2026):**

- 🔴 **Efeito colateral se decide pela base EFETIVAMENTE SUBSTITUÍDA, nunca
  pela leitura do começo do handler** (PR3-R9-01). É a TERCEIRA rodada desta
  mesma classe (REV-01 da 3ª rodada no PATCH da página; PR3-F01/F03 nas portas
  de escrita), agora no PUT do template: ele lia X em `existingPages`, um PATCH
  concorrente gravava Y, `gravarCamadasComRevisao` relia Y e gravava X por
  compare-and-set — e `marcarSeMudou`, comparando X com X, deixava a gravação
  FORA de `paginasAlteradas`. A página ia de Y para X sem invalidar a imagem
  única nem pedir a recomposição do slide, e uma mídia já produzida com Y
  seguia divergente. Hoje `gravarCamadasComRevisao` devolve em `base` também
  `background`/`width`/`height`, e a decisão é `g.camadas` (as camadas
  EFETIVAMENTE gravadas, já com a marca do revisor reconciliada) contra
  `g.base` — os três campos visuais na MESMA comparação protegida.
  **A regra geral**: a leitura que decide o efeito colateral tem de ser a
  MESMA que a escrita protegida substitui. Se a leitura não é o predicado do
  compare-and-set, ela não serve para decidir nada depois dele.
- 🔴 **Editar uma parte do bloco REPARTIDO não reordena o contrato**
  (PR3-R9-02, `linhasRepartidas` em `efetiva.ts`). A decisão era tudo-ou-nada:
  mesmo conjunto de linhas → ordem do autor; qualquer diferença → ordem
  VISUAL. Num arranjo que põe o endereço acima do horário, editar só o horário
  fazia a comparação de conjuntos falhar e o bloco voltava `[endereço, horário
  editado]` — uma inversão que ninguém pediu, assinada pela `equipe` e levada
  à recomposição. Hoje cada linha desenhada volta à POSIÇÃO AUTORAL da linha
  igual a ela, e a editada fica com a vaga que sobrou (ordem visual entre as
  vagas). Com as mesmas linhas o resultado é idêntico ao de antes; numa camada
  só, reordenar continua sendo edição.
  ⚠️ Linha ACRESCENTADA numa das camadas vai para o fim, não para dentro da
  fatia daquela camada — a correspondência é por LINHA, não por camada.
- 🔴 **O schema HTTP que recebe o espelho lê os tetos do PRÓPRIO contrato**
  (PR3-R9-03, `MAX_ITENS_DO_ESPELHO`/`MAX_CARACTERES_DO_ESPELHO` em
  `copy-do-item.ts`, ao lado de `espelhoDoContrato`). A API do item aceitava 12
  strings de 2.000 caracteres e o contrato comporta 40 blocos de 3.611 (12
  linhas de 300 + as quebras): item criado com um `copyAutoral` VÁLIDO de 13
  blocos — ou com um bloco de 7 linhas cheias — voltava 400 assim que alguém
  mexia num caractere no modal. Aceitar na criação e recusar na edição é o
  mesmo conteúdo com dois destinos (irmão do R8-03). As duas rotas de plano
  (POST e PATCH do item) usam os mesmos tetos; **nada de truncar para caber**.
- **Varredura da classe (3ª vez), CAS a CAS**: PUT do template (corrigido);
  PATCH da página (`efetiva`/`baseGravada` da volta vencedora, inclusive
  `copyParaDecisao` e `diffDeGeometria` — ✅); PATCH de camada (`layerChanged`
  é calculado DENTRO do `camadas(base)`, sobre a base relida — ✅);
  `reverterCamadasDaArte` e `ajustarArte` (invalidam sempre, sem portão — ✅);
  `recomporPaginaDefasada` (decide por `versaoGravada`, escrita pela própria
  rodada — ✅); `atualizarItem` (relê o item a cada volta e recalcula copy e
  avisos contra ela — ✅); `trocarArteDoPost` (o sinal usa `midiasAtuais`, que
  É o predicado do CAS — ✅); `registrarFeedbackDeArte` (CAS na linha lida;
  perdeu a corrida, relê — ✅); `reapontarItemDoPlano`, `executar-plano` e
  `artes-do-post` (CAS sobre o que leram; o efeito sai do `count` — ✅);
  `marcarForcaEmExecucao`/`marcarRenderComoEsta` (só promovem payload — ✅).
- Provas: `put-efeito-por-base-gravada.test.ts` (Y intercalado entre a leitura
  inicial e a gravação, por camadas e por fundo; congelados; dois controles),
  `recompor-servico-repartido.test.ts` (o arranjo invertido com o horário
  editado, até a recomposição, mantendo o id do bloco) e
  `patch-espelho-do-contrato.test.ts` (criação com contrato → card → modal →
  handler HTTP → serviço, nos dois limites, com o controle acima do que o
  contrato comporta ainda em 400). Cada correção desfeita por mutação faz a
  sua prova falhar.

**Da revisão FINAL do Codex sobre 89930e44 (BLOQUEADO, PR3-R10-01, 20/09/2026):**

- 🔴 **Quem DISPUTA as camadas de uma função são os blocos COM texto**
  (`copyEfetivaDasCamadas`). O bloco explicitamente vazio (`linhas: []`) é
  "esta camada fica sem texto": `blocosParaOCompositor` o OMITE da spec, então
  ele nunca originou camada e não pode consumir uma. Contando-o, um contrato
  com `servico-vazio` + `servico-info` sobre um arranjo que reparte o serviço
  em duas camadas dava uma a cada bloco — o horário migrava de id sem ninguém
  ter editado nada, a página guardava dois serviços com texto, e a edição
  seguinte levava a recomposição a `papel repetido`, deixando o slide na
  imagem antiga. Ele também não vira lacuna: a arte mostra exatamente o que o
  autor pediu. É a regra "campo OMITIDO ≠ bloco VAZIO" do lado da LEITURA.
- **Quando NENHUM bloco da função tem texto, os vazios voltam a disputar**: aí
  a camada com texto é a de um bloco que alguém preencheu no editor, e
  mandá-la para um `extra-…` trocaria o id do mesmo jeito.
- Varredura da classe "distribuir camadas desenhadas contando bloco que a
  conversão omitiu": era o único ponto. `vincularExtras` (blocos `livre`) casa
  por identidade (nome/id/`extra-…`/texto), nunca por contagem;
  `distribuirLinhas` e `blocosParaOCompositor` vão no sentido contrário e já
  pulam bloco sem linhas; `specComACopyDaPagina` mapeia por papel sobre blocos
  de spec (sem vazios); `copy-do-item` preserva o vazio fora do casamento
  posicional.
- Prova no mesmo `recompor-servico-repartido.test.ts`: `validarSpec` aceita →
  persistência (vazio preservado, as duas linhas no preenchido, sem revisão) →
  edição só da manchete → recomposição com UM serviço, slide trocado e capa
  intacta; mais o controle com todos os blocos da função vazios. As duas
  mutações (contagem antiga; vazio nunca disputando) derrubam uma prova cada.

### A voz compacta e a precedência da identidade de TEXTO (PR 7 de "Marca simples, copy melhor", 12/09/2026)

`BrandVoice` (1:1 com o projeto; migration aditiva `20260912180000_brand_voice`)
guarda a voz compacta da marca — `voz` (JSONB, contrato `voz-v1`), `versao`
(cresce a cada gravação), `migradaEm` (quando a voz passou a valer) e
`dnaArquivado` (o snapshot do DNA de texto na migração). Contrato, precedência
e "virar regra" são PUROS em `src/lib/brand/voz.ts`; a única casa com Prisma é
`voz-service.ts`. **Nenhum conteúdo é migrado por esta fundação**: a voz de
cada cliente é escrita e aprovada no PR 13, por manifesto. Prova de integração
no branch de dev: `scripts/validar-voz-compacta.ts` (não toca no Blob).

- **A voz é SÍNTESE, não arquivo**: descrição, tratamento, termos da casa
  (grafia exata), proibições, exemplos aprovados, reescritas antes→depois e as
  REGRAS com `id`, texto, motivo, data, `escopo` (copy · arte · ambas),
  `substitui` e `ativa`. `lerVoz` devolve TODOS os problemas de uma vez (schema
  + coerência: id repetido, `substitui` inexistente, prompt acima de
  `TETO_DO_PROMPT_DA_VOZ` = 4000 caracteres). Voz que passa do teto é recusada
  na gravação — o DNA de 9 mil caracteres é o que ela veio substituir.
- 🔴 **A precedência mora num lugar só** (`precedenciaDaVoz` →
  `BrandContext.voz`, campo OBRIGATÓRIO do loader): `fonte: 'voz'` quando o
  cliente foi MIGRADO (`migradaEm`), `'legado'` (o `toneOfVoice`/`contentRules`
  do DNA) enquanto não migrou — mesmo com voz já gravada, que é a prévia e
  aparece como `vozPendente` —, `'nenhuma'` sem os dois. Voz migrada que não
  passa mais no contrato NÃO derruba a copy: cai no legado com `vozPendente`.
- 🔴 **Consumidor de identidade de TEXTO lê `brand.voz.texto` e
  `brand.voz.regrasDaMarca`, nunca `dna.toneOfVoice`/`dna.contentRules`
  direto**: chat, `generate-ai-text`, dica de copy, resposta a avaliação,
  revisão ortográfica e crivo já passaram. Os prompts de IMAGEM continuam
  lendo `contentRules` do DNA (proibição não é estilo) e SOMAM
  `brand.voz.regrasDeArte` — as regras de escopo `arte`/`ambas` nascidas na
  voz, que o DNA não tem. `toneOfVoice` segue fora de prompt de imagem.
- **`virar-regra` no cliente MIGRADO**: regra de TEXTO (sem `secao`, ou em
  `toneOfVoice`/`contentRules`) vai para a VOZ, com escopo, motivo e data;
  fala do mesmo assunto de uma regra ativa → a tool RECUSA com
  `CONFLITO_DE_REGRA` e lista as regras; a pessoa decide `substitui` (a antiga
  fica INATIVA, no histórico, fora do prompt) ou `conviver: true`. As seções
  de ARTE do DNA (composition, visualStyle, photoDirection, approvalChecklist)
  continuam no DNA. No cliente NÃO migrado o caminho é o de sempre
  (acrescenta a linha à seção) e a resposta traz `conflitos`, as linhas da
  seção sobre o mesmo assunto — em prosa não há substituição mecânica, e o
  aviso é o que a migração vem resolver. Nada grava sem `confirmado`.
- 🔴 **"Mesmo assunto" se mede com palavras de conteúdo e FRASES CITADAS**
  (`semelhancaDeRegras`, `LIMIAR_DE_CONFLITO` = 0,4): a lista de palavras
  vazias sai, e a frase entre aspas em comum ("Vem pro fogo") vale conflito
  sozinha — só por palavras, a regra que LIBERA a frase que outra PROÍBE dava
  0,2 e passava sem aviso. Escopo `arte` não conflita com `copy`; `ambas`
  cruza com tudo.
- **Escrita com compare-and-set na `versao`**: `gravarVoz` cria na primeira
  vez; depois exige a versão lida (`VOZ_VERSAO_OBRIGATORIA`, 400) e recusa a
  que mudou (`VOZ_DIVERGENTE`, 409); voz inválida nunca é gravada
  (`VOZ_INVALIDA`, 400, com os problemas). `migrarParaVoz` arquiva o DNA de
  texto e liga a precedência; `desfazerMigracao` só a desliga — voz e snapshot
  ficam. A gravação da regra pela tool passa pelo mesmo CAS.
- **A PRÉVIA passa pelo contrato inteiro** (`aplicarRegraNaVoz` valida a voz
  resultante com `lerVoz`): regra comprida, a 61ª regra ou o prompt acima do
  teto são recusados ANTES de a pessoa confirmar (`VOZ_RESULTANTE_INVALIDA`) —
  o que não pode ser gravado não pode ser proposto.
- 🔴 **Confirmar exige a versão da PRÉVIA** (`versaoDaVoz` = a `versaoLida`
  que a proposta devolveu; sem ela `VOZ_VERSAO_OBRIGATORIA`, com a versão de
  uma proposta antiga `VOZ_DIVERGENTE`): entre a prévia e a confirmação outra
  edição pode ter trocado a regra que seria substituída mantendo o id, e o CAS
  da gravação sozinho protegia só a janela da própria requisição.
- 🔴 **O vocabulário da revisão ortográfica vem de `brand.voz.vocabulario`**,
  nunca de `voz.texto`: o texto do prompt carrega o "antes" das reescritas
  ("churasco → churrasco") para o modelo NÃO repetir o erro, e posto no
  vocabulário ele PROTEGIA a grafia errada e engolia a sugestão certa. Só os
  campos positivos (descrição, tratamento, termos, exemplos, "depois") são
  grafia aprovada; no legado, o `toneOfVoice`.
- **`prepareCreative` (escolher-modelo, `create-arte-rapida`, a API externa)
  entrega a identidade de texto EFETIVA**: `brand.dna.toneOfVoice` é o texto
  da voz no cliente migrado (e `contentRules` fica null — as regras já estão
  nele), o DNA no legado; `brand.voz` traz a precedência inteira. Consumidor
  que monte identidade de texto por `select` próprio de `brandDNA` repete o
  defeito — passe pela precedência.
- **No conector**: `consultar-voz` (só leitura) diz QUEM manda na copy hoje,
  a voz, a versão, os problemas e os caracteres no prompt contra os do DNA;
  `virar-regra` ganhou `escopo`, `substitui` e `conviver`; as instruções
  mandam ler a voz antes da primeira copy no cliente migrado. Fixtures do
  registro atualizados no mesmo commit.
- ⚠️ **A migration está aplicada só no branch de dev** — em produção é
  escrita à mão + `db:deploy` com o OK do Ciro. O loader seleciona
  `brandVoice` em todo projeto: código sem a tabela FALHA em toda leitura de
  identidade — não subir o código antes do schema.
- 🔴 **A confirmação do "virar regra" não troca de destino no meio do
  caminho** (PR7-FINAL-01 da revisão final do Codex, 18/09/2026). `versaoDaVoz`,
  `substitui` e `conviver` só existem numa proposta da VOZ: chegando ao ramo do
  DNA (migração desfeita entre a prévia e a confirmação), a confirmação é
  RECUSADA com `REGRA_DESTINO_MUDOU` (409) — acrescentar ao DNA seria outra
  operação que a aprovada, e a proibição antiga continuaria. A mudança DURANTE a
  requisição também é travada nos dois sentidos: a gravação na voz exige
  `migradaEm` no MESMO `updateMany` do CAS (`gravarVoz({ exigirMigrada })`), e a
  gravação no DNA de texto trava e relê `migradaEm` na mesma transação da
  escrita (`updateBrandDNA(…, tx)`).
- 🔴 **A trava é a linha do `Project`, nunca a de `BrandVoice`** (PR7-R9-01/02
  da revisão final, 20/09/2026). `SELECT … FOR UPDATE` numa linha que pode NÃO
  EXISTIR não trava nada: no cliente sem voz a consulta voltava vazia, outra
  execução criava a voz e concluía `migrarParaVoz`, e a confirmação seguia e
  gravava no DNA que já tinha deixado de governar a copy. `travarProjeto`
  (`voz-service.ts`) trava o `Project` — que existe sempre, é o alvo da FK dos
  dois lados — e a confirmação do DNA e `migrarParaVoz` tomam a MESMA trava,
  relendo o estado dentro dela. Trava que não travou nada (projeto inexistente)
  RECUSA com `PROJECT_NOT_FOUND` em vez de seguir. Pelo mesmo motivo
  `migrarParaVoz` virou transação e lê o snapshot do DNA DEPOIS da trava: lido
  antes, o `dnaArquivado` guardava um DNA que uma confirmação em curso ainda ia
  alterar. **Serializou escrita por uma linha? Confira se ela existe sempre.**
  O teste que prova isto começa SEM voz (`voz-trava-do-projeto.test.ts`, com
  trava de verdade no banco em memória): os testes de destino sempre
  inicializam uma voz, inclusive o controle legado, e foi por isso que o
  defeito passou.
- 🔴 **Voz compacta VALIDADA entra INTEIRA em prompt de orçamento curto**
  (PR7-FINAL-02): `textoDaVozParaPrompt(voz, teto)` corta só o LEGADO. O
  contrato já limita a voz a 4.000 caracteres e as regras recentes moram no FIM
  — `tom.slice(0, 1200)` nos rascunhos de avaliação/comentário (e na revisão
  ortográfica) apagava justamente elas. Consumidor novo com teto próprio usa o
  helper, nunca `slice` direto em `voz.texto`.
- 🔴 **O molde da porta leva `voz.regrasDeArte`** (PR7-FINAL-03): o fallback do
  diretor de arte (`prompt-do-manual` / `prompt-da-referencia`) não lia as
  regras de arte da voz — só `buildArtePrompt` lia —, e a regra sumia
  justamente quando o diretor estava fora. O corpo do molde mora em
  `corpoDoMoldeDaPorta` (`contexto-visual-da-geracao.ts`, puro, testado); a
  copy exata continua sendo a última seção. Prompt de imagem novo que leia
  `dna.contentRules` precisa ler `voz.regrasDeArte` junto.
- **O cleanup da prova da voz restaura o BrandDNA pelo SNAPSHOT inteiro**
  (`scripts/lib/restaurar-dna.ts`, nota PR7-F-01): linha ausente é recriada
  (mesmo id), a presente volta campo a campo, e a conferência cobre todos os
  campos menos `updatedAt`.

### A aba Marca em três áreas (PR 14 de "Marca simples, copy melhor", 12/09/2026)

A aba Marca (`?tab=assets`) deixou de ser a pilha DNA → pilares → prompt de
melhoria → assets e virou TRÊS áreas (plano §8): **Como a marca fala** (a voz
compacta do PR 7, editável), **Identidade visual** (as assinaturas com atalho ao
editor + logo, cores, fontes e elementos) e **Fatos da casa** (o RESUMO da base,
com atalhos — nunca uma cópia). Serviço em `src/lib/brand/aba-marca.ts` (a
única casa com Prisma), rotas finas `GET|PUT /api/projects/[id]/voz`,
`GET …/fatos`, `GET …/assinatura`, hooks em `src/hooks/use-aba-marca.ts`,
formulário PURO em `src/lib/brand/voz-formulario.ts` (com teste de ida e volta
exata). Prova no branch de dev: `scripts/validar-aba-marca.ts`.

- **O que SAIU da aba e para onde foi**: pilares de conteúdo → bancada
  (planejamento, recolhidos em "Planejamento · pilares"); composição, estilo
  visual, direção fotográfica e o prompt de melhoria → Configurações,
  recolhidos em "Avançado · direção de arte"; crivo de aprovação →
  Configurações, "Arquivo · crivo". `BrandDnaSection` virou parametrizável
  (`secoes`, `titulo`, `descricao`, `mostrarPrevia`, `somenteLeitura`) e é a
  MESMA nas quatro casas — não duplique o editor de DNA.
- 🔴 **A tela grava a voz com a versão que LEU** (`PUT` com `versaoEsperada`;
  `gravarVoz` faz o CAS): a versão velha volta `VOZ_DIVERGENTE` 409 e a tela
  recarrega e pede para refazer por cima; sem versão com voz existente é
  `VOZ_VERSAO_OBRIGATORIA`. Voz que não passa no contrato é recusada ANTES de
  escrever (`VOZ_INVALIDA`, com TODOS os problemas) — e o formulário mostra os
  problemas em tempo real (`lerVoz` sobre o formulário) antes de deixar salvar.
- 🔴 **Gravar a voz NÃO muda quem manda na copy.** A precedência é a de sempre
  (`precedenciaDaVoz`): o topo da área diz "manda na copy" (migrado), "prévia —
  o DNA legado ainda manda" (voz gravada, cliente não migrado) ou "sem voz
  ainda". Migrar é o manifesto do PR 13, decisão do Ciro por cliente. O DNA de
  texto continua editável na própria área, recolhido, enquanto o cliente não
  migrou (é o que a copy lê hoje); migrado, aparece só para leitura
  ("arquivado").
- **A consulta seguinte do CONECTOR traz a alteração da tela**: `consultar-voz`
  e o loader único leem `BrandVoice` sem cache — a prova grava pela camada da
  tela e confere versão e conteúdo em `consultar-voz` e `vozPendente` no
  `loadBrandContext`. Editar a voz e mandar o DNA inteiro para o modelo era o
  defeito que o plano queria evitar.
- **Regra recente com SUBSTITUIÇÃO no formulário** (`substituirRegraNoFormulario`):
  a antiga fica inativa (histórico, recolhido), a nova nasce com `substitui` e
  id novo — a mesma semântica de `aplicarRegraNaVoz`, sem o detector de
  conflito, porque a pessoa está decidindo à vista. `vozParaPrompt` só carrega
  as ativas. 🔴 **Regra SUBSTITUÍDA não se reativa** (`podeReativar`, PR14-03):
  com a substituta apontando para ela, o contrato recusa a voz ("a substituída
  continua ativa") e a tela oferecia uma operação que não podia ser salva;
  voltar ao texto antigo é uma NOVA substituição da regra atual (o histórico
  fica) — da regra que vale HOJE (`sucessoraAtiva`: a cadeia A → B → C pode
  ter mais de um elo, PR14-06). Só regra apenas desativada volta com
  "reativar". Regra ainda NÃO gravada (não está na base lida) e sem referência
  pode ser REMOVIDA da lista (`podeRemoverRegra`, PR14-05): sem isso a regra
  em branco que a pessoa abandonou travava o Salvar do resto da edição — o
  contrato exige texto e motivo também nas inativas. Regra gravada é
  histórico: desativa, nunca some.
- 🔴 **Listas e reescritas são campos ESTRUTURADOS, um item por campo — nunca
  texto serializado por delimitador** (PR14-01): "uma reescrita por linha,
  `antes → depois — motivo`" partia um `depois` com travessão, juntava exemplos
  com quebra interna e tirava um marcador literal "- ", e campos que a pessoa
  NÃO editou saíam mudados ao salvar. O valor de cada item viaja literal; só o
  espaço das pontas sai. A prova grava travessão, seta, marcador e quebra pela
  camada da tela e confere que o conector devolve byte a byte, e que editar só
  a descrição deixa o resto idêntico.
- 🔴 **O que chega do servidor NUNCA apaga edição local não salva** (PR14-02):
  a resposta só substitui o formulário quando ele não tem mudança pendente;
  quando o nosso salvamento chegou e a pessoa já digitou mais, a base avança e
  o rascunho fica; quando outra pessoa salvou por baixo, a tela avisa e a pessoa
  decide recarregar (o CAS recusa a gravação até lá). A releitura é AGUARDADA
  dentro da mutação e os campos ficam desabilitados durante o ciclo inteiro.
- 🔴 **Campo cujo contrato aceita quebra de linha é multilinha na tela**
  (PR14-08): `<input>` de texto DESCARTA a quebra preexistente ao editar —
  tratamento, motivo da regra e motivo da reescrita são `Textarea` de uma
  linha; a conversão pura preservava e o controle não.
- **A leitura que confirmou AUSÊNCIA de voz grava com `versaoEsperada: 0`**
  (PR14-09; o serviço aceita 0 como "esperava nenhuma"): se outra pessoa
  criou a v1 no meio, o conflito volta como `VOZ_DIVERGENTE` e cai no caminho
  tratado (aviso + carregar a versão atual); com `null` vinha
  `VOZ_VERSAO_OBRIGATORIA` sem saída, e a tela repetia a falha a cada clique.
  `VOZ_VERSAO_OBRIGATORIA` também é tratado como divergência.
- **A substituição de regra em andamento é RASCUNHO fora do formulário e conta
  como edição local** (PR14-12): a releitura não a apaga; se a regra deixou de
  estar ativa por baixo, o texto reaparece num painel próprio (virar regra nova
  ou descartar). **`id`, `substitui` e `em` viajam literais** (PR14-13): o
  contrato aceita id com espaço nas pontas, e aparar o id sem aparar a
  referência quebrava o vínculo — a voz não salvava mais nem uma edição só na
  descrição.
- **Seção recolhível NÃO desmonta o que já abriu** (PR14-10, `Secao` de
  "Avançado · direção de arte"; PR14-11, o DNA legado recolhido em "Como a
  marca fala"): os editores movidos guardam rascunho em
  estado local, e `{aberto && children}` descartava a edição ao recolher;
  `forceMount` + `hidden`, montando na primeira abertura.
  **E a releitura que FALHA com dados já carregados não troca a árvore pelo
  cartão de erro** (PR14-14): salvar a voz invalida a consulta, e um GET que
  falha depois disso punha `isError` verdadeiro — o retorno exclusivo de erro
  desmontava o `BrandDnaSection` e o rascunho de Tom de voz e Regras que a
  pessoa estava escrevendo no DNA legado sumia; "Tentar de novo" voltava com
  os valores do servidor. O cartão exclusivo é só da carga inicial sem dado;
  com dado, a falha vira aviso acima do conteúdo, e tudo continua montado.
- 🔴 **A resposta CONFIRMADA de uma gravação vira o dado da consulta ANTES da
  releitura** (PR14-15 da revisão final do Codex, 18/09/2026). O PUT da voz
  devolve a leitura depois da escrita (versão nova incluída), e o hook a
  descartava: a tela só reconciliava pelo GET da invalidação. Com esse GET
  falhando, `base` e `versaoLida` ficavam na versão anterior, a edição
  seguinte ia com a versão velha e tomava `VOZ_DIVERGENTE` de um salvamento que
  era dela — e, quando a releitura enfim chegava, o próprio salvamento era lido
  como mudança de terceiros e a saída oferecida era descartar o rascunho. Hoje
  `gravacaoDaVozDaMarca` põe a resposta no cache (`setQueryData`) e só então
  relê; a reconciliação mora em `reconciliarComServidor` (puro, em
  `voz-formulario.ts`), a mesma para a releitura e para a resposta.
  🔴 **O mesmo defeito, pior, estava no `BrandDnaSection`** (varredura por
  classe): o `onSuccess` do PATCH invalidava SEM aguardar e reiniciava os campos
  (`setCarregado(false)`) na mesma hora — do cache ANTERIOR à gravação, mesmo
  com a releitura dando certo. O texto salvo voltava ao antigo na tela, com o
  Salvar aceso para regravá-lo por cima; o componente está nas três casas do DNA
  que o PR 14 criou (DNA legado, DNA visual, crivo). Hoje
  `confirmarGravacaoDoDna` põe no cache as seções do patch com o valor que o
  servidor confirmou (só elas: a resposta traz a linha crua, e o `visualStyle`
  da consulta pode vir do `brandStyleDescription` legado), AGUARDA a releitura,
  e só então os campos reiniciam. Regra para tela nova: gravação confirmada
  nunca pode depender da releitura para a tela saber o que foi gravado.
  Provas em `src/hooks/__tests__/use-aba-marca.test.ts` (QueryClient de
  verdade, as opções do próprio hook, servidor em memória no `fetch` fazendo o
  CAS) e em `voz-formulario.test.ts`. A amarração do efeito `[data]` e o
  `setCarregado(false)` depois do `await` ficam por inspeção.
- 🔴 **A releitura de CONVENIÊNCIA nunca decide se a escrita aconteceu**
  (PR14-16 da revisão FINAL do Codex, 21/09/2026). É o INVERSO do PR14-15 e da
  família de "o registro afirma mais do que sabe": aqui o sistema NEGA o que já
  fez. `salvarVozDaMarca` gravava com `gravarVoz` — escrita CONFIRMADA, versão
  já avançada — e só então chamava `lerVozDaMarca` para montar a resposta;
  falhando essa leitura, o serviço lançava DEPOIS da escrita e a rota devolvia
  500. A cascata: a tela dizia "erro ao salvar", não aplicava a versão nova ao
  cache, limpava o `enviadoRef`, e a tentativa seguinte ia com a versão velha e
  tomava `VOZ_DIVERGENTE` **do próprio salvamento** — com a recuperação
  oferecendo descartar o rascunho. Em cliente migrado, a voz já mandava na copy
  enquanto a tela dizia que falhou. Hoje a resposta é
  `{ gravada: RECIBO, leitura: VozDaMarca | null, leituraFalhou? }`: o recibo
  (versão, `criada` e a VOZ gravada) sai sempre; a releitura é separada e pode
  faltar.
  🔴 **A forma nested é o conserto, não estilo.** Devolver `registro: null` na
  falha seria pior que o 500: `registroParaFormulario(null)` é versão 0 com
  formulário VAZIO, e sem edição local a tela adotaria isso — apagando na tela
  a voz que o servidor acabou de aceitar. **"Não consegui reler" nunca pode ser
  lido como "não há voz".**
  O hook aplica o recibo ao que a consulta JÁ tinha (`registroComRecibo`, puro
  em `voz-formulario.ts`): versão e conteúdo do recibo, `migradaEm` e
  `dnaArquivado` do cache (a gravação não os toca — `gravarVoz` escreve `voz` e
  `versao`, e só), `problemas: []` (só se grava voz que passou no contrato).
  `contexto` e `legado` ficam como estavam: quem manda na copy não muda ao
  gravar, e a invalidação os atualiza quando a leitura voltar. A tela diz que
  salvou E que não conseguiu reler o resto.
  **Varredura da mesma forma nos outros caminhos desta tela e da rota da voz**:
  `PATCH /brand-dna` → `updateBrandDNA` devolve a linha do próprio `upsert`, sem
  leitura posterior; `virarRegraNaVoz` monta `antes`/`depois` do que já tem em
  memória (`registro.voz`, `resultado.voz`) e o `gravarVoz` é a última coisa que
  faz; `virarRegra` (DNA) idem, dentro da transação; `fatos` e `assinatura` são
  só leitura. Nenhum outro ponto lê depois de escrever.
  ⚠️ **Onde a leitura posterior é GARANTIA, não conveniência**: dentro de
  `migrarParaVoz`, as leituras do DNA e dos fatos rodam DEPOIS da trava e ANTES
  de ligar a precedência — elas decidem se a escrita acontece, então falhar ali
  tem de abortar mesmo (`VOZ_DNA_DIVERGENTE`, `VOZ_FATOS_DIVERGENTES`). A
  distinção é a posição: leitura que ANTECEDE a escrita pode derrubá-la; leitura
  que a SUCEDE, nunca.
  Provas: `src/lib/brand/__tests__/aba-marca-recibo.test.ts` (o serviço com os
  dois braços da releitura falhando, mais os controles de `VOZ_INVALIDA` e do
  CAS, que continuam lançando porque a escrita NÃO aconteceu),
  `use-aba-marca.test.ts` (a releitura interna do PUT e o GET falhando juntos:
  a v2 é reconhecida, o rascunho digitado em seguida fica e a edição seguinte
  vai com `versaoEsperada: 2`; e a PRIMEIRA gravação, que sem o recibo deixaria
  a tela na versão 0) e `voz-formulario.test.ts` (`registroComRecibo`). 5
  mutações pegas: tirar o try/catch (2), ignorar o recibo no hook (2), registro
  sem a voz gravada (4), perder `migradaEm`/`dnaArquivado` (1), versão que não
  avança (3).
- **Erro de leitura é erro, não carregamento eterno nem "base vazia"** (PR14-04):
  as três áreas distinguem erro (mensagem + tentar de novo), carregando e
  resultado vazio — "este cliente não tem página de assinatura" só é dito com a
  consulta respondida.
- **Os atalhos de categoria de "Fatos da casa" FILTRAM a base** (`/knowledge?projectId=&category=`, PR14-07): a página lia só `projectId` e todo atalho abria a listagem geral; valor fora do vocabulário é ignorado, e o filtro aparece como chip que se tira.
- **"Fatos da casa" é contagem e prazo, nunca conteúdo** (`resumoDosFatos`:
  `groupBy` por categoria das ACTIVE, o que vence em 14 dias e o que já venceu e
  o cron ainda não arquivou, atalhos para `/projects/[id]/base` e `/knowledge`).
  A prova confere que a resposta não carrega nenhum `content`.
- **As assinaturas listadas são as páginas do template "Assinatura"**
  (`paginasDeAssinatura`, a mesma leitura de `ver-assinatura`), com a miniatura
  só quando ela é publicável — `Page.thumbnail` vira `data:` assim que a página
  é aberta no editor e fica de fora — e o `editorUrl` com o `pageId`.
- ⚠️ **A aba nova não tem teste de UI** (o vitest é só node; os Playwright de
  `tests/e2e/` não a cobrem): a prova cobre a camada que a tela chama e o
  conector; a tela em si é o critério do Ciro (uma edição feita por ele, plano
  §11). O `prisma/generated` deste worktree é
  GERADO LOCALMENTE (não o symlink para o repo principal): o schema daqui tem
  `BrandVoice` e `copyAutoral` (PRs 7 e 3), e o client do repo principal não.

### A migração da voz, por manifesto (PR 13 de "Marca simples, copy melhor", 12/09/2026)

A troca do DNA de texto (5–12 mil caracteres por cliente) pela voz compacta
do PR 7 é decisão do Ciro, cliente a cliente, sobre uma PRÉVIA que ele viu.
Contrato PURO em `src/lib/brand/migracao-da-voz.ts` (com teste); as dez vozes
propostas em `scripts/lib/vozes-propostas.ts`; o script em
`scripts/migrar-voz-da-marca.ts` (dry-run por padrão; `--aplicar --manifesto`
escreve; `--dev` para o branch; em produção exige `--producao`). Prova de
integração no branch de dev: `scripts/validar-migracao-da-voz.ts` (projeto 6;
o registrador de fatos é um stub — `criarEntradaBase` indexa no vetor de
produção). **Nenhum cliente foi migrado**: as prévias reais estão em
`~/Documents/Studio-Lagosta-execucao/marca-e-copy/PR-13/previa-producao/`
com o manifesto em branco, à espera das decisões.

- **A prévia tem VERSÃO de conteúdo** (`versaoDaPrevia`: hash estável do DNA
  de texto + da voz proposta). O manifesto cita a versão aprovada e a
  aplicação BLOQUEIA quando ela mudou por baixo (DNA editado, voz retocada) —
  prévia refeita pede aprovação nova. Nada é adaptado por quem aplica.
- 🔴 **O manifesto é FECHADO e silêncio não é aprovação**: todo cliente é
  `migrar`, `manter-legado` ou `pendente`; `migrar` e `manter-legado` exigem
  `aprovadoPor` + `aprovadoEm`; `lerManifesto` devolve TODOS os problemas.
  `pendente` e `manter-legado` não escrevem nada; cliente já migrado é
  `ja-migrado`.
- 🔴 **Fato vai para a BASE, nunca para a voz.** `fatosNoDna` lista as frases
  do DNA com preço, horário, data ou promoção; só entra na base o que o
  manifesto listar POR EXTENSO (trecho exato da prévia + categoria + título +
  validade), e trecho que a prévia não lista bloqueia. `fatosNaVoz` tem de dar
  VAZIO na voz proposta (é problema, não aviso). Em PROIBIÇÃO e REGRA a palavra
  nua "promoção"/"desconto"/"grátis" é vocabulário proibido, não dado;
  percentual e "leve X pague Y" são dado em qualquer campo; o motivo da regra
  só é lido para preço e horário (ele carrega a data em que a regra nasceu).
  🔴 O rodapé "(AAAA-MM-DD — motivo)" de uma regra aprendida é METADADO e sai
  antes da leitura — lido como frase, toda regra legada virava "fato de data".
- **Cobertura das "Regras aprendidas na prática" é APROXIMAÇÃO declarada**
  (`semelhancaDeRegras` ≥ `LIMIAR_DE_CONFLITO`, o mesmo detector de conflito
  da voz): a prévia diz qual regra/proibição/reescrita da voz fala do mesmo
  assunto e marca o que ficou "sem correspondente" — para a pessoa ver, nunca
  para decidir sozinha.
- **Aplicar**: fatos ANTES da voz (um fato perdido depois de a voz assumir é
  pior que um fato duplicado do DNA), `gravarVoz` com a versão lida (CAS),
  `migrarParaVoz` amarrada a essa versão; erro por cliente volta no resultado,
  sem derrubar os outros. `CATEGORIAS_DE_FATO` é subconjunto de
  `CATEGORIAS_DA_BASE` sem `TOM_DE_VOZ` (identidade nunca volta para a base).
- **A prévia sai de produção ANTES da migration do PR 7 chegar lá**: o script
  tolera a tabela `BrandVoice` ausente (P2021 → sem registro, com aviso); a
  aplicação nesse banco falha em `gravarVoz`, por cliente. A migration entra
  por `db:deploy` com o OK do Ciro — nunca antes do código do PR 7 e nunca o
  código antes do schema.

Da revisão FINAL do Codex sobre o rebase na main de 21/09 (BLOQUEADO, PR13-51,
PR13-52) — as duas com a mesma forma de fundo: **um sinal de exclusão que não
cobre a janela inteira**:

- 🔴 **ESPERAR POR UMA TRAVA NÃO RENOVA O SNAPSHOT.** Em REPEATABLE READ e em
  SERIALIZABLE o snapshot é congelado no PRIMEIRO comando da transação — que num
  protocolo "trava primeiro, lê depois" é o próprio `SELECT … FOR UPDATE`. A
  transação dorme na trava e acorda com ela na mão e o mundo de ANTES nos olhos.
  Foi o que reabriu o PR7-R9-02 quando `migrarParaVoz` ganhou
  `isolationLevel: Serializable` no rebase: `virarRegra` commitava a regra no
  DNA, a migração pegava a trava logo depois e arquivava o DNA VELHO, ativando a
  voz sem enxergar a regra — e como `virarRegra` só BLOQUEIA a linha de
  `Project` (não a atualiza) e não pede serializável, não há erro de atualização
  concorrente para avisar. **O protocolo do PR 7 exige READ COMMITTED**, onde
  cada comando depois da trava tira snapshot novo. Medido no Postgres de dev, a
  mesma intercalação: READ COMMITTED enxerga a regra, SERIALIZABLE não.
  🔴 **E o serializável não substitui a conferência explícita**: ele estava ali
  para pegar quem NÃO toma a trava (`updateBrandDNA` direto, da aba Marca) e
  **não pega** — medido no mesmo banco, a edição solta commita no meio e a
  transação serializável segue e commita, porque um upsert que não LÊ nada não
  fecha ciclo para o SSI. Quem protege é o `dnaEsperado`. Nível de isolamento
  não é trava, e trava não é conferência: se o valor importa, releia-o e
  compare-o sob a trava. A prova é o passo 6v de `validar-migracao-da-voz.ts`,
  com duas conexões reais e a barreira dada pelo BANCO (`pg_blocking_pids`
  confirmando o bloqueio antes de a regra ser commitada) — dublê de teste
  serializa chamadas e **não reproduz snapshot MVCC**.
- 🔴 **`Promise.all` rejeita no PRIMEIRO erro e deixa os outros EM VOO.** Quando
  o que vem depois é soltar uma exclusão, a rejeição não significa que o
  trabalho acabou: em `reindexEntry` um `create` de chunk falhando com erro
  COMUM não marcava `emVoo` (nada foi abortado), o `finally` LIBERAVA o
  arrendamento, e outra execução podia reconstruir a entrada enquanto um insert
  antigo — que não confere o token do ciclo — ainda chegava, deixando chunk
  velho ou estourando a unicidade de `vectorId`. `Promise.allSettled` espera
  TODOS encerrarem e só então propaga a falha. O teto por TEMPO continua sendo
  quem cobre o que trava de vez (`passoArrendado` marca `emVoo` e não libera).
  Vale para qualquer lote de escritas sob arrendamento, trava ou transação.

Da revisão do Codex sobre o primeiro commit (BLOQUEADO, PR13-01…08, 12/09/2026):

- 🔴 **`--dev` trocava só o SQL; o índice de vetores continuava o de PRODUÇÃO**
  (`criarEntradaBase` indexa em `UPSTASH_VECTOR_*`, que vem do `.env`). Hoje
  `resolverBanco` devolve o `destino` (banco + `indexador`: `isolado` só quando
  o `.env.development.local` declara URL e token PRÓPRIOS e a URL é outra;
  `producao`; `ausente`), e `aplicarManifesto` sem registrador injetado BLOQUEIA
  o cliente antes de qualquer escrita quando o indexador não é o do banco
  (`podeIndexar`). Em dev o processo fica SEM `UPSTASH_VECTOR_*` a menos que
  seja isolado. A prova chama o caminho real e confere o bloqueio (PR13-01).
- 🔴 **A ativação confere o DNA na MESMA transação em que liga a precedência**
  (`migrarParaVoz({ dnaEsperado })`, serializável): DNA que mudou entre a
  leitura da prévia e a ativação recusa com `VOZ_DNA_DIVERGENTE` (409), a voz
  fica gravada e NÃO migrada, o legado segue mandando. O `dnaArquivado` é
  exatamente o DNA comparado. Uma edição do DNA que commite depois é, na ordem
  serial, posterior à migração — o mesmo que editar a aba Marca com a voz já
  valendo. Costura `seams.antesDeAtivar` só para a prova (PR13-02).
- 🔴 **Todo fato criado pela migração carrega `metadata.chaveDoFato`**
  (`sha1(projectId|versaoDaPrevia|trecho)`), e `aplicarManifesto` pula o que já
  existe (`fatoJaExiste`, padrão por consulta ao `metadata`): retomar depois de
  uma falha parcial (registrador quebrou no 2º fato, CAS perdido) cria só o que
  falta. O resultado traz `fatosCriados`/`fatosJaExistentes` também no `erro`
  (PR13-03). Reaplicar a mesma prévia depois de `desfazerMigracao` NÃO recria
  fato — é a base datada por prévia, não pelo manifesto.
- **A prévia carrega o `toneOfVoice` e o `contentRules` INTEGRAIS** (`antes`),
  e o markdown os reproduz verbatim em blocos de código: vocabulário, exemplos
  e instruções fora das seções reconhecidas só são revisáveis com o texto
  inteiro ao lado (PR13-05).
- 🔴 **O marcador de lista sai; o número que é conteúdo FICA.** A expressão
  antiga (`^\s*[-*•\d.)]+`) comia "20" de "20% de desconto" e "10" de "10h às
  22h" — o trecho mutilado ia para a prévia como "exato". Hoje só `-`, `*`, `•`
  e `1.`/`1)` com espaço depois (PR13-06). E o rodapé `(data — motivo)` sai POR
  LINHA, antes da divisão em frases, com captura gulosa até o último parêntese
  (motivo com duas frases, aspas e parênteses internos — os três formatos reais
  do Espeto viravam "fato de data" mesmo depois do primeiro conserto, PR13-08).
- 🔴 **Condição operacional é fato, e voz com fato NÃO migra.** `fatosNaVoz`
  passou a pegar a mecânica ("em dobro", "leve X pague Y"), a janela de dias
  ("de segunda a quinta") e o período ("no jantar") em copy e regras — não no
  motivo (história) nem nos TERMOS ("happy em dobro" é o NOME da mecânica, não a
  promessa). `problemasParaMigrar` = problemas do contrato + fatos na voz, e é
  isso que `vozValida` do plano lê: a proposta do TERO perdeu as duas condições
  que carregava (PR13-07). Nunca reintroduza dado numa regra "para explicar".
- **PR13-04 (a regra de 04/09 do Espeto), respondido sem mudar a proposta**: a
  regra que o plano substituiu em 11/09 é "não adicione campos; a copy é feita
  em cima dos campos do template" (compositor); a `regra-2026-09-04-1` da voz é
  a LEITURA CONTÍNUA entre pré-título, manchete e apoio (feedback do Ciro em
  03/09), que o próprio plano formaliza como "grupo de leitura" no PR 1. Ela
  fica ativa; o motivo diz a diferença, e há teste que recusa uma regra ativa
  de "campos do template" na proposta do Espeto.

Da segunda revisão (BLOQUEADO, PR13-09…12, complementos dos anteriores):

- 🔴 **O indexador é ATRIBUÍDO, nunca herdado do ambiente.** `resolverBanco`
  escreve `UPSTASH_VECTOR_*` no `process.env` nos dois modos (produção: o do
  `.env`, por cima do que o processo trouxe; dev: só o isolado, senão apaga),
  guarda a URL validada em `destino.indexadorUrl`, e `podeIndexar` confere na
  hora de aplicar que a URL em uso pelo processo é a validada — um
  `UPSTASH_VECTOR_*` exportado antes mandaria os vetores para outro índice
  com o SQL em produção (PR13-09).
- 🔴 **Uma aplicação por projeto de cada vez**: `aplicarManifesto` toma
  `pg_try_advisory_xact_lock(hashtext('migracao-da-voz:<projectId>'))` numa
  transação que dura até a ativação; quem não consegue é `bloqueado` na hora
  ("trava por projeto"), sem esperar. A chave do fato vive em JSON, sem
  unicidade — duas aplicações simultâneas liam "ausente" as duas e criavam o
  fato e os vetores duas vezes (PR13-10). Os serviços de voz e da base
  escrevem por outras conexões; a transação só segura a exclusão.
- 🔴 **A linha existir não prova o vetor.** `criarEntradaBase` grava a linha e
  indexa depois; interrompido no meio, sobra linha sem vetor. Por isso o fato
  só é `completo` com `metadata.indexadoEm`, gravado DEPOIS de indexar
  (`marcarFatoIndexado`); `estadoDoFato` distingue `ausente` / `incompleto` /
  `completo`, e o incompleto é REINDEXADO pelo mesmo id (`reindexEntry`, que
  apaga chunks e vetores antigos antes de refazer) antes de a voz ser ativada
  (PR13-11). `fatosReindexados` sai no resultado.
- **Condição operacional é fato do DNA também**: `fatosNoDna` usa os MESMOS
  detectores da voz (`dadosProibidos` + `condicoesOperacionais`), então "chopp
  e drinks selecionados em dobro" e "de segunda a quinta, no jantar" aparecem
  na prévia com tipo `condicao` e podem ser citados no manifesto — o que sai
  da voz por ser condição precisa ter porta de entrada na base (PR13-12).

Da terceira revisão (BLOQUEADO, PR13-13…15):

- 🔴 **A trava só vale no MESMO banco das escritas.** `resolverBanco` nunca
  preserva `DIRECT_URL` de outro ambiente (em dev, sem ela no arquivo vale a
  própria `DATABASE_URL` do dev) e aborta se `DIRECT_URL` e `DATABASE_URL`
  forem computes diferentes; `travaPorProjeto` confere `mesmoBanco` antes de
  conectar — trava em outro compute não exclui ninguém (PR13-13).
- 🔴 **A linha com a chave só é reutilizada se ainda for o fato APROVADO**
  (`divergenciasDoFato`: conteúdo, categoria, `ACTIVE`, validade em Brasília).
  Editada ou arquivada, a aplicação BLOQUEIA para decisão antes de qualquer
  escrita — nem reutiliza, nem reindexa por cima (PR13-14). A conferência é
  uma 1ª passada sem escritas; a 2ª passada escreve.
- 🔴 **Toda escrita do corpo confere que a trava continua viva**
  (`trava.conferir()` = `SELECT 1` na transação da trava, antes de cada fato,
  do `gravarVoz` e da ativação): transação expirada lança e a aplicação para
  ali, em vez de continuar por outras conexões sem exclusão (PR13-15). O
  timeout padrão é 60 min; a prova o encurta para 2 s.

Da quarta revisão (BLOQUEADO, PR13-16…18):

- 🔴 **"Mesmo banco" é mesmo compute E mesmo nome de banco** (`nomeDoBancoDe`):
  advisory lock é por banco, e `/neondb` e `/outro_banco` no mesmo compute
  travam coisas diferentes (PR13-16).
- 🔴 **Trecho repetido em `fatosParaABase` é recusado** por `lerManifesto`
  (com as posições) e, como última porta, por `aplicarManifesto` antes de
  escrever: a mesma identidade de fato duas vezes criava duas linhas numa só
  aplicação, com a trava funcionando (PR13-17).
- 🔴 **A trava virou de SESSÃO, sem timeout** (`pg_try_advisory_lock` numa
  conexão própria com `connection_limit=1`, liberada no fim): transação
  expirando liberava a exclusão com o corpo ainda escrevendo. E toda escrita
  LONGA (criar/reindexar fato, que espera embeddings) roda em `trava.vigiar()`,
  uma corrida com a vigilância da conexão: perdida a trava no meio, a escrita
  é abandonada com erro e nada novo começa (PR13-18). Limite declarado: o
  indexador não recebe sinal de aborto — o que já está em voo termina; o que
  se garante é que a aplicação PARA (nenhum fato seguinte, nenhuma voz).

Da quinta revisão (BLOQUEADO, PR13-19…21):

- 🔴 **A trava de sessão exige conexão DIRETA** (`ehPooler`: `-pooler` no host é
  o PgBouncer em modo transação, que não fixa um backend — duas aplicações
  podiam "reentrar" na mesma trava e o unlock rodar em outro backend). URL do
  pooler para a trava é `bloqueado` antes de escrever (PR13-19). A `DIRECT_URL`
  dos dois arquivos de ambiente é direta.
- 🔴 **Conferir a POSSE, nunca "tentar pegar de novo"**: depois de uma reconexão
  a chave pode estar livre, `pg_try_advisory_lock` devolveria `true` por
  ADQUIRIR uma trava nova e a leitura como reentrância seguiria sem exclusão
  (PR13-21). `conferir` compara o `pg_backend_pid()` com o da sessão que tomou
  a trava e confere em `pg_locks` que ela ainda a detém; sessão trocada ou
  conexão caída invalidam a execução.
- 🔴 **A perda da posse ABORTA as escritas internas, e sem compensar**
  (PR13-20): `trava.vigiar(escrita)` entrega um `AbortSignal`; `criarEntradaBase`
  e `reindexEntry` (`src/lib/knowledge/aborto.ts`, puro) o conferem antes de
  cada etapa — apagar chunks/vetores, gravar chunks depois dos embeddings,
  subir vetores — e, abortada, a criação NÃO apaga a entrada (outra aplicação
  pode ter retomado a mesma linha pela chave do fato; ela fica sem a marca de
  indexado, para ser reindexada pelo mesmo id). A marca de indexado nunca é
  gravada por uma execução que perdeu a posse.
- **A prova derruba a sessão da trava DE VERDADE**: o papel do Neon não tem
  `pg_terminate_backend`, então a costura `aoTravar` entrega um `executar` na
  sessão da trava e a prova manda `SET idle_session_timeout = '200ms'` no meio
  da escrita lenta; o servidor encerra a conexão ociosa antes da conferência
  seguinte (o Prisma NÃO reconecta sozinho — a consulta falha), a escrita
  recebe o aborto e nada é anotado. Trava pelo pooler é coberta na 4b'.

Da sexta revisão (BLOQUEADO, PR13-22…23):

- 🔴 **O sinal é conferido ANTES de cada escrita, inclusive as que vêm depois
  de uma espera**: `reindexEntry` confere de novo depois do `deleteMany` (o
  sinal pode ter disparado enquanto ele esperava) e `deleteVectorsByEntry`
  confere entre a consulta e o `index.delete` — uma execução que perdeu a posse
  não pode apagar vetores que outra aplicação já recuperou (PR13-22). Teste com
  o `Index` do Upstash mockado: aborto durante a consulta, zero deletes.
- 🔴 **A marca de indexado confere o sinal DEPOIS da leitura, antes do
  `update`** (`marcarFatoIndexado(db, id, em, signal)`, PR13-23): a marca
  gravada por quem perdeu a trava faria a retomada ler `completo` uma linha que
  outra aplicação ainda reindexa.

Da sétima revisão (APTO COM NOTAS, PR13-24):

- **Data do manifesto é dia que EXISTE** (`diaExiste`, ida e volta pelo ISO
  em UTC — o mesmo cuidado do PR 6 com `dataValida`): `validaAte` e
  `aprovadoEm` aceitavam "2026-13-01" e "2026-02-29" pela expressão regular, e
  a conversão para `Date` só falhava no script, depois de fatos anteriores já
  gravados. `lerManifesto` recusa antes de qualquer escrita.

Da revisão FINAL do PR (BLOQUEADO, PR13-25…26):

- 🔴 **Disponibilidade, programa fixo do dia e dia fechado são CONDIÇÃO da
  casa, não voz** (PR13-25): "HAPPY HOUR TODO DIA" e "QUINTA É DIA DE VINHO"
  (By Rock), "convidar para segunda-feira (a casa está fechada)" (Empório)
  passavam pelos detectores e entravam no prompt — uma mudança de
  funcionamento na base deixava a identidade contradizendo a base.
  `condicoesOperacionais` pega "todo dia"/"diariamente", "<dia> é dia de X" e
  "a casa está fechada"/"não abre"/"fechado aos domingos" ("lista fechada" e
  "menu fechado" não são dia fechado); as propostas trocaram essas frases por
  editorial que só CITA o dia ("Vem de happy hour", "SEXTA NO QUINTAL",
  "QUARTA NO BOTECO", "CHURRASCO DE VERDADE") ou pela regra sem o dado ("dia
  sem funcionamento: os dias em que a casa recebe vêm da base"); as prévias de
  produção foram regeradas e o fato correspondente do DNA aparece nelas com
  tipo `condicao`. O teste das dez propostas roda o detector novo: proposta
  com condição não passa.
- **A retomada por reindexação invalida o cache de busca do projeto**
  (PR13-26), como a criação normal já fazia: sem isso uma busca cacheada no
  intervalo da falha devolvia o resultado sem o fato até o TTL. Best-effort
  (erro vira log), e só quando a posse da trava continua.

Da segunda revisão FINAL (BLOQUEADO, PR13-27…28):

- 🔴 **Refeição ou período AMARRADOS a um dia também são condição da casa**
  (PR13-27): "sugerir jantar de domingo (a casa fecha cedo); prova social de
  domingo sai com a casa fechada" (Seu Quinto), "domingo nada noturno; segunda
  nada de almoço" (TERO), "programação noturna em domingo e segunda" (Quintal)
  e "programação em domingo" (Empório) passavam pelos detectores de PR13-25 e
  iam para o prompt — uma mudança de funcionamento na base deixava a voz
  contradizendo a base. `condicoesOperacionais` pega `<refeição> de <dia>`,
  `<período> em/aos <dia>`, `<dia> nada/sem <período>`, `programação em <dia>`,
  "fecha cedo" e "casa fechada"; as quatro propostas trocaram a frase pela
  regra sem o dado ("período sem funcionamento — dia e horário vêm da base");
  o dia SOZINHO ("SEXTA NO QUINTAL", "Domingou no boteco") continua editorial.
  O teste roda as quatro frases reais (detectadas no DNA como `condicao`,
  recusadas na voz) e a lista de editoriais que têm de passar. As prévias de
  produção foram regeradas.
- 🔴 **O script de prova só encerra o processo DEPOIS do cleanup** (PR13-28):
  `abortar` era `process.exit(1)`, e chamado depois de apagar a `BrandVoice`
  anterior do projeto 6 (pré-requisito de três fatos, trava da concorrência)
  pulava o `finally` que a restaurava. Hoje todo pré-requisito de banco é
  conferido ANTES da primeira mutação (`sairAntesDeComecar`, que ainda pode
  encerrar porque nada foi tocado), e `abortar` LANÇA `ProvaAbortada` — o
  `finally` restaura voz e DNA, e o `main().catch` encerra com o motivo.

Da terceira revisão FINAL (BLOQUEADO, PR13-29…30):

- 🔴 **DISPONIBILIDADE de item, canal e preparo também é condição da casa**
  (PR13-29): "Assunto exclusivo da Praia do Canto (Semifreddo de Pistache…)"
  (Real), "cervejas além da IPA, bebida sem álcool além do café expresso"
  (Wine Vix), "WhatsApp, link de pedido ou botão de compra: não existem"
  (Real), "encomenda só com garçom ou gerente, sem site ou app; sem delivery"
  (Bacana), "(retirada sim)" (Espeto) e "a casa não tem brasa, os cortes são
  grelhados" (By Rock) passavam pelos detectores — cadastrar o item em outra
  unidade, ampliar o cardápio ou abrir um canal na base deixava a voz impondo
  a restrição velha. `condicoesOperacionais` pega exclusividade de unidade
  (`exclusivo da <Nome>`), cardápio restrito a item (`<bebida> além da`),
  canal/serviço afirmado (`<canal>… não existem`, `sem site/app/delivery`,
  `só com garçom`, `retirada sim`) e preparo afirmado (`a casa não tem
  brasa`, `são grelhados`). As seis propostas trocaram a frase pela
  orientação editorial com a condição devolvida à base ("item fora do
  cardápio da base", "canal que a base não registra", "quais itens são
  exclusivos, e de qual unidade, vem da base na data da peça"); o teste roda
  as seis frases reais e as seis redações corrigidas; prévias regeradas.
  A régua que fica: **a voz diz COMO falar; TUDO o que pode mudar com a
  operação (dia, período, item, unidade, canal, preparo, preço) é fato da
  base, e a proposta só pode apontar para a base.**
- 🔴 **O CACHE de busca (Redis) segue a régua do indexador** (PR13-30,
  `isolamentoDoCache`): `--dev` trocava SQL e Vector e herdava o
  `UPSTASH_REDIS_*` do `.env` — criar ou reindexar um fato no dev chamava
  `invalidateProjectCache` e incrementava a versão do cache de PRODUÇÃO. Em
  dev só o Redis PRÓPRIO do `.env.development.local` (URL e token, URL
  diferente da de produção); sem ele as variáveis saem do processo e o cache
  vira no-op limpo. A prova (`apontarParaODev`) faz o mesmo com Redis e Vector.

Da quarta revisão FINAL (BLOQUEADO, PR13-31…32):

- 🔴 **Os detectores são AJUDA de leitura, não o limite do que pode ir para a
  base** (PR13-32): "Aniversário só com bolo próprio… e brinde à escolha" e
  "Todo o cardápio disponível para retirada no balcão" estão no DNA do Espeto,
  nenhum detector os pegava, e o plano recusava o manifesto que os citasse —
  fato literalmente no DNA aprovado sem porta de entrada na base. Hoje
  `EstadoDoCliente.frasesDoDna` traz TODAS as frases do DNA integral da prévia
  (`frasesDoDna`, a mesma leitura de `frasesDe`), e `planoDeAplicacao` aceita
  o trecho que é fato detectado OU frase inteira do DNA; o que não está no
  DNA continua bloqueando. A prévia diz isso no rodapé da lista de fatos.
- 🔴 **Programação em lista fechada, cadastro afirmado e serviço/cortesia
  afirmados também são condição** (PR13-31): "inventar programação além de
  Samba do Canto e Almoço ao vivo" (Seu Quinto) e "telefone (não está
  cadastrado); inventar número" (Empório) foram trocados pela orientação
  ("a programação da casa vem da base", "telefone ou número que a base não
  registra"); `condicoesOperacionais` pega `programação além de`, `além de
  <Nome> e <Nome>`, `não está cadastrado`/`inventar número`, `retirada no
  balcão`/`disponível para retirada`/`brinde`/`cortesia de`. Prévias
  regeradas (Espeto 13 → 16 fatos).

Da quinta revisão FINAL (BLOQUEADO, PR13-33):

- 🔴 **O ESTADO de confirmação de um dado e o CONJUNTO FIXO de unidades também
  são condição da casa** (PR13-33): "os números do site não estão confirmados"
  (Lagosta) e "as DUAS lojas (Praia do Canto e Shopping Vitória)… ambas as
  unidades" (Real) passavam pelos detectores e iam para o prompt — confirmar o
  número na entrada "Provas e números reais" ou abrir/fechar uma loja deixava a
  voz afirmando o estado anterior. `condicoesOperacionais` pega `(não) está/
  estão/foi/foram confirmado(s)` e `já confirmado`, `<número> lojas/unidades/
  casas/endereços/filiais`, `ambas as unidades` e `unidades (Nome e Nome)`. A
  Lagosta ficou só com a EXIGÊNCIA de confirmação na base (número tirado do
  site incluído); a Real, com "todas as unidades vigentes, uma em cada linha;
  quais são as unidades vem da base, na data da peça". "últimas unidades",
  "uma unidade", "essa unidade" e "não confirmado na entrada X da base"
  (exigência, não estado) passam. Teste com as duas frases reais (detectadas
  no DNA — a leitura divide a regra da Real em DUAS frases, e as duas são
  condição — e recusadas na voz) e as redações corrigidas; prévias de produção
  regeradas (Real 11 → 17 fatos, Lagosta 15).

Da sexta revisão FINAL (BLOQUEADO, PR13-34…35):

- 🔴 **SERVIÇO e PREPARO afirmados como identidade também são condição da
  casa** (PR13-34): a reescrita da Bacana ("rodízio" → "no kilo", motivo "a
  Bacana é no kilo, não rodízio") e as do By Rock ("Grelhado na hora, com a
  combinação do dia", "os cortes grelhados") iam para o prompt afirmando o
  serviço e a técnica — mudar isso na base deixava a voz contradizendo a base.
  `condicoesOperacionais` pega `é/somos no kilo|quilo`, `não (é|tem) rodízio`,
  `grelhado na hora` e `cortes grelhados`; as três reescritas viraram
  orientação de linguagem sem o dado ("Monte seu prato do jeito Bacana", "O
  prato com a combinação do dia. É o Roberto Carlos.", "a seção do cardápio
  (os Rock Steaks)"), com "rodízio" mantido nas PROIBIÇÕES (palavra nua é
  vocabulário proibido) e "no kilo" nos TERMOS (nome do serviço). 🔴 **O motivo
  da REESCRITA vai ao prompt e passou a ser lido** — para preço, horário e
  CONDIÇÃO, como o motivo da regra (ele carrega a data em que a reescrita
  nasceu; lido inteiro, TERO e Lagosta viravam "fato de data"). ⚠️ `\b` do JS
  não enxerga acento: detector que começa em "é" ou "não" entra por
  `(?:^|\s)`, nunca por `\b` — com `\b` a frase real da Bacana passava.
- 🔴 **A ativação confere os FATOS aprovados dentro da transação que liga a
  precedência** (PR13-35, `migrarParaVoz({ fatosEsperados })` +
  `conferirFatosEsperados`, puro): a 2ª passada conferia e escrevia as linhas,
  mas entre ela e a ativação a linha podia ser arquivada, editada ou perder a
  indexação — e a voz assumia com a base que a sustenta fora do lugar. Hoje o
  script relê os ids POR CHAVE depois das escritas (o registrador padrão não
  devolve id) e a ativação confere existência, conteúdo, categoria, `ACTIVE`,
  validade e `indexadoEm` na MESMA transação serializável do DNA; divergência
  é `VOZ_FATOS_DIVERGENTES` (409): a voz fica gravada e NÃO migrada, o legado
  segue mandando, e a edição concorrente da linha é PRESERVADA (nada é
  compensado). A prova arquiva um fato já conferido em `antesDeAtivar` e
  confere erro explícito citando a linha, `migradaEm` nulo, precedência legada
  e a linha ainda arquivada. 🔴 **O registrador da prova passou a gravar a
  LINHA REAL** (com a chave e a marca de indexado, sem indexar, com a tag da
  prova que o cleanup apaga): com o stub que só anotava, a ativação não teria
  linha para conferir — e o antigo `entryId: 'stub'` derrubaria a migração.

Da sétima revisão FINAL (BLOQUEADO, PR13-36…37):

- 🔴 **A marca de indexado vale só enquanto os chunks e os vetores que ela
  atesta existem — e a REINDEXAÇÃO os apaga antes de refazê-los** (PR13-36).
  `reindexEntry` (a API administrativa, a edição pela `atualizar-entrada-base`,
  os scripts de reindex) apagava chunks e vetores, e uma falha depois das
  exclusões (embeddings fora do ar) deixava a linha SEM vetor e COM
  `indexadoEm`: a retomada da migração lia `completo`, pulava a recuperação, e
  `conferirFatosEsperados` deixava a voz ativar sem os chunks da busca. Hoje o
  reindexador INVALIDA a marca antes de apagar (preservando `chaveDoFato` e o
  resto do metadata) e só a REPÕE depois de subir os vetores, sobre o metadata
  como está naquele momento e conferindo o sinal de aborto (PR13-23) — quem
  perdeu a posse não a repõe. Entrada SEM a marca não ganha marca ali: quem a
  grava é quem sabe que a indexação inteira fechou (`marcarFatoIndexado`). A
  marca mora em módulo puro da base (`src/lib/knowledge/marca-de-indexado.ts`:
  `temMarcaDeIndexado`, `semMarcaDeIndexado`, `comMarcaDeIndexado`), reexportada
  por `migracao-da-voz.ts`. Teste com o `db` e o indexador mockados (falha de
  embeddings depois das exclusões deixa a linha incompleta; reindexação
  completa repõe a marca com instante novo; aborto durante os vetores não
  repõe) e prova 6w (a marca cai entre a 2ª passada e a ativação → a ativação
  recusa citando "indexação não concluída"; a retomada reindexa pelo MESMO id e
  então ativa).
- 🔴 **A posse é conferida IMEDIATAMENTE antes de `gravarVoz`** (PR13-37): o
  commit O pôs a releitura dos fatos (consultas por OUTRA conexão) entre a
  conferência da 2ª passada e a gravação da voz, e a sessão da trava podia cair
  enquanto elas esperavam — a execução que perdeu a posse ainda criava ou
  incrementava a voz pendente, e outra aplicação que tomou a trava e leu a
  versão anterior falharia no CAS por causa dessa escrita. Prova 6z: a sessão
  da trava é derrubada pelo servidor na 4ª leitura (a 1ª da releitura), a
  conferência antes de gravar falha, a voz não é criada nem incrementada,
  nada é ativado. Regra que fica: **toda escrita do corpo confere a posse
  DEPOIS da última espera e ANTES de escrever** — conferir cedo e escrever
  tarde é o mesmo que não conferir.

Da oitava revisão FINAL (BLOQUEADO, PR13-38…39):

- 🔴 **A posse da trava é conferida DENTRO dos serviços de voz, depois das
  leituras deles e imediatamente antes de escrever** (PR13-38):
  `gravarVoz({ antesDeEscrever })` roda a conferência depois do
  `brandVoice.findUnique` e antes de `create`/`updateMany`;
  `migrarParaVoz({ antesDeEscrever })` a roda DENTRO da transação
  serializável, depois das leituras do DNA e dos fatos e antes de ligar
  `migradaEm`. O script passa `() => trava.conferir()` nas duas chamadas. A
  conferência que ficava só do lado de fora não cobria a janela em que a
  leitura interna espera — a sessão da trava caía ali e o serviço seguia
  escrevendo. Teste em `voz-service-posse.test.ts` (o `Prisma` mockado: o
  client gerado do worktree não resolve em teste).
- 🔴 **A marca de indexado só é publicada por compare-and-set no CICLO**
  (PR13-39, `metadata.cicloDeIndexacao`): quem começa a indexar — a criação
  do fato pela migração (o token vai no `metadata` de `criarEntradaBase`) e
  `reindexEntry` (SEMPRE carimba, com ou sem marca anterior) — grava um token
  próprio; `marcarFatoIndexado(…, ciclo)` e a reposição da marca em
  `reindexEntry` são `updateMany` onde `cicloDeIndexacao = <meu token>`, e
  `count 0` LANÇA ("outra indexação assumiu a entrada"). A API administrativa
  de reindex não participa da trava por projeto: sem o token, ela apagava
  chunks e vetores no meio, a migração atrasada gravava a marca por cima, e
  `classificarFato` lia `completo` uma linha vazia — a voz ativava sem a
  busca. Limite declarado: os vetores da execução perdedora podem subir
  depois (mesmo `vectorId` por chunk — o upsert sobrescreve, não duplica); o
  que a marca atesta continua sendo o ciclo que fechou por último.

Da nona revisão FINAL (BLOQUEADO, PR13-40…41):

- 🔴 **O ciclo que a indexação carimba é o MESMO que quem chama publica**
  (PR13-40): o registrador padrão da migração punha o token A no `metadata`,
  `criarEntradaBase` chamava `reindexEntry` só com o sinal, o indexador gerava
  B, sobrescrevia e devolvia B — descartado — e a marca com A caía no CAS:
  falso "outra indexação assumiu" em TODO fato novo, sem concorrência nenhuma.
  Hoje `criarEntradaBase(…, { ciclo })` entrega o token a `reindexEntry` e
  devolve o ciclo EFETIVO; `criarFatoPeloIndexador` (o registrador padrão,
  exportado e testado com banco e Upstash falsos) publica com ele. Token
  gerado fora e não repassado é o mesmo defeito com outra roupa.
- 🔴 **O token protegia a PUBLICAÇÃO; o ciclo inteiro precisa de EXCLUSÃO**
  (PR13-41): a execução que perdia o ciclo ainda apagava chunks e vetores que a
  seguinte tinha recuperado, e sobrava marca válida sem vetor. A entrada é
  ARRENDADA no próprio `metadata` (`cicloDeIndexacao` + `cicloExpiraEm`,
  `src/lib/knowledge/arrendamento.ts`, sem migration): adquirir é
  compare-and-set no `updatedAt` lido; arrendamento vigente de outro token →
  `IndexacaoEmAndamento` sem tocar em nada (API admin 409, migração
  `bloqueado`); cada passo destrutivo ou de publicação (apagar chunks, o
  `index.delete` DEPOIS da consulta dos ids, gravar chunks, subir vetores, repor
  a marca) RENOVA com o próprio token antes e roda com prazo de 60 s contra 5 min
  de arrendamento — renovação que falha é `ArrendamentoPerdido` e nada mais é
  escrito; o `deleteMany` dos chunks ainda confere o token no próprio DELETE.
  Liberar tira só o prazo (o token fica: é contra ele que `marcarFatoIndexado`
  publica depois do retorno), e passo abortado com a chamada em voo NÃO libera —
  o arrendamento vence sozinho. Limite declarado: a exclusão vale para relógios
  com desvio menor que a folga (~4 min) e para chamadas que respeitam o aborto;
  uma execução morta segura a entrada por até 5 min.

Da décima revisão FINAL (BLOQUEADO, PR13-42…43):

- 🔴 **A edição de campo INDEXADO é coordenada com o arrendamento e recusada
  ANTES de salvar** (PR13-42): `PUT /api/knowledge/[id]` gravava o texto novo e
  só depois chamava `reindexEntry`; com outra indexação em curso, a
  reindexação tomava `INDEXACAO_EM_ANDAMENTO`, a rota engolia e respondia
  sucesso, e o ciclo em curso publicava chunks, vetores e marca do texto
  ANTIGO. Hoje toda porta de edição (a rota, a tool `atualizar-entrada-base`,
  `updateEntry` — rota admin e `confirm`) passa por `editarEntradaCoordenada`
  (`arrendamento.ts`): troca de `content`, `category` ou `status` com
  arrendamento vigente → `IndexacaoEmAndamento` sem escrita (409 legível; na
  tool, `CreativeError` 409). A escrita é compare-and-set no `updatedAt` lido:
  arrendamento adquirido entre a leitura e a escrita faz a edição reler e ser
  recusada. Edição só de etiquetas, validade ou metadata da pessoa continua
  valendo durante o arrendamento.
- **Campo indexado é o que ENTRA no índice**: `content` (chunks), `category` e
  `status` (metadata do vetor). O título não entra em nenhum dos dois — trocar
  só o título durante a indexação passa.
- 🔴 **O metadata da pessoa nunca apaga nem forja o arrendamento**
  (`metadataDaEdicao`): a rota substitui o metadata inteiro, e um PUT com
  metadata no meio de um ciclo apagava `cicloDeIndexacao`/`cicloExpiraEm` —
  outra execução adquiria e PR13-41 voltava. As chaves do sistema vêm sempre da
  linha lida; quando a edição muda o índice, marca, token e prazo SAEM (a marca
  atestava os chunks do texto anterior, e sem o token a `marcarFatoIndexado`
  atrasada de um ciclo anterior é recusada).
- 🔴 **O ciclo indexa o conteúdo lido NA AQUISIÇÃO e confere a versão antes de
  publicar**: `ArrendamentoDaEntrada.indexada` sai da mesma leitura cujo
  `updatedAt` a aquisição carimbou, nunca do `findUnique` anterior; `renovar` e
  `publicarMarca` comparam `versaoIndexadaDe` com a linha e, se uma escrita que
  não passou pelo serviço (SQL direto, script) a mudou, lançam
  `IndexacaoSuperada` (`INDEXACAO_SUPERADA`) antes de gravar chunks, subir
  vetores ou repor a marca. `perdeuOArrendamento` reconhece os dois códigos
  (API admin 409, migração bloqueia, criação não compensa). `liberar` NÃO
  confere a versão: o ciclo superado ainda solta a entrada, senão a
  reindexação da edição esperaria o prazo. Limite: para chunks e vetores a
  conferência é antes do passo, não no próprio write — a proteção primária é a
  recusa da edição; só a marca é atômica (CAS no `updatedAt` da leitura que
  conferiu).
- ⚠️ **Fora da coordenação**: as escritas que apagam vetores e arquivam direto
  (cron `archive-expired-knowledge`, `arquivar-entrada-base`, o DELETE do
  `confirm`) e os scripts com `db.knowledgeBaseEntry.update`. No meio de um
  ciclo, a indexação em curso para por `IndexacaoSuperada` e não ressuscita
  vetores; fora de um ciclo, nada mudou.
- 🔴 **O token da criação é RETIDO desde a própria criação, e a compensação é
  condicionada a ele** (PR13-43): `criarEntradaBase` deixava o ciclo nascer no
  indexador e desfazia por `id`. Com os embeddings de A demorando até o
  arrendamento vencer, B (a reindexação administrativa) assumia e recuperava a
  linha; depois os embeddings de A rejeitavam com erro COMUM — que não passa
  pela renovação e não vira `ArrendamentoPerdido` —, o `finally` ignorava o
  `false` de `liberar()` e a compensação apagava a linha e, em cascata, os
  chunks de B (vetores órfãos). Hoje o ciclo nasce em `criarEntradaBase`, vai
  carimbado no `metadata` da própria criação, e a compensação é `deleteMany`
  onde `cicloDeIndexacao = <meu token>`: `count 0` preserva a linha e lança
  `ArrendamentoPerdido` ("antes de desfazer a entrada…"), com o erro original
  no log. **Erro comum não prova posse; só o DELETE condicionado prova.**
- Testes com banco e Upstash falsos: `edicao-durante-indexacao.test.ts` (chama
  a rota REAL com Clerk mockado) e `indexacao-arrendada.test.ts`. A prova de
  integração (`validar-migracao-da-voz.ts`) não mudou: as edições diretas
  dela rodam fora de ciclo.

**Da revisão do commit b5647079 (BLOQUEADO, PR13-44…45, 12/09/2026):**

- 🔴 **A versão indexada é conferida DEPOIS dos vetores também na entrada sem
  marca prévia** (PR13-44): a conferência posterior ao `upsert` só existia
  dentro de `publicarMarca`, que roda apenas quando `tinhaMarcaDeIndexado`. Na
  entrada nova (`criarEntradaBase`) ou incompleta (retomada da migração), uma
  escrita direta que trocasse o conteúdo ENQUANTO os vetores subiam passava:
  `reindexEntry` devolvia sucesso, `liberar()` não olha a versão, e
  `marcarFatoIndexado` — que confere só o token — publicava a marca sobre um
  cadastro com texto novo e chunks/vetores do antigo. Hoje o ramo sem marca faz
  `arrendamento.renovar('confirmar a versão indexada')`, que confere token e
  versão por compare-and-set, e lança `IndexacaoSuperada` antes de retornar; a
  liberação continua possível com a versão superada. Limite: entre `liberar()`
  e a `marcarFatoIndexado` do chamador não há conferência de versão — a edição
  coordenada tira o token (e a marca é recusada), a escrita por fora não.
- 🔴 **Conflito DEPOIS de salvar não é "Nada foi salvo"** (PR13-45):
  `updateEntry` salvava por `editarEntradaCoordenada` e só então chamava
  `reindexEntry`; outra execução que adquirisse a entrada no intervalo fazia a
  reindexação lançar `INDEXACAO_EM_ANDAMENTO`, e as rotas `confirm` e admin
  respondiam 409 "Nada foi salvo" com a edição GRAVADA — e pulavam a
  invalidação do cache. Hoje `updateEntry` devolve `{ entry, indexacaoPendente }`:
  o único `IndexacaoEmAndamento` lançado é a recusa ANTERIOR à escrita; o
  conflito posterior (`INDEXACAO_EM_ANDAMENTO`/`PERDIDA` — a outra execução leu o
  texto novo —, ou `SUPERADA`) volta em `indexacaoPendente`
  (`indexacaoPendenteDe`, `marca-de-indexado.ts`), e as rotas invalidam o cache
  e respondem **202** com `indexacao: 'pendente'`, `code` e `aviso` ("A edição
  foi salva…"). Os clientes (`ai-chat`, `template-ai-chat`, `useUpdateKnowledgeEntry`)
  tratam 2xx como sucesso. `PUT /api/knowledge/[id]` e a tool
  `atualizar-entrada-base` já separavam as duas etapas (a reindexação pós-edição
  não derruba a resposta) e não mudaram. Erro comum da reindexação segue lançado.
- Testes em `edicao-durante-indexacao.test.ts`: o `aoSubir` sem `indexadoEm`
  pelos registradores reais (`reindexarFatoPeloIndexador` e
  `criarFatoPeloIndexador`) exige `INDEXACAO_SUPERADA` e nenhuma marca; a rota
  real de `confirm` suspensa depois da edição, com outro arrendamento adquirido
  no meio, exige 202, conteúdo novo persistido, o arrendamento alheio intacto e
  o cache invalidado (e o mesmo pela rota admin); a recusa antes da edição
  continua 409 "Nada foi salvo" sem invalidar. Mutação conferida: sem a
  conferência, os dois testes do PR13-44 resolvem; com `updateEntry` e as rotas
  do commit anterior, os dois do PR13-45 recebem 409.

**Da revisão FINAL do Codex sobre 82b763a8 (BLOQUEADO, PR13-46…48, 12/09/2026):**

- 🔴 **O `metadata` de uma entrada da base tem TRÊS donos, e todo escritor mexe
  só no seu** (PR13-47). A confirmação do chat manda `metadata: null` quando a
  prévia não traz metadata, e `metadataDaEdicao` preservava só marca, token e
  prazo — apagava `chaveDoFato`. Como a retomada da migração acha o fato SÓ por
  essa chave (`estadoDoFatoNaBase`), uma edição comum entre a falha parcial e a
  reaplicação fazia o fato ser lido como ausente: outra entrada criada, ou o
  texto anterior à correção da pessoa recriado em vez de bloqueio por
  divergência. Hoje a partição mora em `marca-de-indexado.ts`:
  `CHAVES_DE_IDENTIDADE` (`chaveDoFato`, `origem`, `versaoDaPrevia` — nasce
  com a entrada, vem sempre da linha, SOBREVIVE a toda edição inclusive a que
  troca o conteúdo, e não se forja pelo pedido), `CHAVES_TRANSITORIAS` (marca,
  token, prazo — só o ciclo escreve, e a edição que muda o índice as tira) e o
  resto, que é da pessoa (`metadataDaPessoa`). Os escritores, varridos um a um:
  `editarEntradaCoordenada` (PUT `/api/knowledge/[id]`, `updateEntry` da rota
  admin e do `confirm`, tool `atualizar-entrada-base`) por `metadataDaEdicao`,
  com CAS no `updatedAt`; `indexEntry` (criação pela PESSOA: `confirm` CREATE,
  POST da base e do admin) grava só `metadataDaPessoa`; `criarEntradaBase`
  aceita a identidade de quem cria mas descarta marca e prazo prontos (um
  `cicloExpiraEm` futuro no metadata fazia a própria indexação da criação ser
  recusada); `adquirir`/`renovar`/`publicarMarca`/`liberar` já eram
  leitura-derivação-CAS tocando só as chaves transitórias; `marcarFatoIndexado`
  ver abaixo. Não escrevem metadata: arquivamento (cron, tool, DELETE do
  `confirm`), `migrate-workspace` e os scripts de uma vez só.
- 🔴 **A marca de indexado toca SÓ a própria chave, por compare-and-set no
  `updatedAt` lido** (PR13-48): `marcarFatoIndexado` lia o metadata, conferia
  só o token na escrita e gravava o objeto capturado. Uma edição coordenada de
  metadata no meio não troca o token (não muda o índice), então a marca passava
  e a nota que a pessoa acabara de salvar sumia. Hoje é um laço de até 5
  tentativas: relê, confere aborto e token na leitura, e grava com `updatedAt`
  lido + token no `where`, reconstruindo o metadata a cada conflito.
- **`INDEXACAO_PERDIDA` não promete recuperação** (PR13-46): `ArrendamentoPerdido`
  também sai de cinco conflitos seguidos de CAS com o token AINDA desta
  execução (edições de etiqueta no meio), sem outra execução nenhuma. O aviso
  diz que a edição foi salva e a indexação não concluiu; só
  `INDEXACAO_EM_ANDAMENTO`, que prova arrendamento vigente alheio, fala em
  outra execução indexando o texto novo.
- Testes em `metadata-do-sistema.test.ts`: a migração REAL (`aplicarManifesto`
  com `lerEstadoDoCliente`, `estadoDoFatoNaBase` e o registrador padrão sobre o
  banco falso) falha no 2º fato, a confirmação real edita o 1º com metadata
  omitido, nulo e substituído, e a reaplicação cria só o que faltava; com o
  conteúdo corrigido, bloqueia por "conteúdo editado". Cada escritor contra a
  partição (PUT da base, PUT admin, tool, `confirm` CREATE, `criarEntradaBase`,
  o ciclo no meio e no fim); a marca suspensa depois da leitura com edição de
  metadata no meio preserva a nota, e com troca de ciclo continua recusada; e
  cinco conflitos pela confirmação real respondem 202, invalidam o cache e não
  prometem outra execução. Mutações conferidas: `metadataDaEdicao` do commit
  anterior derruba 9 testes, `marcarFatoIndexado` antigo 1, o aviso antigo 1,
  `criarEntradaBase` sem o filtro 1, `indexEntry` sem o filtro 1.

Da revisão FINAL do Codex sobre 852cf9e9 (BLOQUEADO, PR13-49…50 + C13-01, 18/09/2026):

- 🔴 **Isolamento do Upstash se decide pela IDENTIDADE do endpoint, nunca pela
  string** (PR13-49, P1). `https://PROD.upstash.io` no dev contra
  `https://prod.upstash.io` na produção dava "isolado" por comparação textual, e
  `--dev` escreveria vetores de dev no índice de produção (ou invalidaria o cache
  dela). `podeSerOMesmoServico` compara o hostname normalizado
  (`identidadeDoEndpoint`: minúsculas, IDN, sem ponto final, esquema ausente vira
  https); porta, esquema e raiz ficam fora de propósito — mesmo host é o mesmo
  serviço. URL ilegível de qualquer lado conta como PRODUÇÃO: isolamento só se
  afirma provado. A prova (`validar-migracao-da-voz.ts`) passou a usar a MESMA
  régua (`isolamentoDoCache`/`isolamentoDoIndexador`), em vez de repetir a
  comparação textual.
- **O 202 com `indexacao: 'pendente'` chega à TELA** (PR13-50): os dois chats
  (`/ai-chat` e o chat do template) e a edição do admin liam o JSON só no erro e
  engoliam o aviso. Todos leem a resposta de SUCESSO por
  `avisoDaIndexacaoPendente` (`marca-de-indexado.ts`, puro) e mostram sem
  bloquear — mensagem do assistente no chat, descrição do toast no admin.
- **A identidade de fato só existe em FATO** (C13-01): `origem` e
  `versaoDaPrevia` são do sistema só com `chaveDoFato` na mesma metadata. Entrada
  comum preserva `origem` na criação pela pessoa e a edita como qualquer campo;
  pedido que traz `chaveDoFato` (identidade FORJADA) perde as três chaves; no fato
  de verdade a identidade da linha continua vencendo.

### O contexto da semana: janela, formato, grade completa e fatos por data (PR 6 de "Marca simples, copy melhor", 12/09/2026)

Quem monta a semana é o Claude, no chat (decisão de 11/09); o Studio entrega o
CONTEXTO. Até aqui `sugerir-posts` só olhava "os próximos N dias", contava um
feed como ocupante do slot de story, e a grade só aparecia nos buracos;
`ver-agenda` mostrava 140 caracteres de legenda; `consultar-base` conferia a
validade contra HOJE; e `buscar-fotos` não tinha como tirar da lista a foto já
escolhida na peça anterior. Módulos PUROS com teste:
`src/lib/posts/contexto-da-semana.ts` e `src/lib/creatives/excluir-fotos.ts`.
Sem migration. Prova no branch de dev: `scripts/validar-contexto-da-semana.ts`.

- **A janela tem INÍCIO e FIM** (`janelaDaSugestao`; "AAAA-MM-DD" em
  Brasília; início no passado vira hoje com aviso; fim antes do início é
  `JANELA_INVALIDA`; teto de 21 dias, cortada com aviso). Sem os dois é o
  comportamento de sempre (hoje + `dias`). A tool `sugerir-posts` recebe
  `inicio`/`fim`; `dias` continua e é ignorado quando `fim` vem.
- 🔴 **A OCUPAÇÃO é por FORMATO** (`slotOcupado`): story só é ocupado por
  story; post, carrossel e reel disputam o feed entre si. A grade aprovada da
  base é de STORY por construção (o parser deixa feed e carrossel de fora);
  horário do histórico leva o formato da MAIORIA do bloco (`formatoDoBloco`;
  empate e bloco vazio caem em story — 92% do que a carteira publica). Cada
  `sugestao` e cada item de `ocupacao` dizem o `formato`.
  🔴 **O formato olha o MESMO bloco e a MESMA população da cadência**
  (revisão de 619e7877): o bloco de meia hora é `blocoDeMinutos` (arredonda
  ao mais próximo — publicações às 19h20 formam o horário das 19h30 e são
  contadas nele; com `floor` de um lado e `round` do outro, o horário nascia
  num bloco e era classificado noutro, vazio, virando story), e o histórico
  passa por `historicoParaFormato`, que tira a campanha encerrada como a
  cadência já tira — senão uma campanha de feed já encerrada transformava o
  story de rotina daquele bloco em feed, e a ocupação junto.
  🔴 **Quem CONSOME os slots escolhe por horário E formato** (`slotsParaAPeca`,
  `formatoDoSlotDaPeca`, `chaveDoSlot`): com a ocupação por formato, um
  horário com story agendado passou a aparecer como slot livre de FEED — e a
  bancada, que filtrava e pré-selecionava por horário, oferecia esse slot para
  OUTRO story em cima do existente; `propor-semana` descartava o formato na
  conversão. A peça só vê os slots do formato dela (feed, quadrado e carrossel
  = feed), a fila reserva por horário E formato, e a leva do plano filtra
  pelo formato do plano (R22 da revisão de 386118cc).
  🔴 **A seleção da bancada é RECONCILIADA com a lista, nunca mantida**
  (`reconciliarSlot`, `quandoDaPeca`, puros; R25 da revisão de fde1fb73): o
  slot pré-selecionado que SAI da lista — a peça mudou de formato ou virou
  carrossel, outro item da fila reservou o horário — é substituído pelo
  primeiro disponível ou limpo; e o horário automático da inclusão só existe
  enquanto o slot é uma proposta VÁLIDA (o manual vence). Antes o efeito só
  preenchia `!slot`: o story das 19h pré-selecionado sobrevivia à troca para
  feed e a peça entrava nas mesmas 19h, em cima do feed que ocupava o horário.
  🔴 **A consulta de ocupação vai além da janela pela tolerância do slot**
  (`janelaDeConsultaDeOcupacao`, 45 min dos dois lados; R27 da revisão de
  2848096f): a consulta que começava exatamente no início da janela não trazia
  o story de domingo 23h45, e o slot de segunda 0h saía livre a 15 minutos
  dele. Só a DETECÇÃO de conflito enxerga a borda; sugestões, `ocupacao` e
  `jaNaAgenda` continuam limitados à janela pedida (`dentroDaJanela`).
- 🔴 **A grade aprovada tem precedência por dia E FORMATO**
  (`fundirGradeComCadencia(…, { formatoDe })`): ela é de story, então
  substitui os horários de STORY do dia que cobre e mantém o FEED que o
  histórico sustenta no mesmo dia — o story combinado das 10h não apaga o
  feed das 18h de segunda. Sem `formatoDe` vale o comportamento antigo (a
  grade substitui o dia inteiro), que é o que os chamadores antigos esperam.
- **A GRADE COMPLETA sai sempre** (`montarGradeDaSemana`): os 7 dias, cada
  horário com `origem` (`combinado` = grade aprovada na base; `historico` =
  rotina medida; `nova` = só nas últimas duas semanas), `formato`, `tema` e
  `evidenciaFraca` (campanha/sugestão aceita sem edição, ou novidade —
  `fundirGradeComCadencia` passou a carregar `picoRecente`/`apoioFraco`);
  `excecoes` são os dias sem horário. É o que se apresenta UMA vez: as
  instruções do conector mandam não pedir aprovação da mesma grade em cada
  leva — só a DIVERGÊNCIA volta à conversa.
- 🔴 **`registrarSugestoes: false` desliga a emissão de sinais** em
  `sugerirPosts` (a resposta diz `sinaisRegistrados`). É para prova e medição:
  cada slot emitido é uma proposta no KPI, e prova que emite contamina o
  denominador — a regra de 11/08 ("script NUNCA chama o que registra sinal")
  ganhou a alavanca em vez de um caminho paralelo.
- **`ver-agenda` traz `textos`** como a ARTE os mostra (`textos-da-peca.ts`,
  puro), `textosOrigem`, `formato` e `legendaCompleta` quando a legenda passa
  de 140 caracteres. É por eles que se revisa repetição de tema e frase entre
  os dias.
  🔴 **A precedência é a do render, não "a página"** (revisão de 619e7877): a
  página é o MODELO — dois posts sobre a mesma página com copy própria em
  `slotValues` voltavam com o texto de exemplo do modelo. A copy PRÓPRIA do
  post sobrepõe a página camada a camada (por id ou nome, como
  `applySlotValues`); a cópia que o agendamento grava (`_copiaDaPagina`) não
  sobrepõe (`slotValuesParaRender`); camada oculta fica de fora.
  🔴 **Carrossel e peça sem página se leem SLIDE A SLIDE, pela arte que cada
  mídia é** (`mediaUrls` → `Generation` casada pela URL, a mais recente por
  URL — a regra de `artes-do-post.ts`; `generationId` do post é só o PRIMEIRO
  slide, e os outros sumiam da revisão). Na peça viva o slide é lido da
  PÁGINA daquela arte (`fieldValues.pageId`, é ela que o re-render desenha);
  na entregue, do `layersSnapshot`. `textosPorSlide` sai no carrossel; mídia
  sem arte registrada é declarada no slide e a leitura vira `textosParciais`.
  🔴 **Só a URL casa a arte — NUNCA o `generationId` do post como fallback**: o
  re-render grava URL nova sem trocar o vínculo (`ensurePostGeneration`
  devolve cedo), e o snapshot daquela Generation é de OUTRA versão da mídia.
  🔴 **Snapshot de arte RE-RENDERIZADA não afirma texto**
  (`recomposicao.estado === 're-renderizada'`): esse caminho grava a URL nova
  e PRESERVA o snapshot da composição anterior. Até a re-renderização gravar
  as camadas que desenhou, a mídia é declarada sem registro e vale o fallback
  (cópia registrada, parcial, indisponível). Leitura LEGÍVEL E VAZIA é
  definitiva (`textos: []` com `textosOrigem`): a única camada apagada pelo
  slot ou todas ocultas não são motivo para buscar em outra fonte um texto
  que o render removeu.
  🔴 **Carrossel sem NENHUM slide legível não cai em fallback nenhum — vivo ou
  entregue**: a cópia da página gravada no post (`_copiaDaPagina`) e a copy
  própria só provam o que foi ao ar em MÍDIA ÚNICA (o render de post as
  mantém em dia); o re-render de slide troca só `mediaUrls` e o `slotValues`
  do carrossel fica como estava — a cópia A sobrevive à mídia B. Declara-se,
  slide a slide (`textosPorSlide`), inclusive no rascunho.
  🔴 **Peça VIVA sem página legível também é dita PARCIAL** (R28 da revisão de
  f3ac8b92): a copy do post é só o que ele sobrescreveu, e a cópia registrada
  (`_copiaDaPagina`, origem `copy-registrada`) é parcial por natureza — as duas
  voltam com `parcial` e a nota dizendo que as camadas não puderam ser lidas, e
  a cópia registrada passa pela leitura que preserva URL de camada (a de R19),
  não pelo filtro genérico. Sem página nenhuma, a copy do post continua sendo
  a leitura inteira do que existe.
  🔴 **`ver-agenda` só lê páginas DESTE projeto** (R29 da revisão de 061195d3,
  P1): o `pageId` de um post e o `fieldValues.pageId` de uma Generation podem
  apontar para página de OUTRO projeto (o `konva-export` grava `body.pageId`
  sem conferir o dono), e a consulta pelo id nu entregava os textos de B pela
  agenda de A. A busca das páginas leva `Template: { projectId }`; página de
  fora fica sem camadas e a peça segue como fonte indisponível.
  🔴 **`pageId` preenchido e página NÃO carregada não é "peça sem página"**
  (R30): a fonte principal está indisponível — a copy do post volta parcial
  com a nota, a cópia registrada parcial, e sem copy é `textosIndisponiveis`.
  E a prova escolhe a página de outro projeto lendo as camadas de verdade
  (`textosDaPagina`), não com `LIKE` no JSONB (R31), e exercita os dois
  caminhos: `SocialPost.pageId` e `Generation.fieldValues.pageId`.
  🔴 **O FORMATO faz parte da identidade da proposta de slot** (R33 da
  revisão de 4bf1d0a3): a chave era `(versão, projeto, horário)`, e o mesmo
  bloco classificado como story numa semana e feed na seguinte (a população
  do histórico muda) reutilizava o `sugestaoId` — o feed herdava o
  `descartada` do story, e a precedência de desfechos impedia o aceite de
  sobrescrever. `chaveDaPropostaDeSlot` (puro) põe o formato no fim da chave
  e `sugerido.formato` é gravado; a emissão legada (sem formato) fica com a
  chave antiga, nunca reescrita. A prova registra de verdade no dev (2c) e
  apaga no cleanup.
  🔴 **Mídia ÚNICA cuja arte não afirma texto também é fonte INDISPONÍVEL**
  (R32 da revisão de d871673c): post vivo sem `pageId` e uma mídia cuja
  Generation aponta para página de outro projeto (ou apagada), sem snapshot
  confiável — `textosPorSlide` já dizia o motivo, mas só o carrossel
  preservava a declaração; a mídia única caía no retorno vazio e, com copy
  própria, voltava sem `parcial`. Hoje o motivo do slide vira
  `fonteIndisponivel` ("a arte desta peça não afirma texto (…)"), e vale o
  mesmo tratamento da página ilegível: copy própria e cópia registrada
  PARCIAIS com a nota; sem copy, `textosIndisponiveis`. A prova exige a
  declaração no caminho pela arte (antes só conferia "não vazou").
  **A cópia registrada é PARCIAL por natureza**: `textosDaPagina` guarda o
  texto das camadas ANTES da caixa do render e sem a ordem em que são
  desenhadas — quem a devolve (`copy-registrada-na-entrega`) declara
  `textosParciais` com a nota; e uma URL nela é texto de camada e FICA (o
  filtro de URL vale só para `slotValues` sem tipo de camada).
  **A CAIXA é a do render** (`aplicarCaixa` em `posts/caixa-do-texto.ts`, a
  MESMA função que `render-engine.ts` usa, aplicada depois do slot): a camada
  guarda "Almoço executivo" e a arte mostra "ALMOÇO EXECUTIVO".
  **A SEQUÊNCIA é a do render**: as camadas saem pelo `order` (`(order ?? 0)`,
  sort estável — a mesma conta de `render-engine.ts`); a persistência aceita o
  array fora de ordem, e a agenda devolvia a ordem do array (R23).
  🔴 **Arte já ENTREGUE não segue a página** (`arteEntregue`: `laterPostId`,
  publicado, publicando ou falhou): a página pode ter sido editada DEPOIS da
  entrega, e a invalidação não alcança o post — atribuir-lhe o texto atual da
  página seria mentir sobre o que foi ao ar. Sem snapshot, a copy PRÓPRIA do
  post é PARCIAL e dita assim (`textosParciais` + `textosNota`: só os campos
  sobrescritos; o resto veio da página no render e não tem registro — nunca
  se completa pela página atual); a cópia registrada no último render antes
  da entrega é inteira; sem nenhuma, `textosIndisponiveis` DECLARA e `textos`
  não sai. Camadas ilegíveis também declaram, nunca erro.
  🔴 **O texto de camada volta INTEIRO e na multiplicidade em que existe**: URL
  numa camada de texto é texto da peça, duas camadas com a mesma frase são
  duas ocorrências (é a repetição que a revisão procura), acento e quebra de
  linha ficam. Só o fallback por `slotValues` (sem tipo de camada) descarta
  valor com cara de URL. E o slot é aplicado pela MESMA função do render
  (`aplicarSlotNaCamada`, extraída de `applySlotValues`): `""` mantém o texto
  da camada, `{ content: "" }` o apaga, id vence nome — reproduzir a
  semântica "à mão" foi como a leitura passou a afirmar ausência de um texto
  que continuava na arte.
- **`consultar-base` recebe `em`** (a data em que a peça VAI AO AR):
  `vigenteEm(início daquele dia em Brasília)` — o que vence durante o dia
  ainda vale para a peça que sai nele. 🔴 Só dia que EXISTE (`dataValida`,
  ida e volta pelo ISO): `new Date('2026-02-31')` não recusa, normaliza para
  3 de março em silêncio, e a base seria lida para outro dia — vale também
  para `evitarUsadasDesde` e para `inicio`/`fim` da janela. A resposta diz `referencia` e traz
  `dados` (o `metadata` estruturado da entrada, sem os carimbos `origem`/
  `revisao`). A descrição separa os três horários que se confundiam: o de
  PUBLICAÇÃO (grade), o do SERVIÇO (funcionamento, na copy) e a VIGÊNCIA da
  oferta (`validade`).
- **`buscar-fotos` recebe `excluir` (driveFileIds já escolhidos) e
  `evitarUsadasDesde`** ("AAAA-MM-DD", por `PhotoUsage` + legado): a exclusão
  é aplicada sobre a lista JÁ ranqueada, ANTES de a proposta ser registrada (o
  que se registra é o que a pessoa viu), e declarada em `excluidas` (`porId`,
  `porUso`, `naoEncontrados`). Data inválida (formato errado ou dia que não
  existe) não exclui nada e vira aviso. O rodízio continua empurrando a usada
  para baixo; excluir é decisão de quem busca.
  🔴 **A exclusão entra na IDENTIDADE da proposta registrada**
  (`normalizarExclusao` → `criterios.excluir`/`evitarUsadasDesde` na chave de
  `registrarProposta`; revisão de 619e7877): a lista vista com a foto A
  excluída é OUTRA lista, com outro topo — sem isso o `upsert` do mesmo dia
  reutilizava a proposta anterior e escolher B contava como troca humana. Os
  mesmos ids em outra ordem continuam sendo o mesmo pedido; quem nunca
  excluiu mantém a chave de sempre (os campos só entram quando pedidos).
  🔴 **A identidade da exclusão preserva a CAIXA dos ids** (`identidadeDaExclusao`,
  parte própria da chave): `resumoEstavel` passa strings por minúsculas e
  "AbC"/"abc" — que a filtragem distingue — colidiam na mesma proposta. E o
  corte de uso compara o DIA EM BRASÍLIA (`diaDoUso`): um uso às 02:30Z de
  segunda é domingo à noite aqui, e `evitarUsadasDesde: segunda` não pode
  excluí-lo; a data pura do catálogo legado fica como está.
  🔴 **Para EXCLUIR, o dia do último uso funde banco e legado DEPOIS de converter
  cada fonte para o dia em Brasília** (`diaDoUltimoUso`, R26 da revisão de
  2848096f): `mesclarUsos` compara os textos, e o timestamp do banco
  ("…07T02:30Z", domingo 6 aqui) vencia a data pura do legado ("2026-09-07")
  — a foto usada no dia 7 escapava de `evitarUsadasDesde: 2026-09-07` com a
  exclusão dada como cumprida. Para ORDENAR o rodízio `mesclarUsos` continua.
  🔴 **Com corte por uso, a identidade da proposta leva o conjunto
  EFETIVAMENTE excluído** (`resumo.idsPorUso` → `identidadeDaExclusao`): a
  lista que a pessoa vê muda quando uma foto do topo é usada no meio do dia,
  e o `upsert` reutilizaria a proposta com o topo antigo — escolher o novo
  topo viraria "troca" atribuída à pessoa. Nada mudou → a mesma proposta.
  🔴 **"Ninguém usou" e "não consegui ler os usos" são fatos diferentes**
  (`lerUsosDeFotoComEstado`, R24): `lerUsosDeFoto` engolia a falha do
  `groupBy` e devolvia mapa vazio — com `evitarUsadasDesde`, toda foto voltava
  elegível e a resposta dizia `porUso: 0` como exclusão cumprida. Agora o
  estado viaja (`usosLidos`), a busca continua, e a exclusão por uso é
  declarada INCOMPLETA (aviso + `excluidas.porUsoIncompleta`).
- 🔴 **`prisma/generated/` no `.gitignore` ignora a PASTA, não o symlink** que
  os worktrees usam: `git status` o lista como `??` e a prova imprimia
  "pendente: 1 arquivo(s)" numa árvore que estava limpa (foi o que a revisão
  cobrou). Está em `.git/info/exclude` (compartilhado por todos os
  worktrees), não no `.gitignore` — o symlink é artefato de máquina.
- 🔴 **A grade-semente e a complementação conferem a OCUPAÇÃO do formato da
  leva no PREENCHIMENTO** (R34 da revisão final, `montarSlotsDaLeva` em
  `proposta-de-semana.ts`, puro): `sugerirPosts` só devolve horário livre, mas
  a semente INVENTA horários (11:30, 15:00, 18:30) sem olhar a agenda, e o
  filtro por formato (R22) podia esvaziar a cadência e cair justamente nela —
  às 8h, com o story das 11h30 já agendado e só o feed das 19h livre, a leva
  de story propunha OUTRO story às 11h30. `gradeSemente`/`completarAteOAlvo`
  recebem `ocupado(data, hora)` (mesma régua de 45 min, mesmo formato do
  slot) e PULAM para o próximo horário — filtrar depois deixava um teto baixo
  sem nada. Só um FEED às 11h30 não tira o story das 11h30 (controle no
  teste). O orquestrador não decide horário: registra como sugestão o que a
  função devolve em `semeados`.
  🔴 **O slot semeado leva o FORMATO da leva, e a proposta registrada é por
  horário E formato** (R40 da quarta revisão final, `chaveDaSemente` e
  `planoDaSemente` em `proposta-de-semana.ts`, puros): `registrarSemente`
  usava só versão, projeto e horário — às 8h, sem cadência e sem ocupação,
  a leva de story e a de feed do mesmo dia recebiam 11h30 e o MESMO
  `sugestaoId`; descartar o story marcava como descartada a proposta do feed
  (aceitar depois não vence esse desfecho), e as dicas de copy dos dois
  formatos, ancoradas nesse id, eram comparadas como uma proposta só. Hoje
  `montarSlotsDaLeva` carimba `formato` em todo slot inventado (semente e
  complementação), a chave é a MESMA conta de `sugerir-posts` (R33, com o
  formato no fim) e `sugerido.formato` é gravado; o registro legado (sem
  formato) fica com a chave antiga, nunca reescrita. Teste: as duas levas
  com ids diferentes, reutilização no mesmo formato e âncoras independentes.
  🔴 **`proposta-de-semana.ts` entra no bundle da BANCADA** (R41 da revisão de
  637e9faa, P1): o store cliente importa `para-bancada`, que importa
  `lerFotoCandidatas` dali — e o commit anterior trouxe `aprendizado/chaves`
  para dentro, que importa `node:crypto`. A compilação cliente não resolve
  módulo exclusivo de Node, e a bancada não abriria; o vitest em Node não vê.
  A chave legada (sem formato) sai de `chaveDaPropostaDeSlot` com formato nulo
  (a MESMA string `slot|versao|projeto|horário`), sem nenhum import de
  `chaves`; o teste fixa a igualdade com a chave legada inteira. Módulo
  compartilhado com o navegador só importa módulo puro.
- 🔴 **A copy HERDADA da arte no agendamento cai quando essa arte é re-renderizada
  DEPOIS** (R42 da quinta revisão final, `textos-da-peca.ts`): a ordem inversa de
  R38 — agendar por `generationId` com a arte AINDA legítima copia a copy A para o
  post (sem página própria); a página é editada, a recomposição re-renderiza a
  Generation e `recompor.ts` troca só `mediaUrls`. Entregue, o leitor recusava o
  snapshot mas caía em `copy-do-post` e atribuía A à mídia B. Hoje, com mídia
  única, post sem `pageId` e arte `reRenderizada`, a copy do post (a herdada) não é
  afirmada em nenhum caminho — nem entregue, nem viva com a página ilegível —, e a
  peça é declarada indisponível com o porquê; a cópia REGISTRADA (`_copiaDaPagina`)
  continua valendo, e com a página da arte legível a peça viva já lê a página (que
  É a mídia B). Prova 3h: agendar → re-renderizar → entregar → consultar, sem A.
- 🔴 **Prova que registra propostas coleta o id LOGO depois de cada chamada, antes
  do próximo `await`** (R43): `sugerir-posts` e `buscar-fotos` registram sinal na
  emissão, e ids coletados só depois de TODAS as chamadas deixavam as anteriores
  fora do cleanup quando uma chamada intermediária falhava — sinal sintético
  acumulando no dev com cleanup declarado completo.
- 🔴 **A arte de `post-schedule` é um MODELO com a copy do post por cima, e a
  PÁGINA dela não é a peça** (R36 da segunda revisão final, `copyDaArteDeModelo`
  em `textos-da-peca.ts`): o render de post grava a Generation com
  `source: 'post-schedule'`, `pageId` do modelo e `slotValues` com a copy;
  reagendada pela galeria por `generationId`, o post nasce sem página e a
  agenda lia a página daquela arte — "Título do modelo" por uma mídia que
  mostra "Costela no bafo". Hoje a PROCEDÊNCIA vem antes da página: na arte de
  `post-schedule` com copy PRÓPRIA (`slotValuesParaRender` não nula) vale a
  copy registrada na arte, declarada PARCIAL (o que o modelo trazia fora dela
  e a caixa do render não têm registro), viva ou entregue; a cópia da página
  (`_copiaDaPagina`) e as outras procedências (compositor, com snapshot) caem
  na leitura de sempre. O `arteDe` do handler leva `source` e `slotValues`.
  🔴 E a arte de `post-schedule` RE-RENDERIZADA não afirma a copy antiga
  (R37): o re-render como a página estava preserva `source` e `slotValues`
  no `fieldValues` e grava um PNG que é a página atual, desenhada SEM essa
  copy — afirmá-la seria atribuir texto de outra versão à mídia, contornando
  R13. Com `reRenderizada`, vale o tratamento de sempre: página atual na peça
  viva; cópia registrada ou indisponível na entregue.
  🔴 E `agendarPost` NÃO copia para o post a copy de uma Generation
  re-renderizada (R38): reagendar por `generationId` (ou por `mediaUrls`
  casada pela URL) gravava os `slotValues` antigos em `SocialPost.slotValues`,
  e depois da entrega o fallback `copy-do-post` devolvia a copy A pela mídia B
  — declarar parcial não conserta texto já invalidado. O post nasce SEM cópia
  textual (com aviso) e a agenda declara os textos indisponíveis até um render
  com registro. A cópia legítima (arte não re-renderizada) continua sendo
  copiada.
  🔴 **O que reabilita a copy de arte re-renderizada é o MARCADOR da regravação,
  nunca a ausência da marca de re-render** (integração com o PR 0, 12/09/2026,
  opção a — as duas regras valem). A recuperação forçada do PR 0
  (REV-127-F02/REV-FINAL-02) regrava os `slotValues` com a copy visual do PNG
  que desenhou e grava `recomposicao.copyVisualRegravada: true` no MESMO
  registro. Com o marcador: `lerProcedencia` devolve a copy como visual (e como
  proposta, se não houver `copyDeAprendizado`), `agendarPost` a copia para o
  post por Generation ou por URL, e `textos-da-peca.ts` afirma a copy REGRAVADA
  da arte pela mídia (origem `arte`, parcial — sem a caixa e a ordem do render),
  depois da página na peça viva e antes da indisponibilidade. Sem o marcador
  (re-render anterior ao PR 0, página ilegível que manteve a copy, arte sem copy
  visual), R37/R38/R42 seguem como estavam. Três limites de propósito: o
  SNAPSHOT de arte re-renderizada continua sem afirmar nada (o re-render não o
  regrava); a arte de `post-schedule` re-renderizada não volta a ser lida como
  "modelo com copy por cima" (R37 — ela é a página desenhada), então R47–R50
  não mudam; e o marcador valida a copy da ARTE, nunca a que o post HERDOU
  antes do re-render (R42 continua recusando a herdada; com o slide resolvido
  pela arte, ela simplesmente não aparece). Só `true` estrito reabilita.
  ⚠️ O commit que GRAVA o marcador (`recompor.ts`, 5cc62726 no branch do PR 6)
  é código do PR 0 e deve descer para o PR 0 quando ele for mergeado.
  **Da pré-revisão do HEAD f0eee811 (BLOQUEADO, C6-01…03, 12/09/2026):**
  - 🔴 **C6-01 (P2, pré-existente): a RECUSA da recomposição não pode apagar o
    registro do re-render.** `registrarRecusa` gravava
    `recomposicao: registro('recusada')` por merge raso e o PNG re-renderizado
    ficava: sumiam `estado`, o marcador e `urlsAnteriores`, e R13/R37/R38/R42
    reabriam em silêncio (o slide entregue mostrava o snapshot antigo como
    texto da arte nova; `agendarPost` copiava a copy antiga). Hoje a recusa
    mora em `fieldValues.recusaDaRecomposicao` e `recomposicao` segue sendo o
    registro do render que produziu o PNG atual; o próximo sucesso grava
    `recusaDaRecomposicao: null`. ⚠️ Esse commit (513890a8) é código do PR 0:
    **desce para o PR 0 no merge ou é revisado junto com o PR 6**. A leitura
    da arte da agenda virou `arteDosFieldValues` (módulo puro), para o teste
    ler o mesmo que `ver-agenda`. **Quem escrever em `recomposicao` precisa
    escrever o registro de um render que produziu o `resultUrl` atual** —
    qualquer outro estado (recusa, aviso, tentativa) vai em chave própria.
  - 🔴 **C6-02 (P3): espelho em `fieldValues` é MERGE NO BANCO, nunca
    ler-e-regravar.** O espelho do feedback de arte fazia `findUnique` +
    `update({ ...anterior, feedback })`; um re-render no meio ressuscitava o
    marcador e a copy da versão anterior por cima do `resultUrl` novo (copy B
    afirmada pela mídia C). Hoje é `mesclarFieldValuesDaArte` só com a chave
    `feedback`.
  - 🔴 **C6-13 (P3): o registro do crivo também é merge no banco.**
    `registrarNaGeneration` (`crivo-avaliacao.ts`) fazia o mesmo
    `findUnique` + `update({ ...anterior, crivo })` do C6-02; hoje é
    `mesclarFieldValuesDaArte` só com `crivo`. Só era alcançável chamando
    `POST /crivo/avaliar` direto (o `BancadaCrivo` não está montado), mas a
    rota aceita `generationId` de arte recomponível. Os outros dois escritores
    de `fieldValues` inteiro foram conferidos e ficam como estão, porque só
    alcançam Generation da própria rodada: `fila.ts` (falha da composição) só
    roda para a Generation PROCESSING que `enfileirarPeca` /
    `enfileirarComposicaoDoPlano` acabaram de criar (a recomposição sai antes,
    para `recompor.ts`), e `carousel-service.ts` grava na capa recém-criada
    (ou na PROCESSING reaproveitada pelo dedupe da trilha arte-ia, sem página
    e fora do alcance da recomposição).
  - 🔴 **A avaliação do crivo só grava na arte do PRÓPRIO projeto**: `avaliarCrivo` confere `generation.findFirst({ id, projectId })` ANTES de avaliar — arte de outro projeto ou inexistente dá o mesmo 404 (`GENERATION_NOT_FOUND`), sem chamar o modelo nem gravar, e a rota `/crivo/avaliar` devolve 404 em vez do crivo manual; a trava mora no serviço, onde a escrita mora, e porta nova que embrulhe a avaliação a herda.
  - 🔴 **C6-03 (P3, pré-existente): todo caminho que deriva a cópia textual
    de um post de uma Generation passa por `lerProcedencia`.** A troca de arte
    pela galeria copiava `slotValues` cru; agora segue o R38 + marcador como
    `agendarPost`, e invalidada grava `slotValues: DbNull` com o MESMO aviso
    (`AVISO_COPY_DE_ARTE_RE_RENDERIZADA`) — não o "null = não apaga", que
    deixaria a copy da arte anterior no post. Caminho novo que copie
    `slotValues` de Generation para post precisa do mesmo tratamento.
  - A prova ganhou a seção 3j (marcador + recusa no agendamento, na troca e
    na agenda entregue, com o controle sem marcador). Não foi rodada nesta
    leva — quem roda prova é o orquestrador, em série.
- 🔴 **Na arte de `post-schedule`, o id vence o nome também na LEITURA** (R46
  da revisão final de b90b4335): a copy registrada na arte pode endereçar a
  mesma camada por id e por nome, e o render aplica só a do id. Enumerar os
  valores brutos devolvia o valor descartado como texto da mídia. Hoje só entra
  o que `aplicarSlotNaCamada` aplica às camadas de texto visíveis do REGISTRO
  das camadas desenhadas (o snapshot confiável da arte — R47), na ordem e na
  caixa delas. Sem registro legível, a arte se declara indisponível: a copy
  bruta nunca é atribuída à mídia.
- 🔴 **A estrutura ATUAL do modelo não diz o que a arte desenhou** (R47 da
  oitava revisão final de 74afb769): a Generation de `post-schedule` guarda
  slots e `pageId`, sem as camadas, e depois do render a camada pode ser
  apagada e recriada com outro id e o mesmo nome, ou ter caixa, ordem e
  visibilidade trocadas — aplicar os slots na página de HOJE devolvia pela mídia
  congelada o valor que o render descartou. Só o snapshot confiável afirma, em
  QUALQUER estado: o slide que lê a arte de modelo é sempre um PNG congelado
  (post sem página própria ou carrossel), e o handler não carrega mais a página
  do modelo para a peça entregue. A copy que o post herdou dessa arte no
  agendamento também não é afirmada pelo fallback `copy-do-post` — é o mesmo
  valor bruto. A leitura dessas artes só volta quando o render gravar o
  registro das camadas que desenhou.
- 🔴 **Prova que agenda pelo serviço tem de apagar os SINAIS dos posts que
  criou** (R39 da revisão de 03c279ff): `agendarPost` registra sinal de slot e
  de copy por post (`escolha-propria`), e `LearningSignal.postId` não tem FK —
  o `deleteMany` dos posts os deixava para trás, e cada rodada da prova
  acumulava sinais sintéticos no dev anunciando cleanup completo. O cleanup
  identifica os posts da rodada ANTES de apagar (ids coletados + os recuperados
  pela marca na legenda, para a falha parcial antes do `push`), apaga os sinais
  deles restritos por projeto, post e início da rodada, e confere que nenhum
  sobrou — sobra é falha do cleanup, não aviso.
- 🔴 **Cleanup de prova é uma lista de PASSOS INDEPENDENTES, e nenhuma exclusão
  roda fora da proteção** (R48 da oitava revisão final de 74afb769): o primeiro
  `generation.deleteMany` do `finally` estava fora do bloco protegido, e uma
  falha de conexão nele pulava tudo — posts, entradas, usos e sinais ficavam no
  dev e nem o `resultado.json` era escrito. `limparRodada`
  (`scripts/lib/limpeza-contexto-da-semana.ts`, sem Prisma) roda cada passo no
  próprio `try`, ACUMULA a falha e continua; a prova soma as falhas ao placar
  (saída ≠ 0) e grava o resultado e desconecta mesmo assim. Teste com banco
  falso em que só uma exclusão falha.
- ⚠️ **A grade de FEED não é lida da base**: a entrada com a cadência de feed
  (o Bacana tem uma, com tag `cadencia`) traz linhas DATADAS ("qui 03/09
  18h30"), não uma grade semanal — o parser a deixa de fora de propósito
  desde 01/09. O formato do feed vem do histórico.

- 🔴 **Só a leitura do SLIDE afirma texto de arte de modelo — o fallback da
  copy herdada nunca** (R49, revisão do commit 402c11b1). A presença do
  registro não basta: com o slot `{ content: "" }` pelo id o render descarta o
  valor pelo nome, `agendarPost` grava só o não-vazio, e o post herda
  `{ headline: "Costela" }` — que nunca foi desenhado; com registro ilegível,
  idem. Post sem página própria cuja mídia única é arte de modelo com copy, e
  que chegou ao fallback (o slide não resolveu), declara indisponível em todo
  estado. Teste: `R49` em `textos-da-peca.test.ts` (DRAFT, POSTED, no
  publicador, FAILED; sem valor aplicado e ilegível; controle com valor
  aplicado).
- 🔴 **O post que MANTÉM `pageId` também não afirma a copy bruta pelo
  fallback** (R50, nona revisão FINAL sobre a6fc900e). O post de template cuja
  arte entregue é `post-schedule` guarda os mesmos slots que o render recebeu
  (`later-scheduler` preserva id e nome endereçando a mesma camada; o render
  aplica só o do id). Sem a leitura do slide — sem registro, registro ilegível
  ou nenhum valor aplicado —, a copy do post é o registro NÃO validado do
  pedido: indisponível em todo estado entregue. A peça viva com a página
  legível responde no passo 1 e não chega ao fallback. Teste: `R50` em
  `textos-da-peca.test.ts` (POSTED, POSTING, FAILED, no publicador × três
  cenários; controles viva legível e registro válido).
- 🔴 **Página do post `NOT_NEEDED` cuja mídia é OUTRA arte é vínculo HISTÓRICO, não fonte** (R51 da revisão FINAL
  sobre 16af4e20, 13/09/2026). Trocar a arte pela GALERIA passa o post a `NOT_NEEDED` e CONSERVA `pageId`; ler a página
  ali devolvia os textos da arte anterior com origem `pagina`, antes da procedência da mídia atual (C6-03 contornado).
  `paginaDoPostEHistorica(post, arteDaMidia)` decide pelo estado que todo post já tem (`renderStatus` + a arte da mídia
  única não ser daquela página) — vale para registro antigo. Com ela a peça se resolve pela mídia, e o post conta como
  "sem página própria" para R42/R50. Leitor novo de textos de post passa `renderStatus`.
  🔴 **Só com UMA mídia.** Post sem mídia nenhuma não trocou arte por nada: a página segue sendo a fonte (legível, é lida;
  de OUTRO projeto ou apagada, INDISPONÍVEL — R29/R30). A 1ª versão tratava o post sem mídia como histórico, calava a
  declaração do R30 e zerava os textos do post `NOT_NEEDED` com página do próprio projeto; a prova-dev-36 pegou (sem
  vazamento: páginas e artes já são carregadas filtradas por projeto). Teste pelo caminho real:
  `ver-agenda-isolamento-por-projeto.test.ts`.
  🔴 **A igualdade de `pageId` não prova que a página seja a fonte** (R52 da revisão FINAL sobre 7e96c643, 18/09/2026).
  A arte de MODELO (`post-schedule`) aponta para a página do modelo — que pode ser a mesma do post — e o render aplicou
  só o valor do id quando id e nome endereçam a mesma camada; a troca pela galeria descarta o valor vazio e o post fica
  com o do nome. Com o post `NOT_NEEDED` e a mídia única numa arte de modelo, a página é histórica e vale a procedência
  da mídia (R36/R46/R47), com ou sem registro das camadas.
  🔴 **Os slots do post só entram na página quando ela RENDERIZA a mídia do post.** Com `NOT_NEEDED` e uma mídia que é
  a arte da própria página, o PNG é o da arte (mantido em dia pela recomposição); os slots que o post herdou na troca não
  são entrada de render, e aplicá-los à página editada depois devolvia o texto de antes. Sem mídia, eles SÃO a entrada
  do render que ainda vai acontecer. Testes: `ver-agenda-troca-pela-galeria.test.ts` (R52 e varredura).
  🔴 **A cópia textual que o post carrega só vale pela mídia quando é COMPROVADAMENTE daquela arte** (R53 da revisão
  FINAL sobre f96820bf, 20/09/2026). Com a página histórica, trocar a arte pela galeria por uma arte de IA SEM copy
  registrada (sem página, sem snapshot, não re-renderizada) não dispara nenhuma das duas invalidações do PR
  (`reRenderizada` e `post-schedule`) — e `trocar-arte-do-post` PRESERVA os slots nesse caso, por contrato ("null =
  não apaga", testado). O fallback devolvia "Oferta A" como `copy-do-post`/`copy-registrada` pela mídia B, com uma
  ressalva que só falava em leitura parcial. Hoje o que derruba a cópia é a EVIDÊNCIA DE TROCA
  (`midiaEDeOutraArte`): existe arte casada pela URL, ela está íntegra, e a copy registrada dela não é a do post
  (comparando os textos NÃO VAZIOS pelos dois lados — é assim que a troca os deriva); sem evidência,
  `indisponiveis` não; com ela, `indisponiveis` dizendo que o texto é de OUTRA arte. 🔴 Inferir pelo caminho da
  escrita não serve: são vários (troca pela galeria, melhoria com IA) e nenhum deixa marca.
  🔴 **O critério é EVIDÊNCIA DE TROCA, nunca "consegui conferir" — e essa distinção é o conserto de uma primeira
  versão que reprovou na prova de integração** (prova-dev-40 sobre 5058f94a, R12 e R13 em vermelho, 20/09/2026).
  Exigir a igualdade derrubava junto os dois casos em que NÃO há testemunha da mídia: sem arte casada pela URL
  (R12 — o `generationId` do post é de outra versão) e com a arte apenas RE-RENDERIZADA (R13 — é a MESMA peça
  refeita, e `renderPostArt` regrava a cópia a cada render). Nos dois, a cópia registrada no post é o registro da
  entrega daquela mídia e continua valendo, PARCIAL, como valia. Ausência de prova não é prova: só a arte
  PRESENTE e íntegra cuja copy diverge diz que houve troca. Testes por guarda em `textos-da-peca.test.ts`
  (describe R53) — cada uma desfeita por mutação derruba a sua.
  🔴 **A cópia MARCADA (`_copiaDaPagina`) entra na invalidação só por R53**, nunca pelas outras: em R37/R42/R50 a
  página do post ainda renderiza a mídia e `renderPostArt` regrava a cópia a cada render — num post `NOT_NEEDED` isso
  não acontece. Gatear as quatro portas com o `copyDoPostNaoAfirmavel` inteiro derrubaria as decisões testadas de
  R37/R42 (`copy-registrada-na-entrega` é o fallback permitido ali).
  ⚠️ **Consequência medida**: o post MELHORADO com IA que mantém `pageId` cai nesta regra — a melhoria grava
  `fieldValues.textos` (a régua), nunca `slotValues`, e nunca reescreve a cópia do post. A leitura dele passa de
  "copy do post, parcial" para indisponível. É o certo pelo contrato da casa (declarar, nunca afirmar sem prova) e
  em `refinar` a copy muda mesmo; fechar isso de verdade é a melhoria gravar a copy visual no post.
  🔴 **A evidência de troca vale para `semPaginaPropria`, não só para a página HISTÓRICA** (R54 da revisão FINAL
  sobre a996a082, 20/09/2026). O rascunho criado por `generationId` nasce com `pageId` NULO, e a MESMA troca pela
  galeria o deixava de fora do guard: "Oferta A" voltava como `copy-do-post` pela mídia B, vivo e depois da entrega.
  O residual que a 1ª rodada registrou como "decisão de produto" — "os dois estados são indistinguíveis" — valia
  contra o critério ANTIGO, o da igualdade. Com `midiaEDeOutraArte` eles se distinguem, e a prova está na ESCRITA:
  a copy de um post SEM página vem da arte (`agendarPost` grava `apenasTextos(copyVisual)`, os `slotValues` da
  própria Generation), então divergir É evidência de troca. Com página PRÓPRIA ativa (`RENDERED`) a copy continua
  legítima — o render desenha dela e `renderPostArt` regrava a cópia a cada render.
  🔴 **Post SEM cópia textual não invalida mídia nenhuma** (`if (!doPost) return false` em `midiaEDeOutraArte`):
  `copyIgual(null, null)` é FALSO, então sem essa guarda todo post entregue com `slotValues` nulo voltava com a
  ressalva de R53 no lugar do motivo REAL ("já foi entregue"). Pego pelo teste de R32.
  ⚠️ **O que muda em R32**: post sem página própria cuja arte não tem copy registrada e que CARREGA copy passa a ser
  indisponível — esse estado é o da troca, não sai de `agendarPost`. O caminho legítimo continua lido, porque a copy
  gravada no agendamento É a da arte (as duas batem); a fixture de R32 foi ajustada para a forma real.
  **Varredura da classe com `pageId: null` em mente** (os pontos que condicionam proteção à existência de página
  própria): `paginaDoPostEHistorica` (definicional — sem página não há vínculo histórico), a leitura da página viva
  (o handler só passa `camadas` com `post.pageId`, `agenda.ts:164`), `paginaIlegivel` (sem página própria quem
  declara a fonte é R32, pela mídia), R42 e R53/R54 (os dois em `semPaginaPropria`), R47/R49/R50 (sem gate de
  página) e `textosPorSlide` (dirigido pela arte, nunca por `post.pageId`). O guard de R53 era o único preso a
  `paginaHistorica`.  🔴 **A cópia anterior só sobrevive quando a arte nova a SUSTENTA — e isso se resolve na ESCRITA** (R55 da revisão
  FINAL sobre d95de3e6, 20/09/2026, a terceira variante da mesma família). **A invariante da classe: o texto que a
  agenda devolve descreve a mídia ATUAL do post, ou é declarado indisponível; nunca o texto de outra arte.**
  `trocar-arte-do-post` preservava os slots quando não sabia ler a arte nova ("`null` = não apaga"), e com uma peça
  do compositor RE-RENDERIZADA e sem `slotValues` isso produzia o estado que a leitura não tem como desfazer:
  `lerProcedencia` exige `slotValues !== null` para invalidar (`procedencia-da-copy.ts:101`), e na agenda a arte cai
  na exceção de R13 (re-render é a MESMA peça refeita) — "Oferta A" voltava pela mídia B nas duas portas
  `_copiaDaPagina`. Hoje a troca pela GALERIA apaga (`copyDaArteInvalidada || trocaDePagina || origem === 'galeria'`);
  o contrato "não apaga" fica só no ramo da PÁGINA, onde a mídia sai do render dela e `renderPostArt` regrava a cópia
  a cada render.
  🔴 **Não tente fechar isto pela leitura.** Do lado dela os dois estados são o MESMO objeto (post `NOT_NEEDED`,
  mídia única, arte re-renderizada, cópia que não confere), e a prova de integração OCUPA esse estado exigindo o
  desfecho oposto — as fixtures de R12/R13 gravam `NOT_NEEDED` + `pageId` e esperam `copy-registrada-na-entrega`.
  Foi o que a `prova-dev-40` mediu quando R53 nasceu por igualdade. Regra de leitura que feche R55 reabre R12/R13.
  **A leitura continua sendo a guarda da população LEGADA** (linha trocada antes do deploy) e do post melhorado com
  IA, que a escrita não alcança.
  🔴 **A classe é testada por MATRIZ no caminho real** (`trocarArteDoPost → handler de ver-agenda`, banco falso,
  serviço e handler reais): página própria (histórica · nenhuma) × cópia anterior (marcada · própria · nenhuma) ×
  arte nova (íntegra com copy · íntegra sem copy · re-renderizada sem slots · re-renderizada com slots e sem
  marcador · re-renderizada com `copyVisualRegravada` · de modelo com registro) × rascunho/entregue = 72 células,
  cada uma exigindo as duas metades da invariante. Célula nova da família nasce coberta. **Carrossel fica de fora**
  (leitura slide a slide, nenhum fallback do post a alcança — R15/R20) e a troca pela PÁGINA também (é o único ramo
  em que a cópia sobrevive, de propósito).
  ⚠️ **Depois da correção na escrita, a matriz não exercita mais o guard da LEITURA** — ela nunca chega ao estado
  que ele protege. Mutação nele (`semPaginaPropria → paginaHistorica`) só é pega pelos testes que reinjetam a cópia
  velha como linha legada. Teste de guard de leitura nesta classe precisa montar o estado à mão.
  🔴 **Correção na ESCRITA exige comprovar o LEGADO, e isso se conta em produção — por leitura pura**
  (PR6-F01, 20/09/2026). A regra de escrita só alcança a linha NOVA; a linha gravada antes do deploy fica, e
  nenhum teste responde se ela existe. `scripts/contar-copia-de-outra-arte.ts` (somente leitura, sem `update` e
  sem migration) classifica os candidatos com os MESMOS predicados exportados que `ver-agenda` usa
  (`arteDosFieldValues`, `paginaDoPostEHistorica`, `arteEntregue`) — medir com uma cópia das regras mede outra
  coisa. Medido em 20/09/2026 contra o endpoint `ep-fragrant-term-adnufsao-pooler`: **290 candidatos**
  (`NOT_NEEDED` + 1 mídia + `slotValues::text <> 'null'`), 284 com arte casada pela URL, e **ZERO** em F01; as
  12 com cópia marcada e arte íntegra são o caso que R53/R54 já comparam.
  🔴 **Conte pelos DOIS lados.** F01 exige arte RE-RENDERIZADA, e pelo lado da ARTE existem **5** em toda a base
  (`recomposicao.estado = 're-renderizada'`, criadas em 09–10/09/2026, nenhuma com `slotValues`), usadas por **1**
  post — um carrossel de 4 slides, sem página e sem cópia textual, que nem candidato é. Uma direção confirma a
  outra; o script faz as duas numa rodada.
  ⚠️ **A contagem tem DATA.** Até o deploy a escrita antiga segue em produção e pode criar a linha — mesmo
  precedente de `scripts/marcar-copia-da-pagina.ts` ("rode de novo depois dele"). Rodar o contador de novo custa
  uma leitura; aparecendo linha, o caminho é saneamento com dry-run (`--confirmar` para escrever, **sem backfill
  de texto inventado**: o que não se sustenta vira ausência, nunca palpite), nunca guarda nova na leitura.
  🔴 **O PR 6 LÊ a vizinhança que o #142 mudou, e a leitura tem de seguir o render** (rebase de 20/09/2026,
  `origin/main` em 17ff3e1a). `slotValuesParaRender` ganhou o parâmetro `paginaEhModelo` e passou a devolver
  NADA em página de CONTEÚDO — o render deixou de aplicar os slots do post ali. `textos-da-peca.ts` chamava a
  função em DOIS lugares, e o `tsc` acusou os dois (arity), mas **a resposta certa é diferente em cada um**,
  porque são PERGUNTAS diferentes:
  - `copyDaArteDeModelo` e o fallback `copy-do-post` perguntam "esta cópia é PRÓPRIA do post, ou é cópia da
    página?" — quem responde é a marca `_copiaDaPagina`, e a pergunta vale mesmo quando não há página nenhuma
    (post cuja página virou vínculo histórico). Passar `true` ali só para reaproveitar a função AFIRMARIA que a
    página é modelo sem saber. Por isso a pergunta ganhou nome próprio: `copyPropriaDoPost`, e
    `slotValuesParaRender` passou a delegar a ela (comportamento da main preservado, byte a byte).
  - `slotsDoRender` (a peça VIVA lida com os slots por cima da página) pergunta "o que o render vai desenhar?",
    e essa É a do #142: hoje chama `slotValuesParaRender(sv, fontes.paginaEhModelo === true)` — a MESMA função
    que `story-renderer` chama, para os dois não divergirem. `FontesDaPeca.paginaEhModelo` vem do handler
    (`Page.isTemplate`, no mesmo `select` das camadas); ausente = NÃO é modelo, que é o lado conservador.
  **Nenhuma célula da matriz de R53/R55 muda de desfecho**: as 72 são `NOT_NEEDED` com uma mídia, e ali
  `slotsDoRender` já era forçado a `null` (os slots herdados na troca não são entrada de render nenhum). Quem
  muda é a peça VIVA com página PRÓPRIA — fora da matriz e coberta pelo controle da galeria, que passou a
  esperar `origem: 'pagina'` com os textos da página. As 6 fixtures de `textos-da-peca.test.ts` que exercitam
  o caminho de template passaram a declarar `paginaEhModelo: true`: o intento delas sempre foi o MODELO
  ("texto do modelo", "Título do modelo"), e agora isso está escrito em vez de implícito.
  **Mutação** (o que cada metade guarda): `slotsDoRender` de volta a `proprios` → 1 falha (o controle da página
  de conteúdo); `proprios` trocado por `slotValuesParaRender(...)` → 6 falhas (o fallback some em toda peça sem
  página). A prova de integração cobre os DOIS lados no caminho real — página de conteúdo devolvendo a página, e
  uma página MODELO (quando o projeto tem uma com texto) em que os slots continuam vencendo.
### O compositor consome o contrato sem conversão implícita (PR 4 de "Marca simples, copy melhor", 12/09/2026)

Até aqui o compositor recebia `Bloco[]` por papel e TRANSFORMAVA texto sem
registro: a última linha da manchete virava voz 2 sozinha, o CTA ganhava uma
seta que a copy não tinha, fonte que não carregou no servidor saía medida na
fonte de fallback como se a medida valesse, e a recomposição podia trocar de
variante. Módulos puros com teste: `segunda-voz.ts`, `medidas.ts`;
`scripts/validar-compositor-fiel.ts` é a prova de integração no branch de dev.

- **A segunda voz da manchete é do AUTOR** (`estilo.linhasNaVoz2` no contrato,
  `dividirManchete`): com contrato, só as linhas DECLARADAS vão para
  `headline2` — e têm de ser o fim contíguo da manchete (`validarCopyAutoral`
  recusa o resto); sem declaração, a manchete inteira fica na voz 1 mesmo com
  `headline2` na variante; declaração numa variante SEM voz 2 vira aviso e a
  efetiva registra o estilo como revisão do sistema — nunca some em silêncio.
  Sem contrato (legado) vale a regra antiga: a última linha.
  🔴 Manchete INTEIRA na voz 2 não gera camada de voz 1 vazia, e a efetiva lê
  a `headline2` como a própria manchete (id preservado, índices do zero) — sem
  isso o bloco saía vazio com índice para linha inexistente e a camada virava
  `extra-headline2` (R01 da revisão do Codex).
- **O prefixo que a assinatura desenha antes do texto (o "→ " do CTA) é
  DECLARADO** em `metadata.compositor.prefixo` e descontado por
  `copyEfetivaDasCamadas`; prefixo sem declaração conta como diferença entre o
  escrito e o desenhado — `ver-geracao` mostra, ninguém "corrige" a efetiva.
- 🔴 **Fonte que não carregou no servidor é "não medido", nunca medida.**
  `familiasNaoCarregadas` (`GlobalFonts.has`) confere TODAS as famílias que a
  camada usa — a do estilo E as dos trechos de rich text (`familiasDaCamada`; o
  destaque costuma estar na versão pesada, e é com ela que a largura extra é
  medida). Ausente → aviso, `composicao.fontesNaoCarregadas`,
  `blocos[].naoMedido` e `medidasFinais[].naoMedido` (R02).
- **`composicao.medidasFinais`** (`medidasFinaisDasCamadas`): corpo, entrelinha
  (do `autoWrap`), caixa arredondada, número de linhas e prefixo de cada texto
  COMO FOI GRAVADO, depois do autofix — é o que `ver-geracao` e a métrica da F2
  leem. A prova casa cada medida com a camada final por id.
- 🔴 **Um bloco espalhado por várias caixas do mesmo papel volta a UM bloco**
  (PR4-01 da revisão final do Codex, 18/09/2026). `distribuirLinhas` põe uma
  linha por caixa quando o arranjo tem mais de um texto do papel (duas caixas
  de voz 2, Local + Horário), e a efetiva lia só a primeira: a segunda virava
  `extra-…`, com revisão falsa, e o bloco `livre` com texto travava a
  recomposição em `validarSpec`. Quem resolve isso é a marca do VÍNCULO do
  PR 3 (`metadata.compositor.bloco` = o **id** do bloco do contrato, com as
  posições em `linhas`, rastreadas por `juntarNoGrupo`/`distribuirLinhas`): a
  camada volta ao bloco que declara e fica RESERVADA para ele, então as duas
  caixas do mesmo papel voltam juntas. Camada sem a marca (posta à mão no
  editor) continua lida como antes — nada é juntado por palpite.
  🔴 **O PR 4 chegou a ter a sua própria marca** (`blocoDaCopy` = índice em
  `spec.blocos`, com `continuacoes`/`tomar` em `efetiva.ts`); no rebase sobre a
  main de 20/09/2026 ela foi RETIRADA em favor da do PR 3, que é a mesma ideia
  pelo id do contrato — estável através da conversão spec↔contrato — e mais
  ampla (reserva a camada, trata a voz 2 declarada, a voz 1 escondida e o bloco
  vazio: PR3-R9-02, R10-01, R11-01/02, R12-01, R13-01). **Não reintroduza
  `blocoDaCopy`**: duas marcas para o mesmo fato é como a junção `c35c2918` foi
  necessária da primeira vez. `validarSpec` já recusa papel repetido, então
  cada função tem no máximo um bloco no compositor.
- 🔴 **Id de camada é único na PEÇA inteira, nunca por grupo** (varredura do PR
  3, 18/09/2026): o contador de repetição de papel recomeçava a cada grupo, e o
  serviço repartido entre dois grupos (horário junto da oferta, endereço no pé)
  saía com duas camadas `servico` — ajuste por id (revisor, `ajustar-arte`)
  atingia as duas, e `elementosPorTexto`, chaveado pelo id, perdia o ícone do
  primeiro grupo. A logo presa a um grupo (`logo`) também ganha sufixo quando
  outro grupo já a tem. Gerador novo de camada no compositor confere contra os
  ids que a peça já tem.
- 🔴 **Manchete só na voz 2 continua sendo a manchete no LAYOUT** (PR4-02): o
  grupo principal é o que tem `headline` OU `headline2` (sem isso o pré-título
  em grupo separado herdava a posição pedida e o mapa da foto), e `vaoEntre`
  dá vão de manchete antes de `headline2` que não segue outra voz da manchete
  (antes encostava no pré-título como se fosse lockup). Estado novo que o PR
  cria precisa ser conferido em todo consumidor que perguntava pelo papel antigo.
- **A recomposição fixa a VARIANTE pelo id da página** da composição original
  (`preferencias.varianteOriginal = composicao.assinatura.pageId`; motivo
  `fixada por id`; o id vence o nome que o contém em `escolherVariante`) — a
  edição de texto não pode trocar a peça de variante.
  🔴 O id é procurado ANTES do filtro por formato (PR4-03): a peça de feed que
  nasceu na assinatura de STORY (o fallback quando não havia a de feed)
  continua com ela depois que o projeto ganha uma de feed — antes a
  recomposição recusava com `ASSINATURA_INCOMPLETA`. E a fixação da
  recomposição vai em `varianteOriginal`, não em `variante`: a página pode ter
  sido arquivada (as stories do Quintal e do TERO foram, em 11/09), e aí a
  escolha automática segue, com o motivo dizendo que a original não existe
  mais. `variante` continua sendo o pedido explícito — ausente é recusa.
- `PAPEIS_INCOMPATIVEIS` continua até a camada extra (F3): papel que a variante
  não tem recusa, nunca some.

**Da revisão FINAL do Codex sobre b5c2bd5b (BLOQUEADO, PR4-FINAL-01…02, 21/09/2026).**
Os dois são a MESMA forma: uma decisão tomada por PROXY (o primeiro bloco do
papel; a medida de fallback) em vez de pela identidade ou pelo fato já resolvido.

- 🔴 **A declaração da segunda voz vem do bloco que ORIGINOU a manchete — o id
  já resolvido em `blocoDoPapel` —, nunca do primeiro `headline` do contrato**
  (PR4-FINAL-01). O contrato aceita um bloco `headline` VAZIO ao lado do
  preenchido: `blocosParaOCompositor` omite o vazio (`legado.ts:227`), então
  `validarSpec` não vê papel repetido e a entrada passa. Pelo primeiro, a busca
  caía no vazio e recebia `null`: a manchete saía inteira na voz 1 **mesmo com
  `headline2` na assinatura**, sem o aviso de voz 2 indisponível, e a leitura
  seguinte registrava a mudança de estilo como decisão do compositor. É a mesma
  identidade que vincula as camadas (`metadata.compositor.bloco`) — decidir por
  proxy foi o defeito.
- 🔴 **As fontes são conferidas ANTES das decisões de encaixe, e a RECUSA diz
  quando a medida não vale** (PR4-FINAL-02). Família que não carregou faz o
  medidor cair no FALLBACK, e é dessa medida que saem a escada de encolhimento e
  o ORÇAMENTO de caracteres. `familiasNaoCarregadas` era consultada só no fim,
  depois do `throw` de `TEXTO_NAO_CABE_NA_COLUNA`: a recusa mandava reescrever a
  copy por um número que este mesmo PR declara inválido. Hoje o conjunto é
  calculado antes do laço (superconjunto: estilo de cada papel da assinatura e de
  cada arranjo candidato, mais a família do trecho DESTACADO — R02), a recusa do
  bloco cuja família falta sai com `naoMedido: true` + `fontesNaoCarregadas` e
  **sem orçamento**, e a mensagem manda cadastrar a fonte. O diagnóstico do fim
  filtra o superconjunto pelo que as camadas FINAIS usam, para o aviso não citar
  fonte de arranjo que não foi escolhido.
  🔴 **Quais famílias a recusa cita vem da PRÓPRIA recusa (`familiasMedidas`),
  nunca de uma releitura dos colchetes em quem chama** (PR4-R2-01 da segunda
  revisão FINAL, 21/09/2026). A 1ª correção somava `destaqueDoBloco?.fontFamily`
  INCONDICIONALMENTE, mas `montarBloco` só ativa o destaque com trecho entre
  `[colchetes]` **e** estilo de destaque cadastrado (`blocos.ts`), e só então
  mede a largura extra: marca configurada com fonte de destaque ausente e copy
  SEM colchetes teve tudo medido na base — que está carregada — e ainda assim
  perdia o `caracteresQueCabem`, com a recusa mandando cadastrar uma fonte que
  aquele bloco não usa. O inverso do defeito que o FINAL-02 veio consertar.
  `RecusaDeBloco.familiasMedidas` é a resposta de quem MEDIU (estilo sempre;
  destaque só quando participou), e `compor.ts` a intersecta com `semFonte`.
  **Não copie a regra dos colchetes para fora de `montarBloco`** — a divergência
  entre as duas leituras é como o defeito volta. O superconjunto continua largo
  de propósito: ele é só o cache de "esta família carregou?", e o que a recusa
  DIZ é sempre a interseção com as famílias daquele bloco — família de outro
  papel ou de arranjo não escolhido não tem como chegar nela.
- **Varredura das duas formas** (pedida com os consertos): *escolha por papel em
  vez do id* — os únicos consumidores de `copyAutoral.blocos` no compositor são
  `blocoDoPapel` (filtra `linhas.length > 0`, e `validarSpec` recusa papel
  repetido entre os blocos COM texto, então é 1:1) e a linha corrigida;
  `combinacoes.ts:279` (`find(papel === 'headline') ?? itens[0]`) lê o ARRANJO da
  página de assinatura para escolher a referência de alinhamento — não há id de
  contrato ali, é o template; `efetiva.ts:499` (primeira `headline2` livre) é a
  RESERVA documentada do PR 3, que só roda quando não há marca. *Medida de
  fallback virando número* — `medidasFinais[]` e `diagnostico.blocos[]` já
  carregam `naoMedido` (R02); o único número que mandava AGIR era o orçamento da
  recusa, agora coberto. ⚠️ Fica o aviso "fonte reduzida a N% para caber na
  coluna", que também nasce da medida de fallback: ele descreve o que a
  composição FEZ (a escala está mesmo gravada na camada) e não pede ação, e o
  mesmo bloco já sai com `naoMedido` e com o aviso de que a medida não vale —
  acrescentar ressalva ali seria ruído.

### Medir antes de compor: `ver-assinatura` por variante e `medir-copy` (PR 8 de "Marca simples, copy melhor", 12/09/2026)

Quem escreve a copy no chat precisava de uma medida VERIFICÁVEL antes de gastar
uma composição: o único jeito de saber se a manchete cabia era compor e ler a
recusa, e o orçamento vinha de cabeça nas instruções ("headline até ~18
caracteres") — igual para toda marca. Módulo PURO com teste:
`src/lib/compositor/medir-copy.ts`; serviço em `medir-copy-service.ts`. Sem
migration. Prova no branch de dev: `scripts/validar-medir-copy.ts` (confere
que NADA é gravado e que a medida é a da composição).

- 🔴 **A MESMA PREPARAÇÃO da composição, nunca uma conta paralela**: a
  preparação dos blocos — agrupamento pela página de assinatura, escolha do
  arranjo de cada grupo (página ou combinação salva), distribuição das linhas
  (horário no texto do horário, endereço no do endereço), segunda voz, estilo
  de cada texto, ids (`servico`, `servico-2`, `headline2`) e a montagem com a
  régua — saiu de `comporPeca` para `preparar-blocos.ts` (puro), e `medirCopy`
  a chama com o medidor do render. Uma medição por `assinatura.papeis[papel]`
  dizia "cabe" para uma copy que a composição recusava (R01 da revisão do
  Codex). A prova compara bloco a bloco, pela IDENTIDADE e na ordem: id, papel,
  escala, largura, altura, "não medido" e os arranjos — IDÊNTICOS.
- **A escolha da variante é a da composição** (`chaveDaPeca` num lugar só; a
  foto entra pela luz clara/escura e pela chave do rodízio, como em
  `comporPeca`). Sem variante pedida e sem a foto, a escolha é declarada
  PROVISÓRIA (`escolhaProvisoria` + `comoFixar`): quem compõe fixa
  `preferencias.variante` com o id medido (R02).
- **As famílias que a montagem PEDE são sabidas antes de montar**
  (`familiasPedidas`: a do papel e, com [colchetes], a do destaque): valem
  também no bloco RECUSADO — a recusa medida no fallback é `naoMedido`, com a
  família ausente declarada e as medidas por linha invalidadas (R03).
- **A medida é dita pelo que é**: `cabe` (escala 1), `cabe-reduzido` (fonte
  encolhida até o piso de 80%, com a escala), `nao-cabe` (com o orçamento por
  linha — os mesmos `caracteresQueCabem` da recusa `TEXTO_NAO_CABE_NA_COLUNA`)
  e `papel-ausente` (a variante não tem o papel; declarado, nunca some).
  🔴 **`naoMedido` = a fonte do papel não está carregada no servidor**
  (`familiasNaoCarregadas`): os números saíram na fonte de fallback e NÃO
  valem — a tool devolve os números E o aviso, nunca finge que mediu.
  **`aproximado` = há destaque entre [colchetes]**: o trecho ganha outra
  família e a largura extra é estimada trecho a trecho (o medidor do servidor
  não mede rich text).
- 🔴 **O destaque alarga a linha na MESMA conta da montagem, nos três lugares**
  (`larguraExtraDoDestaque`, exportada de `blocos.ts`): a montagem, a medida
  por linha e o orçamento da recusa somam o quanto os trechos entre
  [colchetes] crescem na família pesada. Sem isso, com destaque em família mais
  larga e fontes disponíveis, o bloco dizia `nao-cabe` enquanto a única linha
  dele dizia `cabe` e o orçamento vinha VAZIO (R08 da revisão de fd82505c). O
  destaque só conta como na montagem: [colchetes] na copy E estilo na marca; o
  bloco preparado carrega o `destaque` com que foi medido. Teste com régua
  sensível à família.
- 🔴 **`ver-assinatura` declara as fontes ausentes de TODOS os textos
  reconhecidos da variante** (`familiasUsadasNaVariante`, puro): `montarAssinatura`
  guarda só o PRIMEIRO estilo de cada papel, e a família própria do segundo
  serviço (o endereço em "Fonte Rara") sumia de `fontesNaoCarregadas` mesmo
  detectada entre as cadastradas — o texto era medido em fallback sem aviso
  (R09). Camada oculta e camada sem papel ficam de fora. `descreverVariantes` é
  testado com o serviço mockado (Prisma, medidor e registro de fontes).
  🔴 **O destaque AUTOMÁTICO conta** (R11 da revisão de 775f4377): com
  `destaque.pesado: true` a composição resolve a família pesada do papel entre
  as CADASTRADAS (`familiaMaisPesada`), e `familiasUsadasNaVariante` faz a
  mesma conta (`estiloDeDestaqueDoPapel`, a função da preparação dos blocos)
  — só com as famílias explícitas, `ver-assinatura` dizia "nenhuma ausente"
  enquanto `medir-copy` com [colchetes] declarava a "Barlow Bold" ausente.
- 🔴 **`medir-copy` é LEITURA e não escreve no Blob** (R10 da revisão de
  775f4377): `carregarFoto` do compositor resolve a foto do Drive por
  `resolveImageUrl`, que PUBLICA `drive-cache/<id>-s1920.jpg` (público,
  sobrescrevendo) — certo para compor, errado para medir. A medição lê os
  bytes por `carregarFotoParaMedir` (`foto-para-medir.ts`: a URL dada, ou a
  miniatura grande do Drive, sem `put`); a luz e a escolha da variante saem
  iguais. O módulo não importa `@vercel/blob` nem `persist.ts`, e há teste
  que confere isso no fonte. A prova mede com uma foto real do acervo (Drive
  só leitura).
- **O orçamento ANTES do texto** (`orcamentoDaVariante`) é medido com uma
  amostra em português (`AMOSTRA_DO_ORCAMENTO`) na fonte real de cada papel:
  caracteres por linha e linhas na altura útil, por variante. É aproximado por
  construção (a largura de uma linha depende das letras dela) e dito assim.
  As instruções do conector deixaram de dar o número de cabeça.
- **`ver-assinatura` descreve CADA variante** (`descreverVariantes`): estilos
  próprios por papel (fonte, `fonteDisponivel`, tamanho já na escala do
  formato pedido, cor, caixa, prefixo, destaque, grupo, alinhamento), papéis,
  `aceitaServico`, `temSegundaVoz`, a área útil do formato (coluna = largura −
  2·margem; altura = altura − safe topo − safe rodapé; `escalaDoFormato`), o
  orçamento e as fontes não carregadas. Até aqui os detalhes eram só da
  variante carregada, e as outras apareciam pelo nome e pelos papéis.
- **`medir-copy` escolhe a variante como a composição** (`carregarAssinatura`
  com os mesmos critérios: id/nome/tag pedido, papéis, tema) e mede a copy
  também contra as OUTRAS variantes do formato (`outrasVariantes`: cabe tudo?
  falta papel? reduzido?) — é a "capacidade medida" para escolher a variante
  pela mensagem, sem trocar a escolha da composição.
- **Nada é gravado**: nem página, nem Generation, nem sinal, nem Blob. A prova
  conta as tabelas antes e depois; `comporPeca(…, { provar: true })` na prova
  renderiza em memória e não persiste (é a tool `compor-arte` que sobe a prova
  ao Blob, não o serviço).
- 🔴 **Provisório é pela LUZ disponível, e a fixação é variante E arranjos**
  (R12 e R13 da revisão de 4b326e7c). `escolhaProvisoria` era `!spec.foto`:
  foto pedida que NÃO carregou (Drive fora do ar, `foto: null` com aviso)
  passava como contexto suficiente e a tool omitia o `comoFixar` — com a foto
  carregando na composição seguinte, a luz clara/escura mudava a variante.
  Hoje a provisoriedade sai de `luzDaFoto === null` (sem foto OU foto não
  medida), com `motivosDaProvisoriedade` e um aviso. E fixar só a variante
  não fixava o segundo sorteio: a chave da peça (`chaveDaPeca`) inclui a foto
  e é a chave do rodízio de ARRANJOS também — medir sem foto e compor com
  foto podia trocar fonte, tamanho e distribuição das linhas de um arranjo
  empatado, e uma copy medida como `cabe` ser recusada. A medição devolve
  `fixacao: { variante, arranjos }`; `comoFixar` manda repetir a medição com a
  foto definitiva ou passar os DOIS em `preferencias` ao compor (o compositor
  honra `preferencias.arranjos` como "mantido"). Prova 3c: a medição COM a
  foto e a fixação da medição sem foto reproduz variante e arranjos.
- 🔴 **A fixação é POR GRUPO e tem de passar pela porta pública** (R14 e R15 da
  revisão de 4413e0a1). `preferencias.arranjos` não estava no schema público de
  `compor-arte`/`compor-leva`: a porta faz `safeParse` e o zod aninhado
  DESCARTA a chave desconhecida — `comoFixar` mandava um campo que nunca
  chegava ao compositor. E a lista `[A, B]` sem grupo colapsava dois grupos de
  serviço com combinações distintas no primeiro id da lista. Hoje o arranjo
  fixado é `{ grupo, arranjo }` (`arranjoFixadoSchema`; a string nua é legado e
  vale para qualquer grupo), `escolherArranjo` recebe o `grupo`, a spec gravada
  e a `fixacao` da medição carregam o par, e o schema público declara o campo
  (fixture do registro atualizada de propósito). Teste do parse pela porta em
  `src/lib/mcp/__tests__/compositor-preferencias-arranjos.test.ts`.
- **Download ou decodificação da foto falhando NÃO aborta a medição** (R16 da
  revisão de 5d628520): `carregarFotoParaMedir` devolve `{ foto: null, aviso }`
  também quando `fetchBuffer` rejeita (403/503 do lh3, conexão) ou o sharp não
  lê os bytes — a medição segue provisória, como sem foto, sem publicar nada.

### As vias consomem o contrato: modelo por PAPEL, IA com escrita × enviada × lida (PR 5 de "Marca simples, copy melhor", 12/09/2026)

O PR 4 fez o compositor fiel; as OUTRAS vias — o modelo (`createArteRapida`,
`executar-plano` via template, `criar-arte-de-modelo`), a IA
(`startArtGeneration`, `gerar-imagem`), a melhoria e a conferência — ainda
recebiam a copy como lista posicional e não registravam nada. Módulos puros com
teste: `planos/execucao.ts` (`mapearContratoParaCampos`, `papelDoCampo`),
`copy-autoral/registro-da-arte.ts`; prova de integração no branch de dev:
`scripts/validar-vias-da-copy.ts`.

- **Na via de MODELO o bloco casa com o campo do MESMO PAPEL, nunca por
  posição** (`mapearContratoParaCampos`): o papel do campo é o declarado da
  camada (`metadata.compositor.papel`) ou o que o NOME diz (Pré-título,
  Título, Subtítulo, Chamada, Horário); nome que não diz nada é `null`. Bloco
  sem campo do seu papel vai só para campo SEM papel reconhecido (declarado
  como `posicao`) — o campo de manchete não recebe o serviço só porque sobrou;
  o que sobrar fica em `semCampo` e no aviso, nunca perdido em silêncio. Bloco
  `linhas: []` não ocupa campo; campo sem copy fica oculto, como sempre. Os
  `[colchetes]` saem (o modelo desenha texto simples) e a quebra do autor fica.
  Sem contrato, `mapearCopyParaSlots` (posicional) continua para o legado.
- **O slot deixa de ser só texto**: `{ content, papel, bloco }`, e `bakeLayers`
  carimba `metadata.compositor.{papel,bloco}` na camada. É o carimbo que faz a
  leitura da copy efetiva reencontrar o bloco numa camada de id UUID — sem ele
  a via de modelo relia o contrato como `extra-<uuid>`.
- **A arte de modelo grava o mesmo registro do compositor**: `Page.copyAutoral =
  efetiva` (superfície `modelo`) e `fieldValues.copyAutoral = { original,
  efetiva, comparavel, lacunas }`. `ver-geracao` mostra.
- 🔴 **Na via de IA não há camada, e o registro DIZ isso em vez de fingir uma
  efetiva** (`registro-da-arte.ts`): `original` (o contrato), `enviada` (os
  blocos como FORAM ao modelo de imagem), `conferencia` (o que a visão leu, o
  que faltou, se passou, a régua) e a lacuna `LACUNA_SEM_CAMADAS`.
  `ver-geracao` devolve `comparadoPor: 'visao'` e a arte só é `comparavel`
  quando a conferência RODOU (`passou !== null`).
  🔴 **`enviada` é LIDA do prompt que saiu, nunca a transformação que o sistema
  aplicaria** (`enviadaNoPrompt`, PR5-10 da revisão final do Codex, 18/09/2026):
  o `finalPrompt` de quem chamou vai verbatim, e o prompt montado por código
  (`buildArtePrompt`, os moldes das portas, o `[TEXTO EXATO]` da melhoria)
  colapsa espaços — e com eles a quebra. Gravar a caixa da marca como enviada
  punha na conta do gerador uma diferença nascida no registro. Cada bloco é
  procurado no prompt (forma da marca, forma crua, cada uma também com espaços
  colapsados); bloco que não aparece deixa `enviada` AUSENTE com a lacuna
  dizendo qual. A criação da Generation não conhece o prompt: grava o registro
  sem `enviada` e com `LACUNA_PROMPT_AINDA_NAO_MONTADO`, que o runner troca
  (`comEnviada`); na melhoria o prompt exato chega por
  `improveCreative.aoMontarPrompt`. Sem `enviada`, `ver-geracao` segue
  comparando por visão quando a conferência rodou.
- **Com `copyAutoral`, `startArtGeneration` deriva a copy do contrato** (blocos
  com texto, em ordem, linhas do autor unidas por quebra) e RECUSA `copy` que
  divirja dele (`COPY_DIVERGE_DO_CONTRATO`). O contrato viaja nos args do
  runner, que fecha o registro no sucesso; a falha preserva o registro da
  criação (`fieldValuesPreservando`).
- 🔴 **`copyComCaixaDaMarca` preserva a QUEBRA do autor**: o colapso de espaços
  vale dentro de cada linha, nunca sobre o "\n" — antes ele apagava a quebra
  antes de a copy chegar ao prompt. A linha VAZIA interna ("Almoço", "", "em
  família" — o contrato permite) também passa: o filtro de linha vazia apagava
  o respiro do autor antes do diretor de arte (PR5-09). ⚠️ Os caminhos de
  FALLBACK (`buildArtePrompt`, os moldes das portas, o `[TEXTO EXATO]` da
  melhoria) continuam colapsando a quebra — o prompt deles não foi mexido; o
  registro diz isso em `enviada`.
- **A melhoria PROPAGA o contrato pela cadeia como a régua** (`copyAutoral.original`
  da arte de origem). Em `refinar`, copy trocada pelo pedido vira REVISÃO
  EXPLÍCITA de `claude` com o pedido como motivo (`revisaoPosicional`, a mesma
  regra do item de plano: casou posição a posição, é revisão; não casou, a
  lacuna diz e o texto enviado é o do pedido). A caixa da origem
  (`aplicarCaixaDaOrigem`) NÃO conta como revisão: bloco igual ao do contrato a
  menos de caixa/acento mantém as linhas do autor. Gravado no sucesso, na falha
  de cobrança e na falha.
  🔴 **Só quando a imagem melhorada É a arte daquela Generation**
  (`contratoDaOrigemDaMelhoria`, PR5-08): melhorar o slide 2 pela agenda manda o
  `generationId` do post (a arte do slide 1) com a URL do slide 2 — o serviço
  marca `skipTextVerification` e descarta os textos esperados, e o contrato cai
  junto. Sem isso a melhoria de B gravava a copy autoral de A como a sua e a
  levava pela cadeia. A ausência é dita (`fieldValues.copyAutoralNaoHerdada`).
  Tudo que se lê da Generation de origem é de UMA imagem: dado novo que a
  melhoria herde dela passa pelo mesmo portão.
- **`conferir-arte` devolve a metade que faltava**: `textoAMais` (com dado é
  alerta), `grafiaDivergente` e a `copy` da arte quando ela tem contrato —
  avisa, nunca veta.
- **Fixtures do registro MCP** (`criar-arte-de-modelo`, `gerar-imagem`)
  atualizadas nos mesmos commits — mudança deliberada do schema.
- ⚠️ **Carrossel de IA e `criar-arte` (textos livres) continuam sem contrato**:
  o slide vive em `slides[].copy` posicional e a arte livre não passa por
  `startArtGeneration` com contrato. É lacuna declarada, não regressão.

**Da revisão FINAL do Codex sobre 2269eec9 (BLOQUEADO, PR5-11…13, 21/09/2026).**
Os três são a mesma família: **o registro afirmando mais do que sabe** — "enviei
o texto" quando só achou um pedaço, "o sistema transformou" quando não
transformou, "foi o Claude" quando foi a equipe.

- 🔴 **`enviada` exige o bloco INTEIRO numa ocorrência LIVRE** (PR5-11,
  `enviadaNoPrompt`). O `includes` cru achava `R$ 20` dentro de `"R$ 200"` e
  `Venha hoje` dentro de `"Venha hoje mesmo"`, e gravava `enviada` sem lacuna:
  a diferença que ENTROU no prompt ia para a conta do gerador. E a mesma
  aparição servia a vários blocos — dois blocos iguais com uma ocorrência só
  passavam como dois enviados. A fronteira é a borda do prompt, a quebra de
  linha ou a ASPA, que é como TODO caminho da casa escreve a copy: `- "bloco"`
  (`buildArtePrompt`, `[TEXTO EXATO]` da melhoria), `"bloco"` por linha
  (`prompt-da-referencia`) e o bloco sozinho na linha (`prompt-do-manual`).
  Cada ocorrência é consumida por UM bloco. Prompt pronto que embuta a copy no
  meio de uma frase corrida não permite dizer o que saiu: vira lacuna, que é o
  comportamento pedido — nunca um palpite.
- 🔴 **Conteúdo NOVO não herda a DECLARAÇÃO de prefixo da camada anterior**
  (PR5-12, `semPrefixoHerdado` + `bakeLayers`). `metadata.compositor.prefixo`
  descreve o ornamento que o COMPOSITOR desenhou (a seta antes do CTA), e quem
  preenche a camada escreve o texto tal e qual. Herdada, `linhasDaCamada`
  descontava da leitura um "→ " que agora é TEXTO DO AUTOR: o modelo com
  `prefixo: '→ '` recebendo um bloco que começa pela mesma seta mostrava
  "→ Venha hoje" na arte e gravava "Venha hoje" no contrato — uma transformação
  do sistema que nunca aconteceu, e é assim que isto encosta no PR 4. A camada
  que NÃO recebe conteúdo novo continua declarando o prefixo; quem preencher
  ACRESCENTANDO ornamento declara de novo.
  **`bakeLayers` mudou de casa** (`src/lib/creatives/bake-layers.ts`, PURO):
  `arte-rapida.ts` importa o Prisma, e esta decisão precisa ser conferida sem
  banco — é a regra da casa para código testável.
- 🔴 **O refino é assinado por QUEM PEDIU, nunca sempre por `claude`** (PR5-13,
  `autorDoPedido`). A rota da interface chama o MESMO serviço do conector, e o
  runner cravava `autor: 'claude'`: a pessoa pedia a troca de texto pela tela e
  o histórico dizia que quem mexeu foi o assistente — autoria errada seguindo
  pela cadeia nas melhorias seguintes, o oposto do que o contrato existe para
  fazer. A distinção já existe e é o CANAL (`creatives/canal.ts`), decidido na
  porta de entrada: a rota passa `canal: 'studio'` (→ `equipe`), o conector
  passa o canal do principal (→ `claude`). O canal viaja em
  `ImprovementJobArgs`; job enfileirado antes disto não tem canal e fica em
  `desconhecido` — o conservador. Caminho novo que registre autoria de copy a
  partir de um pedido usa `autorDoPedido(canal)`, nunca um literal.
- **Varredura das três formas no PR** (pedida com os consertos): *autor fixo* —
  os outros dois literais são corretos por construção (`equipe` no PATCH do
  editor, que é a UI da pessoa logada; `sistema` na reconciliação com as
  camadas anteriores); *substring numa afirmação do registro* — só
  `enviadaNoPrompt`; `PAPEIS_DO_MODELO.includes` e `comTexto.indexOf(b)` são
  pertinência e identidade em ARRAY, não texto. *Herança de metadado* — o único
  ponto que escreve camada é `bakeLayers`, e ali `papel` e `bloco` também são
  herdados: **descartado com razão**, porque na via COM contrato o carimbo os
  sobrescreve em toda camada que recebe copy, e a que não recebe fica OCULTA
  (`ehTextoVisivel` a tira da leitura); na via legada não há contrato na página
  para lê-los. Só o `prefixo` alcançava uma leitura.

**Da revisão FINAL do Codex sobre c0e2649b (BLOQUEADO, PR5-11-R2, PR5-12-R2, 21/09/2026).**
As duas são as correções anteriores ficando curtas na fronteira, e a mesma
lição: **a guarda tinha sido escrita a partir do caso do exemplo, não da
regra** — "terminou antes de `\n`" no lugar de "é o bloco inteiro", "o
conteúdo mudou" no lugar de "veio conteúdo".

- 🔴 **A unidade de `enviada` é o BLOCO COMPLETO, nunca a vizinhança de um
  pedaço** (PR5-11-R2). `enviadaNoPrompt('[TEXTO EXATO]\n- "Venha hoje\nmesmo"',
  [['Venha hoje']])` começa depois de uma aspa e termina antes de `\n`, então a
  fronteira por caractere aceitava: metade de um bloco citado voltava como
  `enviada` sem lacuna, e a amplificação que já estava no prompt ia para a
  conta do gerador; e as duas LINHAS de um único bloco entre aspas podiam
  servir a dois blocos esperados. Hoje `unidadesDoPrompt` parte o prompt nas
  unidades que os caminhos da casa escrevem — **dentro de ASPAS a quebra
  interna NÃO encerra o bloco** (`- "bloco"` do `buildArtePrompt` e do
  `[TEXTO EXATO]`, `"bloco"` por linha do `prompt-da-referencia`); **fora
  delas a delimitação é por LINHA** (o bloco sozinho na linha do
  `prompt-do-manual`) —, e o bloco esperado tem de ser IGUAL a uma unidade
  inteira e ainda livre. Ambiguidade vira lacuna, como já era.
- 🔴 **A camada que RECEBE conteúdo perde a declaração de prefixo, mesmo que
  os caracteres coincidam** (PR5-12-R2). Modelo com `content: '→ Reserve já'`
  e `prefixo: '→ '` recebendo do contrato literalmente `→ Reserve já`: a
  guarda `novo === layer.content` mantinha a declaração, a arte mostrava a
  seta que o AUTOR escreveu e `linhasDaCamada` a descontava — a mesma
  transformação fictícia, agora onde o texto não mudou. O fato é TER VINDO
  conteúdo; só a camada sem preenchimento continua declarando o prefixo.
- 🔴 **O terceiro lugar com o mesmo proxy era a herança do contrato na
  melhoria** (PR5-14, achado na varredura pedida). `contratoDaOrigemDaMelhoria`
  recebia `outraImagem: !!args.skipTextVerification` — a BANDEIRA da régua de
  texto, que hoje tem uma causa só e por isso coincidia com o fato. Qualquer
  motivo NOVO para pular a conferência (peça sem texto, régua indisponível,
  opt-out) derrubaria o contrato junto **e afirmaria no registro que "a imagem
  melhorada é outro slide do post"**, que seria falso. O serviço passou a
  nomear o FATO (`melhoraOutraImagem`, dos mesmos dois pontos que o
  produziam: o slide com `generationId` próprio e a mídia do post que não é o
  `resultUrl` da origem) e dele DERIVA `skipTextVerification`; o runner lê o
  fato, com a bandeira como fallback só para job enfileirado antes do campo,
  quando ela tinha essa causa única. Sem teste novo: a correção é de fiação —
  uma atribuição vira dois campos —, e a semântica de `outraImagem` já é
  provada pelo PR5-08.
- 🔴 **A REGRA que as três deixam, e o caso que a mede**: *condição escrita
  pelo caso do exemplo passa nos testes do exemplo*. As três testam a
  CONSEQUÊNCIA que o caso em mãos produziu, não o fato — e enquanto a
  consequência tem uma causa só, as duas leituras são indistinguíveis, que é
  justamente por que passam em revisão: o exemplo prova as duas. O que as
  separa é perguntar **"que OUTRA coisa produz este sintoma?"** — e **"hoje,
  nenhuma" ainda é resposta errada**, porque a condição se quebra sozinha na
  primeira causa nova, sem barulho. O caso que mede isso é o `skipTextVerification`
  do PR5-14: motivo novo para pular a conferência derrubaria o contrato junto
  **e faria o registro afirmar um motivo falso** ("a imagem é outro slide"),
  que é o oposto do que o contrato existe para fazer.
- **O que a varredura DESCARTOU com razão**: `autorDoPedido` (canal é o fato,
  não sintoma — PR5-13); `revisaoDoRefino`, que localiza o bloco pelo texto
  normalizado e **declara** a ambiguidade (`candidatos.length !== 1` →
  `descartado`) em vez de escolher; `mapearContratoParaCampos`, cuja
  aproximação por NOME de campo é declarada item a item (`por: 'posicao'`,
  `semCampo`, avisos); e `COPY_DIVERGE_DO_CONTRATO`, comparação exata entre os
  dois lados limpos pela MESMA função, numa porta em que o contrato vence de
  qualquer forma.

**Da revisão FINAL do Codex sobre fcd79518 (BLOQUEADO, PR5-11-R3, PR5-15, 21/09/2026).**
As duas na MESMA função (`enviadaNoPrompt`), e a mesma lição da rodada anterior
um nível abaixo: a regra da unidade foi escrita para os formatos que a casa
PRODUZ, e a fronteira ENTRE eles ficou sem dono — texto solto **e** citado na
mesma linha; normalizar para comparar **e** para registrar.

- 🔴 **Linha que MISTURA texto solto e aspas contribui só com o que está entre
  aspas** (PR5-11-R3). Ao encontrar a aspa, a versão anterior fechava as linhas
  pendentes e emitia o fragmento externo como unidade: `Venha hoje "mesmo"`
  comprovava os blocos `Venha hoje` **e** `mesmo`, sem lacuna — uma linha
  AMPLIADA provando dois blocos que ninguém escreveu separados. Hoje a abertura
  de aspas não fecha nada (o trecho citado vira um marcador de uma posição, sem
  quebra) e o texto solto em volta de uma citação é FRAGMENTO, nunca bloco.
  Mistura que não deixa identificar o bloco vira lacuna, como já era o contrato.
  Continua valendo o positivo: duas citações em LINHAS separadas são dois blocos.
- 🔴 **O colapso de espaços LOCALIZA a ocorrência; `enviada` grava o que está
  ESCRITO no prompt** (PR5-15). Um bloco citado com quebra INTERNA casa pela
  forma colapsada e gravava a candidata NORMALIZADA — **apagando do registro uma
  quebra que existe no prompt**, e a comparação escrita × enviada × lida podia
  cobrar essa diferença do gerador. Hoje a candidata só serve para ACHAR a
  unidade; o que entra em `enviada` é a unidade encontrada, com as quebras e os
  espaços dela.
- 🔴 **UM TESTE EXISTENTE CONSAGRAVA A PERDA, e trocar a expectativa foi parte
  do conserto.** `revisao-final-pr5.test.ts:105` exigia a forma COLAPSADA
  (`Venha hoje mesmo`, numa linha só) para um prompt que TEM a quebra; hoje
  exige as duas linhas como estão lá. Não é "ajustar o teste para passar": a
  expectativa antiga afirmava como enviado um texto que nunca foi escrito no
  prompt, que é exatamente o defeito. Quem ler o diff amanhã vê a troca aqui
  declarada, com o caso da quebra DUPLA interna acrescentado ao lado.
- 🔴 **A terceira fronteira do arquivo não era lógica, era do FONTE: o sentinela
  NUL estava escrito LITERAL, e um byte NUL faz o `grep` tratar o arquivo como
  BINÁRIO.** Medido: `grep -c "" registro-da-arte.ts` saía **vazio, com código
  1** — toda busca do repositório passava por cima deste módulo em silêncio, e
  só `grep -a` o enxergava. O sentinela agora é montado por código
  (`String.fromCharCode(0)`), a semântica é idêntica (NUL não aparece em prompt)
  e o fonte volta a ser texto. **Caractere de controle em módulo novo se monta,
  nunca se digita** — some à família de "o método de medição é que estava
  quebrado".
- **O que a varredura da família DESCARTOU**: `revisaoDoRefino` já tem
  exatamente a forma certa (localiza por `normalizeForComparison`, grava o texto
  REAL do pedido, e declara a ambiguidade em vez de escolher); `revisaoPosicional`
  grava a linha crua; e `conferenciaDoCheck` corta a lista `lida` em 40 ITENS,
  mas ela é diagnóstico — `passou` e `faltando` vêm do próprio check, então o
  corte não muda veredito nenhum (diferente do teto da visão do PR 0, que
  mudava).

### A camada EXTRA: função separada de estilo (PR 9 de "Marca simples, copy melhor", 12/09/2026)

"Copy primeiro, campos depois" ganhou o mecanismo que faltava: um texto que
veste o estilo de um papel da assinatura SEM ser esse papel. Até aqui, papel que
a variante não tinha era `PAPEIS_INCOMPATIVEIS`, e bloco `livre` com texto era
recusado ("a camada livre chega na F3"). Módulo PURO em
`src/lib/compositor/camadas-extras.ts` (com teste em `camadas-extras.test.ts`);
`preparar-blocos.ts`, `compor.ts` e `medir-copy.ts` chamam a MESMA resolução.
**Ainda sem anunciar no conector** — a descrição de `compor-arte` e as
instruções só mudam no PR 10, quando o ciclo inteiro (editar, trocar a foto,
recompor) preservar os extras.

- **Um extra declara `id` + `linhas` + `herdaDe` (o papel de ESTILO) e,
  opcionalmente, `grupoVisual` (`principal` · `topo` · `rodape`), `grupoDeLeitura`
  e `ordem`.** Ele herda fonte, peso, corpo (na faixa do papel, com a escala da
  peça), entrelinha, tracking, caixa alta, cor, sombra e prefixo — é
  `estiloHerdado(assinatura.papeis[herdaDe])`, que TIRA `caixa`, `grupo` e
  `alinhamento`: a POSIÇÃO do papel de origem nunca é herdada. Nem o id, nem o
  grupo: a camada nasce com o id do autor e `metadata.compositor.extra = { id,
  funcao, herdaDe, grupoVisual, grupoDeLeitura?, ordem? }`.
- 🔴 **Função ≠ estilo.** `metadata.compositor.papel` do extra é a FUNÇÃO
  original (`servico` na linha de horário que herda do apoio) — é o que
  `papelDaCamada`/`copyDosPapeis` e a recomposição leem; `livre` não é papel e
  fica sem ele. O papel de ESTILO (`herdaDe`) mora só em `extra.herdaDe`. Medir
  e compor contam o bloco pela `funcao` (`BlocoPreparado.funcao`), nunca pelo
  papel de estilo: a peça que precisa de horário funciona numa variante sem o
  campo, e `medir-copy` não a declara `papel-ausente`.
- **Grupo de LEITURA ≠ grupo VISUAL.** `grupoDeLeitura` é do autor (os blocos
  que se leem como uma frase) e viaja intacto; `grupoVisual` decide onde o
  extra POUSA: `principal` junta-se ao grupo da manchete (depois dos textos do
  arranjo, fora da distribuição de linhas — o extra não é o papel de que
  herda); `topo`/`rodape` formam grupo só de extras (`extra:<borda>`), sem
  arranjo da página nem combinação salva, ancorado na borda com `temCaixa:
  false`. Padrão: `servico` → `rodape`; o resto → `principal`
  (`grupoVisualPadrao`).
- **Na spec**: `blocos[].herdaDe` (+ `id` + `grupoVisual`) para papel que a
  variante não tem, ou para repetir um papel com estilo emprestado — papel
  repetido só passa quando toda ocorrência além da primeira tem `id` próprio E
  `herdaDe`; a manchete nunca herda (ela É o papel); ids de camada não se
  repetem (nem com `camadasExtras`). `camadasExtras[]` (até 5) é o que os
  blocos `livre` do contrato viram: `validarSpec` exige `estilo.herdaDe` no
  bloco livre com texto (sem herança não há de onde tirar fonte, corpo e cor —
  recusar continua sendo o oposto de sumir em silêncio), aceita
  `estilo.grupoVisual`, e recusa `camadasExtras` que não batam com o contrato.
  `blocosParaOCompositor` passa `id`/`herdaDe`/`grupoVisual` adiante.
- 🔴 **`herdaDe` declarado é sempre honrado**, mesmo quando a variante TEM o
  papel: função ≠ estilo é decisão do autor. `herdaDe` de papel que a variante
  não tem FALTA (com aviso dizendo qual), e `PAPEIS_INCOMPATIVEIS` passou a
  sugerir a saída ("declare de que papel ele herda o estilo").
- **R17 (P3 da revisão do PR 8)**: em `medir-copy-service` o motivo "algum
  arranjo saiu por rodízio" não depende mais de `preferencias.arranjos` estar
  vazio — fixar o arranjo de UM grupo não fixa o do outro; o motivo vale
  enquanto algum arranjo ainda sair por rodízio (teste com dois grupos).

Da revisão do Codex sobre o primeiro commit (BLOQUEADO, R01…R07, 12/09/2026):

- 🔴 **O vínculo por ID vem ANTES da associação por função e posição** (R01,
  `copyEfetivaDasCamadas`): dois extras de função `servico` herdando `apoio`,
  um no topo e outro no rodapé, trocavam de texto entre os ids já na
  persistência inicial — a leitura casava por função + `y`. A camada extra
  nasce com o id do bloco (`metadata.compositor.extra.id`), e uma camada comum
  tem o id do papel; esses vínculos são reservados antes da fila por função.
- 🔴 **A unicidade é conferida contra os ids que a PREPARAÇÃO produz** (R02,
  `idReservado`): `id` num bloco SEM `herdaDe` é recusado (a camada se chama
  pelo papel; um id avulso era ignorado na composição e só enganava a
  conferência), e nenhum extra pode tomar `headline2` nem `<papel>-N` — a
  segunda voz e o segundo texto do mesmo papel são gerados pela preparação. A
  resolução repete a porta com aviso.
- **Extra que não pôde ser resolvido é DECLARADO por bloco** (R03,
  `ResolucaoDosExtras.falhas` → `MedidaDeBloco` `papel-ausente` com o id do
  bloco, e `cabeTudo` os conta): o livre herdando um `cta` ausente sumia da
  medição com `cabeTudo` verdadeiro enquanto `comporPeca` recusava a mesma
  entrada. `papeisAusentes` passou a olhar só os blocos sem herança.
- **O extra com função leva `grupoDeLeitura` e `ordem`, e os extras das duas
  fontes são ordenados JUNTOS pela ordem do autor** (R04): o contrato com nota
  livre na ordem 1 e serviço na ordem 2 saía com o serviço antes da nota,
  porque a resolução acrescentava primeiro os por papel e depois os livres. Sem
  `ordem` (spec legada) vale a posição de declaração, blocos antes de
  `camadasExtras`. Os campos atravessam `blocoSchema`, `BlocoLegado`,
  `blocosParaOCompositor` e a identidade do extra até a camada.
- 🔴 **O contrato é CANÔNICO** (R05): `blocos` e `camadasExtras` mandados
  junto dele têm de dizer o MESMO em todos os campos (id, herança, grupo
  visual, grupo de leitura, ordem), e extra declarado sem correspondente no
  contrato também diverge. Comparar só id e linhas deixava a versão sem
  herança prevalecer e a composição recusar uma variante que o contrato
  resolvia.
- 🔴 **`validarSpec(validarSpec(x).spec)` tem de continuar válido** (R06): os
  limites de linha da spec são os do contrato (linha vazia é respiro permitido,
  `MAX_LINHAS`, 40 blocos), e a forma derivada é revalidada pelo schema antes de
  ser aceita — o worker da fila revalida a spec gravada, e uma spec aceita na
  porta falhava lá.
- **Sem contrato, o ORIGINAL persistido nasce da spec INTEIRA** (R07,
  `copyDaSpecSemContrato`): o extra livre e o serviço herdado entram com id,
  herança, grupo visual, grupo de leitura e ordem (renumerada do zero, porque o
  contrato exige ordem contígua), autoria `desconhecido`. Antes só `spec.blocos`
  virava original e a nota fornecida na entrada aparecia como texto a mais do
  sistema, com id `extra-…`.

Da revisão do Codex sobre o segundo commit (BLOQUEADO, R08…R11, 12/09/2026):

- 🔴 **O id EXPLÍCITO do extra viaja exato, caixa inclusive** (R08,
  `copyDaSpecSemContrato`): só a identidade inferida do legado (o papel) passa
  por `idUnico`, que normaliza; o id do extra, já validado pela spec, entra no
  `usados` antes e nunca é reescrito. "Nota" virava "nota" no original, a
  efetiva não achava a camada e criava `extra-Nota` com revisão fictícia.
- 🔴 **Vínculo por id físico só com a MESMA função** (R09,
  `copyEfetivaDasCamadas`): primeiro `metadata.compositor.extra.id`; depois
  `layer.id === bloco.id` apenas quando `papelDaCamada` é a função do bloco. Um
  contrato com ids trocados entre funções (id "apoio" na manchete) trocava os
  textos na persistência — e o autosave registrava a troca como edição da equipe.
- 🔴 **Nenhum extra toma o nome de uma camada interna** (R10, `idReservado`):
  além de `headline2` e `<papel>-N`, `bg-foto`, `logo`, `gradiente-leitura-*` e
  `<texto>-elemento-N`; e `comporPeca` confere a unicidade no conjunto FINAL de
  camadas (`idsDeCamadaRepetidos`, `SPEC_INVALIDA`) — id repetido torna seleção,
  ajuste e leitura por id ambíguos.
- 🔴 **Sem contrato, a copy DERIVADA da spec passa no contrato do leitor antes
  de a spec valer** (R11, `validarSpec` → `validarCopyAutoral(copyDaSpecSemContrato(…))`):
  grupo de leitura de um bloco só e mais de 40 blocos SOMADOS entre `blocos` e
  `camadasExtras` são recusados na porta. Antes a persistência gravava um
  contrato que `lerCopyAutoral` devolvia inválido e a edição seguinte caía em
  `sem-contrato`.

Da revisão do Codex sobre o terceiro commit (BLOQUEADO, R12…R14, 12/09/2026):

- 🔴 **A identidade EXPLÍCITA vem antes de TODO fallback legado, livres
  inclusive** (R12, `vincularExtras`): o passo 0 casa o bloco livre pela
  `metadata.compositor.extra.id` da camada, e camada que declara OUTRO bloco não
  entra em nenhum fallback (nome, id inferido `extra-<id>`, forma antiga, nem a
  associação por função). Um livre vazio `extra-hora` tomava a camada `hora` do
  serviço pelo id inferido e esvaziava o serviço já na persistência inicial.
- 🔴 **A numeração de textos comuns do mesmo papel é da PEÇA, não do grupo**
  (R13, `prepararBlocos`): horário num grupo e endereço noutro saíam os dois com
  id `servico`, a conferência final recusava a composição e os ícones de um
  texto sobrescreviam os do outro em `elementosPorTexto`. Hoje o segundo é
  `servico-2`, como no mesmo grupo.
- 🔴 **Duplicar página não renomeia id AUTORAL** (R14,
  `renomearExtrasDuplicados`): só o id INFERIDO do id da camada (`extra-<id>`,
  atual ou antigo) acompanha a camada nova; o bloco que a camada declara em
  `extra.id`, ou cujo id não é derivado dela, mantém o id e as referências no
  histórico — senão contrato e metadados divergiam depois de uma operação
  técnica.
