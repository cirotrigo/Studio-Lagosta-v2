---
status: active
generated: 2026-02-20
agents:
  - type: "bug-fixer"
    role: "Corrigir problemas no upload local de imagens"
  - type: "test-writer"
    role: "Criar testes para validação de uploads"
phases:
  - id: "phase-1"
    name: "Análise e Correções Críticas"
    prevc: "P"
  - id: "phase-2"
    name: "Melhorias de Performance e UX"
    prevc: "E"
  - id: "phase-3"
    name: "Testes e Validação"
    prevc: "V"
---

# Correção de Upload Local de Imagens para Geração de IA

> Corrigir problemas identificados no fluxo de upload local de imagens de referência para geração de IA, melhorando confiabilidade, performance e experiência do usuário.

## Problemas Identificados

### 🔴 CRÍTICOS (Causam falhas)

1. **Falta de tratamento de erros individual**
   - Se arquivo 2 de 3 falha, toda geração é abortada
   - Usuário não sabe qual arquivo causou o problema
   - Localização: `ai-images-panel.tsx:826-843`

2. **Falta de timeout nas requisições**
   - Upload pode ficar pendurado indefinidamente
   - Sem feedback visual de quanto tempo falta
   - Localização: `ImageUploadTab` e `GenerateImageForm`

3. **Validação de URL sem verificação**
   - API `/api/upload` pode retornar URL inválida em caso de erro
   - URL inválida é enviada para o modelo sem validação
   - Localização: `ai-images-panel.tsx:840`

### 🟡 IMPORTANTES (Causam experiência ruim)

4. **Validação de cliente insuficiente**
   - Apenas valida `file.type` (pode ser falseado)
   - Não valida magic bytes, extensão real, dimensões
   - Localização: `ai-images-panel.tsx:896-910`

5. **Race conditions no upload**
   - Upload sequencial é muito lento (3 imagens = 3x tempo)
   - `Promise.all()` seria mais eficiente
   - Localização: `ai-images-panel.tsx:826-843`

6. **Memory leak com URL.createObjectURL()**
   - URLs de preview não são revogadas ao trocar arquivos
   - Pode causar consumo excessivo de memória
   - Localização: `ai-images-panel.tsx:712-727`

### 🟢 MELHORIAS (Segurança e validação)

7. **Falta de validação de conteúdo no backend**
   - `/api/upload` não valida magic bytes
   - Arquivo `.jpg` pode ser executável renomeado
   - Localização: `src/app/api/upload/route.ts`

## Impacto no Usuário

| Problema | Frequência | Impacto |
|----------|-----------|---------|
| Erro em 1 arquivo aborta todos | Alta | Frustração: perde progresso, não sabe qual arquivo |
| Timeout indefinido | Média | Usuário não sabe se travou ou está processando |
| Upload lento (sequencial) | Alta | 3 imagens = 15-30s vs 5-10s em paralelo |
| Memory leak | Baixa | Pode travar navegador após muitos uploads |
| Arquivo malicioso aceito | Muito baixa | Risco de segurança |

## Arquitetura Atual

### Fluxo de Upload Local (Problemático)

```
┌─────────────────────────────────────────────────────────┐
│ UPLOAD LOCAL - ESTADO ATUAL                             │
└─────────────────────────────────────────────────────────┘

1. SELEÇÃO
   ├─ handleFileSelect(files)
   ├─ Valida apenas: file.type.startsWith('image/')
   ├─ Valida tamanho: file.size <= 10MB
   └─ setLocalFiles([...prev, ...files])

2. PREVIEW
   ├─ Para cada arquivo: URL.createObjectURL(file)
   └─ ❌ URLs nunca são revogadas (memory leak)

3. UPLOAD NA GERAÇÃO (SEQUENCIAL)
   for (const file of localFiles) {
     const response = await fetch('/api/upload', {
       method: 'POST',
       body: formData
     })
     ❌ Se falha, aborta tudo
     ❌ Sem timeout
     ❌ Sem retry individual

     const { url } = await response.json()
     ❌ Não valida se URL é válida

     localFileUrls.push(url)
   }

4. GERAÇÃO
   └─ POST /api/ai/generate-image { referenceImages: localFileUrls }
```

### Fluxo Desejado (Corrigido)

