-- Audiência do token OAuth do conector MCP (RFC 8707).
--
-- O resource pedido na autorização fica no código e vira a audiência do token
-- emitido; resolveAccessToken recusa token carimbado para outro endpoint.
-- Token antigo fica com a coluna NULA e continua valendo (migração suave) —
-- ele ganha audiência na próxima rotação do refresh.
--
-- As tabelas McpOAuth* nasceram por `db push`, FORA do histórico (o drift
-- documentado no CLAUDE.md): nenhuma migration as criava, e o shadow database
-- derrubava qualquer ALTER nelas. Esta migration as traz para o histórico no
-- padrão do 0_init — CREATE IF NOT EXISTS com a forma que tinham ANTES desta
-- mudança (no-op em produção), e só então os ALTERs que são a mudança em si.
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object, padrão 0_init).

-- CreateTable (histórico: forma pré-audiência; em produção já existe)
CREATE TABLE IF NOT EXISTS "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "McpOAuthCode" (
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "McpOAuthToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "refreshHash" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "McpOAuthCode_clientId_idx" ON "McpOAuthCode"("clientId");
CREATE INDEX IF NOT EXISTS "McpOAuthCode_expiresAt_idx" ON "McpOAuthCode"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "McpOAuthToken_tokenHash_key" ON "McpOAuthToken"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "McpOAuthToken_refreshHash_key" ON "McpOAuthToken"("refreshHash");
CREATE INDEX IF NOT EXISTS "McpOAuthToken_userId_idx" ON "McpOAuthToken"("userId");
CREATE INDEX IF NOT EXISTS "McpOAuthToken_clientId_idx" ON "McpOAuthToken"("clientId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "McpOAuthCode" ADD CONSTRAINT "McpOAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "McpOAuthToken" ADD CONSTRAINT "McpOAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- A mudança desta migration: o resource no código, a audiência no token.
ALTER TABLE "McpOAuthCode" ADD COLUMN IF NOT EXISTS "resource" TEXT;
ALTER TABLE "McpOAuthToken" ADD COLUMN IF NOT EXISTS "audience" TEXT;
