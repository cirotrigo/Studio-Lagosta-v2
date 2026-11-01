-- F1 da direção por referência (01/11/2026): a revisão APROVADA e IMUTÁVEL de uma página de referência do cliente.
-- Aditiva e idempotente (IF NOT EXISTS / DO), como o 0_init.

CREATE TABLE IF NOT EXISTS "ReferenciaDeLayout" (
  "id"          TEXT NOT NULL,
  "projectId"   INTEGER NOT NULL,
  "pageId"      TEXT NOT NULL,
  "formato"     TEXT NOT NULL,
  "arquetipoId" TEXT NOT NULL,
  "versao"      INTEGER NOT NULL,
  "impressao"   TEXT NOT NULL,
  "pageVersion" TEXT NOT NULL,
  "definicao"   JSONB NOT NULL,
  "aprovadaPor" TEXT,
  "aprovadaEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogadaEm"  TIMESTAMP(3),
  CONSTRAINT "ReferenciaDeLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferenciaDeLayout_arquetipoId_versao_key" ON "ReferenciaDeLayout"("arquetipoId", "versao");
CREATE INDEX IF NOT EXISTS "ReferenciaDeLayout_projectId_formato_idx" ON "ReferenciaDeLayout"("projectId", "formato");

DO $$ BEGIN
  ALTER TABLE "ReferenciaDeLayout" ADD CONSTRAINT "ReferenciaDeLayout_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A revisão é imutável: só `revogadaEm` muda; a definição, a impressão, a versão, a origem e quem aprovou nunca.
-- DELETE só pelo cascade do projeto (o projeto já não existe quando a FK apaga as revisões dele).
CREATE OR REPLACE FUNCTION "ReferenciaDeLayout_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM "Project" WHERE "id" = OLD."projectId") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ReferenciaDeLayout é imutável: DELETE recusado (% v%)', OLD."arquetipoId", OLD."versao"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."definicao" IS DISTINCT FROM OLD."definicao" OR NEW."impressao" <> OLD."impressao" OR NEW."versao" <> OLD."versao"
     OR NEW."arquetipoId" <> OLD."arquetipoId" OR NEW."pageId" <> OLD."pageId" OR NEW."projectId" <> OLD."projectId"
     OR NEW."formato" <> OLD."formato" OR NEW."pageVersion" <> OLD."pageVersion" OR NEW."aprovadaEm" <> OLD."aprovadaEm"
     OR NEW."aprovadaPor" IS DISTINCT FROM OLD."aprovadaPor" THEN
    RAISE EXCEPTION 'ReferenciaDeLayout é imutável: UPDATE do conteúdo recusado (% v%) — aprove de novo para criar a versão seguinte', OLD."arquetipoId", OLD."versao"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ReferenciaDeLayout_imutavel" ON "ReferenciaDeLayout";
CREATE TRIGGER "ReferenciaDeLayout_imutavel"
  BEFORE UPDATE OR DELETE ON "ReferenciaDeLayout"
  FOR EACH ROW EXECUTE FUNCTION "ReferenciaDeLayout_imutavel"();
