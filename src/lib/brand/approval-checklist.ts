/**
 * Crivo de aprovação: leitura do texto do DNA em itens.
 *
 * Módulo SEM dependências de propósito — quem consome é a bancada, que é
 * client. `brand-context.ts` importa o Prisma no topo, então uma função
 * utilitária morando lá arrastaria o banco inteiro para o bundle do navegador.
 * Mesma razão pela qual `art-direction.ts` é um módulo à parte.
 */

/**
 * Quebra o crivo em itens. Uma pergunta por linha; numeração de origem
 * ("1. ", "- ") é removida para a UI numerar sozinha.
 *
 * A polaridade é MISTA de propósito — no By Rock convivem "O layout é igual ao
 * da peça anterior?" (reprova no SIM) e "A foto acontece dentro do salão real
 * da casa?" (reprova no NÃO). Não tente derivar veredito automático disso: o
 * crivo é leitura consciente de quem aprova, não formulário pontuado.
 */
export function parseApprovalChecklist(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 0)
}
