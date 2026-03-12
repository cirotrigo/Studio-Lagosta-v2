# Prompt para Nova Conversa — Fase 13: Sistema de Tags para Páginas

## Contexto do Projeto

Este projeto implementa um sistema de automação de artes para Instagram usando Konva.js como motor de renderização. O desktop-app é um aplicativo Electron que permite criar e editar templates de artes.

### Estado Atual
- Fases 1-12 concluídas
- Editor Konva local funcionando com text, image, shapes, logos, gradientes
- Sync bidirecional entre desktop-app e web funcionando
- Suporte a múltiplas páginas por template implementado

### Problema Identificado
Atualmente, **todas as páginas de todos os templates** são listadas como opções no modo "Arte Rápida". O usuário precisa de uma forma de **categorizar** quais páginas são templates reutilizáveis e quais são apenas artes/rascunhos.

---

## Objetivo da Fase 13

Implementar sistema de **tags por projeto** que permite categorizar páginas de templates. Páginas com a tag "Template" aparecem no modo Arte Rápida; outras tags permitem organização livre.

---

## Especificação Funcional

### Conceito
- Cada **projeto** possui uma lista de tags cadastradas
- Cada **página** de um template pode ter múltiplas tags associadas
- Tags são **case-insensitive** (Template = template = TEMPLATE)
- Todo projeto já vem com a tag **"Template"** pré-criada
- Cores das tags são atribuídas automaticamente (paleta predefinida)

### Fluxo de Uso

```
Configurações do Projeto
    → Gerenciar tags (criar, renomear, excluir)
    → Tag "Template" já existe por padrão

Editor de Templates
    → Cada página tem seletor de tags (multi-select)
    → Filtro por tags na listagem de páginas

Modo Arte Rápida
    → Dropdown para selecionar tag de filtro
    → Default: tag "Template"
    → Lista apenas páginas que possuem a tag selecionada
```

---

## Escopo Técnico

### A. Modelo de Dados (Prisma + Local)

#### Web (Prisma)
```prisma
model ProjectTag {
  id        String   @id @default(cuid())
  name      String
  color     String   // cor hex automática
  projectId Int
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([projectId, name])
  @@index([projectId])
}

model Page {
  // ... campos existentes
  tags      String[] @default([])  // nomes das tags (case-insensitive)
}
```

#### Desktop-app (tipos locais)
```typescript
interface ProjectTag {
  id: string
  name: string
  color: string
  projectId: number
}

interface KonvaPage {
  // ... campos existentes
  tags?: string[]  // nomes das tags
}
```

### B. API Web

#### Endpoints de Tags
```
GET    /api/projects/[projectId]/tags     → lista tags do projeto
POST   /api/projects/[projectId]/tags     → cria nova tag
PUT    /api/projects/[projectId]/tags/[tagId]  → atualiza tag
DELETE /api/projects/[projectId]/tags/[tagId]  → remove tag
```

#### Atualização de Page
O endpoint existente de update de Page deve aceitar `tags: string[]`.

### C. Hooks React (TanStack Query)

```typescript
// hooks/use-project-tags.ts
useProjectTags(projectId: number)          // lista tags
useCreateProjectTag()                       // cria tag
useUpdateProjectTag()                       // atualiza tag
useDeleteProjectTag()                       // remove tag
```

### D. UI Web

#### Configurações do Projeto
- Nova seção "Tags" nas configurações do projeto
- Lista de tags com chips coloridos
- Botão "Adicionar tag"
- Ações: renomear, excluir (exceto "Template" que não pode ser removida)

#### Editor de Templates (se aplicável)
- Em cada página, seletor multi-select de tags
- Exibir tags como chips coloridos

### E. Desktop-app

#### Sincronização de Tags
Atualizar `template-normalizer.ts` para:
1. **Sync de ProjectTags**: baixar tags do projeto ao sincronizar
2. **Sync de Page.tags**: incluir tags no upload/download de páginas
3. **Normalização**: garantir case-insensitive na comparação

#### UI do Editor Local
- `PagesBar.tsx`: exibir tags como chips em cada página
- Novo componente `TagSelector`: multi-select para escolher tags
- `PropertiesPanel.tsx` ou modal: permitir editar tags da página atual

#### Modo Arte Rápida
Atualizar o fluxo de geração para:
1. Mostrar dropdown de seleção de tag (default: "Template")
2. Filtrar páginas pela tag selecionada
3. Manter seleção em localStorage ou state

