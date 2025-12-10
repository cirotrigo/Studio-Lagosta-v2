#!/bin/bash

# =============================================================================
# Migration Validation Script
# =============================================================================
# Este script valida o estado das migrations e schema do Prisma.
# Útil para CI/CD pipelines e pre-commit hooks.
#
# Uso: ./scripts/validate-migrations.sh
# Exit codes:
#   0 - Tudo OK
#   1 - Erro de validação
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Migration Validation Script${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

EXIT_CODE=0

# =============================================================================
# 1. Validar Schema Prisma
# =============================================================================
echo -e "${YELLOW}[1/5] Validando schema.prisma...${NC}"
if npx prisma validate > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Schema válido${NC}"
else
  echo -e "${RED}✗ Schema inválido${NC}"
  npx prisma validate
  EXIT_CODE=1
fi
echo ""

# =============================================================================
# 2. Verificar Migrations Directory
# =============================================================================
echo -e "${YELLOW}[2/5] Verificando diretório de migrations...${NC}"
if [ -d "prisma/migrations" ]; then
  MIGRATION_COUNT=$(find prisma/migrations -type d -mindepth 1 | wc -l | tr -d ' ')
  echo -e "${GREEN}✓ Diretório de migrations existe${NC}"
  echo -e "  📁 ${MIGRATION_COUNT} migrations encontradas"
else
  echo -e "${RED}✗ Diretório de migrations não encontrado${NC}"
  EXIT_CODE=1
fi
echo ""

# =============================================================================
# 3. Verificar Baseline
# =============================================================================
echo -e "${YELLOW}[3/5] Verificando migration baseline...${NC}"
if [ -d "prisma/migrations/00000000000001_baseline" ]; then
  echo -e "${GREEN}✓ Migration baseline existe${NC}"
else
  echo -e "${YELLOW}⚠ Migration baseline não encontrada${NC}"
  echo -e "  ℹ️  Isso é normal se você não rodou a normalização ainda"
fi
echo ""

# =============================================================================
# 4. Gerar Prisma Client (verificação)
# =============================================================================
echo -e "${YELLOW}[4/5] Gerando Prisma Client...${NC}"
if npx prisma generate > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Prisma Client gerado com sucesso${NC}"
else
  echo -e "${RED}✗ Erro ao gerar Prisma Client${NC}"
  npx prisma generate
  EXIT_CODE=1
fi
echo ""

# =============================================================================
# 5. Verificar Status de Migrations (se DATABASE_URL estiver disponível)
# =============================================================================
echo -e "${YELLOW}[5/5] Verificando status de migrations...${NC}"
if [ -z "$DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠ DATABASE_URL não definida - pulando verificação de status${NC}"
  echo -e "  ℹ️  Para verificar status: export DATABASE_URL e rode novamente"
else
  if npx prisma migrate status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Migrations up to date${NC}"

    # Mostrar resumo
    STATUS_OUTPUT=$(npx prisma migrate status 2>&1)
    if echo "$STATUS_OUTPUT" | grep -q "Database schema is up to date"; then
      echo -e "${GREEN}  ✓ Database schema is up to date${NC}"
    fi

    # Contar migrations
    if echo "$STATUS_OUTPUT" | grep -q "migrations found"; then
      FOUND_COUNT=$(echo "$STATUS_OUTPUT" | grep "migrations found" | grep -oE '[0-9]+')
      echo -e "  📦 ${FOUND_COUNT} migrations aplicadas"
    fi
  else
    echo -e "${RED}✗ Problemas detectados com migrations${NC}"
    echo ""
    npx prisma migrate status
    EXIT_CODE=1
  fi
fi
echo ""

# =============================================================================
# Resumo Final
# =============================================================================
echo -e "${BLUE}==============================================================================${NC}"
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Validação concluída com sucesso!${NC}"
  echo -e "${GREEN}Todas as verificações passaram.${NC}"
else
  echo -e "${RED}❌ Validação falhou${NC}"
  echo -e "${RED}Corrija os erros acima antes de continuar.${NC}"
fi
echo -e "${BLUE}==============================================================================${NC}"
echo ""

exit $EXIT_CODE
