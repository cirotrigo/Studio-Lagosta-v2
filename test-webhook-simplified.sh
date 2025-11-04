#!/bin/bash

# 🧪 Teste do Webhook Simplificado - Buffer → Studio Lagosta

WEBHOOK_SECRET="041eff493c6cde70c21ccb1d9bab3b00bebd45f12fcbfc15dc52effde8a61941"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TESTE DO WEBHOOK SIMPLIFICADO (COM CAMPO SUCCESS!)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 URL: $BASE_URL/api/webhooks/buffer/post-sent"
echo ""

# ========================================
# Teste 1: Confirmação de Sucesso
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TESTE 1: Confirmação de Sucesso"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CURRENT_TIMESTAMP=$(date +%s)

echo "📤 Enviando payload:"
cat <<EOF
{
  "success": true,
  "buffer_update_id": "test_$(date +%s)",
  "sent_at": $CURRENT_TIMESTAMP,
  "message": "Your post has been scheduled for publishing!"
}
EOF
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/buffer/post-sent" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d "{
    \"success\": true,
    \"buffer_update_id\": \"test_$(date +%s)\",
    \"sent_at\": $CURRENT_TIMESTAMP,
    \"message\": \"Your post has been scheduled for publishing!\"
  }")

echo "📥 Resposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar se foi sucesso
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Teste 1 PASSOU"
else
  echo "❌ Teste 1 FALHOU"
fi
echo ""

# ========================================
# Teste 2: Confirmação de Falha
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❌ TESTE 2: Confirmação de Falha"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📤 Enviando payload:"
cat <<EOF
{
  "success": false,
  "buffer_update_id": "test_failed_$(date +%s)",
  "message": "Instagram API error: Rate limit exceeded"
}
EOF
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/buffer/post-sent" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d "{
    \"success\": false,
    \"buffer_update_id\": \"test_failed_$(date +%s)\",
    \"message\": \"Instagram API error: Rate limit exceeded\"
  }")

echo "📥 Resposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar se foi sucesso
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Teste 2 PASSOU"
else
  echo "❌ Teste 2 FALHOU"
fi
echo ""

# ========================================
# Teste 3: Webhook Secret Inválido
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 TESTE 3: Webhook Secret Inválido (deve falhar)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/buffer/post-sent" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: INVALID_SECRET" \
  -d "{
    \"success\": true,
    \"buffer_update_id\": \"test_invalid\",
    \"sent_at\": $CURRENT_TIMESTAMP
  }")

echo "📥 Resposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar se foi rejeitado
if echo "$RESPONSE" | grep -q '"error":"Unauthorized"'; then
  echo "✅ Teste 3 PASSOU (corretamente rejeitado)"
else
  echo "❌ Teste 3 FALHOU (deveria ter sido rejeitado)"
fi
echo ""

# ========================================
# Teste 4: Campos Ausentes
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  TESTE 4: Campos Ausentes (deve falhar)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/buffer/post-sent" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d "{
    \"buffer_update_id\": \"test_no_status\"
  }")

echo "📥 Resposta:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar se foi rejeitado
if echo "$RESPONSE" | grep -q '"error":"Missing success field"'; then
  echo "✅ Teste 4 PASSOU (corretamente rejeitado)"
else
  echo "❌ Teste 4 FALHOU (deveria ter retornado erro de campo ausente)"
fi
echo ""

# ========================================
# Resumo
# ========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMO DOS TESTES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Para testar com post real:"
echo ""
echo "1. Crie um post no Studio Lagosta"
echo "2. Clique em 'Publicar Agora'"
echo "3. Verifique que o status mudou para 'POSTING'"
echo "4. Execute este teste para simular confirmação do Buffer"
echo "5. Verifique que o status mudou para 'POSTED'"
echo ""
echo "🔍 Ver posts POSTING no banco:"
echo "   psql \$DATABASE_URL -c \"SELECT id, status, \\\"createdAt\\\" FROM \\\"SocialPost\\\" WHERE status = 'POSTING' ORDER BY \\\"createdAt\\\" DESC LIMIT 5;\""
echo ""
echo "📚 Documentação completa:"
echo "   - ZAPIER_SETUP_SIMPLIFIED.md"
echo "   - MIGRATION_GUIDE.md"
echo ""
