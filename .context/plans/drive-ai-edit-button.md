---
status: active
generated: 2026-02-03
agents:
  - type: "feature-developer"
    role: "Implement the AI edit button and modal integration"
  - type: "frontend-specialist"
    role: "Design button placement and user experience flow"
phases:
  - id: "phase-1"
    name: "Discovery & Alignment"
    prevc: "P"
  - id: "phase-2"
    name: "Implementation & Iteration"
    prevc: "E"
  - id: "phase-3"
    name: "Validation & Handoff"
    prevc: "V"
---

# Botão Editar com IA na aba Drive

> Adicionar botão de edição com IA nas fotos do Google Drive que abre o modal existente com a foto pré-carregada e salva o resultado na galeria de IA e na pasta do Drive

## Task Snapshot
- **Primary goal:** Permitir que usuários editem fotos do Google Drive usando IA, com resultado salvo tanto na galeria de IA quanto na pasta original do Drive.
- **Success signal:** Usuário clica em "Editar com IA" numa foto do Drive → modal abre com foto carregada → gera imagem → imagem aparece na galeria de IA E na pasta do Drive.

## Arquitetura Atual

### Componentes Envolvidos

```
src/components/templates/sidebar/
├── drive-panel.tsx           # Exibe fotos do Drive (MODIFICAR)
├── ai-images-panel.tsx       # Galeria de imagens IA + Modal de geração (MODIFICAR)
└── template-editor-context.tsx # Contexto compartilhado (MODIFICAR)
```

### Fluxo Existente de Comunicação

O `TemplateEditorContext` já possui um mecanismo para comunicação entre painéis:

```typescript
// Tipo atual
pendingAIImageEdit: { url: string } | null

// Fluxo atual:
// 1. DrivePanel define pendingAIImageEdit com URL da imagem
// 2. AIImagesPanel detecta mudança e abre modal com imagem como referência
```

### Componentes Chave

1. **DrivePanel** (`drive-panel.tsx:~350 linhas`)
   - Exibe fotos do Drive em grid
   - Cada foto tem overlay com ações (aplicar ao template, baixar)
   - USA: `useGoogleDriveMedia` hook para listar mídias

2. **AIImagesPanel** (`ai-images-panel.tsx:~400 linhas`)
   - Galeria de imagens geradas por IA
   - Modal de geração com campo de prompt
   - USA: `useGeneratedImages`, `useGenerateImage`, `useImprovePrompt`

3. **TemplateEditorContext**
   - Gerencia estado compartilhado entre painéis
   - `pendingAIImageEdit` para comunicação entre Drive → AI

## Implementação

### Arquivos a Modificar

#### 1. `src/components/templates/sidebar/drive-panel.tsx`

**Adicionar botão "Editar com IA":**
```tsx
// No overlay de cada imagem, adicionar:
<Button
  size="icon"
  variant="ghost"
  className="h-8 w-8 bg-black/50 hover:bg-black/70"
  onClick={(e) => {
    e.stopPropagation()
    handleEditWithAI(media)
  }}
  title="Editar com IA"
>
  <Wand2 className="h-4 w-4 text-white" />
</Button>

// Handler:
const handleEditWithAI = (media: DriveMedia) => {
  setPendingAIImageEdit({
    url: media.thumbnailUrl || media.webContentLink,
    driveFileId: media.id,
    driveFolderId: currentFolderId,
    fileName: media.name,
  })
  // Switch para aba AI automaticamente
  setActiveTab('ai-images')
}
```

#### 2. `src/components/templates/sidebar/template-editor-context.tsx`

**Expandir tipo do `pendingAIImageEdit`:**
```typescript
interface PendingAIImageEdit {
  url: string
  driveFileId?: string      // ID do arquivo original no Drive
  driveFolderId?: string    // Pasta onde salvar resultado
  fileName?: string         // Nome base para o arquivo gerado
}

pendingAIImageEdit: PendingAIImageEdit | null
```

