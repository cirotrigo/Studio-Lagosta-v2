---
status: ready
generated: 2026-02-02
agents:
  - type: "feature-developer"
    role: "Implement frontend components and API endpoints"
  - type: "frontend-specialist"
    role: "Design mobile-first responsive UI"
phases:
  - id: "phase-1"
    name: "API & Data Layer"
    prevc: "P"
  - id: "phase-2"
    name: "UI Components & Page"
    prevc: "E"
  - id: "phase-3"
    name: "Integration & Testing"
    prevc: "V"
---

# Pagina Global de Criativos com Filtro por Projeto

> Criar uma pagina principal que lista todos os criativos de todos os projetos, com filtro em formato carrossel mostrando logos dos projetos, otimizada para mobile com botoes de baixar e agendar.

## Task Snapshot
- **Primary goal:** Criar uma pagina `/criativos` que liste todos os criativos do usuario de forma centralizada, permitindo filtrar por projeto atraves de um carrossel horizontal com as logos.
- **Success signal:** Usuario consegue visualizar, filtrar por projeto, baixar e agendar criativos de forma fluida no desktop e mobile.
- **Key references:**
  - Pagina existente: `src/app/(protected)/projects/[id]/creativos/page.tsx`
  - Hook de projetos: `src/hooks/use-project.ts`
  - API de generations: `src/app/api/projects/[projectId]/generations/route.ts`

## Codebase Context

### Modelos Relevantes (Prisma)
- **Generation**: Armazena criativos exportados com `resultUrl`, `templateName`, `projectId`, `createdBy`, `status`
- **Project**: Contem `logoUrl` para o logo do projeto, `name` para nome
- **Logo**: Modelo separado para logos do projeto com `fileUrl` e `isProjectLogo`

### Padroes Existentes
- TanStack Query para data fetching com custom hooks
- API client centralizado em `@/lib/api-client`
- Componente `GalleryItem` para renderizacao de criativos
- `PostComposer` para agendamento de posts
- Sidebar com `navigationItems` array em `src/components/app/sidebar.tsx`

### Tech Stack
- Next.js 15 App Router
- Tailwind CSS v4 + Radix UI
- TanStack Query (React Query)
- Clerk para autenticacao

## Arquitetura da Solucao

### 1. Nova API Endpoint
**Arquivo:** `src/app/api/generations/route.ts`

```typescript
// GET /api/generations?projectId=X&page=1&pageSize=50
// Retorna todas as generations do usuario, opcionalmente filtradas por projeto
// Inclui dados do projeto (logoUrl, name) para o carrossel
```

### 2. Novo Hook
**Arquivo:** `src/hooks/use-generations.ts`

```typescript
export function useAllGenerations(projectId?: number | null) {
  // Busca todas as generations do usuario
  // Agrupa projetos para o carrossel
}
```

### 3. Componente Carrossel de Projetos
**Arquivo:** `src/components/criativos/project-carousel-filter.tsx`

```typescript
// Carrossel horizontal com scroll snap
// Mobile: 4-5 logos visiveis com scroll touch
// Desktop: scroll horizontal ou navegacao por setas
// Logo selecionado = filtro ativo (com anel de destaque)
// Opcao "Todos" no inicio
```

### 4. Nova Pagina
**Arquivo:** `src/app/(protected)/criativos/page.tsx`

```typescript
// Layout mobile-first
// Header com titulo + carrossel de projetos
// Grid responsivo de criativos (GalleryItem)
// Sticky bottom bar no mobile com acoes rapidas
```

### 5. Atualizacao do Sidebar
**Arquivo:** `src/components/app/sidebar.tsx`

```typescript
// Adicionar item "Criativos" com icone Layers
// Posicao: logo abaixo de "Gerar Criativo" (indice 2 no array)
// Ordem final: Painel > Gerar Criativo > Criativos > Projetos > ...
```

## Working Phases

### Phase 1 - API & Data Layer

**Passos:**

1. **Criar API endpoint global de generations**
   - Arquivo: `src/app/api/generations/route.ts`
   - Funcionalidades:
     - GET com paginacao (page, pageSize)
     - Filtro opcional por projectId
     - Include projeto com logoUrl e name
     - Ordenacao por createdAt DESC
     - Verificacao de acesso (projetos do usuario + organizacao)
   - Response:
     ```typescript
     {
       generations: GenerationRecord[],
       projects: { id: number, name: string, logoUrl: string | null }[],
       pagination: { page, pageSize, total, totalPages }
     }
     ```

2. **Criar hook useAllGenerations**
   - Arquivo: `src/hooks/use-generations.ts`
   - Query key: `['all-generations', projectId]`
   - Retorna dados formatados para UI
   - Extrai lista unica de projetos para carrossel

**Arquivos a criar/modificar:**
- `src/app/api/generations/route.ts` (criar)
- `src/hooks/use-generations.ts` (criar)

### Phase 2 - UI Components & Page

**Passos:**

1. **Criar componente ProjectCarouselFilter**
   - Arquivo: `src/components/criativos/project-carousel-filter.tsx`
   - Props: `projects`, `selectedId`, `onSelect`
   - Layout horizontal com scroll-snap
   - Item "Todos" no inicio (null = sem filtro)
   - Logo circular com fallback para inicial do nome
   - Estado selecionado: ring-2 ring-primary
   - Mobile: touch scroll, ~4 itens visiveis
   - Desktop: setas de navegacao opcionais

