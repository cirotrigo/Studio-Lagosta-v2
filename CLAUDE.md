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

### Registro de mudanças recentes

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
- **Mudou o código de render?** `scripts/rerender-agendados.ts` força o
  re-render do que já está RENDERED — só com o deploy no ar.
- **Fonte de projeto exige arquivo enviado** (`CustomFont` + blob): o
  `addGoogleFont` do editor carrega do CDN só no navegador, e o render cai em
  fallback. Arquivo TTF **estático** (napi-rs canvas não aplica eixo variável)
  e o peso pedido tem de existir no arquivo — faux-bold só existe no browser.
- **Trocar fonte muda a métrica**: medir a caixa com a fonte nova, senão o
  texto quebra e a linha extra é cortada pela altura.
- O RenderEngine ainda ignora `letterSpacing`, fundo de texto, contorno,
  curved/blur e `richTextStyles` — lista completa e alcances na § 3 do doc.

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
- **Auto-height nativo do Konva foi avaliado e rejeitado** (§4 do doc): a
  altura fixa do nó na tela é o contrato visível com o render server-side, que
  corta pela altura gravada; height auto esconderia a dessincronia.

`docs/SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md` cobre o dia seguinte: padrão do
texto novo, setas do teclado, alinhamento pela margem de segurança, âncora
vertical com crescimento da caixa e a remoção do negrito. Três armadilhas de lá
valem para qualquer mexida no editor:

- **Camada de texto é cacheada como bitmap** quando `fontSize > 24`. Campo novo
  que afete o desenho precisa entrar na assinatura de invalidação em
  `konva-editable-text.tsx`, senão o controle simplesmente não funciona.
- **Alinhamento vive em duas telas** (painel de propriedades e
  `alignment-toolbar`); mudou a regra, mude nas duas.
- **O crescimento automático da caixa é do editor**, não do `render-engine`: um
  `slotValues` mais longo que o texto do template é cortado na altura gravada.
- **A entrelinha mora em dois campos** e o render server-side prefere
  `textboxConfig.autoWrap.lineHeight` sobre `style.lineHeight`. Escreva sempre
  nos dois — escrever em um só faz o editor e a arte agendada divergirem, e o
  download do editor (`stage.toDataURL()`, que lê o `style`) **não** revela isso.

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations
