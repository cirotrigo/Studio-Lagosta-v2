-- Audiência do token OAuth do conector MCP (RFC 8707).
--
-- O resource pedido na autorização fica no código e vira a audiência do token
-- emitido; resolveAccessToken recusa token carimbado para outro endpoint.
-- Token antigo fica com a coluna NULA e continua valendo (migração suave) —
-- ele ganha audiência na próxima rotação do refresh.
--
-- Aditiva e idempotente (IF NOT EXISTS, padrão 0_init).

ALTER TABLE "McpOAuthCode" ADD COLUMN IF NOT EXISTS "resource" TEXT;
ALTER TABLE "McpOAuthToken" ADD COLUMN IF NOT EXISTS "audience" TEXT;
