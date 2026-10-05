# AGENTS.md

Fonte única das regras do Studio Lagosta para agentes de código: **Codex e Claude Code leem
este mesmo arquivo** (o `CLAUDE.md` é só um `@AGENTS.md`, o import do Claude Code).

## Como este conjunto funciona

- **Este arquivo é o núcleo**: comandos, checkout compartilhado, banco de produção, arquitetura e
  as armadilhas que valem em qualquer tarefa. Ele fica **abaixo de 32 KiB** de propósito: é o
  limite padrão que o Codex carrega (`project_doc_max_bytes`), e o que passa disso é cortado em
  silêncio.
- **O detalhe mora em `docs/regras/<area>.md`**: antes de mexer numa área, leia o arquivo dela
  (índice abaixo). Foi assim que as ~120 seções do antigo `CLAUDE.md` (827 KB) foram
  reorganizadas em 05/10/2026, sem alteração de texto.
- **Regra nova vai para o arquivo da área**, no fim (ou numa seção nova com data). Só entra aqui
  o que vale para o repositório inteiro, e em uma linha com o ponteiro para o detalhe.
- **Nunca escreva regra no `CLAUDE.md`.** Ele existe só para o Claude Code importar este arquivo.
- Comentários antigos no código que dizem "ver CLAUDE.md § X" apontam para o conteúdo que hoje
  está em `docs/regras/` — procure pelo título da seção (`grep -rn "<título>" docs/regras`).

## Índice das regras por área

| Arquivo | O que cobre |
|---|---|
| `docs/regras/publicacao-e-agenda.md` | verificação de stories, janela de congelamento, retry e avisos no WhatsApp, lembretes, PWA, remarcar post, Novo Post/Repostar, arte agendada por página |
| `docs/regras/editor-e-galeria.md` | galeria e lightbox, caixa de imagem, arte enviada de fora, canal e autor da arte, halo como efeito do editor, gradientes da marca e ícones nas combinações, classes do Tailwind, autosave da página |
| `docs/regras/render-e-texto.md` | invalidação de renders agendados, letterSpacing e Auto da caixa, entrelinha em dois campos, melhoria com IA na agenda (jul/2026), autonomia do MCP, autocorreção geométrica, alinhamento de texto |
| `docs/regras/geracao-ia.md` | bancada e carrossel, crivo e QA, foto de cena, âncora de ambiente, fila durável, resolução, tier do gpt-image, modelo a seguir, caixa da manchete, modelo-livre, diretor de arte, manual gerado, duas portas, foto intocada, passada cirúrgica |
| `docs/regras/aprendizado.md` | crivo conferido pelo sistema, escopo de aprendizado, LearningSignal e captura, feedback de arte, destilação (pilares, cadência v2), desfecho da copy, qualidade da copy medida (PR 15) |
| `docs/regras/marca-voz-e-base.md` | DNA da marca, cache da base, voz compacta (PR 7), aba Marca (PR 14), migração da voz por manifesto (PR 13), arrendamento da indexação da base |
| `docs/regras/modelos.md` | página nasce conteúdo, curinga da semana, tags de tema, promover página a modelo |
| `docs/regras/acervo-de-fotos.md` | reconciliação diária do catálogo, conferência da trilha imagem e rodízio, ranking acervo-v2, busca com embeddings e catálogo v3 |
| `docs/regras/planos-e-semana.md` | PlanoDeConteudo/ItemDePlano, propor-semana e dica de copy, contexto da semana (PR 6) |
| `docs/regras/creditos-e-custo.md` | custo de imagem, quantity × creditsTotal, histórico de UsageHistory |
| `docs/regras/mcp.md` | curadoria no conector, apelidos e parâmetros recusados, plano do MCP, permissão de membro, registro único de tools, importar-arte |
| `docs/regras/video-e-audio.md` | voz isolada (MVSEP), download do YouTube, motion no editor, vídeo direto na agenda, movimento e transições |
| `docs/regras/canvas-de-design.md` | arte em HTML pelo /design e o halo do canvas |
| `docs/regras/melhoria.md` | melhoria na carteira (F0–F6), regras da casa preservadoras, logo composta, sem contraste acrescentado, régua sem a logo, rodada de revisão do Espeto |
| `docs/regras/compositor.md` | assinatura, variantes, pastas da semana, recomposição de slide, gradiente de leitura e destaque, combinações de texto, modelos da marca na usina |
| `docs/regras/revisor-da-arte.md` | revisar-arte e ajustar-arte por medida e visão, recuperação forçada, versão visual, merge no banco de fieldValues |
| `docs/regras/copy-autoral.md` | contrato (PR 2), persistência (PR 3), compositor fiel (PR 4), medir-copy (PR 8), vias que consomem o contrato (PR 5), camada extra (PRs 9 e 10) |
| `docs/regras/lotes.md` | compor-leva idempotente (PR 11) e agendar-leva até os rascunhos (PR 12) |
| `docs/regras/arquitetura-geral.md` | o antigo `AGENTS.md` (Warp, ago/2026): camadas de acesso a dados, créditos, organizações, editor Konva, CMS, admin, `usePageConfig` — com as correções de 05/10/2026 no topo |

