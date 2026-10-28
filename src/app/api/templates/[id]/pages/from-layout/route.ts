import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hasProjectReadAccess, hasProjectWriteAccess, withProjectOwner } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { prepararCamadasParaGravar } from '@/lib/creatives/layer-contract'
import { parsePageLayers } from '@/lib/posts/page-layers'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { revisaoDaPaginaComCamadas, tentarCopyEfetivaDasCamadas } from '@/lib/copy-autoral'
import { comTravaPorChave } from '@/lib/trava-por-chave'
import { comporPeca, paginasDeAssinatura } from '@/lib/compositor/compor'
import { NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura'
import { pedirRecomposicaoDaArteCongelada } from '@/lib/compositor/recompor'
import { DIMENSOES, type SpecDePeca } from '@/lib/compositor/spec'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import { copyAutoralDaSpec } from '@/lib/compositor/persistencia'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { vitrineDeArquetipos } from '@/lib/compositor/arquetipos/na-spec'
import { semFoto, textoNoLiso } from '@/lib/compositor/arquetipos/fundo'
import {
  contratoDoLayout,
  fotoDaPaginaParaLayout,
  nomeDaPaginaDoLayout,
  specDoLayout,
  tagsDaPaginaDoLayout,
  textosDaPagina,
} from '@/lib/compositor/arquetipos/da-pagina'
import type { Layer } from '@/types/template'

/**
 * CP-T2 (24/10/2026) — a aba Layouts do editor.
 *
 * POST: cria uma página NOVA a partir de uma página do template e de um arquétipo (d07: layout só em página nova; a
 * origem nunca muda). GET: a vitrine (os arquétipos e a geometria de referência, para as prévias) e se a marca tem
 * página de assinatura — sem ela o card nasce desabilitado com o motivo.
 *
 * Erros do POST (nada é gravado em nenhum deles): 400 corpo inválido · 401 · 403 sem escrita no projeto · 404
 * template ou origem fora dele · 409 `LAYOUT_SEM_FOTO` (único 409 desta rota: a UI abre o painel de imagens) · 422
 * `ASSINATURA_INCOMPLETA` e as recusas do compositor (`ARQUETIPO_*`, `TEXTO_NAO_CABE`…) com o código e a mensagem dele.
 */

const pedidoSchema = z
  .object({
    arquetipo: z
      .object({
        id: z.string().min(1).max(80),
        versao: z.number().int().min(1).optional(),
        // Nenhum arquétipo publicado tem parâmetros: chave aqui é recusada, nunca ignorada.
        params: z.object({}).strict().optional(),
      })
      .strict(),
    aPartirDaPagina: z.string().min(1).max(64),
    fotoUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), 'fotoUrl precisa ser https')
      .optional(),
  })
  .strict()

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

