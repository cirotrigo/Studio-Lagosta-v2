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
 * Banco, Blob, render e fila são falsos, no molde de
 * `recompor-camadas-extras.test.ts`; `comporPeca` é falso com a primeira linha
 * real (`validarSpec` → SPEC_INVALIDA) e monta a foto da spec + a PREPARAÇÃO
 * real das camadas de texto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { copyDaPaginaPorIdentidade, specComACopyDaPagina, textoDoExtraNaPagina } from '../defasagem'
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
  blobs: 0,
  relogio: 0,
}))
const pedirNovaTentativa = vi.hoisted(() => vi.fn(async (_jobId: unknown, _motivo: unknown) => true))

vi.mock('@/lib/db', () => ({
  db: {
    page: {
      findUnique: async () => estado.page,
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        if (!estado.page || where.id !== estado.page.id || (estado.page.updatedAt as Date).getTime() !== where.updatedAt.getTime()) return { count: 0 }
        estado.page = { ...estado.page, ...data, updatedAt: new Date(Date.UTC(2026, 8, 12, 20, 0, ++estado.relogio)) }
        estado.aposGravarPagina?.()
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => (estado.generation ? [estado.generation] : []),
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
    postLog: { create: async () => ({}) },
  },
}))
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: `https://blob.exemplo/arte-rapida/8/pg-1-nova-${++estado.blobs}.png` }), del: async () => undefined }))
vi.mock('@/lib/ai/generation-queue', () => ({ pedirNovaTentativa }))
vi.mock('@/lib/creatives/persist', () => ({ renderPageAndRegister: async () => { throw new Error('não deveria re-renderizar: a página só teve texto ou foto trocados') } }))
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
const textos = (spec: SpecDePeca) =>
  prepararBlocos({ assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec })
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

/**
 * Cria a peça, "persiste" (fieldValues com spec e snapshot, contrato da página) e agenda o slide 2/3 de um carrossel.
 * `editar` recebe as camadas persistidas e devolve as que estão na página no momento da recomposição.
 */
function montarCenario(entrada: Record<string, unknown>, editar: (camadas: Layer[]) => Layer[], opcoes: { comContrato: boolean }) {
  estado.page = null
  estado.generation = null
  estado.posts.clear()
  estado.specsCompostas = []
  estado.aposGravarPagina = null
  estado.blobs = 0
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
    isTemplate: false, templateId: 't-1', copyAutoral: opcoes.comContrato ? persistida.copyAutoral : null, updatedAt: new Date('2026-09-12T15:00:00.000Z'),
    Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
  }
  estado.generation = { id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...(persistida.fieldValues as Record<string, unknown>), pageId: 'pg-1' } }
  estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [CAPA, URL_ANTIGA, SLIDE_3] })
  return spec
}
const fotoDaPaginaGravada = () => (estado.page!.layers as Layer[]).find((c) => c.id === 'bg-foto')
const job = { generationId: 'gen-1', projectId: 8, recompor: { pageId: 'pg-1', origem: 'editor' as const }, queueJobId: 'job-1' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('R01 — a página mudou DEPOIS da gravação e antes do fim do job: o runner pede nova tentativa e o slide converge', () => {
  const entrada = {
    projectId: 8, formato: 'story', foto: { url: FOTO_A },
    blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['no bafo'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora' }],
    camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
  }

  it('troca SÓ de foto (B → C) na janela: nova tentativa pedida; a segunda execução recompõe com C e o slide mostra C', async () => {
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

    // A nova tentativa: recompõe com a foto da página (C), troca o slide e termina sem pedir outra.
    await processarRecomposicaoEmBackground(job)
    expect(estado.specsCompostas).toHaveLength(2)
    expect((estado.specsCompostas[1] as SpecDePeca).foto).toEqual({ url: FOTO_C })
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.exemplo/arte-rapida/8/pg-1-nova-2.png', SLIDE_3])
    expect(estado.generation!.resultUrl).toBe('https://blob.exemplo/arte-rapida/8/pg-1-nova-2.png')
    expect(fotoDaPaginaGravada()?.fileUrl).toBe(FOTO_C)
    // Os extras continuam com a identidade na peça recomposta.
    expect((estado.specsCompostas[1] as SpecDePeca).blocos!.find((b) => b.id === 'hora')).toMatchObject({ herdaDe: 'apoio', linhas: ['11h às 15h'] })
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
