# Sistema Global de Prompts - Studio Lagosta

## 📝 Visão Geral

O Sistema Global de Prompts permite aos usuários criar, gerenciar e reutilizar prompts de texto para geração de imagens IA em todos os projetos. Os prompts são vinculados ao usuário (não ao projeto), tornando-os globalmente acessíveis em qualquer template.

## 🎯 Funcionalidades

### CRUD Completo
- ✅ **CREATE**: Criar novos prompts com título, conteúdo, categoria e tags
- ✅ **READ**: Listar, buscar e visualizar prompts
- ✅ **UPDATE**: Editar informações dos prompts
- ✅ **DELETE**: Deletar prompts com confirmação

### Recursos Principais
- **Prompts Globais**: Acessíveis em todos os projetos do usuário
- **Busca Avançada**: Filtro por título, conteúdo, categoria e tags
- **Categorias Predefinidas**: Logo, Paisagem, Personagem, Produto, Abstrato, Realista, Ilustração, Outro
- **Tags Customizadas**: Sistema de tags flexível para organização
- **Visualização em Lightbox**: Modal expansível para leitura confortável
- **Copiar para Clipboard**: Copiar prompts com feedback visual
- **Integração com Geração de IA**: Usar prompts salvos diretamente no formulário de geração

## 🏗️ Arquitetura

### Modelo de Dados

#### Schema Prisma (`prisma/schema.prisma`)

```prisma
model Prompt {
  id        String   @id @default(cuid())
  userId    String
  title     String
  content   String   @db.Text
  category  String?
  tags      String[] @default([])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([category])
  @@index([createdAt])
}
```

**Diferença do PromptLibrary:**
- `Prompt`: Vinculado ao `userId` (global)
- `PromptLibrary`: Vinculado ao `projectId` (específico do projeto)

### Types (`src/types/prompt.ts`)

```typescript
export interface Prompt {
  id: string
  userId: string
  title: string
  content: string
  category: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePromptData {
  title: string
  content: string
  category?: string
  tags?: string[]
}

export interface UpdatePromptData {
  title?: string
  content?: string
  category?: string | null
  tags?: string[]
}

export interface PromptFilters {
  search?: string
  category?: string
}

export const PROMPT_CATEGORIES = [
  'Logo',
  'Paisagem',
  'Personagem',
  'Produto',
  'Abstrato',
  'Realista',
  'Ilustração',
  'Outro',
] as const
```

## 📡 API Routes

### GET `/api/prompts`
Lista todos os prompts do usuário com filtros opcionais.

**Query Parameters:**
- `search` (opcional): Busca por título, conteúdo ou tags
- `category` (opcional): Filtra por categoria

**Response:**
```json
[
  {
    "id": "clxxx",
    "userId": "user_xxx",
    "title": "Logo Minimalista",
    "content": "Create a minimalist logo with geometric shapes...",
    "category": "Logo",
    "tags": ["minimalist", "geometric", "modern"],
    "createdAt": "2025-10-09T12:00:00Z",
    "updatedAt": "2025-10-09T12:00:00Z"
  }
]
```

### POST `/api/prompts`
Cria um novo prompt.

**Request Body:**
```json
{
  "title": "Logo Minimalista",
  "content": "Create a minimalist logo...",
  "category": "Logo",
  "tags": ["minimalist", "modern"]
}
```

**Validação (Zod):**
- `title`: String obrigatória, mínimo 1 caractere
- `content`: String obrigatória, mínimo 1 caractere
- `category`: String opcional
- `tags`: Array de strings opcional

### GET `/api/prompts/[promptId]`
Busca um prompt específico.

**Response:**
```json
{
  "id": "clxxx",
  "userId": "user_xxx",
  "title": "Logo Minimalista",
  "content": "Create a minimalist logo...",
  "category": "Logo",
  "tags": ["minimalist"],
  "createdAt": "2025-10-09T12:00:00Z",
  "updatedAt": "2025-10-09T12:00:00Z"
}
```

### PATCH `/api/prompts/[promptId]`
Atualiza um prompt existente.

**Request Body:**
```json
{
  "title": "Logo Minimalista Atualizado",
  "content": "Updated content...",
  "category": "Logo",
  "tags": ["minimalist", "modern", "clean"]
}
```

### DELETE `/api/prompts/[promptId]`
Deleta um prompt.

**Response:**
```json
{
  "success": true,
  "message": "Prompt deletado com sucesso"
}
```

## 🔗 Hooks Customizados (`src/hooks/use-prompts.ts`)

### usePrompts(filters?)
Lista prompts com filtros opcionais.

```typescript
const { data: prompts, isLoading, error } = usePrompts({
  search: 'logo',
  category: 'Logo'
})
```

### usePrompt(promptId)
Busca um prompt específico.

```typescript
const { data: prompt, isLoading } = usePrompt(promptId)
```

### useCreatePrompt()
Hook de mutação para criar prompt.

```typescript
const createMutation = useCreatePrompt()

createMutation.mutate({
  title: 'Novo Prompt',
  content: 'Conteúdo do prompt...',
  category: 'Logo',
  tags: ['tag1', 'tag2']
})
```

