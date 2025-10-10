#!/bin/bash

# Script para processar fila de vídeos em desenvolvimento
# Execute em um terminal separado: bash scripts/process-video-queue.sh

echo "🎬 Video Processing Queue Worker"
echo "================================"
echo ""
echo "Processando fila a cada 10 segundos..."
echo "Pressione Ctrl+C para parar"
echo ""

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verificando fila..."

  response=$(curl -s -X POST http://localhost:3000/api/video-processing/process)

  # Verificar se há jobs
  if echo "$response" | grep -q "No pending jobs"; then
    echo "  → Nenhum job pendente"
  elif echo "$response" | grep -q "success"; then
    echo "  ✅ Job processado com sucesso!"
    jobId=$(echo "$response" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)
    echo "     Job ID: $jobId"
  else
    echo "  ⚠️  Erro ao processar"
    echo "     Response: $response"
  fi

  echo ""
  sleep 10
done
