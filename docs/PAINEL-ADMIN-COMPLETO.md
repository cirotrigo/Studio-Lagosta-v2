# 📊 Painel Administrativo - Documentação Completa

> **Guia completo de todas as funcionalidades, APIs, e recursos do painel administrativo do Studio Lagosta**

## 📑 Índice Rápido

### 🎯 Essenciais
- [Visão Geral](#-visão-geral)
- [Acesso e Autenticação](#-acesso-e-autenticação)
- [Estrutura do Painel](#️-estrutura-do-painel)

### 📊 Funcionalidades Principais
1. [Dashboard Principal](#-1-dashboard-principal) - Métricas, MRR, ARR, Churn
2. [Gerenciamento de Usuários](#-2-gerenciamento-de-usuários) - Usuários, convites, sincronização
3. [Sistema de Créditos](#-3-sistema-de-créditos) - Saldos, gastos, reembolsos
4. [Configurações do Sistema](#️-4-configurações-do-sistema) - Site, features, planos
5. [Armazenamento](#-5-armazenamento) - Arquivos, uploads, mídias
6. [Histórico de Uso](#-6-histórico-de-uso) - Analytics, relatórios
7. [Base de Conhecimento](#-7-base-de-conhecimento) - Artigos, migração
8. [Sistema CMS](#-8-sistema-cms) - Páginas, menus, componentes, mídias

### 🔧 Recursos Técnicos
- [Utilitários e Helpers](#-utilitários-e-helpers)
- [Componentes UI Admin](#-componentes-ui-admin)
- [Segurança](#-segurança)
- [Performance e Otimizações](#-performance-e-otimizações)
- [Testes e QA](#-testes-e-qa)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)

---

## 📍 Visão Geral

O Painel Administrativo é um sistema completo de gerenciamento para administradores do Studio Lagosta, oferecendo controle total sobre usuários, conteúdo, configurações, créditos, e análises.

## 🔐 Acesso e Autenticação

### Configuração de Administradores

Configure administradores no arquivo `.env.local`:

```env
# Opção 1: Por email
ADMIN_EMAILS=admin@yourdomain.com,ops@yourdomain.com

# Opção 2: Por Clerk User ID
ADMIN_USER_IDS=user_xxx,user_yyy
```

### Pré-requisitos Clerk
- `CLERK_SECRET_KEY` configurado
- Convites e entrega de email habilitados no Clerk
- Redirect permitido: `${NEXT_PUBLIC_APP_URL}/sign-up`

### Acesso
- URL: `/admin`
- Guard SSR no layout + verificação middleware
- Redirecionamento automático se não for admin

---

## 🏗️ Estrutura do Painel

### 📂 Organização de Rotas

```
/admin
├── /                          # Dashboard principal
├── /users                     # Gerenciamento de usuários
├── /credits                   # Gestão de créditos
├── /storage                   # Armazenamento e arquivos
├── /usage                     # Histórico de uso
├── /knowledge                 # Base de conhecimento
├── /site-settings            # Configurações do site
├── /content                  # Sistema CMS
│   ├── /pages               # Páginas
│   ├── /menus               # Menus
│   ├── /components          # Componentes
│   └── /media               # Mídias
└── /settings                # Configurações gerais
    ├── /features           # Custos por funcionalidade
    └── /plans              # Planos de assinatura
```

---

## 📈 1. Dashboard Principal

**Rota:** `/admin`
**Arquivo:** `src/app/admin/page.tsx`

### Funcionalidades

#### 📊 Métricas em Tempo Real
- **Total de Usuários**: Quantidade total de usuários registrados
- **Usuários Ativos**: Usuários com atividade recente
- **Variação MoM**: Crescimento mês a mês

#### 💰 Análises Financeiras
1. **MRR (Monthly Recurring Revenue)**
   - Gráfico de barras
   - Variação percentual mês a mês
   - Badge colorido indicando tendência

2. **ARR (Annual Recurring Revenue)**
   - Projeção anual
   - Visualização de crescimento
   - Indicadores de performance

3. **Churn Rate**
   - Taxa de cancelamento
   - Gráfico de linha
   - Tendências de retenção

### Hook de Dados
```typescript
const { data: stats, isLoading, error } = useDashboard()
```

### Componentes Visuais
- `MrrBarChart` - Gráfico MRR
- `ArrBarChart` - Gráfico ARR
- `ChurnLineChart` - Gráfico Churn
- `DeltaBadge` - Badge de variação com cores dinâmicas

---

## 👥 2. Gerenciamento de Usuários

**Rota:** `/admin/users`
**Arquivo:** `src/app/admin/users/page.tsx`

### Funcionalidades Principais

#### 📋 Listagem de Usuários
- Visualização de todos os usuários
- Saldo de créditos de cada usuário
- Histórico de uso
- Informações de perfil do Clerk

#### ➕ Convites de Usuários
- **Endpoint:** `POST /api/admin/users/invite`
- **Body:** `{ email: string, name?: string }`
- Se usuário já existe, garante user/balance no DB

#### 📝 Gerenciar Convites
- `GET /api/admin/users/invitations` - Listar pendentes
- `POST /api/admin/users/invitations/:id/resend` - Reenviar
- `POST /api/admin/users/invitations/:id/revoke` - Revogar

#### 💳 Ajuste de Créditos
- **Por CreditBalance:** `PUT /api/admin/credits/:id`
- **Por User ID:** `PUT /api/admin/users/:id/credits`
- Atualização em tempo real
- Histórico de ajustes mantido

#### 🔄 Sincronização com Clerk
**Endpoint:** `POST /api/admin/users/sync`

**Opções:**
```typescript
{
  syncUsers?: boolean        // Padrão: true
  syncPlans?: boolean        // Padrão: true
  setCredits?: boolean       // Padrão: true
  overrideCredits?: number   // Opcional
  pageSize?: number          // Padrão: 100
  maxPages?: number          // Padrão: 50
  debug?: boolean            // Info detalhada
}
```

**Comportamento:**
1. **Users**: Cria/atualiza `User` e garante `CreditBalance` com 0 créditos
2. **Plans**: Consulta Clerk `GET /v1/users/{user_id}/billing/subscription`
3. **Credits**: Se `setCredits` true e plano mapeado, atualiza créditos

**Response:**
```typescript
{
  processed: number
  createdUsers: number
  createdBalances: number
  activeSubscriptions: number
  creditsRefreshed: number
  debug?: {
    pagesProcessed: number
    unmappedPlanIds: string[]
  }
}
```

#### 🗑️ Exclusão de Usuários
- Remove usuário
- Deleta histórico de uso
- Remove saldo de créditos
- Confirmação dupla obrigatória

---

## 💰 3. Sistema de Créditos

**Rota:** `/admin/credits`
**Arquivo:** `src/app/admin/credits/page.tsx`

### Conceitos Fundamentais

#### Fonte da Verdade
- Saldo de créditos é **server-side first**
- Database é a fonte única de verdade
- UI sincroniza via React Query

#### 📖 Leitura de Saldo
- **Endpoint:** `GET /api/credits/me`
- **Response:** `{ creditsRemaining: number }`
- Hook: `useCredits()` com auto-refresh

#### 💸 Gastos de Créditos
Chamadas nas APIs:
```typescript
validateCreditsForFeature(clerkUserId, feature)
deductCreditsForFeature({ clerkUserId, feature, details })
```

#### 📊 Configuração de Custos
- **Arquivo:** `src/lib/credits/feature-config.ts`
- Constante: `FEATURE_CREDIT_COSTS`
- Mapeamento `Feature → OperationType`

### Políticas de Reembolso

#### AI Chat e Imagens
Se erro do provedor após dedução:
- **Text (`POST /api/ai/chat`)**: Reembolsa em erro do provedor
- **Image (`POST /api/ai/image`)**: Reembolsa em status não-OK, resposta inválida, erro parse, ou resultado vazio

**Rastreamento:**
- `UsageHistory` com `creditsUsed` negativo
- `details: { refund: true, reason: string }`

### Health Check
- **Endpoint:** `GET /api/admin/health/credits-enum`
- Verifica mapeamento `Feature → OperationType`
- Apenas para admins

---

## ⚙️ 4. Configurações do Sistema

### 4.1 Configurações do Site

**Rota:** `/admin/site-settings`
**Arquivo:** `src/app/admin/site-settings/page.tsx`

#### 5 Abas Principais

##### 🏷️ Marca
- Nome do Site
- Nome Curto (header)
- Descrição geral

##### 🎨 Logos e Ícones
- Logo Clara (dark mode)
- Logo Escura (light mode)
- Favicon
- Apple Touch Icon

##### 📊 SEO
- Meta Title
- Meta Description
- Palavras-chave (separadas por vírgula)
- Imagem Open Graph (1200x630px)

##### 📧 Contato
- Email de suporte

##### 📱 Redes Sociais & Analytics
**Redes:**
- Twitter/X
- Facebook
- Instagram
- LinkedIn
- GitHub

**Analytics:**
- Google Tag Manager ID
- Google Analytics ID
- Facebook Pixel ID

#### API Endpoints
- `GET /api/admin/settings` - Buscar configurações ativas
- `POST /api/admin/settings` - Criar novas configurações
- `PUT /api/admin/settings` - Atualizar configurações existentes

#### Validação
Campos obrigatórios:
- `siteName`
- `shortName`
- `description`

#### Versionamento
- Cada save cria novo registro
- Configurações antigas: `isActive: false`
- Apenas uma configuração ativa por vez
- Permite rollback

### 4.2 Custos por Funcionalidade

**Rota:** `/admin/settings/features`
**Arquivo:** `src/app/admin/settings/features/page.tsx`

#### Funcionalidades
- Editar custos de créditos por feature
- Exemplos: `ai_text_chat`, `ai_image_generation`
- Validação de valores não-negativos
- Atualização em tempo real

#### API
- `GET /api/admin/settings` - Retorna `featureCosts`
- `PUT /api/admin/settings` - Body: `{ featureCosts: { [key]: number } }`

#### Utilização no Servidor
```typescript
import { getFeatureCost } from '@/lib/credits/settings'

const cost = await getFeatureCost('ai_text_chat')
```

### 4.3 Planos de Assinatura (Clerk)

**Rota:** `/admin/settings/plans`
**Arquivo:** `src/app/admin/settings/features/page.tsx`

#### ⚠️ Abordagem Sync-Only
- **NÃO** pode criar planos manualmente na UI
- Planos devem ser criados no Clerk Dashboard primeiro
- UI sincroniza com botão "Sync with Clerk"

#### Processo de Sincronização
1. Criar planos no Clerk Dashboard
2. Clicar "Sync with Clerk" na UI
3. Configurar créditos e display names localmente
4. Salvar para persistir configurações

#### Configuração Local
**Editável:**
- Nome do plano
- Créditos mensais

**Read-only:**
- Plan IDs (Clerk `cplan_*`)

#### Gerenciamento
- Ativar/desativar planos
- Atualizar créditos mensais
- Renomear planos

#### API Endpoints
- `GET /api/admin/plans` - Listar planos `{ clerkId, name, credits, active }`
- `POST /api/admin/plans` - Criar plano por Clerk ID
- `PUT /api/admin/plans/[clerkId]` - Atualizar (ou renomear com `newClerkId`)
- `DELETE /api/admin/plans/[clerkId]` - Remover plano
- `GET /api/admin/clerk/plans` - Carregar do Clerk Backend API

#### Utilização no Servidor
```typescript
import { getPlanCredits } from '@/lib/credits/settings'

const credits = await getPlanCredits('cplan_xxx')
```

#### UI Pública (Read-only)
- `GET /api/credits/settings` - Retorna `{ featureCosts, planCredits }`
- Hook: `useCredits()` expõe `getCost(operation)` e `canPerformOperation(operation)`

---

## 📦 5. Armazenamento

**Rota:** `/admin/storage`
**Arquivo:** `src/app/admin/storage/page.tsx`

### Funcionalidades

#### 🔍 Navegação
- Listar todos os uploads
- Atribuição por usuário
- Informações de arquivo (nome, tipo, tamanho, URL)

#### 🔎 Busca
Filtros disponíveis:
- Nome do arquivo
- Tipo de arquivo
- URL
- Usuário (autor)

#### 🔗 Ações
- Abrir arquivo em nova aba
- Copiar URL
- Visualizar detalhes

#### 🗑️ Exclusão
- Delete remoto (best-effort)
- Soft-delete no registro
- Confirmação obrigatória

### API
- `GET /api/admin/storage` - Listar uploads
- `DELETE /api/admin/storage/:id` - Deletar upload

---

## 📊 6. Histórico de Uso

**Rota:** `/admin/usage`
**Arquivo:** `src/app/admin/usage/page.tsx`

### Análises Disponíveis

#### 📈 Visualizações
- Histórico completo de operações
- Uso de créditos por feature
- Timeline de atividades
- Estatísticas por usuário

#### 🔍 Filtros
- Por usuário
- Por tipo de operação
- Por período
- Por status (sucesso/falha/reembolso)

#### 📁 Detalhes de Registro
Cada entrada mostra:
- `operationType` - Tipo de operação
- `creditsUsed` - Créditos gastos (negativo se reembolso)
- `details` - Metadados JSON
- `createdAt` - Data/hora
- `refund` flag - Indica reembolso

---

## 📚 7. Base de Conhecimento

**Rota:** `/admin/knowledge`
**Arquivo:** `src/app/admin/knowledge/page.tsx`

### Funcionalidades

#### 📝 Gerenciamento
- Criar entradas
- Editar conteúdo
- Organizar categorias
- Versionamento

#### 🔄 Migração
**Rota:** `/admin/knowledge-base/migrate`
- Importar dados de sistemas antigos
- Validação de estrutura
- Preview antes de importar

#### Rotas
- `/admin/knowledge` - Listagem
- `/admin/knowledge/new` - Criar nova
- `/admin/knowledge/[id]` - Visualizar
- `/admin/knowledge/[id]/edit` - Editar

---

## 🎨 8. Sistema CMS

### 8.1 Páginas

**Rota:** `/admin/content/pages`
**Arquivo:** `src/app/admin/content/pages/page.tsx`

#### Funcionalidades
- Criar/editar páginas
- Gerenciar sections
- Definir slug e metadata
- Publicar/despublicar
- SEO settings

#### Rotas
- `/admin/content/pages` - Lista
- `/admin/content/pages/[id]` - Editor

### 8.2 Menus

**Rota:** `/admin/content/menus`
**Arquivo:** `src/app/admin/content/menus/page.tsx`

#### Funcionalidades
- Criar menus (HEADER, FOOTER, etc.)
- Adicionar/remover items
- Ordenação drag-and-drop
- Links internos/externos
- Nested menus

#### Rotas
- `/admin/content/menus` - Lista
- `/admin/content/menus/[id]` - Editor

### 8.3 Componentes

**Rota:** `/admin/content/components`
**Arquivo:** `src/app/admin/content/components/page.tsx`

#### Tipos de Componentes
- **Hero** - Banner principal
- **BentoGrid** - Grid de features
- **AI Starter** - Seção AI
- **FAQ** - Perguntas frequentes
- **Pricing** - Tabela de preços

#### Funcionalidades
- Criar templates reutilizáveis
- Configurar props
- Preview em tempo real
- Biblioteca de componentes

#### Rotas
- `/admin/content/components` - Lista
- `/admin/content/components/[id]` - Editor

### 8.4 Mídias

**Rota:** `/admin/content/media`
**Arquivo:** `src/app/admin/content/media/page.tsx`

#### Funcionalidades
- Upload de imagens
- Galeria de mídia
- Busca e filtros
- Otimização automática
- CDN integration

---

## 🔧 Utilitários e Helpers

### Admin Utilities
**Arquivo:** `src/lib/admin-utils.ts`

```typescript
// Verificar se usuário é admin
export async function isAdmin(userId: string): Promise<boolean>

// Obter lista de emails admin
export function getAdminEmails(): string[]

// Obter lista de IDs admin
export function getAdminUserIds(): string[]
```

### Credits Settings
**Arquivo:** `src/lib/credits/settings.ts`

```typescript
// Obter custo de feature
export async function getFeatureCost(feature: string): Promise<number>

// Obter créditos de plano
export async function getPlanCredits(clerkPlanId: string): Promise<number>

// Reembolsar créditos
export async function refundCreditsForFeature(params: {
  clerkUserId: string
  feature: string
  reason: string
}): Promise<void>
```

### Prisma Types
**Arquivo:** `src/lib/prisma-types.ts`

```typescript
// Re-exporta enums do Prisma
export { OperationType } from '../../prisma/generated/client'
```

---

## 🎨 Componentes UI Admin

### Sidebar
**Arquivo:** `src/components/admin/admin-sidebar.tsx`

#### Estrutura
```typescript
{
  "Visão Geral": [
    { title: "Painel", href: "/admin", icon: LayoutDashboard }
  ],
  "Conteúdo": [
    { title: "Páginas", href: "/admin/content/pages", icon: FileText },
    { title: "Menus", href: "/admin/content/menus", icon: Menu },
    { title: "Componentes", href: "/admin/content/components", icon: Package },
    { title: "Mídias", href: "/admin/content/media", icon: Image }
  ],
  "Gerenciamento": [
    { title: "Usuários", href: "/admin/users", icon: Users },
    { title: "Créditos", href: "/admin/credits", icon: CreditCard },
    { title: "Armazenamento", href: "/admin/storage", icon: CreditCard },
    { title: "Base de Conhecimento", href: "/admin/knowledge", icon: BookOpen }
  ],
  "Relatórios": [
    { title: "Histórico de Uso", href: "/admin/usage", icon: Activity }
  ],
  "Configurações": [
    { title: "Configurações do Site", href: "/admin/site-settings", icon: Settings },
    { title: "Custos por Funcionalidade", href: "/admin/settings/features", icon: SlidersHorizontal },
    { title: "Planos de Assinatura", href: "/admin/settings/plans", icon: DollarSign }
  ]
}
```

### Layout
**Arquivo:** `src/app/admin/layout.tsx`

#### Proteção SSR
```typescript
export default async function AdminLayout({ children }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  if (!(await isAdmin(userId))) {
    redirect('/studio')
  }

  return (
    <SidebarProvider>
      <AdminSidebar />
      <main>{children}</main>
    </SidebarProvider>
  )
}
```

---

## 🔒 Segurança

### Verificações de Autenticação

#### Middleware
- Verifica autenticação Clerk
- Redireciona não-autenticados
- Valida role de admin

#### API Routes
```typescript
export async function GET(request: Request) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Logic here
}
```

### Validação de Dados

#### Zod Schemas
- Validação de input em todas APIs
- Type-safety end-to-end
- Error messages consistentes

#### Exemplo:
```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
})

const validated = schema.parse(body)
```

---

## 📊 Performance e Otimizações

### Caching Strategy

#### React Query
```typescript
// Settings cache por 5 minutos
queryKey: ['admin', 'settings']
staleTime: 5 * 60_000
gcTime: 10 * 60_000

// Dashboard cache por 30 segundos
queryKey: ['admin', 'dashboard']
staleTime: 30_000
```

#### Database
- Indexação em campos frequentes
- Connection pooling
- Query optimization via Prisma

### Loading States
- Skeleton loaders
- Suspense boundaries
- Optimistic updates

---

## 🧪 Testes e QA

### Health Checks
- `GET /api/admin/health/credits-enum` - Verifica enums
- Database connection tests
- Clerk API connectivity

### Admin QA Guide
**Documento:** `docs/testing/admin-qa-guide.md`

#### Checklist
- [ ] Admin access control
- [ ] User sync com Clerk
- [ ] Credit adjustments
- [ ] Plan synchronization
- [ ] Settings persistence
- [ ] File uploads/deletes
- [ ] CMS operations

---

## 🚀 Deployment

### Environment Variables

```env
# Admin Access
ADMIN_EMAILS=admin@yourdomain.com
# ou
ADMIN_USER_IDS=user_xxx,user_yyy

# Clerk
CLERK_SECRET_KEY=sk_xxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx

# Database
DATABASE_URL=postgresql://...

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Build Process
```bash
# Gerar Prisma Client
npx prisma generate

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## 📝 Troubleshooting

### Problemas Comuns

#### 1. Acesso Negado
**Erro:** 403 Forbidden no `/admin`

**Solução:**
```bash
# Verificar .env.local
ADMIN_EMAILS=seu@email.com

# Reiniciar servidor
npm run dev
```

#### 2. Settings não salvam
**Erro:** `Cannot read properties of undefined (reading 'updateMany')`

**Solução:**
```bash
# Regenerar Prisma Client
npx prisma generate

# Matar processos Next.js
pkill -f "next-server"

# Reiniciar
npm run dev
```

#### 3. Sync com Clerk falha
**Erro:** Sync não encontra usuários

**Solução:**
- Verificar `CLERK_SECRET_KEY` no `.env.local`
- Confirmar permissões da API key no Clerk
- Usar modo debug: `{ debug: true }` no body

#### 4. Créditos não atualizam
**Erro:** Saldo não reflete mudanças

**Solução:**
```typescript
// Forçar refresh do React Query
const { refresh } = useCredits()
await refresh()
```

---

## 📚 Recursos e Links

### Documentação Relacionada
- [Architecture Overview](./architecture.md)
- [Credits System](./credits.md)
- [CMS System](../GUIA-COMPONENTES-CMS.md)
- [Site Settings](../GUIA-CONFIGURACOES-SITE.md)
- [Admin QA Guide](./testing/admin-qa-guide.md)

### APIs Clerk
- [Clerk Backend API](https://clerk.com/docs/reference/backend-api)
- [Clerk Webhooks](https://clerk.com/docs/integrations/webhooks)
- [Billing & Subscriptions](https://clerk.com/docs/billing)

### Código Principal
- Admin routes: `src/app/admin/`
- API routes: `src/app/api/admin/`
- Utilities: `src/lib/admin-utils.ts`
- Hooks: `src/hooks/admin/`
- Components: `src/components/admin/`

---

## 🎯 Próximos Passos

### Features Planejadas

#### 1. Analytics Avançado
- Dashboard personalizado
- Relatórios customizados
- Export de dados (CSV, Excel)
- Gráficos interativos

#### 2. Automações
- Tarefas agendadas
- Notificações automáticas
- Alertas de sistema
- Backup automático

#### 3. Auditoria
- Log completo de ações admin
- Histórico de mudanças
- Rastreamento de edições
- Compliance reports

#### 4. Melhorias UI
- Dark mode aprimorado
- Temas customizáveis
- Drag-and-drop melhorado
- Mobile responsiveness

---

**Painel Administrativo completo e pronto para produção!** 🎉
