-- Prazo do refresh token do conector MCP: 30 dias, renovados a cada rotação.
--
-- O refresh token não expirava nunca — conector removido e esquecido valia
-- para sempre. Linha antiga fica NULA e continua valendo (migração suave):
-- ela ganha prazo na próxima rotação, porque o token novo sempre nasce com a
-- coluna preenchida. Vencido, o token toma invalid_grant e o cliente refaz o
-- fluxo de autorização.
--
-- Aditiva e idempotente (IF NOT EXISTS, padrão 0_init).

ALTER TABLE "McpOAuthToken" ADD COLUMN IF NOT EXISTS "refreshExpiresAt" TIMESTAMP(3);
