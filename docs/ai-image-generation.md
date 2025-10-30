# AI Image Generation - Studio Lagosta

## 📝 Visão Geral

O sistema de geração de imagens com IA permite aos usuários criar imagens personalizadas usando o modelo Gemini 2.5 Flash Image (Nano Banana) através da API do Replicate. O sistema suporta prompts de texto, seleção de aspect ratio e até 3 imagens de referência (do Google Drive ou upload local).

## 🎯 Funcionalidades

### 1. Geração de Imagens
- **Modelo**: Gemini 2.5 Flash Image (Nano Banana) via Replicate
- **Inputs**:
  - Prompt de texto (obrigatório)
  - Aspect ratio: 1:1, 16:9, 9:16, 4:5
  - Até 3 imagens de referência (opcional)
- **Output**: PNG em alta qualidade armazenado no Vercel Blob

### 2. Imagens de Referência
Suporta dois métodos de seleção:

#### Google Drive
- Modal multi-seleção integrado com navegação de pastas
- Preview de thumbnails
- Contador visual de seleção (X/3 imagens)
- Limite de 3 imagens

#### Upload Local
- Drag & drop de arquivos
- Seleção por clique
- Preview de thumbnails
- Validação de tipo (apenas imagens)
- Limite combinado de 3 imagens (Google Drive + local)

### 3. Gerenciamento de Créditos
- **Custo**: Configurado no sistema de créditos (feature: `ai_image_generation`)
- **Validação**: Antes da geração
- **Dedução**: Após sucesso da geração
- **Detalhes registrados**: mode, prompt, aiImageId, aspectRatio

## 🏗️ Arquitetura

### Fluxo de Geração

```
[Frontend] ai-images-panel.tsx
    ↓
1. Valida inputs (prompt, limite de imagens)
2. Upload de imagens locais → /api/upload
3. Converte imagens do Drive → URLs completas
4. Combina todas as URLs de referência
    ↓
[Backend] /api/ai/generate-image
    ↓
5. Autentica usuário (Clerk)
6. Verifica ownership do projeto
7. Valida créditos
8. Upload de referências → Vercel Blob (públicas)
9. Cria prediction no Replicate
10. Aguarda conclusão (polling 60s)
11. Upload da imagem gerada → Vercel Blob
12. Salva no banco de dados
13. Deduz créditos
    ↓
[Database] AIGeneratedImage
```

### Processamento de Imagens de Referência

**Problema**: Replicate API não consegue acessar URLs locais ou autenticadas.

**Solução**: Upload intermediário para Vercel Blob

```
Google Drive Image              Local File Upload
       ↓                              ↓
   [Cookie Auth]                [FormData]
       ↓                              ↓
/api/google-drive/image      /api/upload
       ↓                              ↓
  Fetch com cookie          Validação + Upload
       ↓                              ↓
   ArrayBuffer                 Vercel Blob
       ↓                              ↓
   Vercel Blob                Public URL
       ↓                              ↓
    Public URL                        ↓
       └──────────────┬───────────────┘
                      ↓
            [Replicate API]
             image_input: [url1, url2, url3]
```

## 📂 Estrutura de Arquivos

### Frontend

#### `/src/components/templates/sidebar/ai-images-panel.tsx`
Painel principal de geração de IA no editor.

**Responsabilidades**:
- Interface de geração (prompt, aspect ratio)
- Seleção de imagens de referência
- Upload de arquivos locais com drag & drop
- Preview de imagens selecionadas
- Exibição de imagens geradas
- Integração com canvas (adicionar imagem ao design)

**Estados principais**:
```typescript
const [prompt, setPrompt] = useState('')
const [aspectRatio, setAspectRatio] = useState('1:1')
const [referenceImages, setReferenceImages] = useState<GoogleDriveItem[]>([])
const [localFiles, setLocalFiles] = useState<File[]>([])
const [isDragging, setIsDragging] = useState(false)
```

**Handlers importantes**:
```typescript
handleGenerate()          // Processa e envia para API
handleFileSelect()        // Valida e adiciona arquivos locais
handleDragOver()          // Visual feedback do drag
handleDragLeave()         // Remove feedback visual
handleDrop()              // Processa arquivos dropados
handleRemoveLocalFile()   // Remove arquivo local
handleRemoveReferenceImage() // Remove imagem do Drive
handleInsertToCanvas()    // Adiciona imagem ao design
```

#### `/src/components/projects/google-drive-folder-selector.tsx`
Modal de navegação e seleção do Google Drive com suporte multi-seleção.

