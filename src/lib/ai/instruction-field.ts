/**
 * Constantes do campo "instrução para a IA" que aparece ao gerar e ao agendar
 * uma arte no editor.
 *
 * Preenchido, o criativo gerado passa pela melhoria com IA levando a instrução
 * junto. Vazio, o fluxo segue sem melhoria nenhuma — é o que mantém a geração
 * em lote barata e previsível.
 */

/** Mesmo teto do modal de melhoria e do Zod em /api/generations/[id]/improve. */
export const AI_INSTRUCTION_MAX_CHARS = 500

/**
 * Custo da melhoria, por arte. Fonte da verdade é
 * `FEATURE_CREDIT_COSTS.ai_creative_improvement` em
 * src/lib/credits/feature-config.ts — replicado aqui porque aquele módulo
 * importa o client do Prisma e não pode entrar no bundle do navegador.
 */
export const AI_IMPROVEMENT_CREDIT_COST = 25

/** Curto de propósito: o textarea tem 3 linhas e texto maior fica cortado. */
export const AI_INSTRUCTION_PLACEHOLDER =
  'Ex: deixe o título em arco e destaque o preço com marca-texto.'
