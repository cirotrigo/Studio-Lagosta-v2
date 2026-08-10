-- Escopo de aprendizado do post: o que o sistema pode aprender com ele.
--
-- ROTINA (padrão) é o que forma a cadência e o repertório do cliente;
-- CAMPANHA vale para a próxima edição daquela campanha, não para a rotina;
-- PONTUAL é o post que não deve ensinar nada (evento único, aviso de feriado).
--
-- O desenho é CAPTURAR SEMPRE, MARCAR POR ITEM, FILTRAR NA AGREGAÇÃO — e não
-- um interruptor global de captura. Interruptor falha nos dois sentidos:
-- esquecido desligado perde sinal, que é IRREVERSÍVEL, e esquecido ligado
-- contamina. Além disso, uma leva normal mistura os três tipos: o marcador
-- precisa ser do item.
--
-- Escrita à mão (padrão idempotente do 0_init) porque `migrate dev` pede reset
-- contra o banco com drift — ver CLAUDE.md § Database Management.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LearningScope" AS ENUM ('ROTINA', 'CAMPANHA', 'PONTUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
-- Default ROTINA: o caminho comum não pede decisão nenhuma, e o histórico
-- anterior a esta migration continua valendo como rotina (que é o que é).
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "learningScope" "LearningScope" NOT NULL DEFAULT 'ROTINA';

-- Entrada CAMPANHAS da base de conhecimento que dá o escopo temporal.
-- SEM foreign key, de propósito — mesmo precedente de
-- `Generation.sourceGenerationId`: arquivar ou apagar a campanha não pode
-- arrastar (nem travar) o post que aconteceu de verdade.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

-- Como a decisão nasceu: 'sugerido-aceito' | 'sugerido-editado' |
-- 'escolha-propria'. Texto e não enum porque o vocabulário ainda vai se
-- mexer nas fases de captura (F1) — enum novo exige migration a cada ajuste.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "origem" TEXT;

-- Sugestão que originou o post. A tabela de sugestões chega na F1; a coluna
-- nasce aqui para que a decisão e a sugestão sejam gravadas na MESMA escrita.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "sugestaoId" TEXT;

-- Quem decidiu, como User.id INTERNO (cuid) — NUNCA o clerkId. A confusão
-- entre os dois espaços já criou User fantasma no banco.
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "decididoPor" TEXT;

-- CreateIndex
-- Cobre a agregação por escopo dentro de um cliente (excluir PONTUAL do
-- histórico, separar o sub-perfil de CAMPANHA).
CREATE INDEX IF NOT EXISTS "SocialPost_projectId_learningScope_idx"
  ON "SocialPost"("projectId", "learningScope");
