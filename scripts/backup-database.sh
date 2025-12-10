#!/bin/bash

# =============================================================================
# Database Backup Script
# =============================================================================
# Este script cria um backup completo do banco de dados PostgreSQL
# antes de aplicar migrations críticas.
#
# Uso: ./scripts/backup-database.sh
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}Database Backup Script${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# Verificar se DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL não está definida no ambiente${NC}"
  echo "Execute: export DATABASE_URL='sua-connection-string'"
  exit 1
fi

# Extrair informações da connection string
DB_URL=$DATABASE_URL
echo -e "${GREEN}✓ DATABASE_URL encontrada${NC}"

# Criar diretório de backups se não existir
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Nome do arquivo de backup com timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql"
BACKUP_COMPRESSED="$BACKUP_FILE.gz"

echo ""
echo -e "${YELLOW}Criando backup do banco de dados...${NC}"
echo "Destino: $BACKUP_FILE"
echo ""

# Fazer backup usando pg_dump via DATABASE_URL
# Nota: pg_dump deve estar instalado no sistema
if ! command -v pg_dump &> /dev/null; then
  echo -e "${RED}ERROR: pg_dump não encontrado${NC}"
  echo "Instale PostgreSQL client tools:"
  echo "  macOS: brew install postgresql"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  exit 1
fi

# Executar pg_dump
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Backup criado com sucesso!${NC}"

  # Comprimir backup
  echo -e "${YELLOW}Comprimindo backup...${NC}"
  gzip "$BACKUP_FILE"

  BACKUP_SIZE=$(du -h "$BACKUP_COMPRESSED" | cut -f1)
  echo -e "${GREEN}✓ Backup comprimido: $BACKUP_COMPRESSED ($BACKUP_SIZE)${NC}"

  # Criar link simbólico para o backup mais recente
  ln -sf "$(basename "$BACKUP_COMPRESSED")" "$BACKUP_DIR/latest.sql.gz"
  echo -e "${GREEN}✓ Link simbólico criado: $BACKUP_DIR/latest.sql.gz${NC}"

  echo ""
  echo -e "${GREEN}==============================================================================${NC}"
  echo -e "${GREEN}Backup concluído com sucesso!${NC}"
  echo -e "${GREEN}==============================================================================${NC}"
  echo ""
  echo "Arquivo: $BACKUP_COMPRESSED"
  echo "Tamanho: $BACKUP_SIZE"
  echo ""
  echo "Para restaurar:"
  echo "  gunzip -c $BACKUP_COMPRESSED | psql \$DATABASE_URL"
  echo ""

else
  echo -e "${RED}ERROR: Falha ao criar backup${NC}"
  exit 1
fi

# Listar backups existentes
echo -e "${YELLOW}Backups disponíveis:${NC}"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "Nenhum backup anterior encontrado"
echo ""

# Limpeza de backups antigos (manter últimos 7 dias)
echo -e "${YELLOW}Limpando backups antigos (>7 dias)...${NC}"
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete
echo -e "${GREEN}✓ Limpeza concluída${NC}"
echo ""
