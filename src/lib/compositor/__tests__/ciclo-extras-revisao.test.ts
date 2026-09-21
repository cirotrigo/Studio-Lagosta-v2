/**
 * Da revisão dos patches do PR 10 (commit cb3e951e, BLOQUEADO, 12/09/2026):
 *
 * - R01: a foto (ou o enquadramento) trocada DEPOIS da gravação da página e
 *   antes do fim do job não pedia nova tentativa — a conferência final só
 *   olhava a copy, e o slide terminava com a foto antiga.
 * - R03: a recomposição SEM contrato apagava o respiro inicial e final dos
 *   extras (e o `filter` do bloco comum, os internos).
 * - R04: extra com id "constructor"/"toString" esvaziado na página lançava
 *   `texto.split is not a function` — o mapa de extras herdava do protótipo.
 *
 * Da pré-revisão do HEAD 8b8e801f (BLOQUEADO, 12/09/2026):
 *
 * - C10-01: sem nada refeito e sem orçamento, a edição feita durante o job era
 *   descartada e o job fechava DONE — agora `PAGINA_MUDOU_DURANTE`.
 * - C10-02: com o respiro preservado, "na brasa\n" na voz 2 punha uma segunda
 *   voz VAZIA na recomposição sem contrato.
 * - C10-03: nenhum teste passava pelo ramo "nada foi refeito", e a fila falsa
 *   ignorava o "renderizar como está" — agora ela o grava e a execução
 *   seguinte o recebe.
 *
 * Da revisão FINAL do Codex sobre 1d18e983 (BLOQUEADO, 21/09/2026):
 *
 * - PR10-04: o histórico cheio (200 revisões) é recusado ANTES de o conteúdo
 *   ser validado, e a guarda do re-render só olhava a leitura inválida — a
 *   linha de 301 caracteres num extra seguia para a recomposição e morria em
 *   SPEC_INVALIDA, com o slide preso na arte antiga.
 * - PR10-05: com o histórico cheio a recomposição caía no caminho SEM
 *   contrato, e a regra legada punha "na brasa" na voz 2 de uma manchete que
 *   nasceu inteira na voz 1.
 *
 * Banco, Blob, render e fila são falsos, no molde de
 * `recompor-camadas-extras.test.ts`; `comporPeca` é falso com a primeira linha
 * real (`validarSpec` → SPEC_INVALIDA) e monta a foto da spec + a PREPARAÇÃO
 * real das camadas de texto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { MAX_REVISOES_DA_COPY, VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import { montarAssinatura } from '../assinatura'
import { copyDaPaginaPorIdentidade, edicaoDuranteOJob, specComACopyDaPagina, textoDoExtraNaPagina, type Defasagem } from '../defasagem'
import { dividirManchete } from '../segunda-voz'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec, type SpecDePeca } from '../spec'

const FOTO_A = 'https://x.public.blob.vercel-storage.com/drive-cache/foto-a-s1920.jpg'
const FOTO_B = 'https://x.public.blob.vercel-storage.com/drive-cache/foto-b-s1920.jpg'
const FOTO_C = 'https://x.public.blob.vercel-storage.com/drive-cache/foto-c-s1920.jpg'
const URL_ANTIGA = 'https://blob.exemplo/arte-rapida/8/pg-1-antiga.png'
const CAPA = 'https://blob.exemplo/capa.png'
const SLIDE_3 = 'https://blob.exemplo/slide-3.png'

const estado = vi.hoisted(() => ({
  page: null as Record<string, unknown> | null,
  generation: null as Record<string, unknown> | null,
  posts: new Map<string, Record<string, unknown>>(),
  specsCompostas: [] as unknown[],
  comporCamadas: null as null | ((spec: unknown) => unknown[]),
  /** Roda logo depois da gravação condicional da página — a janela do R01. */
  aposGravarPagina: null as null | (() => void),
  /** Roda logo depois de o levantamento ler a página — a janela do ramo "nada foi refeito" (C10-01). */
  aposLevantamento: null as null | (() => void),
  /** O que a fila devolve em `pedirNovaTentativa`: há orçamento para outra tentativa? */
  orcamento: true,
  /** O marcador "renderizar como está" que a fila grava no payload do job (REV-FINAL-01). */
  renderizarComoEsta: false,
  /** As camadas de cada re-render como está. */
  renders: [] as unknown[],
  logs: [] as string[],
  blobs: 0,
  relogio: 0,
  /** PR10-01: quantas leituras SÓ das camadas (`camadasDaPagina`) ainda falham com erro transitório. */
  falharLeiturasDeCamadas: 0,
}))
const pedirNovaTentativa = vi.hoisted(() => vi.fn(async (_jobId: unknown, _motivo: unknown) => estado.orcamento))

