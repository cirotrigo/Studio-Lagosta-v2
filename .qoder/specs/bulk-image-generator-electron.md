# Especificação: Geração de Imagens em Massa (Electron App)

> **Versão**: 2.1
> **Data**: 2026-03-21
> **Status**: Aprovado para implementação

---

## 1. Visão Geral

### 1.1 Objetivo
Criar uma página dedicada no app Electron para geração de múltiplas imagens com IA, permitindo que o usuário adicione várias solicitações a uma fila e acompanhe o progresso em tempo real.

### 1.2 Fluxo Principal
```
Usuário configura imagem → Adiciona à fila → Sistema processa em background →
Imagem salva no Drive IA → Aparece na aba "Geradas com IA"
```

### 1.3 Filosofia de Design
- **Premium, não utilitário**: Interface limpa que parece um produto profissional
- **Progressive Disclosure**: Mostrar o essencial, esconder complexidade em accordions
- **Zero Friction com Drive**: Picker visual integrado com cache, sem copiar/colar URLs
- **Bulk de verdade**: Batches visuais e variáveis dinâmicas no prompt

---

## 2. Arquitetura

### 2.1 Estrutura de Arquivos
```
src/
├── pages/
│   └── bulk-image-generator/
│       ├── index.tsx                    # Página principal
│       ├── components/
│       │   ├── PromptInput.tsx          # Campo hero com IA integrada
│       │   ├── ReferenceImagesSection.tsx   # Grid + tabs (recentes/drive/local)
│       │   ├── DriveImagePicker.tsx     # Modal explorador do Drive
│       │   ├── RefreshButton.tsx        # Botão atualizar cache
│       │   ├── AdvancedSettings.tsx     # Accordion colapsável
│       │   ├── QueueDrawer.tsx          # Painel lateral retrátil
│       │   ├── QueueBatchItem.tsx       # Grupo de imagens (lote)
│       │   ├── QueueSingleItem.tsx      # Item individual
│       │   ├── ProcessingIndicator.tsx  # Indicador global compacto
│       │   └── OfflineBanner.tsx        # Banner de conexão perdida
│       ├── hooks/
│       │   ├── useImageQueue.ts         # Gerenciamento da fila
│       │   ├── useQueueProcessor.ts     # Processamento automático
│       │   ├── useQueuePersistence.ts   # Persistência local
│       │   ├── useDriveCache.ts         # Cache de pastas do Drive
│       │   ├── useDrivePicker.ts        # Integração Drive visual
│       │   ├── usePromptVariables.ts    # Parser de variáveis {}
│       │   └── useNetworkStatus.ts      # Detector online/offline
│       └── utils/
│           └── prompt-parser.ts         # Expande variáveis em múltiplos prompts
├── lib/
│   └── queue/
│       ├── queue-manager.ts             # Core do sistema de fila
│       ├── queue-storage.ts             # Armazenamento local (electron-store)
│       └── types.ts                     # Tipos TypeScript
└── store/
    └── image-queue-store.ts             # Estado global (Zustand)
```

### 2.2 Dependências
- **Zustand**: Estado global da fila
- **electron-store**: Persistência local da fila e cache
- **uuid**: IDs únicos para itens da fila
- **framer-motion**: Animações e micro-interações
- **@tanstack/react-virtual**: Virtualização para filas grandes (>50 itens)
- **date-fns**: Formatação de datas (timeAgo)

---

## 3. Modelo de Dados

### 3.1 QueueItem
```typescript
interface QueueItem {
  id: string
  batchId?: string              // Se faz parte de um lote
  batchIndex?: number           // Posição no lote (1 de 2)
  status: QueueItemStatus
  priority: number
  createdAt: string
  startedAt?: string
  completedAt?: string

  request: {
    prompt: string
    originalPrompt?: string     // Prompt antes de expandir variáveis
    improvedPrompt?: string
    model: AIImageModel
    aspectRatio: AspectRatio
    resolution: ImageResolution
    referenceImages: ReferenceImage[]
  }

  result?: {
    imageId: string
    fileUrl: string
    thumbnailUrl: string
    creditsUsed: number
  }

  error?: {
    code: string
    message: string
    retryable: boolean
  }

  attempts: number
  maxAttempts: number           // Default: 3
  nextRetryAt?: string
}

type QueueItemStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
type AIImageModel = 'nano-banana-2' | 'nano-banana-pro'
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:5'
type ImageResolution = '1K' | '2K' | '4K'
```

