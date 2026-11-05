import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hasProjectOwnership, hasProjectReadAccess, withProjectOwner } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { comTravaPorChave } from '@/lib/trava-por-chave'
import { NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura'
import { TAG_FORA_DO_RODIZIO } from '@/lib/compositor/fora-do-rodizio'
import { copiaDeEstiloDaPagina, mesmaVariante, validarVariantePromovida } from '@/lib/compositor/variante-promovida'
import { pedirRecomposicaoDaArteCongelada } from '@/lib/compositor/recompor'

/**
 * T5 (24/10/2026) — PROMOVER uma página própria a variante da marca: uma CÓPIA de estilo e geometria entra no fim do
 * template "Assinatura" do mesmo projeto, FORA do rodízio (só entra numa peça quando pedida pelo id ou pelo nome). A
 * origem nunca é escrita. Contrato: `cp-t5-promocao-preflight/PREFLIGHT.md` §4 (rodada 1) e
 * `docs/regras/compositor.md` ("Variante promovida").
 *
 * Recusas, nesta ordem (nada é gravado em nenhuma): 401 · 404 `TEMPLATE_NAO_ENCONTRADO` (inexistente ou sem leitura)
 * · 403 `SEM_CURADORIA` · 422 `ORIGEM_JA_NA_ASSINATURA` · 400 `PEDIDO_INVALIDO` · 422 `ASSINATURA_AUSENTE` /
 * `ASSINATURA_AMBIGUA` · 409 `ASSINATURA_MUDOU` · 404 `ORIGEM_NAO_ENCONTRADA` · 422 da validação (`CAMADAS_INVALIDAS`,
 * `IDS_DE_CAMADA_REPETIDOS`, `VETOR_INVALIDO`, `FORMATO_NAO_SUPORTADO`, `VARIANTE_SEM_MANCHETE`,
 * `COPIA_NAO_EQUIVALENTE`) · 503 `NAO_TERMINOU` (repetir é seguro: a cópia é idempotente).
 *
 * Travas, ordem fixa: a consultiva `paginas-do-template:<destino>` → a linha do `Template` destino `FOR SHARE` (o PUT que
 * renomeia espera, ou a promoção lê o nome novo) → as leituras. Dentro da transação só `tx` e só banco: a cópia e a
 * validação são puras (sem fonte, sem rede). Limites (só PostgreSQL prova): a serialização real da trava e do `FOR
 * SHARE`; e não há unicidade GLOBAL do nome "Assinatura" contra quem cria template sem cooperar (só um índice único).
 */

const pedidoSchema = z.object({}).strict()

async function templateComProjeto(templateId: number) {
  if (!Number.isInteger(templateId) || templateId <= 0) return null
  return db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: { select: { clerkOrgId: true, name: true } },
            },
          },
        },
      },
    },
  })
}

const recusa = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, message, ...extra }, { status })

/** O Prisma fecha a transação interativa pelo tempo (P2028) ou não acha conexão no pool (P2024). */
const estourouOTempo = (erro: unknown) => ['P2028', 'P2024'].includes((erro as { code?: string } | null)?.code ?? '')

