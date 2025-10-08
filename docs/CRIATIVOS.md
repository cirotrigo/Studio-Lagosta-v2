# Sistema de Criativos - Documentação

## Visão Geral

O sistema de criativos permite aos usuários salvar, visualizar, baixar e gerenciar versões finalizadas (criativos) dos templates editados no Konva Editor. Cada criativo é uma exportação em alta qualidade (JPEG 2x) que consome créditos do usuário e fica armazenada permanentemente.

## Arquitetura

### Fluxo de Dados

```
┌─────────────────┐
│  Editor Konva   │
│  (Canvas)       │
└────────┬────────┘
         │
         │ exportDesign('jpeg')
         ▼
┌─────────────────────────────────┐
│ template-editor-context.tsx     │
│ - Captura canvas em JPEG (2x)   │
│ - Upload para Vercel Blob       │
│ - Deduz créditos do usuário     │
│ - Salva Generation no banco     │
│ - Invalida cache React Query    │
└────────┬────────────────────────┘
         │
         │ Sucesso
         ▼
┌─────────────────────────────────┐
│ CreativesPanel (atualiza auto)  │
│ - Lista todos os criativos      │
│ - Grid 2 colunas                │
│ - PhotoSwipe para visualização  │
│ - Download individual           │
│ - Exclusão com confirmação      │
└─────────────────────────────────┘
```

### Componentes Principais

#### 1. **Botões de Ação** (`template-editor-shell.tsx`)

Localizado no header superior do editor:

```tsx
// Botão Salvar Template (salva apenas o design, sem consumir créditos)
<Button onClick={handleSave}>
  <Save className="mr-2 h-4 w-4" />
  {isSaving ? 'Salvando...' : dirty ? 'Salvar Template' : 'Salvo'}
</Button>

// Botão Salvar Criativo (exporta JPEG, consome créditos, salva no banco)
<Button onClick={handleExport}>
  <Save className="mr-2 h-4 w-4" />
  {isExporting ? 'Salvando...' : 'Salvar Criativo'}
</Button>
```

**Diferenças:**
- **Salvar Template**: Atualiza apenas o `designData` do template, não gera arquivo
- **Salvar Criativo**: Exporta canvas em JPEG, faz upload, deduz créditos e cria registro de `Generation`

#### 2. **Contexto do Editor** (`template-editor-context.tsx`)

A função `exportDesign` gerencia todo o processo de exportação:

**Etapas:**

1. **Preparação do Canvas**
   - Limpa seleção para ocultar transformers
   - Normaliza zoom para 100% (escala 1:1)
   - Oculta camadas de guides
   - Oculta camadas marcadas como `visible: false`

2. **Exportação em JPEG**
   - PixelRatio: 2x (alta qualidade)
   - Qualidade inicial: 90%
   - Reduz qualidade iterativamente se exceder 8MB
   - Mínimo de qualidade: 50%

3. **Upload e Persistência**
   ```typescript
   // Upload para Vercel Blob
   const blob = await put(fileName, buffer, {
     access: 'public',
     contentType: 'image/jpeg',
   })

   // Deduz créditos (CREATIVE_DOWNLOAD)
   await deductCreditsForFeature({
     clerkUserId: userId,
     feature: 'creative_download',
   })

   // Salva Generation no banco
   await db.generation.create({
     data: {
       templateId,
       projectId,
       status: 'COMPLETED',
       resultUrl: blob.url,
       templateName,
       projectName,
       createdBy: userId,
       completedAt: new Date(),
     },
   })
   ```

4. **Invalidação do Cache**
   ```typescript
   // Atualiza lista de criativos automaticamente
   queryClient.invalidateQueries({
     queryKey: ['template-creatives', templateId]
   })
   ```

5. **Restauração do Estado**
   - Restaura visibilidade de camadas
   - Restaura zoom e posição originais
   - Restaura seleção de camadas

#### 3. **Painel de Criativos** (`panels/creatives-panel.tsx`)

Menu vertical que lista todos os criativos gerados para um template.

**Características:**
- Grid responsivo de 2 colunas
- Aspect ratio dinâmico baseado nas dimensões do template
- Refetch automático ao abrir o painel
- PhotoSwipe para visualização em lightbox

**Layout:**

