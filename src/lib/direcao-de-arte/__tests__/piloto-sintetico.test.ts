/**
 * PILOTO SINTÉTICO de autonomia (contrato `docs/PLANO-2026-10-17-PILOTO-SINTETICO-CONTRATO.md`) — roda SÓ sob demanda:
 *
 *   PILOTO_SINTETICO=1 npx vitest run src/lib/direcao-de-arte/__tests__/piloto-sintetico.test.ts     (amostra 1/6)
 *   PILOTO_SINTETICO=completo …                                                                     (o lote inteiro)
 *   PILOTO_CALIBRACAO=20 … (só as N primeiras peças da amostra)  PILOTO_CLIENTE=cliente-00 … (um cliente)  PILOTO_SEM_REPETICAO=1
 *
 * O fluxo é o REAL (compositor, revisor com gate informativo, CP4, gate dos produtores, agendar.ts) sobre o banco falso com
 * travas e a medição real (renderer de produção). O que é FALSO e o que NÃO se prova está no contrato § 2 e na matriz § 2.1 —
 * e sai ao lado do veredito no resumo. Saída: `human-output/relatorios/piloto-sintetico/<data>/` (relatório integral + PNGs; fora
 * do versionamento) e `docs/piloto-sintetico/<data>-<rodada>-resumo.md` (versionado).
 */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Linha } from './suporte/banco-com-travas'

const harness = await vi.hoisted(async () => (await import('./suporte/banco-com-travas')).criarBancoComTravas())
const banco = harness.banco
const espioes = vi.hoisted(() => ({
  efeitos: vi.fn(async () => ({ falhas: [] as unknown[] })),
  /** Renders do renderer de produção (compositor, régua, revisor, juízes, PNG do piloto). */
  renders: 0,
  /** driveFileId → data URL da foto (sintética ou da fixture). */
  fotos: new Map<string, string>(),
  /** Modo G: a URL cuja leitura FALHA; e quantas vezes falhou. */
  fotoFalha: null as string | null,
  /** As candidatas do véu do cliente SEMEADO (cada cliente entra com a própria marca). */
  candidatasDoVeu: [] as string[],
  falhasDeLeitura: 0,
  /** A caixa de catálogo (frações) por driveFileId — a leitura "com catálogo" da decisão 1 e o requisito do arquétipo (CP2B). */
  catalogo: new Map<string, { x0: number; y0: number; x1: number; y1: number }>(),
}))

