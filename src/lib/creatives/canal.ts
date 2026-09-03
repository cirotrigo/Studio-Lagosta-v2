/**
 * O CANAL por onde a arte entrou no Studio — módulo PURO (a galeria é client).
 *
 * Existe porque o filtro por membro da galeria só enxerga `createdBy` que
 * seja `clerkId`, e três produtores assinavam com `Project.userId` (o id
 * INTERNO do dono): a API externa do Claudinho, o MCP local e a mídia de
 * post. Medido em 03/09/2026: 1.289 das 3.013 artes da carteira em 60 dias
 * caíam num avatar "Usuário" sem nome, misturando Claudinho, canvas e MCP.
 *
 * O canal é ORTOGONAL ao autor: quem assina continua sendo `createdBy`; o
 * canal diz por onde veio. É decidido na PORTA DE ENTRADA (rota, tool), nunca
 * no serviço — o mesmo `createArteRapida` serve ao Claudinho e ao conector.
 */

export const CANAIS = ['claudinho', 'claude-ai', 'claude-code', 'studio'] as const
export type CanalDaArte = (typeof CANAIS)[number]

export const ROTULO_DO_CANAL: Record<CanalDaArte, string> = {
  claudinho: 'Claudinho',
  'claude-ai': 'Claude.ai',
  'claude-code': 'Claude Code',
  studio: 'Studio',
}

/** Canais automáticos — os que NÃO são uma pessoa logada no app. */
export const CANAIS_AUTOMATICOS: readonly CanalDaArte[] = ['claudinho', 'claude-ai', 'claude-code']

export function ehCanal(v: unknown): v is CanalDaArte {
  return typeof v === 'string' && (CANAIS as readonly string[]).includes(v)
}

/**
 * As opções do filtro "Origem" da galeria. `melhoria` não é canal — é a arte
 * com `sourceGenerationId` (melhorada com IA), venha de onde vier — mas mora
 * no mesmo seletor porque é a pergunta que a equipe faz ("o que a IA mexeu?").
 */
export const ORIGENS_DO_FILTRO = [...CANAIS, 'melhoria'] as const
export type OrigemDoFiltro = (typeof ORIGENS_DO_FILTRO)[number]

export const ROTULO_DA_ORIGEM: Record<OrigemDoFiltro, string> = {
  ...ROTULO_DO_CANAL,
  studio: 'Feitas no Studio',
  claudinho: 'Veio do Claudinho',
  'claude-ai': 'Veio do Claude.ai',
  'claude-code': 'Veio do Claude Code',
  melhoria: 'Melhoradas com IA',
}

export function ehOrigemDoFiltro(v: unknown): v is OrigemDoFiltro {
  return typeof v === 'string' && (ORIGENS_DO_FILTRO as readonly string[]).includes(v)
}

/** `createdBy` que é uma conta do Clerk (pessoa), e não um id interno. */
export function ehClerkId(createdBy: string | null | undefined): boolean {
  return typeof createdBy === 'string' && createdBy.startsWith('user_')
}
