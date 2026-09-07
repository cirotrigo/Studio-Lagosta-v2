-- Vetores semânticos das fotos do acervo (F2 da busca de fotos, 07/09/2026).
-- pgvector 0.8.0 está disponível no Neon (pg_available_extensions), não
-- instalado até aqui. Idempotente, como o 0_init.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "PhotoEmbedding" (
  "id"          TEXT PRIMARY KEY,
  "projectId"   INTEGER NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "md5"         TEXT,
  "versao"      TEXT NOT NULL,
  "vetorImagem" vector(1536),
  "vetorTexto"  vector(1536),
  "texto"       TEXT,
  "geradoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhotoEmbedding_projectId_driveFileId_key"
  ON "PhotoEmbedding"("projectId", "driveFileId");
CREATE INDEX IF NOT EXISTS "PhotoEmbedding_projectId_versao_idx"
  ON "PhotoEmbedding"("projectId", "versao");

-- HNSW por coseno. Com ~12,7k linhas a busca exata já é sub-segundo; o índice
-- é conforto para quando o acervo crescer, e o filtro por projeto usa o
-- iterative scan do 0.8 (hnsw.iterative_scan) quando precisar.
CREATE INDEX IF NOT EXISTS "PhotoEmbedding_vetorImagem_hnsw"
  ON "PhotoEmbedding" USING hnsw ("vetorImagem" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "PhotoEmbedding_vetorTexto_hnsw"
  ON "PhotoEmbedding" USING hnsw ("vetorTexto" vector_cosine_ops);
