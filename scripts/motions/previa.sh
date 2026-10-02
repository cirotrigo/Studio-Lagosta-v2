#!/usr/bin/env bash
# Prévia de um spec de motions: o quadro FINAL de cada peça sobre uma foto, em
# folhas de contato — para conferir leitura, colisão e margens antes de renderizar.
#
# uso:   scripts/motions/previa.sh <spec.json> <foto.jpg> <pasta-de-saida> [segundos]
# saída: <pasta>/quadros/*.png (transparentes), <pasta>/comp/*.jpg e <pasta>/folha-N.jpg
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,7p' "$0"; exit 1; }
spec="$1"; foto="$2"; pasta="$3"; t="${4:-7}"
aqui="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$pasta/quadros" "$pasta/comp"
rm -f "$pasta"/quadros/*.png "$pasta"/comp/*.jpg "$pasta"/folha-*.jpg
node "$aqui/gerar-motion.mjs" "$spec" --quadro "$t" --saida "$pasta/quadros"
i=0
for png in "$pasta"/quadros/*.png; do
  i=$((i + 1))
  ffmpeg -hide_banner -loglevel error -y -i "$foto" -i "$png" \
    -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[f];[f][1:v]overlay,scale=540:960" \
    -frames:v 1 "$pasta/comp/$(printf %02d $i)-$(basename "$png" .png).jpg"
done
ffmpeg -hide_banner -loglevel error -y -pattern_type glob -i "$pasta/comp/*.jpg" -vf "tile=4x1" "$pasta/folha-%d.jpg"
ls "$pasta"/folha-*.jpg