### 3.2 QueueBatch
```typescript
interface QueueBatch {
  id: string
  name: string                  // Ex: "Variações: Gato cyberpunk"
  originalPrompt: string        // Prompt com variáveis
  itemIds: string[]
  createdAt: string

  progress: {
    total: number
    completed: number
    failed: number
    processing: number
  }
}
```

### 3.3 ReferenceImage
```typescript
interface ReferenceImage {
  id: string
  url: string
  thumbnailUrl: string
  source: 'drive' | 'local' | 'generated' | 'recent'
  driveFileId?: string
  name?: string
  addedAt: string
}
```

### 3.4 QueueState
```typescript
interface QueueState {
  items: QueueItem[]
  batches: QueueBatch[]

  isProcessing: boolean
  isPaused: boolean
  pauseReason?: 'manual' | 'offline' | 'no_credits' | 'rate_limit'
  concurrency: number

  isDrawerOpen: boolean
  selectedItemId?: string

  stats: {
    pending: number
    processing: number
    completed: number
    failed: number
    totalCreditsUsed: number
  }

  settings: {
    autoRetry: boolean
    retryDelayMs: number
    persistQueue: boolean
    notifyOnComplete: boolean
    notifyOnBatchComplete: boolean
    maxConcurrency: number        // 1-5, default 2
    autoCleanCompletedAfterHours: number  // default 24
  }

  recentReferenceImages: ReferenceImage[]  // Últimas 20 usadas
}
```

### 3.5 DriveFolderCache
```typescript
interface DriveFolderCache {
  folderId: string
  files: DriveFile[]
  cachedAt: string
  expiresAt: string       // Cache válido por 30 min
}

interface DrivePickerState {
  folderCache: Record<string, DriveFolderCache>
  lastVisitedFolderId?: string
  viewMode: 'grid' | 'list'
}
```

---

## 4. Interface do Usuário

### 4.1 Layout Principal (Split-Pane Dinâmico)
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Geração em Massa                       [🔔 3/10] [⚙️]  │ ≡ Fila │
├─────────────────────────────────────────────────────────┬───────────────┤
│                                                         │               │
│   ┌─────────────────────────────────────────────────┐  │  QUEUE DRAWER │
│   │                                                 │  │  (retrátil)   │
│   │  Descreva a imagem que você quer criar...      │  │               │
│   │                                                 │  │  ┌───────────┐│
│   │  Um {gato, cachorro} cyberpunk em neon_        │  │  │ Lote 1    ││
│   │                                           [✨]  │  │  │ 2/2 ✓    ││
│   └─────────────────────────────────────────────────┘  │  └───────────┘│
│                                                         │  ┌───────────┐│
│   Imagens de Referência (3 de 14)                      │  │ Item solo ││
│   ┌──────────────────────────────────────────────┐    │  │ ⏳ 45%    ││
│   │ RECENTES │ DRIVE │ LOCAL │                   │    │  └───────────┘│
│   ├──────────────────────────────────────────────┤    │               │
│   │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │    │  [Limpar ✓]  │
│   │ │ 📷 │ │ 📷 │ │ 📷 │ │ +  │ │    │         │    │               │
│   │ │ ✓  │ │ ✓  │ │ ✓  │ │    │ │    │         │    │               │
│   │ └────┘ └────┘ └────┘ └────┘ └────┘         │    │               │
│   └──────────────────────────────────────────────┘    │               │
│                                                         │               │
│   ▶ Configurações Avançadas                            │               │
│                                                         │               │
│   Créditos: ~15 por imagem                             │               │
│                                                         │               │
│   [ ➕ Adicionar à Fila ]  [ ➕ Gerar 2 Variações ]    │               │
│                                                         │               │
└─────────────────────────────────────────────────────────┴───────────────┘
```

### 4.2 DriveImagePicker (Modal com Cache)
```
┌─────────────────────────────────────────────────────────────┐
│  Selecionar do Google Drive                          [✕]   │
├─────────────────────────────────────────────────────────────┤
│  🔍 Buscar imagens...                      [🔄 Atualizar]  │
│                                                             │
│  📁 Projeto Lagosta > 📁 IA > (pasta atual)               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Última atualização: há 5 minutos                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │        │ │        │ │        │ │        │ │        │   │
│  │  IMG   │ │  IMG   │ │  IMG   │ │  IMG   │ │  IMG   │   │
│  │   ✓    │ │        │ │   ✓    │ │        │ │        │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │  IMG   │ │  IMG   │ │  IMG   │ │  📁    │ │  📁    │   │
│  │        │ │        │ │        │ │ Fotos  │ │ Refs   │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                             │
│  Não encontrou sua imagem? [🔄 Atualizar pasta]            │
│                                                             │
│  2 imagens selecionadas              [Cancelar] [Importar] │
└─────────────────────────────────────────────────────────────┘
```

**Recursos do Cache:**
- TTL de 30 minutos
- Persistência entre sessões (electron-store)
- Botão "Atualizar" no header E no footer
- Indicador "Última atualização: há X minutos"
- Invalida cache ao forçar refresh

### 4.3 QueueBatchItem (Lote Visual)
```
┌─────────────────────────────────────────────────────┐
│  🎨 Variações: Gato cyberpunk                   ▼   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  2/2 concluídas • ~30 créditos                      │
│                                                      │
│  ▼ Expandido:                                       │
│  ┌─────────────────────────────────────────────────┐│
│  │ ✓ Variação 1: "Um gato cyberpunk..."     [👁️]  ││
│  │ ✓ Variação 2: "Um cachorro cyberpunk..." [👁️]  ││
│  └─────────────────────────────────────────────────┘│
│                           [Cancelar Restantes]      │
└─────────────────────────────────────────────────────┘
```

### 4.4 AdvancedSettings (Accordion Colapsado)
```
▶ Configurações Avançadas
┌─────────────────────────────────────────────────────────────┐
│  Modelo                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Nano Banana Pro                                  ▼  │   │
│  │ Melhor qualidade, mais detalhes                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Proporção                                                  │
│  [ 1:1 ]  [ 16:9 ]  [ 9:16 ]  [ 4:5 ]                     │
│    ✓                                                        │
│                                                             │
│  Resolução                                                  │
│  [ 1K ]  [ 2K ]  [ 4K ]                                    │
│           ✓                                                 │
│  ⚠️ 4K consome 3x mais créditos                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Sistema de Variáveis no Prompt

