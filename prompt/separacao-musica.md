# Plano de Implementação: Separação Automática de Percussão

## 📋 Visão Geral

Implementar sistema automático de separação de percussão usando API MVSEP. Ao fazer upload de uma música, o sistema automaticamente inicia a separação em background, armazenando apenas a **percussão isolada** + **áudio original**.

### 🎯 Abordagem Simplificada e Eficiente

**2 Arquivos. 2 Opções. Zero Complicação.**

```
UPLOAD ─┬─→ 🎵 ORIGINAL (disponível AGORA)
        │
        └─→ 🔄 Background Job → 🥁 PERCUSSÃO (pronto em ~5 min)
```

**Interface do Usuário:**
1. **Música Completa (Original)** ✓ Disponível imediatamente
2. **Apenas Percussão (Bateria)** 🔄 Processando... → ✓ Pronto!

### Objetivos
- ✅ Separação automática ao fazer upload (background)
- ✅ Armazenar apenas percussão + original (economizar storage)
- ✅ Sistema de fila para plano gratuito MVSEP (1 job simultâneo)
- ✅ Interface simples: **Original (disponível imediatamente)** / **Apenas Percussão (após processamento)**
- ✅ Música original disponível para uso IMEDIATAMENTE após upload
- ✅ Percussão disponível APÓS processamento (background transparente)

---

## 🏗️ Arquitetura

```
┌─────────────────┐
│ Upload Música   │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────┐
│ 1. Salvar no Vercel Blob        │
│ 2. Criar registro MusicLibrary  │
│ 3. Criar MusicStemJob (pending) │
└────────┬────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Cron Job (a cada 2 minutos)      │
│ /api/cron/process-music-stems    │
└────────┬─────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│ Processar Próximo Job da Fila       │
│ - Status: pending → processing      │
│ - Enviar para MVSEP API             │
│ - Polling até completar             │
│ - Download stem de percussão        │
│ - Upload para Vercel Blob           │
│ - Atualizar MusicLibrary            │
│ - Status: processing → completed    │
└─────────────────────────────────────┘
```

---

## 🗄️ Schema do Banco de Dados

### Atualizar `MusicLibrary`

```prisma
model MusicLibrary {
  id          Int      @id @default(autoincrement())
  name        String
  artist      String?
  duration    Float
  blobUrl     String   // Áudio original
  blobSize    Int
  genre       String?
  mood        String?
  isActive    Boolean  @default(true)
  isPublic    Boolean  @default(true)
  thumbnailUrl String?

  // Percussion stem (apenas percussão)
  percussionUrl     String?   // URL do stem de percussão
  percussionSize    Int?      // Tamanho do arquivo de percussão
  hasPercussionStem Boolean   @default(false)
  stemsProcessedAt  DateTime?

  // Vinculação com projeto
  projectId   Int?
  project     Project? @relation("ProjectMusicLibrary", fields: [projectId], references: [id], onDelete: Cascade)

  // Metadados
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?

  // Relação com vídeos gerados
  usedInVideos VideoProcessingJob[]

  // Relação com job de processamento
  stemJob     MusicStemJob?

  @@index([projectId])
  @@index([genre])
  @@index([mood])
  @@index([isActive, isPublic])
  @@index([hasPercussionStem])
}
```

### Novo modelo `MusicStemJob`

```prisma
model MusicStemJob {
  id             Int      @id @default(autoincrement())
  musicId        Int      @unique // Um job por música
  music          MusicLibrary @relation(fields: [musicId], references: [id], onDelete: Cascade)

  // Status do job
  status         String   @default("pending") // pending, processing, completed, failed
  progress       Int      @default(0) // 0-100

  // MVSEP API
  mvsepJobHash   String?  // Hash retornado pela API
  mvsepStatus    String?  // waiting, processing, done, failed

  // Resultado
  percussionBlobUrl String? // URL temporária antes de mover para MusicLibrary
  error          String?  @db.Text

  // Timestamps
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  startedAt      DateTime? // Quando começou o processamento MVSEP
  completedAt    DateTime? // Quando finalizou tudo

  @@index([status])
  @@index([mvsepJobHash])
  @@index([createdAt])
}
```

