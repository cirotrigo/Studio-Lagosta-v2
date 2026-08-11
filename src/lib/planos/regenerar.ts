/**
 * Reprovar um item do plano — a recusa que NÃO é beco sem saída (F3).
 *
 * O plano de evolução é literal sobre isto: a reprovação com motivo "vira
 * transição registrada E sinal, não beco". São as duas metades:
 *
 *  1. o item passa por `reprovado` (guardando o motivo) e volta para uma
 *     situação editável, pronto para nova tentativa;
 *  2. o motivo vira SINAL de aprendizado — porque "esta não presta, e por quê"
 *     é a informação mais cara que existe aqui, e ela só aparece quando alguém
 *     se dá ao trabalho de reprovar.
 *
 * O sinal muda de natureza conforme o item já tenha arte ou não:
 *
 *  - **com arte** → feedback de arte (`melhorar` + comentário), que é o sinal
 *    amarrado ao PROMPT exato que a produziu. Desde que os vereditos
 *    automáticos foram desligados (10-11/08), é a única medida de qualidade que
 *    não é palpite — deixar essa reprovação fora do corpus seria desperdício;
 *  - **sem arte** → decisão sem sugestão, `tipo: 'item-de-plano'`: a recusa é
 *    da proposta inteira (tema + horário + modelo + texto), e não de uma das
 *    partes.
 *
 * ⚠️ Falha de captura NUNCA derruba o fluxo (contrato de `captura.ts`): o item
 * é reprovado de qualquer jeito, e o sinal perdido sai no log.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { chaveDeSugestao, resumoEstavel } from '@/lib/aprendizado/chaves'
import { registrarDecisaoSemSugestao } from '@/lib/aprendizado/captura'
import { registrarFeedbackDeArte } from '@/lib/aprendizado/feedback-de-arte'
import { transicionarItem, statusDoItem } from '@/lib/planos/plano-service'
import {
  motivoDeNaoEditavel,
  normalizarStatusDoItem,
  transicaoPermitida,
  type StatusDoItem,
} from '@/lib/planos/vocabulario'

/** Teto do motivo — o mesmo do comentário de feedback de arte. */
const TETO_MOTIVO = 1000

/** Versão da captura desta superfície, para comparar safras depois. */
const VERSAO = 'plano-v1'

export interface RegenerarItemInput {
  projectId: number
  planoId: string
  itemId: string
  /** Por que não serve. É o que vira sinal — sem ele a recusa não ensina nada. */
  motivo: string
  /** Para onde o item volta: 'editado' (padrão) ou 'aprovado'. */
  voltarPara?: string | null
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
  decididoPor?: string | null
}

export interface RegenerarItemResultado {
  itemId: string
  de: StatusDoItem
  situacao: StatusDoItem
  motivo: string
  /** `true` quando o motivo virou feedback da arte que já existia. */
  virouFeedbackDaArte: boolean
  mensagem: string
}

export async function regenerarItem(input: RegenerarItemInput): Promise<RegenerarItemResultado> {
  const motivo = String(input.motivo ?? '').trim().slice(0, TETO_MOTIVO)
  if (!motivo) {
    throw new CreativeError(
      'MOTIVO_OBRIGATORIO',
      'Diga por que este item não serve — é o motivo que ensina o sistema a não repetir o erro.',
      400,
    )
  }

  const destino = normalizarStatusDoItem(input.voltarPara ?? 'editado')
  if (!destino || (destino !== 'editado' && destino !== 'aprovado')) {
    throw new CreativeError(
      'DESTINO_INVALIDO',
      `Depois de reprovado o item volta para "editado" (para ser mexido) ou "aprovado" (para ser produzido de novo como está) — recebi "${input.voltarPara}".`,
      400,
    )
  }

  const item = await db.itemDePlano.findFirst({
    where: { id: input.itemId, planoId: input.planoId, projectId: input.projectId },
    select: {
      id: true,
      status: true,
      tema: true,
      via: true,
      formato: true,
      generationId: true,
      sourcePageId: true,
      campaignId: true,
      copyProposta: true,
      quando: true,
    },
  })
  if (!item) {
    throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Este item não existe neste plano.', 404)
  }

  const de = statusDoItem(item)
  if (!transicaoPermitida(de, 'reprovado')) {
    // `gerando` é o caso real: reprovar no meio da produção obrigaria a passar
    // por `erro`, que registraria uma falha que não houve. `agendado` é
    // terminal — daí em diante quem manda é o post.
    throw new CreativeError(
      'ITEM_NAO_REPROVAVEL',
      de === 'gerando'
        ? 'A arte deste item está sendo produzida agora — espere terminar para reprovar.'
        : `Não dá para reprovar: ${motivoDeNaoEditavel(de)}.`,
      409,
      { status: de },
    )
  }

  await transicionarItem({
    projectId: input.projectId,
    planoId: input.planoId,
    itemId: item.id,
    para: 'reprovado',
    motivo,
    decididoPor: input.decididoPor ?? undefined,
  })

  const depois = await transicionarItem({
    projectId: input.projectId,
    planoId: input.planoId,
    itemId: item.id,
    para: destino,
    decididoPor: input.decididoPor ?? undefined,
  })

  const virouFeedbackDaArte = await registrarSinal({ ...input, motivo }, item, de)

  return {
    itemId: item.id,
    de,
    situacao: statusDoItem(depois),
    motivo,
    virouFeedbackDaArte,
    mensagem:
      destino === 'aprovado'
        ? 'Item reprovado com o motivo registrado e liberado para nova produção.'
        : 'Item reprovado com o motivo registrado e devolvido para edição — ajuste o que for preciso antes de produzir de novo.',
  }
}

async function registrarSinal(
  input: RegenerarItemInput & { motivo: string },
  item: {
    id: string
    tema: string | null
    via: string
    formato: string
    generationId: string | null
    sourcePageId: string | null
    campaignId: string | null
    copyProposta: string[]
    quando: Date | null
  },
  de: StatusDoItem,
): Promise<boolean> {
  try {
    if (item.generationId) {
      const r = await registrarFeedbackDeArte({
        generationId: item.generationId,
        projectId: input.projectId,
        veredito: 'melhorar',
        comentario: input.motivo,
        decididoPor: input.decididoPor ?? null,
        superficie: 'chat',
      })
      return r.ok
    }

    await registrarDecisaoSemSugestao({
      projectId: input.projectId,
      tipo: 'item-de-plano',
      escolhido: {
        acao: 'reprovado',
        motivo: input.motivo,
        de,
        tema: item.tema,
        via: item.via,
        formato: item.formato,
        quando: item.quando?.toISOString() ?? null,
        copyProposta: item.copyProposta,
        versao: VERSAO,
      },
      decididoPor: input.decididoPor ?? null,
      superficie: 'chat',
      pageId: item.sourcePageId,
      campaignId: item.campaignId,
      // O motivo entra na chave: reprovar duas vezes pelo MESMO motivo é a
      // mesma opinião repetida (retry da tool no chat); reprovar de novo por
      // outra razão é um fato novo, e merece linha própria.
      chave: chaveDeSugestao(
        'plano-item-reprovado',
        VERSAO,
        input.projectId,
        item.id,
        resumoEstavel(input.motivo),
      ),
    })
    return false
  } catch (erro) {
    console.error('[planos] a reprovação não virou sinal (seguindo sem ele):', erro)
    return false
  }
}