### 5.1 Parser
```typescript
// src/pages/bulk-image-generator/utils/prompt-parser.ts

interface ParsedPrompt {
  hasVariables: boolean
  variables: PromptVariable[]
  expandedPrompts: string[]
  combinations: number
}

interface PromptVariable {
  raw: string           // "{gato, cachorro}"
  options: string[]     // ["gato", "cachorro"]
  position: number
}

function parsePromptVariables(prompt: string): ParsedPrompt {
  const variableRegex = /\{([^}]+)\}/g
  const variables: PromptVariable[] = []

  let match
  while ((match = variableRegex.exec(prompt)) !== null) {
    const options = match[1].split(',').map(s => s.trim()).filter(Boolean)
    if (options.length > 1) {
      variables.push({
        raw: match[0],
        options,
        position: match.index
      })
    }
  }

  if (variables.length === 0) {
    return { hasVariables: false, variables: [], expandedPrompts: [prompt], combinations: 1 }
  }

  const expandedPrompts = generateCombinations(prompt, variables)

  return {
    hasVariables: true,
    variables,
    expandedPrompts,
    combinations: expandedPrompts.length
  }
}
```

### 5.2 Preview de Variáveis na UI
```
┌─────────────────────────────────────────────────────────────┐
│  Um {gato, cachorro} cyberpunk em {neon, pastel}           │
└─────────────────────────────────────────────────────────────┘
│ 📊 4 variações serão geradas:                               │
│    • Um gato cyberpunk em neon                              │
│    • Um gato cyberpunk em pastel                            │
│    • Um cachorro cyberpunk em neon                          │
│    • Um cachorro cyberpunk em pastel                        │
│                                                              │
│ Créditos totais: ~60 (15 × 4)                               │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Limite de Combinações
```typescript
const MAX_COMBINATIONS = 20

if (parsed.combinations > MAX_COMBINATIONS) {
  // Warning: "⚠️ Máximo 20 variações. Reduza as opções."
}
```

---

## 6. Sistema de Fila

### 6.1 Processamento
```typescript
async function processQueue() {
  while (queue.hasItems && !queue.isPaused) {
    const activeCount = queue.getProcessingCount()

    if (activeCount < queue.concurrency) {
      const nextItem = queue.getNextPending()
      if (nextItem) {
        processItem(nextItem)  // Não await - paralelo
      }
    }

    await sleep(500)
  }
}

