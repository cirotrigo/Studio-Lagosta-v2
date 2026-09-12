/**
 * O serviço do `medir-copy` e do `ver-assinatura` por variante (PR 8 de
 * "Marca simples, copy melhor", F2, 12/09/2026): carrega a assinatura como a
 * composição carrega (a MESMA escolha de variante, as MESMAS fontes, o MESMO
 * medidor do render) e entrega a régua pura de `medir-copy.ts`. Não grava
 * nada: nem página, nem Generation, nem Blob — é leitura com medida.
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { familiasNaoCarregadas, registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { parsePageLayers } from '@/lib/posts/page-layers'
import type { Layer } from '@/types/template'
import { formatoDaPagina, montarAssinatura, NOME_DO_TEMPLATE_DE_ASSINATURA, papelDoNome, type AssinaturaDaMarca, type EstiloDePapel } from './assinatura'
import { arranjosDasCombinacoes, carregarAssinatura, carregarFoto, familiasDoProjeto, luzMediaDaFoto } from './compor'
import { chaveDaPeca } from './preparar-blocos'
import { areaUtilDe, medirCopy, orcamentoDaVariante, type AreaUtil, type MedicaoDaCopy, type OrcamentoDoPapel } from './medir-copy'
import { DIMENSOES, validarSpec, type Formato, type Papel, type SpecDePeca } from './spec'


/** As famílias que uma assinatura pode pedir: a de cada papel, a do destaque desenhado na página e a do destaque padrão. */
function familiasDaAssinatura(a: AssinaturaDaMarca): string[] {
  const out = new Set<string>()
  for (const e of Object.values(a.papeis) as EstiloDePapel[]) {
    if (e.fontFamily) out.add(e.fontFamily)
    if (e.destaque?.fontFamily) out.add(e.destaque.fontFamily)
  }
  if (a.numeros.destaque.fontFamily) out.add(a.numeros.destaque.fontFamily)
  return [...out]
}

export interface PedidoDeMedicao {
  projectId: number
  formato: Formato
  blocos?: Array<{ papel: Papel; linhas: string[] }>
  copyAutoral?: unknown
  variante?: string | null
  tema?: string | null
  nome?: string | null
  /** A foto da peça: entra na escolha da variante (luz clara/escura) e na chave do rodízio — como na composição. */
  fotoDriveId?: string | null
  fotoUrl?: string | null
  preferencias?: { arranjos?: string[] } | null
}

export interface VarianteMedida {
  id: string | null
  nome: string | null
  formatoDaPagina: Formato | null
  cabeTudo: boolean
  papeisAusentes: Papel[]
  naoMedido: boolean
  blocosReduzidos: Papel[]
}

export interface ResultadoDaMedicao {
  variante: { id: string | null; nome: string | null; formatoDaPagina: Formato | null; motivo: string | null }
  /**
   * A escolha da variante pode DIFERIR na composição: não veio variante e a
   * medição não recebeu a foto (a luz clara/escura e a chave do rodízio entram
   * na escolha). Quem for compor fixa `preferencias.variante` com o id medido.
   */
  escolhaProvisoria: boolean
  medicao: MedicaoDaCopy
  /** As outras variantes do formato, medidas com a mesma copy — para escolher pela capacidade, não só pelo nome. */
  outrasVariantes: VarianteMedida[]
}

/**
 * Mede a copy contra a variante que a composição escolheria (ou a pedida) e,
 * de quebra, contra as outras variantes do formato. Nada é gravado.
 */
