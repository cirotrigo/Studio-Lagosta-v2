# Performance Optimization Recommendations

## Análise do Log de Compilação

### Problemas Identificados

1. **Webpack Serialization Warning (174kiB)**
2. **API Routes Lentas (3-5 segundos)**
3. **Bundle Size Grande (1.4GB .next directory)**
4. **Compilação Dashboard: 5.1s (3924 módulos)**
5. **MetadataBase Warning** ✅ RESOLVIDO

---

## 🚀 Otimizações Recomendadas (Prioridade Alta)

### 1. Otimizar `/api/projects` Route (CRÍTICO)

**Problema:** 5.3 segundos de resposta
**Causa:** Query complexa com JOINs e contagem de posts agendados

**Solução A: Implementar Cache com Redis/Vercel KV**
```typescript
// src/lib/cache.ts
import { kv } from '@vercel/kv'; // ou outra solução de cache

export async function getCachedProjects(userId: string, orgId: string | null) {
  const cacheKey = `projects:${userId}:${orgId || 'personal'}`;

  // Try cache first
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  // Fetch from database
  const projects = await fetchProjectsFromDb(userId, orgId);

  // Cache for 5 minutes
  await kv.set(cacheKey, projects, { ex: 300 });

  return projects;
}
```

**Solução B: Adicionar Índices no Banco de Dados**
```sql
-- Adicione índices para melhorar performance de queries
CREATE INDEX idx_project_userid_updatedat ON "Project"(userId, updatedAt DESC);
CREATE INDEX idx_orgproject_orgid ON "OrganizationProject"(organizationId);
CREATE INDEX idx_socialpost_projectid_status ON "SocialPost"(projectId, status);
CREATE INDEX idx_socialpost_scheduled ON "SocialPost"(scheduledDatetime) WHERE status IN ('SCHEDULED', 'PROCESSING');
```

**Solução C: Lazy Load Scheduled Post Count**
```typescript
// Remova a contagem de posts agendados da query inicial
// Carregue sob demanda apenas quando necessário via endpoint separado

// Nova rota: /api/projects/[id]/scheduled-count
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const count = await db.socialPost.count({
    where: {
      projectId: parseInt(params.id),
      status: { in: ['SCHEDULED', 'PROCESSING'] },
      // ... resto da lógica
    }
  });
  return NextResponse.json({ count });
}
```

### 2. Implementar Parallel Data Fetching no Dashboard

**Problema:** Dashboard faz 7 requests sequenciais (2-3s cada)

**Solução: Server-Side Parallel Fetching**
```typescript
// src/app/(protected)/studio/page.tsx
// Mova para Server Component e use parallel fetching

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  // Fetch em paralelo no servidor
  const [
    projects,
    timelineData,
    subscription,
    siteConfig,
  ] = await Promise.all([
    fetchProjects(userId, orgId),
    fetchTimeline(orgId),
    fetchSubscription(userId, orgId),
    fetchSiteConfig(),
  ]);

  return <DashboardClient data={{ projects, timelineData, subscription, siteConfig }} />;
}
```

### 3. Code Splitting e Dynamic Imports

**Problema:** Dashboard carrega 3924 módulos (5.1s)

**Solução: Lazy Load Components Pesados**
```typescript
// src/app/(protected)/studio/page.tsx
import dynamic from 'next/dynamic';

// Lazy load charts e widgets
const UsageTrendChart = dynamic(
  () => import('@/components/organizations/usage-trend-chart').then(mod => ({ default: mod.UsageTrendChart })),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const InstagramMiniWidget = dynamic(
  () => import('@/components/instagram/instagram-mini-widget').then(mod => ({ default: mod.InstagramMiniWidget })),
  { loading: () => <WidgetSkeleton />, ssr: false }
);
```

### 4. Otimizar Font Loading

**Problema:** Carregando 9 pesos de fonte (100-900) + italic

**Solução: Reduzir Pesos Usados**
```typescript
// src/app/layout.tsx
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // Apenas pesos necessários
  style: ["normal"],
  display: "swap",
  preload: true,
});
```

### 5. Configurações Next.js para Performance

**Adicione ao next.config.ts:**
```typescript
const nextConfig: NextConfig = {
  // ... configurações existentes

  // Otimizações de performance
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      'lucide-react',
      'recharts',
    ],
    webpackMemoryOptimizations: true,
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Modularize imports
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },
};
```

### 6. Database Query Optimizations

**Adicione ao schema.prisma:**
```prisma
// Adicione índices para queries frequentes
model Project {
  // ... campos existentes

  @@index([userId, updatedAt(sort: Desc)])
  @@index([updatedAt(sort: Desc)])
}

model SocialPost {
  // ... campos existentes

  @@index([projectId, status])
  @@index([status, scheduledDatetime])
}

model OrganizationProject {
  // ... campos existentes

  @@index([organizationId])
  @@index([projectId])
}
```

### 7. React Query Optimizations

**Configure stale times mais agressivos:**
```typescript
// src/components/providers/query-provider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      gcTime: 10 * 60 * 1000, // 10 minutos
      refetchOnWindowFocus: false, // Desabilite em produção
      retry: 1,
    },
  },
});
```

---

## 📊 Impacto Esperado

### Antes das Otimizações:
- Dashboard: ~5.5s primeira carga
- API Projects: ~5.3s
- API Calls paralelas: ~3-4s cada
- **Total: ~15-20s para dashboard completo**

### Depois das Otimizações (estimado):
- Dashboard: ~1-2s primeira carga
- API Projects (cached): ~100-300ms
- API Calls paralelas no servidor: ~500ms total
- **Total: ~2-3s para dashboard completo** ⚡

**Melhoria: 85% mais rápido**

---

## 🎯 Priorização de Implementação

### Fase 1 (Rápido Ganho):
1. ✅ Fix metadataBase warning
2. Otimizar font loading (reduzir pesos)
3. Adicionar experimental.optimizePackageImports
4. Configurar React Query com stale times

### Fase 2 (Alto Impacto):
1. Implementar cache Redis/KV para /api/projects
2. Adicionar índices no banco de dados
3. Code splitting no dashboard

### Fase 3 (Arquitetura):
1. Migrar dashboard para Server Component
2. Lazy load scheduled post counts
3. Implementar ISR (Incremental Static Regeneration)

---

## 🔍 Monitoramento

**Adicione métricas de performance:**
```typescript
// src/lib/monitoring.ts
export function trackApiPerformance(route: string, duration: number) {
  if (duration > 1000) {
    console.warn(`[PERF] Slow API: ${route} took ${duration}ms`);
  }
}

// Use em API routes:
const start = Date.now();
const result = await fetchData();
trackApiPerformance('/api/projects', Date.now() - start);
```

---

## 📦 Bundle Analysis

**Execute para analisar bundle:**
```bash
npm install -D @next/bundle-analyzer
```

```typescript
// next.config.ts
import withBundleAnalyzer from '@next/bundle-analyzer';

const config = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
```

```bash
ANALYZE=true npm run build
```

---

## ✅ Checklist de Implementação

- [ ] Adicionar índices no banco de dados
- [ ] Implementar cache para /api/projects
- [ ] Reduzir pesos de fonte Montserrat
- [ ] Adicionar optimizePackageImports
- [ ] Code splitting no dashboard
- [ ] Migrar para Server Component (dashboard)
- [ ] Lazy load scheduled counts
- [ ] Configurar bundle analyzer
- [ ] Adicionar monitoring de performance
- [ ] Testar em staging
- [ ] Deploy gradual em produção