vi.mock('@/lib/db', () => ({ db: harness.db }))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (c: string) => ({ url: `https://blob.test/${c}` })), del: vi.fn(async () => undefined) }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null), registrarSugestao: vi.fn(async () => null), registrarSugestoes: vi.fn(async () => null), registrarSinal: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ fecharDicaDeCopyDaPagina: async () => ({ estado: 'sem-plano' }), caiNaEscolhaPropria: () => false }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (a: { layers: unknown[] }) => ({ layers: a.layers, autocorrecao: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias: [] }, avisos: [] }) }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: async () => undefined }))
vi.mock('@/lib/creatives/acervo', () => ({ lerCatalogoDoProjeto: async () => ({ catalogo: null, todas: [...espioes.catalogo.entries()].map(([driveFileId, assunto]) => ({ driveFileId, assunto })) }) }))
vi.mock('@/lib/assets/gradients-library', async (original) => {
  return {
    ...(await original<typeof import('@/lib/assets/gradients-library')>()),
    gradientesDoProjeto: () => ({
      daMarca: espioes.candidatasDoVeu.map((cor: string, i: number) => ({ id: `veu-${i}`, label: `véu ${cor}`, gradientType: 'linear' as const, gradientAngle: 0, gradientStops: [{ id: `p-${i}`, color: cor, opacity: 1, position: 0 }] })),
      gerais: [],
    }),
  }
})
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async () => undefined,
  fetchBuffer: async (url: string) => {
    if (espioes.fotoFalha && url === espioes.fotoFalha) {
      espioes.falhasDeLeitura++
      throw new Error('leitura da foto falhou (modo G)')
    }
    if (url.startsWith('data:image/png;base64,')) return Buffer.from(url.slice('data:image/png;base64,'.length), 'base64')
    throw new Error(`sem rede para ${url.slice(0, 40)}`)
  },
  familiasNaoCarregadas: async () => new Set<string>(),
}))
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  const daFixture = ['Branley GC', 'StageGrotesk Thin', 'StageGrotesk Regular'].map((family) => ({ family, styles: [400, 700].map((weight) => ({ weight, width: 'normal', style: 'normal' })) }))
  const real = m.GlobalFonts
  const GlobalFonts = {
    get families() {
      return [...(real as any).families, ...daFixture]
    },
    has: (familia: string) => real.has(familia) || daFixture.some((d) => d.family === familia),
    registerFromPath: (...a: Parameters<typeof real.registerFromPath>) => real.registerFromPath(...a),
  }
  return { ...m, GlobalFonts }
})
// O renderer de produção, contado: toda chamada (compositor, régua, revisor, juízes, PNG do piloto) soma 1.
vi.mock('@/lib/canvas-renderer', async (original) => {
  const m = await original<typeof import('@/lib/canvas-renderer')>()
  class Contado extends m.CanvasRenderer {
    async renderDesign(...a: Parameters<InstanceType<typeof m.CanvasRenderer>['renderDesign']>) {
      espioes.renders++
      return super.renderDesign(...a)
    }
  }
  return { ...m, CanvasRenderer: Contado }
})
vi.mock('@/lib/creatives/persist', async (original) => {
  const real = await original<typeof import('@/lib/creatives/persist')>()
  const { versaoDaPagina } = await import('@/lib/creatives/revisao/versao')
  const render = async (input: { project: { id: number }; templateId: number; templateName: string; page: Linha; fieldValues: Record<string, unknown>; generationId?: string | null; authorName?: string }) => {
    const db = harness.db as unknown as Linha
    const url = `https://blob.test/${input.page.id}-${++banco.seq}.png`
    const fieldValues = { ...input.fieldValues, pageId: input.page.id, versaoRenderizada: versaoDaPagina(input.page as never) }
    let generationId = input.generationId ?? null
    if (generationId) {
      const g = banco.generations.get(generationId)!
      await db.generation.update({ where: { id: generationId }, data: { status: 'COMPLETED', resultUrl: url, completedAt: new Date(), fieldValues: { ...g.fieldValues, ...fieldValues } } })
    } else {
      const g = await db.generation.create({ data: { status: 'COMPLETED', resultUrl: url, projectId: input.project.id, templateId: input.templateId, templateName: input.templateName, authorName: input.authorName ?? 'piloto', sourcePageId: null, fieldValues }, select: { id: true } })
      generationId = g.id
    }
    await db.page.update({ where: { id: input.page.id }, data: { thumbnail: url } })
    return { generationId, pageId: input.page.id, templateId: input.templateId, templateName: input.templateName, url, editUrl: `https://studio.test/templates/${input.templateId}/editor?pageId=${input.page.id}`, galleryUrl: 'https://studio.test/galeria', width: input.page.width, height: input.page.height, sizeKB: 1 }
  }
  return {
    ...real,
    getPublicAppUrl: () => 'https://studio.test',
    resolveImageUrl: async (_url: string | undefined, driveFileId: string | null | undefined) => ({ url: (driveFileId && espioes.fotos.get(driveFileId)) || null, ...(driveFileId && !espioes.fotos.get(driveFileId) ? { warning: `sem foto ${driveFileId}` } : {}) }),
    renderPageAndRegister: render,
    persistAndRenderCreative: async (input: Linha) => {
      const db = harness.db as unknown as Linha
      const template = banco.templates.get(String(input.templateId))!
      const page = await db.page.create({
        data: { name: input.pageName, width: input.width, height: input.height, layers: input.layers, background: input.background ?? null, order: input.pageOrder ?? 0, templateId: input.templateId, isTemplate: false, tags: input.pageTags ?? ['arte-rapida'], copyAutoral: input.copyAutoral ?? null, thumbnail: null, audio: null, updatedAt: new Date('2026-10-17T00:00:00Z'), Template: { id: template.id, name: template.name, projectId: template.projectId } },
      })
      return render({ project: input.project, templateId: input.templateId, templateName: input.templateName, page, fieldValues: input.fieldValues, generationId: input.generationId ?? null, authorName: input.authorName })
    },
  }
})
vi.mock('@/lib/compositor/pastas', async (original) => ({
  ...(await original<typeof import('@/lib/compositor/pastas')>()),
  garantirPasta: async () => ({ id: 42, name: 'Pasta da semana' }),
  refilarPaginasDoPost: async () => ({ avisos: [], falhou: false }),
}))
vi.mock('@/lib/compositor/recompor', async (original) => ({ ...(await original<typeof import('@/lib/compositor/recompor')>()), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
vi.mock('@/lib/creatives/agendar', async (original) => ({ ...(await original<typeof import('@/lib/creatives/agendar')>()), efeitosDoAgendamento: (...a: unknown[]) => espioes.efeitos(...(a as [])) }))

import type { Layer } from '@/types/template'
import type { Ajuste } from '@/lib/creatives/revisao/contrato'
import type { Rect } from '@/lib/creatives/halo/halo'
import { comporPeca } from '@/lib/compositor/compor'
import { CreativeError } from '@/lib/creatives/errors'
import { revisarArte, type GateInformativo } from '@/lib/creatives/revisao/revisar-arte'
import { ajustarArte } from '@/lib/creatives/arte-rapida'
import { agendarItensDoLote } from '@/lib/lotes/agendar-itens'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { arquivosDaFixture, caixasForaDasJanelas, comArquivos, fixture } from './suporte/fixture'
import { carregarClientesDasFixtures } from './suporte/fixtures-de-clientes'
import { PECA_LIMPA } from './suporte/peca-limpa'
import { fotoSintetica, type CasoDaFoto, type FormatoDaFoto } from './suporte/fotos-sinteticas'
import { COPIES, ENTRADAS_DE_FOTO, specsDoLote, type ClienteDoLote, type SpecDoLote } from './suporte/lote-do-piloto'
import { camadasNaoTextoAcimaDeTexto, julgar, type VereditoDoJuiz } from './suporte/oraculos-do-piloto'
import { pngDaPeca } from './suporte/png-do-piloto'
import { agregar, impressaoDoGate, paraMarkdown, sha256, violacoesDoPiloto, type GateRegistrado, type RegistroDaPeca } from './suporte/relatorio-do-piloto'

const LIGADO = !!process.env.PILOTO_SINTETICO
const PROJETO = 8
const LOTE = 'dot-8-piloto-sintetico'
const RAIZ = path.resolve(__dirname, '../../../..')
const DATA = new Date().toISOString().slice(0, 10)
const RODADA = process.env.PILOTO_CALIBRACAO ? `calibracao-${process.env.PILOTO_CALIBRACAO}` : process.env.PILOTO_SINTETICO === 'completo' ? 'completo' : 'padrao'
/** Oficial = padrão ou --completo SEM filtros; qualquer filtro torna a rodada EXPLORATÓRIA (o resumo diz, e a cobertura dos cenários não é exigida). */
const OFICIAL = !process.env.PILOTO_CALIBRACAO && !process.env.PILOTO_CLIENTE && !process.env.PILOTO_SEM_REPETICAO
const SAIDA = path.join(RAIZ, 'human-output', 'relatorios', 'piloto-sintetico', `${DATA}-${RODADA}`)

// ─── Clientes do lote ────────────────────────────────────────────────────────────────────────────────────────────────
interface ClienteSemeado {
  id: string
  formatos: FormatoDaFoto[]
  numeros: Record<string, unknown>
  paginas: Linha[]
  logos: Array<{ fileUrl: string; isProjectLogo: boolean }>
  candidatasDoVeu: string[]
}
let arquivos: Record<string, string>
const CLIENTES: ClienteSemeado[] = []

function assinaturaSintetica(formato: FormatoDaFoto): Linha {
  const story = formato === 'story'
  const escala = story ? 1 : 1350 / 1920
  const layers = structuredClone(PECA_LIMPA.layers).map((l) => ({ ...l, position: { x: l.position.x, y: Math.round(l.position.y * escala) }, style: { ...l.style, fontFamily: l.id === 'headline' ? 'Branley GC' : l.id === 'apoio' ? 'StageGrotesk Thin' : 'StageGrotesk Regular' } }))
  return { id: `assinatura-limpa-${formato}`, name: `Assinatura limpa — ${formato}`, tags: [formato], width: 1080, height: story ? 1920 : 1350, background: '#000000', layers, templateId: 7, isTemplate: true, order: story ? 0 : 1, copyAutoral: null, audio: null, thumbnail: null, updatedAt: new Date('2026-10-01T00:00:00Z'), Template: { id: 7, name: 'Assinatura', projectId: PROJETO } }
}
/** A LOGO sintética do cliente-00: um bloco branco com cantos arredondados e alfa (legível sobre o fundo preto; sem marca real). */
async function logoSintetica(): Promise<string> {
  const sharp = (await import('sharp')).default
  // Só pixels BRANCOS opacos (uma moldura e uma barra): o critério da logo lê os pixels opacos contra o fundo — um miolo escuro
  // contaria como "logo sem leitura" sobre fundo escuro por construção, não por defeito da peça.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect x="8" y="8" width="384" height="144" rx="28" fill="none" stroke="#FFFFFF" stroke-width="14"/><rect x="60" y="60" width="280" height="40" rx="8" fill="#FFFFFF"/></svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}
let LOGO_SINTETICA = ''
function clientesDoLote(): ClienteSemeado[] {
  const numeros = fixture.assinatura().numerosDoProjeto as Record<string, unknown>
  const veuDaFixture = fixture.marca().candidatasDoVeuNaBibliotecaAtual as string[]
  const lista: ClienteSemeado[] = [
    // cliente-00: a assinatura SINTÉTICA limpa (o controle positivo), story e feed, com uma logo sintética (os arquétipos a exigem).
    { id: 'cliente-00', formatos: ['story', 'feed'], numeros: { ...numeros, fundo: '#000000', mancha: '#000000', logo: { largura: 170 } }, paginas: [assinaturaSintetica('story'), assinaturaSintetica('feed')], logos: [{ fileUrl: LOGO_SINTETICA, isProjectLogo: true }], candidatasDoVeu: veuDaFixture },
    // cliente-fixture: a assinatura REAL anonimizada de 13/10 (a composição legada — P6).
    { id: 'cliente-fixture', formatos: ['story'], numeros, paginas: [{ ...fixture.assinatura().pagina, layers: comArquivos(fixture.assinatura().pagina.layers, arquivos), templateId: 7, isTemplate: true, order: 0, copyAutoral: null, audio: null, thumbnail: null, updatedAt: new Date('2026-10-01T00:00:00Z'), Template: { id: 7, name: 'Assinatura', projectId: PROJETO } }], logos: [{ fileUrl: arquivos['fixture:logo-monograma'], isProjectLogo: true }], candidatasDoVeu: veuDaFixture },
  ]
  // Fixtures de clientes reais pseudonimizados (decisão 5.2 do owner): só se existirem — cada um com os PRÓPRIOS ativos (logo, páginas, véu).
  for (const c of carregarClientesDasFixtures(path.join(__dirname, 'fixtures', 'piloto-sintetico'))) {
    lista.push({ id: c.id, formatos: c.formatos, numeros: c.numeros, paginas: c.paginas.map((p, i) => ({ ...p, templateId: 7, isTemplate: true, order: i, copyAutoral: null, audio: null, thumbnail: null, updatedAt: new Date('2026-10-01T00:00:00Z'), Template: { id: 7, name: 'Assinatura', projectId: PROJETO } }) as unknown as Linha), logos: c.logos, candidatasDoVeu: c.candidatasDoVeu })
  }
  const filtro = process.env.PILOTO_CLIENTE
  return filtro ? lista.filter((c) => c.id === filtro) : lista
}
function semear(cliente: ClienteSemeado) {
  harness.reset()
  espioes.efeitos.mockClear()
  espioes.fotoFalha = null
  espioes.falhasDeLeitura = 0
  espioes.candidatasDoVeu = cliente.candidatasDoVeu
  banco.projects.set(String(PROJETO), { id: PROJETO, name: cliente.id, status: 'ACTIVE', userId: 'dono', instagramAccountId: null, assinatura: cliente.numeros, Logo: cliente.logos, titleFontFamily: null, bodyFontFamily: null, subtitleFontFamily: null })
  banco.templates.set('7', { id: 7, name: 'Assinatura', projectId: PROJETO })
  banco.templates.set('42', { id: 42, name: 'Pasta da semana', projectId: PROJETO })
  for (const p of cliente.paginas) banco.pages.set(p.id, p)
}
const margensDe = (cliente: ClienteSemeado, formato: FormatoDaFoto) => {
  const g = ((cliente.numeros.geometria as Record<string, Record<string, number>> | undefined) ?? {})[formato] ?? { margemH: 96, safeTopo: formato === 'story' ? 250 : 120, safeRodape: formato === 'story' ? 350 : 100 }
  return { topo: g.safeTopo, rodape: g.safeRodape, lateral: g.margemH }
}

// ─── A peça ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const gateRegistrado = (g: GateInformativo): GateRegistrado =>
  g.tipo === 'medida' ? { tipo: 'medida', resultado: g.resultado, motivos: g.motivos.map((m) => ({ regra: m.regra, codigo: m.codigo, camadas: [...m.camadas].sort() })), naoMedidos: g.naoMedidos.map((n) => n.regra) } : { tipo: g.tipo, motivos: [], naoMedidos: [] }
const normalizarCamadas = (layers: unknown) => JSON.stringify(layers).replace(/grupo-\d+/g, 'grupo-N').replace(/"createdAt":"[^"]*"/g, '').replace(/https:\/\/blob\.test\/[^"]*/g, 'blob')
const fracoes = (r: Rect, w: number, h: number) => ({ x0: r.x / w, y0: r.y / h, x1: (r.x + r.width) / w, y1: (r.y + r.height) / h })

interface Execucao {
  gateV1?: GateRegistrado
  gateFinal?: GateRegistrado
  /** O gate final INTEIRO (menos `medidoEm`) serializado por `serializarParaImpressao`: é o que a repetição compara. */
  impressaoDoGateFinal: string
  ciclos: number
  draft: RegistroDaPeca['draft']
  draftCodigo?: string
  layers: Layer[]
  /** As camadas da v1 composta (antes dos ajustes): a fidelidade da foto real se confere em TODA medida, não só na final. */
  layersV1: Layer[]
  background: string
  pageId: string
  generationId: string
  assuntoNaPeca: { assunto: Rect | null; origem: 'catalogo' | 'estimado' | 'nenhum' }
  excecoes: string[]
  renders: RegistroDaPeca['renders']
  ms: RegistroDaPeca['ms']
}

async function executar(spec: SpecDoLote, cliente: ClienteSemeado, foto: { id: string; dataUrl: string; verdade: Rect | null; width: number; height: number } | null, comCatalogo: boolean): Promise<Execucao | { recusa: { desfecho: 'recusa-estrutural' | 'erro'; codigo: string }; ms: number }> {
  semear(cliente)
  espioes.catalogo.clear()
  if (foto) {
    espioes.fotos.set(foto.id, foto.dataUrl)
    if (comCatalogo && foto.verdade) espioes.catalogo.set(foto.id, fracoes(foto.verdade, foto.width, foto.height))
  }
  const renders: RegistroDaPeca['renders'] = {}
  const ms: RegistroDaPeca['ms'] = {}
  const medir = async <T>(etapa: keyof RegistroDaPeca['renders'], f: () => Promise<T>): Promise<T> => {
    const r0 = espioes.renders
    const t0 = performance.now()
    try {
      return await f()
    } finally {
      renders[etapa] = (renders[etapa] ?? 0) + (espioes.renders - r0)
      ms[etapa] = (ms[etapa] ?? 0) + (performance.now() - t0)
    }
  }
  const excecoes: string[] = []
  const specDoCompositor = {
    projectId: PROJETO,
    formato: spec.formato,
    quando: '2026-10-21 10:00',
    tema: `Piloto ${spec.chave}`,
    blocos: COPIES[spec.copy],
    ...(foto ? { foto: { driveFileId: foto.id } } : {}),
    ...(spec.arquetipo !== 'sem' ? { arquetipo: { id: spec.arquetipo } } : {}),
  }
  let composta: Awaited<ReturnType<typeof comporPeca>>
  try {
    composta = await medir('compor', () => comporPeca(specDoCompositor))
  } catch (e) {
    const codigo = e instanceof CreativeError ? e.code : e instanceof Error ? e.constructor.name : 'erro'
    return { recusa: { desfecho: e instanceof CreativeError ? 'recusa-estrutural' : 'erro', codigo }, ms: ms.compor ?? 0 }
  }
  const pageId = composta.persistido!.pageId
  const layersV1 = structuredClone(banco.pages.get(pageId)!.layers as Layer[])
  const generationId = [...banco.generations.values()].find((g) => g.fieldValues?.source === 'compositor' && g.fieldValues?.pageId === pageId)!.id
  banco.itensDeLote.set(`lote-${pageId}`, { id: `lote-${pageId}`, projectId: PROJETO, loteId: LOTE, itemId: `item-${pageId}`, generationId, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, payload: null })
  const revisar = () => medir('revisar', () => revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false }))
  let rev = await revisar()
  const gateV1 = gateRegistrado(rev.gate)
  let impressaoDoGateFinal = impressaoDoGate(rev.gate)
  let ciclos = 0
  let gate = gateV1
  while (ciclos < 2 && !(gate.tipo === 'medida' && gate.resultado === 'APTO') && rev.relatorio.ajustes.length > 0) {
    ciclos++
    try {
      await medir('ajustar', () => ajustarArte({ projectId: PROJETO, pageId, versaoEsperada: rev.versao!, ajustes: rev.relatorio.ajustes as unknown as Ajuste[], apenasRascunho: true, principal: { tipo: 'user', id: 'piloto' } }))
    } catch (e) {
      if (!(e instanceof CreativeError)) excecoes.push(`ajustar: ${String(e)}`)
    }
    rev = await revisar()
    gate = gateRegistrado(rev.gate)
    impressaoDoGateFinal = impressaoDoGate(rev.gate)
  }
  let draft: RegistroDaPeca['draft'] = 'nao-tentado'
  let draftCodigo: string | undefined
  try {
    const lote = await medir('agendar', () => agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens: [{ itemId: `item-${pageId}` }], apenasRascunho: true, principal: { tipo: 'user', id: 'piloto' } }))
    const item = lote.itens[0] as { situacao: string; desfecho?: string; codigo?: string }
    draft = item.situacao === 'concluido' && (item.desfecho === 'criado' || item.desfecho === 'recriado') ? 'criado' : 'recusado'
    draftCodigo = item.codigo ?? item.desfecho
  } catch (e) {
    excecoes.push(`agendar: ${String(e)}`)
    draft = 'recusado'
    draftCodigo = e instanceof CreativeError ? e.code : 'erro'
  }
  const page = banco.pages.get(pageId)!
  return { gateV1, gateFinal: gate, impressaoDoGateFinal, ciclos, draft, draftCodigo, layers: page.layers as Layer[], layersV1, background: String(page.background ?? '#FFFFFF'), pageId, generationId, assuntoNaPeca: { assunto: composta.diagnostico.assunto, origem: composta.diagnostico.assuntoOrigem }, excecoes, renders, ms }
}