## Armadilhas que valem em qualquer área

Uma linha cada; o porquê e a medição estão no arquivo indicado.

- 🔴 **`DATABASE_URL=… npx prisma …` vai para PRODUÇÃO**: o Prisma CLI ignora a variável inline e
  usa o `.env`. Use `npx tsx scripts/dev-db.ts …` / `npm run db:*` (`geracao-ia.md`, seção "Crivo, QA").
- 🔴 **Em Postgres `ORDER BY … ASC` é NULLS LAST**: "nunca usado primeiro" exige
  `{ sort: 'asc', nulls: 'first' }` (`geracao-ia.md`).
- 🔴 **Filtro Json do Prisma descarta a linha que não tem o campo**: filtrar por chave de
  `fieldValues` é SQL com `COALESCE` (`geracao-ia.md`, "Foto de cena é INSUMO").
- 🔴 **`"slotValues" is not null` conta ~3.800 linhas com o JSON `null`**: use
  `"slotValues"::text <> 'null'` (`aprendizado.md`, "Destilação").
- 🔴 **`sharp(x).extract(r).stats()` ignora o recorte**: materialize com `.toBuffer()` antes
  (`geracao-ia.md`).
- 🔴 **`Project.userId` é o id INTERNO do User, não o clerkId**, e `getUserFromClerkId` /
  `getUserCredits` CRIAM User — é assim que nascem os Users fantasma. Leitura de saldo é
  `findUnique` (`render-e-texto.md`, `planos-e-semana.md`).
- 🔴 **Módulo testável sem banco não importa `@/lib/db`**: ele lança no import sem `DATABASE_URL`
  (`aprendizado.md`).
- 🔴 **Com `strict: false`, `z.infer` marca toda chave como opcional**: a garantia fica na
  validação de runtime (`planos-e-semana.md`).
- 🔴 **Quem grava `Page.layers` chama `invalidateScheduledRenders` E
  `pedirRecomposicaoDaArteCongelada`**: cada uma sozinha deixa metade das artes publicando o
  antigo (`compositor.md`, "A arte do slide de carrossel não seguia a página").
- 🔴 **`laterPostId` não nulo significa INTOCÁVEL** (o post já está no Zernio)
  (`publicacao-e-agenda.md`, "Janela de congelamento").
- 🔴 **Caminho novo que marque post FAILED chama `handlePublishFailure`**, senão ele morre em
  silêncio (`publicacao-e-agenda.md`, "Retry de publicação").
- 🔴 **`Generation.fieldValues` de arte existente se grava por merge no banco**
  (`mesclarFieldValuesDaArte`), nunca `{ ...fieldValues }` lido antes (`revisor-da-arte.md`).
- 🔴 **Em prompt de imagem, a string literal vence qualquer regra escrita sobre ela** (caixa,
  palavras da referência, nome de fonte) (`geracao-ia.md`).
- 🔴 **Não existem classes Tailwind "mortas"**: o JIT só gera o que está no fonte; meça depois de
  escrever a classe (`editor-e-galeria.md`).

## Testes e formatação

```bash
npx vitest run <caminho>   # unitários: src/**/__tests__/**/*.test.ts e src/**/*.test.ts
npm run test:e2e           # Playwright (tests/e2e/)
npm run format:check       # Prettier
```

Antes de todo PR: `npm run typecheck` e `npm run lint` (o CI roda os dois).

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
- **Schema changes go through `npm run db:migrate -- --name <change>`** (runs
  `prisma migrate dev` against the Neon dev branch; never `npx prisma migrate dev`
  raw, which reads the production `.env`). Production: hand-written
  `migration.sql` + `npm run db:deploy`. Reserve `db:push` for local experiments —
  do not use it to ship schema changes. *(Corrigido em 05/10/2026: o texto antigo
  mandava rodar o `npx prisma migrate dev` cru.)*
- ⚠️ **`migrate dev` só é seguro contra um banco de desenvolvimento isolado (o branch do Neon).** O `.env` aponta para
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
- 🔴 **O compute sai SEMPRE de `computeDe` (`src/lib/compute-do-banco.ts`)**,
  em minúsculas: o `new URL` não baixa a caixa do host em `postgresql:`, e
  `EP-PROD-…-POOLER` passava pelo runner como dev. Guarda nova não refaz o parse
  do host — um teste (`compute-do-banco.test.ts`) recusa a cópia. O NOME do
  banco (`nomeDoBancoDe`) continua com a caixa: no Postgres ela distingue.
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
2. Resolve the database user: `getUserFromClerkId()` CREATES the user when it is
   missing — use it only where creating is the intent (first access). Reads, audit
   and credit checks use `findUnique` by `clerkId` (see the "Users fantasma" trap
   above). *(Corrigido em 05/10/2026: o texto antigo mandava "get or create" em
   toda rota.)*
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

### Important Patterns
- Database access only through Prisma client singleton in `lib/db.ts`
- Authentication utilities centralized in `lib/auth-utils.ts`
- Protected routes use client-side redirect in layout component
- Glass morphism UI design with backdrop blur effects
- Responsive design with mobile-first approach
- Admin settings follow sync-first approach for external integrations
