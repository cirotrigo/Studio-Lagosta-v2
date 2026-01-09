-- VERIFICAÇÃO: O campo processingStartedAt EXISTE!
-- Execute este comando no Neon para confirmar:

SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'SocialPost'
AND column_name = 'processingStartedAt';

-- Deve retornar 1 linha mostrando o campo!