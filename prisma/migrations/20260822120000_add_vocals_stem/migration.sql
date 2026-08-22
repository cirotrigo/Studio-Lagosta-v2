-- A voz isolada, o par do instrumental.
--
-- A separação do MVSEP (sep_type 48, MelBand Roformer) sempre devolveu DOIS
-- arquivos — vocal e instrumental — e o cliente baixava os dois, guardava o
-- instrumental e jogava o vocal fora. Estas colunas dão casa ao que já era
-- produzido.
--
-- Idempotente (IF NOT EXISTS), no mesmo molde do 0_init: o banco de produção
-- tem drift histórico e a migration precisa ser um no-op onde a coluna já exista.

ALTER TABLE "MusicLibrary" ADD COLUMN IF NOT EXISTS "hasVocalsStem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MusicLibrary" ADD COLUMN IF NOT EXISTS "vocalsSize" INTEGER;
ALTER TABLE "MusicLibrary" ADD COLUMN IF NOT EXISTS "vocalsUrl" TEXT;
