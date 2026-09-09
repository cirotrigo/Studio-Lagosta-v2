#!/usr/bin/env bash
set -euo pipefail
# Executar da raiz do worktree. Nenhuma variável de conexão é herdada.
PG_BIN="${PILOTO_PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
PILOTO_DIR="$PWD/.tmp-medicao-compositor"
mkdir -p "$PILOTO_DIR"
if [[ -e "$PILOTO_DIR/pgdata/PG_VERSION" ]]; then
  echo 'Cluster do piloto já existe. Preserve os resultados e use outro worktree para repetir do zero.' >&2
  exit 1
fi
"$PG_BIN/initdb" -D "$PILOTO_DIR/pgdata" -A trust -U piloto --no-locale > "$PILOTO_DIR/initdb.log"
"$PG_BIN/pg_ctl" -D "$PILOTO_DIR/pgdata" -l "$PILOTO_DIR/postgres.log" -o '-h 127.0.0.1 -p 55439' start
trap '"$PG_BIN/pg_ctl" -D "$PILOTO_DIR/pgdata" stop -m fast' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p 55439 -U piloto lagosta_pilot
python3 - <<'PY'
from pathlib import Path
# Somente as colunas vetoriais fora do escopo: não há pgvector nesta instalação.
s=Path('prisma/schema.prisma').read_text().replace('Unsupported("vector(1536)")','Bytes')
Path('.tmp-medicao-compositor/schema.prisma').write_text(s)
PY
DATABASE_URL='postgresql://piloto@127.0.0.1:55439/lagosta_pilot' DIRECT_URL='postgresql://piloto@127.0.0.1:55439/lagosta_pilot' ./node_modules/.bin/prisma db push --skip-generate --schema "$PILOTO_DIR/schema.prisma" > "$PILOTO_DIR/schema.log"
./node_modules/.bin/tsx scripts/piloto-compositor/postgres.ts > "$PILOTO_DIR/pg-test.log" 2>&1