export async function medirCopyDoProjeto(pedido: PedidoDeMedicao): Promise<ResultadoDaMedicao> {
  const v = validarSpec({
    projectId: pedido.projectId,
    formato: pedido.formato,
    blocos: pedido.blocos,
    copyAutoral: pedido.copyAutoral,
    ...(pedido.fotoDriveId || pedido.fotoUrl ? { foto: { ...(pedido.fotoDriveId ? { driveFileId: pedido.fotoDriveId } : {}), ...(pedido.fotoUrl ? { url: pedido.fotoUrl } : {}) } } : {}),
    ...(pedido.nome ? { nome: pedido.nome } : {}),
    ...(pedido.tema ? { tema: pedido.tema } : {}),
    ...(pedido.variante || pedido.preferencias?.arranjos ? { preferencias: { ...(pedido.variante ? { variante: pedido.variante } : {}), ...(pedido.preferencias?.arranjos ? { arranjos: pedido.preferencias.arranjos } : {}) } } : {}),
  })
  if (!v.spec) throw new CreativeError('SPEC_INVALIDA', v.problemas.join('; '), 400, { problemas: v.problemas })
  const spec: SpecDePeca = v.spec
  const blocos = spec.blocos as Array<{ papel: Papel; linhas: string[] }>
  const papeis = blocos.map((b) => b.papel)

  // A MESMA escolha de variante da composição: a foto antes (a luz média
  // escolhe entre clara/escura), o tema OU o nome, e a chave da peça (R02).
  let luzDaFoto: number | null = null
  const avisosDaFoto: string[] = []
  if (spec.foto) {
    const { foto, aviso } = await carregarFoto(spec)
    if (aviso) avisosDaFoto.push(aviso)
    luzDaFoto = foto ? await luzMediaDaFoto(foto.bytes, DIMENSOES[spec.formato]) : null
  }
  const criterios = { papeis, tema: spec.tema ?? spec.nome ?? null, luzDaFoto, chave: chaveDaPeca(spec) }
  const assinatura = await carregarAssinatura(pedido.projectId, pedido.formato, { variante: spec.preferencias?.variante ?? null, ...criterios })
  if (!assinatura.origem.pageId) {
    throw new CreativeError('ASSINATURA_INCOMPLETA', 'O projeto não tem página de assinatura (template "Assinatura"): sem ela não há fonte, tamanho nem cor para medir.', 422)
  }

  await registerProjectFonts(pedido.projectId)
  const [medir, familias] = await Promise.all([createServerTextBoxMeasurer(), familiasDoProjeto(pedido.projectId)])
  const combinacoesSalvas = await arranjosDasCombinacoes(pedido.projectId, medir)

  const medirContra = async (a: AssinaturaDaMarca): Promise<MedicaoDaCopy> => {
    const fontesNaoCarregadas = await familiasNaoCarregadas([...familiasDaAssinatura(a), ...familias])
    return medirCopy({ spec, assinatura: a, formato: pedido.formato, medir, familias, fontesNaoCarregadas, combinacoesSalvas })
  }
  const medicao = await medirContra(assinatura)
  medicao.avisos.unshift(...avisosDaFoto)

  // As outras variantes do MESMO formato (a página é a verdade do formato), pela mesma régua.
  const template = await db.template.findFirst({ where: { projectId: pedido.projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } })
  const outras = template
    ? await db.page.findMany({ where: { templateId: template.id, id: { not: assinatura.origem.pageId } }, select: { id: true, name: true, tags: true, width: true, height: true }, orderBy: { order: 'asc' } })
    : []
  const outrasVariantes: VarianteMedida[] = []
  for (const p of outras) {
    if (formatoDaPagina(p) !== (assinatura.origem.formatoDaPagina ?? pedido.formato)) continue
    const a = await carregarAssinatura(pedido.projectId, pedido.formato, { variante: p.id, papeis })
    if (!a.origem.pageId) continue
    const m = await medirContra(a)
    outrasVariantes.push({
      id: a.origem.pageId,
      nome: a.origem.variante,
      formatoDaPagina: a.origem.formatoDaPagina,
      cabeTudo: m.cabeTudo,
      papeisAusentes: m.papeisAusentes,
      naoMedido: m.naoMedido,
      blocosReduzidos: m.blocos.filter((b) => b.situacao === 'cabe-reduzido').map((b) => b.papel),
    })
  }

  return {
    variante: { id: assinatura.origem.pageId, nome: assinatura.origem.variante, formatoDaPagina: assinatura.origem.formatoDaPagina, motivo: assinatura.origem.motivoDaVariante ?? null },
    escolhaProvisoria: !spec.preferencias?.variante && !spec.foto && outrasVariantes.length > 0,
    medicao,
    outrasVariantes,
  }
}

export interface EstiloDescrito {
  fonte: string
  /** Disponível no servidor de render (a medida vale). */
  fonteDisponivel: boolean
  tamanho: number
  entrelinha: number
  cor: string
  caixa: string
  prefixo?: string
  larguraMaxima?: number
  destaque?: { cor?: string; fonte?: string; fonteDisponivel?: boolean } | null
  grupo?: string | null
  alinhamento?: string | null
}

