/**
 * Tier do gpt-image na trilha `arte` — o vocabulário, o padrão e como falar
 * disso com quem não é técnico.
 *
 * Módulo PURO, sem Prisma e sem SDK de IA, porque a bancada e a galeria são
 * client e precisam dos rótulos (mesma razão de `art-direction.ts` e
 * `learning-scope.ts`).
 *
 * MEDIÇÃO QUE ORIGINOU A ESCOLHA (12/08/2026, `scripts/medir-qualidade-trilha-arte.ts`,
 * mesma peça do Espeto Gaúcho, 3 repetições por tier):
 *
 * | tier   | texto | tempo | fatura     |
 * |--------|-------|-------|------------|
 * | low    | 3/3   |  38s  | US$ 0,008  |
 * | medium | 3/3   |  60s  | US$ 0,045  |
 * | high   | 3/3   | 125s  | US$ 0,165  |
 *
 * Os três passaram na conferência de texto e os três desenharam o lettering
 * íntegro — til do "Ã" no lugar, traço fechado, sem artefato. Por isso o padrão
 * é `low`: a 1/20 do preço do `high` e um terço do tempo.
 *
 * ⚠️ O QUE A MEDIÇÃO TAMBÉM MOSTROU, e que NENHUM verificador pega hoje: os
 * tiers baratos INVENTAM número. No selo do Google, apareceu contagem de
 * avaliação fabricada em 2 de 3 peças no `low` e 1 de 3 no `medium`, contra 0
 * de 3 no `high` — dados factuais e verificáveis sobre o negócio do cliente.
 * `verifyImageTexts` confere se o texto esperado ESTÁ presente e não tem regra
 * contra texto A MAIS, então as três peças passaram com veredito verde. Quem
 * pega isso é o olho de quem aprova. Não trate o ✅ da conferência como aval de
 * que a arte não inventou nada.
 */

export type QualidadeArte = 'low' | 'medium' | 'high'

/**
 * O padrão da casa desde 12/08/2026. Era `high` cravado dentro de
 * `runImageEdit`, sem ninguém ter escolhido.
 */
export const QUALIDADE_ARTE_PADRAO: QualidadeArte = 'low'

/** As opções oferecidas a quem clica em "gerar de novo". */
export const QUALIDADES_OFERECIDAS: QualidadeArte[] = ['low', 'medium']

/**
 * Como cada tier é apresentado.
 *
 * O rótulo fala de TEMPO e CUSTO, nunca de "qualidade baixa/alta": os três
 * tiers produziram lettering íntegro na medição, então chamar o `low` de
 * "qualidade baixa" seria mentir sobre o que a pessoa está escolhendo. E
 * "low/medium" não é vocabulário de quem cuida do Instagram de restaurante —
 * mesma regra que proíbe DRAFT/SCHEDULED na conversa.
 */
export const ROTULO_QUALIDADE: Record<QualidadeArte, { titulo: string; detalhe: string }> = {
  low: {
    titulo: 'Mais rápido e barato',
    detalhe: 'Cerca de 40 segundos. É o padrão.',
  },
  medium: {
    titulo: 'Mais caro e demorado',
    detalhe: 'Cerca de 1 minuto, com mais capricho no desenho.',
  },
  high: {
    titulo: 'O mais caro de todos',
    detalhe: 'Cerca de 2 minutos.',
  },
}

/** Normaliza o que veio de fora (query, JSON de tool, campo antigo). */
export function lerQualidade(valor: unknown): QualidadeArte | null {
  return valor === 'low' || valor === 'medium' || valor === 'high' ? valor : null
}