2. **Criar pagina principal /criativos**
   - Arquivo: `src/app/(protected)/criativos/page.tsx`
   - Estrutura:
     ```
     [Header: Titulo + busca]
     [ProjectCarouselFilter - sticky no mobile]
     [Grid de Criativos - GalleryItem]
     [Mobile: Bottom bar fixa com acoes]
     ```
   - Reutilizar logica do `projects/[id]/creativos/page.tsx`
   - Mobile-first: cards maiores, botoes touch-friendly
   - Skeleton loading enquanto carrega

3. **Mobile Action Bar**
   - Botoes grandes e espacados
   - Icone + texto para clareza
   - Acoes: Baixar, Agendar
   - Aparece quando item esta selecionado (long-press ou checkbox)

4. **Adicionar item ao Sidebar**
   - Arquivo: `src/components/app/sidebar.tsx`
   - Posicao: logo abaixo de "Gerar Criativo" (indice 2)
   - Ordem final do menu:
     1. Painel
     2. Gerar Criativo
     3. **Criativos** (novo)
     4. Projetos
     5. ...
   - Codigo:
     ```typescript
     { name: "Criativos", href: "/criativos", icon: Layers }
     ```

**Arquivos a criar/modificar:**
- `src/components/criativos/project-carousel-filter.tsx` (criar)
- `src/app/(protected)/criativos/page.tsx` (criar)
- `src/components/app/sidebar.tsx` (modificar)

### Phase 3 - Integration & Testing

**Passos:**

1. **Integracao com PostComposer**
   - Passar generationId para agendamento
   - Pre-preencher mediaUrls e postType baseado nas dimensoes

2. **Otimizacoes Mobile**
   - Testar scroll performance do carrossel
   - Verificar touch targets (min 44px)
   - Testar em diferentes tamanhos de tela

3. **Testes manuais**
   - Filtro por projeto funciona corretamente
   - Download de imagem/video
   - Agendamento abre PostComposer
   - Navegacao mobile fluida
   - Estado vazio (sem criativos)

## Detalhes de Implementacao

### Estrutura do Carrossel (Mobile-First)

```tsx
<div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory py-2 px-4 -mx-4">
  {/* Item "Todos" */}
  <button className="snap-start flex-shrink-0 flex flex-col items-center gap-1">
    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
      <Grid3X3 className="w-6 h-6" />
    </div>
    <span className="text-xs">Todos</span>
  </button>

  {/* Projetos */}
  {projects.map(project => (
    <button key={project.id} className="snap-start flex-shrink-0 flex flex-col items-center gap-1">
      <div className={cn(
        "w-14 h-14 rounded-full overflow-hidden ring-2 ring-offset-2",
        selected ? "ring-primary" : "ring-transparent"
      )}>
        {project.logoUrl ? (
          <Image src={project.logoUrl} alt={project.name} fill className="object-cover" />
        ) : (
          <div className="w-full h-full bg-primary/10 flex items-center justify-center text-lg font-bold">
            {project.name[0]}
          </div>
        )}
      </div>
      <span className="text-xs truncate max-w-[60px]">{project.name}</span>
    </button>
  ))}
</div>
```

### Layout Mobile da Pagina

```tsx
<div className="flex flex-col min-h-[calc(100dvh-8rem)]">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <h1 className="text-xl font-bold">Criativos</h1>
    <Input placeholder="Buscar..." className="w-40" />
  </div>

  {/* Carrossel - sticky no mobile */}
  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-6 px-6 pb-3">
    <ProjectCarouselFilter {...} />
  </div>

  {/* Grid */}
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 flex-1">
    {generations.map(gen => <GalleryItem key={gen.id} {...} />)}
  </div>

  {/* Mobile Action Bar - quando ha selecao */}
  {selectedIds.size > 0 && (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t md:hidden">
      <div className="flex gap-3">
        <Button className="flex-1" onClick={handleDownload}>
          <Download className="mr-2 h-5 w-5" /> Baixar
        </Button>
        <Button className="flex-1" variant="secondary" onClick={handleSchedule}>
          <Calendar className="mr-2 h-5 w-5" /> Agendar
        </Button>
      </div>
    </div>
  )}
</div>
```

## Estimativa de Esforco

| Phase | Estimativa | Complexidade |
|-------|-----------|--------------|
| Phase 1 - API & Hooks | 1-2 horas | Baixa |
| Phase 2 - UI Components | 3-4 horas | Media |
| Phase 3 - Integration | 1-2 horas | Baixa |
| **Total** | **5-8 horas** | - |

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Performance com muitos criativos | Paginacao infinita + virtualizacao se necessario |
| Logos de projeto faltando | Fallback para inicial do nome com cor baseada no ID |
| Scroll do carrossel nao funcionar bem no iOS | Usar scroll-snap-type: x mandatory |

## Definicao de Pronto

- [ ] API retorna criativos de todos os projetos do usuario
- [ ] Carrossel mostra logos dos projetos com filtro funcional
- [ ] Grid responsivo com GalleryItem
- [ ] Download funciona para imagens e videos
- [ ] Agendamento abre PostComposer com dados pre-preenchidos
- [ ] Mobile: layout otimizado, botoes touch-friendly
- [ ] Item "Criativos" aparece no sidebar
- [ ] Sem erros de console
- [ ] Funciona em producao

## Arquivos a Serem Criados/Modificados

### Novos Arquivos
1. `src/app/api/generations/route.ts` - API endpoint global
2. `src/hooks/use-generations.ts` - Hook TanStack Query
3. `src/components/criativos/project-carousel-filter.tsx` - Componente carrossel
4. `src/app/(protected)/criativos/page.tsx` - Pagina principal

### Arquivos Modificados
1. `src/components/app/sidebar.tsx` - Adicionar item de menu