```
┌──────────────────────────────────────┐
│ Criativos Gerados                    │
│ 3 criativos                          │
├──────────────────────────────────────┤
│                                      │
│  ┌────────┐  ┌────────┐            │
│  │ Image  │  │ Image  │            │
│  │ 9:16   │  │ 9:16   │            │
│  │        │  │        │            │
│  │ Nome   │  │ Nome   │            │
│  │ há 2h  │  │ há 5h  │            │
│  │ [📥][🗑]│  │ [📥][🗑]│            │
│  └────────┘  └────────┘            │
│                                      │
│  ┌────────┐                         │
│  │ Image  │                         │
│  │ 9:16   │                         │
│  │        │                         │
│  │ Nome   │                         │
│  │ há 1d  │                         │
│  │ [📥][🗑]│                         │
│  └────────┘                         │
│                                      │
└──────────────────────────────────────┘
```

**Ações Disponíveis:**

1. **Visualizar (clique na imagem)**
   - Abre PhotoSwipe em tela cheia
   - Navegação entre criativos
   - Zoom e pan

2. **Baixar (ícone download)**
   ```typescript
   const handleDownload = (url: string, fileName: string) => {
     const link = document.createElement('a')
     link.href = url
     link.download = fileName
     link.target = '_blank'
     document.body.appendChild(link)
     link.click()
     document.body.removeChild(link)
   }
   ```

3. **Excluir (ícone lixeira)**
   - AlertDialog de confirmação
   - Deleta registro do banco
   - Atualiza lista automaticamente
   - **Nota**: O arquivo no Vercel Blob NÃO é deletado

#### 4. **PhotoSwipe Integration** (`creatives-lightbox.tsx`)

Wrapper do PhotoSwipe v5 para visualização de imagens.

**Configuração:**

```typescript
const lightbox = new PhotoSwipeLightbox({
  gallery: `#${galleryId}`,
  children: 'a',
  pswpModule: () => import('photoswipe'),
  padding: { top: 20, bottom: 40, left: 100, right: 100 },
  bgOpacity: 0.9,
  closeTitle: 'Fechar (Esc)',
  zoomTitle: 'Zoom',
  arrowPrevTitle: 'Anterior',
  arrowNextTitle: 'Próximo',
  errorMsg: 'A imagem não pôde ser carregada.',
})
```

**Uso:**

```tsx
<CreativesLightbox galleryId={`creatives-gallery-${templateId}`}>
  <div className="grid grid-cols-2 gap-3">
    {creatives.map((creative) => (
      <a
        href={creative.resultUrl}
        data-pswp-width={creative.width}
        data-pswp-height={creative.height}
      >
        <img src={creative.resultUrl} />
      </a>
    ))}
  </div>
</CreativesLightbox>
```

### API Endpoints

#### GET `/api/templates/[id]/creatives`

**Descrição**: Busca todos os criativos de um template

**Autenticação**: Requerida (Clerk)

**Validações**:
- Verifica ownership do template via `Project.userId`
- Retorna apenas criativos com `status: 'COMPLETED'`

**Resposta**:
```typescript
[
  {
    id: string,
    resultUrl: string,
    createdAt: string,
    templateName: string,
    projectName: string,
    width: number,      // Extraído de Template.dimensions
    height: number,     // Extraído de Template.dimensions
  }
]
```

**Exemplo**:
```json
[
  {
    "id": "cmgiksnoi0003swxun7d5avb8",
    "resultUrl": "https://sqc9qfyearji7bel.public.blob.vercel-storage.com/template-instagram-1759963440950.jpg",
    "createdAt": "2025-10-08T22:44:08.034Z",
    "templateName": "Açaís",
    "projectName": "Real Gelateria",
    "width": 1080,
    "height": 1920
  }
]
```

#### DELETE `/api/templates/[id]/creatives?creativeId={id}`

**Descrição**: Remove um criativo

**Autenticação**: Requerida (Clerk)

**Query Params**:
- `creativeId` (string): ID do criativo a ser removido

**Validações**:
- Verifica ownership via `Generation.Template.Project.userId`

**Resposta**:
```json
{ "success": true }
```

#### POST `/api/templates/[id]/export`

**Descrição**: Exporta canvas e salva criativo

**Autenticação**: Requerida (Clerk)

**Body**:
```typescript
{
  format: 'jpeg',
  dataUrl: string,    // Base64 data URL do canvas
  fileName: string,   // Nome do arquivo a ser salvo
}
```

**Fluxo**:
1. Valida créditos disponíveis (`validateCreditsForFeature`)
2. Converte dataURL para buffer
3. Upload para Vercel Blob
4. Deduz créditos (`deductCreditsForFeature`)
5. Cria registro `Generation`
6. Retorna sucesso com créditos restantes

**Resposta**:
```json
{
  "success": true,
  "creditsRemaining": 888,
  "generation": {
    "id": "cmgiksnoi0003swxun7d5avb8",
    "resultUrl": "https://..."
  }
}
```

**Erros**:
- `402` - Créditos insuficientes
- `404` - Template não encontrado
- `403` - Não autorizado

### Hooks React Query

#### `useTemplateCreatives(templateId: number)`

**Descrição**: Hook para buscar criativos de um template

**Configuração**:
```typescript
export function useTemplateCreatives(templateId: number) {
  return useQuery<Creative[]>({
    queryKey: ['template-creatives', templateId],
    queryFn: () => api.get(`/api/templates/${templateId}/creatives`),
    enabled: Number.isFinite(templateId) && templateId > 0,
    staleTime: 30_000, // 30 segundos
  })
}
```

**Uso**:
```typescript
const { data: creatives, isLoading, error, refetch } = useTemplateCreatives(templateId)
```

#### `useDeleteCreative(templateId: number)`

**Descrição**: Hook para deletar um criativo

**Configuração**:
```typescript
export function useDeleteCreative(templateId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (creativeId: number) => {
      return api.delete(`/api/templates/${templateId}/creatives?creativeId=${creativeId}`)
    },
    onSuccess: () => {
      // Invalida cache automaticamente
      queryClient.invalidateQueries({
        queryKey: ['template-creatives', templateId]
      })
    },
  })
}
```

**Uso**:
```typescript
const deleteCreative = useDeleteCreative(templateId)