```
┌─────────────────────────────────────────────────────────┐
│ UPLOAD LOCAL - MELHORADO                                │
└─────────────────────────────────────────────────────────┘

1. VALIDAÇÃO COMPLETA
   ├─ MIME type + extensão + magic bytes
   ├─ Dimensões mínimas (ex: 64x64)
   ├─ Tamanho: 100KB - 10MB
   └─ Reject com mensagem específica por arquivo

2. PREVIEW COM CLEANUP
   ├─ const objectUrl = URL.createObjectURL(file)
   ├─ Armazenar em Map<File, ObjectUrl>
   └─ useEffect cleanup: URL.revokeObjectURL(url)

3. UPLOAD PARALELO COM RETRY
   const results = await Promise.allSettled(
     localFiles.map(file =>
       uploadWithRetry(file, {
         timeout: 30000,
         maxRetries: 2
       })
     )
   )

   ├─ Sucessos: adicionar URLs
   ├─ Falhas: mostrar quais arquivos falharam
   └─ Permitir continuar com arquivos bem-sucedidos

4. VALIDAÇÃO DE URLs
   ├─ Verificar formato (https://...)
   ├─ HEAD request para confirmar acessibilidade
   └─ Fallback: remover URL inválida e alertar
```

## Fases de Implementação

### Phase 1 — Análise e Correções Críticas

**Objetivo:** Corrigir problemas que causam falhas totais

#### **Step 1.1: Tratamento Individual de Erros**

**Arquivo:** `src/components/templates/sidebar/ai-images-panel.tsx`

```typescript
// ANTES (linha ~826)
for (const file of localFiles) {
  const uploadResponse = await fetch('/api/upload', {...})
  if (!uploadResponse.ok) {
    throw new Error('Falha ao fazer upload da imagem local')
  }
  const { url } = await uploadResponse.json()
  localFileUrls.push(url)
}

// DEPOIS
interface UploadResult {
  success: boolean
  url?: string
  fileName: string
  error?: string
}

const uploadResults = await Promise.allSettled(
  localFiles.map(async (file): Promise<UploadResult> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'reference')

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000) // 30s timeout
      })

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text()
        return { success: false, fileName: file.name, error }
      }

      const { url } = await uploadResponse.json()

      // Validar URL retornada
      if (!url || !url.startsWith('https://')) {
        return {
          success: false,
          fileName: file.name,
          error: 'URL inválida retornada'
        }
      }

      return { success: true, url, fileName: file.name }

    } catch (error) {
      return {
        success: false,
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }
    }
  })
)

// Processar resultados
const successful = uploadResults
  .filter((r): r is PromiseFulfilledResult<UploadResult> =>
    r.status === 'fulfilled' && r.value.success
  )
  .map(r => r.value.url!)

const failed = uploadResults
  .filter((r): r is PromiseFulfilledResult<UploadResult> =>
    r.status === 'fulfilled' && !r.value.success
  )
  .map(r => r.value)

// Mostrar feedback
if (failed.length > 0) {
  toast.error(
    `${failed.length} arquivo(s) falharam: ${failed.map(f => f.fileName).join(', ')}`,
    { description: 'Continuando com os arquivos bem-sucedidos' }
  )
}

if (successful.length === 0) {
  throw new Error('Todos os uploads falharam')
}

localFileUrls = successful
```

#### **Step 1.2: Validação de URL e Acessibilidade**

**Arquivo:** `src/components/templates/sidebar/ai-images-panel.tsx`

```typescript
// Criar helper para validar URLs antes de enviar ao modelo
async function validateImageUrl(url: string): Promise<boolean> {
  try {
    // Validação básica de formato
    if (!url.startsWith('https://')) return false

    // HEAD request para verificar se imagem existe e é acessível
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) return false

    // Verificar content-type
    const contentType = response.headers.get('content-type')
    if (!contentType?.startsWith('image/')) return false

    return true
  } catch {
    return false
  }
}

// Usar antes de enviar para geração
const validatedUrls = await Promise.all(
  allImageUrls.map(async url => ({
    url,
    valid: await validateImageUrl(url)
  }))
)

const validUrls = validatedUrls
  .filter(item => item.valid)
  .map(item => item.url)

const invalidUrls = validatedUrls
  .filter(item => !item.valid)
  .map(item => item.url)

if (invalidUrls.length > 0) {
  toast.warning(`${invalidUrls.length} imagem(ns) de referência inacessível(is)`)
}
```

#### **Step 1.3: Timeout em Todas Requisições**

**Arquivo:** `src/components/templates/sidebar/image-upload-tab.tsx`

