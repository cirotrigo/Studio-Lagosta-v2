/**
 * Varredura SÓ LEITURA das camadas `svg-path` gravadas (CP-X2a, preflight X2 v2.1 §5, gate G).
 *
 * Puro quanto ao banco: recebe um leitor com APENAS `findMany` por modelo (`somenteLeitura`), lê em lotes
 * por cursor e devolve contagens por fonte e por código, com amostra de ids (nunca o conteúdo da camada).
 * Não importa `@/lib/db`: quem executa é `scripts/varrer-vetores.ts`, e só com `--executar`.
 *
 * Limite declarado: é uma FOTOGRAFIA do banco no momento da leitura, sob o contrato abaixo; não prova que
 * um escritor futuro (script, SQL) não grave dado inválido.
 */
import { lerCamadas } from '@/lib/posts/page-layers'
import { PALAVRAS_DE_CONTEXTO } from './cor'
import { ehCandidatoVetorial, problemasDoVetor } from './validar-camada'

export const CONTRATO_DA_VARREDURA = 'cp-x2a/validar-camada@1'

type FindMany<T> = (args: Record<string, unknown>) => Promise<T[]>

/** O que a varredura enxerga do banco: só `findMany`, em cinco modelos. */
export interface LeitorSomenteLeitura {
  page: { findMany: FindMany<{ id: string; templateId: number; isTemplate: boolean; layers: unknown }> }
  template: { findMany: FindMany<{ id: number; designData: unknown }> }
  fontCombination: { findMany: FindMany<{ id: string; projectId: number; elements: unknown }> }
  generation: { findMany: FindMany<{ id: string; fieldValues: unknown }> }
  postRenderProof: { findMany: FindMany<{ postId: string; mediaUrl: string; layersSnapshot: unknown }> }
}

type ModeloComFindMany = { findMany: (args: never) => Promise<unknown[]> }

/**
 * Embrulha um cliente (o Prisma, no script) expondo SÓ `findMany` dos cinco modelos. Nenhum outro método
 * fica alcançável pela varredura — nem `update`, nem `$executeRaw`.
 */
export function somenteLeitura(cliente: Record<'page' | 'template' | 'fontCombination' | 'generation' | 'postRenderProof', ModeloComFindMany>): LeitorSomenteLeitura {
  const so = (m: ModeloComFindMany) => ({ findMany: (args: Record<string, unknown>) => m.findMany(args as never) })
  return {
    page: so(cliente.page),
    template: so(cliente.template),
    fontCombination: so(cliente.fontCombination),
    generation: so(cliente.generation),
    postRenderProof: so(cliente.postRenderProof),
  } as unknown as LeitorSomenteLeitura
}

export type NomeDaFonte = 'Page.layers' | 'Template.designData' | 'FontCombination.elements' | 'Generation.layersSnapshot' | 'PostRenderProof.layersSnapshot'

export interface ResultadoDaFonte {
  fonte: NomeDaFonte
  /** `false` = só informação (prova imutável), nunca alvo de correção nem de gate. */
  gravavel: boolean
  /** Linhas lidas do banco. */
  registros: number
  /**
   * Contêineres PRESENTES que não se leem (JSON malformado, tipo errado, lista que não é lista). Ausência
   * (`undefined`/`null`) é opcional e não conta. Em fonte gravável, BLOQUEIA o gate: o que não foi lido não
   * foi auditado.
   */
  ilegiveis: number
  amostraIlegivel: Array<{ registro: string; motivo: string }>
  camadasVetoriais: number
  camadasComProblema: number
  porCodigo: Record<string, number>
  /** `currentcolor`/CSS-wide em fill/strokeColor/border.color de svg-path (decisão D3). */
  palavrasDeContexto: Record<string, number>
  /** Até `amostraMaxima` ocorrências: ids do registro e da camada e os códigos — nunca o conteúdo. */
  amostra: Array<{ registro: string; camada: string; codigos: string[] }>
}

export interface RelatorioDaVarredura {
  contrato: string
  commit: string | null
  iniciadoEm: string
  terminadoEm: string
  fontes: ResultadoDaFonte[]
  /** Camadas vetoriais com problema nas fontes graváveis. */
  falhasGravaveis: number
  /** Contêineres ilegíveis nas fontes graváveis (fonte não auditada por inteiro). */
  ilegiveisGravaveis: number
  /** Resultado bloqueante explícito: aprovado só com zero falhas E zero ilegíveis nas fontes graváveis. */
  gate: { aprovado: boolean; motivos: string[] }
  limites: string[]
}

export interface OpcoesDaVarredura {
  lote?: number
  amostraMaxima?: number
  commit?: string | null
  agora?: () => Date
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ausente = (v: unknown) => v === undefined || v === null

/** Marca de JSON presente que não se lê (distinta de ausência). */
const ILEGIVEL = Symbol('ilegivel')
/** Decodifica JSON guardado como texto (inclusive codificado mais de uma vez); texto malformado vira `ILEGIVEL`. */
function lerJson(v: unknown): unknown {
  let valor = v
  for (let i = 0; i < 5 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      return ILEGIVEL
    }
  }
  return valor
}

