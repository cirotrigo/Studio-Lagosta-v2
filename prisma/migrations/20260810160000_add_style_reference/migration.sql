-- Artes aprovadas como REFERÊNCIA DE ESTILO.
--
-- A pessoa marca na galeria as artes de que gostou, e a geração passa a mandar
-- UMA delas como referência de papel `style`. O rodízio ("menos usada
-- primeiro") é o ponto do desenho: referência fixa faz toda peça sair igual —
-- o que se quer é parentesco, não clone.
--
-- Duas colunas na própria Generation, e não tabela nova: a arte já mora aqui
-- com o `resultUrl`, e uma tabela de ligação 1:1 só criaria join.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- AlterTable
-- Quando foi marcada como referência. NULL = não é referência.
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "styleRefAt" TIMESTAMP(3);
-- Última vez que foi ENVIADA numa geração. NULL = nunca usada, e por isso vem
-- primeiro no rodízio (`ORDER BY styleRefUsedAt ASC NULLS FIRST`).
ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "styleRefUsedAt" TIMESTAMP(3);

-- CreateIndex
-- Cobre a consulta do rodízio: as referências de um projeto, menos usadas antes.
CREATE INDEX IF NOT EXISTS "Generation_projectId_styleRefAt_styleRefUsedAt_idx"
  ON "Generation"("projectId", "styleRefAt", "styleRefUsedAt");
