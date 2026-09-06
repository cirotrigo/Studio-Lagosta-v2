-- O estilo OBSERVADO nas peças aprovadas de cada cliente, lido por visão
-- (analise-de-referencias.ts): separadores, ícones, tipografia por nível,
-- caixa, cores de destaque, diagramação habitual. Json porque o manual de
-- marca gerado desenha a partir da ESTRUTURA e o planejador lê o TEXTO
-- formatado. Escrito pelo sistema, não pela aba Marca. Idempotente.
ALTER TABLE "BrandDNA" ADD COLUMN IF NOT EXISTS "estiloDasReferencias" JSONB;
