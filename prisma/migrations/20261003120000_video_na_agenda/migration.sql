-- Vídeo direto na agenda (Fase 1 de docs/PLANO-2026-10-03-VIDEO-NA-AGENDA-MOVIMENTO-E-TRANSICOES.md).
-- Aditiva e idempotente: rodar de novo não muda nada.

-- O arrendamento do job de vídeo: quantas vezes ele foi reservado.
ALTER TABLE "VideoProcessingJob" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- O post é o VÍDEO da página (a mídia é um MP4 exportado dela).
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "videoDaPagina" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: post com página e alguma mídia de vídeo. Mesma regra de
-- `isVideoUrl` (src/lib/media-type.ts): extensão de vídeo e não de imagem.
UPDATE "SocialPost"
SET "videoDaPagina" = true
WHERE "pageId" IS NOT NULL
  AND "videoDaPagina" = false
  AND EXISTS (
    SELECT 1 FROM unnest("mediaUrls") AS u
    WHERE u ~* '\.(mp4|mov|avi|webm|m4v|mkv)(\?|#|$)'
      AND u !~* '\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)'
  );