### F. Criação Automática de Tag Padrão

Ao criar um novo projeto (web ou local):
1. Criar automaticamente a tag "Template" com cor padrão
2. Esta tag não pode ser excluída (validação no backend)

---

## Arquivos a Modificar/Criar

### Web
- `prisma/schema.prisma` - adicionar ProjectTag e Page.tags
- `src/app/api/projects/[projectId]/tags/route.ts` - CRUD de tags
- `src/hooks/use-project-tags.ts` - hooks TanStack Query
- `src/components/projects/project-settings/` - UI de gerenciamento de tags
- Atualizar criação de projeto para incluir tag padrão

### Desktop-app
- `desktop-app/src/types/template.ts` - adicionar ProjectTag e Page.tags
- `desktop-app/src/lib/sync/template-normalizer.ts` - sync de tags
- `desktop-app/electron/services/sync/template-normalizer.ts` - sync electron
- `desktop-app/src/components/editor/PagesBar.tsx` - exibir tags
- `desktop-app/src/components/editor/TagSelector.tsx` - novo componente
- `desktop-app/src/stores/project.store.ts` - armazenar tags do projeto
- Atualizar fluxo de Arte Rápida para filtrar por tag

---

## Paleta de Cores Automáticas

Usar paleta predefinida para atribuir cores automaticamente:
```typescript
const TAG_COLORS = [
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
]

function getNextTagColor(existingTags: ProjectTag[]): string {
  const usedColors = existingTags.map(t => t.color)
  const available = TAG_COLORS.find(c => !usedColors.includes(c))
  return available ?? TAG_COLORS[existingTags.length % TAG_COLORS.length]
}
```

---

## Critérios de Aceite

### Backend/API
- [ ] Migration cria ProjectTag e adiciona Page.tags
- [ ] CRUD de tags funcionando via API
- [ ] Tag "Template" criada automaticamente em novos projetos
- [ ] Tag "Template" não pode ser excluída (erro 400)
- [ ] Page.tags persiste corretamente

### Web UI
- [ ] Seção de tags nas configurações do projeto
- [ ] Criar, renomear, excluir tags funciona
- [ ] Cores atribuídas automaticamente

### Desktop-app
- [ ] Tags do projeto sincronizam da web
- [ ] Tags das páginas sincronizam bidirecionalmente
- [ ] PagesBar exibe tags como chips coloridos
- [ ] Seletor de tags permite adicionar/remover tags da página
- [ ] Arte Rápida filtra por tag selecionada
- [ ] Default da Arte Rápida é tag "Template"

### Validação
- [ ] Typecheck passa (web + desktop-app)
- [ ] Tags são case-insensitive em toda a aplicação

---

## Comandos de Validação

```bash
# Web
npm run typecheck
npm run db:push  # aplicar schema

# Desktop-app
npm --prefix desktop-app run typecheck
npm --prefix desktop-app run typecheck:electron
```

---

## Arquivos de Documentação

- `.qoder/specs/andamento-implementacao-konva-only.md` - atualizar com progresso
- `.qoder/specs/checklist-implementacao-konva-only.md` - marcar itens completados

---

## Notas de Implementação

### Case-Insensitive
Ao comparar tags, sempre usar `.toLowerCase()`:
```typescript
const hasTag = page.tags?.some(t => t.toLowerCase() === selectedTag.toLowerCase())
```

### Sincronização
A sincronização de tags deve:
1. Baixar tags do projeto antes de sincronizar templates
2. Ao normalizar Page, manter tags como array de strings
3. Não criar tags locais - apenas usar as que existem no projeto

### Arte Rápida - Filtro
```typescript
const filteredPages = allPages.filter(page =>
  page.tags?.some(t => t.toLowerCase() === selectedTag.toLowerCase())
)
```

### Exclusão de Tag
Ao excluir uma tag do projeto:
1. Remover a tag de todas as páginas que a possuem
2. Ou: apenas impedir exclusão se tag estiver em uso (decisão de UX)

---

## Commit Convention

```
feat(konva-fase-13): implementa sistema de tags para paginas
```

---

## Prioridade

Esta fase é **importante** para organização e usabilidade do sistema. Permite ao usuário diferenciar templates reutilizáveis de artes/rascunhos e organizar seu conteúdo por categorias.