function novaFonte(fonte: NomeDaFonte, gravavel: boolean): ResultadoDaFonte {
  return { fonte, gravavel, registros: 0, ilegiveis: 0, amostraIlegivel: [], camadasVetoriais: 0, camadasComProblema: 0, porCodigo: {}, palavrasDeContexto: {}, amostra: [] }
}

function anotarIlegivel(r: ResultadoDaFonte, registro: string, motivo: string, amostraMaxima: number) {
  r.ilegiveis++
  if (r.amostraIlegivel.length < amostraMaxima) r.amostraIlegivel.push({ registro, motivo })
}

function examinar(r: ResultadoDaFonte, registro: string, camadas: unknown[], amostraMaxima: number) {
  camadas.forEach((camada, i) => {
    if (!ehCandidatoVetorial(camada)) return
    r.camadasVetoriais++
    const c = camada as { id?: unknown; style: Record<string, unknown> }
    const border = ehObjeto(c.style.border) ? c.style.border : {}
    for (const valor of [c.style.fill, c.style.strokeColor, border.color]) {
      const t = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
      if ((PALAVRAS_DE_CONTEXTO as readonly string[]).includes(t)) r.palavrasDeContexto[t] = (r.palavrasDeContexto[t] ?? 0) + 1
    }
    const problemas = problemasDoVetor(camada)
    if (problemas.length === 0) return
    r.camadasComProblema++
    for (const p of problemas) r.porCodigo[p.codigo] = (r.porCodigo[p.codigo] ?? 0) + 1
    if (r.amostra.length < amostraMaxima) {
      r.amostra.push({ registro, camada: typeof c.id === 'string' ? c.id : `#${i}`, codigos: problemas.map((p) => p.codigo) })
    }
  })
}

/** Lê as camadas de um valor cru: `[]` quando ausente; `null` quando presente e ilegível como lista. */
function camadasDe(valor: unknown): unknown[] | null {
  if (ausente(valor)) return []
  const { camadas, legivel } = lerCamadas(valor)
  return legivel ? camadas : null
}

/** Examina uma lista de camadas presente-ou-ausente, anotando a ilegível. */
function examinarLista(r: ResultadoDaFonte, registro: string, valor: unknown, amostraMaxima: number) {
  const camadas = camadasDe(valor)
  if (camadas === null) anotarIlegivel(r, registro, 'lista de camadas ilegível', amostraMaxima)
  else examinar(r, registro, camadas, amostraMaxima)
}

async function* emLotes<T>(buscar: (cursor: T | null) => Promise<T[]>, lote: number): AsyncGenerator<T> {
  let cursor: T | null = null
  for (;;) {
    const linhas = await buscar(cursor)
    for (const l of linhas) yield l
    if (linhas.length < lote) return
    cursor = linhas[linhas.length - 1]
  }
}

