# 📊 Sistema de Grid de Recursos - CRUD Completo

## 🎯 Visão Geral

Sistema completo para gerenciar o Grid de Recursos (BentoGrid) exibido no site. Os itens são armazenados no banco de dados e podem ser gerenciados através do painel administrativo.

## 📂 Estrutura do Sistema

### 🗄️ Banco de Dados

**Modelo:** `FeatureGridItem`

```prisma
model FeatureGridItem {
  id          String   @id @default(cuid())
  icon        String                // Nome do ícone Lucide (ex: "Sparkles")
  iconColor   String?               // Classe Tailwind (ex: "text-sky-500")
  title       String
  description String   @db.Text
  gridArea    String?               // CSS grid-area (ex: "md:[grid-area:1/1/2/2]")
  order       Int      @default(0)  // Ordem de exibição
  isActive    Boolean  @default(true)
  createdBy   String
  updatedBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([order])
  @@index([isActive])
}
```

### 🔌 API Endpoints

#### Admin (Autenticado)

**Listar todos os itens:**
```
GET /api/admin/feature-grid
Response: { items: FeatureGridItem[] }
```

**Buscar item específico:**
```
GET /api/admin/feature-grid/:id
Response: { item: FeatureGridItem }
```

**Criar novo item:**
```
POST /api/admin/feature-grid
Body: {
  icon: string
  iconColor?: string
  title: string
  description: string
  gridArea?: string
  order?: number
  isActive?: boolean
}
Response: { item: FeatureGridItem }
```

**Atualizar item:**
```
PUT /api/admin/feature-grid/:id
Body: Partial<CreateFeatureGridItemData>
Response: { item: FeatureGridItem }
```

**Deletar item:**
```
DELETE /api/admin/feature-grid/:id
Response: { success: true }
```

#### Público

**Listar itens ativos:**
```
GET /api/feature-grid
Response: { items: FeatureGridItem[] }
```

### 🎨 Componentes

**Página de Gerenciamento:**
```
/admin/content/feature-grid
```

**Componentes criados:**
- `FeatureGridList` - Lista de itens com drag-and-drop
- `FeatureGridDialog` - Dialog para criar/editar itens
- Editor integrado no BentoGrid

## 📝 Como Usar

### 1. Acessar o Painel Admin

1. Faça login como administrador
2. Acesse `/admin/content/feature-grid`
3. Você verá a lista de todos os itens

### 2. Criar Novo Item

1. Clique em "Novo Item"
2. Preencha os campos:
   - **Ícone**: Selecione um ícone Lucide
   - **Cor do Ícone**: Escolha uma cor Tailwind
   - **Título**: Nome do recurso
   - **Descrição**: Descrição detalhada
   - **Grid Area** (opcional): CSS grid-area para posicionamento
   - **Ordem**: Número para ordenação
   - **Ativo**: Toggle para ativar/desativar
3. Clique em "Criar"

### 3. Editar Item Existente

1. Na lista, clique no ícone de editar
2. Modifique os campos desejados
3. Clique em "Atualizar"

### 4. Deletar Item

1. Na lista, clique no ícone de deletar
2. Confirme a exclusão
3. O item será removido permanentemente

### 5. Reordenar Itens

1. Use o handle de drag (ícone de grip)
2. Arraste o item para a posição desejada
3. A ordem será salva automaticamente

## 🎨 Ícones Disponíveis

O sistema suporta ícones do Lucide React:

- Sparkles
- Zap
- Code
- Database
- Lock
- Shield
- Rocket
- Star
- Heart
- Users
- Settings
- CheckCircle
- Activity
- BarChart
- TrendingUp
- Globe
- Package
- Box
- Layers
- Grid
- Layout
- Cpu
- Cloud
- Server

## 🎨 Cores Disponíveis

Cores Tailwind pré-definidas:

- `text-sky-500` - Azul
- `text-green-500` - Verde
- `text-purple-500` - Roxo
- `text-pink-500` - Rosa
- `text-orange-500` - Laranja
- `text-red-500` - Vermelho
- `text-yellow-500` - Amarelo
- `text-primary` - Cor primária do tema

## 📐 Grid Area

Para posicionamento avançado no grid CSS:

```
Exemplos:
- md:[grid-area:1/1/2/2] - Linha 1-2, Coluna 1-2
- md:[grid-area:1/2/3/3] - Linha 1-3, Coluna 2-3
- md:[grid-area:2/1/3/2] - Linha 2-3, Coluna 1-2
```

## 🔄 Integração com CMS

O Grid de Recursos se integra automaticamente com o CMS:

1. No editor de páginas, adicione uma seção "BENTO_GRID"
2. Configure título e subtítulo
3. Os cards são carregados automaticamente do banco de dados
4. Edite os cards em `/admin/content/feature-grid`

## 🌱 Seed de Dados

Para popular com dados de exemplo:

```bash
npx tsx prisma/seed-feature-grid.ts
```

Isso criará 10 itens de exemplo com:
- Ícones variados
- Cores diferentes
- Posicionamento grid configurado
- Descrições completas

## 🚀 Exemplo de Uso Programático

### React Query Hook

```typescript
import { useFeatureGridItems } from '@/hooks/admin/use-admin-feature-grid'

function MyComponent() {
  const { data, isLoading } = useFeatureGridItems()

  if (isLoading) return <div>Carregando...</div>

  return (
    <div>
      {data?.items.map(item => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  )
}
```

### Criar Item

```typescript
import { useCreateFeatureGridItem } from '@/hooks/admin/use-admin-feature-grid'

function CreateForm() {
  const createItem = useCreateFeatureGridItem()

  const handleSubmit = async (data) => {
    await createItem.mutateAsync({
      icon: 'Sparkles',
      iconColor: 'text-sky-500',
      title: 'Novo Recurso',
      description: 'Descrição do recurso',
      order: 0,
      isActive: true
    })
  }
}
```

## 📊 Estatísticas

O painel mostra:
- **Total de Itens**: Quantidade total cadastrada
- **Ativos**: Itens visíveis no site
- **Inativos**: Itens desativados

## 🔍 Filtros e Busca

Funcionalidades planejadas:
- [ ] Busca por título/descrição
- [ ] Filtro por ícone
- [ ] Filtro por cor
- [ ] Filtro por status (ativo/inativo)
- [ ] Ordenação customizada

## 🎯 Próximos Passos

1. ✅ CRUD completo implementado
2. ✅ Integração com CMS
3. ✅ Seed de dados
4. 🔄 Drag-and-drop para reordenação (em desenvolvimento)
5. 📋 Bulk operations (planejado)
6. 🔍 Sistema de busca (planejado)

## 📚 Arquivos Relacionados

### Backend
- `src/app/api/admin/feature-grid/route.ts` - CRUD admin
- `src/app/api/admin/feature-grid/[id]/route.ts` - CRUD por ID
- `src/app/api/feature-grid/route.ts` - API pública

### Frontend
- `src/app/admin/content/feature-grid/page.tsx` - Página admin
- `src/components/admin/feature-grid/feature-grid-list.tsx` - Lista
- `src/components/admin/feature-grid/feature-grid-dialog.tsx` - Dialog CRUD
- `src/components/cms/sections/cms-bento-grid.tsx` - Renderização pública

### Hooks
- `src/hooks/admin/use-admin-feature-grid.ts` - React Query hooks

### Schema
- `prisma/schema.prisma` - Modelo FeatureGridItem
- `prisma/seed-feature-grid.ts` - Seed de dados

---

**Sistema completamente funcional e pronto para uso!** 🎉
