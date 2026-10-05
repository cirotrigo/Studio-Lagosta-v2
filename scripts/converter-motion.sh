#!/usr/bin/env bash
# Converte motion com fundo transparente (ProRes 4444 .mov do Final Cut, do
# Resolve ou do pipeline) para WebM VP9 com alfa — o formato que o editor do
# Studio toca POR CIMA de uma foto ou de um vídeo. O Chrome não decodifica
# ProRes, e MP4/H.264 não tem transparência.
#
# uso:   scripts/converter-motion.sh arquivo.mov [outro.mov ...]
#        scripts/converter-motion.sh "/pasta/com/os/motions"
# saída: <nome>.webm ao lado de cada original (não sobrescreve sem -f).
# depois: pôr os .webm na pasta de Vídeos do cliente no Drive (subpasta
#         "Motions"); no editor, aba Vídeos → Google Drive → clique no arquivo.
set -euo pipefail

forcar=0
if [ "${1:-}" = "-f" ]; then forcar=1; shift; fi
[ $# -gt 0 ] || { sed -n '2,12p' "$0"; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "ffmpeg/ffprobe não encontrados"; exit 1; }

arquivos=()
for alvo in "$@"; do
  if [ -d "$alvo" ]; then
    while IFS= read -r -d '' f; do arquivos+=("$f"); done < <(find "$alvo" -maxdepth 1 -type f -iname '*.mov' -print0 | sort -z)
  else
    arquivos+=("$alvo")
  fi
done
[ ${#arquivos[@]} -gt 0 ] || { echo "Nenhum .mov encontrado."; exit 1; }

falhas=0
for origem in "${arquivos[@]}"; do
  destino="${origem%.*}.webm"
  pix=$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "$origem" || true)
  case "$pix" in
    yuva*|rgba*|argb*|bgra*|abgr*|gbrap*|ya*) ;;
    *) echo "PULADO  $origem — sem canal alfa ($pix): sairia com fundo preto. Exporte em ProRes 4444 com alfa."; falhas=1; continue ;;
  esac
  if [ -e "$destino" ] && [ $forcar -eq 0 ]; then echo "JÁ EXISTE  $destino (use -f para refazer)"; continue; fi

  ffmpeg -hide_banner -loglevel error -y -i "$origem" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -row-mt 1 -deadline good -cpu-used 3 -auto-alt-ref 0 -an \
    "$destino"

  # A prova de que a transparência sobreviveu: o WebM declara alpha_mode=1
  alfa=$(ffprobe -v error -select_streams v:0 -show_entries stream_tags=alpha_mode -of csv=p=0 "$destino" || true)
  if [ "$alfa" != "1" ]; then echo "FALHOU  $destino — saiu sem transparência"; rm -f "$destino"; falhas=1; continue; fi
  echo "OK  $destino ($(du -h "$destino" | cut -f1 | tr -d ' '))"
done
exit $falhas