```typescript
// ANTES
const uploadResponse = await fetch('/api/upload', {
  method: 'POST',
  body: formData
})

// DEPOIS
const uploadResponse = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  signal: AbortSignal.timeout(30000) // 30 segundos
})
```

**Adicionar em todos os `fetch()` do componente AIImagesPanel**

---

### Phase 2 — Melhorias de Performance e UX

**Objetivo:** Melhorar velocidade e prevenir memory leaks

#### **Step 2.1: Upload Paralelo com Progresso**

**Arquivo:** `src/components/templates/sidebar/ai-images-panel.tsx`

```typescript
// Estado para progresso
const [uploadProgress, setUploadProgress] = useState<{
  current: number
  total: number
  fileName: string
}>({ current: 0, total: 0, fileName: '' })

// Helper com retry
async function uploadWithRetry(
  file: File,
  maxRetries = 2
): Promise<UploadResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      setUploadProgress(prev => ({
        ...prev,
        fileName: file.name
      }))

      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'reference')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000)
      })

      if (!response.ok) {
        if (attempt === maxRetries) {
          const error = await response.text()
          return { success: false, fileName: file.name, error }
        }
        // Retry após delay
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        continue
      }

      const { url } = await response.json()
      return { success: true, url, fileName: file.name }

    } catch (error) {
      if (attempt === maxRetries) {
        return {
          success: false,
          fileName: file.name,
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }

  return { success: false, fileName: file.name, error: 'Max retries exceeded' }
}

// Upload paralelo
setUploadProgress({ current: 0, total: localFiles.length, fileName: '' })

const uploadResults = await Promise.allSettled(
  localFiles.map((file, index) =>
    uploadWithRetry(file).then(result => {
      setUploadProgress(prev => ({
        ...prev,
        current: prev.current + 1
      }))
      return result
    })
  )
)
```

**UI de Progresso:**

```tsx
{uploadProgress.total > 0 && (
  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Fazendo upload: {uploadProgress.fileName}
      </span>
      <span className="font-medium">
        {uploadProgress.current}/{uploadProgress.total}
      </span>
    </div>
    <Progress
      value={(uploadProgress.current / uploadProgress.total) * 100}
    />
  </div>
)}
```

#### **Step 2.2: Limpeza de Memory Leak**

**Arquivo:** `src/components/templates/sidebar/ai-images-panel.tsx`

```typescript
// ANTES
const [localFiles, setLocalFiles] = useState<File[]>([])
// Preview direto com URL.createObjectURL() sem cleanup

// DEPOIS
interface FileWithPreview {
  file: File
  previewUrl: string
}

const [localFilesWithPreviews, setLocalFilesWithPreviews] = useState<FileWithPreview[]>([])

// Helper para criar preview
function createFilePreview(file: File): FileWithPreview {
  return {
    file,
    previewUrl: URL.createObjectURL(file)
  }
}

// Ao adicionar arquivos
const handleFileSelect = (files: File[]) => {
  const newPreviews = files.map(createFilePreview)
  setLocalFilesWithPreviews(prev => [...prev, ...newPreviews])
}

// Cleanup ao remover ou trocar de modo
useEffect(() => {
  return () => {
    // Revogar todas as URLs ao desmontar
    localFilesWithPreviews.forEach(item => {
      URL.revokeObjectURL(item.previewUrl)
    })
  }
}, [localFilesWithPreviews])

// Ao remover arquivo individual
const removeLocalFile = (index: number) => {
  const removed = localFilesWithPreviews[index]
  URL.revokeObjectURL(removed.previewUrl)

  setLocalFilesWithPreviews(prev =>
    prev.filter((_, i) => i !== index)
  )
}

// Ao trocar de modo
useEffect(() => {
  if (previousMode.current === 'edit' && mode === 'generate') {
    // Limpar previews antigos
    localFilesWithPreviews.forEach(item => {
      URL.revokeObjectURL(item.previewUrl)
    })
    setLocalFilesWithPreviews([])
  }
}, [mode])
```

#### **Step 2.3: Validação Completa de Arquivos**

**Criar helper:** `src/lib/images/validate-image-file.ts`

