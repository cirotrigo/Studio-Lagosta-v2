# Sistema de Páginas Múltiplas - Studio Lagosta

## 📝 Visão Geral

O sistema de páginas múltiplas permite que templates tenham várias páginas independentes, cada uma com seu próprio canvas Konva, layers e configurações. Similar ao Canva/Polotno, onde cada página é uma "slide" separado.

## 🏗️ Arquitetura

### Database Schema

```prisma
model Page {
  id         String   @id @default(cuid())
  name       String
  width      Int
  height     Int
  layers     Json     @default("[]")
  background String?
  order      Int      @default(0)
  thumbnail  String?
  templateId Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  Template   Template @relation(...)
}
```

### TypeScript Interfaces

```typescript
// src/types/template.ts
interface Page {
  id: string
  name: string
  width: number
  height: number
  layers: Layer[]
  background?: string
  order: number
  thumbnail?: string
  createdAt?: Date
  updatedAt?: Date
}

interface MultiPageDesignData {
  pages: Page[]
  currentPageId: string
  templateId?: number
}
```

### API Routes

**Base:** `/api/templates/[id]/pages`

- **GET** `/api/templates/[id]/pages` - Listar todas as páginas
- **POST** `/api/templates/[id]/pages` - Criar nova página
- **GET** `/api/templates/[id]/pages/[pageId]` - Buscar página específica
- **PATCH** `/api/templates/[id]/pages/[pageId]` - Atualizar página
- **DELETE** `/api/templates/[id]/pages/[pageId]` - Deletar página (mínimo 1)
- **POST** `/api/templates/[id]/pages/[pageId]/duplicate` - Duplicar página

### React Hooks (TanStack Query)

```typescript
// src/hooks/use-pages.ts
usePages(templateId)          // Query: listar páginas
usePage(templateId, pageId)   // Query: buscar página
useCreatePage()               // Mutation: criar
useUpdatePage()               // Mutation: atualizar
useDeletePage()               // Mutation: deletar
useDuplicatePage()            // Mutation: duplicar
useReorderPages()             // Mutation: reordenar
```

## 🎨 Componentes

### 1. MultiPageProvider (Context)

**Localização:** `src/contexts/multi-page-context.tsx`

Gerencia estado global das páginas:

```typescript
interface MultiPageContextValue {
  templateId: number
  pages: Page[]
  currentPageId: string | null
  currentPage: Page | null
  setCurrentPageId: (pageId: string) => void
  isLoading: boolean
  updatePageThumbnail: (pageId: string, thumbnail: string) => Promise<void>
  savePageLayers: (pageId: string, layers: unknown[]) => Promise<void>
}
```

**Uso:**
```typescript
import { MultiPageProvider, useMultiPage } from '@/contexts/multi-page-context'

// Wrapper
<MultiPageProvider templateId={template.id}>
  <TemplateEditor />
</MultiPageProvider>

// Consumir
const { pages, currentPageId, setCurrentPageId } = useMultiPage()
```

### 2. PagesBar (Barra Inferior)

**Localização:** `src/components/templates/template-editor-shell.tsx`

Barra horizontal na parte inferior do editor (estilo Polotno) com:

- Miniaturas de cada página (64x64px)
- Indicador visual da página ativa (border primary)
- Botões de ação por página (hover):
  - Duplicar (ícone Copy)
  - Deletar (ícone Trash2) - desabilitado se só há 1 página
- Botão "+" para adicionar nova página
- Navegação por clique na miniatura

### 3. PagesSidebar (Sidebar Lateral)

**Localização:** `src/components/templates/pages-sidebar.tsx`

Sidebar lateral alternativa (não integrada por padrão) com:

- Lista vertical de páginas com thumbnails maiores (150x200px)
- Setas de navegação (anterior/próxima)
- Contador de páginas (ex: 2/5)
- Double-click para renomear página
- Ações por página (duplicar, deletar)

