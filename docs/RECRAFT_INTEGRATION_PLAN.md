# Integração Recraft.ai - Brand Design Studio

## Visão Geral

Integrar a API direta do Recraft.ai ao Studio Lagosta v2 para criar um **Brand Design Studio** que garante consistência visual e personalização da marca em todas as gerações de imagens.

---

## Recursos Únicos do Recraft.ai

| Recurso | Benefício para Designers |
|---------|-------------------------|
| **Custom Styles** | Upload de imagens de referência cria estilo único (styleId) |
| **Color Controls** | Paleta de cores aplicada diretamente nas gerações |
| **Vector Output (SVG)** | Ícones e ilustrações escaláveis |
| **Vectorização** | Converte logos/elementos raster em SVG |
| **Background Replace** | Troca fundos mantendo sujeito |
| **21 estilos realistas + 39 ilustrações** | Biblioteca ampla de estilos predefinidos |

---

## Proposta de Integração Criativa

### 1. **Brand Style Training** (Recurso Principal)

Permitir que designers criem um "estilo da marca" a partir de assets existentes:

```
Fluxo:
1. Selecionar 3-5 imagens representativas do projeto (logos, posts anteriores, fotos de produtos)
2. Recraft API cria um styleId único
3. Estilo salvo no projeto para uso em todas as gerações futuras
4. Resultado: Todas as imagens geradas seguem a identidade visual da marca
```

**Casos de uso:**
- Restaurante: Fotos de pratos sempre no mesmo estilo de iluminação/cores
- Loja de roupas: Produtos com fundo e estilo consistente
- Marca pessoal: Retratos e ilustrações com mesma estética

### 2. **Brand Color Palette Injection**

Usar automaticamente as cores da marca (BrandColor) em todas as gerações:

```
Fluxo:
1. Projeto já tem cores cadastradas (ex: #FF6B35, #004E64, #FFFFFF)
2. Ao gerar imagem, cores são passadas para Recraft via `controls.colors`
3. Resultado: Imagens geradas usando paleta da marca
```

### 3. **Vector Asset Factory** (Futuro)

Gerar e gerenciar biblioteca de vetores (SVG) da marca:

- **Ícones personalizados** para stories e posts
- **Elementos decorativos** consistentes com a marca
- **Logos em vetor** a partir de raster existente
- **Padrões (patterns)** para fundos

### 4. **Smart Background Studio** (Futuro)

Ferramenta especializada para backgrounds de posts/stories:

- Gerar fundos com cores da marca
- Trocar fundos de fotos de produtos
- Criar gradientes e texturas no estilo da marca

---

## Escopo MVP

### Incluído no MVP:
1. **Cliente API Recraft** - Biblioteca para comunicação com API
2. **Geração com cores da marca** - Auto-injetar BrandColors nas gerações
3. **Brand Style Training básico** - Criar estilos a partir de imagens de referência
4. **UI de gestão de estilos** - CRUD de estilos no projeto
5. **Integração com gerador de imagens** - Recraft como opção de modelo

### Fora do MVP (futuro):
- Vector Asset Factory (SVG generation)
- Background Studio
- Integração avançada com templates
- Vetorização de imagens existentes

---

## Implementação Técnica

### Fase 1: Infraestrutura (Base)

**1.1 Schema do Banco de Dados**

Adicionar em `prisma/schema.prisma`:

```prisma
// Enum para as famílias de estilo suportadas pela Recraft API
enum RecraftStyleFamily {
  realistic_image
  digital_illustration
  vector_illustration
  icon
}

// Estilos de marca treinados no Recraft
model RecraftBrandStyle {
  id              String              @id @default(cuid())
  projectId       Int
  name            String
  description     String?
  recraftStyleId  String              @unique  // ID retornado pelo Recraft (não pode ser deletado remotamente)
  referenceImages String[]                     // URLs das imagens usadas (1-5 imagens)
  styleFamily     RecraftStyleFamily  @default(digital_illustration)
  isDefault       Boolean             @default(false)
  isActive        Boolean             @default(true)  // Soft delete (estilos não podem ser deletados no Recraft)
  createdBy       String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  Project         Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([projectId, isDefault])
  @@index([projectId, isActive])
}
```

Adicionar relação no model Project:
```prisma
model Project {
  // ... campos existentes ...
  recraftBrandStyles  RecraftBrandStyle[]
}
```