```typescript
// Magic bytes para validação real de tipo de arquivo
const IMAGE_SIGNATURES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // + "WEBP" em offset 8
  'image/gif': [0x47, 0x49, 0x46],
} as const

interface ValidationResult {
  valid: boolean
  error?: string
  detectedType?: string
}

export async function validateImageFile(file: File): Promise<ValidationResult> {
  // 1. Validar extensão
  const extension = file.name.split('.').pop()?.toLowerCase()
  const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif']

  if (!extension || !validExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Extensão inválida. Aceito: ${validExtensions.join(', ')}`
    }
  }

  // 2. Validar tamanho
  const minSize = 100 * 1024 // 100KB
  const maxSize = 10 * 1024 * 1024 // 10MB

  if (file.size < minSize) {
    return { valid: false, error: 'Arquivo muito pequeno (mín 100KB)' }
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'Arquivo muito grande (máx 10MB)' }
  }

  // 3. Validar magic bytes
  try {
    const buffer = await file.slice(0, 12).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    let detectedType: string | undefined

    for (const [type, signature] of Object.entries(IMAGE_SIGNATURES)) {
      if (signature.every((byte, i) => bytes[i] === byte)) {
        detectedType = type
        break
      }
    }

    if (!detectedType) {
      return { valid: false, error: 'Arquivo não é uma imagem válida' }
    }

    // 4. Validar que tipo detectado combina com MIME type
    if (file.type !== detectedType && file.type !== '') {
      return {
        valid: false,
        error: `Tipo declarado (${file.type}) não corresponde ao conteúdo (${detectedType})`
      }
    }

    // 5. Validar dimensões
    const img = new Image()
    const url = URL.createObjectURL(file)

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Falha ao carregar imagem'))
      }
      img.src = url
    })

    const minDimension = 64
    const maxDimension = 8192

    if (dimensions.width < minDimension || dimensions.height < minDimension) {
      return { valid: false, error: `Dimensões muito pequenas (mín ${minDimension}x${minDimension}px)` }
    }

    if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
      return { valid: false, error: `Dimensões muito grandes (máx ${maxDimension}x${maxDimension}px)` }
    }

    return { valid: true, detectedType }

  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Erro ao validar arquivo'
    }
  }
}
```

**Usar no handleFileSelect:**

```typescript
const handleFileSelect = async (files: FileList | File[]) => {
  const filesArray = Array.from(files)

  // Validar todos os arquivos
  const validationResults = await Promise.all(
    filesArray.map(async file => ({
      file,
      validation: await validateImageFile(file)
    }))
  )

  // Separar válidos e inválidos
  const valid = validationResults.filter(r => r.validation.valid)
  const invalid = validationResults.filter(r => !r.validation.valid)

  // Mostrar erros
  if (invalid.length > 0) {
    invalid.forEach(({ file, validation }) => {
      toast.error(`${file.name}: ${validation.error}`)
    })
  }

  // Adicionar apenas válidos
  if (valid.length > 0) {
    const newPreviews = valid.map(({ file }) => createFilePreview(file))
    setLocalFilesWithPreviews(prev => [...prev, ...newPreviews])
  }
}
```

---

### Phase 3 — Testes e Validação

**Objetivo:** Criar testes para cobrir todos os fluxos de upload

#### **Step 3.1: Testes Unitários de Validação**

**Arquivo:** `tests/lib/validate-image-file.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { validateImageFile } from '@/lib/images/validate-image-file'

