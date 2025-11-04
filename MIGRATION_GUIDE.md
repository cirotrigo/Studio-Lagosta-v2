# 🔄 Guia de Migração: Status PROCESSING/SENT → POSTING/POSTED

## 📋 Resumo da Mudança

**Status Antigos → Novos:**
- `PROCESSING` → `POSTING`
- `SENT` → `POSTED`

**Motivo:** Simplificar o fluxo e usar nomes mais claros que refletem o estado real do post.

---

## 🚀 Passos para Migração

### **PASSO 1: Backup do Banco de Dados**

```bash
# Fazer backup antes de qualquer migração
pg_dump $DATABASE_URL > backup-before-status-migration-$(date +%Y%m%d).sql
```

---

### **PASSO 2: Migrar Dados Existentes**

Execute o SQL de migração:

```bash
psql $DATABASE_URL < migrate-post-status.sql
```

**OU execute manualmente no banco:**

```sql
-- 1. Atualizar PROCESSING → POSTING
UPDATE "SocialPost"
SET status = 'POSTING'
WHERE status = 'PROCESSING';

-- 2. Atualizar SENT → POSTED
UPDATE "SocialPost"
SET status = 'POSTED'
WHERE status = 'SENT';

-- 3. Verificar resultado
SELECT status, COUNT(*) as count
FROM "SocialPost"
GROUP BY status
ORDER BY status;
```

**Resultado esperado:**
```
   status   | count
------------+-------
 DRAFT      |    15
 SCHEDULED  |     8
 POSTING    |     0  ← (antigos PROCESSING)
 POSTED     |    42  ← (antigos SENT)
 FAILED     |     3
```

---

### **PASSO 3: Atualizar Schema do Prisma**

O schema já foi atualizado em `prisma/schema.prisma`:

```prisma
enum PostStatus {
  DRAFT
  SCHEDULED
  POSTING    // Novo: substituiu PROCESSING
  POSTED     // Novo: substituiu SENT
  FAILED
}
```

---

### **PASSO 4: Push do Schema**

Como os dados já foram migrados, agora podemos fazer o push sem perda de dados:

```bash
npx prisma db push --accept-data-loss
```

**⚠️ ATENÇÃO:** Use `--accept-data-loss` apenas porque já migramos os dados manualmente antes!

---

### **PASSO 5: Regenerar Prisma Client**

```bash
npx prisma generate
```

---

### **PASSO 6: Verificar Tipos TypeScript**

```bash
npm run typecheck
```

**Se houver erros de tipo,** procure por:
- `PostStatus.PROCESSING` → Substituir por `PostStatus.POSTING`
- `PostStatus.SENT` → Substituir por `PostStatus.POSTED`
- `status === 'PROCESSING'` → Substituir por `status === 'POSTING'`
- `status === 'SENT'` → Substituir por `status === 'POSTED'`

---

### **PASSO 7: Testar Localmente**

```bash
npm run dev
```

**Testes a fazer:**
1. ✅ Criar novo post
2. ✅ Enviar post (deve ficar como `POSTING`)
3. ✅ Chamar webhook de confirmação (deve mudar para `POSTED`)
4. ✅ Verificar UI mostra "Postando..." e depois "Postado"

---

### **PASSO 8: Deploy**

```bash
git add .
git commit -m "feat: Simplify post status (PROCESSING→POSTING, SENT→POSTED)"
git push origin main
```

**No Vercel/servidor:**
1. Deploy será feito automaticamente
2. Executar migração SQL no banco de produção
3. Verificar logs para confirmar que tudo funcionou

---

## 🧪 Script de Teste do Webhook

```bash
#!/bin/bash

# Teste de confirmação de post
curl -X POST https://seu-dominio.com/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d '{
    "status": "sent",
    "buffer_update_id": "test_12345",
    "user_email": "seu-email@gmail.com",
    "sent_at": '$(date +%s)'
  }'
```

---

## 📊 Verificação Pós-Migração

### **Checklist de Verificação:**

**Banco de Dados:**
- [ ] Nenhum post com status `PROCESSING` ou `SENT`
- [ ] Posts antigos foram migrados para `POSTING` e `POSTED`
- [ ] Enum `PostStatus` contém apenas: `DRAFT, SCHEDULED, POSTING, POSTED, FAILED`

**Código:**
- [ ] Nenhuma referência a `PostStatus.PROCESSING` ou `PostStatus.SENT`
- [ ] Webhook atualizado para usar novos status
- [ ] Scheduler atualizado para marcar como `POSTING`
- [ ] UI mostra "Postando..." e "Postado" corretamente

**Zapier:**
- [ ] Webhook de confirmação funcionando
- [ ] Posts sendo marcados como `POSTED` após publicação
- [ ] Logs do webhook mostrando sucesso

---

## ⚠️ Rollback (Se Necessário)

Se algo der errado, você pode reverter:

### **1. Restaurar backup:**
```bash
psql $DATABASE_URL < backup-before-status-migration-YYYYMMDD.sql
```

### **2. Reverter código:**
```bash
git revert HEAD
git push origin main
```

### **3. Reverter schema:**
```prisma
enum PostStatus {
  DRAFT
  SCHEDULED
  PROCESSING
  SENT
  FAILED
}
```

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

---

## 🎯 Diferenças Importantes

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Status ao enviar** | `PROCESSING` | `POSTING` |
| **Status após confirmar** | `SENT` | `POSTED` |
| **Label na UI** | "Processando" / "Enviado" | "Postando..." / "Postado" |
| **Campo publishedUrl** | Buscado via Instagram API | ❌ Removido (simplificado) |
| **Campo instagramMediaId** | Necessário | ⚠️ Opcional (não usado) |
| **Identificação do post** | Via `studio_post_id` | Via último post `POSTING` |

---

## ✅ Finalizado!

Após completar todos os passos, o sistema estará:
- ✅ Usando novos status mais claros
- ✅ Simplificado (sem API do Instagram)
- ✅ Funcional com dados que o Buffer já retorna
- ✅ Mais fácil de debugar e manter