vi.mock('@/lib/db', () => ({
  db: {
    /**
     * A recomposição do PR 0 grava a arte por `mesclarFieldValuesDaArte`: MERGE
     * raso no banco (`"fieldValues" || ${patch}::jsonb`, e `"resultUrl"` quando
     * vem), nunca `generation.update` com o `fieldValues` lido antes (REV-R01).
     * O falso aplica o mesmo merge sobre a arte.
     */
    $executeRaw: async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = strings.join('?')
      if (!sql.includes('UPDATE "Generation" SET "fieldValues" = (CASE')) throw new Error(`SQL inesperado no teste: ${sql}`)
      const patch = JSON.parse(String(valores[0])) as Record<string, unknown>
      const atual = (estado.generation?.fieldValues ?? {}) as Record<string, unknown>
      estado.generation = { ...estado.generation, ...(sql.includes('"resultUrl" =') ? { resultUrl: valores[1] } : {}), fieldValues: { ...atual, ...patch } }
      return 1
    },
    page: {
      findUnique: async (args?: { select?: Record<string, unknown> }) => {
        const soCamadas = !!args?.select && Object.keys(args.select).join() === 'layers'
        if (soCamadas && estado.falharLeiturasDeCamadas > 0) {
          estado.falharLeiturasDeCamadas--
          throw new Error('timeout transitório do banco')
        }
        return estado.page
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        if (!estado.page || where.id !== estado.page.id || (estado.page.updatedAt as Date).getTime() !== where.updatedAt.getTime()) return { count: 0 }
        estado.page = { ...estado.page, ...data, updatedAt: new Date(Date.UTC(2026, 8, 12, 20, 0, ++estado.relogio)) }
        estado.aposGravarPagina?.()
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => {
        const achadas = estado.generation ? [estado.generation] : []
        const depois = estado.aposLevantamento
        estado.aposLevantamento = null
        depois?.()
        return achadas
      },
      findUnique: async () => estado.generation,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.generation = { ...estado.generation, ...data }
        return { id: 'gen-1' }
      },
    },
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta', userId: 'dono' }) },
    socialPost: {
      findMany: async () => [...estado.posts.values()].map((p) => ({ id: p.id, pageId: p.pageId, renderStatus: p.renderStatus, mediaUrls: p.mediaUrls, laterPostId: p.laterPostId })),
      findUnique: async ({ where }: { where: { id: string } }) => estado.posts.get(where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; mediaUrls: { equals: string[] } }; data: { mediaUrls: string[] } }) => {
        const p = estado.posts.get(where.id)
        if (!p || p.laterPostId || JSON.stringify(p.mediaUrls) !== JSON.stringify(where.mediaUrls.equals)) return { count: 0 }
        estado.posts.set(where.id, { ...p, mediaUrls: data.mediaUrls })
        return { count: 1 }
      },
    },
    postLog: { create: async ({ data }: { data: { message: string } }) => { estado.logs.push(data.message); return {} } },
  },
}))
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: `https://blob.exemplo/arte-rapida/8/pg-1-nova-${++estado.blobs}.png` }), del: async () => undefined }))
// A fila do PR 0 também marca a força em execução/atendida e o "renderizar como está" (REV-09, REV-FINAL-01).
// A fila falsa HONRA o "renderizar como está": grava o marcador, e `jobAtual()` o entrega à execução seguinte (C10-03).
vi.mock('@/lib/ai/generation-queue', () => ({
  pedirNovaTentativa,
  marcarForcaAtendida: async () => undefined,
  marcarForcaEmExecucao: async () => undefined,
  marcarRenderComoEsta: async (_jobId: unknown, ligar: boolean) => {
    estado.renderizarComoEsta = ligar
    return true
  },
}))
// O re-render falso REGISTRA como o persist faz com `generationId`: nova URL e MERGE do patch de fieldValues.
vi.mock('@/lib/creatives/persist', () => ({
  renderPageAndRegister: async (entrada: { page: { layers: unknown }; fieldValues: Record<string, unknown> }) => {
    estado.renders.push(entrada.page.layers)
    const url = `https://blob.exemplo/arte-rapida/8/pg-1-nova-${++estado.blobs}.png`
    estado.generation = { ...estado.generation, resultUrl: url, fieldValues: { ...((estado.generation?.fieldValues ?? {}) as Record<string, unknown>), ...entrada.fieldValues } }
    return { url }
  },
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('../../../../prisma/generated/client', () => ({ PostLogEvent: { EDITED: 'EDITED' } }))
vi.mock('../compor', async () => {
  const { validarSpec: validar } = await vi.importActual<typeof import('../spec')>('../spec')
  const { CreativeError } = await vi.importActual<typeof import('@/lib/creatives/errors')>('@/lib/creatives/errors')
  return {
    comporPeca: async (entrada: unknown) => {
      const v = validar(entrada)
      if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400, { problemas: v.problemas })
      estado.specsCompostas.push(v.spec)
      return { prova: Buffer.from('png'), layers: estado.comporCamadas!(v.spec), diagnostico: { avisos: [] } }
    },
  }
})

const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
}
const texto = (id: string, style: Record<string, unknown>, content: string, extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'text', visible: true, locked: false, order: 0,
  position: { x: 92, y: 200 }, size: { width: 400, height: 80 }, content, style, ...extra,
})
const foto = (url: string, cropPosition = 'center-middle'): Layer =>
  ({ id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: url, style: { objectFit: 'cover', cropPosition } }) as Layer

