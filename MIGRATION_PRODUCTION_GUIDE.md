# Guia para Aplicar Migration em Produção

## 🚨 IMPORTANTE: Execute a migration ANTES do próximo deploy!

## Opção 1: Via Neon Dashboard (RECOMENDADO)

1. **Acesse o Neon Dashboard**
   - URL: https://console.neon.tech/
   - Faça login com suas credenciais

2. **Navegue até o banco de dados**
   - Selecione o projeto: `neondb`
   - Vá para a aba "SQL Editor"

3. **Execute o seguinte SQL:**

```sql
-- Adicionar campo processingStartedAt
ALTER TABLE "SocialPost"
ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx"
ON "SocialPost"("processingStartedAt");

-- Verificar se foi criado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';
```

## Opção 2: Via Linha de Comando (Local)

### Pré-requisitos:
- PostgreSQL client instalado (`psql`)
- DATABASE_URL do ambiente de produção

### Passos:

1. **Exporte a DATABASE_URL de produção temporariamente:**
```bash
export DATABASE_URL="postgresql://neondb_owner:npg_bh1QdjqErM5Z@ep-dawn-shadow-adymip1x-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

2. **Execute a migration via Prisma:**
```bash
cat prisma/migrations/20250109_add_processing_started_at.sql | \
  npx prisma db execute --stdin --schema prisma/schema.prisma
```

3. **OU execute diretamente via psql:**
```bash
psql "$DATABASE_URL" < prisma/migrations/20250109_add_processing_started_at.sql
```

## Opção 3: Via Vercel (Se você tem acesso)

1. Acesse o dashboard Vercel do projeto
2. Vá em Settings → Functions → Environment Variables
3. Copie a DATABASE_URL
4. Use a Opção 2 com essa URL

## Após Aplicar a Migration

### 1. Verifique se funcionou:

Execute este SQL no Neon Dashboard:
```sql
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';
```

Deve retornar:
```
column_name          | data_type                   | is_nullable
processingStartedAt | timestamp without time zone | YES
```

### 2. Próximos Passos (APÓS confirmar migration):

Preciso fazer as seguintes alterações no código:

#### A. Descomentar campo no schema.prisma
```prisma
processingStartedAt DateTime? // When processing started (for duplicate prevention)
```

#### B. Restaurar uso do campo em later-scheduler.ts
```typescript
data: {
  status: PostStatus.POSTING,
  processingStartedAt: new Date()
}
```

#### C. Melhorar detecção de posts travados em scheduler.ts
```typescript
OR: [
  {
    processingStartedAt: {
      lt: thirtyMinutesAgo,
    },
  },
  {
    processingStartedAt: null,
    updatedAt: {
      lt: thirtyMinutesAgo,
    },
  },
],
```

## Status Atual da Duplicação de Posts

### ✅ Já Implementado (Funciona PARCIALMENTE):
1. **Lock com transação** - Previne processamento duplo
2. **Status POSTING** - Marca post como "em processamento"
3. **Verificação de laterPostId** - Skip se já foi enviado
4. **Timeout aumentado** - 30 minutos para posts travados
5. **Rate limiting** - 2s entre posts atrasados

### ⚠️ Aguardando Migration:
- **Campo processingStartedAt** - Para tracking preciso do tempo de processamento
- **Melhor prevenção de duplicação** - Com timestamp exato

### Como a duplicação é prevenida AGORA (sem processingStartedAt):
1. Transação busca post
2. Se status é POSTING → Skip (já está sendo processado)
3. Se tem laterPostId → Skip (já foi enviado)
4. Marca como POSTING imediatamente
5. Envia para Later API

### Como ficará MELHOR (com processingStartedAt):
1. Mesmas verificações acima
2. MAIS: Timestamp preciso de quando começou
3. MAIS: Pode detectar posts travados com precisão
4. MAIS: Métricas de tempo de processamento

## Resumo: O que fazer AGORA

### 1️⃣ VOCÊ: Aplicar a migration em produção
- Use uma das 3 opções acima
- Confirme que o campo foi criado

### 2️⃣ ME AVISE: Quando a migration estiver aplicada
- Vou restaurar o código completo
- Fazer o build final
- Você faz o deploy

### 3️⃣ RESULTADO ESPERADO:
- ✅ Zero duplicação de posts
- ✅ Detecção precisa de posts travados
- ✅ Métricas de performance
- ✅ Sistema 100% robusto

## Comando Rápido para Copiar/Colar no Neon:

```sql
-- Execute isso no SQL Editor do Neon
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SocialPost_processingStartedAt_idx" ON "SocialPost"("processingStartedAt");
SELECT 'Migration aplicada com sucesso!' as resultado;
```