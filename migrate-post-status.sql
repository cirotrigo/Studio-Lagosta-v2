-- Migração de status de posts: PROCESSING -> POSTING e SENT -> POSTED

-- 1. Atualizar todos os posts com status PROCESSING para POSTING
UPDATE "SocialPost"
SET status = 'POSTING'
WHERE status = 'PROCESSING';

-- 2. Atualizar todos os posts com status SENT para POSTED
UPDATE "SocialPost"
SET status = 'POSTED'
WHERE status = 'SENT';

-- 3. Verificar se há algum post com os status antigos
SELECT status, COUNT(*) as count
FROM "SocialPost"
GROUP BY status
ORDER BY status;