**1.2 Cliente Recraft API**

Criar `/src/lib/recraft/client.ts`:

```typescript
const RECRAFT_API_BASE = 'https://external.api.recraft.ai/v1'

// Classe de erro customizada para tratamento adequado
export class RecraftAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'RecraftAPIError'
  }
}

export class RecraftClient {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      throw new RecraftAPIError(
        error.message || `Erro HTTP ${response.status}`,
        response.status,
        error
      )
    }
    return response.json()
  }

  async generateImage(params: GenerateParams): Promise<GenerateResponse> {
    const response = await fetch(`${RECRAFT_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return this.handleResponse<GenerateResponse>(response)
  }

  // IMPORTANTE: style (family) é OBRIGATÓRIO e campo é 'files' (não 'file0, file1...')
  async createStyle(
    images: File[],
    styleFamily: RecraftStyleFamily
  ): Promise<CreateStyleResponse> {
    const formData = new FormData()
    formData.append('style', styleFamily) // OBRIGATÓRIO
    images.forEach((image) => formData.append('files', image)) // 'files' não 'file0'

    const response = await fetch(`${RECRAFT_API_BASE}/styles`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData,
    })
    return this.handleResponse<CreateStyleResponse>(response)
  }

  async removeBackground(image: File): Promise<ImageResponse> { ... }
  async vectorize(image: File): Promise<SvgResponse> { ... }
  async upscale(image: File, mode: 'crisp' | 'creative'): Promise<ImageResponse> { ... }
}
```

**1.3 Configuração de Créditos**

Atualizar `src/lib/credits/feature-config.ts`:

```typescript
export const FEATURE_CREDIT_COSTS = {
  // ... existentes ...
  recraft_generation: 4,
  recraft_style_creation: 10,
  recraft_vectorize: 3,
  recraft_background: 3,
} as const
```

Atualizar enum `OperationType` no Prisma:
```prisma
enum OperationType {
  // ... existentes ...
  RECRAFT_GENERATION
  RECRAFT_STYLE_CREATION
}
```

### Fase 2: Brand Color Integration

**Mapper de Cores:** `src/lib/recraft/brand-color-mapper.ts`

```typescript
import { BrandColor } from '@prisma/client'

interface RecraftColorControl {
  colors: Array<{ rgb: [number, number, number] }>
}

export function mapBrandColorsToRecraft(colors: BrandColor[]): RecraftColorControl {
  return {
    colors: colors.slice(0, 5).map(color => ({
      rgb: hexToRgb(color.hexCode)
    }))
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0]
}
```

### Fase 3: API Endpoints

**3.1 Geração de Imagem:** `src/app/api/ai/recraft/generate/route.ts`

```typescript
import { RecraftClient, RecraftAPIError } from '@/lib/recraft/client'
import { mapBrandColorsToRecraft } from '@/lib/recraft/brand-color-mapper'

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    projectId,
    prompt,
    negativePrompt,
    styleFamily,     // realistic_image, digital_illustration, etc
    brandStyleId,    // ID do estilo customizado (opcional)
    useBrandColors,  // Auto-injetar cores do projeto
    aspectRatio,
    model = 'recraftv3'  // recraftv3 ou recraft20b (mais barato)
  } = body

  try {
    // Validar acesso ao projeto
    const project = await fetchProjectWithAccess(projectId, { userId, orgId })

    // Validar créditos
    await validateCreditsForFeature(userId, 'recraft_generation', 4)

    // Buscar cores da marca se solicitado
    let colorControls = {}
    if (useBrandColors) {
      const colors = await db.brandColor.findMany({ where: { projectId } })
      if (colors.length > 0) {
        colorControls = mapBrandColorsToRecraft(colors)
      }
    }

    // Montar parâmetros da geração
    const generateParams: GenerateParams = {
      prompt,
      model,
      size: aspectRatioToSize(aspectRatio),
      style: styleFamily || 'digital_illustration',
    }

    // Adicionar negative prompt se fornecido
    if (negativePrompt) {
      generateParams.negative_prompt = negativePrompt
    }

    // Usar estilo customizado se fornecido (sobrescreve styleFamily)
    if (brandStyleId) {
      const brandStyle = await db.recraftBrandStyle.findUnique({
        where: { id: brandStyleId, isActive: true }
      })
      if (brandStyle) {
        generateParams.style_id = brandStyle.recraftStyleId
        // Quando usa style_id, o style deve ser a família do estilo
        generateParams.style = brandStyle.styleFamily
      }
    }

    // Adicionar controle de cores se disponível
    if (Object.keys(colorControls).length > 0) {
      generateParams.controls = colorControls
    }

    // Gerar imagem
    const client = new RecraftClient(process.env.RECRAFT_API_TOKEN!)
    const result = await client.generateImage(generateParams)

    // Upload para Vercel Blob
    const blobUrl = await uploadToBlob(result.data[0].url)

    // Salvar no banco
    const image = await db.aIGeneratedImage.create({
      data: {
        projectId,
        name: prompt.slice(0, 50),
        prompt,
        mode: 'GENERATE',
        fileUrl: blobUrl,
        width: 1024,
        height: 1024,
        aspectRatio,
        provider: 'recraft',
        model: `recraft-${model}`,
        createdBy: userId,
      }
    })

    // Deduzir créditos
    await deductCreditsForFeature(userId, 'recraft_generation', 4)

    return NextResponse.json({ success: true, image })

  } catch (error) {
    // Tratamento específico para erros da Recraft API
    if (error instanceof RecraftAPIError) {
      console.error('[Recraft API Error]', error.statusCode, error.message)
      return NextResponse.json(
        { error: `Erro na geração: ${error.message}` },
        { status: error.statusCode >= 500 ? 502 : 400 }
      )
    }
    throw error
  }
}
```

**3.2 Brand Styles:** `src/app/api/projects/[projectId]/recraft-styles/route.ts`

```typescript
import { RecraftClient, RecraftAPIError } from '@/lib/recraft/client'
import { RecraftStyleFamily } from '@prisma/client'

