# Sistema de Projetos e Templates

## 📝 Visão Geral

O sistema de Projetos e Templates é o núcleo da aplicação Studio Lagosta, permitindo que usuários organizem seus criativos, gerenciem assets, configurem fontes customizadas e criem designs reutilizáveis usando o editor Konva.js.

## 🏗️ Arquitetura

### Hierarquia
```
Projeto
├── Templates (designs reutilizáveis)
│   ├── designData (JSON com layers Konva)
│   ├── dynamicFields (campos variáveis)
│   └── thumbnailUrl (preview)
├── Assets
│   ├── Imagens (Vercel Blob)
│   ├── Logos (Vercel Blob)
│   └── Fontes Customizadas (Vercel Blob)
├── Criativos (exports finais)
└── Configurações
    ├── Google Drive Integration
    └── Fontes do Projeto
```

## 🗄️ Modelos de Banco de Dados

### Project
```prisma
model Project {
  id                     Int            @id @default(autoincrement())
  name                   String
  description            String?
  userId                 String
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
  googleDriveFolderId    String?
  googleDriveFolderName  String?

  Template               Template[]
  CustomFont             CustomFont[]
  Generation             Generation[]
  Asset                  Asset[]
}
```

### Template
```prisma
model Template {
  id           Int            @id @default(autoincrement())
  name         String
  type         String         # STORY, FEED, SQUARE
  dimensions   String         # 1080x1920, 1080x1350, 1080x1080
  designData   Json           # DesignData do Konva
  dynamicFields Json?         # DynamicField[]
  thumbnailUrl String?
  projectId    Int
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  Project      Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  Generation   Generation[]
}
```

