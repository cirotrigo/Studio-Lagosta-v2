-- DNA da marca (aba Marca do projeto). Identidade que entra em todo prompt de
-- geração, incondicionalmente — em oposição à base de conhecimento, que é
-- buscada por relevância. Uma coluna TEXT por seção; ver comentário no schema.
CREATE TABLE IF NOT EXISTS "BrandDNA" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "toneOfVoice" TEXT,
    "contentRules" TEXT,
    "composition" TEXT,
    "visualStyle" TEXT,
    "photoDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDNA_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandDNA_projectId_key" ON "BrandDNA"("projectId");

DO $$ BEGIN
    ALTER TABLE "BrandDNA" ADD CONSTRAINT "BrandDNA_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
