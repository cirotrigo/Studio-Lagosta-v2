-- Carrossel na fila da EQUIPE (F3): o ItemDePlano aprende a carregar slides.
--
-- Até aqui o carrossel montado na bancada vivia só no localStorage de quem o
-- montou — a peça única já era compartilhada pelo plano, e a série não tinha
-- como ser: não havia onde guardar os slides no servidor.
--
-- Json e não tabela-filha de propósito: a série é lida e escrita SEMPRE
-- inteira (ninguém consulta "todos os slides 3 do projeto"), a ordem é
-- posicional, e o precedente de dado posicional editado em bloco é
-- `Page.layers`. Shape: `{ groupId, lista: [{ ordem, copy, fotoDriveId,
-- fotoUrl, thumbUrl, generationId, resultUrl, erro, aviso }] }` — os campos de
-- trabalho (generationId/resultUrl) entram conforme a geração avança, pelo
-- mesmo caminho das transições.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

ALTER TABLE "ItemDePlano" ADD COLUMN IF NOT EXISTS "slides" JSONB;