// GET - Listar estilos ativos do projeto
export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Validar acesso ao projeto
  await fetchProjectWithAccess(parseInt(params.projectId), { userId, orgId })

  const styles = await db.recraftBrandStyle.findMany({
    where: {
      projectId: parseInt(params.projectId),
      isActive: true  // Apenas estilos ativos (soft delete)
    },
    orderBy: [
      { isDefault: 'desc' },  // Default primeiro
      { createdAt: 'desc' }
    ]
  })
  return NextResponse.json(styles)
}

// POST - Criar novo estilo
export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = parseInt(params.projectId)

  // Validar acesso ao projeto
  await fetchProjectWithAccess(projectId, { userId, orgId })

  const formData = await req.formData()
  const images = formData.getAll('images') as File[]
  const styleFamily = (formData.get('styleFamily') as RecraftStyleFamily) || 'digital_illustration'
  const name = formData.get('name') as string

  // VALIDAÇÃO: Recraft aceita entre 1 e 5 imagens de referência
  if (images.length < 1 || images.length > 5) {
    return NextResponse.json(
      { error: 'Envie entre 1 e 5 imagens de referência' },
      { status: 400 }
    )
  }

  // Validar nome
  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Nome do estilo é obrigatório' },
      { status: 400 }
    )
  }

  try {
    // Validar créditos (criar estilo é mais caro)
    await validateCreditsForFeature(userId, 'recraft_style_creation', 10)

    // Upload imagens de referência para Vercel Blob (backup)
    const uploadedUrls = await Promise.all(
      images.map(img => uploadToBlob(img, `recraft-styles/${projectId}`))
    )

    // Criar estilo no Recraft API
    const client = new RecraftClient(process.env.RECRAFT_API_TOKEN!)
    const recraftStyle = await client.createStyle(images, styleFamily)

    // Salvar no banco
    const style = await db.recraftBrandStyle.create({
      data: {
        projectId,
        name: name.trim(),
        description: (formData.get('description') as string) || null,
        recraftStyleId: recraftStyle.id,
        referenceImages: uploadedUrls,
        styleFamily,
        createdBy: userId,
      }
    })

    // Deduzir créditos apenas após sucesso
    await deductCreditsForFeature(userId, 'recraft_style_creation', 10)

    return NextResponse.json(style, { status: 201 })

  } catch (error) {
    if (error instanceof RecraftAPIError) {
      console.error('[Recraft Style Creation Error]', error.statusCode, error.message)
      return NextResponse.json(
        { error: `Erro ao criar estilo: ${error.message}` },
        { status: error.statusCode >= 500 ? 502 : 400 }
      )
    }
    throw error
  }
}
```

**3.3 Brand Style Individual:** `src/app/api/projects/[projectId]/recraft-styles/[styleId]/route.ts`

```typescript
// GET - Detalhes do estilo
export async function GET(
  req: Request,
  { params }: { params: { projectId: string; styleId: string } }
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const style = await db.recraftBrandStyle.findFirst({
    where: {
      id: params.styleId,
      projectId: parseInt(params.projectId),
      isActive: true
    }
  })

  if (!style) {
    return NextResponse.json({ error: 'Estilo não encontrado' }, { status: 404 })
  }

  return NextResponse.json(style)
}