await deleteCreative.mutateAsync(creativeId)
```

### Modelo de Dados

#### Generation (Prisma)

```prisma
model Generation {
  id                   String           @id @default(cuid())
  status               GenerationStatus @default(PROCESSING)
  templateId           Int
  fieldValues          Json
  resultUrl            String?
  projectId            Int
  authorName           String?
  templateName         String?
  projectName          String?
  createdBy            String
  createdAt            DateTime         @default(now())
  completedAt          DateTime?
  googleDriveFileId    String?
  googleDriveBackupUrl String?
  Project              Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  Template             Template         @relation(fields: [templateId], references: [id])

  @@index([createdAt])
  @@index([createdBy])
  @@index([projectId])
  @@index([status])
  @@index([templateId])
}

enum GenerationStatus {
  PROCESSING
  COMPLETED
  FAILED
}
```

**Campos Importantes:**
- `status`: Sempre `'COMPLETED'` para criativos salvos manualmente
- `resultUrl`: URL pública do arquivo no Vercel Blob
- `templateName` e `projectName`: Salvos para referência
- `fieldValues`: Vazio (`{}`) para criativos do editor (usado apenas em gerações automáticas)

## Sistema de Créditos

### Feature: `creative_download`

**Custo Padrão**: 2 créditos (configurável em Admin Settings)

**Fluxo de Dedução**:

1. **Validação** (`validateCreditsForFeature`)
   ```typescript
   // Verifica se usuário tem créditos suficientes
   if (creditsRemaining < creditsRequired) {
     throw new InsufficientCreditsError(creditsRequired, creditsRemaining)
   }
   ```

2. **Dedução** (`deductCreditsForFeature`)
   ```typescript
   // Deduz créditos e registra no histórico
   await db.creditBalance.update({
     where: { userId },
     data: { creditsRemaining: { decrement: creditsToUse } }
   })

   await db.usageHistory.create({
     data: {
       userId,
       creditBalanceId,
       operationType: 'CREATIVE_DOWNLOAD',
       creditsUsed: creditsToUse,
       details: { templateId, format, exportType, fileName }
     }
   })
   ```

3. **Rollback em Caso de Erro**
   - Se upload falhar, créditos NÃO são deduzidos
   - Se criação do Generation falhar, créditos já foram deduzidos (considerar implementar transação)

### Mensagens de Erro

**Créditos Insuficientes (402)**:
```json
{
  "error": "Créditos insuficientes",
  "required": 2,
  "available": 0
}
```

**UI**:
```typescript
toast({
  title: 'Erro ao salvar criativo',
  description: 'Créditos insuficientes para exportar. Necessário: 2, Disponível: 0',
  variant: 'destructive',
})
```

## Características Técnicas

### Otimização de Qualidade JPEG

Para evitar arquivos muito grandes (limite: 8MB), o sistema reduz a qualidade iterativamente:

```typescript
let quality = 0.9 // 90% inicial
let sizeBytes = 0