async function rodarPeca(spec: SpecDoLote, cliente: ClienteSemeado, opcoes: { repetir: boolean; modoG: boolean }): Promise<RegistroDaPeca> {
  const entrada = ENTRADAS_DE_FOTO.find((f) => f.id === spec.foto)!
  const canvas = { width: 1080, height: spec.formato === 'story' ? 1920 : 1350 }
  let foto: Parameters<typeof executar>[2] = null
  if (entrada.caso === 'real') {
    const f = fixture.foto()
    foto = { id: 'fixture:foto', dataUrl: arquivos['fixture:foto'], verdade: f.regiaoProtegida.naPeca as Rect, width: 1080, height: 1920 }
  } else if (entrada.caso !== 'sem-foto') {
    const s = await fotoSintetica(entrada.caso as CasoDaFoto, spec.formato)
    foto = { id: s.id, dataUrl: s.dataUrl, verdade: s.assuntoVerdade, width: s.width, height: s.height }
  }
  // Decisão 1 — leitura PAREADA (A1/A2): a MESMA foto e corte, uma vez COM a caixa de catálogo (a verdade), outra SEM (a estimativa).
  let assunto: RegistroDaPeca['assunto']
  const arquetipo = spec.arquetipo !== 'sem'
  // A foto REAL (fixture de 13/10) entra no par também: a verdade dela é a região protegida da vitrine (catálogo), não "o assunto".
  const extras: { renders: Partial<Record<'pareada' | 'repeticao' | 'injecao' | 'modoG', number>>; ms: Partial<Record<'pareada' | 'repeticao' | 'injecao' | 'modoG', number>> } = { renders: {}, ms: {} }
  const contar = async <T>(etapa: 'pareada' | 'repeticao' | 'injecao' | 'modoG', f: () => Promise<T>): Promise<T> => {
    const r0 = espioes.renders
    const t0 = performance.now()
    try {
      return await f()
    } finally {
      extras.renders[etapa] = (extras.renders[etapa] ?? 0) + (espioes.renders - r0)
      extras.ms[etapa] = (extras.ms[etapa] ?? 0) + (performance.now() - t0)
    }
  }
  if (foto?.verdade) {
    const comCatalogo = await contar('pareada', () => executar(spec, cliente, foto, true))
    const catalogo = 'recusa' in comCatalogo ? null : comCatalogo.assuntoNaPeca.assunto
    assunto = { estimado: null, catalogo, verdade: foto.verdade, origemNaPeca: null }
  }
  // Com arquétipo a caixa de catálogo é obrigatória (CP2B): a peça do fluxo nasce COM catálogo; sem arquétipo, nasce da estimativa.
  const principal = await executar(spec, cliente, foto, arquetipo)
  const registroBase = (): RegistroDaPeca => ({ spec, compor: { desfecho: 'composta', ms: 0 }, ciclos: 0, draft: 'nao-tentado', juizes: [], oclusaoProduzida: [], renders: {}, ms: {}, estabilidade: { excecoes: [], naoMedida: false, semVinculo: false, timeout: false } })
  if ('recusa' in principal) {
    // A recusa estrutural também se repete: a mesma spec num banco novo tem de cair no MESMO código.
    let repeticao: RegistroDaPeca['repeticao']
    if (opcoes.repetir) {
      const outra = await contar('repeticao', () => executar(spec, cliente, foto, arquetipo))
      const codigo = 'recusa' in outra ? outra.recusa.codigo : 'composta'
      repeticao = { igual: codigo === principal.recusa.codigo, diferencas: codigo === principal.recusa.codigo ? [] : [`compor: ${principal.recusa.codigo} → ${codigo} na repetição`] }
    }
    return { ...registroBase(), compor: { desfecho: principal.recusa.desfecho, codigo: principal.recusa.codigo, ms: principal.ms }, renders: { ...extras.renders }, ms: { ...extras.ms }, estabilidade: { excecoes: principal.recusa.desfecho === 'erro' ? [principal.recusa.codigo] : [], naoMedida: false, semVinculo: false, timeout: false }, ...(assunto ? { assunto } : {}), ...(repeticao ? { repeticao } : {}) }
  }
  if (assunto) assunto = { ...assunto, estimado: arquetipo ? null : principal.assuntoNaPeca.assunto, origemNaPeca: principal.assuntoNaPeca.origem }
  // Juízes e PNG sobre a peça FINAL.
  // Renders e tempo dos juízes e do PNG pelo CONTADOR do renderer (não pela conta própria de `julgar`).
  const r0 = espioes.renders
  const t0 = performance.now()
  const { vereditos } = await julgar({ layers: principal.layers, canvas, background: principal.background, formato: spec.formato, assuntoVerdade: foto?.verdade ?? null, margens: margensDe(cliente, spec.formato) })
  const rendersJuizes = espioes.renders - r0
  const msJuizes = performance.now() - t0
  const r1 = espioes.renders
  const t1 = performance.now()
  const png = await pngDaPeca(principal.layers, canvas, principal.background)
  const rendersPng = espioes.renders - r1
  const msPng = performance.now() - t1
  const registro: RegistroDaPeca = {
    ...registroBase(),
    gateV1: principal.gateV1,
    ciclos: principal.ciclos,
    gateFinal: principal.gateFinal,
    draft: principal.draft,
    draftCodigo: principal.draftCodigo,
    juizes: vereditos,
    oclusaoProduzida: camadasNaoTextoAcimaDeTexto(principal.layers, canvas),
    renders: { ...principal.renders, juizes: rendersJuizes, png: rendersPng, ...extras.renders },
    ms: { ...principal.ms, juizes: msJuizes, png: msPng, ...extras.ms },
    estabilidade: { excecoes: principal.excecoes, naoMedida: principal.gateFinal?.tipo === 'nao-medida', semVinculo: principal.gateFinal?.tipo === 'sem-vinculo', timeout: principal.excecoes.some((e) => /prazo|timeout/i.test(e)) },
    // Caminho RELATIVO à raiz do repositório: o resumo é versionado e não pode carregar o caminho desta máquina.
    png: { caminho: path.relative(RAIZ, path.join(SAIDA, 'png', `${spec.chave.replace(/[|/]/g, '_')}.png`)), sha256: png.sha256 },
    ...(assunto ? { assunto } : {}),
    // Foto REAL da fixture: a medida só vale DENTRO das janelas fiéis (contrato § 1.2) — conferido na peça FINAL, depois dos ajustes.
    ...(entrada.caso === 'real' ? { fidelidade: { fora: [...new Set([...caixasForaDasJanelas(principal.layersV1), ...caixasForaDasJanelas(principal.layers)])] } } : {}),
  }
  // Repetição: a MESMA spec num banco novo — veredito, motivos, camadas normalizadas e hash do PNG iguais.
  if (opcoes.repetir) {
    const outra = await contar('repeticao', () => executar(spec, cliente, foto, arquetipo))
    const diferencas: string[] = []
    if ('recusa' in outra) diferencas.push(`compor: ${outra.recusa.codigo} na repetição`)
    else {
      // O gate INTEIRO (contrato § 4.6): rulesVersion, versão do gate, pageVersion, copyVersion, política, vínculo… — não só tipo/resultado/motivos.
      if (outra.impressaoDoGateFinal !== principal.impressaoDoGateFinal) diferencas.push('gate final difere (impressão completa, sem medidoEm)')
      if (normalizarCamadas(outra.layers) !== normalizarCamadas(principal.layers)) diferencas.push('camadas finais diferem')
      const png2 = await contar('repeticao', () => pngDaPeca(outra.layers, canvas, outra.background))
      if (png2.sha256 !== png.sha256) diferencas.push('png: hash difere')
      if (outra.draft !== principal.draft) diferencas.push('draft difere')
    }
    registro.repeticao = { igual: diferencas.length === 0, diferencas }
    registro.renders.repeticao = extras.renders.repeticao
    registro.ms.repeticao = extras.ms.repeticao
  }
  // Modo G (caso D do § 4.2): a página composta é EDITADA 1 px (o cache da composição cai) e a leitura da foto FALHA.
  if (opcoes.modoG && foto && !arquetipo) {
    const p = banco.pages.get(principal.pageId)!
    banco.pages.set(p.id, { ...p, layers: (p.layers as Layer[]).map((l) => (l.id === 'apoio' ? { ...l, position: { ...l.position, y: l.position.y + 1 } } : l)) })
    espioes.fotoFalha = foto.dataUrl
    espioes.falhasDeLeitura = 0
    const rev = await contar('modoG', () => revisarArte({ projectId: PROJETO, pageId: principal.pageId, visao: false, previa: false }))
    const cob = (rev.relatorio.cobertura as Record<string, { estado?: string; naoSeAplica?: boolean } | undefined>)['texto-sobre-assunto']
    const motivoSemAssunto = cob?.estado === 'nao-avaliada' && !cob.naoSeAplica
    const revisorRecusou = rev.gate.tipo === 'medida' && rev.gate.resultado === 'REVISAO_HUMANA_NECESSARIA' && rev.gate.motivos.some((m) => m.regra === 'texto-sobre-assunto' && m.codigo !== 'ACHADO_CRITICO')
    // O PRODUTOR tem de medir: sem o DRAFT que o fluxo principal criou (apagado do banco falso) e com o item DESLIGADO
    // (`postId: null`) o `agendar-leva` não pode reaproveitar nada — ou cria (falha do gate) ou recusa por texto-sobre-assunto.
    for (const post of [...banco.posts.values()].filter((x) => x.pageId === principal.pageId)) banco.posts.delete(post.id)
    const itemDoLote = banco.itensDeLote.get(`lote-${principal.pageId}`)!
    banco.itensDeLote.set(itemDoLote.id, { ...itemDoLote, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null })
    const lote = await contar('modoG', () => agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens: [{ itemId: `item-${principal.pageId}` }], apenasRascunho: true, principal: { tipo: 'user', id: 'piloto' } }))
    // A resposta do produtor: `revisao` (tipo/resultado) e `motivos` do gate no TOPO do item (`revisaoDe`, gate-no-fluxo.ts).
    const item = lote.itens[0] as { situacao: string; desfecho?: string; codigo?: string; postId?: string; revisao?: { tipo?: string; resultado?: string }; motivos?: Array<{ regra: string; codigo: string }> }
    const postsDaPagina = [...banco.posts.values()].filter((x) => x.pageId === principal.pageId).length
    const produtorRecusou = item.codigo === 'REVISAO_HUMANA_NECESSARIA' && !item.postId && postsDaPagina === 0 && item.revisao?.tipo === 'medida' && item.revisao.resultado === 'REVISAO_HUMANA_NECESSARIA' && (item.motivos ?? []).some((m) => m.regra === 'texto-sobre-assunto' && m.codigo !== 'ACHADO_CRITICO')
    registro.modoG = { fetchFalhou: espioes.falhasDeLeitura > 0, motivoSemAssunto, gateRecusou: revisorRecusou && produtorRecusou, valido: espioes.falhasDeLeitura > 0 && motivoSemAssunto, produtor: { codigo: item.codigo ?? item.desfecho ?? item.situacao, postsDaPagina, motivos: (item.motivos ?? []).map((m) => `${m.regra}:${m.codigo}`) } }
    registro.renders.modoG = extras.renders.modoG
    registro.ms.modoG = extras.ms.modoG
    espioes.fotoFalha = null
  }
  const apta = registro.gateFinal?.tipo === 'medida' && registro.gateFinal.resultado === 'APTO'
  // Decisão 2, cenário INJETADO (contrato § 4.3): numa peça APTA, uma shape opaca passa a cobrir metade da headline, por cima
  // de tudo — o gate não pode dar APTO (`oclusao` não medida / transformação não suportada é o esperado). Só em peças sem foto
  // ou de foto difusa, para a injeção não se confundir com o assunto.
  if (apta && (spec.foto === 'sem-foto' || spec.foto === 'B')) {
    const p = banco.pages.get(principal.pageId)!
    const layers = p.layers as Layer[]
    const headline = layers.find((l) => l.id === 'headline') ?? layers.find((l) => l.type === 'text')
    if (headline) {
      const ordem = Math.max(0, ...layers.map((l) => Number(l.order ?? 0))) + 1
      const shape = { id: 'oclusao-injetada', name: 'oclusão injetada', type: 'shape', shapeType: 'rectangle', fill: '#FF0000', visible: true, locked: false, rotation: 0, order: ordem, position: { x: headline.position.x + 8, y: headline.position.y + 4 }, size: { width: Math.max(40, Math.round(headline.size.width / 2)), height: Math.max(24, Math.round(headline.size.height / 2)) }, style: { fill: '#FF0000' } } as unknown as Layer
      banco.pages.set(p.id, { ...p, layers: [...layers, shape] })
      const rev = await contar('injecao', () => revisarArte({ projectId: PROJETO, pageId: principal.pageId, visao: false, previa: false }))
      const g = gateRegistrado(rev.gate)
      const motivos = g.tipo === 'medida' ? [...new Set([...g.motivos.map((m) => `${m.regra}:${m.codigo}`), ...g.naoMedidos.map((n) => `${n}:NAO_MEDIDO`)])] : [g.tipo]
      registro.oclusaoInjetada = { gateRecusou: !(g.tipo === 'medida' && g.resultado === 'APTO'), motivos }
      registro.renders.injecao = extras.renders.injecao
      registro.ms.injecao = extras.ms.injecao
      banco.pages.set(p.id, p)
    }
  }
  // Guardar o PNG: toda recusa, todo candidato (falso APTO/bloqueio sai depois, no resumo) e 1 em 10 das aptas.
  const indice = parseInt(createHash('sha1').update(spec.chave).digest('hex').slice(0, 2), 16)
  if (!apta || indice % 10 === 0 || vereditos.some((v) => v.viola)) {
    fs.mkdirSync(path.dirname(path.join(RAIZ, registro.png!.caminho)), { recursive: true })
    fs.writeFileSync(path.join(RAIZ, registro.png!.caminho), png.png)
  }
  return registro
}