// DELETE - Soft delete (estilos não podem ser deletados no Recraft remotamente)
export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; styleId: string } }
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Validar acesso ao projeto
  await fetchProjectWithAccess(parseInt(params.projectId), { userId, orgId })

  // Soft delete - apenas marca como inativo
  // O estilo continua existindo no Recraft (não há API para deletar)
  await db.recraftBrandStyle.update({
    where: {
      id: params.styleId,
      projectId: parseInt(params.projectId)
    },
    data: { isActive: false }
  })

  return NextResponse.json({ success: true })
}

// PATCH - Atualizar estilo (nome, descrição, default)
export async function PATCH(
  req: Request,
  { params }: { params: { projectId: string; styleId: string } }
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = parseInt(params.projectId)
  await fetchProjectWithAccess(projectId, { userId, orgId })

  const body = await req.json()
  const { name, description, isDefault } = body

  // Se marcando como default, desmarcar outros
  if (isDefault) {
    await db.recraftBrandStyle.updateMany({
      where: { projectId, isDefault: true },
      data: { isDefault: false }
    })
  }

  const style = await db.recraftBrandStyle.update({
    where: { id: params.styleId, projectId },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(isDefault !== undefined && { isDefault })
    }
  })

  return NextResponse.json(style)
}
```

### Fase 4: TanStack Query Hooks

**`src/hooks/use-recraft-styles.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export function useRecraftStyles(projectId: number) {
  return useQuery({
    queryKey: ['recraft-styles', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/recraft-styles`),
    staleTime: 5 * 60_000,
  })
}

export function useCreateRecraftStyle(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (formData: FormData) =>
      api.postForm(`/api/projects/${projectId}/recraft-styles`, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recraft-styles', projectId] })
    },
  })
}

export function useDeleteRecraftStyle(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (styleId: string) =>
      api.delete(`/api/projects/${projectId}/recraft-styles/${styleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recraft-styles', projectId] })
      queryClient.invalidateQueries({ queryKey: ['recraft-default-style', projectId] })
    },
  })
}

// Hook para estilo default do projeto (com cache longo)
export function useDefaultRecraftStyle(projectId: number) {
  return useQuery({
    queryKey: ['recraft-default-style', projectId],
    queryFn: async () => {
      const styles = await api.get<RecraftBrandStyle[]>(`/api/projects/${projectId}/recraft-styles`)
      return styles.find(s => s.isDefault) || styles[0] || null
    },
    staleTime: 10 * 60_000, // 10 min cache (estilo default muda raramente)
  })
}

// Hook para definir estilo como default
export function useSetDefaultStyle(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (styleId: string) =>
      api.patch(`/api/projects/${projectId}/recraft-styles/${styleId}`, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recraft-styles', projectId] })
      queryClient.invalidateQueries({ queryKey: ['recraft-default-style', projectId] })
    },
  })
}
```

### Fase 5: UI Components

**`src/components/recraft/brand-style-manager.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRecraftStyles, useCreateRecraftStyle, useDeleteRecraftStyle } from '@/hooks/use-recraft-styles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Star } from 'lucide-react'

interface BrandStyleManagerProps {
  projectId: number
}