// A variante SEM serviço: o horário e a nota entram como camadas extras herdando do apoio.
const assinatura = montarAssinatura({
  pagina: {
    id: 'p-sem-servico', name: 'Story sem serviço', width: 1080, height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
})
// A variante COM segunda voz da manchete (C10-02).
const comVoz2 = montarAssinatura({
  pagina: {
    id: 'p-voz2', name: 'Story com voz 2', width: 1080, height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
      texto('headline2', { fontFamily: 'Bevan', fontSize: 100, color: '#F4301A', lineHeight: 1 }, 'Voz 2', { position: { x: 92, y: 300 }, metadata: { groupId: 'g1' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g1' } }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
})
let assinaturaAtual = assinatura
const textos = (spec: SpecDePeca) =>
  prepararBlocos({ assinatura: assinaturaAtual, colunaUtil: 1080 - 2 * assinaturaAtual.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec })
/**
 * A camada extra com [colchetes] vira RICH TEXT com o trecho numa cor diferente
 * da base — como a composição a entrega quando a marca tem destaque (esta
 * assinatura de teste não tem, então a conversão é feita aqui, dos dois lados).
 */
const comoRichText = (camada: Layer, linhas: string[]): Layer => {
  let conteudo = ''
  let inicio = -1
  const richTextStyles: Array<{ start: number; end: number; fill: string }> = []
  for (const ch of linhas.join('\n')) {
    if (ch === '[') inicio = conteudo.length
    else if (ch === ']') richTextStyles.push({ start: inicio, end: conteudo.length, fill: '#FF3300' })
    else conteudo += ch
  }
  return { ...camada, type: 'rich-text', content: conteudo, richTextStyles } as Layer
}
/** As camadas como a composição as entrega: a foto da spec atrás e os textos preparados, empilhados. */
const camadasDaPeca = (spec: SpecDePeca): Layer[] => {
  const p = textos(spec)
  expect(p.faltam).toEqual([])
  const montadas = p.montados.map((b, i) => {
    const layer = { ...b.layer, position: { x: 92, y: 300 + i * 160 } }
    const comDestaque = (spec.camadasExtras ?? []).find((e) => e.id === layer.id && e.linhas.some((l) => l.includes('[')))
    return comDestaque ? comoRichText(layer, comDestaque.linhas) : layer
  })
  return [foto(spec.foto?.url ?? FOTO_A), ...montadas]
}
const trocar = (camadas: unknown, id: string, parcial: Partial<Layer>) => (camadas as Layer[]).map((c) => (c.id === id ? { ...c, ...parcial } : c))
/** A copy como o chat a escreve: contrato de autoria conhecida. */
const contratoDe = (blocos: CopyAutoral['blocos']): CopyAutoral => ({
  versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [], blocos,
})
/** O contrato da página com o histórico CHEIO: a próxima revisão não cabe. */
const comHistoricoCheio = (c: CopyAutoral): CopyAutoral => ({
  ...c,
  revisoes: [
    ...c.revisoes,
    ...Array.from({ length: MAX_REVISOES_DA_COPY - c.revisoes.length }, (_, i) => ({ em: '2026-09-12T13:00:00.000Z', autor: 'equipe' as const, motivo: `ajuste antigo ${i + 1}`, blocos: [c.blocos[0].id] })),
  ],
})

/**
 * Cria a peça, "persiste" (fieldValues com spec e snapshot, contrato da página) e agenda o slide 2/3 de um carrossel.
 * `editar` recebe as camadas persistidas e devolve as que estão na página no momento da recomposição.
 */
function montarCenario(
  entrada: Record<string, unknown>,
  editar: (camadas: Layer[]) => Layer[],
  opcoes: { comContrato: boolean; assinatura?: typeof assinatura; contrato?: (c: CopyAutoral) => CopyAutoral },
) {
  assinaturaAtual = opcoes.assinatura ?? assinatura
  estado.aposLevantamento = null
  estado.orcamento = true
  estado.renderizarComoEsta = false
  estado.renders = []
  estado.logs = []
  estado.page = null
  estado.generation = null
  estado.posts.clear()
  estado.specsCompostas = []
  estado.aposGravarPagina = null
  estado.blobs = 0
  estado.falharLeiturasDeCamadas = 0
  estado.comporCamadas = (spec) => camadasDaPeca(spec as SpecDePeca)
  pedirNovaTentativa.mockClear()
  const v = validarSpec(entrada)
  expect(v.problemas).toEqual([])
  const spec = v.spec as SpecDePeca
  const camadas = camadasDaPeca(spec)
  const persistida = entradaDePersistencia({
    spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
    nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas, fundo: '#000', diagnostico: {}, fotoUrl: spec.foto?.url ?? null,
  })
  estado.page = {
    id: 'pg-1', name: 'Sex 18/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: editar(camadas), background: '#000',
    isTemplate: false, templateId: 't-1', copyAutoral: opcoes.comContrato ? (opcoes.contrato ?? ((c) => c))(persistida.copyAutoral as CopyAutoral) : null, updatedAt: new Date('2026-09-12T15:00:00.000Z'),
    Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
  }
  estado.generation = { id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...(persistida.fieldValues as Record<string, unknown>), pageId: 'pg-1' } }
  estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [CAPA, URL_ANTIGA, SLIDE_3] })
  return spec
}
const fotoDaPaginaGravada = () => (estado.page!.layers as Layer[]).find((c) => c.id === 'bg-foto')
const job = { generationId: 'gen-1', projectId: 8, recompor: { pageId: 'pg-1', origem: 'editor' as const }, queueJobId: 'job-1' }
/** O job como a fila o entrega à PRÓXIMA execução: com o marcador "renderizar como está", quando gravado. */
const jobAtual = () => ({ ...job, recompor: { ...job.recompor, ...(estado.renderizarComoEsta ? { renderizarComoEsta: true } : {}) } })

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('R01 — a página mudou DEPOIS da gravação e antes do fim do job: o runner pede nova tentativa e o slide converge', () => {
  const entrada = {
    projectId: 8, formato: 'story', foto: { url: FOTO_A },
    blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['no bafo'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora' }],
    camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
  }

  it('troca SÓ de foto (B → C) na janela: nova tentativa pedida com "renderizar como está"; a segunda execução re-renderiza a página com C e o slide mostra C', async () => {
    montarCenario(entrada, (camadas) => trocar(camadas, 'bg-foto', { fileUrl: FOTO_B }), { comContrato: true })
    // O editor salva a foto C logo depois de a recomposição gravar a página com B.
    estado.aposGravarPagina = () => {
      estado.aposGravarPagina = null
      estado.page = { ...estado.page!, layers: trocar(estado.page!.layers, 'bg-foto', { fileUrl: FOTO_C }), updatedAt: new Date(Date.UTC(2026, 8, 12, 21, 0, ++estado.relogio)) }
    }
    const { processarRecomposicaoEmBackground } = await import('../recompor')

    await processarRecomposicaoEmBackground(job)
    expect((estado.specsCompostas[0] as SpecDePeca).foto).toEqual({ url: FOTO_B })
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
    expect(fotoDaPaginaGravada()?.fileUrl).toBe(FOTO_C)
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
    expect(pedirNovaTentativa.mock.calls[0][0]).toBe('job-1')
    expect(estado.renderizarComoEsta).toBe(true)

    // A nova tentativa, com o marcador que a fila gravou: RE-RENDERIZA a página como está (C), como em
    // produção — nada de recompor pela spec —, troca o slide, consome o marcador e não pede outra.
    await processarRecomposicaoEmBackground(jobAtual())
    expect(estado.specsCompostas).toHaveLength(1)
    expect(estado.renders).toHaveLength(1)
    expect((estado.renders[0] as Layer[]).find((c) => c.id === 'bg-foto')?.fileUrl).toBe(FOTO_C)
    // O extra continua na página re-renderizada, com o texto e a identidade.
    expect((estado.renders[0] as Layer[]).find((c) => c.id === 'hora')?.content).toBe('11h às 15h')
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-2.png', SLIDE_3])
    expect(estado.generation!.resultUrl).toBe('https://blob.exemplo/arte-rapida/8/pg-1-nova-2.png')
    expect(estado.renderizarComoEsta).toBe(false)
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
  })

  it('só o ENQUADRAMENTO da foto mexido na janela também pede nova tentativa', async () => {
    montarCenario(entrada, (camadas) => trocar(camadas, 'bg-foto', { fileUrl: FOTO_B }), { comContrato: false })
    estado.aposGravarPagina = () => {
      estado.aposGravarPagina = null
      estado.page = { ...estado.page!, layers: trocar(estado.page!.layers, 'bg-foto', { style: { objectFit: 'cover', cropPosition: 'center-top' } }), updatedAt: new Date(Date.UTC(2026, 8, 12, 22, 0, ++estado.relogio)) }
    }
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await processarRecomposicaoEmBackground(job)
    expect(estado.specsCompostas).toHaveLength(1)
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
  })

  it('sem edição na janela, a gravação da própria recomposição NÃO vira nova tentativa', async () => {
    montarCenario(entrada, (camadas) => trocar(camadas, 'bg-foto', { fileUrl: FOTO_B }), { comContrato: true })
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await processarRecomposicaoEmBackground(job)
    expect(estado.specsCompostas).toHaveLength(1)
    expect(estado.posts.get('post-carrossel')!.mediaUrls[1]).toBe('https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png')
    expect(pedirNovaTentativa).not.toHaveBeenCalled()
  })
})

/**
 * PR10-01 (revisão FINAL do Codex sobre 75301ff0, 18/09/2026): a leitura inicial
 * das camadas (`camadasAntes`) ficava FORA do `try` do runner. Um timeout
 * transitório nela atravessava o dispatch, `falharJob` gravava FAILED com
 * tentativas sobrando, e o slide ficava antigo, sem recusa no histórico.
 */
describe('PR10-01 — a leitura inicial das camadas que falha é tratada como qualquer erro de infra do job', () => {
  const entrada = {
    projectId: 8, formato: 'story', foto: { url: FOTO_A },
    blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['no bafo'] }],
    camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
  }
  const editar = (camadas: Layer[]) => camadas.map((c) => (c.content === 'vale só no almoço' ? { ...c, content: 'vale no jantar' } : c))

  it('com orçamento: devolve o job à fila sem lançar, e a tentativa seguinte converge', async () => {
    montarCenario(entrada, editar, { comContrato: true })
    estado.falharLeiturasDeCamadas = 1
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await processarRecomposicaoEmBackground(job)
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
    expect(String(pedirNovaTentativa.mock.calls[0][1])).toMatch(/timeout transitório/)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA, SLIDE_3])

    await processarRecomposicaoEmBackground(job)
    expect(estado.specsCompostas).toHaveLength(1)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
  })

  it('sem orçamento: registra a recusa no histórico do post e lança (falha terminal com motivo)', async () => {
    montarCenario(entrada, editar, { comContrato: true })
    estado.falharLeiturasDeCamadas = 1
    estado.orcamento = false
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await expect(processarRecomposicaoEmBackground(job)).rejects.toThrow(/timeout transitório/)
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
    expect(estado.logs.some((m) => /timeout transitório/.test(m))).toBe(true)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA, SLIDE_3])
  })
})