// T5 (preflight): a página nova nasce no template da origem, e TODA página do template "Assinatura" entra no rodízio
// de variantes (`paginasDeAssinatura`). Criar layout ali seria promover a variante sem curador e sem exclusão do
// rodízio — semântica que o T5 ainda não tem. Até o contrato existir, o layout nesse template é recusado.
const LAYOUT_NA_ASSINATURA =
  'Layouts não são criados no template "Assinatura": a página entraria sozinha no rodízio de variantes da marca. Use o layout numa página de outro template.'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const template = await templateComProjeto(Number((await params).id))
  if (!template) return recusa(404, 'TEMPLATE_NAO_ENCONTRADO', 'Template não encontrado.')
  if (
    !hasProjectReadAccess(await withProjectOwner(template.Project), {
      userId,
      orgId,
    })
  ) {
    return recusa(403, 'SEM_ACESSO', 'Sem acesso a este projeto.')
  }
  const { paginas } = await paginasDeAssinatura(template.projectId)
  const arquetipos = vitrineDeArquetipos().map((a) => {
    const d = verArquetipo(a.id, a.versao)
    const geometria = Object.fromEntries(
      a.formatos.map((f) => [
        f,
        Object.fromEntries(
          Object.entries(d?.formatos[f]?.papeis ?? {}).flatMap(([papel, pos]) =>
            'referencia' in pos ? [[papel, pos.referencia]] : [],
          ),
        ),
      ]),
    )
    return { ...a, papeis: d?.papeis ?? [], geometria }
  })
  return NextResponse.json({
    arquetipos,
    assinatura:
      template.name === NOME_DO_TEMPLATE_DE_ASSINATURA
        ? { disponivel: false, motivo: LAYOUT_NA_ASSINATURA }
        : paginas.length > 0
        ? { disponivel: true }
        : {
            disponivel: false,
            motivo:
              'A marca não tem página de assinatura (template "Assinatura"): sem ela não há fonte, tamanho nem cor para o layout.',
          },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const templateId = Number((await params).id)
    const template = await templateComProjeto(templateId)
    if (!template) return recusa(404, 'TEMPLATE_NAO_ENCONTRADO', 'Template não encontrado.')
    if (
      !hasProjectWriteAccess(await withProjectOwner(template.Project), {
        userId,
        orgId,
      })
    ) {
      return recusa(403, 'SEM_ACESSO', 'Sem permissão de edição neste projeto.')
    }
    if (template.name === NOME_DO_TEMPLATE_DE_ASSINATURA) return recusa(422, 'LAYOUT_NA_ASSINATURA', LAYOUT_NA_ASSINATURA)

    const lido = pedidoSchema.safeParse(await request.json().catch(() => null))
    if (!lido.success)
      return recusa(400, 'PEDIDO_INVALIDO', 'Pedido inválido.', {
        details: lido.error.errors,
      })
    const pedido = lido.data

    // A origem pertence a ESTE template (e, por ele, ao projeto conferido acima): id de outro template é 404.
    const origem = await db.page.findFirst({
      where: { id: pedido.aPartirDaPagina, templateId },
    })
    if (!origem) return recusa(404, 'ORIGEM_NAO_ENCONTRADA', 'A página de origem não está neste template.')

    const definicao = verArquetipo(pedido.arquetipo.id, pedido.arquetipo.versao)
    if (!definicao) {
      return recusa(422, 'ARQUETIPO_DESCONHECIDO', `O layout "${pedido.arquetipo.id}" não está no catálogo.`, {
        arquetipo: pedido.arquetipo,
      })
    }

    const camadasDaOrigem = parsePageLayers(origem.layers) as unknown as Layer[]
    // T4-E: o layout SEM foto (fundo liso claro) não procura foto na origem; a pedida explicitamente segue para o
    // compositor, que a recusa (ARQUETIPO_FOTO_NAO_SUPORTADA) — uma fonte só para essa recusa. O de foto segue como era.
    const layoutSemFoto = semFoto(definicao)
    const fotoUrl = pedido.fotoUrl ?? (layoutSemFoto ? null : fotoDaPaginaParaLayout(camadasDaOrigem, origem))
    if (!fotoUrl && !layoutSemFoto) {
      return recusa(
        409,
        'LAYOUT_SEM_FOTO',
        'A página não tem foto de fundo (nem imagem cobrindo 90% dela). Escolha uma foto para o layout.',
      )
    }

    if ((await paginasDeAssinatura(template.projectId)).paginas.length === 0) {
      return recusa(
        422,
        'ASSINATURA_INCOMPLETA',
        'A marca não tem página de assinatura (template "Assinatura"): sem ela não há fonte, tamanho nem cor para o layout.',
      )
    }

    const formato = formatoDaPaginaGravada(origem)
    const { porPapel, foraDoLayout } = textosDaPagina(camadasDaOrigem, definicao)
    const arquetipo = {
      id: pedido.arquetipo.id,
      ...(pedido.arquetipo.versao ? { versao: pedido.arquetipo.versao } : {}),
    }
    // Rodada 1 (P2-1): origem COM contrato de copy → a spec é o CONTRATO, confrontado com as camadas de hoje (a
    // diferença é reconciliação do sistema, como no PATCH) e recortado ao arquétipo. Voltar aos blocos legados
    // reativaria a divisão antiga da manchete e apagaria a segunda voz declarada e a autoria.
    // Rodada 2: quando esse contrato NÃO pode ser levado com fidelidade (ilegível, reconciliação ou recorte recusados
    // — histórico cheio, por exemplo), a rota RECUSA antes de compor e de gravar. Cair nos blocos legados compunha com
    // outra regra de voz; nesta fase não se inventa política de histórico.
    const intransportavel = (motivo: string) =>
      new CreativeError(
        'COPY_DA_ORIGEM_NAO_TRANSPORTAVEL',
        `O contrato da copy desta página não pode ser levado para o layout (${motivo}). Para não trocar a divisão da manchete nem perder a autoria dos textos, nada foi criado e a página continua igual.`,
        422,
        { motivo },
      )
    const revisada =
      origem.copyAutoral == null
        ? null
        : revisaoDaPaginaComCamadas(origem.copyAutoral, origem.layers, {
            autor: 'sistema',
            motivo: 'reconciliação com as camadas da origem antes do layout',
            superficie: 'layout',
          })
    if (revisada && revisada.estado !== 'registrada' && revisada.estado !== 'sem-mudanca') {
      throw intransportavel(
        revisada.aviso ??
          (revisada.estado === 'sem-contrato' ? 'o contrato gravado é ilegível' : 'as camadas da página são ilegíveis'),
      )
    }
    const recorte = revisada ? contratoDoLayout(revisada.copy!, definicao) : null
    if (recorte && recorte.ok === false) throw intransportavel(recorte.aviso)
    const { spec, placeholders } =
      recorte && recorte.ok
        ? {
            spec: {
              projectId: template.projectId,
              formato,
              ...(fotoUrl ? { foto: { url: fotoUrl } } : {}),
              arquetipo,
              copyAutoral: recorte.contrato,
            } as SpecDePeca,
            placeholders: recorte.placeholders,
          }
        : specDoLayout({ projectId: template.projectId, formato, arquetipo, definicao, fotoUrl, porPapel })

    const composicao = await comporPeca(spec, { somenteAvaliar: true })
    const { camadas } = prepararCamadasParaGravar(composicao.layers)

    // A página guarda a copy EFETIVA (lida das camadas finais), como o compositor grava. Com o contrato da origem, ela
    // segue o histórico dele — e se a efetiva não cabe nele, recusa antes de gravar (rodada 2: a página não nasce sem
    // o contrato que a compôs). Sem contrato na origem: o adaptador do legado (autoria `desconhecido`), ou nenhum
    // quando há placeholder ("Título" não é copy de ninguém).
    const original = spec.copyAutoral ?? (placeholders.length === 0 ? copyAutoralDaSpec(spec).copy : null)
    const lida = original ? tentarCopyEfetivaDasCamadas(original, camadas as Layer[], { superficie: 'layout' }) : null
    if (spec.copyAutoral && lida && lida.ok === false) throw intransportavel(lida.aviso)
    const copyAutoral = lida && lida.ok ? lida.leitura.efetiva : null

    // Rodada 1 (P2-3): a posição é decidida DENTRO da transação, sob a trava das páginas do template (duas criações
    // de layout nunca calculam a mesma posição) e com a linha da origem travada e RELIDA — a ordem lida antes do
    // compositor pode ter mudado enquanto ele trabalhava.
    const nova = await comTravaPorChave(`paginas-do-template:${templateId}`, async (tx) => {
      const [linha] = await tx.$queryRaw<
        Array<{ order: number }>
      >`SELECT "order" FROM "Page" WHERE "id" = ${origem.id} AND "templateId" = ${templateId} FOR UPDATE`
      if (!linha) {
        throw new CreativeError(
          'ORIGEM_NAO_ENCONTRADA',
          'A página de origem saiu deste template enquanto o layout era composto: nada foi criado.',
          404,
        )
      }
      const ordem = linha.order + 1
      // Logo depois da origem: as páginas de lá para baixo descem uma posição.
      await tx.page.updateMany({ where: { templateId, order: { gte: ordem } }, data: { order: { increment: 1 } } })
      const criada = await tx.page.create({
        data: {
          name: nomeDaPaginaDoLayout(definicao.nome, placeholders.length > 0),
          width: DIMENSOES[formato].width,
          height: DIMENSOES[formato].height,
          layers: JSON.stringify(camadas),
          // T4-E: sem foto, o fundo é o que o compositor mediu e desenhou (o mesmo que o GET e o editor reabrem); com
          // foto, a foto cobre a peça e o fundo da origem segue como era. #8: com a foto em caixa, o texto fica no liso —
          // o fundo é o papel que o compositor escolheu pelo contraste (o mesmo da régua e da prova).
          background: textoNoLiso(definicao) ? composicao.fundo : origem.background,
          order: ordem,
          templateId,
          isTemplate: false,
          tags: tagsDaPaginaDoLayout(definicao.id),
          ...(copyAutoral ? { copyAutoral: copyAutoral as never } : {}),
        },
        select: { id: true },
      })
      // AGENTS: quem grava Page.layers chama as DUAS — nunca dispensadas por "página nova não tem post".
      await invalidateScheduledRenders(tx, { pageIds: [criada.id] })
      return criada
    })
    await pedirRecomposicaoDaArteCongelada([nova.id])

    return NextResponse.json(
      {
        pageId: nova.id,
        placeholders,
        foraDoLayout,
        avisos: [
          ...composicao.diagnostico.avisos,
          ...(foraDoLayout.length > 0
            ? [`${foraDoLayout.length} texto(s) da página não entraram no layout (sem papel ou sem lugar nele).`]
            : []),
          ...(lida && lida.ok === false ? [lida.aviso] : []),
        ],
      },
      { status: 201 },
    )
  } catch (erro) {
    if (erro instanceof CreativeError) return NextResponse.json(erro.toJSON(), { status: erro.status })
    console.error('[from-layout] erro ao criar página de layout:', erro)
    return recusa(500, 'ERRO_INTERNO', 'Não foi possível criar a página do layout.')
  }
}