export async function varrerVetores(leitor: LeitorSomenteLeitura, opcoes: OpcoesDaVarredura = {}): Promise<RelatorioDaVarredura> {
  const lote = opcoes.lote ?? 200
  const amostraMaxima = opcoes.amostraMaxima ?? 20
  const agora = opcoes.agora ?? (() => new Date())
  const iniciadoEm = agora().toISOString()
  const porId = <T extends { id: unknown }>(c: T | null) => (c ? { cursor: { id: c.id }, skip: 1 } : {})

  // Page.layers — todas as páginas, inclusive modelos e páginas ocultas
  const paginas = novaFonte('Page.layers', true)
  for await (const p of emLotes<{ id: string; templateId: number; isTemplate: boolean; layers: unknown }>((c) => leitor.page.findMany({ take: lote, orderBy: { id: 'asc' }, select: { id: true, templateId: true, isTemplate: true, layers: true }, ...porId(c) }), lote)) {
    paginas.registros++
    examinarLista(paginas, `page:${p.id}`, p.layers, amostraMaxima)
  }

  // Template.designData — `layers` (Salvar do web) e `pages[].layers` (desktop)
  const templates = novaFonte('Template.designData', true)
  for await (const t of emLotes<{ id: number; designData: unknown }>((c) => leitor.template.findMany({ take: lote, orderBy: { id: 'asc' }, select: { id: true, designData: true }, ...porId(c) }), lote)) {
    templates.registros++
    const registro = `template:${t.id}`
    if (ausente(t.designData)) continue
    const dd = lerJson(t.designData)
    if (!ehObjeto(dd)) {
      anotarIlegivel(templates, registro, dd === ILEGIVEL ? 'designData com JSON malformado' : 'designData não é objeto', amostraMaxima)
      continue
    }
    examinarLista(templates, registro, dd.layers, amostraMaxima)
    if (ausente(dd.pages)) continue
    if (!Array.isArray(dd.pages)) {
      anotarIlegivel(templates, registro, 'designData.pages presente e não é lista', amostraMaxima)
      continue
    }
    dd.pages.forEach((pg, i) => {
      if (ausente(pg)) return
      if (!ehObjeto(pg)) anotarIlegivel(templates, `${registro}/pages[${i}]`, 'página não é objeto', amostraMaxima)
      else examinarLista(templates, `${registro}/pages[${i}]`, pg.layers, amostraMaxima)
    })
  }

  // FontCombination.elements[].ornamentos[].camada
  const combinacoes = novaFonte('FontCombination.elements', true)
  for await (const f of emLotes<{ id: string; projectId: number; elements: unknown }>((c) => leitor.fontCombination.findMany({ take: lote, orderBy: { id: 'asc' }, select: { id: true, projectId: true, elements: true }, ...porId(c) }), lote)) {
    combinacoes.registros++
    const registro = `fontCombination:${f.id}`
    if (ausente(f.elements)) continue
    const elementos = lerJson(f.elements)
    if (!Array.isArray(elementos)) {
      anotarIlegivel(combinacoes, registro, elementos === ILEGIVEL ? 'elements com JSON malformado' : 'elements não é lista', amostraMaxima)
      continue
    }
    elementos.forEach((el, i) => {
      const reg = `${registro}/elements[${i}]`
      if (ausente(el)) return
      if (!ehObjeto(el)) return anotarIlegivel(combinacoes, reg, 'elemento não é objeto', amostraMaxima)
      if (ausente(el.ornamentos)) return
      if (!Array.isArray(el.ornamentos)) return anotarIlegivel(combinacoes, reg, 'ornamentos presente e não é lista', amostraMaxima)
      const camadas: unknown[] = []
      el.ornamentos.forEach((o, k) => {
        if (ausente(o)) return
        if (!ehObjeto(o)) anotarIlegivel(combinacoes, `${reg}/ornamentos[${k}]`, 'ornamento não é objeto', amostraMaxima)
        else if (!ausente(o.camada)) camadas.push(o.camada)
      })
      examinar(combinacoes, reg, camadas, amostraMaxima)
    })
  }

  // Generation.fieldValues.layersSnapshot (o que o reverter restaura)
  const snapshots = novaFonte('Generation.layersSnapshot', true)
  for await (const g of emLotes<{ id: string; fieldValues: unknown }>((c) => leitor.generation.findMany({ take: lote, orderBy: { id: 'asc' }, select: { id: true, fieldValues: true }, ...porId(c) }), lote)) {
    snapshots.registros++
    const registro = `generation:${g.id}`
    if (ausente(g.fieldValues)) continue
    const fv = lerJson(g.fieldValues)
    if (!ehObjeto(fv)) {
      anotarIlegivel(snapshots, registro, fv === ILEGIVEL ? 'fieldValues com JSON malformado' : 'fieldValues não é objeto', amostraMaxima)
      continue
    }
    examinarLista(snapshots, registro, fv.layersSnapshot, amostraMaxima)
  }

  // PostRenderProof.layersSnapshot — só informação (prova imutável)
  const provas = novaFonte('PostRenderProof.layersSnapshot', false)
  const porChave = (c: { postId: string; mediaUrl: string } | null) =>
    c ? { cursor: { postId_mediaUrl: { postId: c.postId, mediaUrl: c.mediaUrl } }, skip: 1 } : {}
  for await (const p of emLotes<{ postId: string; mediaUrl: string; layersSnapshot: unknown }>((c) => leitor.postRenderProof.findMany({ take: lote, orderBy: [{ postId: 'asc' }, { mediaUrl: 'asc' }], select: { postId: true, mediaUrl: true, layersSnapshot: true }, ...porChave(c) }), lote)) {
    provas.registros++
    examinarLista(provas, `postRenderProof:${p.postId}`, p.layersSnapshot, amostraMaxima)
  }

  const fontes = [paginas, templates, combinacoes, snapshots, provas]
  const gravaveis = fontes.filter((f) => f.gravavel)
  const falhasGravaveis = gravaveis.reduce((s, f) => s + f.camadasComProblema, 0)
  const ilegiveisGravaveis = gravaveis.reduce((s, f) => s + f.ilegiveis, 0)
  const motivos = [
    ...(falhasGravaveis > 0 ? [`${falhasGravaveis} camada(s) vetorial(is) com problema em fonte gravável`] : []),
    ...(ilegiveisGravaveis > 0 ? [`${ilegiveisGravaveis} contêiner(es) ilegível(is) em fonte gravável: fonte não auditada por inteiro`] : []),
  ]
  return {
    contrato: CONTRATO_DA_VARREDURA,
    commit: opcoes.commit ?? null,
    iniciadoEm,
    terminadoEm: agora().toISOString(),
    fontes,
    falhasGravaveis,
    ilegiveisGravaveis,
    gate: { aprovado: motivos.length === 0, motivos },
    limites: [
      'fotografia do banco no momento da leitura; não prova que um escritor futuro (script, SQL) não grave dado inválido',
      'PostRenderProof é só informação: prova imutável, fora do gate',
      'palavras de contexto contadas só em fill/strokeColor/border.color de svg-path',
      'ausência (undefined/null) é opcional; contêiner presente e ilegível bloqueia o gate',
    ],
  }
}