describe('R03 — a recomposição SEM contrato preserva os respiros (inicial, interno e final), inclusive em rich text', () => {
  const respiros = ['', 'Seg a sex', '', '11h às 15h', '']
  const nota = ['', 'vale só', '', 'no [almoço]', '']
  const apoio = ['', 'no bafo', '']
  const entrada = {
    projectId: 8, formato: 'story', foto: { url: FOTO_A },
    blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: apoio }, { papel: 'servico', linhas: respiros, herdaDe: 'apoio', id: 'hora', grupoVisual: 'rodape' }],
    camadasExtras: [{ id: 'nota', linhas: nota, herdaDe: 'apoio' }],
  }

  it('ida e volta pela preparação: a camada leva os respiros, e a spec reconstruída tem os arrays INTEIROS', () => {
    const v = validarSpec(entrada)
    expect(v.problemas).toEqual([])
    const camadas = camadasDaPeca(v.spec!)
    const camadaDaNota = camadas.find((c) => c.id === 'nota')!
    expect(camadaDaNota.type).toBe('rich-text')
    expect(camadaDaNota.content).toBe('\nvale só\n\nno almoço\n')
    expect(camadas.find((c) => c.id === 'hora')!.content).toBe('\nSeg a sex\n\n11h às 15h\n')

    const lida = copyDaPaginaPorIdentidade(camadas)!
    expect(lida.extras.nota.split('\n')).toEqual(nota)
    expect(lida.extras.hora.split('\n')).toEqual(respiros)

    const r = specComACopyDaPagina(v.spec!, trocar(camadas, 'bg-foto', { fileUrl: FOTO_B }))
    expect(r.avisos.filter((a) => !a.startsWith('a foto da página'))).toEqual([])
    expect(r.spec.camadasExtras).toEqual([{ id: 'nota', linhas: nota, herdaDe: 'apoio' }])
    expect(r.spec.blocos!.find((b) => b.id === 'hora')!.linhas).toEqual(respiros)
    expect(r.spec.blocos!.find((b) => b.papel === 'apoio' && !b.herdaDe)!.linhas).toEqual(apoio)
    expect(validarSpec(JSON.parse(JSON.stringify(r.spec))).problemas).toEqual([])
  })

  it('pelo consumidor: a foto trocada dispara a recomposição e a spec composta chega com os respiros intactos', async () => {
    montarCenario(entrada, (camadas) => trocar(camadas, 'bg-foto', { fileUrl: FOTO_B }), { comContrato: false })
    const { recomporPaginaDefasada } = await import('../recompor')
    const r = await recomporPaginaDefasada({ pageId: 'pg-1' })
    expect(r.recomposta).toBe(true)
    const composta = estado.specsCompostas[0] as SpecDePeca
    expect(composta.camadasExtras).toEqual([{ id: 'nota', linhas: nota, herdaDe: 'apoio' }])
    expect(composta.blocos!.find((b) => b.id === 'hora')!.linhas).toEqual(respiros)
    expect(composta.blocos!.find((b) => b.papel === 'apoio' && !b.herdaDe)!.linhas).toEqual(apoio)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
  })
})

