#!/bin/bash
# Wrapper para iniciar o MCP server do Studio Lagosta.
# Usa tsx instalado localmente — sem nvm, sem npx, startup rápido.

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1
exec node_modules/.bin/tsx scripts/mcp-server.ts