---

## 🔄 Fluxo de Processamento Detalhado

### 1. Upload de Música (POST /api/biblioteca-musicas)

```typescript
// src/app/api/biblioteca-musicas/route.ts

async function POST(req: Request) {
  // ... código existente de upload

  // Criar música no banco
  const music = await db.musicLibrary.create({ ... })

  // ✨ NOVO: Criar job de separação automático
  await db.musicStemJob.create({
    data: {
      musicId: music.id,
      status: 'pending',
      progress: 0,
    }
  })

  return NextResponse.json({ music })
}
```

### 2. Cron Job - Processar Fila (POST /api/cron/process-music-stems)

```typescript
// src/app/api/cron/process-music-stems/route.ts

export async function POST(req: Request) {
  // Verificar Bearer token (segurança Vercel Cron)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Buscar próximo job pendente (FIFO)
  const nextJob = await db.musicStemJob.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { music: true }
  })

  if (!nextJob) {
    return NextResponse.json({ message: 'No pending jobs' })
  }

  // 2. Verificar se já tem job em processamento (limite do plano gratuito)
  const processingJob = await db.musicStemJob.findFirst({
    where: { status: 'processing' }
  })

  if (processingJob) {
    // Verificar status do job em processamento no MVSEP
    await checkMvsepJobStatus(processingJob)
    return NextResponse.json({
      message: 'Job already processing',
      jobId: processingJob.id
    })
  }

  // 3. Iniciar processamento do próximo job
  await startStemSeparation(nextJob)

  return NextResponse.json({
    success: true,
    jobId: nextJob.id
  })
}
```

### 3. Iniciar Separação no MVSEP

```typescript
// src/lib/mvsep/mvsep-client.ts

const MVSEP_API_KEY = process.env.MVSEP_API_KEY
const MVSEP_API_URL = 'https://mvsep.com/api'

export async function startStemSeparation(job: MusicStemJob) {
  try {
    // Atualizar status para processing
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
        progress: 10
      }
    })

    // Enviar para MVSEP API
    const response = await fetch(`${MVSEP_API_URL}/separation/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_token: MVSEP_API_KEY,
        url: job.music.blobUrl, // URL pública do Vercel Blob
        separation_type: 37, // DrumSep - Type 37 (percussion separation)
        output_format: 'mp3', // MP3 320kbps
        remote_type: 'other' // URL genérica
      })
    })

    const data = await response.json()

    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'MVSEP API error')
    }

    // Salvar hash do job MVSEP
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        mvsepJobHash: data.hash,
        mvsepStatus: 'waiting',
        progress: 20
      }
    })

    console.log('[MVSEP] Job created:', data.hash)

  } catch (error) {
    console.error('[MVSEP] Failed to start separation:', error)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}
```

### 4. Verificar Status do Job MVSEP

```typescript
// src/lib/mvsep/mvsep-client.ts

