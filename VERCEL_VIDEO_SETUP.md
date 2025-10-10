# 🚀 Guia de Configuração: Sistema de Fila de Vídeo na Vercel

Este guia descreve como configurar o sistema de fila de processamento de vídeos para funcionar automaticamente na Vercel em produção.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

- ✅ Projeto Studio Lagosta v2 configurado na Vercel
- ✅ Banco de dados PostgreSQL acessível (ex: Vercel Postgres, Supabase, Neon)
- ✅ Vercel Blob Storage configurado
- ✅ Variáveis de ambiente configuradas (veja seção abaixo)

---

## 🔐 1. Variáveis de Ambiente

Configure as seguintes variáveis de ambiente no Dashboard da Vercel:

### Variáveis Obrigatórias:

```bash
# Banco de Dados
DATABASE_URL=postgresql://user:password@host:5432/database

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxx

# Clerk (Autenticação)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxx

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### Como Configurar na Vercel:

1. Acesse: https://vercel.com/seu-usuario/seu-projeto/settings/environment-variables
2. Adicione cada variável:
   - **Key**: Nome da variável (ex: `DATABASE_URL`)
   - **Value**: Valor da variável
   - **Environments**: Selecione Production, Preview e Development
3. Clique em **Save**

---

## ⏰ 2. Configurar Vercel Cron Job

O Vercel Cron permite executar funções automaticamente em intervalos regulares. Vamos configurar um cron job para processar a fila de vídeos.

### 2.1 Criar arquivo `vercel.json`

Na **raiz do projeto**, crie ou edite o arquivo `vercel.json`:

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

**Explicação:**
- `path`: Endpoint da API que processa a fila
- `schedule`: Cron expression no formato UTC
  - `*/2 * * * *` = A cada 2 minutos
  - `*/5 * * * *` = A cada 5 minutos (recomendado para produção)
  - `*/10 * * * *` = A cada 10 minutos (para economia de execuções)

### 2.2 Sintaxe Cron

```
┌───────────── minuto (0 - 59)
│ ┌─────────── hora (0 - 23)
│ │ ┌───────── dia do mês (1 - 31)
│ │ │ ┌─────── mês (1 - 12)
│ │ │ │ ┌───── dia da semana (0 - 6) (Domingo = 0)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

**Exemplos:**

| Expressão | Descrição |
|-----------|-----------|
| `*/2 * * * *` | A cada 2 minutos |
| `*/5 * * * *` | A cada 5 minutos |
| `0 * * * *` | A cada hora (minuto 0) |
| `0 0 * * *` | Todos os dias à meia-noite |
| `0 9 * * 1` | Toda segunda-feira às 9h |

### 2.3 Commit e Deploy

```bash
# Adicionar arquivo ao git
git add vercel.json

# Commit
git commit -m "🚀 Adiciona Vercel Cron para processamento de vídeo"

# Push para deploy
git push origin main
```

**⚠️ Importante:** O Vercel Cron **só funciona em produção**. Não funciona em preview ou desenvolvimento local.

---

## 🧪 3. Testar o Cron Job

### 3.1 Verificar se o Cron foi Registrado

Após o deploy:

1. Acesse: https://vercel.com/seu-usuario/seu-projeto/settings/crons
2. Você deve ver o cron job listado:
   - **Path**: `/api/video-processing/process`
   - **Schedule**: `*/2 * * * *`
   - **Status**: Active

### 3.2 Testar Manualmente

Você pode testar o endpoint manualmente antes do cron executar:

```bash
# Substituir pela URL do seu projeto na Vercel
curl -X POST https://seu-projeto.vercel.app/api/video-processing/process
```

**Resposta esperada (sem jobs):**
```json
{
  "message": "No pending jobs"
}
```

**Resposta esperada (com job processado):**
```json
{
  "success": true,
  "jobId": "cmgl0zf9t0002swkwxevo9b9b",
  "mp4Url": "https://..."
}
```

### 3.3 Ver Logs do Cron

Para ver os logs de execução do cron:

```bash
# Via CLI da Vercel
vercel logs --follow

# Ou no Dashboard
# https://vercel.com/seu-usuario/seu-projeto/logs
```

Filtrar por `[Video Processor]` para ver apenas logs do processamento de vídeo.

---

## 🔍 4. Monitoramento

### 4.1 Ver Jobs na Fila (SQL)

Execute no seu cliente PostgreSQL:

```sql
-- Jobs pendentes
SELECT id, "videoName", status, progress, "createdAt"
FROM "VideoProcessingJob"
WHERE status = 'PENDING'
ORDER BY "createdAt" ASC;

-- Jobs processando
SELECT id, "videoName", status, progress, "startedAt", "createdAt"
FROM "VideoProcessingJob"
WHERE status = 'PROCESSING';

-- Jobs completos (últimos 10)
SELECT id, "videoName", status, "mp4ResultUrl", "completedAt"
FROM "VideoProcessingJob"
WHERE status = 'COMPLETED'
ORDER BY "completedAt" DESC
LIMIT 10;

-- Jobs falhados
SELECT id, "videoName", status, "errorMessage", "createdAt"
FROM "VideoProcessingJob"
WHERE status = 'FAILED'
ORDER BY "createdAt" DESC;
```

