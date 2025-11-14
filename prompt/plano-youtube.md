# Plano de Implementação: Download de Músicas do YouTube + Processamento MVSEP

## 📋 Visão Geral

Implementar sistema de download de músicas do YouTube via **video-download-api.com**, seguido de **processamento automático no MVSEP** para separação de percussão. O usuário cola uma URL do YouTube e recebe:

1. **Música Original** (MP3 320kbps) - disponível após download (~30s-2min)
2. **Apenas Percussão** (processado automaticamente via MVSEP) - disponível após processamento (~5-7min)

### 🎯 Fluxo Completo

```
USUÁRIO COLA URL DO YOUTUBE
        ↓
┌────────────────────────────────────┐
│ 1. Enviar para video-download-api  │
│ 2. Polling até download completar  │
│ 3. Download do MP3 (320kbps)       │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│ 4. Upload para Vercel Blob         │
│ 5. Criar registro MusicLibrary     │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│ 6. Criar MusicStemJob (automático) │
│ 7. Processar no MVSEP (background) │
│ 8. Separação de percussão          │
└────────────────────────────────────┘

RESULTADO:
✅ Original MP3 (disponível imediatamente)
✅ Apenas Percussão (pronto em ~5-7min)
```

### Objetivos

- ✅ Permitir download de músicas do YouTube via URL
- ✅ Download automático e conversão para MP3 320kbps
- ✅ Upload automático para Vercel Blob Storage
- ✅ **Integração automática com MVSEP** (reaproveitar infraestrutura existente)
- ✅ Sistema de fila para downloads (1 job simultâneo)
- ✅ Interface intuitiva com tabs (Upload Arquivo / Link YouTube)
- ✅ Disclaimers legais robustos sobre ToS do YouTube
- ✅ Música original disponível após download (~1-2 min)
- ✅ Percussão disponível após processamento MVSEP (~5-7 min)

---

## ⚖️ AVISO LEGAL IMPORTANTE

### 🚨 Riscos e Conformidade

**IMPORTANTE: Esta funcionalidade pode violar os Termos de Serviço do YouTube.**

#### Termos de Serviço do YouTube (2025)
> "You shall not download any Content unless you see a 'download' or similar link displayed by YouTube on the Service for that Content."

**Consequências Potenciais:**
- ❌ Violação dos ToS do YouTube
- ❌ Possível ação legal do YouTube
- ❌ Suspensão de contas de usuários
- ❌ Copyright infringement (músicas protegidas)

#### O Que é Legal no YouTube?
✅ **Permitido:**
- Vídeos com Creative Commons (CC BY)
- Conteúdo de domínio público
- Vídeos com botão "Download" oficial
- Seus próprios vídeos

❌ **Proibido:**
- Download via APIs de terceiros
- Download de músicas protegidas por copyright
- Uso comercial de conteúdo protegido

#### Mitigações Implementadas

1. **Disclaimers Robustos**
   - Avisos claros na interface
   - Checkbox de confirmação obrigatório
   - Termos de uso explícitos

2. **Responsabilidade do Usuário**
   - Usuário confirma ter direitos para usar o conteúdo
   - Logs de ações para auditoria
   - Sistema preparado para DMCA takedown (futuro)

3. **Uso Ético Recomendado**
   - Músicas Creative Commons
   - Conteúdo próprio
   - Uso educacional/pessoal

**⚠️ RECOMENDAÇÃO: Consulte um advogado antes de implementar em produção.**

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────┐
│ UI: Cole URL do YouTube         │
│ + Checkbox de confirmação legal │
└────────────┬────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ POST /api/biblioteca-musicas/youtube     │
│ 1. Validar URL                           │
│ 2. Criar YoutubeDownloadJob (pending)    │
│ 3. Enviar para video-download-api.com    │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ Cron Job (a cada 1 minuto)               │
│ /api/cron/process-youtube-downloads      │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ Processar Próximo Job da Fila            │
│ - Status: pending → downloading          │
│ - Polling video-download-api até pronto  │
│ - Download MP3                           │
│ - Upload para Vercel Blob                │
│ - Criar MusicLibrary                     │
│ - Criar MusicStemJob (automático)        │
│ - Status: downloading → completed        │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ Cron Job MVSEP (a cada 2 minutos)        │
│ /api/cron/process-music-stems            │
│ (EXISTENTE - reutilizar)                 │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ Processar Separação de Percussão         │
│ - Enviar para MVSEP API                  │
│ - Download de stem de percussão          │
│ - Atualizar MusicLibrary                 │
│ - Música completa com 2 versões pronta   │
└──────────────────────────────────────────┘
```

---

## 🗄️ Schema do Banco de Dados

### Novo Modelo: `YoutubeDownloadJob`

```prisma
model YoutubeDownloadJob {
  id             Int      @id @default(autoincrement())
  youtubeUrl     String   // URL original do YouTube
  youtubeId      String?  // ID extraído do YouTube (watch?v=XXX)

  // Status do job
  status         String   @default("pending") // pending, downloading, uploading, completed, failed
  progress       Int      @default(0) // 0-100

  // video-download-api.com
  videoApiJobId  String?  // ID retornado pela API
  videoApiStatus String?  // waiting, processing, done, failed

  // Resultado
  musicId        Int?     @unique // ID da música criada após download
  music          MusicLibrary? @relation("YoutubeDownloadMusic", fields: [musicId], references: [id], onDelete: SetNull)

  // Metadados extraídos
  title          String?  // Título do vídeo
  duration       Float?   // Duração em segundos
  thumbnail      String?  // URL da thumbnail

  // Error handling
  error          String?  @db.Text
  retryCount     Int      @default(0)

  // Timestamps
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  startedAt      DateTime? // Quando começou o download
  completedAt    DateTime? // Quando finalizou tudo

  // Auditoria (quem solicitou)
  createdBy      String?  // Clerk User ID

  @@index([status])
  @@index([videoApiJobId])
  @@index([createdAt])
  @@index([youtubeUrl])
}
```

### Atualizar `MusicLibrary`

```prisma
model MusicLibrary {
  // ... campos existentes ...

  // Relacionamento com YouTube Download
  youtubeDownloadJob YoutubeDownloadJob? @relation("YoutubeDownloadMusic")

  // Relacionamento com MVSEP (já existe no separacao-musica.md)
  stemJob            MusicStemJob?
}
```

### Integração com `MusicStemJob` (Existente)

O modelo `MusicStemJob` já existe no plano `separacao-musica.md`. Vamos reutilizá-lo:

```prisma
// Modelo existente - REUTILIZAR
model MusicStemJob {
  id             Int      @id @default(autoincrement())
  musicId        Int      @unique
  music          MusicLibrary @relation(fields: [musicId], references: [id], onDelete: Cascade)

  status         String   @default("pending")
  progress       Int      @default(0)
  mvsepJobHash   String?
  mvsepStatus    String?

  // ... resto do modelo conforme separacao-musica.md
}
```

---

## 🔄 Fluxo de Processamento Detalhado

### 1. Usuário Cola URL do YouTube (Frontend)

```typescript
// src/app/(protected)/biblioteca-musicas/enviar/page.tsx

