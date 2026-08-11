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
import { Prisma } from '../../../prisma/generated/client'
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


// ── Carrossel ───────────────────────────────────────────────────────────────

interface SlideDoJson {
  ordem?: number | null
  generationId?: string | null
  resultUrl?: string | null
  erro?: string | null
  [k: string]: unknown
}

/** Lê o Json de slides com desconfiança; qualquer coisa fora do shape é nulo. */
function lerSlides(bruto: unknown): { groupId?: unknown; lista: SlideDoJson[] } | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const lista = (bruto as { lista?: unknown }).lista
  if (!Array.isArray(lista) || lista.length === 0) return null
  return { ...(bruto as object), lista: lista as SlideDoJson[] }
}

function gensDosSlides(bruto: unknown): string[] {
  const slides = lerSlides(bruto)
  return (slides?.lista ?? [])
    .map((s) => s.generationId)
    .filter((g): g is string => typeof g === 'string' && g !== '')
}

/** Escreve nos slides o que as artes já sabem (resultUrl/erro). */
function atualizarSlidesPelasArtes(
  slides: { lista: SlideDoJson[] },
  porId: Map<string, { status: string; resultUrl: string | null; fieldValues: unknown }>,
): { lista: SlideDoJson[]; mudou: boolean } {
  let mudou = false
  const lista = slides.lista.map((s) => {
    if (!s.generationId) return s
    const arte = porId.get(s.generationId)
    if (!arte) return s
    if (arte.status === 'COMPLETED' && arte.resultUrl && s.resultUrl !== arte.resultUrl) {
      mudou = true
      return { ...s, resultUrl: arte.resultUrl, erro: null }
    }
    if (arte.status === 'FAILED' && !s.erro) {
      mudou = true
      return { ...s, erro: motivoDaFalha(arte.fieldValues) }
    }
    return s
  })
  return { lista, mudou }
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
        // Peça única em voo tem generationId; carrossel em voo tem os gens
        // DENTRO de slides — os dois entram, e quem não tem nada fica.
        OR: [{ generationId: { not: null } }, { slides: { not: Prisma.DbNull } }],
      },
      select: { id: true, status: true, generationId: true, slides: true },
      take: TETO,
    })
    if (emVoo.length === 0) return VAZIO

    const idsDeArte = emVoo.flatMap((i) => [
      ...(i.generationId ? [i.generationId] : []),
      ...gensDosSlides(i.slides),
    ])
    const artes = idsDeArte.length
      ? await db.generation.findMany({
          where: { id: { in: idsDeArte } },
          select: { id: true, status: true, resultUrl: true, fieldValues: true },
        })
      : []
    const porId = new Map(artes.map((a) => [a.id, a]))

    const movidos: ItemMovido[] = []
    for (const item of emVoo) {
      const de = statusDoItem(item)

      // ── Carrossel: o desfecho é da SÉRIE, não de uma arte ──────────────────
      const slides = lerSlides(item.slides)
      if (slides) {
        const { lista, mudou } = atualizarSlidesPelasArtes(slides, porId)
        const comGen = lista.filter((s) => s.generationId)
        const pendentes = comGen.filter((s) => !s.resultUrl && !s.erro)
        const falhou = comGen.some((s) => s.erro)
        // Série esperando a confirmação do guia (slides sem gen) NÃO é pronta.
        const completa =
          comGen.length === lista.length && lista.length > 0 && pendentes.length === 0 && !falhou

        const para = falhou ? ('erro' as const) : completa ? ('pronto' as const) : null
        if (!para) {
          // Nada de terminal — mas o que as artes já contaram fica gravado,
          // para outro navegador ver a série avançando slide a slide.
          if (mudou) {
            await db.itemDePlano
              .update({
                where: { id: item.id },
                data: { slides: { ...slides, lista } as Prisma.InputJsonValue },
              })
              .catch(() => {})
          }
          continue
        }
        const erroDaSerie = falhou
          ? (lista.find((s) => s.erro)?.erro ?? 'Um slide da série falhou.')
          : undefined
        const movido = await mover({
          projectId,
          planoId,
          itemId: item.id,
          de,
          para,
          erro: erroDaSerie,
          slides: { ...slides, lista },
        })
        if (movido) movidos.push(movido)
        continue
      }

      const arte = porId.get(item.generationId as string)
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
  /** Carrossel: a série atualizada, gravada junto com o desfecho. */
  slides?: unknown
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
        // O motivo (e a série, no carrossel) só acompanham o passo final; um
        // `gerando` intermediário não tem nada a contar.
        erro: passo === 'erro' ? entrada.erro : undefined,
        ...(passo === entrada.para && entrada.slides !== undefined
          ? { slides: entrada.slides }
          : {}),
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