describe('R04 — extra com id "constructor"/"toString" esvaziado na página não lança, e o slide é atualizado', () => {
  for (const id of ['constructor', 'toString']) {
    it(`${id}: a leitura não enxerga o protótipo`, () => {
      const lida = copyDaPaginaPorIdentidade([])!
      expect(textoDoExtraNaPagina(lida, id)).toBeNull()
      expect(Object.keys(lida.extras)).toEqual([])
    })

    for (const comContrato of [false, true]) {
      it(`${id}, ${comContrato ? 'com' : 'sem'} contrato: a recomposição tira o extra vazio com aviso e troca o slide`, async () => {
        const entrada = {
          projectId: 8, formato: 'story', foto: { url: FOTO_A },
          blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['no bafo'] }],
          camadasExtras: [{ id, linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
        }
        montarCenario(entrada, (camadas) => trocar(camadas, id, { content: '' }), { comContrato })
        const { recomporPaginaDefasada } = await import('../recompor')
        const r = await recomporPaginaDefasada({ pageId: 'pg-1' })
        expect(r.recomposta).toBe(true)
        expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
        expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
        const composta = estado.specsCompostas[0] as SpecDePeca
        expect(composta.blocos!.map((b) => b.linhas)).toEqual([['Costela'], ['no bafo']])
        if (!comContrato) {
          expect(composta.camadasExtras ?? []).toEqual([])
          expect(r.avisos.join(' ')).toMatch(new RegExp(`camada extra "${id}"`))
        }
      })
    }
  }
})

