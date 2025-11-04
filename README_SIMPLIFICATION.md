# 📚 Documentação: Simplificação do Sistema de Posts

## 🎯 O que foi feito?

O sistema de postagem foi **simplificado** para eliminar dependências de campos customizados do Buffer e da API do Instagram. Agora o fluxo é mais robusto e usa apenas dados que o Buffer já retorna nativamente.

---

## 📖 Documentação Disponível

### **1. Resumo Executivo**
📄 [SIMPLIFICATION_SUMMARY.md](SIMPLIFICATION_SUMMARY.md)

**Conteúdo:**
- Visão geral das mudanças
- Fluxo simplificado
- Vantagens da nova abordagem
- Comparativo antes/depois
- Arquivos modificados

**Leia primeiro se você quer:** Entender rapidamente o que mudou e por quê.

---

### **2. Guia de Migração**
📄 [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

**Conteúdo:**
- Passos detalhados de migração
- Scripts SQL para atualizar dados
- Comandos Prisma
- Verificações pós-migração
- Rollback (se necessário)

**Leia se você vai:** Aplicar as mudanças no banco de dados e fazer deploy.

---

### **3. Configuração do Zapier**
📄 [ZAPIER_SETUP_SIMPLIFIED.md](ZAPIER_SETUP_SIMPLIFIED.md)

**Conteúdo:**
- Configuração do Zap de confirmação
- Mapeamento de campos do Buffer
- Testes do webhook
- Troubleshooting
- Logs e debugging

**Leia se você vai:** Configurar ou debugar o Zapier.

---

## 🚀 Scripts Prontos para Usar

### **Script de Deploy**
```bash
./DEPLOY_COMMANDS.sh
```

**O que faz:**
1. ✅ Backup do banco de dados
2. ✅ Migração de dados (PROCESSING→POSTING, SENT→POSTED)
3. ✅ Atualização do schema Prisma
4. ✅ Regeneração do Prisma Client
5. ✅ Type checking
6. ✅ Build do projeto

📄 **Arquivo:** [DEPLOY_COMMANDS.sh](DEPLOY_COMMANDS.sh)

---

### **Script de Teste do Webhook**
```bash
./test-webhook-simplified.sh
```

**O que faz:**
1. ✅ Teste de confirmação de sucesso
2. ✅ Teste de confirmação de falha
3. ✅ Teste de segurança (webhook secret inválido)
4. ✅ Teste de validação (campos ausentes)

📄 **Arquivo:** [test-webhook-simplified.sh](test-webhook-simplified.sh)

---

### **Script SQL de Migração**
```bash
psql $DATABASE_URL < migrate-post-status.sql
```

**O que faz:**
1. ✅ Atualiza PROCESSING → POSTING
2. ✅ Atualiza SENT → POSTED
3. ✅ Mostra contagem por status

📄 **Arquivo:** [migrate-post-status.sql](migrate-post-status.sql)

---

## 🔄 Fluxo Simplificado

```
┌─────────────────────┐
│  STUDIO LAGOSTA     │
│  Status: POSTING 🔵 │
└──────────┬──────────┘
           │ (envia webhook)
           ↓
┌─────────────────────┐
│      ZAPIER         │
│  Cria post Buffer   │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│      BUFFER         │
│  Publica Instagram  │
└──────────┬──────────┘
           │ (trigger: New Sent Update)
           ↓
┌─────────────────────┐
│      ZAPIER         │
│  Envia confirmação  │
└──────────┬──────────┘
           │ (webhook)
           ↓
┌─────────────────────┐
│  STUDIO LAGOSTA     │
│  Status: POSTED ✅  │
└─────────────────────┘
```

---

## 📋 Checklist Rápido

### **Antes de Deploy:**

- [ ] Ler [SIMPLIFICATION_SUMMARY.md](SIMPLIFICATION_SUMMARY.md)
- [ ] Ler [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- [ ] Backup do banco de dados
- [ ] Testar localmente

### **Deploy:**

- [ ] Executar `./DEPLOY_COMMANDS.sh`
- [ ] Verificar logs
- [ ] Testar com `./test-webhook-simplified.sh`
- [ ] Commit e push

### **Configuração Zapier:**

- [ ] Ler [ZAPIER_SETUP_SIMPLIFIED.md](ZAPIER_SETUP_SIMPLIFIED.md)
- [ ] Configurar Zap de confirmação
- [ ] Testar com post real
- [ ] Monitorar logs

---

## 🎯 Status dos Posts

| Status | Significado | Cor | Label UI |
|--------|-------------|-----|----------|
| `DRAFT` | Rascunho | Cinza | "Rascunho" |
| `SCHEDULED` | Agendado | Azul | "Agendado" |
| `POSTING` | Enviando | Amarelo | "Postando..." |
| `POSTED` | Publicado | Verde | "Postado" |
| `FAILED` | Falhou | Vermelho | "Falhou" |

---

## 🔧 Configuração do Webhook

**URL:**
```
https://seu-dominio.com/api/webhooks/buffer/post-sent
```

**Headers:**
```
x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941
Content-Type: application/json
```

**Payload (JSON):**
```json
{
  "status": "sent",
  "buffer_update_id": "{{id}}",
  "user_email": "{{user__email}}",
  "sent_at": {{created_at}}
}
```

---

## 🐛 Troubleshooting

### **Post não atualiza para POSTED**

1. Verificar logs do webhook:
   ```bash
   pm2 logs studio-lagosta --lines 100 | grep "Buffer webhook"
   ```

2. Verificar posts POSTING:
   ```sql
   SELECT id, status, "createdAt"
   FROM "SocialPost"
   WHERE status = 'POSTING'
   ORDER BY "createdAt" DESC;
   ```

3. Testar webhook manualmente:
   ```bash
   ./test-webhook-simplified.sh
   ```

### **Erro "No pending post found"**

**Causa:** Nenhum post com status `POSTING` encontrado.

**Solução:**
1. Criar post no Studio Lagosta
2. Clicar "Publicar Agora"
3. Verificar que status = `POSTING`
4. Enviar webhook de teste

### **Posts antigos em POSTING**

**Limpar posts travados (>5 minutos):**
```sql
UPDATE "SocialPost"
SET status = 'FAILED',
    "errorMessage" = 'Timeout - webhook não recebido',
    "failedAt" = NOW()
WHERE status = 'POSTING'
  AND "createdAt" < NOW() - INTERVAL '5 minutes';
```

---

## 📊 Arquivos Modificados

### **Backend:**
- ✅ [prisma/schema.prisma](prisma/schema.prisma) - Novos status
- ✅ [src/app/api/webhooks/buffer/post-sent/route.ts](src/app/api/webhooks/buffer/post-sent/route.ts) - Webhook simplificado
- ✅ [src/lib/posts/scheduler.ts](src/lib/posts/scheduler.ts) - Status POSTING

### **Frontend:**
- ✅ [src/components/agenda/post-actions/post-preview-modal.tsx](src/components/agenda/post-actions/post-preview-modal.tsx) - UI atualizada
- ✅ [src/components/agenda/mobile/mobile-post-card.tsx](src/components/agenda/mobile/mobile-post-card.tsx) - UI mobile

### **Documentação:**
- ✅ [SIMPLIFICATION_SUMMARY.md](SIMPLIFICATION_SUMMARY.md) - Resumo
- ✅ [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Guia de migração
- ✅ [ZAPIER_SETUP_SIMPLIFIED.md](ZAPIER_SETUP_SIMPLIFIED.md) - Configuração Zapier
- ✅ [migrate-post-status.sql](migrate-post-status.sql) - Script SQL
- ✅ [DEPLOY_COMMANDS.sh](DEPLOY_COMMANDS.sh) - Script de deploy
- ✅ [test-webhook-simplified.sh](test-webhook-simplified.sh) - Script de teste

---

## 💡 Próximos Passos

### **1. Aplicar Migração**
```bash
./DEPLOY_COMMANDS.sh
```

### **2. Configurar Zapier**
Seguir [ZAPIER_SETUP_SIMPLIFIED.md](ZAPIER_SETUP_SIMPLIFIED.md)

### **3. Testar**
```bash
./test-webhook-simplified.sh
```

### **4. Deploy em Produção**
```bash
git add .
git commit -m "feat: Simplify post status (PROCESSING→POSTING, SENT→POSTED)"
git push origin main
```

---

## 🎉 Resultado

Sistema **simplificado e funcional** que:
- ✅ Não depende de campos customizados
- ✅ Não precisa de Instagram API
- ✅ Identifica posts automaticamente
- ✅ Fácil de debugar
- ✅ Menos código = menos bugs

---

**Data:** 2025-01-04
**Versão:** 1.0 (Simplificada)
**Status:** ✅ Pronto para uso