### useUpdatePrompt()
Hook de mutação para atualizar prompt.

```typescript
const updateMutation = useUpdatePrompt()

updateMutation.mutate({
  promptId: 'clxxx',
  data: {
    title: 'Título atualizado'
  }
})
```

### useDeletePrompt()
Hook de mutação para deletar prompt.

```typescript
const deleteMutation = useDeletePrompt()

deleteMutation.mutate(promptId)
```

## 🎨 Componentes de UI

### 1. PromptDialog (`src/components/prompts/prompt-dialog.tsx`)
Modal para criar/editar prompts.

**Props:**
```typescript
interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt?: Prompt
  mode: 'create' | 'edit'
}
```

**Funcionalidades:**
- Formulário completo com validação
- Seleção de categoria (dropdown)
- Sistema de tags (adicionar/remover)
- Estados de loading
- Feedback de sucesso/erro

### 2. PromptCard (`src/components/prompts/prompt-card.tsx`)
Card individual de prompt na lista.

**Props:**
```typescript
interface PromptCardProps {
  prompt: Prompt
  onEdit: (prompt: Prompt) => void
}
```

**Funcionalidades:**
- Preview do conteúdo (3 linhas)
- Badge de categoria
- Tags (até 3 visíveis + contador)
- Menu dropdown com ações (Editar, Copiar, Deletar)
- Feedback visual ao copiar

### 3. PromptFilters (`src/components/prompts/prompt-filters.tsx`)
Barra de filtros e busca.

**Props:**
```typescript
interface PromptFiltersProps {
  filters: PromptFilters
  onFiltersChange: (filters: PromptFilters) => void
}
```

**Funcionalidades:**
- Campo de busca (título, conteúdo, tags)
- Filtro por categoria
- Botão limpar filtros

### 4. PromptsLibrary (`src/components/templates/sidebar/ai-images-panel.tsx`)
Biblioteca de prompts na aba "IA" do editor.

**Funcionalidades:**
- Lista de prompts globais
- Busca inline
- Visualização em lightbox
- Copiar prompt
- Link para página de gerenciamento

## 📄 Páginas

### `/prompts` (`src/app/(protected)/prompts/page.tsx`)
Página principal de gerenciamento de prompts.

**Layout:**
```
┌─────────────────────────────────────────┐
│ Breadcrumbs                             │
│ Início > Prompts                        │
├─────────────────────────────────────────┤
│ [Filtros de busca e categoria]     [+]  │
├─────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐        │
│ │ Prompt 1    │ │ Prompt 2    │        │
│ │ [Categoria] │ │ [Categoria] │        │
│ │ Preview...  │ │ Preview...  │        │
│ │ #tag1 #tag2 │ │ #tag1       │        │
│ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────┘
```

**Estados:**
- Loading: Skeleton cards
- Vazio: Mensagem + botão "Criar Primeiro Prompt"
- Com dados: Grid responsivo (2-3 colunas)
- Busca vazia: Mensagem "Nenhum prompt encontrado"

## 🔄 Integração com Geração de Imagens

### No Formulário de Geração (`GenerateImageForm`)

**Dropdown de Prompts Salvos:**
```typescript
<Select value={selectedPromptId || 'none'} onValueChange={handlePromptSelect}>
  <SelectTrigger className="h-7 w-[140px] text-xs">
    <SelectValue placeholder="Usar salvo" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">Nenhum</SelectItem>
    {prompts.map((p) => (
      <SelectItem key={p.id} value={p.id}>
        {p.title}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Botão "Salvar como Prompt":**
```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={handleSaveAsPrompt}
  disabled={!prompt.trim()}
  className="h-7 gap-1 text-xs"
  title="Salvar como prompt"
>
  <BookmarkPlus className="h-3.5 w-3.5" />