export async function checkMvsepJobStatus(job: MusicStemJob) {
  if (!job.mvsepJobHash) return

  try {
    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${job.mvsepJobHash}`
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Failed to check status')
    }

    const mvsepStatus = data.status // waiting, processing, done, failed

    // Atualizar progress baseado no status
    let progress = job.progress
    if (mvsepStatus === 'waiting') progress = 30
    if (mvsepStatus === 'processing') progress = 50

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        mvsepStatus,
        progress
      }
    })

    // Se completou, baixar o stem
    if (mvsepStatus === 'done') {
      await downloadAndSaveStem(job, data)
    }

    // Se falhou, marcar como erro
    if (mvsepStatus === 'failed') {
      await db.musicStemJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'MVSEP processing failed'
        }
      })
    }

  } catch (error) {
    console.error('[MVSEP] Failed to check status:', error)
  }
}
```

### 5. Download e Armazenamento do Stem

```typescript
// src/lib/mvsep/mvsep-client.ts

async function downloadAndSaveStem(job: MusicStemJob, mvsepResult: any) {
  try {
    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 70 }
    })

    // MVSEP retorna array de stems
    // Para DrumSep (Type 37), teremos múltiplos stems
    // Precisamos do stem de "drums" completo ou combinar todos

    const drumStems = mvsepResult.results.filter((r: any) =>
      r.name.toLowerCase().includes('drum') ||
      r.name.toLowerCase().includes('percussion')
    )

    if (!drumStems || drumStems.length === 0) {
      throw new Error('No drum stems found in result')
    }

    // Pegar o primeiro stem de drums (geralmente é o combinado)
    const drumStem = drumStems[0]

    // Download do arquivo
    const audioResponse = await fetch(drumStem.url)
    if (!audioResponse.ok) {
      throw new Error('Failed to download stem')
    }

    const audioBuffer = await audioResponse.arrayBuffer()
    const buffer = Buffer.from(audioBuffer)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 85 }
    })

    // Upload para Vercel Blob
    const fileName = `music/stems/${job.musicId}_percussion.mp3`
    const blob = await put(fileName, buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    })

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 95 }
    })

    // Atualizar MusicLibrary com o stem
    await db.musicLibrary.update({
      where: { id: job.musicId },
      data: {
        percussionUrl: blob.url,
        percussionSize: buffer.length,
        hasPercussionStem: true,
        stemsProcessedAt: new Date()
      }
    })

    // Marcar job como completo
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date()
      }
    })

    console.log('[MVSEP] Stem saved successfully:', blob.url)

  } catch (error) {
    console.error('[MVSEP] Failed to download/save stem:', error)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to save stem'
      }
    })
  }
}
```

---

## 🔌 API Endpoints

### 1. Obter Status do Processamento

```typescript
// GET /api/biblioteca-musicas/:id/stem-status

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const music = await db.musicLibrary.findUnique({
    where: { id },
    include: { stemJob: true }
  })

  if (!music) {
    return NextResponse.json({ error: 'Music not found' }, { status: 404 })
  }

  return NextResponse.json({
    musicId: music.id,
    hasPercussionStem: music.hasPercussionStem,
    percussionUrl: music.percussionUrl,
    job: music.stemJob ? {
      status: music.stemJob.status,
      progress: music.stemJob.progress,
      error: music.stemJob.error,
      createdAt: music.stemJob.createdAt,
      completedAt: music.stemJob.completedAt
    } : null
  })
}
```

### 2. Reprocessar Stems (caso falhe)

```typescript
// POST /api/biblioteca-musicas/:id/reprocess-stem

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: idStr } = await params
  const id = parseInt(idStr)

  // Verificar se música existe
  const music = await db.musicLibrary.findUnique({
    where: { id },
    include: { stemJob: true }
  })

  if (!music) {
    return NextResponse.json({ error: 'Music not found' }, { status: 404 })
  }

  // Resetar ou criar job
  if (music.stemJob) {
    await db.musicStemJob.update({
      where: { id: music.stemJob.id },
      data: {
        status: 'pending',
        progress: 0,
        error: null,
        mvsepJobHash: null,
        mvsepStatus: null,
        startedAt: null,
        completedAt: null
      }
    })
  } else {
    await db.musicStemJob.create({
      data: {
        musicId: music.id,
        status: 'pending'
      }
    })
  }

  return NextResponse.json({ success: true, message: 'Job requeued' })
}
```

---

## 🎨 Componentes UI

### 1. Atualizar `AudioSelectionModal`

```typescript
// src/components/audio/audio-selection-modal.tsx

// Adicionar opção de versão do áudio - APENAS 2 OPÇÕES
export type AudioVersion = 'original' | 'percussion'

export interface AudioConfig {
  source: 'original' | 'library' | 'none'
  musicId?: number
  audioVersion?: AudioVersion // NOVO - original ou percussion
  startTime: number
  endTime: number
  volume: number
  fadeIn: boolean
  fadeOut: boolean
  fadeInDuration: number
  fadeOutDuration: number
}

// No componente:
<Select
  value={audioVersion}
  onValueChange={(v) => setAudioVersion(v as AudioVersion)}
>
  <SelectTrigger>
    <SelectValue placeholder="Versão do áudio" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="original">
      🎵 Música Completa (Original)
      <span className="text-xs text-green-600 ml-2">✓ Disponível</span>
    </SelectItem>
    <SelectItem value="percussion" disabled={!selectedMusic?.hasPercussionStem}>
      🥁 Apenas Percussão (Bateria)
      {selectedMusic?.hasPercussionStem ? (
        <span className="text-xs text-green-600 ml-2">✓ Disponível</span>
      ) : (
        <span className="text-xs text-amber-600 ml-2">🔄 Processando...</span>
      )}
    </SelectItem>
  </SelectContent>
</Select>

{/* Info box: Música original disponível imediatamente */}
<div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
  <p className="text-sm text-blue-800">
    💡 <strong>A música original está disponível imediatamente.</strong>
    {!selectedMusic?.hasPercussionStem && (
      <> A versão apenas com percussão estará pronta em alguns minutos.</>
    )}
  </p>
</div>

{/* Progress bar se estiver processando */}
{selectedMusic && !selectedMusic.hasPercussionStem && stemJob?.status === 'processing' && (
  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
    <p className="text-sm text-amber-800 flex items-center gap-2 mb-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Processando separação de percussão...
    </p>
    <Progress value={stemJob.progress} className="h-2" />
    <p className="text-xs text-amber-700 mt-1">
      {stemJob.progress}% concluído
    </p>
  </div>
)}
```

### 2. Badge na Lista de Músicas

```typescript
// src/app/(protected)/biblioteca-musicas/page.tsx

<div className="flex items-center gap-2">
  <Music className="h-5 w-5" />
  <span>{music.name}</span>
  {music.hasPercussionStem && (
    <Badge variant="secondary" className="text-xs">
      <Drum className="h-3 w-3 mr-1" />
      Stems
    </Badge>
  )}
  {music.stemJob?.status === 'processing' && (
    <Badge variant="outline" className="text-xs">
      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
      {music.stemJob.progress}%
    </Badge>
  )}
</div>
```

### 3. Indicador de Progresso na Biblioteca

```typescript
// src/components/audio/music-stem-progress.tsx

export function MusicStemProgress({ musicId }: { musicId: number }) {
  const { data: status } = useMusicStemStatus(musicId)

  if (!status?.job || status.job.status === 'completed') {
    return null
  }

  if (status.job.status === 'failed') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-3">
        <p className="text-sm text-red-800">
          Erro ao processar stems: {status.job.error}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => reprocessStem(musicId)}
        >
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-blue-800 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processando separação de percussão...
        </p>
        <span className="text-sm font-medium text-blue-900">
          {status.job.progress}%
        </span>
      </div>
      <Progress value={status.job.progress} className="h-2" />
    </div>
  )
}
```

---

## 🔗 Custom Hooks

### Hook para Status do Stem

```typescript
// src/hooks/use-music-stem.ts

export function useMusicStemStatus(musicId: number) {
  return useQuery({
    queryKey: ['music-stem-status', musicId],
    queryFn: () => api.get(`/api/biblioteca-musicas/${musicId}/stem-status`),
    refetchInterval: (data) => {
      // Polling a cada 5 segundos se estiver processando
      if (data?.job?.status === 'processing') return 5000
      // Polling a cada 30 segundos se estiver pendente
      if (data?.job?.status === 'pending') return 30000
      // Não fazer polling se completo ou falhou
      return false
    },
    staleTime: 5000,
  })
}

export function useReprocessStem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (musicId: number) =>
      api.post(`/api/biblioteca-musicas/${musicId}/reprocess-stem`),
    onSuccess: (_, musicId) => {
      queryClient.invalidateQueries({ queryKey: ['music-stem-status', musicId] })
      queryClient.invalidateQueries({ queryKey: ['music', musicId] })
    },
  })
}
```

---

## 🎬 Integração com Exportação de Vídeo

### Atualizar `konva-video-export.ts`

```typescript
// src/lib/konva/konva-video-export.ts

export interface AudioConfig {
  source: 'original' | 'library' | 'none'
  musicId?: number
  audioVersion?: 'original' | 'percussion' // APENAS 2 OPÇÕES
  startTime: number
  endTime: number
  volume: number
  fadeIn: boolean
  fadeOut: boolean
  fadeInDuration: number
  fadeOutDuration: number
}

// Na função de exportação, usar a URL correta:
async function getMusicUrl(config: AudioConfig): Promise<string> {
  if (config.source !== 'library' || !config.musicId) {
    throw new Error('Invalid audio config')
  }

  const music = await fetch(`/api/biblioteca-musicas/${config.musicId}`).then(r => r.json())

  // Determinar qual URL usar baseado na versão
  if (config.audioVersion === 'percussion') {
    // Usar stem de percussão
    if (!music.hasPercussionStem || !music.percussionUrl) {
      throw new Error('Percussion stem not available yet. Please wait for processing to complete.')
    }
    return music.percussionUrl
  }

  // Padrão: usar música original (sempre disponível)
  return music.blobUrl
}
```

---

## ⚙️ Configuração do Vercel Cron

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/process-music-stems",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

### .env

```env
CRON_SECRET=your-random-secret-here
MVSEP_API_KEY=your-mvsep-api-key-here
```

---

## 📝 Migração do Banco de Dados

```prisma
// prisma/migrations/XXX_add_music_stems/migration.sql

-- Add stem fields to MusicLibrary
ALTER TABLE "MusicLibrary" ADD COLUMN "percussionUrl" TEXT;
ALTER TABLE "MusicLibrary" ADD COLUMN "percussionSize" INTEGER;
ALTER TABLE "MusicLibrary" ADD COLUMN "hasPercussionStem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MusicLibrary" ADD COLUMN "stemsProcessedAt" TIMESTAMP(3);

-- Create MusicStemJob table
CREATE TABLE "MusicStemJob" (
    "id" SERIAL NOT NULL,
    "musicId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "mvsepJobHash" TEXT,
    "mvsepStatus" TEXT,
    "percussionBlobUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MusicStemJob_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint
CREATE UNIQUE INDEX "MusicStemJob_musicId_key" ON "MusicStemJob"("musicId");

-- Create indexes
CREATE INDEX "MusicStemJob_status_idx" ON "MusicStemJob"("status");
CREATE INDEX "MusicStemJob_mvsepJobHash_idx" ON "MusicStemJob"("mvsepJobHash");
CREATE INDEX "MusicStemJob_createdAt_idx" ON "MusicStemJob"("createdAt");
CREATE INDEX "MusicLibrary_hasPercussionStem_idx" ON "MusicLibrary"("hasPercussionStem");

-- Add foreign key
ALTER TABLE "MusicStemJob" ADD CONSTRAINT "MusicStemJob_musicId_fkey"
  FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 🚀 Fases de Implementação

### Fase 1: Setup e Infraestrutura ⏱️ 2-3 horas
- [x] Adicionar campos no schema Prisma
- [x] Criar modelo MusicStemJob
- [x] Executar migration
- [x] Criar arquivo `src/lib/mvsep/mvsep-client.ts`
- [x] Adicionar variáveis de ambiente
- [x] Configurar Vercel Cron no vercel.json

### Fase 2: API Backend ⏱️ 4-5 horas
- [x] Implementar `startStemSeparation()`
- [x] Implementar `checkMvsepJobStatus()`
- [x] Implementar `downloadAndSaveStem()`
- [x] Criar endpoint `/api/cron/process-music-stems`
- [x] Criar endpoint `/api/biblioteca-musicas/:id/stem-status`
- [x] Criar endpoint `/api/biblioteca-musicas/:id/reprocess-stem`
- [x] Atualizar endpoint de upload para criar job automático

### Fase 3: Frontend e UX ⏱️ 3-4 horas
- [x] Criar hook `useMusicStemStatus()`
- [x] Criar hook `useReprocessStem()`
- [x] Atualizar `AudioSelectionModal` com opções de versão
- [x] Criar componente `MusicStemProgress`
- [x] Adicionar badges na lista de músicas
- [x] Atualizar interface de seleção de música

### Fase 4: Integração com Exportação ⏱️ 2 horas
- [x] Atualizar `AudioConfig` interface
- [x] Atualizar `getMusicUrl()` em konva-video-export
- [x] Testar exportação com diferentes versões
- [x] Validar mixagem de áudio

### Fase 5: Testes e Refinamentos ⏱️ 2-3 horas
- [x] Testar upload e processamento automático
- [x] Testar fila (múltiplas músicas)
- [x] Testar cenários de erro
- [x] Testar reprocessamento
- [x] Testar exportação de vídeo com stems
- [x] Ajustar tempos de polling
- [x] Otimizar performance

**Tempo Total Estimado: 13-17 horas (2-3 dias)**

---

## ⚠️ Considerações Técnicas

### 1. Plano Gratuito MVSEP
- ✅ Limite: 1 job simultâneo
- ✅ Sem custo de créditos para não-premium
- ✅ Sistema de fila gerencia isso automaticamente
- ⚠️ Pode haver espera se muitas músicas na fila

### 2. Tempo de Processamento
- Música de 3 min: ~2-5 minutos
- Música de 5 min: ~3-8 minutos
- Cron a cada 2 minutos garante polling regular

### 3. Armazenamento
- Apenas percussão = economia de ~60-70% vs. todos os stems
- Música 5MB → +3-4MB (percussão)
- 100 músicas = ~300-400MB adicional (viável)

### 4. Apenas 2 Arquivos Armazenados
**Decisão Final:**
- ✅ Original: Sempre disponível imediatamente após upload
- ✅ Percussão: Disponível após processamento (background)
- ❌ Sem Percussão: Não será implementado (simplifica storage e UX)

### 5. Priorização de Jobs
- FIFO por padrão (primeiro a entrar, primeiro a sair)
- Futura melhoria: priorizar músicas de projetos ativos

### 6. Garbage Collection
- Considerar remover stems de músicas não usadas há 90+ dias
- Reduz custos de armazenamento
- Pode reprocessar se necessário

### 7. Monitoramento
- Logs detalhados em cada etapa
- Tracking de taxa de sucesso/falha
- Alertas se fila muito longa (>50 jobs pendentes)

---

## 📊 Métricas de Sucesso

- ✅ Taxa de sucesso de processamento > 95%
- ✅ Tempo médio de processamento < 10 minutos
- ✅ 0 falhas de upload para Vercel Blob
- ✅ Fila nunca excede 20 jobs pendentes
- ✅ UX transparente (usuário nem percebe o processamento)

---

## 🎯 Próximos Passos

1. **Revisar e aprovar este plano**
2. **Criar branch `feature/music-stem-separation`**
3. **Implementar Fase 1 (Setup)**
4. **Testar em desenvolvimento com 2-3 músicas**
5. **Deploy gradual em produção**
6. **Monitorar primeiros processamentos**
7. **Iterar baseado em feedback**

---

## ✅ Decisões Finalizadas

**1. Versões de Áudio:**
- ✅ Original (disponível imediatamente)
- ✅ Apenas Percussão (após processamento)
- ❌ Sem Percussão (não será implementado)

**2. Músicas Existentes:**
- ✅ Não reprocessar automaticamente
- ✅ Apenas novas músicas entram na fila
- ✅ Admin pode reprocessar manualmente se necessário

**3. Notificações:**
- ✅ Apenas atualizar UI silenciosamente (polling automático)
- ✅ Badge de progresso visível na biblioteca
- ❌ Sem toast ou email (não interromper o workflow)

---

## 📚 Referências

- [MVSEP API Docs](https://mvsep.com/pt/full_api)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Status**: ✅ Pronto para implementação
**Complexidade**: Média
**Risco**: Baixo
**Valor**: Alto
**ROI**: Excelente (diferencial competitivo)

---

## 📊 Resumo Executivo

### O Que Vamos Fazer?
Quando um usuário faz upload de uma música, automaticamente:
1. 🎵 **Música original fica disponível IMEDIATAMENTE** para uso
2. 🔄 **Sistema inicia processamento em background** (invisível para o usuário)
3. 🥁 **Em ~5 minutos, versão "Apenas Percussão" fica disponível**
4. 💾 **Armazenamos apenas 2 arquivos**: Original + Percussão

### Por Que Essa Abordagem?
- ✅ **UX perfeita**: Usuário não precisa esperar, usa a música original imediatamente
- ✅ **Custo zero**: Plano gratuito MVSEP (1 job por vez)
- ✅ **Storage eficiente**: Apenas 2 arquivos por música (~+60% do tamanho original)
- ✅ **Simples**: Apenas 2 opções no modal de seleção (original ou percussão)
- ✅ **Escalável**: Fila automática gerencia múltiplos uploads
- ✅ **Transparente**: Usuário vê progresso mas não é bloqueado

### Quando o Usuário Vai Usar?
**Caso de Uso Principal:** Exportação de vídeo
- Usuário criou vídeo com camadas
- Quer adicionar música de fundo
- Pode escolher música completa OU apenas percussão para não competir com narração/diálogo

**Exemplo Real:**
```
Vídeo com narração → Música só com percussão
Vídeo sem fala → Música completa
```

### Quanto Tempo/Custo?
- **Implementação**: 13-17 horas (2-3 dias)
- **Custo operacional**: €0 (plano gratuito)
- **Storage adicional**: ~300-400MB para 100 músicas
- **Tempo de processamento**: ~5 minutos por música

### Como Vai Funcionar na Prática?
```
1. Usuário faz upload de "Summer Vibes.mp3"
   └─> ✓ Música disponível AGORA

2. Sistema cria job na fila (background)
   └─> Status: "pending"

3. Cron job (a cada 2 min) processa próximo da fila
   └─> Status: "processing" (0% → 100%)

4. Download da percussão isolada do MVSEP
   └─> Upload para Vercel Blob

5. Atualizar banco de dados
   └─> hasPercussionStem: true
   └─> Status: "completed"

6. Interface atualiza automaticamente
   └─> Badge: "🥁 Stems Disponíveis"
```

### Como Vai Aparecer na Interface?
```
Modal de Seleção de Áudio:

┌─────────────────────────────────────┐
│ Escolha a Versão da Música:         │
├─────────────────────────────────────┤
│                                     │
│ ○ 🎵 Música Completa (Original)     │
│   ✓ Disponível                      │
│                                     │
│ ○ 🥁 Apenas Percussão (Bateria)     │
│   ✓ Disponível                      │
│   (ou "🔄 Processando... 45%")      │
│                                     │
├─────────────────────────────────────┤
│ 💡 A música original está disponível│
│    imediatamente.                   │
└─────────────────────────────────────┘
```

### Pronto para Começar?
✅ Plano revisado e aprovado
✅ API key configurada via variável de ambiente MVSEP_API_KEY
✅ Abordagem simplificada (apenas 2 arquivos)
✅ Custo zero para testar

**Próximo Passo**: Começar Fase 1 (Setup e Infraestrutura) 🚀
