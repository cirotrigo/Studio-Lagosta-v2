#!/bin/bash
# Wrapper para iniciar o MCP server do Studio Lagosta.
# Usa tsx instalado localmente — sem nvm, sem npx, startup rápido.

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1

# Quem está sentado NESTE Mac (04/09/2026): o arquivo `.studio-autor` na raiz
# do repositório (gitignored, um por máquina) guarda o e-mail de login no
# Studio. O servidor assina as artes com essa pessoa em vez do dono do
# projeto — é o que separa o Ciro da Roberta na galeria mesmo com a mesma
# conta do Claude. Sem o arquivo, vale o comportamento antigo ("Automações").
if [ -z "$STUDIO_AUTOR" ] && [ -f .studio-autor ]; then
  export STUDIO_AUTOR="$(head -n1 .studio-autor | tr -d '[:space:]')"
fi

exec node_modules/.bin/tsx scripts/mcp-server.ts