export default function EnviarMusicaPage() {
  const [uploadMode, setUploadMode] = useState<'file' | 'youtube'>('file'); // Aproveitar estado existente
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const baixarDoYoutube = useBaixarDoYoutube();

  const handleYoutubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!aceitouTermos) {
      toast({
        title: 'Termos não aceitos',
        description: 'Você precisa confirmar que tem direitos para usar este conteúdo',
        variant: 'destructive',
      });
      return;
    }

    try {
      await baixarDoYoutube.mutateAsync({
        youtubeUrl,
        nome,
        artista,
        genero,
        humor,
        projectId: projectId !== 'none' ? parseInt(projectId) : undefined,
      });

      toast({
        title: 'Download iniciado',
        description: 'O download do YouTube foi iniciado. Você será notificado quando estiver pronto.',
      });

      router.push('/biblioteca-musicas');
    } catch (error) {
      // ...
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Tabs: Upload de Arquivo | Link do YouTube */}
      <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setUploadMode('file')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            uploadMode === 'file'
              ? 'bg-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📁 Upload de Arquivo
        </button>
        <button
          onClick={() => setUploadMode('youtube')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            uploadMode === 'youtube'
              ? 'bg-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔗 Link do YouTube
        </button>
      </div>

      {/* Conteúdo condicional */}
      {uploadMode === 'file' && (
        // ... formulário existente de upload de arquivo ...
      )}

      {uploadMode === 'youtube' && (
        <form onSubmit={handleYoutubeSubmit} className="space-y-6">
          {/* URL do YouTube */}
          <div className="space-y-2 rounded-lg border p-6 bg-white shadow-sm">
            <Label htmlFor="youtubeUrl" className="text-base font-semibold">
              URL do YouTube <span className="text-red-500">*</span>
            </Label>
            <Input
              id="youtubeUrl"
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
            <p className="text-sm text-gray-500">
              Cole o link completo do vídeo do YouTube
            </p>
          </div>

          {/* AVISO LEGAL */}
          <div className="rounded-lg bg-red-50 border-2 border-red-300 p-6">
            <h3 className="text-base font-bold text-red-900 mb-3">
              ⚠️ AVISO LEGAL IMPORTANTE
            </h3>
            <div className="space-y-2 text-sm text-red-800">
              <p>
                Ao fazer download de conteúdo do YouTube, você pode estar violando os
                <strong> Termos de Serviço do YouTube</strong>.
              </p>
              <p>
                Certifique-se de que você tem <strong>autorização legal</strong> para
                baixar e usar este conteúdo:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Vídeos com licença Creative Commons (CC BY)</li>
                <li>Conteúdo de domínio público</li>
                <li>Seus próprios vídeos</li>
                <li>Permissão explícita do detentor dos direitos</li>
              </ul>
              <p className="font-semibold mt-3">
                Download de músicas protegidas por copyright sem autorização é ILEGAL.
              </p>
            </div>

            {/* Checkbox de confirmação */}
            <div className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="aceitouTermos"
                checked={aceitouTermos}
                onChange={(e) => setAceitouTermos(e.target.checked)}
                className="mt-1 h-4 w-4"
                required
              />
              <label htmlFor="aceitouTermos" className="text-sm text-red-900">
                <strong>Confirmo que tenho direitos legais</strong> para baixar e usar
                este conteúdo, e assumo total responsabilidade por qualquer violação
                de direitos autorais ou termos de serviço.
              </label>
            </div>
          </div>

          {/* Informações Básicas (similar ao upload de arquivo) */}
          <div className="space-y-4 rounded-lg border p-6 bg-white shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">
              Informações da Música
            </h3>
            {/* Nome, Artista, Gênero, Humor, Projeto - igual ao modo 'file' */}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={baixarDoYoutube.isPending || !aceitouTermos}
          >
            {baixarDoYoutube.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando download...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Baixar do YouTube
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
```

### 2. Backend: Iniciar Download (POST /api/biblioteca-musicas/youtube)

```typescript
// src/app/api/biblioteca-musicas/youtube/route.ts

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const youtubeDownloadSchema = z.object({
  youtubeUrl: z.string().url(),
  nome: z.string().min(1).optional(),
  artista: z.string().optional(),
  genero: z.string().optional(),
  humor: z.string().optional(),
  projectId: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Autenticação
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validar dados
    const body = await req.json();
    const data = youtubeDownloadSchema.parse(body);

    // Extrair YouTube ID da URL
    const youtubeId = extractYoutubeId(data.youtubeUrl);
    if (!youtubeId) {
      return NextResponse.json(
        { error: 'URL do YouTube inválida' },
        { status: 400 }
      );
    }

    // Verificar se já existe job para esta URL
    const existingJob = await db.youtubeDownloadJob.findFirst({
      where: {
        youtubeUrl: data.youtubeUrl,
        status: {
          in: ['pending', 'downloading', 'uploading'],
        },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        {
          error: 'Download já em andamento para esta URL',
          jobId: existingJob.id,
        },
        { status: 409 }
      );
    }

    // Criar job de download
    const job = await db.youtubeDownloadJob.create({
      data: {
        youtubeUrl: data.youtubeUrl,
        youtubeId,
        status: 'pending',
        progress: 0,
        createdBy: userId,
        // Salvar metadados para usar depois
        title: data.nome,
      },
    });

    console.log('[YOUTUBE] Job criado:', job.id);

    // Enviar para video-download-api.com
    await startYoutubeDownload(job.id, data);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Download iniciado. Você será notificado quando estiver pronto.',
    });
  } catch (error) {
    console.error('[YOUTUBE] Erro ao iniciar download:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Falha ao iniciar download' },
      { status: 500 }
    );
  }
}

// Função auxiliar para extrair YouTube ID
function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
```

### 3. Integração com video-download-api.com

```typescript
// src/lib/youtube/video-download-client.ts

const VIDEO_DOWNLOAD_API_KEY = process.env.VIDEO_DOWNLOAD_API_KEY!;
const VIDEO_DOWNLOAD_API_URL = 'https://p.savenow.to/ajax';

export async function startYoutubeDownload(
  jobId: number,
  metadata: { nome?: string; artista?: string; genero?: string; humor?: string; projectId?: number }
) {
  try {
    const job = await db.youtubeDownloadJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    // Atualizar status
    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        status: 'downloading',
        startedAt: new Date(),
        progress: 5,
      },
    });

    // Enviar para video-download-api.com
    const params = new URLSearchParams({
      format: 'mp3', // ou '1' para MP3
      url: job.youtubeUrl,
      apikey: VIDEO_DOWNLOAD_API_KEY,
      audio_quality: '320', // 320 kbps
      add_info: '1', // Incluir metadados (título, thumbnail)
    });

    const response = await fetch(`${VIDEO_DOWNLOAD_API_URL}/download.php?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.id) {
      throw new Error(data.error || 'Failed to start download');
    }

    // Salvar ID do job externo e metadados
    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        videoApiJobId: data.id,
        videoApiStatus: 'waiting',
        progress: 10,
        // Salvar metadados retornados pela API
        title: data.info?.title || metadata.nome,
        thumbnail: data.info?.image,
      },
    });

    console.log('[VIDEO-API] Download iniciado:', {
      jobId,
      externalId: data.id,
      title: data.info?.title,
    });

    return data;
  } catch (error) {
    console.error('[VIDEO-API] Falha ao iniciar download:', error);

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

export async function checkYoutubeDownloadStatus(jobId: number) {
  const job = await db.youtubeDownloadJob.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.videoApiJobId) {
    return;
  }

  try {
    // Verificar progresso na API
    const response = await fetch(
      `${VIDEO_DOWNLOAD_API_URL}/progress?id=${job.videoApiJobId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to check status: ${response.status}`);
    }

    const data = await response.json();

    // Atualizar progresso
    // API retorna progress de 0-1000
    const progressPercent = Math.min(Math.floor((data.progress / 1000) * 90), 90);

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        videoApiStatus: data.text, // Status em texto
        progress: progressPercent,
      },
    });

    // Se completou, baixar o arquivo
    if (data.success && data.download_url) {
      await downloadAndSaveYoutubeMp3(jobId, data);
    }

    // Se falhou
    if (data.text?.includes('error') || data.text?.includes('failed')) {
      await db.youtubeDownloadJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: data.text || 'Download failed',
        },
      });
    }
  } catch (error) {
    console.error('[VIDEO-API] Falha ao verificar status:', error);

    // Incrementar retry count
    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        retryCount: { increment: 1 },
      },
    });
  }
}
```

### 4. Download e Upload para Vercel Blob

```typescript
// src/lib/youtube/video-download-client.ts

import { put } from '@vercel/blob';

async function downloadAndSaveYoutubeMp3(jobId: number, downloadData: any) {
  try {
    const job = await db.youtubeDownloadJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        status: 'uploading',
        progress: 91,
      },
    });

    // 1. Download do MP3
    console.log('[VIDEO-API] Baixando MP3:', downloadData.download_url);

    const mp3Response = await fetch(downloadData.download_url);
    if (!mp3Response.ok) {
      throw new Error('Failed to download MP3 file');
    }

    const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer());

    console.log('[VIDEO-API] MP3 baixado:', {
      size: mp3Buffer.length,
      sizeMB: (mp3Buffer.length / (1024 * 1024)).toFixed(2),
    });

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: { progress: 93 },
    });

    // 2. Upload para Vercel Blob
    const fileName = `musicas/youtube/${Date.now()}-${job.youtubeId}.mp3`;

    const blob = await put(fileName, mp3Buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    console.log('[VIDEO-API] Upload para Blob completo:', blob.url);

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: { progress: 95 },
    });

    // 3. Extrair duração do áudio (usando FFmpeg ou biblioteca de metadados)
    // Por simplicidade, assumir duração média ou extrair de metadados da API
    const duration = estimateDuration(mp3Buffer.length); // Função auxiliar

    // 4. Criar registro na MusicLibrary
    const music = await db.musicLibrary.create({
      data: {
        name: job.title || 'Música do YouTube',
        artist: undefined, // Usuário pode editar depois
        duration,
        blobUrl: blob.url,
        blobSize: mp3Buffer.length,
        thumbnailUrl: job.thumbnail,
        isActive: true,
        isPublic: false,
        createdBy: job.createdBy,
      },
    });

    console.log('[VIDEO-API] Música criada no banco:', music.id);

    // 5. Criar job MVSEP automático (INTEGRAÇÃO!)
    await db.musicStemJob.create({
      data: {
        musicId: music.id,
        status: 'pending',
        progress: 0,
      },
    });

    console.log('[VIDEO-API] Job MVSEP criado automaticamente');

    // 6. Marcar job do YouTube como completo
    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        musicId: music.id,
      },
    });

    console.log('[VIDEO-API] Download completo! Música ID:', music.id);
  } catch (error) {
    console.error('[VIDEO-API] Falha ao salvar MP3:', error);

    await db.youtubeDownloadJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to save MP3',
      },
    });
  }
}

// Função auxiliar para estimar duração baseado no tamanho do arquivo
function estimateDuration(fileSize: number): number {
  // MP3 320kbps ≈ 40KB por segundo
  // Isso é uma estimativa, idealmente usar biblioteca de metadados de áudio
  const bytesPerSecond = 40 * 1024; // 320 kbps / 8 bits
  return Math.round(fileSize / bytesPerSecond);
}
```

### 5. Cron Job para Processar Downloads

```typescript
// src/app/api/cron/process-youtube-downloads/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkYoutubeDownloadStatus } from '@/lib/youtube/video-download-client';

export async function POST(req: NextRequest) {
  // Verificar Bearer token (segurança Vercel Cron)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Processando downloads do YouTube...');

  // 1. Verificar jobs em andamento (downloading)
  const downloadingJobs = await db.youtubeDownloadJob.findMany({
    where: { status: 'downloading' },
    orderBy: { createdAt: 'asc' },
  });

  console.log('[CRON] Jobs em andamento:', downloadingJobs.length);

  // Verificar status de cada job em andamento
  for (const job of downloadingJobs) {
    await checkYoutubeDownloadStatus(job.id);
  }

  // 2. Iniciar próximo job pendente (se não houver nenhum em andamento)
  if (downloadingJobs.length === 0) {
    const nextJob = await db.youtubeDownloadJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (nextJob) {
      console.log('[CRON] Iniciando próximo job:', nextJob.id);
      await checkYoutubeDownloadStatus(nextJob.id);
    } else {
      console.log('[CRON] Nenhum job pendente');
    }
  }

  // 3. Limpar jobs antigos falhados (>24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.youtubeDownloadJob.deleteMany({
    where: {
      status: 'failed',
      createdAt: { lt: oneDayAgo },
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Cron job executed',
    processing: downloadingJobs.length,
  });
}
```

### 6. Integração com MVSEP (Automático)

**IMPORTANTE: Reutilizar infraestrutura existente do `separacao-musica.md`**

```typescript
// src/app/api/cron/process-music-stems/route.ts
// (EXISTENTE - conforme separacao-musica.md)

export async function POST(req: Request) {
  // ... código existente ...

  // Buscar próximo job pendente (FIFO)
  const nextJob = await db.musicStemJob.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { music: true },
  });

  if (!nextJob) {
    return NextResponse.json({ message: 'No pending jobs' });
  }

  // ... processar no MVSEP ...
}
```

**Fluxo Automático:**

1. ✅ YouTube download completa → cria `MusicLibrary`
2. ✅ Automaticamente cria `MusicStemJob` com status `pending`
3. ✅ Cron job MVSEP (existente) pega próximo job da fila
4. ✅ Processa separação de percussão
5. ✅ Atualiza `MusicLibrary` com `percussionUrl`
6. ✅ Usuário tem acesso a **Original** e **Apenas Percussão**

---

## 🔌 API Endpoints

### 1. Iniciar Download do YouTube

```typescript
// POST /api/biblioteca-musicas/youtube

Request Body:
{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "nome": "Never Gonna Give You Up",
  "artista": "Rick Astley",
  "genero": "Pop",
  "humor": "Energético",
  "projectId": 123
}

Response:
{
  "success": true,
  "jobId": 456,
  "message": "Download iniciado. Você será notificado quando estiver pronto."
}
```

### 2. Obter Status do Download

```typescript
// GET /api/biblioteca-musicas/youtube/:jobId/status

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr);

  const job = await db.youtubeDownloadJob.findUnique({
    where: { id: jobId },
    include: {
      music: {
        include: {
          stemJob: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    youtubeUrl: job.youtubeUrl,
    title: job.title,
    thumbnail: job.thumbnail,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    music: job.music
      ? {
          id: job.music.id,
          name: job.music.name,
          blobUrl: job.music.blobUrl,
          hasPercussionStem: job.music.hasPercussionStem,
          percussionUrl: job.music.percussionUrl,
          stemJob: job.music.stemJob
            ? {
                status: job.music.stemJob.status,
                progress: job.music.stemJob.progress,
              }
            : null,
        }
      : null,
  });
}
```

### 3. Listar Jobs do YouTube

```typescript
// GET /api/biblioteca-musicas/youtube/jobs

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobs = await db.youtubeDownloadJob.findMany({
    where: { createdBy: userId },
    include: {
      music: {
        select: {
          id: true,
          name: true,
          blobUrl: true,
          hasPercussionStem: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(jobs);
}
```

### 4. Cancelar Download

```typescript
// DELETE /api/biblioteca-musicas/youtube/:jobId

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr);

  const job = await db.youtubeDownloadJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Apenas permitir cancelar se ainda não completou
  if (job.status === 'completed') {
    return NextResponse.json(
      { error: 'Cannot cancel completed job' },
      { status: 400 }
    );
  }

  // Marcar como cancelado (ou deletar)
  await db.youtubeDownloadJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      error: 'Cancelled by user',
    },
  });

  return NextResponse.json({ success: true });
}
```

---

## 🎨 Componentes UI

### 1. Hook para Baixar do YouTube

```typescript
// src/hooks/use-youtube-download.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface BaixarDoYoutubeData {
  youtubeUrl: string;
  nome?: string;
  artista?: string;
  genero?: string;
  humor?: string;
  projectId?: number;
}

interface YoutubeDownloadJob {
  jobId: number;
  status: string;
  progress: number;
  error?: string;
  title?: string;
  thumbnail?: string;
  music?: {
    id: number;
    name: string;
    blobUrl: string;
    hasPercussionStem: boolean;
    percussionUrl?: string;
    stemJob?: {
      status: string;
      progress: number;
    };
  };
}

export function useBaixarDoYoutube() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BaixarDoYoutubeData) =>
      api.post('/api/biblioteca-musicas/youtube', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-jobs'] });
    },
  });
}

export function useYoutubeDownloadStatus(jobId: number) {
  return useQuery<YoutubeDownloadJob>({
    queryKey: ['youtube-job-status', jobId],
    queryFn: () => api.get(`/api/biblioteca-musicas/youtube/${jobId}/status`),
    refetchInterval: (data) => {
      // Polling a cada 3 segundos se estiver downloading
      if (data?.status === 'downloading') return 3000;
      // Polling a cada 10 segundos se pending ou uploading
      if (data?.status === 'pending' || data?.status === 'uploading') return 10000;
      // Não fazer polling se completo ou falhou
      return false;
    },
    enabled: jobId > 0,
    staleTime: 3000,
  });
}

export function useYoutubeJobs() {
  return useQuery({
    queryKey: ['youtube-jobs'],
    queryFn: () => api.get('/api/biblioteca-musicas/youtube/jobs'),
    staleTime: 30_000,
  });
}

export function useCancelarYoutubeJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) =>
      api.delete(`/api/biblioteca-musicas/youtube/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-jobs'] });
    },
  });
}
```

### 2. Componente de Progresso do Download

```typescript
// src/components/youtube/youtube-download-progress.tsx

