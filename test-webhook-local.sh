#!/bin/bash

# Script para testar o webhook de confirmação do Buffer localmente
# Uso: ./test-webhook-local.sh [post_id]

set -e

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Studio Lagosta - Webhook Test${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Verificar se o servidor está rodando
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo -e "${RED}❌ Servidor não está rodando!${NC}"
  echo -e "${YELLOW}Execute: npm run dev${NC}\n"
  exit 1
fi

echo -e "${GREEN}✅ Servidor está rodando em http://localhost:3000${NC}\n"

# Usar post_id fornecido ou solicitar
if [ -z "$1" ]; then
  echo -e "${YELLOW}Digite o ID do post para testar:${NC}"
  read -r POST_ID
else
  POST_ID=$1
fi

echo -e "\n${BLUE}Testando webhook para post: ${POST_ID}${NC}\n"

# Payload simulando confirmação do Buffer
PAYLOAD=$(cat <<EOF
{
  "studio_post_id": "${POST_ID}",
  "buffer_id": "test_buffer_id_$(date +%s)",
  "status": "sent",
  "service_update_id": "17841401044634258_18022162888225632",
  "sent_at": $(date +%s),
  "post_type": "post"
}
EOF
)

echo -e "${YELLOW}Payload:${NC}"
echo "$PAYLOAD" | jq '.'
echo ""

# Enviar requisição
echo -e "${BLUE}Enviando requisição para webhook...${NC}\n"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  http://localhost:3000/api/webhooks/buffer/post-sent \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: 041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941" \
  -d "$PAYLOAD")

# Separar body e status code
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo -e "${YELLOW}Status Code:${NC} ${HTTP_CODE}"
echo -e "${YELLOW}Response:${NC}"
echo "$HTTP_BODY" | jq '.'

# Verificar sucesso
if [ "$HTTP_CODE" -eq 200 ]; then
  echo -e "\n${GREEN}✅ Webhook processado com sucesso!${NC}"
  echo -e "${GREEN}Verifique o post no banco de dados para confirmar os dados.${NC}\n"
else
  echo -e "\n${RED}❌ Erro ao processar webhook!${NC}\n"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Dica: Verifique os logs do servidor para mais detalhes${NC}"
echo -e "${BLUE}========================================${NC}\n"
