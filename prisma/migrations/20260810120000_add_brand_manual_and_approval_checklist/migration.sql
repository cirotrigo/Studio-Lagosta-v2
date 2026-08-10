-- Duas colunas que vêm do que só existia no insta-automatico:
--
-- 1. Project.brandManualUrl — o manual da marca feito por DESIGNER
--    (templates/<slug>/assets/brand-manual.png de lá). No insta-automatico ele
--    tem prioridade absoluta sobre qualquer card auto-gerado, e é a diferença
--    entre "o modelo reconhece a marca" e "o modelo aproxima a marca". O
--    brand-reference-card do Studio passa a preferi-lo quando existe.
--
-- 2. BrandDNA.approvalChecklist — o crivo de aprovação em perguntas binárias
--    (item 4 da Fase 2). Coluna PRÓPRIA, e não mais texto dentro de
--    contentRules, porque contentRules é injetado VERBATIM no prompt de
--    imagem: 15 perguntas interrogativas ali seriam ruído num prompt que já é
--    65% DNA, e "Existe mais de uma oferta na mesma peça?" lido pelo gerador
--    é, na melhor das hipóteses, inútil. O crivo é semântica de REVISÃO, não
--    de geração — e precisa ser lido linha a linha pela UI.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "brandManualUrl" TEXT;

-- AlterTable
ALTER TABLE "BrandDNA" ADD COLUMN IF NOT EXISTS "approvalChecklist" TEXT;