describe('C10-01 e C10-03 — nada foi refeito (a página estava em dia no levantamento) e a página mudou durante o job', () => {
  const entrada = {
    projectId: 8, formato: 'story', foto: { url: FOTO_A },
    blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['no bafo'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora' }],
    camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
  }
  const editorTrocaAFotoNaJanela = () => {
    estado.aposLevantamento = () => {
      estado.page = { ...estado.page!, layers: trocar(estado.page!.layers, 'bg-foto', { fileUrl: FOTO_C }), updatedAt: new Date(Date.UTC(2026, 8, 12, 23, 0, ++estado.relogio)) }
    }
  }

  it('com orçamento: nova tentativa sem compor nem renderizar; a tentativa seguinte recompõe com C e o slide mostra C', async () => {
    montarCenario(entrada, (camadas) => camadas, { comContrato: true })
    editorTrocaAFotoNaJanela()
    const { processarRecomposicaoEmBackground } = await import('../recompor')

    await processarRecomposicaoEmBackground(jobAtual())
    expect(estado.specsCompostas).toHaveLength(0)
    expect(estado.renders).toHaveLength(0)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA, SLIDE_3])
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
    expect(pedirNovaTentativa.mock.calls[0][0]).toBe('job-1')

    await processarRecomposicaoEmBackground(jobAtual())
    expect(estado.specsCompostas).toHaveLength(1)
    expect((estado.specsCompostas[0] as SpecDePeca).foto).toEqual({ url: FOTO_C })
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
    expect(pedirNovaTentativa).toHaveBeenCalledTimes(1)
  })

  it('sem orçamento: PAGINA_MUDOU_DURANTE (o job falha com motivo) e a recusa chega à arte e ao histórico do post — nunca DONE com o slide velho', async () => {
    montarCenario(entrada, (camadas) => camadas, { comContrato: true })
    estado.orcamento = false
    editorTrocaAFotoNaJanela()
    const { processarRecomposicaoEmBackground } = await import('../recompor')

    await expect(processarRecomposicaoEmBackground(jobAtual())).rejects.toMatchObject({ code: 'PAGINA_MUDOU_DURANTE' })
    expect(estado.specsCompostas).toHaveLength(0)
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA, SLIDE_3])
    // A recusa mora em chave própria (C6-01 do PR 0): nunca substitui o registro `recomposicao` do último render,
    // e nada foi refeito nesta rodada, então a imagem continua sendo a anterior (C6-12).
    const fv = estado.generation!.fieldValues as { recomposicao?: { estado?: string }; recusaDaRecomposicao?: unknown }
    expect(fv.recusaDaRecomposicao).toMatchObject({ errorCode: 'PAGINA_MUDOU_DURANTE', arteTrocada: false })
    expect(fv.recomposicao?.estado).not.toBe('recusada')
    // O motivo em português da equipe, dizendo que foi a FOTO (C10-11): sem jargão de fila.
    expect(estado.logs).toHaveLength(1)
    expect(estado.logs[0]).toMatch(/^A arte NÃO foi atualizada: a foto da página foi trocada enquanto a arte era atualizada, e as tentativas automáticas acabaram\. /)
    expect(estado.logs[0]).not.toMatch(/em dia|recomposição/)
  })

  it('sem orçamento e edição de TEXTO: o motivo diz que foi o texto', async () => {
    montarCenario(entrada, (camadas) => camadas, { comContrato: false })
    estado.orcamento = false
    estado.aposLevantamento = () => {
      estado.page = { ...estado.page!, layers: trocar(estado.page!.layers, 'apoio', { content: 'no bafo e na lenha' }), updatedAt: new Date(Date.UTC(2026, 8, 12, 23, 30, ++estado.relogio)) }
    }
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await expect(processarRecomposicaoEmBackground(jobAtual())).rejects.toMatchObject({ code: 'PAGINA_MUDOU_DURANTE' })
    expect(estado.logs[0]).toMatch(/^A arte NÃO foi atualizada: o texto da página foi alterado enquanto a arte era atualizada, e as tentativas automáticas acabaram\. /)
  })

  for (const orcamento of [false, true]) {
    it(`C10-11 — ${orcamento ? 'com' : 'sem'} orçamento, o post foi CONGELADO e a página editada no levantamento: não há slide a atualizar, o job fecha sem erro, sem tentativa e sem recusa`, async () => {
      montarCenario(entrada, (camadas) => camadas, { comContrato: true })
      estado.orcamento = orcamento
      estado.aposLevantamento = () => {
        estado.page = { ...estado.page!, layers: trocar(estado.page!.layers, 'bg-foto', { fileUrl: FOTO_C }), updatedAt: new Date(Date.UTC(2026, 8, 12, 23, 45, ++estado.relogio)) }
        // Entregue ao publicador: sai dos slides que a recomposição alcança.
        estado.posts.set('post-carrossel', { ...estado.posts.get('post-carrossel')!, laterPostId: 'zernio-1' })
      }
      const fieldValuesAntes = JSON.stringify(estado.generation!.fieldValues)
      const { processarRecomposicaoEmBackground } = await import('../recompor')

      await expect(processarRecomposicaoEmBackground(jobAtual())).resolves.toBeUndefined()
      expect(pedirNovaTentativa).not.toHaveBeenCalled()
      expect(estado.specsCompostas).toHaveLength(0)
      expect(estado.renders).toHaveLength(0)
      expect(estado.logs).toEqual([])
      // Nenhuma recusa gravada: o registro da arte fica intocado.
      expect(JSON.stringify(estado.generation!.fieldValues)).toBe(fieldValuesAntes)
      expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA, SLIDE_3])
    })
  }

  it('edicaoDuranteOJob: texto, foto, os dois, e o resto sem jargão', () => {
    const d = (parcial: Partial<Defasagem>): Defasagem => ({ ilegivel: false, defasada: true, fotoTrocada: false, papeis: [], soTexto: true, mexidoNaMao: [], ...parcial })
    expect(edicaoDuranteOJob(d({ papeis: ['apoio'] }))).toBe('o texto da página foi alterado enquanto a arte era atualizada')
    expect(edicaoDuranteOJob(d({ fotoTrocada: true }))).toBe('a foto da página foi trocada enquanto a arte era atualizada')
    expect(edicaoDuranteOJob(d({ papeis: ['hora'], fotoTrocada: true }))).toBe('o texto e a foto da página foram alterados enquanto a arte era atualizada')
    expect(edicaoDuranteOJob(d({ defasada: false, soTexto: false, mexidoNaMao: ['"apoio" foi movida (+0, +40px)'] }))).toBe('a página foi alterada enquanto a arte era atualizada')
  })

  it('sem edição na janela: nada refeito, nenhuma tentativa, nenhum erro', async () => {
    montarCenario(entrada, (camadas) => camadas, { comContrato: false })
    const { processarRecomposicaoEmBackground } = await import('../recompor')
    await processarRecomposicaoEmBackground(jobAtual())
    expect(estado.specsCompostas).toHaveLength(0)
    expect(estado.renders).toHaveLength(0)
    expect(pedirNovaTentativa).not.toHaveBeenCalled()
  })
})