dataUrl = stage.toDataURL({
  pixelRatio: 2,
  mimeType: 'image/jpeg',
  quality: quality,
})

// Calcula tamanho estimado
const base64 = dataUrl.split(',')[1]
sizeBytes = Math.round((base64.length * 3) / 4)

// Reduz qualidade até atingir limite ou mínimo de 50%
while (sizeBytes > MAX_SIZE_BYTES && quality > 0.5) {
  quality -= 0.05
  dataUrl = stage.toDataURL({ quality, ... })
  sizeBytes = Math.round((base64.length * 3) / 4)
}
```

### Cache e Atualização Automática

**Estratégia de Cache**:
- `staleTime: 30_000` (30 segundos)
- Invalidação automática após criar criativo
- Refetch ao abrir painel
- Background refetching quando janela ganha foco

**Invalidação em Múltiplos Pontos**:

1. **Após Export**:
   ```typescript
   // template-editor-context.tsx
   queryClient.invalidateQueries({
     queryKey: ['template-creatives', templateId]
   })
   ```

2. **Após Delete**:
   ```typescript
   // use-template-creatives.ts
   onSuccess: () => {
     queryClient.invalidateQueries({
       queryKey: ['template-creatives', templateId]
     })
   }
   ```

3. **Ao Montar Componente**:
   ```typescript
   // creatives-panel.tsx
   React.useEffect(() => {
     refetch()
   }, [refetch])
   ```

### Proporções Dinâmicas

O sistema detecta automaticamente as dimensões do template e aplica aspect ratio correto:

```typescript
// API retorna dimensões parseadas
const dimensions = template.dimensions || '1080x1920'
const [width, height] = dimensions.split('x').map(Number)

// UI usa aspectRatio CSS
const aspectRatio = width / height

<a style={{ aspectRatio }} className="block overflow-hidden">
  <img src={creative.resultUrl} />
</a>
```

**Formatos Suportados**:
- Instagram Story: 1080x1920 (9:16)
- Instagram Feed: 1080x1080 (1:1)
- Personalizado: Qualquer proporção

### Debug e Logging

**Console Logs Disponíveis**:

```typescript
// Frontend (creatives-panel.tsx)
console.log('[CreativesPanel] templateId:', templateId)
console.log('[CreativesPanel] isLoading:', isLoading)
console.log('[CreativesPanel] error:', error)
console.log('[CreativesPanel] creatives:', creatives)

// Backend (route.ts)
console.log('[GET_CREATIVES] Found', creatives.length, 'creatives for template', templateId)
console.log('[GET_CREATIVES] Creatives:', JSON.stringify(creatives, null, 2))

// Export (template-editor-context.tsx)
console.log('[EXPORT] Sending to API for saving...')
console.log('[EXPORT] Saved successfully. Remaining credits:', data.creditsRemaining)
```

## Guia de Uso

### Para Usuários

1. **Salvar Template vs Salvar Criativo**
   - **Salvar Template**: Salva apenas o design (grátis, sem consumir créditos)
   - **Salvar Criativo**: Exporta imagem final em alta qualidade (consome créditos)

2. **Acessar Criativos**
   - Clique no ícone "Criativos" (📁) na barra vertical esquerda
   - Lista mostra todos os criativos gerados para o template atual

3. **Visualizar em Tela Cheia**
   - Clique na thumbnail do criativo
   - Use setas para navegar entre criativos
   - ESC para fechar

4. **Baixar Criativo**
   - Clique no ícone de download (📥)
   - Arquivo JPEG é baixado automaticamente

5. **Excluir Criativo**
   - Clique no ícone de lixeira (🗑️)
   - Confirme a exclusão no dialog
   - **Atenção**: Ação irreversível

### Para Desenvolvedores

#### Adicionar Novo Formato de Export

1. Atualizar tipo `ExportFormat`:
   ```typescript
   type ExportFormat = 'png' | 'jpeg' | 'webp'
   ```

2. Atualizar `exportDesign`:
   ```typescript
   const mimeType = format === 'png'
     ? 'image/png'
     : format === 'webp'
     ? 'image/webp'
     : 'image/jpeg'
   ```

3. Atualizar API route:
   ```typescript
   const mimeType = format === 'png'
     ? 'image/png'
     : format === 'webp'
     ? 'image/webp'
     : 'image/jpeg'
   ```

#### Personalizar PhotoSwipe

Editar `creatives-lightbox.tsx`:

```typescript
const lightbox = new PhotoSwipeLightbox({
  // Adicionar opções customizadas
  showHideAnimationType: 'fade',
  initialZoomLevel: 'fit',
  secondaryZoomLevel: 2,
  maxZoomLevel: 3,
  // ... outras opções
})
```

#### Adicionar Filtros ao Painel

```typescript
const [filter, setFilter] = useState<'all' | 'recent' | 'favorites'>('all')