**Uso:**
```typescript
<PagesSidebar
  templateId={templateId}
  currentPageId={currentPageId}
  onPageChange={setCurrentPageId}
  canvasData={design}
/>
```

## 🖼️ Thumbnails

### Geração Automática

**Localização:** `src/lib/page-thumbnail-utils.ts`

```typescript
import { generatePageThumbnail, createDebouncedThumbnailGenerator } from '@/lib/page-thumbnail-utils'

// Gerar thumbnail
const thumbnail = await generatePageThumbnail(stage, page, {
  maxWidth: 150,
  maxHeight: 200,
  quality: 0.7
})

// Com debounce (500ms padrão)
const debouncedGenerate = createDebouncedThumbnailGenerator(500)
debouncedGenerate(stage, page, (thumbnail) => {
  // Callback com thumbnail gerado
})
```

### Processo de Geração

1. Salvar estado atual (zoom, posição, seleção)
2. Normalizar zoom para 100%
3. Ocultar guides temporariamente
4. Calcular dimensões mantendo aspect ratio
5. Gerar JPEG com qualidade configurável (default 0.7)
6. Restaurar estado original

### Quando Atualizar Thumbnails

- Ao salvar página (manualmente)
- Debounced após mudanças no design (500ms)
- Ao trocar de página ativa
- Após adicionar/remover layers

## 📋 Funcionalidades

### 1. Criar Nova Página

```typescript
const { mutateAsync: createPage } = useCreatePage()

await createPage({
  templateId,
  data: {
    name: 'Página 2',
    width: 1080,
    height: 1920,
    layers: [],
    background: '#ffffff',
    order: 1
  }
})
```

### 2. Duplicar Página

Copia todos os layers e configurações:

```typescript
const { mutateAsync: duplicatePage } = useDuplicatePage()

await duplicatePage({ templateId, pageId })
// Cria "Página 1 (cópia)" com mesmo conteúdo
```

### 3. Deletar Página

Validação: mínimo 1 página sempre.

```typescript
const { mutateAsync: deletePage } = useDeletePage()

if (pages.length > 1) {
  await deletePage({ templateId, pageId })
}
```

### 4. Navegar Entre Páginas

```typescript
const { setCurrentPageId } = useMultiPage()

// Por ID
setCurrentPageId('page-abc-123')

// Próxima/Anterior (com atalhos Ctrl+PageUp/PageDown)
const goToNext = () => {
  const currentIndex = pages.findIndex(p => p.id === currentPageId)
  if (currentIndex < pages.length - 1) {
    setCurrentPageId(pages[currentIndex + 1].id)
  }
}
```

### 5. Renomear Página

Double-click no nome (PagesSidebar):

```typescript
const { mutateAsync: updatePage } = useUpdatePage()

await updatePage({
  templateId,
  pageId,
  data: { name: 'Novo Nome' }
})
```

### 6. Reordenar Páginas

Drag & drop (se implementado):