async function processItem(item: QueueItem) {
  queue.setStatus(item.id, 'PROCESSING')

  try {
    const result = await api.post('/api/ai/generate-image', {
      prompt: item.request.improvedPrompt || item.request.prompt,
      model: item.request.model,
      aspectRatio: item.request.aspectRatio,
      resolution: item.request.resolution,
      referenceImages: item.request.referenceImages.map(r => r.url),
    })

    queue.complete(item.id, result)
  } catch (error) {
    if (item.attempts < item.maxAttempts && error.retryable) {
      queue.scheduleRetry(item.id)
    } else {
      queue.fail(item.id, error)
    }
  }
}
```

### 6.2 Priorização
1. Itens com maior `priority`
2. Itens agendados para retry que já passaram o tempo
3. Itens mais antigos (FIFO)

### 6.3 Retry Logic
- Primeira falha: Retry em 30 segundos
- Segunda falha: Retry em 2 minutos
- Terceira falha: Marca como FAILED
- Erros não-retryáveis (ex: créditos insuficientes): Falha imediata

### 6.4 Network Status
```typescript
function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { pauseQueue, resumeQueue, pauseReason } = useImageQueue()

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (pauseReason === 'offline') {
        resumeQueue()
        toast.success('Conexão restaurada. Fila retomada.')
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      pauseQueue('offline')
      toast.warning('Conexão perdida. Fila pausada.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [pauseReason])

  return { isOnline }
}
```

---

## 7. Cache do Google Drive

### 7.1 Hook useDriveCache
```typescript
interface UseDriveCacheReturn {
  getFolder: (folderId: string) => Promise<DriveFile[]>
  refreshFolder: (folderId: string) => Promise<DriveFile[]>
  invalidateFolder: (folderId: string) => void
  invalidateAll: () => void
  isRefreshing: boolean
  lastRefreshedAt: string | null
}

function useDriveCache(): UseDriveCacheReturn {
  const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutos

  const getFolder = async (folderId: string): Promise<DriveFile[]> => {
    const cached = cache.get(folderId)
    const now = Date.now()

    if (cached && new Date(cached.expiresAt).getTime() > now) {
      return cached.files
    }

    return refreshFolder(folderId)
  }

  const refreshFolder = async (folderId: string): Promise<DriveFile[]> => {
    setIsRefreshing(true)

    try {
      const files = await api.get<DriveFile[]>(`/api/google-drive/list/${folderId}`)

      const now = new Date()
      const cacheEntry: DriveFolderCache = {
        folderId,
        files,
        cachedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
      }

      setCache(prev => new Map(prev).set(folderId, cacheEntry))
      return files
    } finally {
      setIsRefreshing(false)
    }
  }

  // ...
}
```

### 7.2 Persistência do Cache
```typescript
// Cache persiste entre sessões via electron-store
function loadDriveCache(): Map<string, DriveFolderCache> {
  const stored = electronStore.get('drivePickerCache', {})
  const now = Date.now()

  // Filtra entradas expiradas
  const validEntries = Object.entries(stored).filter(([_, entry]) =>
    new Date(entry.expiresAt).getTime() > now
  )

  return new Map(validEntries)
}
```

---

## 8. Persistência e Cleanup

### 8.1 Auto-cleanup de Completados
```typescript
function cleanupOldItems() {
  const now = Date.now()
  const maxAge = settings.autoCleanCompletedAfterHours * 60 * 60 * 1000  // 24h default

  queue.items = queue.items.filter(item => {
    if (item.status !== 'COMPLETED') return true
    const completedAt = new Date(item.completedAt!).getTime()
    return now - completedAt < maxAge
  })

  // Limpa batches vazios
  queue.batches = queue.batches.filter(batch => {
    return batch.itemIds.some(id => queue.items.some(item => item.id === id))
  })
}
```

### 8.2 Recentes (Últimas 20 Referências)
```typescript
function addToRecent(image: ReferenceImage) {
  const recent = store.recentReferenceImages.filter(img => img.id !== image.id)
  recent.unshift({ ...image, addedAt: new Date().toISOString() })
  store.recentReferenceImages = recent.slice(0, 20)
}
```

---

## 9. Micro-interações e Animações

### 9.1 Framer Motion Variants
```typescript
const queueItemVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

const errorShake = {
  x: [0, -10, 10, -10, 10, 0],
  transition: { duration: 0.5 }
}

const progressPulse = {
  scale: [1, 1.02, 1],
  transition: { repeat: Infinity, duration: 2 }
}
```

### 9.2 Transições de Estado
| De → Para | Animação |
|-----------|----------|
| PENDING → PROCESSING | Fade in + pulse |
| PROCESSING → COMPLETED | Scale up + checkmark |
| PROCESSING → FAILED | Shake + red flash |
| * → CANCELLED | Fade out + strikethrough |

### 9.3 Skeleton Loader
```typescript
<div className="relative">
  <Skeleton className="w-full h-32 animate-shimmer" />
  <div className="absolute inset-0 flex items-center justify-center">
    <span className="text-sm font-medium bg-black/50 px-2 py-1 rounded">
      {progress}%
    </span>
  </div>
</div>
```

---

## 10. Integração com Sistema Existente

### 10.1 APIs Utilizadas
| Endpoint | Uso |
|----------|-----|
| `POST /api/ai/generate-image` | Geração de cada imagem |
| `POST /api/ai/improve-prompt` | Melhoria de prompt |
| `GET /api/projects/{id}/ai-images` | Listagem de imagens geradas |
| `GET /api/google-drive/image/{fileId}` | Thumbnails do Drive |
| `GET /api/google-drive/list/{folderId}` | Listar arquivos da pasta |

### 10.2 Integração com Drive
- API existente já salva na pasta IA do Drive
- Nenhuma alteração necessária no backend
- URL retornada: `/api/google-drive/image/{fileId}`

### 10.3 Integração com "Geradas com IA"
- Imagens aparecem automaticamente após COMPLETED
- Componente existente já lista do banco

---

## 11. Tratamento de Erros

| Erro | Ação |
|------|------|
| Créditos insuficientes | Pausa fila, notifica usuário |
| Rate limit API | Retry com backoff exponencial |
| Timeout | Retry imediato (1 tentativa extra) |
| Token inválido | Pausa fila, pede re-login |
| Erro de rede | Retry com backoff |
| Erro desconhecido | Retry padrão |

---

## 12. Decisões Técnicas

| Decisão | Valor | Justificativa |
|---------|-------|---------------|
| Variações padrão | 2 | Conservador, evita consumo excessivo |
| Concorrência padrão | 2 | Balanceado entre velocidade e estabilidade |
| Concorrência máxima | 5 | Com warning visual sobre consumo |
| Limite de fila | 100 | Acima disso, virtualização necessária |
| Retenção completados | 24h | Já está no servidor, fila limpa |
| Max combinações variáveis | 20 | Evita explosão combinatória |
| Retry attempts | 3 | Suficiente para falhas transitórias |
| Retry delays | 30s, 2m, 5m | Backoff exponencial suave |
| Cache TTL do Drive | 30 min | Balanceado entre performance e freshness |
| Cache persistente | Sim | Acelera reabertura do picker |

---

## 13. Estimativa de Implementação

| Componente | Complexidade | Horas |
|------------|--------------|-------|
| PromptInput com variáveis | Média | 3h |
| ReferenceImagesSection + tabs | Alta | 4h |
| DriveImagePicker modal + cache | Alta | 5h |
| useDriveCache hook | Média | 2h |
| AdvancedSettings accordion | Baixa | 1h |
| QueueDrawer + virtualização | Alta | 4h |
| QueueBatchItem | Média | 2h |
| ProcessingIndicator | Baixa | 1h |
| OfflineBanner + hook | Baixa | 1h |
| Prompt parser (variáveis) | Média | 2h |
| useImageQueue + processor | Alta | 4h |
| Persistência + cleanup | Média | 2h |
| Animações (framer-motion) | Média | 2h |
| Integração e testes | Alta | 4h |

**Total Estimado: ~37 horas**

---

## 14. Melhorias Futuras (v3)

- Templates de Geração (salvar configs frequentes)
- Agendamento (gerar em horário específico)
- Histórico de Prompts (autocomplete)
- Comparação A/B (gerar 2 versões lado a lado)
- Export em lote (baixar todas como ZIP)
