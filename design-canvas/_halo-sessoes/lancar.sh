#!/bin/bash
# Abre uma sessão LOCAL por cliente, com Remote Control ligado (visível no celular).
#
# Precisa ser rodado por VOCÊ, num terminal seu: uma sessão lançada de dentro
# do Claude não herda o seu login (medido em 01/09/2026 — o processo filho
# morre com 'OAuth session expired and could not be refreshed').
#
# Uso:  ./lancar.sh            → abre as 8
#       ./lancar.sh bacana     → abre só uma
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd /Users/cirotrigo/Documents/Studio-Lagosta-v2
CLIENTES=(bacana espeto tero quintal winevix real seuquinto emporio)
if [ $# -gt 0 ]; then CLIENTES=("$@"); fi
for c in "${CLIENTES[@]}"; do
  p="$AQUI/$c.txt"
  [ -f "$p" ] || { echo "sem prompt para $c"; continue; }
  echo "→ abrindo sessão: Halo — $c"
  claude --remote-control "Halo — $c" "$(cat "$p")" &
  sleep 3
done
wait
