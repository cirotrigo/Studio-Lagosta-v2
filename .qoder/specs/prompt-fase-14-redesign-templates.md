# Fase 14: Redesign do Sistema de Templates

## Contexto

O sistema atual possui:
- **Template** (container) → contém múltiplas **Pages** (designs individuais)
- Sistema de tags implementado na Fase 13
- Migração já executada: cada página agora tem uma tag com o nome do seu template original

## Objetivo

Transformar a UX para que **cada página seja tratada como um template independente**, organizados por **tags obrigatórias**.

## Regras de Negócio

### Tags
1. **Tag obrigatória**: Toda página/template DEVE ter pelo menos 1 tag
2. **Tag "Template"**: Marca designs prontos para uso em "Arte Rápida"
3. **Tag do container original**: Já aplicada pela migração (ex: "Quarta-feira", "Promoção")
4. **Tags customizadas**: Usuário pode criar e aplicar livremente

### Nomenclatura
- Na UI, "Page" passa a se chamar "Template" ou "Design"
- O container antigo (model Template) passa a ser apenas um agrupador técnico, invisível ao usuário

## Escopo da Implementação

### 1. Desktop App - Editor Page

#### 1.1 Galeria Unificada de Templates
```
┌─────────────────────────────────────────────────────────────────┐
│  🎨 Templates do Projeto                           [+ Novo]    │
├─────────────────────────────────────────────────────────────────┤
│  Filtrar: [Todos] [Template] [Quarta-feira] [Promoção] [+]     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │ 📄      │ │ 📄      │ │ 📄      │ │ 📄      │               │
│  │ thumb   │ │ thumb   │ │ thumb   │ │ thumb   │               │
│  │         │ │         │ │         │ │         │               │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤               │
│  │ Nome    │ │ Nome    │ │ Nome    │ │ Nome    │               │
│  │ #Tag    │ │ #Tag    │ │ #Tag    │ │ #Tag    │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.2 Componentes a Modificar/Criar
- `EditorPage.tsx` - Nova estrutura de galeria
- `TemplateCard.tsx` (novo) - Card individual de template com tags
- `TagFilterBar.tsx` (novo) - Barra de filtros por tags
- `TemplateTagsModal.tsx` (novo) - Modal para editar tags de um template

#### 1.3 Comportamentos
- Clique no template: Abre no editor
- Hover: Mostra ações (editar, duplicar, deletar, gerenciar tags)
- Duplo clique em tag: Filtra por essa tag
- Arrastar template: Reordena (futuro)

### 2. Desktop App - Arte Rápida (GenerateArtTab)

#### 2.1 Filtro Inteligente
- Padrão: Mostra apenas templates com tag "Template"
- Usuário pode alternar para ver todos ou filtrar por outras tags
- Manter comportamento atual de seleção de foto + variações

### 3. API - Novos Endpoints

#### 3.1 GET /api/projects/:projectId/designs
Lista todos os designs (páginas) do projeto, com suporte a filtros.

```typescript
// Query params
{
  tags?: string[]      // Filtrar por tags (OR)
  format?: 'STORY' | 'FEED' | 'SQUARE'
  search?: string      // Busca por nome
  limit?: number
  offset?: number
}

// Response
{
  designs: Array<{
    id: string
    name: string
    thumbnail: string | null
    width: number
    height: number
    format: string
    tags: string[]
    templateId: number    // ID do container (para compatibilidade)
    templateName: string  // Nome do container original
    updatedAt: string
  }>
  total: number
  hasMore: boolean
}
```

#### 3.2 PATCH /api/projects/:projectId/designs/:designId/tags
Atualiza tags de um design.

```typescript
// Body
{
  tags: string[]  // Lista completa de tags (substitui)
}

// Validação
- Pelo menos 1 tag obrigatória
- Tags devem existir no projeto (ou criar automaticamente)
```

### 4. Componentes Web (Futuros)

Mesma lógica do desktop, aplicada aos componentes web:
- `DesignsGallery.tsx`
- `DesignCard.tsx`
- `TagFilter.tsx`

### 5. Banco de Dados

#### Sem alterações estruturais
- Manter model `Template` como container técnico
- Manter model `Page` com campo `tags: String[]`
- Manter model `ProjectTag` para gerenciamento de tags

#### Validações a adicionar
- Ao salvar Page: garantir `tags.length >= 1`
- Ao deletar ProjectTag: verificar se há Pages usando (soft delete ou warning)

## Arquivos Principais a Modificar

### Desktop App
```
desktop-app/src/
├── pages/
│   └── EditorPage.tsx              # Refatorar galeria
├── components/
│   └── editor/
│       ├── TemplateCard.tsx        # NOVO - Card de template
│       ├── TagFilterBar.tsx        # NOVO - Filtro por tags
│       ├── TemplateTagsModal.tsx   # NOVO - Editar tags
│       ├── DesignsGallery.tsx      # NOVO - Galeria unificada
│       └── PageTagFilter.tsx       # Atualizar para novo design
├── stores/
│   └── editor.store.ts             # Adicionar estado de filtros
└── hooks/
    └── use-project-designs.ts      # NOVO - Hook para designs