describe('C10-02 — a voz 2 legada é a última linha COM TEXTO; o respiro não vira segunda voz vazia', () => {
  it('dividirManchete sem contrato: normal, "\\n" no fim, linha só de espaços no fim, respiro interno e uma só linha com texto', () => {
    const legado = (linhas: string[]) => dividirManchete(linhas, { temSegundaVoz: true, comContrato: false })
    expect(legado(['Costela', 'na brasa'])).toEqual({ voz1: ['Costela'], voz2: ['na brasa'], origem: 'legado', aviso: null })
    expect(legado(['Costela', 'na brasa', ''])).toEqual({ voz1: ['Costela'], voz2: ['na brasa', ''], origem: 'legado', aviso: null })
    expect(legado(['Costela', 'na brasa', '   '])).toEqual({ voz1: ['Costela'], voz2: ['na brasa', '   '], origem: 'legado', aviso: null })
    expect(legado(['Costela', '', 'na brasa'])).toEqual({ voz1: ['Costela', ''], voz2: ['na brasa'], origem: 'legado', aviso: null })
    expect(legado(['Costela', ''])).toEqual({ voz1: ['Costela', ''], voz2: [], origem: 'nenhuma', aviso: null })
  })

  it('com contrato nada muda: a declaração do autor manda, respiro incluído', () => {
    expect(dividirManchete(['Costela', 'na brasa', ''], { temSegundaVoz: true, comContrato: true, declaradas: [1, 2] })).toEqual({ voz1: ['Costela'], voz2: ['na brasa', ''], origem: 'contrato', aviso: null })
    expect(dividirManchete(['Costela', 'na brasa', ''], { temSegundaVoz: true, comContrato: true, declaradas: null })).toEqual({ voz1: ['Costela', 'na brasa', ''], voz2: [], origem: 'nenhuma', aviso: null })
  })

  for (const [rotulo, voz2] of [['normal', 'na brasa'], ['"\\n" no fim', 'na brasa\n'], ['linha só de espaços no fim', 'na brasa\n   ']] as const) {
    it(`pelo consumidor, página SEM contrato (${rotulo}): editar o APOIO recompõe com "na brasa" na segunda voz, e a primeira voz fica "Costela"`, async () => {
      const entrada = { projectId: 8, formato: 'story', foto: { url: FOTO_A }, blocos: [{ papel: 'headline', linhas: ['Costela', 'na brasa'] }, { papel: 'apoio', linhas: ['no bafo'] }] }
      montarCenario(entrada, (camadas) => trocar(trocar(camadas, 'headline2', { content: voz2 }), 'apoio', { content: 'no bafo e na lenha' }), { comContrato: false, assinatura: comVoz2 })
      const { recomporPaginaDefasada } = await import('../recompor')
      const r = await recomporPaginaDefasada({ pageId: 'pg-1' })
      expect(r.recomposta).toBe(true)
      expect((estado.specsCompostas[0] as SpecDePeca).blocos!.find((b) => b.papel === 'headline')!.linhas).toEqual(['Costela', ...voz2.split('\n')])
      const gravadas = estado.page!.layers as Layer[]
      expect(gravadas.find((c) => c.id === 'headline')?.content).toBe('Costela')
      expect(gravadas.find((c) => c.id === 'headline2')?.content).toBe(voz2)
      expect(gravadas.find((c) => c.id === 'apoio')?.content).toBe('no bafo e na lenha')
    })
  }
})

/**
 * PR10-04 (revisão FINAL do Codex sobre 1d18e983, 21/09/2026): `tentarAplicarRevisao` recusa o histórico CHEIO
 * antes de validar o conteúdo novo, então a leitura devolvia `HistoricoDaCopyCheio` mesmo com uma linha de 301
 * caracteres. A guarda do re-render exigia `RevisaoDaCopyInvalida`, ficava falsa, a recomposição reconstruía uma
 * spec inválida, o compositor lançava SPEC_INVALIDA e o runner, tratando o erro como determinístico, deixava o
 * slide com a arte antiga. A classe da primeira recusa não prova que o conteúdo seja válido.
 */
describe('PR10-04 — histórico cheio + linha de 301 caracteres num extra: re-render como está, pelo runner', () => {
  const linhaLonga = 'A'.repeat(301)
  const formas: Array<[string, CopyAutoral['blocos'], string]> = [
    ['extra livre (nota)', [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'ap', funcao: 'apoio', ordem: 1, linhas: ['no bafo'] },
      { id: 'nota', funcao: 'livre', ordem: 2, linhas: ['vale só no almoço'], estilo: { herdaDe: 'apoio' } },
    ], 'nota'],
    ['extra com função (hora)', [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'ap', funcao: 'apoio', ordem: 1, linhas: ['no bafo'] },
      { id: 'hora', funcao: 'servico', ordem: 2, linhas: ['11h às 15h'], estilo: { herdaDe: 'apoio' } },
    ], 'hora'],
  ]
  for (const [forma, blocos, idDoExtra] of formas) {
    it(`${forma}: a mídia é nova, o contrato e a página ficam intactos, nenhuma falha determinística e o post entregue não é tocado`, async () => {
      montarCenario(
        { projectId: 8, formato: 'story', foto: { url: FOTO_A }, copyAutoral: contratoDe(blocos) },
        (camadas) => trocar(camadas, idDoExtra, { content: linhaLonga }),
        { comContrato: true, contrato: comHistoricoCheio },
      )
      estado.posts.set('post-entregue', { id: 'post-entregue', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: 'zernio-9', mediaUrls: [URL_ANTIGA, SLIDE_3] })
      const contratoAntes = estado.page!.copyAutoral as CopyAutoral
      expect(contratoAntes.revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
      const camadasAntes = estado.page!.layers
      const { processarRecomposicaoEmBackground } = await import('../recompor')

      await expect(processarRecomposicaoEmBackground(job)).resolves.toBeUndefined()
      expect(pedirNovaTentativa).not.toHaveBeenCalled()
      // Re-renderizada como a página está: nada foi recomposto, e o texto da equipe está no desenho.
      expect(estado.specsCompostas).toEqual([])
      expect(estado.renders).toHaveLength(1)
      expect((estado.renders[0] as Layer[]).find((c) => c.id === idDoExtra)?.content).toBe(linhaLonga)
      // Mídia nova no slide da arte; capa e slide 3 intactos; o post entregue ao publicador não é tocado.
      expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
      expect(estado.posts.get('post-entregue')!.mediaUrls).toEqual([URL_ANTIGA, SLIDE_3])
      // A página não foi regravada: camadas e contrato como estavam.
      expect(estado.page!.layers).toBe(camadasAntes)
      expect(estado.page!.copyAutoral).toBe(contratoAntes)
      // O registro da arte: re-renderizada, sem recusa, e a copy desta imagem NÃO medida contra o contrato cheio.
      const fv = estado.generation!.fieldValues as { recomposicao?: { estado?: string; avisos?: string[] }; recusaDaRecomposicao?: unknown; copyAutoral?: unknown }
      expect(fv.recomposicao?.estado).toBe('re-renderizada')
      expect(fv.recomposicao?.avisos?.some((a) => /camada extra/.test(a) && /re-renderizada como a página está/.test(a))).toBe(true)
      expect(fv.recusaDaRecomposicao ?? null).toBeNull()
      expect(fv.copyAutoral).toMatchObject({ efetiva: null, comparavel: false })
      expect(estado.logs).toEqual(['Imagem 2/3 atualizada: a página foi editada e a arte foi re-renderizada.'])
    })
  }
})