export interface VarianteDescrita {
  id: string
  nome: string
  formato: Formato | null
  tags: string[]
  papeis: Papel[]
  aceitaServico: boolean
  temSegundaVoz: boolean
  estilos: Partial<Record<Papel, EstiloDescrito>>
  /** A área útil para o formato PEDIDO (com a escala quando a página é de outro formato). */
  areaUtil: AreaUtil
  orcamento: OrcamentoDoPapel[]
  fontesNaoCarregadas: string[]
  logo: { largura: number } | null
  gradienteDaPagina: boolean
}

/**
 * Cada variante da assinatura com os PRÓPRIOS estilos, a fonte efetivamente
 * disponível, a área útil e o orçamento por papel — até aqui `ver-assinatura`
 * só detalhava a variante carregada e listava as outras pelo nome e pelos
 * papéis.
 */
export async function descreverVariantes(projectId: number, formato: Formato): Promise<{ templateId: number | null; variantes: VarianteDescrita[] }> {
  const [projeto, template] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { assinatura: true, Logo: { where: { isProjectLogo: true }, take: 1, select: { fileUrl: true } } } }),
    db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true } }),
  ])
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${projectId} não encontrado`, 404)
  if (!template) return { templateId: null, variantes: [] }
  const paginas = await db.page.findMany({
    where: { templateId: template.id },
    select: { id: true, name: true, tags: true, width: true, height: true, layers: true, background: true },
    orderBy: { order: 'asc' },
  })
  if (paginas.length === 0) return { templateId: template.id, variantes: [] }

  await registerProjectFonts(projectId)
  const [medir, familias] = await Promise.all([createServerTextBoxMeasurer(), familiasDoProjeto(projectId)])
  const variantes: VarianteDescrita[] = []
  for (const p of paginas) {
    const camadas = parsePageLayers(p.layers) as unknown as Layer[]
    const fmt = formatoDaPagina(p)
    const a = montarAssinatura({
      pagina: { id: p.id, name: p.name, tags: p.tags, width: p.width, height: p.height, background: p.background, layers: camadas },
      formatoDaPagina: fmt,
      numerosDoProjeto: projeto.assinatura,
      logoDoProjeto: projeto.Logo[0] ? { url: projeto.Logo[0].fileUrl } : null,
    })
    const naoCarregadas = await familiasNaoCarregadas([...familiasDaAssinatura(a), ...familias])
    const papeis = [...new Set(camadas.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.visible !== false).map((c) => papelDoNome(c.name) ?? papelDoNome(c.id)).filter((x): x is Papel => !!x))]
    const area = areaUtilDe(a, formato)
    const estilos: Partial<Record<Papel, EstiloDescrito>> = {}
    for (const [papel, e] of Object.entries(a.papeis) as Array<[Papel, EstiloDePapel]>) {
      estilos[papel] = {
        fonte: e.fontFamily,
        fonteDisponivel: !naoCarregadas.has(e.fontFamily),
        tamanho: Math.round(e.fontSize * area.escalaDoFormato),
        entrelinha: e.lineHeight,
        cor: e.color,
        caixa: e.textTransform ?? 'como escrito',
        ...(e.prefixo ? { prefixo: e.prefixo.trim() } : {}),
        ...(e.larguraMaxima ? { larguraMaxima: e.larguraMaxima } : {}),
        ...(e.destaque ? { destaque: { ...(e.destaque.fill ? { cor: e.destaque.fill } : {}), ...(e.destaque.fontFamily ? { fonte: e.destaque.fontFamily, fonteDisponivel: !naoCarregadas.has(e.destaque.fontFamily) } : {}) } } : {}),
        ...(e.grupo ? { grupo: e.grupo } : {}),
        ...(e.alinhamento ? { alinhamento: e.alinhamento } : {}),
      }
    }
    variantes.push({
      id: p.id,
      nome: p.name,
      formato: fmt,
      tags: p.tags.filter((t) => t !== 'assinatura'),
      papeis,
      aceitaServico: papeis.includes('servico'),
      temSegundaVoz: papeis.includes('headline2'),
      estilos,
      areaUtil: area,
      orcamento: orcamentoDaVariante({ assinatura: a, formato, medir, fontesNaoCarregadas: naoCarregadas }),
      fontesNaoCarregadas: [...naoCarregadas].filter((f) => familiasDaAssinatura(a).includes(f)),
      logo: a.logo ? { largura: a.logo.largura } : null,
      gradienteDaPagina: Boolean(a.gradienteDaPagina),
    })
  }
  return { templateId: template.id, variantes }
}