export function BrandStyleManager({ projectId }: BrandStyleManagerProps) {
  const { data: styles, isLoading } = useRecraftStyles(projectId)
  const createStyle = useCreateRecraftStyle(projectId)
  const deleteStyle = useDeleteRecraftStyle(projectId)

  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [images, setImages] = useState<File[]>([])

  const handleCreate = async () => {
    const formData = new FormData()
    formData.append('name', name)
    images.forEach(img => formData.append('images', img))

    await createStyle.mutateAsync(formData)
    setIsOpen(false)
    setName('')
    setImages([])
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Estilos da Marca</h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Novo Estilo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Estilo da Marca</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Nome do estilo"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={e => setImages(Array.from(e.target.files || []))}
              />
              <p className="text-sm text-muted-foreground">
                Selecione 3-5 imagens que representem o estilo visual da marca
              </p>
              <Button onClick={handleCreate} disabled={createStyle.isPending}>
                {createStyle.isPending ? 'Criando...' : 'Criar Estilo (10 créditos)'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {styles?.map(style => (
          <Card key={style.id} className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium">{style.name}</h4>
                <p className="text-xs text-muted-foreground">{style.styleFamily}</p>
              </div>
              <div className="flex gap-1">
                {style.isDefault && <Star className="w-4 h-4 text-yellow-500" />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteStyle.mutate(style.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-1 mt-2">
              {style.referenceImages.slice(0, 3).map((url, i) => (
                <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

---

## Arquivos a Criar/Modificar

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `prisma/schema.prisma` | Adicionar model RecraftBrandStyle + relação em Project |
| `src/lib/credits/feature-config.ts` | Adicionar custos recraft_generation e recraft_style_creation |

### Novos Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `src/lib/recraft/client.ts` | Cliente HTTP + classe RecraftAPIError |
| `src/lib/recraft/types.ts` | Interfaces TypeScript (abaixo) |
| `src/lib/recraft/brand-color-mapper.ts` | Mapear BrandColor para formato Recraft |
| `src/app/api/ai/recraft/generate/route.ts` | Endpoint de geração de imagem |
| `src/app/api/projects/[projectId]/recraft-styles/route.ts` | Listar e criar estilos |
| `src/app/api/projects/[projectId]/recraft-styles/[styleId]/route.ts` | GET, DELETE (soft), PATCH estilo |
| `src/hooks/use-recraft-styles.ts` | Hooks TanStack Query |
| `src/components/recraft/brand-style-manager.tsx` | UI de gestão de estilos |

### Types (`src/lib/recraft/types.ts`)

```typescript
import { RecraftStyleFamily } from '@prisma/client'

export interface GenerateParams {
  prompt: string
  model?: 'recraftv3' | 'recraft20b'
  style?: RecraftStyleFamily
  style_id?: string  // ID de estilo customizado (criado via /styles)
  size?: string      // Ex: '1024x1024'
  n?: number         // Número de imagens (1-6)
  negative_prompt?: string
  controls?: {
    colors?: Array<{ rgb: [number, number, number] }>
    background_color?: { rgb: [number, number, number] }
  }
}

export interface GenerateResponse {
  data: Array<{
    url: string
    // URLs expiram em ~24h
  }>
}

export interface CreateStyleParams {
  style: RecraftStyleFamily  // OBRIGATÓRIO
  files: File[]              // 1-5 imagens de referência
}

export interface CreateStyleResponse {
  id: string  // styleId para usar em gerações
}

export interface RecraftBrandStyleWithProject {
  id: string
  projectId: number
  name: string
  description: string | null
  recraftStyleId: string
  referenceImages: string[]
  styleFamily: RecraftStyleFamily
  isDefault: boolean
  isActive: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
```

---

## Variável de Ambiente

```env
RECRAFT_API_TOKEN=your_recraft_api_token_here
```

Obter em: https://www.recraft.ai/profile (requer saldo positivo de API units)

---

## Verificação / Como Testar

### 1. Testar Cliente API
```bash
# Após criar o cliente, testar no terminal
curl -X POST https://external.api.recraft.ai/v1/images/generations \
  -H "Authorization: Bearer $RECRAFT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test image", "style": "realistic_image"}'
```

### 2. Testar Geração com Cores
1. Ir em um projeto com cores cadastradas
2. Usar endpoint `/api/ai/recraft/generate` com `useBrandColors: true`
3. Verificar se a imagem gerada usa as cores da marca

### 3. Testar Brand Style Training
1. Ir em Projeto > Brand Styles
2. Clicar "Novo Estilo"
3. Upload de 3-5 imagens representativas
4. Verificar styleId criado
5. Gerar nova imagem usando o estilo

### 4. Testar Integração Completa
1. Cadastrar cores no projeto
2. Criar estilo da marca
3. Gerar imagem com:
   - Estilo da marca ativo
   - Cores da marca ativas
4. Verificar consistência visual

---

## Custos Estimados

| Operação | Custo Recraft | Créditos Internos |
|----------|---------------|-------------------|
| Geração de imagem | ~$0.04 | 4 créditos |
| Criar estilo customizado | ~$0.10 | 10 créditos |
| Vetorização (futuro) | ~$0.03 | 3 créditos |
| Remover fundo (futuro) | ~$0.02 | 2 créditos |

---

## Ordem de Implementação

1. **Infraestrutura Base**
   - Migração Prisma (enum + model RecraftBrandStyle)
   - `src/lib/recraft/types.ts`
   - `src/lib/recraft/client.ts` (com RecraftAPIError)
   - Atualizar `feature-config.ts` + enum OperationType

2. **Brand Color Integration**
   - `src/lib/recraft/brand-color-mapper.ts`
   - Testar conversão hex → RGB

3. **Endpoint de Geração**
   - `src/app/api/ai/recraft/generate/route.ts`
   - Testar com prompt simples
   - Testar com cores da marca

4. **Endpoints de Estilos**
   - `src/app/api/projects/[projectId]/recraft-styles/route.ts` (GET, POST)
   - `src/app/api/projects/[projectId]/recraft-styles/[styleId]/route.ts` (GET, DELETE, PATCH)
   - Validação de 1-5 imagens
   - Soft delete

5. **Hooks TanStack Query**
   - `useRecraftStyles` (query)
   - `useCreateRecraftStyle` (mutation)
   - `useDeleteRecraftStyle` (mutation)
   - `useDefaultRecraftStyle` (query com cache longo)
   - `useSetDefaultStyle` (mutation)

6. **UI Components**
   - `BrandStyleManager` component
   - Preview de imagens antes de criar
   - Indicador de estilo default

7. **Integração com UI Existente**
   - Adicionar Recraft ao seletor de modelos
   - Toggle "Usar estilo da marca"
   - Toggle "Usar cores da marca"

8. **Testes E2E**
   - Criar estilo com 3 imagens
   - Gerar imagem usando estilo + cores
   - Verificar consistência visual

---

## Melhorias de Resiliência

### Fallback para Outros Providers

Se a API Recraft falhar, ter fallback automático:

```typescript
// src/lib/recraft/client.ts
export async function generateWithFallback(
  params: GenerateParams,
  fallbackToReplicate = true
): Promise<GenerateResponse> {
  const recraftClient = new RecraftClient(process.env.RECRAFT_API_TOKEN!)

  try {
    return await recraftClient.generateImage(params)
  } catch (error) {
    // Fallback apenas para erros de servidor (503, 500, etc)
    if (
      fallbackToReplicate &&
      error instanceof RecraftAPIError &&
      error.statusCode >= 500
    ) {
      console.warn('[Recraft Fallback] Usando Replicate como fallback')

      // Adaptar parâmetros para Replicate (já existente no sistema)
      const replicateParams = adaptParamsForReplicate(params)
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

      const output = await replicate.run(
        'recraft-ai/recraft-v3:...',
        { input: replicateParams }
      )

      // Normalizar resposta
      return {
        data: [{ url: Array.isArray(output) ? output[0] : output }]
      }
    }
    throw error
  }
}

function adaptParamsForReplicate(params: GenerateParams) {
  return {
    prompt: params.prompt,
    style: params.style,
    size: params.size,
    // Replicate não suporta style_id customizado
    // Replicate não suporta color controls
  }
}
```

### Rate Limiting e Retry

```typescript
// src/lib/recraft/client.ts
import pRetry from 'p-retry'

async generateImage(params: GenerateParams): Promise<GenerateResponse> {
  return pRetry(
    async () => {
      const response = await fetch(`${RECRAFT_API_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })

      // Retry apenas em rate limit (429) ou server error (5xx)
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retry-able error: ${response.status}`)
      }

      return this.handleResponse<GenerateResponse>(response)
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
      onFailedAttempt: (error) => {
        console.warn(`[Recraft] Tentativa ${error.attemptNumber} falhou. Tentando novamente...`)
      },
    }
  )
}
```

---

## Futuras Expansões (Pós-MVP)

- **Vector Asset Factory**: Geração de ícones/elementos SVG
- **Background Studio**: Troca/geração de fundos
- **Integração com Templates**: Background generator no creative workflow
- **Upscaling**: Melhorar resolução de imagens existentes
- **Inpainting**: Edição localizada de imagens