export async function POST(request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  try {
    const { userId, orgId, orgRole } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, pageId } = await params
    const templateId = Number(id)
    const template = await templateComProjeto(templateId)
    if (!template) return recusa(404, 'TEMPLATE_NAO_ENCONTRADO', 'Template não encontrado.')
    const projeto = await withProjectOwner(template.Project)
    if (!hasProjectReadAccess(projeto, { userId, orgId })) return recusa(404, 'TEMPLATE_NAO_ENCONTRADO', 'Template não encontrado.')
    // Curadoria, não edição: a variante vale para todas as peças da marca — o mesmo gate do "Marcar modelo".
    if (!hasProjectOwnership(projeto, { userId, orgId, orgRole })) {
      return recusa(403, 'SEM_CURADORIA', 'Só o dono do projeto (ou um admin da organização) promove uma página a variante da marca.')
    }
    if (template.name === NOME_DO_TEMPLATE_DE_ASSINATURA) {
      return recusa(422, 'ORIGEM_JA_NA_ASSINATURA', 'Esta página já está no template "Assinatura": para outra variante, duplique a página.')
    }

    const corpo = await request.json().catch(() => ({}))
    if (!pedidoSchema.safeParse(corpo ?? {}).success) return recusa(400, 'PEDIDO_INVALIDO', 'Pedido inválido: a promoção não recebe parâmetros.')

    const candidatos = await db.template.findMany({ where: { projectId: template.projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true }, take: 2 })
    if (candidatos.length === 0) {
      return recusa(422, 'ASSINATURA_AUSENTE', 'A marca não tem template "Assinatura". Crie a assinatura antes de promover uma página a variante.')
    }
    const ambigua = () => new CreativeError('ASSINATURA_AMBIGUA', 'A marca tem mais de um template "Assinatura": deixe só um antes de promover.', 422)
    if (candidatos.length > 1) throw ambigua()
    const destinoId = candidatos[0].id

    const r = await comTravaPorChave(`paginas-do-template:${destinoId}`, async (tx) => {
      const [destino] = await tx.$queryRaw<Array<{ id: number; name: string; projectId: number }>>`SELECT "id", "name", "projectId" FROM "Template" WHERE "id" = ${destinoId} FOR SHARE`
      if (!destino || destino.name !== NOME_DO_TEMPLATE_DE_ASSINATURA || destino.projectId !== template.projectId) {
        throw new CreativeError('ASSINATURA_MUDOU', 'O template "Assinatura" mudou enquanto a promoção esperava: nada foi criado. Tente de novo.', 409)
      }
      if ((await tx.template.count({ where: { projectId: template.projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA } })) !== 1) throw ambigua()

      const origem = await tx.page.findFirst({ where: { id: pageId, templateId }, select: { name: true, width: true, height: true, background: true, layers: true, tags: true } })
      if (!origem) throw new CreativeError('ORIGEM_NAO_ENCONTRADA', 'A página não está neste template: nada foi criado.', 404)
      const copia = copiaDeEstiloDaPagina(origem)
      const v = validarVariantePromovida(copia, origem)
      // `in`, não `!v.ok`: sem `strict` o TypeScript não estreita a união pelo literal booleano.
      if ('codigo' in v) throw new CreativeError(v.codigo, v.mensagem, 422, v.detalhes)

      const promovidas = await tx.page.findMany({ where: { templateId: destinoId, tags: { has: TAG_FORA_DO_RODIZIO } }, select: { id: true, name: true, width: true, height: true, background: true, layers: true } })
      const existente = promovidas.find((p) => mesmaVariante(p, copia))
      if (existente) return { pageId: existente.id, criada: false, copia, v }

      const ultima = await tx.page.findFirst({ where: { templateId: destinoId }, orderBy: { order: 'desc' }, select: { order: true } })
      const nova = await tx.page.create({
        data: {
          name: copia.name,
          width: copia.width,
          height: copia.height,
          background: copia.background,
          layers: JSON.stringify(copia.layers),
          tags: copia.tags,
          order: (ultima?.order ?? -1) + 1,
          templateId: destinoId,
          isTemplate: false,
        },
        select: { id: true },
      })
      // AGENTS: quem grava Page.layers chama as DUAS — nunca dispensadas por "página nova não tem post".
      await invalidateScheduledRenders(tx, { pageIds: [nova.id] })
      return { pageId: nova.id, criada: true, copia, v }
    })
    if (r.criada) await pedirRecomposicaoDaArteCongelada([r.pageId])

    return NextResponse.json(
      {
        pageId: r.pageId,
        assinaturaTemplateId: destinoId,
        nome: r.copia.name,
        formato: r.v.formato,
        papeis: r.v.papeis,
        foraDoRodizio: true,
        editorUrl: `/templates/${destinoId}/editor?pageId=${encodeURIComponent(r.pageId)}`,
        avisos: r.v.avisos,
        ...(r.criada ? {} : { jaExistia: true }),
      },
      { status: r.criada ? 201 : 200 },
    )
  } catch (erro) {
    if (erro instanceof CreativeError) return NextResponse.json(erro.toJSON(), { status: erro.status })
    if (estourouOTempo(erro)) return recusa(503, 'NAO_TERMINOU', 'A promoção não terminou a tempo e nada foi criado. Tente de novo: repetir é seguro.')
    console.error('[promover-variante] erro ao promover a página:', erro)
    return recusa(500, 'ERRO_INTERNO', 'Não foi possível promover a página.')
  }
}
