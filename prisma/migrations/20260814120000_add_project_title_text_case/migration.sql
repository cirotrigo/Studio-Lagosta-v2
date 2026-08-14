-- Caixa dos títulos nas artes geradas por IA ('caixa-alta' | 'title-case' |
-- 'como-escrito'). NULL = caixa alta, o comportamento histórico — o TYPOGRAPHY
-- LOCK cravava "caixa alta" para todo projeto e marca com DNA em Title Case
-- (Real Gelateria) saía sempre em caps. TEXT e não enum do Postgres, precedente
-- de LearningSignal; vocabulário validado em src/lib/brand/title-text-case.ts.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "titleTextCase" TEXT;
