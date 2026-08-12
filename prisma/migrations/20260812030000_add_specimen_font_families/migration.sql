-- Curadoria da prancha tipográfica (type-specimen): quando preenchido, a
-- prancha mostra exatamente estas famílias, nesta ordem, em vez da heurística
-- de papéis + esqueletos. Necessário porque a existência de CustomFont não
-- significa uso da marca (Bacana: 8 pesos de Cannon em uso + United/guttery
-- legadas que não podem ser apagadas — camadas antigas ainda as referenciam).
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "specimenFontFamilies" TEXT[] NOT NULL DEFAULT '{}';
