-- Trilha sonora da página (aba Músicas do editor). JSON com o AudioConfig:
-- source, musicId, trecho (startTime/endTime), volumes e fades.
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "audio" JSONB;