```

### Web API
```
src/app/api/projects/[projectId]/
├── designs/
│   ├── route.ts                    # NOVO - GET designs
│   └── [designId]/
│       └── tags/
│           └── route.ts            # NOVO - PATCH tags
```

## Ordem de Implementação

### Sprint 1: Fundação
1. Criar endpoint GET /api/projects/:projectId/designs
2. Criar hook `use-project-designs.ts`
3. Criar componente `DesignsGallery.tsx` (lista básica)

### Sprint 2: UI Desktop
4. Criar `TemplateCard.tsx` com exibição de tags
5. Criar `TagFilterBar.tsx` com multi-select
6. Integrar na `EditorPage.tsx`

### Sprint 3: Gerenciamento de Tags
7. Criar `TemplateTagsModal.tsx`
8. Criar endpoint PATCH tags
9. Validação de tag obrigatória

### Sprint 4: Arte Rápida
10. Atualizar `GenerateArtTab.tsx` para usar nova estrutura
11. Filtro padrão por tag "Template"

### Sprint 5: Polimento
12. Animações e transições
13. Estados vazios e loading
14. Testes e ajustes

## Thumbnails - Proporção por Formato

**IMPORTANTE**: Os thumbnails devem respeitar a proporção do formato do template.

| Formato | Proporção | Dimensões Base | CSS Class |
|---------|-----------|----------------|-----------|
| STORY | 9:16 | 1080x1920 | `aspect-[9/16]` |
| FEED (Retrato) | 4:5 | 1080x1350 | `aspect-[4/5]` |
| SQUARE | 1:1 | 1080x1080 | `aspect-square` |

### Web (já implementado)
A web já usa proporções corretas em `TemplateItem.tsx`:
```typescript
const getAspectRatioClass = () => {
  switch (template.type) {
    case 'STORY': return 'aspect-[9/16]'
    case 'FEED': return 'aspect-[4/5]'
    case 'SQUARE': return 'aspect-square'
    default: return 'aspect-[4/5]'
  }
}
```

### Electron (a implementar)
Nos componentes do desktop-app, aplicar a mesma lógica:

```typescript
// Função utilitária para proporção
export function getAspectRatioClass(format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'): string {
  switch (format) {
    case 'STORY': return 'aspect-[9/16]'
    case 'FEED_PORTRAIT': return 'aspect-[4/5]'
    case 'SQUARE': return 'aspect-square'
    default: return 'aspect-[4/5]'
  }
}

// Ou via style inline
export function getAspectRatio(format: string): number {
  switch (format) {
    case 'STORY': return 9 / 16      // 0.5625
    case 'FEED_PORTRAIT': return 4 / 5  // 0.8
    case 'SQUARE': return 1          // 1.0
    default: return 4 / 5
  }
}
```

### Arquivos a atualizar no Electron:
- `FilteredPagesGallery.tsx` - galeria de páginas filtradas
- `GenerateArtTab.tsx` - seleção de templates na Arte Rápida
- `TemplateCard.tsx` (novo) - card de template
- `PagesBar.tsx` - barra lateral de páginas

## Checklist de Validação

- [ ] Todas as páginas têm pelo menos 1 tag
- [ ] Filtro por tags funciona corretamente
- [ ] Arte Rápida mostra apenas templates com tag "Template"
- [ ] **Thumbnails respeitam proporção do formato (STORY/FEED/SQUARE)**
- [ ] UI clara e intuitiva
- [ ] Sem breaking changes no sync desktop ↔ web
- [ ] Performance aceitável com muitos templates

---

## Prompt para Nova Conversa

```
Implemente a Fase 14 do projeto Studio Lagosta: Redesign do Sistema de Templates.

CONTEXTO:
- O sistema de tags foi implementado na Fase 13
- Uma migração já foi executada: cada página agora tem uma tag com o nome do seu template original (87 tags criadas, 689 páginas atualizadas)
- O objetivo é tratar cada página como um "template" independente, organizado por tags

REGRAS:
1. Tag obrigatória - toda página DEVE ter pelo menos 1 tag
2. Tag "Template" marca designs prontos para Arte Rápida
3. Na UI, "Page" passa a se chamar "Template" ou "Design"
4. Thumbnails DEVEM respeitar proporção do formato:
   - STORY: aspect-[9/16]
   - FEED/FEED_PORTRAIT: aspect-[4/5]
   - SQUARE: aspect-square

ESCOPO INICIAL (Sprint 1):
1. Criar endpoint GET /api/projects/:projectId/designs
   - Retorna todas as páginas do projeto com suas tags
   - Suporte a filtro por tags, formato e busca

2. Criar hook use-project-designs.ts no desktop-app
   - Wrapper do endpoint com React Query

3. Criar componente DesignsGallery.tsx
   - Lista de cards com thumbnail, nome e tags
   - Thumbnails com proporção correta por formato
   - Clique abre no editor

Leia o arquivo .qoder/specs/prompt-fase-14-redesign-templates.md para o plano completo.

Comece pela Sprint 1 - Fundação.
```