**Props para multi-seleção**:
```typescript
interface DesktopGoogleDriveModalProps {
  multiSelect?: boolean
  maxSelection?: number
  selectedItems?: GoogleDriveItem[]
  onMultiSelectConfirm?: (items: GoogleDriveItem[]) => void
}
```

**Modo Multi-Seleção**:
- Click em item: toggle seleção (apenas arquivos, não pastas)
- Footer: mostra contador "X / 3 imagens"
- Botão: "Confirmar Seleção" em vez de "Selecionar"
- Double-click: desabilitado em multi-select

**Importante**: Verificação de tipo correta
```typescript
// ❌ Errado: 'image' não existe no tipo
if (item.kind !== 'image') return

// ✅ Correto: excluir pastas
if (item.kind === 'folder') return
```

### Backend

#### `/src/app/api/ai/generate-image/route.ts`
Endpoint principal de geração de imagens.

**Fluxo**:
1. **Autenticação**: Verifica userId com Clerk
2. **Validação**: Zod schema para inputs
3. **Ownership**: Verifica se projeto pertence ao usuário
4. **Créditos**: Valida antes de processar
5. **Upload Refs**: Converte URLs para Vercel Blob públicas
6. **Replicate**: Cria prediction com parâmetros
7. **Polling**: Aguarda conclusão (max 60s)
8. **Upload Final**: Salva imagem gerada no Vercel Blob
9. **Persistência**: Cria registro no banco
10. **Créditos**: Deduz após sucesso

**Schema de Validação**:
```typescript
const generateImageSchema = z.object({
  projectId: z.number(),
  prompt: z.string().min(1, 'Prompt é obrigatório'),
  aspectRatio: z.string().default('1:1'),
  referenceImages: z.array(z.string()).optional(),
})
```

**Replicate Configuration**:
```typescript
const NANO_BANANA_VERSION = '1b00a781b969984d0336047c859f06a54097bc7b5e9494ccd307ebde81094c34'

const inputData = {
  prompt: params.prompt,
  aspect_ratio: params.aspectRatio,
  output_format: 'png',
  image_input: publicReferenceUrls // URLs públicas do Vercel Blob
}
```

**Cookie Forwarding** (para Google Drive):
```typescript
const cookie = request.headers.get('cookie')
const response = await fetch(url, {
  headers: cookie ? { cookie } : {}
})
```

#### `/src/app/api/upload/route.ts`
Endpoint de upload de arquivos locais para Vercel Blob.

**Responsabilidades**:
- Autenticação com Clerk
- Validação de FormData
- Verificação de tipo de arquivo (apenas imagens)
- Upload para Vercel Blob com acesso público
- Retorno de URL pública

**Input**: FormData com campo 'file'
**Output**: `{ url: string }`

```typescript
const fileName = `upload-${Date.now()}-${file.name}`
const blob = await put(fileName, file, {
  access: 'public',
  contentType: file.type,
})
```

#### `/src/app/api/projects/[projectId]/ai-images/route.ts`
Endpoint para listar imagens IA de um projeto.

**Método**: GET
**Autenticação**: Obrigatória
**Validação**: Ownership do projeto
**Response**: Array de AIGeneratedImage ordenado por data (desc)

### Database

#### Modelo `AIGeneratedImage`

```prisma
model AIGeneratedImage {
  id            Int      @id @default(autoincrement())
  projectId     Int
  name          String
  prompt        String   @db.Text
  mode          AIMode   @default(GENERATE)
  fileUrl       String
  thumbnailUrl  String?
  width         Int
  height        Int
  aspectRatio   String   @default("1:1")
  provider      String   @default("replicate")
  model         String   @default("nano-banana")
  predictionId  String?
  createdBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([createdBy])
  @@index([createdAt])
}

enum AIMode {
  GENERATE
  EDIT
  UPSCALE
}
```

**Campos importantes**:
- `mode`: Tipo de operação (atualmente apenas GENERATE)
- `aspectRatio`: Proporção da imagem gerada
- `provider`: "replicate" (fixo)
- `model`: "nano-banana" (Gemini 2.5 Flash Image)
- `predictionId`: ID da prediction no Replicate (para tracking)

## 🔧 Configuração

### Environment Variables

**Obrigatórias**:

```env
# Replicate API (OBRIGATÓRIA para geração de imagens)
# Obtenha em: https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=r8_***

# Vercel Blob (upload de imagens)
BLOB_READ_WRITE_TOKEN=vercel_blob_***

# URL da aplicação (para conversão de URLs relativas)
NEXT_PUBLIC_APP_URL=https://studio-lagosta.com
```

