import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import {
  registrarDecisaoSemSugestao,
  registrarDesfecho,
} from '@/lib/aprendizado/captura'
import { chaveDeSugestao } from '@/lib/aprendizado/chaves'
import {
  blocosDaEscolha,
  fecharDicaDeCopyDoItem,
} from '@/lib/aprendizado/sinal-de-copy-do-plano'
import { anotarMotivoDaTroca } from '@/lib/aprendizado/sinal-de-foto'
import {
  DESFECHOS,
  SUPERFICIES,
  exigeSugestao,
  motivoDeTrocaValido,
  normalizarDesfecho,
  normalizarSuperficie,
  normalizarTipo,
  TIPOS_DE_SINAL,
} from '@/lib/aprendizado/vocabulario'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * O que a bancada decidiu — o caminho que hoje MORRE NO NAVEGADOR.
 *
 * A fila da bancada é localStorage: descartar a sugestão, trocar a foto, mudar
 * o horário e escrever a copy são deletes e edições locais que nunca tocam o
 * servidor. Sem esta rota, o aprendizado só enxerga o que foi aceito — viés de
 * sobrevivência puro, e justamente nas primeiras semanas de uso.
 *
 * Casca fina sobre `src/lib/aprendizado/captura.ts` (a mesma regra do MCP:
 * tool/rota embrulha serviço). Ela aceita as DUAS formas:
 *
 *   com `sugestaoId` → fecha o desfecho de uma proposta emitida;
 *   sem `sugestaoId` → decisão SEM sugestão (a escolha absoluta), que é o
 *   corpus comum enquanto a dica de copy não existe.
 *
 * ⚠️ É chamada em fire-and-forget pelo cliente: falha aqui NUNCA pode travar a
 * bancada. Por isso um sinal recusado pelo núcleo volta 200 com o motivo —
 * 4xx/5xx só para pedido malformado, que é erro de programação, não de uso.
 */
const bodySchema = z
  .object({
    /** Obrigatório quando não há `sugestaoId`. */
    tipo: z.enum(TIPOS_DE_SINAL as [string, ...string[]]).optional(),
    sugestaoId: z.string().min(1).max(64).optional(),
    desfecho: z.enum(DESFECHOS as [string, ...string[]]).optional(),
    /** O que a pessoa de fato escolheu (ou o que sobrou depois da edição). */
    escolhido: z.unknown().optional(),
    /** Diff estruturado, quando houver. */
    diff: z.unknown().optional(),
    superficie: z.enum(SUPERFICIES as [string, ...string[]]).optional(),
    /**
     * Idempotência do cliente. O servidor a namespaceia por projeto e tipo —
     * a coluna é única GLOBAL, e um `item.id` cru colidiria entre projetos.
     */
    chave: z.string().min(1).max(120).optional(),
    /**
     * O item de plano que este card representa, quando ele veio de uma leva.
     *
     * É o que evita a CONTAGEM DUPLA da copy: item que recebeu dica de
     * `propor-semana` tem uma sugestão de texto em aberto, e registrar o mesmo
     * texto como escolha absoluta criaria dois sinais com sentidos opostos
     * sobre a mesma coisa. Com este campo, o servidor fecha a dica comparando
     * o texto proposto com o final (`fecharDicaDeCopyDoItem`) e só cai na
     * escolha absoluta quando não havia dica nenhuma.
     */
    itemDePlanoId: z.string().min(1).max(64).optional(),
    /**
     * F4: o chip de motivo tocado DEPOIS de o desfecho já ter sido postado.
     * Sozinho com `sugestaoId` (sem `desfecho`), só ANOTA o motivo no
     * `escolhido` já gravado do sinal de foto — nunca cria nem revisa desfecho.
     */
    motivoDaTroca: z.string().min(1).max(40).optional(),
    postId: z.string().min(1).max(64).optional(),
    generationId: z.string().min(1).max(64).optional(),
    pageId: z.string().min(1).max(64).optional(),
    campaignId: z.string().min(1).max(64).optional(),
  })
  .strict()

/** Teto do payload — acima disso o núcleo já trunca; aqui recusamos antes. */
const TETO_ESCOLHIDO = 32 * 1024

/**
 * O `escolhido` de um sinal de FOTO (reconhecido pelo `driveFileId`) aceita
 * `{ driveFileId, posicao?, motivo? }`. O `motivo` é o chip pós-troca da F4 e
 * tem vocabulário fechado (`MOTIVOS_DE_TROCA_DE_FOTO`): valor fora dele é
 * DESCARTADO em silêncio — a rota é fire-and-forget, e um chip desconhecido
 * não pode virar 4xx nem lixo no corpus. Os demais campos passam intactos;
 * `escolhido` de outros tipos de sinal não é tocado.
 */
