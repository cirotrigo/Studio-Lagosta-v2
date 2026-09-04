-- Tipo de job da fila para a composição pelo editor (F3 do editor-como-usina).
-- ALTER TYPE ... ADD VALUE não pode dividir transação com a criação do tipo,
-- por isso vive em migration própria (regra registrada no CLAUDE.md).
ALTER TYPE "GenerationJobKind" ADD VALUE IF NOT EXISTS 'COMPOR';
