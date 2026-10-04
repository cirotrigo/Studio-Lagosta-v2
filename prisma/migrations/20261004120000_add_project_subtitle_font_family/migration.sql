-- Campo opcional já presente no schema Prisma desde 27/07/2026.
-- Não reescreve o histórico nem adapta silenciosamente uma coluna incompatível.
DO $migration$
DECLARE
  existing_column RECORD;
BEGIN
  -- Serializa a inspeção e o ADD COLUMN contra DDL concorrente.
  LOCK TABLE public."Project" IN ACCESS EXCLUSIVE MODE;

  SELECT atttypid, atttypmod, attnotnull, atthasdef,
         attidentity, attgenerated, attcollation
    INTO existing_column
    FROM pg_catalog.pg_attribute
   WHERE attrelid = 'public."Project"'::regclass
     AND attname = 'subtitleFontFamily'
     AND attnum > 0
     AND NOT attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public."Project" ADD COLUMN "subtitleFontFamily" TEXT;
  ELSIF existing_column.atttypid <> 'pg_catalog.text'::regtype
     OR existing_column.atttypmod <> -1
     OR existing_column.attnotnull
     OR existing_column.atthasdef
     OR existing_column.attidentity <> ''
     OR existing_column.attgenerated <> ''
     OR existing_column.attcollation <> (
       SELECT typcollation FROM pg_catalog.pg_type
        WHERE oid = 'pg_catalog.text'::regtype
     ) THEN
    RAISE EXCEPTION 'Project.subtitleFontFamily incompatível: esperado TEXT nullable, sem default/geração e com collation padrão.'
      USING ERRCODE = '23514';
  END IF;
END
$migration$;
