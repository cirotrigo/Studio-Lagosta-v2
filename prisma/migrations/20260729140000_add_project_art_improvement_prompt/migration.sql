-- Direção de arte da melhoria com IA, por projeto (aba Configurações).
-- Nulo = usa a direção padrão em src/lib/ai/openai-image-client.ts
-- (DEFAULT_ART_DIRECTION). O campo existe para apertar as regras num cliente
-- específico sem endurecer o padrão para todos.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "artImprovementPrompt" TEXT;