```typescript
const { mutateAsync: reorderPages } = useReorderPages()

await reorderPages({
  templateId,
  pageIds: ['page-2', 'page-1', 'page-3'] // Nova ordem
})
```

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl + PageUp` | Página anterior |
| `Ctrl + PageDown` | Próxima página |

*Implementados no componente PagesSidebar.*

## 🔄 Fluxo de Trabalho

### Ao Abrir Template

1. `MultiPageProvider` busca todas as páginas via `usePages(templateId)`
2. Define primeira página como `currentPageId` (se não especificado)
3. `TemplateEditorProvider` carrega design da página atual
4. `PagesBar` renderiza miniaturas de todas as páginas

### Ao Trocar de Página

1. Usuário clica em thumbnail na `PagesBar`
2. `setCurrentPageId(newPageId)` atualiza context
3. **(TODO)** `TemplateEditorProvider` deve recarregar design da nova página
4. Canvas re-renderiza com layers da nova página

### Ao Salvar

1. Usuário clica "Salvar" no header
2. Gerar thumbnail da página atual
3. Salvar layers da página atual no banco
4. Atualizar `updatedAt` da página

### Ao Adicionar Página

1. Usuário clica "+" na `PagesBar`
2. `createPage` cria nova entrada no banco
3. Nova página herda dimensões do canvas atual
4. Navegar automaticamente para nova página

## 🚧 TODOs & Melhorias Futuras

### Essenciais

- [ ] **Sincronizar TemplateEditorProvider com MultiPageProvider**
  - Atualmente, trocar de página não recarrega o design no editor
  - Necessário: ao mudar `currentPageId`, carregar `currentPage.layers` no context

- [ ] **Auto-save de layers ao trocar página**
  - Salvar layers da página atual antes de navegar para outra
  - Evitar perda de dados não salvos

- [ ] **Geração automática de thumbnails**
  - Debounced thumbnail generation após mudanças
  - Integrar com `useMultiPage.updatePageThumbnail()`

### Opcionais

- [ ] Drag & drop para reordenar páginas
- [ ] Exportação multi-página (PDF, ZIP de imagens)
- [ ] Templates multi-página predefinidos
- [ ] Copiar/colar layers entre páginas
- [ ] Duplicar layers de uma página para outra
- [ ] Grid view de páginas (além da barra horizontal)
- [ ] Animações de transição entre páginas
- [ ] Undo/redo cross-page

## 📦 Arquivos Criados/Modificados

### Novos Arquivos

```
src/
├── types/template.ts                    # +Page, MultiPageDesignData
├── contexts/multi-page-context.tsx      # MultiPageProvider
├── components/templates/
│   └── pages-sidebar.tsx                # PagesSidebar (sidebar alternativa)
├── hooks/use-pages.ts                   # TanStack Query hooks
├── lib/page-thumbnail-utils.ts          # Geração de thumbnails
└── app/api/templates/[id]/pages/
    ├── route.ts                         # GET, POST
    ├── [pageId]/
    │   ├── route.ts                     # GET, PATCH, DELETE
    │   └── duplicate/route.ts           # POST
```

### Arquivos Modificados

```
prisma/schema.prisma                     # +Page model
src/components/templates/
└── template-editor-shell.tsx            # +MultiPageProvider, +PagesBar
```

## 🎯 Exemplo Completo

```typescript
// 1. Wrapper no editor
<MultiPageProvider templateId={template.id}>
  <TemplateEditorProvider template={resource}>
    <TemplateEditorContent />
  </TemplateEditorProvider>
</MultiPageProvider>

// 2. Consumir no componente
function TemplateEditorContent() {
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const createPageMutation = useCreatePage()

  const handleAddPage = async () => {
    const newPage = await createPageMutation.mutateAsync({
      templateId,
      data: {
        name: `Página ${pages.length + 1}`,
        width: 1080,
        height: 1920,
        layers: [],
        order: pages.length
      }
    })
    setCurrentPageId(newPage.id)
  }

  return (
    <div>
      {/* Barra de páginas */}
      <PagesBar />

      {/* Canvas (renderiza página atual) */}
      <EditorCanvas key={currentPageId} />
    </div>
  )
}
```

## 📚 Referências

- [Polotno Pages](https://studio.polotno.com/) - Inspiração de UX
- [Konva.js Stage](https://konvajs.org/docs/stage/Stage.html)
- [TanStack Query](https://tanstack.com/query/latest)

## 🐛 Troubleshooting

**Problema:** Páginas não aparecem na PagesBar
**Solução:** Verificar se `MultiPageProvider` está renderizado antes de `TemplateEditorProvider`

**Problema:** Trocar página não atualiza canvas
**Solução:** Implementar sincronização entre `currentPageId` e `TemplateEditorProvider`

**Problema:** Thumbnails não aparecem
**Solução:** Garantir que `stage.toDataURL()` seja chamado após fontes carregarem

**Problema:** Erro "Cannot delete last page"
**Solução:** API valida mínimo de 1 página. Frontend deve desabilitar botão delete.