</Button>
```

**Fluxo:**
1. Usuário seleciona prompt salvo no dropdown
2. Campo de prompt é preenchido automaticamente
3. OU usuário digita prompt e clica em "Salvar como Prompt"
4. Abre página `/prompts` em nova aba

### Na Aba "Prompts" do Editor

**Visualização em Lightbox:**
- Modal grande (max-w-4xl)
- Scroll interno para prompts longos
- Botão "Copiar" flutuante
- Preserva quebras de linha
- Tags na parte inferior

**Layout do Card:**
```
┌─────────────────────────────────┐
│ Título do Prompt    [📋] [🔍]  │
│ Categoria                        │
│ Preview do conteúdo (3 linhas)  │
│ #tag1 #tag2 #tag3 +2            │
└─────────────────────────────────┘
```

## 🔒 Segurança

### Validações Implementadas

1. **Autenticação**: Todas as rotas verificam `userId` via Clerk
2. **Ownership**: Apenas o dono pode acessar/modificar seus prompts
3. **Input Validation**: Zod schemas para todos os inputs
4. **SQL Injection**: Prisma ORM protege automaticamente
5. **XSS Protection**: React escapa conteúdo automaticamente

### Row Level Security (Conceitual)

```typescript
// Todas as queries filtram por userId
const prompts = await db.prompt.findMany({
  where: { userId }, // Garante isolamento
  orderBy: { createdAt: 'desc' },
})
```

## 📊 Performance

### Otimizações

1. **Caching (TanStack Query)**
   - `staleTime: 30_000` (30 segundos)
   - `gcTime: 5 * 60_000` (5 minutos)
   - Invalidação seletiva após mutações

2. **Indexes no Banco**
   - `@@index([userId])` - Busca por usuário
   - `@@index([category])` - Filtro por categoria
   - `@@index([createdAt])` - Ordenação

3. **Busca Otimizada**
   - Filtro no frontend (useMemo)
   - Debounce implícito do React

4. **Lazy Loading**
   - Componentes carregam sob demanda
   - Lightbox renderiza apenas quando aberto

## 🎯 Casos de Uso

### 1. Criar Prompt Reutilizável

**Cenário**: Designer cria prompt para logos minimalistas

```typescript
// Usuário preenche formulário
{
  title: "Logo Minimalista",
  content: "Create a minimalist logo with geometric shapes, clean lines, and modern typography. Focus on simplicity and elegance.",
  category: "Logo",
  tags: ["minimalist", "geometric", "modern"]
}

// Sistema salva e torna disponível globalmente
```

### 2. Reutilizar Prompt em Projeto

**Cenário**: Designer usa prompt salvo em novo template

```typescript
// No editor de template
1. Abre aba "IA" > "Gerar"
2. Seleciona "Logo Minimalista" no dropdown
3. Campo de prompt é preenchido automaticamente
4. Ajusta se necessário e gera imagem
```

### 3. Organizar com Tags

**Cenário**: Designer organiza biblioteca de prompts

```typescript
// Prompts com tags
- "Logo Startup" → tags: ["logo", "startup", "tech"]
- "Logo Corporativo" → tags: ["logo", "corporate", "professional"]
- "Logo Criativo" → tags: ["logo", "creative", "artistic"]

// Busca por "logo" retorna todos
// Busca por "corporate" retorna apenas corporativo
```

### 4. Visualizar e Copiar

**Cenário**: Designer precisa do prompt completo

```typescript
// Na aba Prompts do editor
1. Clica no card do prompt
2. Lightbox abre com conteúdo completo
3. Clica em "Copiar"
4. Prompt copiado para clipboard
5. Cola em outro lugar (ex: ChatGPT)
```

## 🐛 Troubleshooting

### Prompt não aparece na lista

**Causa**: Cache desatualizado
**Solução**: TanStack Query invalida automaticamente após criar/editar

### Erro ao criar prompt

**Causa**: Campos obrigatórios vazios
**Solução**: Validação Zod retorna erro específico

### Lightbox não abre

**Causa**: Estado do modal não atualizado
**Solução**: Usar `setSelectedPrompt(prompt)` no click

### Texto cortado no card

**Causa**: `overflow-hidden` ou `truncate`
**Solução**: Usar `break-words` + `line-clamp-3`

## 📝 Convenções de Código

### Nomenclatura

- **Models**: PascalCase (`Prompt`)
- **APIs**: kebab-case (`/api/prompts`)
- **Components**: PascalCase (`PromptDialog`)
- **Hooks**: camelCase com prefixo `use` (`usePrompts`)
- **Types**: PascalCase (`PromptFilters`)

### Padrões

- **Server Components**: Usar `async/await` com Prisma direto
- **Client Components**: Usar TanStack Query hooks
- **Forms**: React Hook Form + Zod
- **Mutations**: Invalidar queries relacionadas

## 🚀 Melhorias Futuras

### Planejadas
- [ ] Favoritar prompts
- [ ] Duplicar prompts
- [ ] Compartilhar prompts (público/privado)
- [ ] Histórico de versões
- [ ] Templates de prompts predefinidos
- [ ] Importar/exportar prompts
- [ ] Estatísticas de uso
- [ ] AI-powered prompt suggestions

### Consideradas
- [ ] Prompts colaborativos (workspace)
- [ ] Marketplace de prompts
- [ ] Variáveis dinâmicas em prompts
- [ ] Composição de prompts (combinar múltiplos)
- [ ] Tradução automática de prompts
- [ ] Análise de qualidade de prompts

## 📚 Referências

### Documentação Interna
- [Projects & Templates](./projects-templates.md)
- [AI Image Generation](./ai-image-generation.md)
- [API Reference](./api.md)
- [Authentication](./authentication.md)
- [Database](./database.md)

### Tecnologias Utilizadas
- **Next.js 15**: Framework React
- **Prisma**: ORM para PostgreSQL
- **TanStack Query**: Data fetching e cache
- **Zod**: Validação de schemas
- **Clerk**: Autenticação
- **Radix UI**: Componentes de UI
- **Tailwind CSS**: Estilização

---

**Última atualização**: 2025-10-09
**Versão**: 1.0.0
**Autor**: Studio Lagosta Team
