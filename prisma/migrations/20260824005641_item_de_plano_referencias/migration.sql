-- ItemDePlano.referencias: referências de imagem com papel, por item do plano.
-- Aditiva e idempotente (padrão 0_init): nula para todos os itens existentes,
-- que continuam no comportamento do espelho fotoUrl/fotoDriveId.
ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "referencias" JSONB;