### Setup Passo a Passo

1. **Criar conta no Replicate**
   - Acesse [replicate.com](https://replicate.com)
   - Crie uma conta gratuita ou faça login

2. **Obter API Token**
   - Vá para [Account Settings → API Tokens](https://replicate.com/account/api-tokens)
   - Clique em "Create token"
   - Copie o token (começa com `r8_`)

3. **Configurar variável de ambiente**
   - Adicione ao seu arquivo `.env`:
   ```
   REPLICATE_API_TOKEN=r8_seu_token_aqui
   ```

4. **Reiniciar servidor de desenvolvimento**
   ```bash
   npm run dev
   ```

### Validação da Configuração

A API valida automaticamente se a `REPLICATE_API_TOKEN` está configurada antes de processar qualquer requisição. Se não estiver configurada, retorna:

```json
{
  "error": "Geração de imagens não configurada. Entre em contato com o administrador.",
  "status": 503
}
```

### Troubleshooting

**Erro: "Geração de imagens não configurada"**
- ✅ Verifique se a variável `REPLICATE_API_TOKEN` existe no arquivo `.env`
- ✅ Certifique-se de que o token começa com `r8_`
- ✅ Reinicie o servidor após adicionar a variável

**Erro: "Replicate API error"**
- ✅ Verifique se o token é válido
- ✅ Confirme que sua conta Replicate tem créditos
- ✅ Verifique logs do servidor para detalhes do erro

### Custos de Créditos

Configurado em `/src/lib/credits/feature-config.ts`:

```typescript
export const FEATURE_CREDIT_COSTS = {
  ai_image_generation: 10, // Custo por imagem gerada
  // ...
}
```

## 🎨 UI/UX

### Interface do Painel

```
┌─────────────────────────────────┐
│ Painel "IA ✨"                  │
├─────────────────────────────────┤
│                                 │
│ [Textarea] Descreva a imagem... │
│                                 │
│ Aspect Ratio: [1:1 ▼]          │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ IMAGENS DE REFERÊNCIA       │ │
│ ├─────────────────────────────┤ │
│ │ [Google Drive] [Upload ↑]   │ │
│ │                             │ │
│ │ ┌────┐ ┌────┐ ┌────┐       │ │
│ │ │img1│ │img2│ │ +  │       │ │
│ │ └────┘ └────┘ └────┘       │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Gerar Imagem]                  │
│                                 │
├─────────────────────────────────┤
│ IMAGENS GERADAS                 │
├─────────────────────────────────┤
│ ┌─────┐ ┌─────┐                │
│ │img1 │ │img2 │                │
│ │ [+] │ │ [+] │                │
│ └─────┘ └─────┘                │
└─────────────────────────────────┘
```

### Drag & Drop Visual

```typescript
<div
  className={cn(
    "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
    isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
    disabled && "opacity-50 cursor-not-allowed"
  )}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
>
  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
  <p className="text-sm text-muted-foreground">
    Arraste imagens aqui ou clique para selecionar
  </p>
  <p className="text-xs text-muted-foreground mt-1">
    {totalImages}/3 imagens
  </p>
</div>
```

### Preview de Imagens

**Google Drive**:
```typescript
<div className="relative group">
  <img
    src={`/api/google-drive/image/${img.id}`}
    alt={img.name}
    className="w-full h-full object-cover rounded"
  />
  <Button
    variant="destructive"
    size="icon"
    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
    onClick={() => handleRemoveReferenceImage(img.id)}
  >
    <X className="h-4 w-4" />
  </Button>
</div>
```

**Local Files**:
```typescript
<div className="relative group">
  <img
    src={URL.createObjectURL(file)}
    alt={file.name}
    className="w-full h-full object-cover rounded"
  />
  <Button
    variant="destructive"
    size="icon"
    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
    onClick={() => handleRemoveLocalFile(index)}
  >
    <X className="h-4 w-4" />
  </Button>
</div>
```

## 🔄 Hooks e Data Fetching

### `useAIGenerateImage`

```typescript
export function useAIGenerateImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      prompt: string
      aspectRatio: string
      referenceImages?: string[]
    }) => {
      return api.post('/api/ai/generate-image', {
        projectId: currentProjectId,
        ...data
      })
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai-images', currentProjectId]
      })
      toast({
        description: 'Imagem gerada com sucesso!'
      })
    },
    onError: (error: ApiError) => {
      if (error.status === 402) {
        toast({
          variant: 'destructive',
          description: 'Créditos insuficientes'
        })
      } else {
        toast({
          variant: 'destructive',
          description: error.message || 'Erro ao gerar imagem'
        })
      }
    }
  })
}
```

### `useAIImages`

```typescript
export function useAIImages(projectId: number) {
  return useQuery({
    queryKey: ['ai-images', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/ai-images`),
    staleTime: 30_000, // 30 segundos
    gcTime: 5 * 60_000, // 5 minutos
    enabled: !!projectId
  })
}
```

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. Erro 401 ao buscar imagens do Google Drive
**Causa**: Server-side fetch sem cookie de autenticação
**Solução**: Forward cookie do request original
```typescript
const cookie = request.headers.get('cookie')
const response = await fetch(url, {
  headers: cookie ? { cookie } : {}
})
```

#### 2. Replicate E6716 Error
**Causa**: Replicate não consegue acessar localhost ou URLs privadas
**Solução**: Upload para Vercel Blob antes de enviar para Replicate

#### 3. Seleção de múltiplas imagens não funciona
**Causa**: Verificação incorreta de `item.kind`
**Solução**: Usar `if (item.kind === 'folder') return` em vez de `if (item.kind !== 'image')`

#### 4. Duplicate key warning
**Causa**: Mesmo `id` usado para múltiplas imagens
**Solução**: Combinar id com index: `key={`ref-${img.id}-${index}`}`

#### 5. Pastas sendo selecionadas como imagens
**Causa**: Falta de validação no handleItemClick
**Solução**: Early return para pastas:
```typescript
if (item.kind === 'folder') return
```

## 📊 Performance

### Otimizações Implementadas

1. **Caching de Queries**: 30s staleTime para lista de imagens
2. **Preview Otimizado**: `URL.createObjectURL()` para arquivos locais
3. **Lazy Loading**: Imagens carregam sob demanda
4. **Polling Eficiente**: 1s interval, max 60 tentativas
5. **Invalidação Seletiva**: Apenas query específica do projeto

### Métricas Esperadas

- **Upload local → Vercel Blob**: ~1-2s por imagem
- **Google Drive → Vercel Blob**: ~2-3s por imagem
- **Geração Replicate**: ~10-30s dependendo da complexidade
- **Total (sem refs)**: ~15-35s
- **Total (com 3 refs)**: ~25-45s

## 🔐 Segurança

### Validações Implementadas

1. **Autenticação**: Todas as rotas validam userId
2. **Ownership**: Verifica se projeto pertence ao usuário
3. **Input Validation**: Zod schemas para todos os inputs
4. **File Type**: Valida que uploads são imagens
5. **Rate Limiting**: Via sistema de créditos
6. **Public URLs**: Apenas URLs do Vercel Blob enviadas para Replicate

### Best Practices

- Nunca expor REPLICATE_API_TOKEN no frontend
- Sempre validar ownership antes de operações
- Sanitizar URLs de referência
- Limitar tamanho de upload de arquivos
- Implementar timeout em polling

## 🚀 Melhorias Futuras

### Planejadas
- [ ] Suporte para modo EDIT (editar imagem existente)
- [ ] Suporte para modo UPSCALE (aumentar resolução)
- [ ] Mais aspect ratios (3:4, 21:9, etc)
- [ ] Histórico de prompts
- [ ] Favoritar imagens geradas
- [ ] Organização em coleções
- [ ] Busca por prompt
- [ ] Filtros por aspect ratio

### Consideradas
- [ ] Background removal integrado
- [ ] Batch generation (múltiplas variações)
- [ ] Negative prompts
- [ ] Seed control para reproduzibilidade
- [ ] Integração com outras AIs (DALL-E, Midjourney)
- [ ] Export direto para template

## 📚 Referências

### Documentação Externa
- [Replicate API Docs](https://replicate.com/docs)
- [Nano Banana Model](https://replicate.com/cjwbw/nano-banana)
- [Vercel Blob Docs](https://vercel.com/docs/storage/vercel-blob)
- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)

### Documentação Interna
- [Projects & Templates](./projects-templates.md)
- [Konva Editor](./konva-editor.md)
- [Credits System](./credits.md)
- [API Reference](./api.md)
- [Upload System](./uploads.md)

---

**Última atualização**: 2025-10-07
**Versão**: 1.0
**Autor**: Studio Lagosta Team