/**
 * PR10-05 (revisão FINAL do Codex sobre 1d18e983, 21/09/2026): com o histórico cheio a recomposição tirava o
 * contrato e `dividirManchete` aplicava a regra LEGADA — "na brasa" ia para a voz 2 de uma manchete que nasceu
 * inteira na voz 1, e a manchete de três linhas com duas declaradas na voz 2 voltava com uma só. Hoje a peça é
 * composta com o contrato COMO A PÁGINA O MOSTRA, e o texto de CADA voz sai como estava.
 *
 * O caso "sem extra" é a mudança de comportamento declarada: a peça sem camada extra com o histórico cheio também
 * passa a compor pelo contrato lido, em vez do caminho sem contrato.
 */
describe('PR10-05 — histórico cheio + variante com segunda voz: o texto de cada voz da manchete sobrevive à recomposição', () => {
  const manchetes: Array<[string, CopyAutoral['blocos'][number], { voz1: string; voz2: string | null }]> = [
    ['(a) manchete sem segunda voz', { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela', 'na brasa'] }, { voz1: 'Costela\nna brasa', voz2: null }],
    ['(b) várias linhas declaradas na voz 2', { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela', 'na', 'brasa'], estilo: { linhasNaVoz2: [1, 2] } }, { voz1: 'Costela', voz2: 'na\nbrasa' }],
  ]
  const ap: CopyAutoral['blocos'][number] = { id: 'ap', funcao: 'apoio', ordem: 1, linhas: ['no bafo'] }
  const formas: Array<[string, CopyAutoral['blocos'], string, string]> = [
    ['extra livre (nota) editado', [ap, { id: 'nota', funcao: 'livre', ordem: 2, linhas: ['vale só no almoço'], estilo: { herdaDe: 'apoio' } }], 'nota', 'vale no jantar'],
    ['extra com função (hora) editado', [ap, { id: 'hora', funcao: 'servico', ordem: 2, linhas: ['11h às 15h'], estilo: { herdaDe: 'apoio' } }], 'hora', '12h às 16h'],
    ['sem extra, apoio editado (mudança declarada)', [ap], 'apoio', 'no bafo e na lenha'],
  ]
  const vozes = (camadas: unknown) => ({
    voz1: (camadas as Layer[]).find((c) => c.id === 'headline')?.content ?? null,
    voz2: (camadas as Layer[]).find((c) => c.id === 'headline2')?.content ?? null,
  })
  for (const [manchete, blocoDaManchete, esperado] of manchetes)
    for (const [forma, resto, idEditado, textoNovo] of formas)
      it(`${manchete} · ${forma}: recompõe, e as duas vozes saem como a página as tinha`, async () => {
        montarCenario(
          { projectId: 8, formato: 'story', foto: { url: FOTO_A }, copyAutoral: contratoDe([blocoDaManchete, ...resto]) },
          (camadas) => trocar(camadas, idEditado, { content: textoNovo }),
          { comContrato: true, contrato: comHistoricoCheio, assinatura: comVoz2 },
        )
        // Premissa: a peça nasceu com a divisão do AUTOR (a variante tem `headline2`).
        expect(vozes(estado.page!.layers)).toEqual(esperado)
        const contratoAntes = estado.page!.copyAutoral
        const { recomporPaginaDefasada } = await import('../recompor')
        const r = await recomporPaginaDefasada({ pageId: 'pg-1' })

        expect(r.recomposta).toBe(true)
        expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
        expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-1.png', SLIDE_3])
        // O texto POR VOZ, antes e depois da recomposição: idêntico.
        const gravadas = estado.page!.layers as Layer[]
        expect(vozes(gravadas)).toEqual(esperado)
        expect(gravadas.find((c) => c.id === idEditado)?.content).toBe(textoNovo)
        // A spec composta levou a divisão do autor no contrato lido da página.
        const composta = estado.specsCompostas[0] as SpecDePeca
        expect(composta.copyAutoral!.blocos.find((b) => b.id === 'h')!.estilo?.linhasNaVoz2).toEqual(blocoDaManchete.estilo?.linhasNaVoz2)
        // O contrato da página e o registro da arte não ganham nada: a revisão não cabe no histórico.
        expect(estado.page!.copyAutoral).toBe(contratoAntes)
        expect((estado.generation!.fieldValues as { copyAutoral?: unknown }).copyAutoral).toMatchObject({ efetiva: null, comparavel: false })
        expect(r.avisos.some((a) => /contrato como a página o mostra/.test(a))).toBe(true)
      })
})