function sanearEscolhidoDeFoto(escolhido: unknown): unknown {
  if (!escolhido || typeof escolhido !== 'object' || Array.isArray(escolhido)) return escolhido
  const bruto = escolhido as Record<string, unknown>
  if (typeof bruto.driveFileId !== 'string') return escolhido
  if (!('motivo' in bruto) || motivoDeTrocaValido(bruto.motivo)) return escolhido
  const semMotivo = { ...bruto }
  delete semMotivo.motivo
  return semMotivo
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const id = Number(projectId)
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const corpo = parsed.data

    if (corpo.escolhido !== undefined && JSON.stringify(corpo.escolhido ?? null).length > TETO_ESCOLHIDO) {
      return NextResponse.json({ error: 'Payload grande demais para um sinal' }, { status: 413 })
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId. Busca somente
     * leitura: usuário ainda sem linha deixa a coluna nula (é auditoria), e
     * criar User a partir daqui é exatamente como nascem os fantasmas.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
    const superficie = normalizarSuperficie(corpo.superficie) ?? 'bancada'
    const vinculos = {
      postId: corpo.postId,
      generationId: corpo.generationId,
      pageId: corpo.pageId,
      campaignId: corpo.campaignId,
    }

    /**
     * O chip de motivo tocado DEPOIS do desfecho: `{ sugestaoId, motivoDaTroca }`
     * sem `desfecho` só anota. Motivo inválido é descartado dentro do serviço
     * (a resposta diz o resultado, mas continua 200 — fire-and-forget).
     */
    if (corpo.sugestaoId && corpo.motivoDaTroca && corpo.desfecho === undefined) {
      const resultado = await anotarMotivoDaTroca({
        sugestaoId: corpo.sugestaoId,
        motivo: corpo.motivoDaTroca,
      })
      return NextResponse.json({ ok: resultado === 'anotado', resultado })
    }

    if (corpo.sugestaoId) {
      const desfecho = normalizarDesfecho(corpo.desfecho)
      if (!desfecho || !exigeSugestao(desfecho)) {
        return NextResponse.json(
          {
            error:
              'Desfecho inválido para uma sugestão emitida (escolha-propria descreve a AUSÊNCIA de sugestão).',
          },
          { status: 400 },
        )
      }
      const resultado = await registrarDesfecho({
        sugestaoId: corpo.sugestaoId,
        desfecho,
        escolhido: sanearEscolhidoDeFoto(corpo.escolhido),
        diff: corpo.diff,
        decididoPor: dbUser?.id,
        superficie,
        ...vinculos,
      })
      return NextResponse.json({ ok: resultado !== 'erro', resultado })
    }

    const tipo = normalizarTipo(corpo.tipo)
    if (!tipo) {
      return NextResponse.json(
        { error: 'Informe "tipo" quando não houver sugestaoId — a decisão precisa dizer sobre o quê é.' },
        { status: 400 },
      )
    }
    if (corpo.escolhido === undefined) {
      return NextResponse.json(
        { error: 'Decisão sem sugestão precisa de "escolhido" — é a metade que dá o corpus.' },
        { status: 400 },
      )
    }

    /**
     * Copy de um card que veio de uma leva: se houve DICA, o que se registra é
     * o desfecho dela — nunca uma decisão nova. O desfecho é calculado aqui,
     * comparando o texto proposto com o que a pessoa mandou gerar; a tela não
     * declara nada (mesma regra de `avaliarSlotSugerido`).
     */
    if (tipo === 'copy' && corpo.itemDePlanoId) {
      const fechamento = await fecharDicaDeCopyDoItem({
        projectId: id,
        itemDePlanoId: corpo.itemDePlanoId,
        copyFinal: blocosDaEscolha(corpo.escolhido),
        decididoPor: dbUser?.id,
        superficie,
        generationId: corpo.generationId,
        postId: corpo.postId,
      })
      // `sem-dica` é o caso comum (item montado na bancada, leva anterior à
      // dica de copy) e cai no registro de sempre, logo abaixo.
      if (fechamento !== 'sem-dica') {
        return NextResponse.json({ ok: fechamento !== 'erro', resultado: fechamento })
      }
    }

    const sinalId = await registrarDecisaoSemSugestao({
      projectId: id,
      tipo,
      escolhido: sanearEscolhidoDeFoto(corpo.escolhido),
      diff: corpo.diff,
      decididoPor: dbUser?.id,
      superficie,
      chave: corpo.chave ? chaveDeSugestao(tipo, superficie, id, corpo.chave) : null,
      ...vinculos,
    })
    return NextResponse.json({ ok: !!sinalId, ...(sinalId ? { sinalId } : {}) })
  } catch (error) {
    // Nem o erro inesperado pode virar ruído na bancada: quem chama é
    // fire-and-forget e ignora a resposta.
    console.error('[aprendizado] erro inesperado na rota de desfecho:', error)
    return NextResponse.json({ ok: false, resultado: 'erro' })
  }
}
