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

/** Quando o cliente autoriza mexer na FOTO, o padrão sobe. Ver abaixo. */
export const QUALIDADE_ARTE_COM_AJUSTE_DE_FOTO: QualidadeArte = 'high'

/**
 * O tier padrão desta geração.
 *
 * 🔴 A regra é: **compor é barato, EDITAR A FOTO é caro.**
 *
 * Medido em 12/08/2026 nos dois testes, e eles dizem coisas opostas:
 *
 * - **desenhar letra sobre a foto**: os três tiers empataram, 3/3 no texto, com
 *   lettering íntegro. Alto contraste e forma chapada sobrevivem a qualquer
 *   tier — daí o padrão `low`, a 1/20 do preço.
 * - **editar a foto** (`instrucaoImagem`): pedindo para cortar a picanha ao
 *   meio e revelar o ponto, o `low` devolveu uma mancha rosa lisa, sem fibra
 *   legível e com transição abrupta da crosta — parecia pintado, não cortado.
 *   `medium` e `high` renderam fibra com direção e gradiente de cocção. A
 *   nitidez acompanhou, monotônica: 700 / 754 / 870.
 *
 * Faz sentido físico: gradiente de cocção em fibra muscular é exatamente a
 * microtextura que o tier barato sacrifica, e é irrelevante para uma letra.
 *
 * A escolha EXPLÍCITA de quem clica em "gerar de novo" sempre vence — este é o
 * padrão, não um teto.
 *
 * ⚠️ Em CRÉDITOS não muda nada: a trilha `arte` cobra 25 flat. O que sobe é a
 * fatura (US$ 0,008 → 0,165) e o tempo (~43s → ~125s), que ainda cabe folgado
 * nos 300s da rota.
 */
export function qualidadePadraoPara(opcoes: {
  temAjusteDeFoto: boolean
  /**
   * O modo da MELHORIA (05/09/2026). `redesenhar` refaz a diagramação inteira
   * — lettering novo, ornamentos finos, pills — e o guia oficial de prompting
   * dos GPT Image models pede `medium`/`high` para texto denso e multi-fonte;
   * a medição de 12/08 mostrou que o `low` inventa número no selo. Foi em
   * `medium` que a F0 do plano mediu o redesenho (4/4 limpas). `rediagramar` e
   * `refinar` mexem pouco na peça e seguem no `low`.
   */
  modo?: 'rediagramar' | 'redesenhar' | 'refinar'
}): QualidadeArte {
  if (opcoes.temAjusteDeFoto) return QUALIDADE_ARTE_COM_AJUSTE_DE_FOTO
  if (opcoes.modo === 'redesenhar') return QUALIDADE_ARTE_REDESENHO
  return QUALIDADE_ARTE_PADRAO
}

/** O tier do modo `redesenhar` da melhoria — ver `qualidadePadraoPara`. */
export const QUALIDADE_ARTE_REDESENHO: QualidadeArte = 'medium'

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