const filteredCreatives = useMemo(() => {
  if (filter === 'recent') {
    return creatives.filter(c =>
      isAfter(new Date(c.createdAt), subDays(new Date(), 7))
    )
  }
  return creatives
}, [creatives, filter])
```

## Troubleshooting

### Criativos Não Aparecem

**Possíveis Causas**:
1. Cache desatualizado
   - **Solução**: Fechar e reabrir o painel de criativos

2. Criativos com `status !== 'COMPLETED'`
   - **Solução**: Verificar no banco de dados se há gerações com status `PROCESSING` ou `FAILED`

3. Ownership incorreto
   - **Solução**: Verificar se `Template.Project.userId` está correto

### Criativo Não Salva

**Possíveis Causas**:
1. Créditos insuficientes
   - **Sintoma**: Toast com erro 402
   - **Solução**: Adicionar créditos ao usuário

2. Erro de upload
   - **Sintoma**: Toast com erro de rede
   - **Solução**: Verificar configuração Vercel Blob, verificar logs do servidor

3. Canvas muito grande
   - **Sintoma**: Timeout ou erro de memória
   - **Solução**: Reduzir pixelRatio ou dimensões do canvas

### PhotoSwipe Não Abre

**Possíveis Causas**:
1. CSS do PhotoSwipe não carregado
   - **Solução**: Verificar import `'photoswipe/style.css'` em `creatives-lightbox.tsx`

2. Atributos `data-pswp-*` incorretos
   - **Solução**: Verificar se `data-pswp-width` e `data-pswp-height` estão definidos corretamente

3. Gallery ID duplicado
   - **Solução**: Garantir que `galleryId` seja único por template

## Melhorias Futuras

### Funcionalidades Planejadas

1. **Edição de Criativos**
   - Renomear criativos
   - Adicionar tags/categorias
   - Marcar favoritos

2. **Exportação em Lote**
   - Selecionar múltiplos criativos
   - Baixar como ZIP
   - Aplicar ações em lote (excluir, marcar)

3. **Integração com Google Drive**
   - Upload automático para Google Drive
   - Sincronização bidirecional
   - Compartilhamento via link

4. **Versionamento**
   - Histórico de versões de um criativo
   - Comparação lado a lado
   - Restaurar versão anterior

5. **Métricas e Analytics**
   - Contagem de downloads
   - Criativos mais populares
   - Relatório de uso de créditos

### Otimizações Técnicas

1. **Lazy Loading de Imagens**
   - Implementar virtualização para muitos criativos
   - Carregar apenas thumbnails visíveis
   - Progressive loading de imagens

2. **Compressão Inteligente**
   - WebP para navegadores compatíveis
   - AVIF para melhor compressão
   - Adaptive quality baseado em dimensões

3. **Cache de Thumbnails**
   - Gerar thumbnails menores no servidor
   - Cache CDN para faster loading
   - Responsive images (srcset)

4. **Background Jobs**
   - Queue para processamento de exports
   - Notificações quando criativo estiver pronto
   - Retry automático em caso de falha

## Referências

- [PhotoSwipe v5 Documentation](https://photoswipe.com/getting-started/)
- [React Query (TanStack Query)](https://tanstack.com/query/latest)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [Konva.js toDataURL](https://konvajs.org/api/Konva.Node.html#toDataURL)
- [Date-fns formatDistanceToNow](https://date-fns.org/v2.29.3/docs/formatDistanceToNow)

## Changelog

### v1.0.0 (2025-10-08)

**Adicionado**:
- ✅ Sistema completo de criativos
- ✅ Painel de visualização em grid 2 colunas
- ✅ PhotoSwipe lightbox para visualização
- ✅ Download individual de criativos
- ✅ Exclusão com confirmação
- ✅ Integração com sistema de créditos
- ✅ API endpoints GET e DELETE
- ✅ Hooks React Query otimizados
- ✅ Cache e atualização automática
- ✅ Proporções dinâmicas baseadas no template
- ✅ Botões "Salvar Template" e "Salvar Criativo"
- ✅ Botões de ação compactos (apenas ícones)
- ✅ Logs de debug para troubleshooting
