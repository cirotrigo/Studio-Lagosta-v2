#!/bin/bash
# Wrapper para iniciar o MCP server do Studio Lagosta.
# Usa o tsx instalado localmente — sem npx, startup rápido.
#
# Precisa funcionar em qualquer Mac da equipe, então nada aqui pode depender
# do caminho de UMA máquina: o .mcp.json aponta para este script por caminho
# relativo, e o script se localiza sozinho pelo próprio dirname.

# Homebrew do Apple Silicon, Homebrew do Intel, e o que já vier no PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# O nvm não exporta nada para processo não interativo (o cliente MCP não abre
# um shell de login), então quem usa nvm chega aqui sem `node`. Nesse caso,
# pega a versão mais recente instalada.
if ! command -v node >/dev/null 2>&1; then
  ultimo_node=$(ls -d "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | sort -V | tail -1)
  [ -n "$ultimo_node" ] && export PATH="$ultimo_node:$PATH"
fi

cd "$(dirname "$0")/.." || exit 1

# Falhar com motivo legível: sem isso o cliente MCP só mostra "ENOENT" e não
# se sabe se o problema é o caminho, o node ou a dependência que falta.
if ! command -v node >/dev/null 2>&1; then
  echo "mcp-wrapper: node não encontrado no PATH." >&2
  exit 1
fi
if [ ! -x node_modules/.bin/tsx ]; then
  echo "mcp-wrapper: tsx ausente — rode 'npm install' na raiz do projeto." >&2
  exit 1
fi

exec node_modules/.bin/tsx scripts/mcp-server.ts
