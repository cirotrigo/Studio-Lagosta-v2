#!/bin/bash

# Script de verificação pré-deploy para Vercel
# Executa verificações antes de fazer deploy

set -e

echo "🚀 Verificação Pré-Deploy"
echo "========================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificação
check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
        exit 1
    fi
}

# 1. Verificar se variáveis essenciais estão configuradas
echo "1. Verificando variáveis de ambiente..."
if [ -f .env ]; then
    if grep -q "DATABASE_URL=" .env && [ ! -z "$(grep DATABASE_URL= .env | cut -d '=' -f2)" ]; then
        echo -e "${GREEN}✓${NC} DATABASE_URL configurada"
    else
        echo -e "${YELLOW}⚠${NC} DATABASE_URL não configurada (necessária para produção)"
    fi

    if grep -q "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=" .env && [ ! -z "$(grep NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= .env | cut -d '=' -f2)" ]; then
        echo -e "${GREEN}✓${NC} Clerk keys configuradas"
    else
        echo -e "${YELLOW}⚠${NC} Clerk keys não configuradas (necessárias para produção)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Arquivo .env não encontrado"
fi

# 2. TypeScript check
echo ""
echo "2. Verificando tipos TypeScript..."
npm run typecheck > /dev/null 2>&1
check "TypeScript OK"

# 3. Lint
echo ""
echo "3. Executando linter..."
npm run lint > /dev/null 2>&1
check "ESLint OK"

# 4. Build test
echo ""
echo "4. Testando build..."
npm run build > /dev/null 2>&1
check "Build OK"

# 5. Verificar prisma schema
echo ""
echo "5. Verificando Prisma schema..."
npx prisma validate > /dev/null 2>&1
check "Prisma schema válido"

echo ""
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo -e "${GREEN}✓ Tudo pronto para deploy!${NC}"
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo ""
echo "Próximos passos:"
echo "1. Criar banco de dados (Vercel Postgres, Neon, Supabase)"
echo "2. Configurar variáveis na Vercel"
echo "3. Executar: vercel ou fazer push para GitHub"
echo ""
echo "Veja VERCEL-DEPLOY.md para instruções completas"
