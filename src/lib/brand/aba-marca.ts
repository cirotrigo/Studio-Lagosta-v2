/**
 * O que a ABA MARCA lê e grava — serviço, para as rotas HTTP serem finas e o
 * conector (`consultar-voz`, `virar-regra`) e a tela lerem a MESMA verdade.
 *
 * Três áreas (plano "Marca simples, copy melhor", §8): COMO A MARCA FALA (a
 * voz compacta do PR 7, com a precedência resolvida), IDENTIDADE VISUAL (as
 * páginas de assinatura, com atalho ao editor) e FATOS DA CASA (o resumo da
 * base — nunca uma cópia dela).
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl } from '@/lib/creatives/persist'
import { contextoDeVoz, gravarVoz, lerRegistroDaVoz } from '@/lib/brand/voz-service'
import { paginasDeAssinatura } from '@/lib/compositor/compor'
import { lerVoz, type ContextoDeVoz, type VozCompacta } from '@/lib/brand/voz'

export interface VozDaMarca {
  contexto: ContextoDeVoz
  registro: { versao: number; voz: VozCompacta | null; problemas: Array<{ caminho: string; mensagem: string }>; migradaEm: string | null; dnaArquivado: unknown; atualizadaEm: string } | null
  /** O DNA de texto — o que manda enquanto o cliente não foi migrado; depois, fica arquivado só para leitura. */
  legado: { toneOfVoice: string | null; contentRules: string | null }
}

export async function lerVozDaMarca(projectId: number): Promise<VozDaMarca> {
  const [registro, contexto, dna] = await Promise.all([
    lerRegistroDaVoz(projectId),
    contextoDeVoz(projectId),
    db.brandDNA.findUnique({ where: { projectId }, select: { toneOfVoice: true, contentRules: true } }),
  ])
  return {
    contexto,
    registro: registro
      ? { versao: registro.versao, voz: registro.voz, problemas: registro.problemas, migradaEm: registro.migradaEm?.toISOString() ?? null, dnaArquivado: registro.dnaArquivado, atualizadaEm: registro.updatedAt.toISOString() }
      : null,
    legado: { toneOfVoice: dna?.toneOfVoice ?? null, contentRules: dna?.contentRules ?? null },
  }
}

export interface SalvarVozArgs {
  projectId: number
  voz: unknown
  /** A versão que a tela LEU; obrigatória quando já existe voz (CAS de `gravarVoz`). */
  versaoEsperada?: number | null
}

/**
 * Grava a voz editada na tela. `lerVoz` devolve TODOS os problemas antes de
 * qualquer escrita (`VOZ_INVALIDA`, 400); a versão lida protege contra a
 * edição concorrente (`VOZ_DIVERGENTE`, 409 — a tela recarrega e mostra o que
 * mudou por baixo). A precedência NÃO muda aqui: gravar a voz não migra o
 * cliente (isso é o manifesto do PR 13, decisão do Ciro).
 */
export async function salvarVozDaMarca(args: SalvarVozArgs): Promise<VozDaMarca & { gravada: { versao: number; criada: boolean } }> {
  const lida = lerVoz(args.voz)
  if (!lida.voz) {
    throw new CreativeError('VOZ_INVALIDA', `A voz não passa no contrato (${lida.problemas.length} problema${lida.problemas.length === 1 ? '' : 's'}).`, 400, { problemas: lida.problemas })
  }
  const gravada = await gravarVoz({ projectId: args.projectId, voz: lida.voz, ...(args.versaoEsperada != null ? { versaoEsperada: args.versaoEsperada } : {}) })
  const depois = await lerVozDaMarca(args.projectId)
  return { ...depois, gravada: { versao: gravada.versao, criada: gravada.criada } }
}

export interface ResumoDosFatos {
  total: number
  porCategoria: Array<{ categoria: string; total: number; ultimaAtualizacao: string | null }>
  /** Entradas ACTIVE com prazo nos próximos 14 dias (vencendo) e as já vencidas que o cron ainda não arquivou. */
  vencendo: Array<{ id: string; titulo: string; categoria: string; validaAte: string }>
  vencidas: Array<{ id: string; titulo: string; categoria: string; validaAte: string }>
  ultimaAtualizacao: string | null
  atalhos: { base: string; conhecimento: string }
}

/** O RESUMO da base — contagens e prazos, nunca o conteúdo: editar é lá, e a tela só aponta. */
export async function resumoDosFatos(projectId: number, agora = new Date()): Promise<ResumoDosFatos> {
  const em14 = new Date(agora.getTime() + 14 * 86_400_000)
  const [grupos, comPrazo] = await Promise.all([
    db.knowledgeBaseEntry.groupBy({ by: ['category'], where: { projectId, status: 'ACTIVE' }, _count: { _all: true }, _max: { updatedAt: true } }),
    db.knowledgeBaseEntry.findMany({
      where: { projectId, status: 'ACTIVE', expiresAt: { not: null, lte: em14 } },
      select: { id: true, title: true, category: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: 20,
    }),
  ])
  const porCategoria = grupos
    .map((g) => ({ categoria: g.category, total: g._count._all, ultimaAtualizacao: g._max.updatedAt?.toISOString() ?? null }))
    .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria))
  const ultima = porCategoria.map((c) => c.ultimaAtualizacao).filter((d): d is string => !!d).sort().pop() ?? null
  const linha = (e: { id: string; title: string; category: string; expiresAt: Date | null }) => ({ id: e.id, titulo: e.title, categoria: e.category, validaAte: (e.expiresAt as Date).toISOString() })
  const app = getPublicAppUrl()
  return {
    total: porCategoria.reduce((s, c) => s + c.total, 0),
    porCategoria,
    vencendo: comPrazo.filter((e) => (e.expiresAt as Date) > agora).map(linha),
    vencidas: comPrazo.filter((e) => (e.expiresAt as Date) <= agora).map(linha),
    ultimaAtualizacao: ultima,
    atalhos: { base: `${app}/projects/${projectId}/base`, conhecimento: `${app}/knowledge?projectId=${projectId}` },
  }
}

export interface AssinaturaDaMarcaNaTela {
  templateId: number | null
  editorUrl: string | null
  variantes: Array<{ id: string; nome: string; formato: string; papeis: string[]; tags: string[]; largura: number; altura: number; miniatura: string | null; editorUrl: string | null }>
}

/** As páginas de assinatura (uma por variante), com a miniatura quando ela é publicável (nunca `data:`) e o atalho ao editor. */
export async function assinaturasDaMarca(projectId: number): Promise<AssinaturaDaMarcaNaTela> {
  const { templateId, paginas } = await paginasDeAssinatura(projectId)
  if (!templateId) return { templateId: null, editorUrl: null, variantes: [] }
  const miniaturas = await db.page.findMany({ where: { templateId }, select: { id: true, thumbnail: true } })
  const porId = new Map(miniaturas.map((m) => [m.id, m.thumbnail]))
  const app = getPublicAppUrl()
  return {
    templateId,
    editorUrl: `${app}/templates/${templateId}/editor`,
    variantes: paginas.map((p) => {
      const thumb = porId.get(p.id) ?? null
      return {
        id: p.id,
        nome: p.name,
        formato: p.formato,
        papeis: p.papeis,
        tags: p.tags.filter((t) => t !== 'assinatura'),
        largura: p.width,
        altura: p.height,
        miniatura: thumb && !thumb.startsWith('data:') ? thumb : null,
        editorUrl: `${app}/templates/${templateId}/editor?pageId=${encodeURIComponent(p.id)}`,
      }
    }),
  }
}