### CustomFont
```prisma
model CustomFont {
  id         Int      @id @default(autoincrement())
  name       String
  fontFamily String
  fileUrl    String   # Vercel Blob URL
  projectId  Int
  uploadedBy String
  createdAt  DateTime @default(now())

  Project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

### Generation
```prisma
model Generation {
  id          Int       @id @default(autoincrement())
  templateId  Int
  projectId   Int
  status      String    # PENDING, COMPLETED, FAILED
  resultUrl   String?
  fieldValues Json      # Valores dos campos dinâmicos
  templateName String
  projectName  String
  createdBy   String
  createdAt   DateTime  @default(now())
  completedAt DateTime?

  Template    Template  @relation(fields: [templateId], references: [id])
  Project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

## 🎯 Funcionalidades

### 1. Gerenciamento de Projetos

#### Criação de Projeto
```typescript
// POST /api/projects
const newProject = await db.project.create({
  data: {
    name: "Campanha de Verão 2025",
    description: "Criativos para redes sociais",
    userId: clerkUserId,
  },
})
```

#### Listagem de Projetos
```typescript
// GET /api/projects
const projects = await db.project.findMany({
  where: { userId: clerkUserId },
  include: {
    _count: {
      select: {
        Template: true,
        Generation: true,
      },
    },
  },
  orderBy: { updatedAt: 'desc' },
})
```

### 2. Gerenciamento de Templates

#### Tipos de Templates
- **STORY**: 1080x1920 (9:16) - Instagram/Facebook Stories
- **FEED**: 1080x1350 (4:5) - Instagram Feed Posts
- **SQUARE**: 1080x1080 (1:1) - Posts Quadrados

#### Criação de Template
```typescript
// POST /api/projects/[projectId]/templates
const template = await db.template.create({
  data: {
    name: "Promo de Verão",
    type: "STORY",
    dimensions: "1080x1920",
    projectId: projectId,
    designData: {
      canvas: {
        width: 1080,
        height: 1920,
        backgroundColor: "#ffffff",
      },
      layers: [],
    },
  },
})
```

#### Atualização de Template (com Thumbnail)
```typescript
// PATCH /api/templates/[id]
const updated = await db.template.update({
  where: { id: templateId },
  data: {
    name: "Novo Nome",
    designData: updatedDesignData,
    thumbnailUrl: generatedThumbnailUrl, // Gerado do canvas
  },
})
```

### 3. Sistema de Assets

#### Assets Suportados
- **Imagens**: PNG, JPG, JPEG, WEBP (max 10MB)
- **Logos**: PNG, SVG (max 5MB)
- **Fontes**: TTF, OTF, WOFF, WOFF2 (max 5MB)

#### Upload de Asset
```typescript
// POST /api/projects/[projectId]/assets/upload
const blob = await put(file.name, file, {
  access: 'public',
  contentType: file.type,
})

const asset = await db.asset.create({
  data: {
    name: file.name,
    type: assetType, // IMAGE, LOGO
    fileUrl: blob.url,
    fileSize: file.size,
    mimeType: file.type,
    projectId: projectId,
    uploadedBy: userId,
  },
})
```

### 4. Sistema de Fontes Customizadas

#### Upload de Fonte
```typescript
// POST /api/projects/[projectId]/fonts
const fontBlob = await put(fileName, buffer, {
  access: 'public',
  contentType: 'font/ttf',
})

const customFont = await db.customFont.create({
  data: {
    name: fontName,
    fontFamily: fontFamily,
    fileUrl: fontBlob.url,
    projectId: projectId,
    uploadedBy: userId,
  },
})
```

#### Carregamento de Fontes no Editor
Ver [Sistema de Fontes Customizadas](./custom-fonts.md) para detalhes completos.

### 5. Sistema de Criativos (Generations)

#### Exportação de Template
```typescript
// POST /api/templates/[id]/export
const generation = await db.generation.create({
  data: {
    templateId: template.id,
    projectId: template.projectId,
    status: 'COMPLETED',
    resultUrl: exportedBlobUrl,
    fieldValues: {},
    templateName: template.name,
    projectName: project.name,
    createdBy: userId,
    completedAt: new Date(),
  },
})
```

#### Sistema de Créditos
- **creative_download**: 1 crédito por export
- Validação antes do export
- Dedução após upload bem-sucedido

## 📁 Estrutura de Arquivos

### Frontend
```
src/
├── app/(protected)/projects/
│   ├── page.tsx                    # Lista de projetos
│   └── [id]/
│       └── page.tsx                # Detalhes do projeto + tabs
├── components/
│   ├── projects/
│   │   ├── project-assets-panel.tsx         # Gerenciamento de assets
│   │   ├── creatives-gallery.tsx           # Galeria de criativos
│   │   └── google-drive-folder-selector.tsx # Integração Drive
│   └── templates/
│       ├── template-editor-shell.tsx        # Shell do editor
│       ├── editor-canvas.tsx                # Canvas Konva
│       ├── konva-editor-stage.tsx           # Stage principal
│       └── sidebar/
│           ├── editor-sidebar.tsx           # Sidebar templates
│           └── fonts-panel.tsx              # Painel de fontes
└── hooks/
    ├── use-project.ts              # Hook para dados do projeto
    └── use-template.ts             # Hook para dados do template
```

### Backend
```
src/app/api/
├── projects/
│   ├── route.ts                    # CRUD de projetos
│   └── [id]/
│       ├── route.ts                # Detalhes do projeto
│       ├── templates/
│       │   └── route.ts            # Templates do projeto
│       ├── assets/
│       │   ├── route.ts            # Lista de assets
│       │   └── upload/
│       │       └── route.ts        # Upload de assets
│       └── fonts/
│           ├── route.ts            # Lista/upload de fontes
│           └── [fontId]/
│               └── route.ts        # Deletar fonte
└── templates/
    ├── [id]/
    │   ├── route.ts                # CRUD de template
    │   └── export/
    │       └── route.ts            # Export com cobrança de créditos
    └── [id]/
        └── generations/
            └── route.ts            # Lista de generations
```

## 🎨 Componentes de UI

### ProjectAssetsPanel
Gerenciamento completo de assets do projeto.

**Funcionalidades:**
- Upload múltiplo de arquivos
- Preview de imagens e logos
- Organização por tipo (Images, Logos)
- Drag & drop para upload
- Exclusão de assets
- Exibição de metadados (tamanho, data)

**Uso:**
```tsx
import { ProjectAssetsPanel } from '@/components/projects/project-assets-panel'

<ProjectAssetsPanel projectId={projectId} />
```

### CreativesGallery
Galeria de todos os criativos exportados.

**Funcionalidades:**
- Grid responsivo de criativos
- Preview em modal
- Download individual
- Ordenação por data
- Filtros por template

**Uso:**
```tsx
import { CreativesGallery } from '@/components/projects/creatives-gallery'

<CreativesGallery projectId={projectId} />
```

### GoogleDriveFolderSelector
Integração com Google Drive para sincronização de exports.

**Funcionalidades:**
- Seleção de pasta do Drive
- Sincronização automática
- Status de conexão
- Remoção de integração

**Uso:**
```tsx
import { GoogleDriveFolderSelector } from '@/components/projects/google-drive-folder-selector'

<GoogleDriveFolderSelector
  projectId={projectId}
  folderId={project.googleDriveFolderId}
  folderName={project.googleDriveFolderName}
/>
```

## 🔄 Fluxos de Trabalho

### Fluxo de Criação de Criativo

1. **Criar Projeto**
   ```
   Dashboard → Novo Projeto → Preencher dados → Salvar
   ```

2. **Upload de Assets**
   ```
   Projeto → Tab Assets → Fazer upload de imagens/logos/fontes
   ```

3. **Criar Template**
   ```
   Projeto → Tab Templates → Novo Template → Escolher tipo/dimensões
   ```

4. **Editar no Konva**
   ```
   Template → Editor → Adicionar layers → Aplicar estilos → Salvar
   ```

5. **Exportar Criativo**
   ```
   Editor → Download Button → Selecionar formato → Confirmar
   → Deduz 1 crédito → Salva em Criativos
   ```

6. **Visualizar Criativo**
   ```
   Projeto → Tab Criativos → Ver galeria → Download individual
   ```

### Fluxo de Fontes Customizadas

1. **Upload via Assets**
   ```
   Projeto → Tab Assets → Upload Font → Arquivo .ttf/.otf
   → Salva no Vercel Blob → Registra no banco
   ```

2. **Uso no Editor**
   ```
   Template → Editor → Painel Fontes → Fonte aparece na lista
   → Selecionar texto → Aplicar fonte customizada
   ```

3. **Pré-carregamento**
   ```
   Editor abre → Carrega localStorage + Database
   → document.fonts.load() para cada fonte
   → Aguarda document.fonts.ready
   → Renderiza canvas com fontes prontas
   ```

## 🔐 Autenticação e Autorização

### Verificação de Ownership
```typescript
// Exemplo de verificação em API route
const project = await db.project.findFirst({
  where: {
    id: projectId,
    userId: clerkUserId, // Garante que usuário é dono
  },
})

if (!project) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

### Cascade Delete
- Deletar projeto → Deleta templates, assets, fontes e generations
- Garante integridade referencial
- Configurado via Prisma: `onDelete: Cascade`

## 📊 Consultas Otimizadas

### Projeto com Contadores
```typescript
const project = await db.project.findUnique({
  where: { id: projectId },
  include: {
    _count: {
      select: {
        Template: true,
        Generation: true,
        Asset: true,
        CustomFont: true,
      },
    },
  },
})
```

### Templates com Preview
```typescript
const templates = await db.template.findMany({
  where: { projectId },
  select: {
    id: true,
    name: true,
    type: true,
    dimensions: true,
    thumbnailUrl: true,
    createdAt: true,
  },
  orderBy: { updatedAt: 'desc' },
})
```

## 🐛 Solução de Problemas

### Assets não aparecem
- Verificar variável `BLOB_READ_WRITE_TOKEN`
- Confirmar URL do Vercel Blob
- Checar permissões de acesso público

### Fontes não carregam no editor
- Ver [Sistema de Fontes Customizadas](./custom-fonts.md)
- Verificar console para erros de carregamento
- Confirmar formato do arquivo (.ttf, .otf, .woff, .woff2)

### Templates não salvam
- Verificar estrutura do `designData`
- Confirmar que `projectId` existe
- Checar logs do servidor

### Créditos não debitam
- Confirmar configuração em `feature-config.ts`
- Verificar `deductCreditsForFeature()` no export
- Checar tabela `CreditTransaction`

## 📚 Referências

- [Editor Konva](./konva-editor.md)
- [Sistema de Fontes Customizadas](./custom-fonts.md)
- [Sistema de Créditos](./credits.md)
- [Uploads e Vercel Blob](./uploads.md)
- [Database Schema](./database.md)