'use client';

import { useYoutubeDownloadStatus } from '@/hooks/use-youtube-download';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Music } from 'lucide-react';
import Link from 'next/link';

interface YoutubeDownloadProgressProps {
  jobId: number;
}

export function YoutubeDownloadProgress({ jobId }: YoutubeDownloadProgressProps) {
  const { data: job, isLoading } = useYoutubeDownloadStatus(jobId);

  if (isLoading || !job) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </div>
    );
  }

  // Falhou
  if (job.status === 'failed') {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">Download falhou</p>
            <p className="text-sm text-red-700 mt-1">{job.error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Completo
  if (job.status === 'completed' && job.music) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">
                Download completo!
              </p>
              <p className="text-sm text-green-700 mt-1">{job.music.name}</p>

              {/* Status do processamento MVSEP */}
              {job.music.stemJob && job.music.stemJob.status === 'processing' && (
                <div className="mt-3">
                  <p className="text-xs text-green-800 mb-1">
                    Processando separação de percussão...
                  </p>
                  <Progress
                    value={job.music.stemJob.progress}
                    className="h-1.5"
                  />
                  <p className="text-xs text-green-700 mt-1">
                    {job.music.stemJob.progress}%
                  </p>
                </div>
              )}

              {job.music.hasPercussionStem && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Percussão disponível
                </p>
              )}
            </div>
          </div>

          <Link href={`/biblioteca-musicas/${job.music.id}`}>
            <Button size="sm" variant="outline">
              <Music className="h-4 w-4 mr-2" />
              Ver Música
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Em progresso
  const statusText = {
    pending: 'Aguardando na fila...',
    downloading: 'Baixando do YouTube...',
    uploading: 'Salvando arquivo...',
  }[job.status] || 'Processando...';

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
      <div className="flex items-start gap-3">
        <Loader2 className="h-5 w-5 text-blue-600 animate-spin mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-900">{statusText}</p>
            <span className="text-sm font-medium text-blue-900">
              {job.progress}%
            </span>
          </div>

          <Progress value={job.progress} className="h-2 mb-2" />

          {job.title && (
            <p className="text-xs text-blue-700">{job.title}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 3. Lista de Jobs Ativos

```typescript
// src/components/youtube/youtube-jobs-list.tsx

'use client';

import { useYoutubeJobs } from '@/hooks/use-youtube-download';
import { YoutubeDownloadProgress } from './youtube-download-progress';
import { Loader2 } from 'lucide-react';

export function YoutubeJobsList() {
  const { data: jobs, isLoading } = useYoutubeJobs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return null;
  }

  // Filtrar apenas jobs ativos (pending, downloading, uploading)
  const activeJobs = jobs.filter((job) =>
    ['pending', 'downloading', 'uploading'].includes(job.status)
  );

  if (activeJobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">
        Downloads do YouTube em andamento
      </h3>
      {activeJobs.map((job) => (
        <YoutubeDownloadProgress key={job.id} jobId={job.id} />
      ))}
    </div>
  );
}
```

### 4. Integração na Página de Biblioteca

```typescript
// src/app/(protected)/biblioteca-musicas/page.tsx

import { YoutubeJobsList } from '@/components/youtube/youtube-jobs-list';

export default function BibliotecaMusicasPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* ... header ... */}

      {/* Downloads do YouTube em andamento */}
      <YoutubeJobsList />

      {/* Lista de músicas */}
      {/* ... */}
    </div>
  );
}
```

---

## ⚙️ Configuração

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/process-youtube-downloads",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/process-music-stems",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

**Nota:** Cron do YouTube roda a cada 1 minuto para verificar progresso rapidamente.

### .env

```env
# Existente
CRON_SECRET=your-random-secret-here
MVSEP_API_KEY=BrIkx8zYQbvc4TggAZbsL96Mag9WN5

# Novo
VIDEO_DOWNLOAD_API_KEY=your-video-download-api-key-here
```

---

## 📝 Migração do Banco de Dados

```sql
-- prisma/migrations/XXX_add_youtube_download/migration.sql

-- Create YoutubeDownloadJob table
CREATE TABLE "YoutubeDownloadJob" (
    "id" SERIAL NOT NULL,
    "youtubeUrl" TEXT NOT NULL,
    "youtubeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "videoApiJobId" TEXT,
    "videoApiStatus" TEXT,
    "musicId" INTEGER,
    "title" TEXT,
    "duration" DOUBLE PRECISION,
    "thumbnail" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "YoutubeDownloadJob_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint
CREATE UNIQUE INDEX "YoutubeDownloadJob_musicId_key" ON "YoutubeDownloadJob"("musicId");

-- Create indexes
CREATE INDEX "YoutubeDownloadJob_status_idx" ON "YoutubeDownloadJob"("status");
CREATE INDEX "YoutubeDownloadJob_videoApiJobId_idx" ON "YoutubeDownloadJob"("videoApiJobId");
CREATE INDEX "YoutubeDownloadJob_createdAt_idx" ON "YoutubeDownloadJob"("createdAt");
CREATE INDEX "YoutubeDownloadJob_youtubeUrl_idx" ON "YoutubeDownloadJob"("youtubeUrl");

-- Add foreign key
ALTER TABLE "YoutubeDownloadJob" ADD CONSTRAINT "YoutubeDownloadJob_musicId_fkey"
  FOREIGN KEY ("musicId") REFERENCES "MusicLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

---

## 🚀 Fases de Implementação

### Fase 1: Setup e Infraestrutura ⏱️ 2-3 horas

- [ ] Adicionar modelo `YoutubeDownloadJob` no schema Prisma
- [ ] Executar migration
- [ ] Criar arquivo `src/lib/youtube/video-download-client.ts`
- [ ] Adicionar `VIDEO_DOWNLOAD_API_KEY` nas variáveis de ambiente
- [ ] Atualizar `vercel.json` com novo cron job

### Fase 2: API Backend ⏱️ 4-5 horas

- [ ] Implementar `POST /api/biblioteca-musicas/youtube`
- [ ] Implementar funções de integração com video-download-api.com
  - [ ] `startYoutubeDownload()`
  - [ ] `checkYoutubeDownloadStatus()`
  - [ ] `downloadAndSaveYoutubeMp3()`
- [ ] Implementar endpoint de status `GET /api/biblioteca-musicas/youtube/:jobId/status`
- [ ] Implementar endpoint de jobs `GET /api/biblioteca-musicas/youtube/jobs`
- [ ] Implementar cron job `/api/cron/process-youtube-downloads`
- [ ] **Integrar com MVSEP:** Criar `MusicStemJob` automaticamente após download

### Fase 3: Frontend e UX ⏱️ 4-5 horas

- [ ] Atualizar página `/biblioteca-musicas/enviar`
  - [ ] Adicionar tabs (Upload Arquivo / Link YouTube)
  - [ ] Formulário de URL do YouTube
  - [ ] Disclaimer legal robusto
  - [ ] Checkbox de confirmação obrigatório
- [ ] Criar hooks
  - [ ] `useBaixarDoYoutube()`
  - [ ] `useYoutubeDownloadStatus()`
  - [ ] `useYoutubeJobs()`
- [ ] Criar componentes
  - [ ] `YoutubeDownloadProgress`
  - [ ] `YoutubeJobsList`
- [ ] Integrar `YoutubeJobsList` na página de biblioteca

### Fase 4: Testes e Refinamentos ⏱️ 2-3 horas

- [ ] Testar download de música do YouTube
- [ ] Testar validação de URL
- [ ] Testar disclaimers e checkbox
- [ ] Testar progresso em tempo real
- [ ] Testar integração automática com MVSEP
- [ ] Testar cenários de erro (URL inválida, vídeo privado, etc.)
- [ ] Testar fila de downloads (múltiplas URLs)
- [ ] Ajustar tempos de polling
- [ ] Verificar logs e monitoramento

**Tempo Total Estimado: 12-16 horas (2-3 dias)**

---

## 💰 Estimativa de Custos

### video-download-api.com

| Cenário | Volume/Mês | Custo/Mês | Custo/Download |
|---------|------------|-----------|----------------|
| **Teste** | 100 downloads | $0.03 | $0.0003 |
| **Pequeno** | 1.000 downloads | $0.30 | $0.0003 |
| **Médio** | 10.000 downloads | $3.00 | $0.0003 |
| **Grande** | 100.000 downloads | $30.00 | $0.0003 |

**Custo por MP3 (320kbps, até 120 min):** $0.0003

### MVSEP API

- **Plano Gratuito:** €0 (1 job simultâneo)
- **Processamento:** ~5-7 minutos por música
- **Custo adicional:** $0

### Vercel Blob Storage

- **Armazenamento:** ~5-8 MB por música (MP3 original + stem percussão)
- **100 músicas:** ~500-800 MB
- **Transferência:** Custo por download

### Total Estimado (100 músicas/mês)

- video-download-api: $0.03
- MVSEP: $0.00 (grátis)
- Vercel Blob: ~$0.10-0.20 (armazenamento)
- **TOTAL: ~$0.13-0.23/mês**

---

## ⚠️ Considerações Técnicas

### 1. Conformidade Legal

- ✅ Disclaimers robustos na UI
- ✅ Checkbox de confirmação obrigatório
- ✅ Logs de auditoria (quem baixou o quê)
- ⚠️ Termos de uso claros
- ⚠️ Sistema de DMCA takedown (preparação futura)
- 🚨 **Consultar advogado antes de produção**

### 2. Limitações do video-download-api.com

- ❓ Rate limits não especificados na documentação
- ⚠️ Dependência de serviço de terceiros
- ⚠️ Sem SLA garantido
- ✅ Múltiplos endpoints regionais (fallback)

### 3. Tempo de Processamento Total

**Fluxo Completo:**

```
YouTube URL → video-download-api.com (30s-2min)
     ↓
Download MP3 (10s-30s)
     ↓
Upload Vercel Blob (5s-15s)
     ↓
TOTAL: ~1-3 minutos até música disponível
     ↓
MVSEP Processing (5-7 minutos)
     ↓
TOTAL FINAL: ~6-10 minutos até stems prontos
```

### 4. Validações e Segurança

- ✅ Validar URL do YouTube (regex patterns)
- ✅ Extrair YouTube ID corretamente
- ✅ Verificar duplicatas (mesma URL já em andamento)
- ✅ Rate limiting por usuário (futuro)
- ✅ Auditoria de downloads (logs)

### 5. Tratamento de Erros

**Cenários de Falha:**

- ❌ URL inválida → Erro imediato
- ❌ Vídeo privado/removido → Erro da API
- ❌ Copyright strike → Erro da API
- ❌ Limite de taxa → Retry com backoff
- ❌ Falha no download → Retry até 3x
- ❌ Falha no upload Blob → Retry até 2x

### 6. Monitoramento e Logs

```typescript
// Logs recomendados
console.log('[YOUTUBE] Job criado:', { jobId, youtubeUrl, userId });
console.log('[VIDEO-API] Download iniciado:', { externalId, title });
console.log('[VIDEO-API] Progresso:', { jobId, progress, status });
console.log('[VIDEO-API] MP3 baixado:', { size, sizeMB });
console.log('[VIDEO-API] Upload completo:', { blobUrl });
console.log('[VIDEO-API] Música criada:', { musicId });
console.log('[MVSEP] Job automático criado:', { musicId });
```

### 7. Otimizações Futuras

- [ ] Suporte a playlists do YouTube (múltiplas músicas)
- [ ] Extração automática de metadados (artista, álbum via API do YouTube)
- [ ] Preview antes do download (título, duração, thumbnail)
- [ ] Verificação de Creative Commons (via YouTube Data API)
- [ ] Download em lote (queue multiple URLs)
- [ ] Notificações push quando download completo

---

## 📊 Métricas de Sucesso

- ✅ Taxa de sucesso de downloads > 90%
- ✅ Tempo médio de download < 3 minutos
- ✅ Taxa de sucesso de integração MVSEP > 95%
- ✅ 0 falhas de upload para Vercel Blob
- ✅ Fila nunca excede 10 jobs pendentes
- ✅ UX transparente e clara sobre status
- ✅ Disclaimers legais visíveis e obrigatórios

---

## 🎯 Próximos Passos

1. **Revisar e aprovar este plano**
2. **⚠️ CONSULTAR ADVOGADO** sobre aspectos legais
3. **Obter API key do video-download-api.com**
4. **Criar branch `feature/youtube-download-integration`**
5. **Implementar Fase 1 (Setup)**
6. **Testar em desenvolvimento com 3-5 vídeos**
7. **Testar integração automática com MVSEP**
8. **Deploy gradual em produção** (feature flag)
9. **Monitorar primeiros downloads**
10. **Iterar baseado em feedback e métricas**

---

## ✅ Decisões Finalizadas

### 1. Abordagem de Download

- ✅ Usar **video-download-api.com** para download
- ✅ Formato: **MP3 320kbps**
- ✅ Upload para **Vercel Blob Storage**
- ✅ Processamento automático no **MVSEP**

### 2. UI/UX

- ✅ **Tabs** na página de envio (Upload / YouTube)
- ✅ **Disclaimer legal robusto** com checkbox obrigatório
- ✅ **Progresso em tempo real** via polling
- ✅ **Lista de jobs ativos** na página de biblioteca

### 3. Integração com MVSEP

- ✅ **Automática:** Criar `MusicStemJob` após download
- ✅ **Reutilizar infraestrutura** do `separacao-musica.md`
- ✅ **Cron jobs separados** (YouTube + MVSEP)
- ✅ **Resultado final:** Original + Percussão

### 4. Questões Legais

- ✅ **Disclaimers robustos** na interface
- ✅ **Checkbox de confirmação** obrigatório
- ✅ **Termos de uso claros**
- ⚠️ **Consultar advogado** antes de produção
- ⚠️ **Preparar sistema DMCA** (futuro)

---

## 📚 Referências

- [video-download-api.com Documentation](https://video-download-api.com/)
- [MVSEP API Docs](https://mvsep.com/pt/full_api)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Creative Commons Music](https://creativecommons.org/about/program-areas/arts-culture/arts-culture-resources/legalmusicforvideos/)

---

## 🔗 Integração com Plano Existente

### Relacionamento com `separacao-musica.md`

Este plano **COMPLEMENTA** o plano existente de separação de música:

1. **`separacao-musica.md`**: Upload manual → MVSEP processing
2. **`plano-youtube.md`**: YouTube URL → Download → MVSEP processing (automático)

**Infraestrutura Compartilhada:**

- ✅ Modelo `MusicStemJob` (reutilizado)
- ✅ Cron job `/api/cron/process-music-stems` (reutilizado)
- ✅ Funções MVSEP client (reutilizadas)
- ✅ Componentes de progresso (similares)

**Fluxo Unificado:**

```
ENTRADA:
- Upload de arquivo (manual) → MusicLibrary
- YouTube URL (novo) → YoutubeDownloadJob → MusicLibrary

PROCESSAMENTO:
- MusicLibrary → MusicStemJob → MVSEP → Stems

RESULTADO:
- Original + Percussão (sempre 2 versões)
```

---

## 📊 Resumo Executivo

### O Que Vamos Fazer?

Adicionar funcionalidade de **download de músicas do YouTube** com **processamento automático no MVSEP**:

1. 🔗 **Usuário cola URL do YouTube** (com disclaimer legal)
2. ⬇️ **Sistema baixa MP3 320kbps** via video-download-api.com
3. ☁️ **Upload automático para Vercel Blob**
4. 💾 **Cria registro na biblioteca de músicas**
5. 🔄 **Inicia processamento MVSEP automaticamente**
6. 🎵 **Resultado:** Original (1-3min) + Percussão (6-10min total)

### Por Que Essa Abordagem?

- ✅ **UX excelente:** Cola URL e pronto, tudo automático
- ✅ **Custo baixíssimo:** ~$0.0003 por download
- ✅ **Integração perfeita:** Reaproveita infraestrutura MVSEP
- ✅ **Transparente:** Progresso em tempo real
- ⚠️ **Risco legal:** Requer disclaimers e consulta jurídica

### Quanto Tempo/Custo?

- **Implementação:** 12-16 horas (2-3 dias)
- **Custo operacional:** ~$0.13-0.23 por 100 músicas/mês
- **Tempo de download:** 1-3 minutos por música
- **Tempo total (com MVSEP):** 6-10 minutos por música

### Diferencial Competitivo

- 🚀 **Conveniência máxima:** Cola URL e recebe música processada
- 🎨 **2 versões automáticas:** Original + Percussão
- 💡 **Caso de uso único:** Ideal para vídeos com narração
- ⚡ **Rápido:** Música disponível em minutos

---

**Status**: ✅ Pronto para implementação (após consulta jurídica)
**Complexidade**: Média-Alta
**Risco Legal**: Alto (requer atenção)
**Risco Técnico**: Baixo
**Valor**: Alto
**ROI**: Excelente (diferencial competitivo)

---

## 🎬 Exemplo de Uso Real

```
1. Usuário acessa /biblioteca-musicas/enviar
   └─> Clica em tab "Link do YouTube"

2. Cola URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   └─> Preenche: Nome, Artista, Gênero
   └─> Marca checkbox: "Confirmo que tenho direitos..."
   └─> Clica "Baixar do YouTube"

3. Sistema cria job e inicia download (1-3 min)
   └─> Usuário vê progresso em tempo real
   └─> "Baixando do YouTube... 45%"

4. Download completo, música disponível
   └─> Badge verde: "✓ Música disponível"
   └─> Pode usar imediatamente no projeto

5. Sistema inicia processamento MVSEP automaticamente (5-7 min)
   └─> "Processando separação de percussão... 60%"

6. Tudo pronto!
   └─> Original: Disponível para uso
   └─> Percussão: Disponível para uso
   └─> Usuário pode escolher qual versão usar no vídeo
```

---

**⚠️ LEMBRETE FINAL: Consulte um advogado especializado em direitos autorais e ToS de plataformas antes de implementar esta funcionalidade em produção.**
