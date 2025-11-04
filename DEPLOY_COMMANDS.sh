#!/bin/bash

# 🚀 Script de Deploy - Simplificação de Status de Posts
# Execute este script para aplicar todas as mudanças

set -e  # Parar se houver erro

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 DEPLOY: Simplificação de Status de Posts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ========================================
# PASSO 1: Backup do Banco de Dados
# ========================================
echo "📦 PASSO 1: Fazendo backup do banco de dados..."
BACKUP_FILE="backup-before-status-migration-$(date +%Y%m%d-%H%M%S).sql"

if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  ATENÇÃO: DATABASE_URL não está definida!"
  echo "   Execute: export DATABASE_URL='sua-connection-string'"
  exit 1
fi

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
echo "✅ Backup criado: $BACKUP_FILE"
echo ""

# ========================================
# PASSO 2: Migrar Dados Existentes
# ========================================
echo "🔄 PASSO 2: Migrando status dos posts existentes..."
echo "   PROCESSING → POSTING"
echo "   SENT → POSTED"
echo ""

# Verificar posts antes da migração
echo "📊 Status ANTES da migração:"
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) as count FROM \"SocialPost\" GROUP BY status ORDER BY status;"
echo ""

# Executar migração
psql "$DATABASE_URL" < migrate-post-status.sql

echo "📊 Status DEPOIS da migração:"
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) as count FROM \"SocialPost\" GROUP BY status ORDER BY status;"
echo ""

# ========================================
# PASSO 3: Atualizar Schema do Prisma
# ========================================
echo "📝 PASSO 3: Atualizando schema do Prisma..."
npx prisma db push --accept-data-loss
echo "✅ Schema atualizado no banco"
echo ""

# ========================================
# PASSO 4: Regenerar Prisma Client
# ========================================
echo "🔧 PASSO 4: Regenerando Prisma Client..."
npx prisma generate
echo "✅ Prisma Client regenerado"
echo ""

# ========================================
# PASSO 5: Type Checking
# ========================================
echo "🔍 PASSO 5: Verificando tipos TypeScript..."
npm run typecheck
echo "✅ Tipos verificados com sucesso"
echo ""

# ========================================
# PASSO 6: Build
# ========================================
echo "🏗️  PASSO 6: Fazendo build do projeto..."
npm run build
echo "✅ Build concluído"
echo ""

# ========================================
# FINALIZAÇÃO
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Próximos passos:"
echo ""
echo "1. Testar webhook localmente:"
echo "   bash test-webhook-local.sh"
echo ""
echo "2. Configurar Zapier (ver ZAPIER_SETUP_SIMPLIFIED.md):"
echo "   - Zap 2: Buffer → Studio Lagosta"
echo "   - Payload: status, buffer_update_id, user_email, sent_at"
echo ""
echo "3. Fazer commit e push:"
echo "   git add ."
echo "   git commit -m \"feat: Simplify post status (PROCESSING→POSTING, SENT→POSTED)\""
echo "   git push origin main"
echo ""
echo "4. Aplicar migração em produção:"
echo "   psql \$DATABASE_URL_PRODUCTION < migrate-post-status.sql"
echo ""
echo "📚 Documentação completa em:"
echo "   - SIMPLIFICATION_SUMMARY.md"
echo "   - MIGRATION_GUIDE.md"
echo "   - ZAPIER_SETUP_SIMPLIFIED.md"
echo ""
echo "🎉 Pronto para usar!"
echo ""
