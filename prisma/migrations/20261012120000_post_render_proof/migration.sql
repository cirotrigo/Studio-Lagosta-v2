-- Prova do render (B1d, checkpoint e do PR #211): "estas camadas produziram ESTA mídia".
-- Aditiva e idempotente: rodar de novo não muda nada. Sem backfill — URL antiga e mídia
-- fornecida ficam sem prova.

CREATE TABLE IF NOT EXISTS "PostRenderProof" (
    "postId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "proofVersion" INTEGER NOT NULL DEFAULT 1,
    "layersSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostRenderProof_pkey" PRIMARY KEY ("postId", "mediaUrl")
);

-- Fail-closed: uma versão 2 exige migration consciente que altere estes CHECKs.
DO $$ BEGIN
  ALTER TABLE "PostRenderProof" ADD CONSTRAINT "PostRenderProof_proofVersion_check" CHECK ("proofVersion" = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PostRenderProof" ADD CONSTRAINT "PostRenderProof_layersSnapshot_check" CHECK (jsonb_typeof("layersSnapshot") = 'array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PostRenderProof" ADD CONSTRAINT "PostRenderProof_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
