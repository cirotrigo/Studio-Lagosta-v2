/**
 * Reconciliação do plano com as artes (F3).
 *
 * 🔴 **Ninguém avisa o plano quando uma geração termina.** A fila durável
 * (F0.3) não conhece plano — e é de propósito: lá mora COMO o trabalho roda, e
 * fazer o runner escrever no plano seria acoplar as duas coisas que a F0.3
 * separou. O preço é que um item marcado `na-fila` continuaria dizendo "na
 * fila" para sempre, com a arte pronta na galeria ao lado.
 *
 * Quem junta as pontas é esta leitura, no mesmo espírito da atribuição por
 * RECONCILIAÇÃO de `sinal-de-modelo.ts`: em vez de exigir que o outro lado
 * devolva um id, olha-se o mundo e conclui-se o que aconteceu.
 *
 * Contrato:
 *  - **nunca lança.** É chamada de `ver-plano` e do GET da rota, que existem
 *    para MOSTRAR o plano — falhar em atualizar uma situação não pode deixar a
 *    pessoa sem a leva na tela. Erro vira log e resultado vazio;
 *  - **não cria, não cobra, não apaga.** Só move a situação de itens que já
 *    estão em voo (`na-fila`/`gerando`) e que têm arte;
 *  - **arte que sumiu não move nada.** Apagar a Generation não pode marcar o
 *    item como falho: a arte pode ter sido apagada da galeria depois de pronta.
 */

import { db } from '@/lib/db'
import { transicionarItem, statusDoItem } from '@/lib/planos/plano-service'
import { caminhoAte, situacaoPelaArte, type StatusDaArte } from '@/lib/planos/execucao'
import type { StatusDoItem } from '@/lib/planos/vocabulario'

/** Teto de itens conferidos por chamada — uma leva é de 5 a 15, 60 é o máximo. */
const TETO = 60

export interface ItemMovido {
  itemId: string
  de: StatusDoItem
  para: StatusDoItem
  /** O motivo em português, quando o item foi para `erro`. */
  erro?: string
}

export interface ResultadoDaReconciliacao {
  /** Quantos itens em voo foram conferidos. */
  conferidos: number
  movidos: ItemMovido[]
}

const VAZIO: ResultadoDaReconciliacao = { conferidos: 0, movidos: [] }

/**
 * Lê o motivo da falha em português a partir do registro atômico da run.
 *
 * `fieldValues.error` é onde os dois runners e a recuperação da fila escrevem
 * a frase legível ("A geração foi interrompida e as tentativas acabaram…").
 * Sem ela, uma frase honesta em vez de um código.
 */
function motivoDaFalha(fieldValues: unknown): string {
  if (fieldValues && typeof fieldValues === 'object' && !Array.isArray(fieldValues)) {
    const bruto = (fieldValues as Record<string, unknown>).error
    if (typeof bruto === 'string' && bruto.trim()) return bruto.trim().slice(0, 500)
  }
  return 'A produção desta arte falhou. Dá para tentar de novo.'
}

/**
 * Confere as artes dos itens em voo de um plano e move o que já terminou.
 *
 * `PROCESSING` → "gerando a arte"; `COMPLETED` → "arte pronta"; `FAILED` →
 * "falhou", com o motivo.
 */
export async function reconciliarPlano(
  projectId: number,
  planoId: string,
): Promise<ResultadoDaReconciliacao> {
  try {
    const emVoo = await db.itemDePlano.findMany({
      where: {
        planoId,
        projectId,
        status: { in: ['na-fila', 'gerando'] },
        generationId: { not: null },
      },
      select: { id: true, status: true, generationId: true },
      take: TETO,
    })
    if (emVoo.length === 0) return VAZIO

    const artes = await db.generation.findMany({
      where: { id: { in: emVoo.map((i) => i.generationId as string) } },
      select: { id: true, status: true, fieldValues: true },
    })
    const porId = new Map(artes.map((a) => [a.id, a]))

    const movidos: ItemMovido[] = []
    for (const item of emVoo) {
      const arte = porId.get(item.generationId as string)
      const de = statusDoItem(item)
      const para = situacaoPelaArte(de, (arte?.status as StatusDaArte | undefined) ?? null)
      if (!para) continue

      const erro = para === 'erro' ? motivoDaFalha(arte?.fieldValues) : undefined
      const movido = await mover({ projectId, planoId, itemId: item.id, de, para, erro })
      if (movido) movidos.push(movido)
    }

    return { conferidos: emVoo.length, movidos }
  } catch (erro) {
    console.error(`[planos] falha ao reconciliar o plano ${planoId} (seguindo sem isso):`, erro)
    return VAZIO
  }
}

/**
 * Caminha a situação até o destino, um passo de cada vez.
 *
 * 🔴 `na-fila` → `pronto` NÃO é transição válida (o item passa por `gerando`),
 * e é justamente o caso que aparece toda vez que o cron da fila termina a arte
 * antes de alguém abrir o plano. `caminhoAte` resolve, e caminhar é fiel: o
 * item de fato esteve gerando, só não havia ninguém olhando.
 */
async function mover(entrada: {
  projectId: number
  planoId: string
  itemId: string
  de: StatusDoItem
  para: StatusDoItem
  erro?: string
}): Promise<ItemMovido | null> {
  const passos = caminhoAte(entrada.de, entrada.para)
  if (!passos || passos.length === 0) return null

  try {
    for (const passo of passos) {
      await transicionarItem({
        projectId: entrada.projectId,
        planoId: entrada.planoId,
        itemId: entrada.itemId,
        para: passo,
        // O motivo só acompanha o passo final; um `gerando` intermediário não
        // tem erro nenhum para contar.
        erro: passo === 'erro' ? entrada.erro : undefined,
      })
    }
    return {
      itemId: entrada.itemId,
      de: entrada.de,
      para: entrada.para,
      ...(entrada.erro ? { erro: entrada.erro } : {}),
    }
  } catch (erro) {
    console.error(`[planos] item ${entrada.itemId} não pôde ser reconciliado:`, erro)
    return null
  }
}
