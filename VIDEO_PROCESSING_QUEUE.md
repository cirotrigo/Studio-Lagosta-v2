# 🎬 Sistema de Fila de Processamento de Vídeo

## 📋 Visão Geral

Este sistema permite que usuários exportem vídeos MP4 em **background**, sem bloquear a interface. O vídeo é processado na fila e o usuário é notificado quando estiver pronto.

---

## 🏗️ Arquitetura

### Fluxo Completo:

```
1. Usuário clica em "Exportar Vídeo MP4"
   ↓
2. Sistema gera WebM localmente (MediaRecorder)
   ↓
3. WebM é enviado para Vercel Blob Storage
   ↓
4. Job é criado na tabela VideoProcessingJob (status: PENDING)
   ↓
5. Worker processa o job (conversão WebM → MP4)
   ↓
6. MP4 é salvo no Vercel Blob
   ↓
7. Job atualizado (status: COMPLETED)
   ↓
8. Usuário recebe notificação (toast)
   ↓
9. Vídeo aparece na aba Criativos
```

---

## 📦 Componentes

### 1. **Schema Prisma** (`prisma/schema.prisma`)
```prisma
model VideoProcessingJob {
  id              String
  userId          String
  status          VideoProcessingStatus (PENDING/PROCESSING/COMPLETED/FAILED)
  webmBlobUrl     String  // URL do WebM original
  mp4ResultUrl    String? // URL do MP4 convertido
  progress        Int     // 0-100
  // ... outros campos
}
```

### 2. **APIs**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/video-processing/queue` | POST | Adiciona vídeo à fila |
| `/api/video-processing/status/[jobId]` | GET | Consulta status do job |
| `/api/video-processing/process` | POST | Processa o próximo job PENDING |

### 3. **Componente UI**
- `VideoExportQueueButton`: Botão que adiciona vídeo à fila
- Polling automático para atualizar status
- Toast de notificação quando pronto

---

## 🚀 Como Ativar o Processamento

### **Opção 1: Cron Job (Vercel - Recomendado)**

1. Crie `vercel.json` na raiz do projeto:

```json
{
  "crons": [
    {
      "path": "/api/video-processing/process",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

Isso executa o worker **a cada 2 minutos**.

2. Deploy no Vercel:
```bash
vercel --prod
```

### **Opção 2: Chamada Manual (Desenvolvimento)**

Abra outra aba do terminal e execute:

```bash
# A cada 10 segundos, processar a fila
while true; do
  curl -X POST http://localhost:3000/api/video-processing/process
  sleep 10
done
```

### **Opção 3: Webhook/Trigger Externo**

Você pode chamar a API de processamento via:
- **GitHub Actions**
- **AWS EventBridge**
- **n8n/Zapier**

---

## 🔧 Configuração

### **1. Variáveis de Ambiente**

Certifique-se de ter configurado:

```env
# Vercel Blob Storage (obrigatório)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Banco de dados
DATABASE_URL=postgresql://...

# Clerk (auth)
CLERK_SECRET_KEY=sk_...
```

### **2. Headers COOP/COEP** (Opcional para MP4)

Se quiser converter MP4 no cliente, adicione em `next.config.ts`:

```typescript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    ],
  }]
}
```

---

## 🎯 TODO: Conversão Real de MP4

Atualmente, o worker **simula** a conversão copiando o WebM.

### Para implementar conversão real:

**Opção A: FFmpeg.wasm (Server-side)**
```typescript
// Instalar: npm install @ffmpeg/ffmpeg @ffmpeg/util
import { FFmpeg } from '@ffmpeg/ffmpeg'

// No worker process
const ffmpeg = new FFmpeg()
await ffmpeg.load()
await ffmpeg.writeFile('input.webm', webmData)
await ffmpeg.exec(['-i', 'input.webm', 'output.mp4'])
const mp4Data = await ffmpeg.readFile('output.mp4')
```

**Opção B: API Externa (Cloudinary, Mux, etc.)**
```typescript
// Enviar WebM para Cloudinary
const result = await cloudinary.uploader.upload(webmUrl, {
  resource_type: 'video',
  format: 'mp4',
})
```

**Opção C: AWS Lambda + FFmpeg Layer**
- Criar Lambda com FFmpeg binary
- Enviar WebM para Lambda
- Lambda retorna MP4

---

## 📊 Monitoramento

### Ver jobs na fila:

```sql
-- Jobs pendentes
SELECT * FROM "VideoProcessingJob" WHERE status = 'PENDING';

-- Jobs processando
SELECT * FROM "VideoProcessingJob" WHERE status = 'PROCESSING';

-- Jobs falhados
SELECT * FROM "VideoProcessingJob" WHERE status = 'FAILED';
```

### Logs:

```bash
# Ver logs do worker (se usando cron)
vercel logs --follow

# Ver logs locais
tail -f .next/server-logs.txt
```

---

## 🐛 Troubleshooting

### **Job fica PENDING para sempre**

**Causa:** Worker não está rodando

**Solução:**
- Verificar se cron está ativo no Vercel
- Ou rodar worker manualmente

### **Erro "Créditos insuficientes"**

**Causa:** Usuário sem créditos antes de adicionar à fila

**Solução:**
- Sistema já valida créditos antes de criar job
- Adicionar créditos ao usuário

### **Upload falha no Vercel Blob**

**Causa:** Token não configurado ou inválido

**Solução:**
```bash
# Verificar token
echo $BLOB_READ_WRITE_TOKEN

# Regenerar token no Vercel Dashboard
```

---

## 📈 Melhorias Futuras

- [ ] Retry automático para jobs falhados
- [ ] Notificação por email quando vídeo estiver pronto
- [ ] Dashboard de jobs na interface admin
- [ ] Limite de jobs simultâneos por usuário
- [ ] Priorização de jobs (usuários premium primeiro)
- [ ] Webhook para notificar conclusão de job
- [ ] Integração com Google Drive (upload automático)

---

**Criado em:** 2025-01-10
**Versão:** 1.0
