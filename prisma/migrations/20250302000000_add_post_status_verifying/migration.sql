-- Add VERIFYING to PostStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'PostStatus' AND e.enumlabel = 'VERIFYING') THEN
    ALTER TYPE "PostStatus" ADD VALUE 'VERIFYING';
  END IF;
END $$;