// ─── A rodada ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe.skipIf(!LIGADO)('piloto sintético de autonomia', () => {
  it(`rodada ${RODADA}: compor → revisar → ajustar → revisar → agendar DRAFT, juízes, repetição, resumo`, async () => {
    arquivos = await arquivosDaFixture()
    LOGO_SINTETICA = await logoSintetica()
    CLIENTES.push(...clientesDoLote())
    const clientes: ClienteDoLote[] = CLIENTES.map((c) => ({ id: c.id, formatos: c.formatos, versao: sha256(JSON.stringify({ numeros: c.numeros, paginas: c.paginas, logos: c.logos, veu: c.candidatasDoVeu })).slice(0, 12) }))
    // Os insumos visuais que o lote não enxerga: os bytes da foto real da fixture (as sintéticas entram pela versão da geração).
    const lote = specsDoLote({ clientes, amostra: process.env.PILOTO_SINTETICO === 'completo' ? 'completo' : 1 / 6, insumosVisuais: sha256(Buffer.from(arquivos['fixture:foto'].split(',')[1], 'base64')).slice(0, 16) })
    const n = process.env.PILOTO_CALIBRACAO ? Number(process.env.PILOTO_CALIBRACAO) : lote.amostra.length
    const specs = lote.amostra.slice(0, n)
    const repetir = !process.env.PILOTO_SEM_REPETICAO
    const registros: RegistroDaPeca[] = []
    const inicio = Date.now()
    for (const [i, spec] of specs.entries()) {
      const cliente = CLIENTES.find((c) => c.id === spec.cliente)!
      // Modo G em TODA peça sem arquétipo com foto A1 (assunto forte; a principal já cai no caso B) E com foto B (difusa: a principal
      // é APTA — é aqui que a falha de leitura tem de virar recusa de uma peça que passaria). `i % 3` deixava a amostra sem nenhuma.
      const modoG = (spec.foto === 'A1' || spec.foto === 'B') && spec.arquetipo === 'sem'
      try {
        registros.push(await rodarPeca(spec, cliente, { repetir, modoG }))
      } catch (e) {
        registros.push({ spec, compor: { desfecho: 'erro', codigo: String(e).slice(0, 120), ms: 0 }, ciclos: 0, draft: 'nao-tentado', juizes: [], oclusaoProduzida: [], renders: {}, ms: {}, estabilidade: { excecoes: [String(e).slice(0, 200)], naoMedida: false, semVinculo: false, timeout: false } })
      }
      if ((i + 1) % 10 === 0) console.log(`[piloto] ${i + 1}/${specs.length} peças · ${Math.round((Date.now() - inicio) / 1000)} s · renders ${espioes.renders}`)
    }
    const resumo = agregar(registros, lote.denominadores.elegiveis)
    fs.mkdirSync(SAIDA, { recursive: true })
    const relatorio = JSON.stringify({ data: DATA, rodada: RODADA, loteId: lote.loteId, denominadoresDoLote: lote.denominadores, excluidos: lote.excluidos.length, clientes: clientes.map((c) => c.id), registros }, null, 1)
    fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), relatorio)
    const head = (() => {
      try {
        const head = execSync('git rev-parse --short HEAD', { cwd: RAIZ }).toString().trim()
        // Árvore suja = o código que rodou NÃO é o do commit: o resumo diz, para ninguém versionar número de HEAD sujo.
        return execSync('git status --porcelain', { cwd: RAIZ }).toString().trim() ? `${head} (árvore SUJA)` : head
      } catch {
        return 'desconhecido'
      }
    })()
    const limites = [...(OFICIAL ? [] : ['RODADA EXPLORATÓRIA (com filtro de calibração/cliente/repetição): NÃO vale como rodada oficial nem para o resumo versionado']), 'fontes da marca não instaladas (declaradas presentes; render com fonte de reserva)', 'a visão (gpt-5.2) não roda', 'fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1)', 'banco falso com travas: travas/SQL reais e Blob não provados', 'custo medido nesta máquina, não na Vercel', `clientes: ${clientes.map((c) => c.id).join(', ')} (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2)`]
    const md = paraMarkdown(resumo, { data: DATA, head, loteId: lote.loteId, ambiente: `${process.platform} ${process.arch} node ${process.version}`, rodada: RODADA, hashRelatorio: sha256(relatorio), limites, excluidosPorMotivo: lote.denominadores.excluidos, rendersObservados: espioes.renders })
    fs.writeFileSync(path.join(SAIDA, 'resumo.md'), md)
    console.log(`[piloto] relatório em ${SAIDA} · ${registros.length} peças · ${Math.round((Date.now() - inicio) / 1000)} s · renders ${espioes.renders}`)
    console.log(md.split('\n').slice(0, 12).join('\n'))
    // O que o PILOTO exige de si (o resto é do owner): nenhum efeito pós-commit; o resumo existe.
    expect(espioes.efeitos).not.toHaveBeenCalled()
    expect(registros.length).toBe(specs.length)
    // A rodada não pode passar em silêncio: os invariantes do piloto (erro/exceção/timeout, cobertura vazia, falso APTO em peça
    // medida, repetibilidade < 100 %, modo G ou oclusão injetada não recusados) derrubam o teste — `violacoesDoPiloto` é puro e
    // tem teste próprio provando que cada violação cai.
    expect(violacoesDoPiloto(resumo, registros, { oficial: OFICIAL })).toEqual([])
  }, 8 * 3600_000)
})