### 4.2 Dashboard de Monitoramento (Opcional)

Você pode criar uma página `/admin/video-jobs` para monitorar a fila:

```tsx
// src/app/admin/video-jobs/page.tsx
export default async function VideoJobsPage() {
  const jobs = await db.videoProcessingJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <div>
      <h1>Jobs de Vídeo</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id}>
              <td>{job.id}</td>
              <td>{job.videoName}</td>
              <td>{job.status}</td>
              <td>{job.progress}%</td>
              <td>{job.createdAt.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 🛠️ 5. Desenvolvimento Local

Durante o desenvolvimento local, o Vercel Cron **não funciona**. Use o script fornecido:

### 5.1 Rodar o Worker Local

```bash
# Em um terminal separado
bash scripts/process-video-queue.sh
```

Isso processará a fila a cada 10 segundos automaticamente.

### 5.2 Processar Manualmente (Uma Vez)

```bash
# Processar o próximo job PENDING uma vez
curl -X POST http://localhost:3000/api/video-processing/process
```

---

## 📊 6. Limites e Considerações

### Limites do Vercel Cron

| Plano | Máximo de Crons | Frequência Mínima |
|-------|-----------------|-------------------|
| **Hobby** | 2 cron jobs | A cada minuto |
| **Pro** | 10 cron jobs | A cada minuto |
| **Enterprise** | Ilimitado | A cada minuto |

### Limites de Execução

- **Timeout**: 10 segundos (Hobby), 60 segundos (Pro), 900 segundos (Enterprise)
- **Importante**: Se um job demorar mais que o timeout, ele será cancelado

### Recomendações

1. **Frequência Ideal**: `*/5 * * * *` (a cada 5 minutos)
   - Balanceia processamento rápido com economia de execuções
   - Evita timeouts por processamento simultâneo

2. **Jobs Grandes**: Se vídeos demorarem >60s para processar:
   - Considere usar AWS Lambda ou serviço dedicado
   - Ou dividir processamento em etapas menores

3. **Fallback**: Sempre mantenha `scripts/process-video-queue.sh` para processar manualmente se necessário

---

## 🚨 7. Troubleshooting

### Problema: Cron não executa

**Possíveis causas:**
- Cron está configurado apenas em preview (precisa estar em production)
- `vercel.json` não foi commitado ou fez push
- Path do endpoint está incorreto

**Solução:**
```bash
# Verificar se vercel.json está no git
git status

# Fazer deploy novamente
git push origin main

# Verificar no Dashboard da Vercel
# Settings → Crons → deve estar listado
```

### Problema: Job fica PENDING para sempre

**Causa:** Worker não está rodando (cron não configurado)

**Solução:**
1. Verificar se cron está ativo no Vercel Dashboard
2. Rodar worker manualmente: `bash scripts/process-video-queue.sh`
3. Processar job específico via SQL:
   ```sql
   -- Marcar job como PENDING novamente
   UPDATE "VideoProcessingJob"
   SET status = 'PENDING'
   WHERE id = 'job_id_aqui';
   ```

### Problema: Job falha com erro de timeout

**Causa:** Processamento demora mais que limite do Vercel (60s Pro)

**Solução:**
1. Otimizar conversão de vídeo (reduzir qualidade/resolução)
2. Migrar para serviço externo (AWS Lambda, Cloudinary)
3. Dividir processamento em etapas

### Problema: Upload para Vercel Blob falha

**Causa:** Token `BLOB_READ_WRITE_TOKEN` inválido ou não configurado

**Solução:**
```bash
# Verificar variável de ambiente
vercel env ls

# Regenerar token no Vercel Dashboard
# Storage → Blob → Regenerate Token
```

---

## ✅ 8. Checklist de Deploy

Antes de fazer deploy para produção:

- [ ] Variáveis de ambiente configuradas na Vercel
- [ ] `vercel.json` criado com cron job
- [ ] `vercel.json` commitado no git
- [ ] Push para branch `main` feito
- [ ] Deploy concluído na Vercel
- [ ] Cron job aparece em Settings → Crons
- [ ] Endpoint testado manualmente
- [ ] Logs do cron verificados (após primeira execução)
- [ ] Teste completo: Exportar vídeo → Aguardar processamento → Verificar em Criativos

---

## 📚 9. Recursos Adicionais

- [Documentação Vercel Cron](https://vercel.com/docs/cron-jobs)
- [Cron Expression Generator](https://crontab.guru/)
- [Vercel Blob Storage Docs](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Logs](https://vercel.com/docs/observability/logs)

---

## 🎯 Conclusão

Após seguir este guia, seu sistema de fila de vídeos estará totalmente funcional em produção:

✅ Vídeos são automaticamente processados em background
✅ Usuários recebem notificações quando o vídeo está pronto
✅ Vídeos aparecem automaticamente na aba Criativos
✅ Sistema escala automaticamente com a Vercel

**Frequência recomendada:** `*/5 * * * *` (a cada 5 minutos)

Para desenvolvimento local, use: `bash scripts/process-video-queue.sh`

---

**Criado por:** Claude Code
**Data:** 2025-01-10
**Versão:** 1.0