describe('validateImageFile', () => {
  it('deve aceitar JPEG válido', async () => {
    const file = new File(
      [new Uint8Array([0xFF, 0xD8, 0xFF, ...])], // JPEG bytes
      'test.jpg',
      { type: 'image/jpeg' }
    )

    const result = await validateImageFile(file)
    expect(result.valid).toBe(true)
  })

  it('deve rejeitar arquivo com extensão inválida', async () => {
    const file = new File([new Uint8Array([])], 'test.exe')

    const result = await validateImageFile(file)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Extensão inválida')
  })

  it('deve rejeitar arquivo muito pequeno', async () => {
    const file = new File([new Uint8Array(50)], 'test.jpg') // 50 bytes

    const result = await validateImageFile(file)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('muito pequeno')
  })

  it('deve rejeitar arquivo muito grande', async () => {
    const file = new File(
      [new Uint8Array(11 * 1024 * 1024)], // 11MB
      'test.jpg'
    )

    const result = await validateImageFile(file)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('muito grande')
  })

  it('deve detectar tipo incompatível', async () => {
    // Arquivo PNG com extensão .jpg
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4E, 0x47, ...])], // PNG bytes
      'test.jpg',
      { type: 'image/jpeg' }
    )

    const result = await validateImageFile(file)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('não corresponde')
  })
})
```

#### **Step 3.2: Testes E2E de Upload**

**Arquivo:** `tests/e2e/image-upload.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Upload de imagens para geração de IA', () => {
  test.beforeEach(async ({ page }) => {
    // Login e navegar para editor
    await page.goto('/templates/123/editor')
    await page.click('[data-testid="ai-images-tab"]')
  })

  test('deve fazer upload de imagem local com sucesso', async ({ page }) => {
    // Selecionar arquivo
    await page.setInputFiles(
      'input[type="file"]',
      'tests/fixtures/valid-image.jpg'
    )

    // Verificar preview
    await expect(page.locator('[data-testid="image-preview"]')).toBeVisible()

    // Gerar imagem
    await page.fill('[data-testid="prompt-input"]', 'Um gato bonito')
    await page.click('[data-testid="generate-button"]')

    // Aguardar sucesso
    await expect(page.locator('text=Imagem gerada com sucesso')).toBeVisible()
  })

  test('deve rejeitar arquivo inválido', async ({ page }) => {
    await page.setInputFiles(
      'input[type="file"]',
      'tests/fixtures/invalid-file.txt'
    )

    await expect(page.locator('text=Extensão inválida')).toBeVisible()
  })

  test('deve fazer upload de múltiplas imagens em paralelo', async ({ page }) => {
    await page.setInputFiles('input[type="file"]', [
      'tests/fixtures/image1.jpg',
      'tests/fixtures/image2.png',
      'tests/fixtures/image3.webp'
    ])

    // Verificar 3 previews
    await expect(page.locator('[data-testid="image-preview"]')).toHaveCount(3)

    // Verificar progresso
    await page.fill('[data-testid="prompt-input"]', 'Teste')
    await page.click('[data-testid="generate-button"]')

    // Aguardar indicador de progresso
    await expect(page.locator('text=Fazendo upload:')).toBeVisible()
    await expect(page.locator('text=3/3')).toBeVisible()
  })

  test('deve continuar se um arquivo falhar', async ({ page }) => {
    // Mock de API que falha no segundo arquivo
    await page.route('/api/upload', async (route, request) => {
      const data = await request.postDataJSON()
      if (data.fileName === 'image2.jpg') {
        route.fulfill({ status: 500, body: 'Upload failed' })
      } else {
        route.continue()
      }
    })

    await page.setInputFiles('input[type="file"]', [
      'tests/fixtures/image1.jpg',
      'tests/fixtures/image2.jpg',
      'tests/fixtures/image3.jpg'
    ])

    await page.fill('[data-testid="prompt-input"]', 'Teste')
    await page.click('[data-testid="generate-button"]')

    // Deve mostrar erro mas continuar com outros
    await expect(page.locator('text=1 arquivo(s) falharam: image2.jpg')).toBeVisible()
    await expect(page.locator('text=Continuando com os arquivos bem-sucedidos')).toBeVisible()
  })

  test('deve fazer upload via Google Drive', async ({ page }) => {
    await page.click('[data-testid="select-from-drive"]')

    // Modal do Drive abre
    await expect(page.locator('[data-testid="drive-modal"]')).toBeVisible()

    // Selecionar imagem
    await page.click('[data-testid="drive-item-123"]')
    await page.click('[data-testid="confirm-selection"]')

    // Verificar preview
    await expect(page.locator('[data-testid="drive-image-preview"]')).toBeVisible()
  })

  test('deve fazer upload combinado (local + Drive)', async ({ page }) => {
    // Upload local
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/image1.jpg')

    // Adicionar do Drive
    await page.click('[data-testid="select-from-drive"]')
    await page.click('[data-testid="drive-item-456"]')
    await page.click('[data-testid="confirm-selection"]')

    // Verificar 2 previews
    await expect(page.locator('[data-testid="reference-images"]')).toHaveCount(2)
  })

  test('deve limpar memória ao remover imagens', async ({ page }) => {
    // Upload múltiplas imagens
    await page.setInputFiles('input[type="file"]', [
      'tests/fixtures/image1.jpg',
      'tests/fixtures/image2.jpg'
    ])

    // Capturar uso de memória inicial
    const initialMemory = await page.evaluate(() => performance.memory.usedJSHeapSize)

    // Remover todas as imagens
    await page.click('[data-testid="remove-all-references"]')

    // Aguardar GC
    await page.waitForTimeout(1000)

    // Verificar memória foi liberada (aproximadamente)
    const finalMemory = await page.evaluate(() => performance.memory.usedJSHeapSize)
    expect(finalMemory).toBeLessThan(initialMemory * 1.1) // Máx 10% acima
  })
})
```

#### **Step 3.3: Testes de API Backend**

**Arquivo:** `tests/api/upload.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/upload/route'

