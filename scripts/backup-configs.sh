#!/bin/bash

# Script para fazer backup apenas das configurações do banco local
# Exclui dados de usuários, projetos e gerações de teste

set -e

echo "🗄️  Backup de Configurações - Studio Lagosta"
echo "==========================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database local
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:5432/saas_template"

# Verificar se banco está acessível
echo "Verificando conexão com banco local..."
if ! psql "$LOCAL_DB" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Não foi possível conectar ao banco local"
    echo "Verifique se PostgreSQL está rodando em 127.0.0.1:5432"
    exit 1
fi
echo -e "${GREEN}✓${NC} Conectado ao banco local"
echo ""

# Criar diretório de backups
BACKUP_DIR="backups/$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Diretório de backup: $BACKUP_DIR"
echo ""

# 1. Backup de AdminSettings
echo "1. Exportando AdminSettings..."
pg_dump "$LOCAL_DB" \
  --table=AdminSettings \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-acl \
  > "$BACKUP_DIR/admin_settings.sql"
echo -e "${GREEN}✓${NC} AdminSettings exportado"

# 2. Backup de Plans
echo "2. Exportando Plans..."
pg_dump "$LOCAL_DB" \
  --table=Plan \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-acl \
  > "$BACKUP_DIR/plans.sql"
echo -e "${GREEN}✓${NC} Plans exportado"

# 3. Backup de Features (se existir)
echo "3. Exportando Features..."
if psql "$LOCAL_DB" -c "SELECT COUNT(*) FROM \"Feature\";" > /dev/null 2>&1; then
  pg_dump "$LOCAL_DB" \
    --table=Feature \
    --data-only \
    --column-inserts \
    --no-owner \
    --no-acl \
    > "$BACKUP_DIR/features.sql" 2>/dev/null || echo -e "${YELLOW}⚠${NC} Nenhuma feature encontrada"
  echo -e "${GREEN}✓${NC} Features exportado"
else
  echo -e "${YELLOW}⚠${NC} Tabela Feature não encontrada"
fi

# 4. Schema completo (sem dados)
echo "4. Exportando schema completo..."
pg_dump "$LOCAL_DB" \
  --schema-only \
  --no-owner \
  --no-acl \
  > "$BACKUP_DIR/schema.sql"
echo -e "${GREEN}✓${NC} Schema exportado"

# 5. Criar script de importação
cat > "$BACKUP_DIR/import.sh" << 'EOF'
#!/bin/bash

# Script para importar configurações para banco de produção
# Uso: ./import.sh "postgresql://user:pass@host/db"

set -e

if [ -z "$1" ]; then
    echo "❌ Erro: DATABASE_URL não fornecida"
    echo ""
    echo "Uso: ./import.sh \"postgresql://user:pass@host/db\""
    exit 1
fi

PROD_DB="$1"

echo "🔄 Importando configurações..."
echo ""

# Verificar conexão
if ! psql "$PROD_DB" -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ Erro: Não foi possível conectar ao banco de produção"
    exit 1
fi

echo "✓ Conectado ao banco de produção"
echo ""

# Importar AdminSettings
echo "1. Importando AdminSettings..."
psql "$PROD_DB" < admin_settings.sql
echo "✓ AdminSettings importado"

# Importar Plans
echo "2. Importando Plans..."
psql "$PROD_DB" < plans.sql
echo "✓ Plans importado"

# Importar Features (se existir)
if [ -f "features.sql" ]; then
    echo "3. Importando Features..."
    psql "$PROD_DB" < features.sql 2>/dev/null || echo "⚠ Erro ao importar features (pode ser normal)"
    echo "✓ Features importado"
fi

echo ""
echo "✅ Importação concluída!"
echo ""
echo "Próximos passos:"
echo "1. Acesse seu app em produção"
echo "2. Faça Sign Up para criar primeiro usuário"
echo "3. Verifique /admin/settings"
EOF

chmod +x "$BACKUP_DIR/import.sh"
echo -e "${GREEN}✓${NC} Script de importação criado"

# 6. Criar README
cat > "$BACKUP_DIR/README.md" << EOF
# Backup de Configurações - $(date +%Y-%m-%d\ %H:%M:%S)

## Conteúdo

Este backup contém apenas as configurações do Studio Lagosta:

- **admin_settings.sql** - Configurações de custos de features
- **plans.sql** - Planos de billing
- **features.sql** - Features configuradas (se houver)
- **schema.sql** - Schema completo do banco (sem dados)
- **import.sh** - Script para importar para produção

## Como Usar

### 1. Aplicar schema ao banco de produção

\`\`\`bash
# Opção A: Via Prisma (recomendado)
DATABASE_URL="postgresql://..." npx prisma db push

# Opção B: Via dump de schema
psql "postgresql://..." < schema.sql
\`\`\`

### 2. Importar configurações

\`\`\`bash
./import.sh "postgresql://user:pass@host/db"
\`\`\`

### 3. Verificar

\`\`\`bash
psql "postgresql://..." -c "SELECT * FROM \"Plan\";"
psql "postgresql://..." -c "SELECT * FROM \"AdminSettings\";"
\`\`\`

## ⚠️ Importante

- **NÃO** importe dados de User, Project, Template, Generation
- Esses devem ser recriados em produção via Clerk e interface
- Usuários serão criados automaticamente via webhook do Clerk

## Próximos Passos

1. Deploy na Vercel
2. Configurar variáveis de ambiente
3. Aplicar schema (prisma db push)
4. Importar configurações (se necessário)
5. Sign up para criar primeiro usuário
6. Configurar /admin/settings

Veja \`DEPLOY-DATABASE-MIGRATION.md\` para mais detalhes.
EOF

echo -e "${GREEN}✓${NC} README criado"
echo ""

# Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Backup concluído com sucesso!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Arquivos criados em: $BACKUP_DIR"
echo ""
ls -lh "$BACKUP_DIR"
echo ""
echo "📖 Próximos passos:"
echo "1. Leia: $BACKUP_DIR/README.md"
echo "2. Deploy na Vercel (veja DEPLOY-DATABASE-MIGRATION.md)"
echo "3. Execute: cd $BACKUP_DIR && ./import.sh \"postgresql://...\""
echo ""