#### 3. `src/components/templates/sidebar/ai-images-panel.tsx`

**Modificar para usar info do Drive:**
```typescript
// Ao gerar imagem, verificar se veio do Drive
const handleGenerateSuccess = async (result: GenerateImageResult) => {
  // Salvar na galeria (já acontece)

  // Se veio do Drive, salvar também na pasta
  if (pendingAIImageEdit?.driveFolderId) {
    await uploadToDrive({
      imageUrl: result.resultUrl,
      folderId: pendingAIImageEdit.driveFolderId,
      fileName: `${pendingAIImageEdit.fileName}_ai_${Date.now()}.png`
    })
  }

  setPendingAIImageEdit(null)
}
```

#### 4. Criar `src/app/api/drive/upload-image/route.ts` (NOVO)

**API para upload de imagem gerada para o Drive:**
```typescript
import { auth } from '@clerk/nextjs/server'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, folderId, fileName } = await request.json()

  // 1. Buscar token OAuth do usuário
  // 2. Fazer download da imagem gerada
  // 3. Upload para Google Drive na pasta especificada
  // 4. Retornar ID do arquivo criado

  return NextResponse.json({ success: true, fileId: newFileId })
}
```

#### 5. Criar `src/hooks/use-upload-to-drive.ts` (NOVO)

**Hook para upload:**
```typescript
export function useUploadToDrive() {
  return useMutation({
    mutationFn: (params: { imageUrl: string; folderId: string; fileName: string }) =>
      api.post('/api/drive/upload-image', params)
  })
}
```

## Working Phases

### Phase 1 — Discovery & Alignment (Completo)
**Steps**
1. ✅ Analisar arquitetura atual do DrivePanel e AIImagesPanel
2. ✅ Identificar mecanismo existente `pendingAIImageEdit`
3. ✅ Mapear fluxo de geração de imagem

### Phase 2 — Implementation & Iteration
**Steps**
1. Expandir tipo `PendingAIImageEdit` no context para incluir metadados do Drive
2. Adicionar botão "Editar com IA" no DrivePanel com ícone Wand2
3. Criar API `/api/drive/upload-image` para upload de resultado
4. Criar hook `useUploadToDrive`
5. Modificar AIImagesPanel para chamar upload após geração bem-sucedida
6. Adicionar indicador visual de que imagem veio do Drive (opcional)
7. Invalidar query do Drive após upload para mostrar nova imagem

### Phase 3 — Validation & Handoff
**Steps**
1. Testar fluxo completo: Drive → Modal → Gerar → Salvar em ambos locais
2. Testar com diferentes tipos de imagem (JPG, PNG, WebP)
3. Testar tratamento de erros (sem permissão Drive, falha upload)
4. Verificar que créditos são cobrados corretamente

## Checklist de Verificação

- [ ] Botão "Editar com IA" aparece ao passar mouse sobre foto no Drive
- [ ] Clicar no botão abre modal de IA com foto como referência
- [ ] Campo de prompt permite melhorar descrição (botão Wand2)
- [ ] Gerar imagem funciona normalmente
- [ ] Imagem gerada aparece na galeria de IA
- [ ] Imagem gerada aparece na pasta original do Drive
- [ ] Nome do arquivo no Drive inclui sufixo "_ai"
- [ ] Toast de sucesso indica salvamento em ambos locais
- [ ] Erro de upload no Drive não impede salvamento na galeria

## Decisões de Design

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Salvar em ambos locais | Sim | Usuário tem backup na galeria e organização no Drive |
| Nome do arquivo | `{original}_ai_{timestamp}` | Identificar facilmente que é versão IA |
| Troca automática de aba | Sim | UX fluida, usuário não precisa clicar |
| Upload síncrono | Sim | Garantir que usuário veja confirmação |

## Dependências

- **API Google Drive**: Precisa de escopo de escrita (`drive.file`)
- **Token OAuth**: Já existente no sistema para leitura do Drive
- **Créditos**: Usa sistema existente de `ai_image_generation`