describe('POST /api/upload', () => {
  it('deve aceitar imagem válida', async () => {
    const formData = new FormData()
    formData.append('file', new File([...], 'test.jpg', { type: 'image/jpeg' }))

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.url).toMatch(/^https:\/\//)
  })

  it('deve rejeitar arquivo muito grande', async () => {
    const largeFile = new File(
      [new Uint8Array(101 * 1024 * 1024)], // 101MB
      'large.jpg',
      { type: 'image/jpeg' }
    )

    const formData = new FormData()
    formData.append('file', largeFile)

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('deve validar magic bytes', async () => {
    // Arquivo .jpg que é na verdade um .txt
    const fakeImage = new File(
      [new TextEncoder().encode('This is not an image')],
      'fake.jpg',
      { type: 'image/jpeg' }
    )

    const formData = new FormData()
    formData.append('file', fakeImage)

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('não é uma imagem válida')
  })
})
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/templates/sidebar/ai-images-panel.tsx` | **MODIFICAR** | Correções principais de upload e tratamento de erros |
| `src/components/templates/sidebar/image-upload-tab.tsx` | **MODIFICAR** | Adicionar timeout e validação |
| `src/lib/images/validate-image-file.ts` | **CRIAR** | Helper de validação completa |
| `src/app/api/upload/route.ts` | **MODIFICAR** | Validar magic bytes no backend |
| `tests/lib/validate-image-file.test.ts` | **CRIAR** | Testes unitários |
| `tests/e2e/image-upload.spec.ts` | **CRIAR** | Testes end-to-end |
| `tests/api/upload.test.ts` | **CRIAR** | Testes de API |

## Checklist de Validação

### Correções Críticas
- [ ] Upload individual não aborta toda geração em caso de erro
- [ ] Timeout de 30s em todas as requisições de upload
- [ ] URLs retornadas são validadas antes de envio ao modelo
- [ ] Mensagens de erro específicas por arquivo

### Performance e UX
- [ ] Upload paralelo com `Promise.allSettled()`
- [ ] Indicador de progresso visual (X/Y arquivos)
- [ ] Retry automático (2 tentativas) com backoff
- [ ] Cleanup de `URL.createObjectURL()` previne memory leak

### Validação Completa
- [ ] Magic bytes validados (client e server)
- [ ] Extensão e MIME type verificados
- [ ] Dimensões validadas (64x64 mín, 8192x8192 máx)
- [ ] Tamanho validado (100KB - 10MB)

### Testes
- [ ] Testes unitários de validação (8+ casos)
- [ ] Testes E2E de upload local
- [ ] Testes E2E de upload Drive
- [ ] Testes E2E de upload combinado
- [ ] Testes de memory leak
- [ ] Testes de API backend

## Métricas de Sucesso

| Métrica | Antes | Depois (Meta) |
|---------|-------|---------------|
| Taxa de falha total por 1 arquivo | 100% | 0% |
| Tempo upload 3 imagens | 15-30s | 5-10s |
| Memory leak após 10 uploads | ~50MB | <5MB |
| Falsos positivos de validação | ~5% | <1% |
| Feedback de erro útil | 20% | 95% |

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Validação muito rigorosa rejeita imagens válidas | Médio | Testes extensivos com imagens reais |
| Upload paralelo sobrecarrega servidor | Baixo | Limit de 5 uploads simultâneos |
| Mudança quebra fluxo Drive existente | Alto | Testes E2E completos antes de deploy |
| Validação de magic bytes falha em alguns formatos | Médio | Fallback para validação apenas de extensão |

## Dependências

- Nenhuma nova dependência necessária
- Usa APIs nativas: `AbortSignal.timeout()`, `Promise.allSettled()`, `URL.createObjectURL()`
- Requer Node.js 18+ (para `AbortSignal.timeout()`)

## Rollout Sugerido

1. **Deploy em staging**: Testar com usuários internos por 1 semana
2. **Feature flag**: Ativar para 10% dos usuários por 3 dias
3. **Monitorar métricas**: Taxa de erro, tempo de upload, feedback
4. **Rollout completo**: 100% após validação
