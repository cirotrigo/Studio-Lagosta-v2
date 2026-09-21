/**
 * R15 (revisão do Codex sobre o PR 9, 12/09/2026) pelo CONSUMIDOR: a peça com
 * uma camada extra livre é agendada como slide de carrossel; a equipe edita no
 * editor SÓ o texto do extra ("Hoje" → "Amanhã"). A recomposição tem de passar
 * pelo compositor com a spec válida e trocar, no post, apenas o slide daquela
 * arte — os irmãos ficam, e o post já entregue ao publicador não é tocado.
 *
 * Banco, Blob, render e fila são falsos. `comporPeca` é falso, mas com o
 * contrato real da primeira linha dele: `validarSpec` e `SPEC_INVALIDA` — é
 * exatamente onde a recomposição parava antes da correção.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { copyEfetivaDasCamadas, VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import { montarAssinatura } from '../assinatura'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec, type SpecDePeca } from '../spec'

const URL_ANTIGA = 'https://blob.exemplo/arte-rapida/8/pg-1-antiga.png'
const URL_NOVA = 'https://blob.exemplo/arte-rapida/8/pg-1-nova.png'
const URL_RERENDER = 'https://blob.exemplo/arte-rapida/8/pg-1-como-esta.png'

const estado = vi.hoisted(() => ({
  page: null as Record<string, unknown> | null,
  generation: null as Record<string, unknown> | null,
  posts: new Map<string, Record<string, unknown>>(),
  specsCompostas: [] as unknown[],
  camadasDaComposicao: [] as unknown[],
  /** R19: quando presente, a composição falsa PREPARA as camadas da spec recebida (as marcas nascem de novo). */
  comporCamadas: null as null | ((spec: unknown) => unknown[]),
  paginaGravada: null as Record<string, unknown> | null,
  generationGravada: null as Record<string, unknown> | null,
  /** PR9-F01: quando presente, o re-render como está é permitido e registra a página que recebeu. */
  reRenderizadas: null as null | Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    /**
     * A recomposição do PR 0 grava a arte por `mesclarFieldValuesDaArte`: MERGE
     * raso no banco (`"fieldValues" || ${patch}::jsonb`, e `"resultUrl"` quando
     * vem), nunca `generation.update` com o `fieldValues` lido antes (REV-R01).
     * O falso aplica o mesmo merge sobre a arte e registra o resultado.
     */
    $executeRaw: async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = strings.join('?')
      if (!sql.includes('UPDATE "Generation" SET "fieldValues" = (CASE')) throw new Error(`SQL inesperado no teste: ${sql}`)
      const patch = JSON.parse(String(valores[0])) as Record<string, unknown>
      const atual = (estado.generationGravada?.fieldValues ?? estado.generation?.fieldValues ?? {}) as Record<string, unknown>
      estado.generationGravada = { ...(sql.includes('"resultUrl" =') ? { resultUrl: valores[1] } : {}), fieldValues: { ...atual, ...patch } }
      return 1
    },
    page: {
      findUnique: async () => estado.page,
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        if (!estado.page || where.id !== estado.page.id || (estado.page.updatedAt as Date).getTime() !== where.updatedAt.getTime()) return { count: 0 }
        estado.paginaGravada = data
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => (estado.generation ? [estado.generation] : []),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.generationGravada = data
        return { id: 'gen-1' }
      },
    },
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta', userId: 'dono' }) },
    socialPost: {
      findMany: async () => [...estado.posts.values()].map((p) => ({ id: p.id, pageId: p.pageId, renderStatus: p.renderStatus, mediaUrls: p.mediaUrls, laterPostId: p.laterPostId })),
      findUnique: async ({ where }: { where: { id: string } }) => estado.posts.get(where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; laterPostId: null; mediaUrls: { equals: string[] } }; data: { mediaUrls: string[] } }) => {
        const p = estado.posts.get(where.id)
        if (!p || p.laterPostId || JSON.stringify(p.mediaUrls) !== JSON.stringify(where.mediaUrls.equals)) return { count: 0 }
        estado.posts.set(where.id, { ...p, mediaUrls: data.mediaUrls })
        return { count: 1 }
      },
    },
    postLog: { create: async () => ({}) },
  },
}))
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: URL_NOVA }), del: async () => undefined }))
vi.mock('@/lib/ai/generation-queue', () => ({ pedirNovaTentativa: async () => undefined }))
vi.mock('@/lib/creatives/persist', () => ({
  renderPageAndRegister: async (entrada: { page: Record<string, unknown> }) => {
    if (!estado.reRenderizadas) throw new Error('não deveria re-renderizar: a página só teve texto editado')
    estado.reRenderizadas.push(entrada.page)
    return { url: URL_RERENDER }
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
      return { prova: Buffer.from('png'), layers: estado.comporCamadas ? estado.comporCamadas(v.spec) : estado.camadasDaComposicao, diagnostico: { avisos: [] } }
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

describe('recomporPaginaDefasada — R15: edição só do texto de uma camada extra livre', () => {
  it('recompõe com a spec válida (id, herança e texto novo) e troca SÓ o slide da arte; irmãos e post entregue ficam', async () => {
    const assinatura = montarAssinatura({
      pagina: {
        id: 'p-assinatura', name: 'Story', width: 1080, height: 1920,
        layers: [
          texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
          texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
        ],
      },
      formatoDaPagina: 'story',
      numerosDoProjeto: null,
    })
    const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
    const copy: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['Hoje'], estilo: { herdaDe: 'apoio' } },
      ],
    }
    const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy })
    expect(v.problemas).toEqual([])
    const specPersistida = v.spec as SpecDePeca
    expect(specPersistida.camadasExtras?.map((c) => c.linhas)).toEqual([['Hoje']])

    const preparados = prepararBlocos({
      assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
      medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec: specPersistida,
    })
    const camadasHoje = preparados.montados.map((b) => b.layer)
    const nota = camadasHoje.find((l) => (l.metadata?.compositor as { extra?: { id?: string } } | undefined)?.extra?.id === 'nota')
    expect(nota?.content).toBe('Hoje')
    const entrada = entradaDePersistencia({
      spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
      nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadasHoje, fundo: '#000', diagnostico: {}, fotoUrl: null,
    })
    const camadasAmanha = camadasHoje.map((l) => (l.id === nota!.id ? { ...l, content: 'Amanhã' } : l))

    estado.page = {
      id: 'pg-1', name: 'Sex 18/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasAmanha, background: '#000',
      isTemplate: false, templateId: 't-1', copyAutoral: entrada.copyAutoral, updatedAt: new Date('2026-09-12T15:00:00.000Z'),
      Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
    }
    estado.generation = {
      id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
      fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-1' },
    }
    estado.camadasDaComposicao = camadasAmanha
    const irmaA = 'https://blob.exemplo/capa.png'
    const irmaB = 'https://blob.exemplo/slide-3.png'
    estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [irmaA, URL_ANTIGA, irmaB] })
    estado.posts.set('post-entregue', { id: 'post-entregue', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: 'zernio-1', mediaUrls: [URL_ANTIGA, irmaB] })

    const { recomporPaginaDefasada } = await import('../recompor')
    const r = await recomporPaginaDefasada({ pageId: 'pg-1' })

    expect(r.recomposta).toBe(true)
    expect(r.url).toBe(URL_NOVA)
    expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
    expect(r.congelados).toEqual(['post-entregue'])
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([irmaA, URL_NOVA, irmaB])
    expect(estado.posts.get('post-entregue')!.mediaUrls).toEqual([URL_ANTIGA, irmaB])

    expect(estado.specsCompostas).toHaveLength(1)
    const composta = estado.specsCompostas[0] as SpecDePeca
    expect(composta.camadasExtras).toEqual([expect.objectContaining({ id: 'nota', linhas: ['Amanhã'], herdaDe: 'apoio', ordem: 1 })])
    expect(composta.copyAutoral?.blocos.find((b) => b.id === 'nota')?.linhas).toEqual(['Amanhã'])

    const efetiva = estado.paginaGravada?.copyAutoral as CopyAutoral
    expect(efetiva.blocos.find((b) => b.id === 'nota')?.linhas).toEqual(['Amanhã'])
    expect(validarSpec((estado.generationGravada?.fieldValues as Record<string, unknown>).spec).problemas).toEqual([])
    // a spec gravada tem a forma da composição: o extra com o texto novo em `camadasExtras`, não só no contrato
    const gravada = (estado.generationGravada?.fieldValues as Record<string, unknown>).spec as SpecDePeca
    expect(gravada.camadasExtras).toEqual([expect.objectContaining({ id: 'nota', linhas: ['Amanhã'], herdaDe: 'apoio', ordem: 1 })])
  })
})

describe('recomporPaginaDefasada — R18: serviço repartido em duas camadas, edição só do endereço', () => {
  it('recompõe com UM serviço de duas linhas (sem bloco fictício), troca SÓ o slide da arte e grava a efetiva com o bloco autoral inteiro', async () => {
    estado.page = null
    estado.generation = null
    estado.posts.clear()
    estado.specsCompostas = []
    estado.paginaGravada = null
    estado.generationGravada = null
    const HORARIO = 'Ter a dom, das 18h às 23h'
    // A página do R13: horário num grupo (com relógio), endereço noutro (com alfinete).
    const img = (id: string, url: string, x: number, y: number, grupo: string): Layer =>
      ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: url, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer
    const camadasDaPagina: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
      texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1200 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-meio' } }),
      img('relogio', 'https://exemplo.com/relogio.png', 120, 1204, 'g-meio'),
      texto('info', { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
      img('pin', 'https://exemplo.com/pin.png', 122, 1652, 'g-rodape'),
    ]
    const assinatura = montarAssinatura({ pagina: { id: 'p-dois-grupos', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
    assinatura.camadasDaPagina = camadasDaPagina
    const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
    const copy: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, 'Av. Beira Mar, 100'] },
      ],
    }
    const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy })
    expect(v.problemas).toEqual([])
    const specPersistida = v.spec as SpecDePeca
    const camadasHoje = prepararBlocos({
      assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
      medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec: specPersistida,
    }).montados.map((b) => b.layer)
    expect(camadasHoje.map((l) => l.id).sort()).toEqual(['headline', 'servico', 'servico-2'])
    const entrada = entradaDePersistencia({
      spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
      nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadasHoje, fundo: '#000', diagnostico: {}, fotoUrl: null,
    })
    expect((entrada.copyAutoral as CopyAutoral).blocos.map((b) => b.id)).toEqual(['h', 'svc'])
    const camadasEditadas = camadasHoje.map((l) => (l.id === 'servico-2' ? { ...l, content: 'Av. Beira Mar, 200' } : l))

    estado.page = {
      id: 'pg-2', name: 'Sáb 19/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
      isTemplate: false, templateId: 't-1', copyAutoral: entrada.copyAutoral, updatedAt: new Date('2026-09-12T16:00:00.000Z'),
      Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
    }
    estado.generation = {
      id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
      fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-2' },
    }
    estado.camadasDaComposicao = camadasEditadas
    const capa = 'https://blob.exemplo/capa.png'
    const slide3 = 'https://blob.exemplo/slide-3.png'
    estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })

    const { recomporPaginaDefasada } = await import('../recompor')
    const r = await recomporPaginaDefasada({ pageId: 'pg-2' })

    expect(r.recomposta).toBe(true)
    expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([capa, URL_NOVA, slide3])
    expect(estado.specsCompostas).toHaveLength(1)
    const composta = estado.specsCompostas[0] as SpecDePeca
    expect(composta.blocos!.map((b) => [b.papel, b.linhas])).toEqual([['headline', ['Costela']], ['servico', [HORARIO, 'Av. Beira Mar, 200']]])
    expect(composta.camadasExtras ?? []).toEqual([])
    const efetiva = estado.paginaGravada?.copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, 'Av. Beira Mar, 200']]])
    expect(validarSpec((estado.generationGravada?.fieldValues as Record<string, unknown>).spec).problemas).toEqual([])
  })
})

describe('recomporPaginaDefasada — R19: endereço no grupo da manchete, montado antes do horário', () => {
  it('recompõe com UM serviço na ordem autoral [horário, endereço novo], as camadas gravadas saem marcadas de novo pela preparação e a efetiva não ganha revisão da distribuição', async () => {
    estado.page = null
    estado.generation = null
    estado.posts.clear()
    estado.specsCompostas = []
    estado.paginaGravada = null
    estado.generationGravada = null
    estado.comporCamadas = null
    const HORARIO = 'Ter a dom, das 18h às 23h'
    const ENDERECO_NOVO = 'Av. Beira Mar, 200'
    const img = (id: string, url: string, x: number, y: number, grupo: string): Layer =>
      ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: url, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer
    // A página do R18 com o ENDEREÇO no grupo da manchete: a montagem numera o endereço primeiro.
    const camadasDaPagina: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
      texto('info', { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 460 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-topo' } }),
      img('pin', 'https://exemplo.com/pin.png', 122, 462, 'g-topo'),
      texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1600 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
      img('relogio', 'https://exemplo.com/relogio.png', 120, 1604, 'g-rodape'),
    ]
    const assinatura = montarAssinatura({ pagina: { id: 'p-r19', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
    assinatura.camadasDaPagina = camadasDaPagina
    const preparar = (spec: SpecDePeca) =>
      prepararBlocos({
        assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
        medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec,
      }).montados.map((b) => b.layer)
    const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
    const copy: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, 'Av. Beira Mar, 100'] },
      ],
    }
    const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy })
    expect(v.problemas).toEqual([])
    const specPersistida = v.spec as SpecDePeca
    const camadasHoje = preparar(specPersistida)
    expect(camadasHoje.find((l) => l.id === 'servico')?.content).toBe('Av. Beira Mar, 100')
    const entrada = entradaDePersistencia({
      spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
      nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadasHoje, fundo: '#000', diagnostico: {}, fotoUrl: null,
    })
    expect((entrada.copyAutoral as CopyAutoral).blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, 'Av. Beira Mar, 100']]])
    expect((entrada.copyAutoral as CopyAutoral).revisoes).toEqual([])
    const camadasEditadas = camadasHoje.map((l) => (l.id === 'servico' ? { ...l, content: ENDERECO_NOVO } : l))

    estado.page = {
      id: 'pg-3', name: 'Dom 20/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
      isTemplate: false, templateId: 't-1', copyAutoral: entrada.copyAutoral, updatedAt: new Date('2026-09-12T17:00:00.000Z'),
      Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
    }
    estado.generation = {
      id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
      fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-3' },
    }
    // A composição falsa refaz a PREPARAÇÃO sobre a spec que recebeu — as marcas das camadas gravadas são as novas.
    estado.comporCamadas = (spec) => preparar(spec as SpecDePeca)
    const capa = 'https://blob.exemplo/capa.png'
    const slide3 = 'https://blob.exemplo/slide-3.png'
    estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })

    const { recomporPaginaDefasada } = await import('../recompor')
    const r = await recomporPaginaDefasada({ pageId: 'pg-3' })
    estado.comporCamadas = null

    expect(r.recomposta).toBe(true)
    expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
    expect(estado.specsCompostas).toHaveLength(1)
    const composta = estado.specsCompostas[0] as SpecDePeca
    expect(composta.blocos!.map((b) => [b.papel, b.linhas])).toEqual([['headline', ['Costela']], ['servico', [HORARIO, ENDERECO_NOVO]]])
    expect(composta.camadasExtras ?? []).toEqual([])

    const gravadas = estado.paginaGravada?.layers as Layer[]
    const marca = (id: string) => {
      const l = gravadas.find((c) => c.id === id)
      return [l?.content, (l?.metadata?.compositor as { linhas?: number[] } | undefined)?.linhas]
    }
    expect([marca('servico'), marca('servico-2')]).toEqual([[ENDERECO_NOVO, [1]], [HORARIO, [0]]])
    const efetiva = estado.paginaGravada?.copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, ENDERECO_NOVO]]])
    // Uma revisão só: a edição do endereço (lida pela recomposição). Nenhuma nascida da distribuição.
    expect(efetiva.revisoes.map((rv) => rv.blocos)).toEqual([['svc']])
    expect(validarSpec((estado.generationGravada?.fieldValues as Record<string, unknown>).spec).problemas).toEqual([])
  })
})

describe('recomporPaginaDefasada — R21: spec sem contrato com o extra de serviço declarado depois, na ordem 0', () => {
  it('a edição do serviço comum recompõe com a spec válida (o serviço comum agora é a segunda ocorrência do papel), cada texto no seu id e SÓ o slide da arte trocado', async () => {
    estado.page = null
    estado.generation = null
    estado.posts.clear()
    estado.specsCompostas = []
    estado.paginaGravada = null
    estado.generationGravada = null
    estado.comporCamadas = null
    const camadasDaPagina: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
      texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    ]
    const assinatura = montarAssinatura({ pagina: { id: 'p-r21', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
    assinatura.camadasDaPagina = camadasDaPagina
    const preparar = (spec: SpecDePeca) =>
      prepararBlocos({
        assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
        medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec,
      }).montados.map((b) => b.layer)
    const v = validarSpec({
      projectId: 8, formato: 'story',
      blocos: [
        { papel: 'headline', linhas: ['Costela'] },
        { papel: 'servico', linhas: ['11h às 15h'] },
        { papel: 'servico', linhas: ['Delivery até 22h'], id: 'hora-extra', herdaDe: 'apoio', grupoVisual: 'topo', ordem: 0 },
      ],
    })
    expect(v.problemas).toEqual([])
    const specPersistida = v.spec as SpecDePeca
    const camadasHoje = preparar(specPersistida)
    const entrada = entradaDePersistencia({
      spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
      nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadasHoje, fundo: '#000', diagnostico: {}, fotoUrl: null,
    })
    expect((entrada.copyAutoral as CopyAutoral).blocos.map((b) => b.id)).toEqual(['hora-extra', 'headline', 'servico'])
    const camadasEditadas = camadasHoje.map((l) => (l.id === 'servico' ? { ...l, content: '11h às 16h' } : l))

    estado.page = {
      id: 'pg-4', name: 'Seg 21/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
      isTemplate: false, templateId: 't-1', copyAutoral: entrada.copyAutoral, updatedAt: new Date('2026-09-12T18:00:00.000Z'),
      Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
    }
    estado.generation = {
      id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
      fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-4' },
    }
    estado.comporCamadas = (spec) => preparar(spec as SpecDePeca)
    const capa = 'https://blob.exemplo/capa.png'
    const slide3 = 'https://blob.exemplo/slide-3.png'
    const outroPost = 'https://blob.exemplo/outra-arte.png'
    estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })
    estado.posts.set('post-entregue', { id: 'post-entregue', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: 'zernio-1', mediaUrls: [URL_ANTIGA, outroPost] })

    const { recomporPaginaDefasada } = await import('../recompor')
    const r = await recomporPaginaDefasada({ pageId: 'pg-4' })
    estado.comporCamadas = null

    expect(r.recomposta).toBe(true)
    expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
    expect(r.congelados).toEqual(['post-entregue'])
    expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([capa, URL_NOVA, slide3])
    expect(estado.posts.get('post-entregue')!.mediaUrls).toEqual([URL_ANTIGA, outroPost])
    expect(estado.specsCompostas).toHaveLength(1)
    const composta = estado.specsCompostas[0] as SpecDePeca
    expect(composta.blocos!.map((b) => [b.papel, b.id ?? null, b.linhas])).toEqual([['servico', 'hora-extra', ['Delivery até 22h']], ['headline', null, ['Costela']], ['servico', null, ['11h às 16h']]])
    const gravadas = estado.paginaGravada?.layers as Layer[]
    expect(Object.fromEntries(gravadas.map((l) => [l.id, l.content]))).toEqual({ headline: 'Costela', servico: '11h às 16h', 'hora-extra': 'Delivery até 22h' })
    const efetiva = estado.paginaGravada?.copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['hora-extra', ['Delivery até 22h']], ['headline', ['Costela']], ['servico', ['11h às 16h']]])
    expect(validarSpec((estado.generationGravada?.fieldValues as Record<string, unknown>).spec).problemas).toEqual([])
  })
})

/**
 * PR9-F01 (revisão FINAL do Codex sobre o PR 9, 18/09/2026): a leitura do
 * contrato RECUSA a edição (histórico com 200 revisões, ou bloco novo que o
 * contrato não comporta). O caminho sem contrato atualiza só os blocos por
 * papel, e `specDaRecomposicao` conservava as `camadasExtras` da spec antiga —
 * com o texto de ANTES. A recomposição gravava "Hoje" sobre o "Amanhã" que a
 * equipe tinha salvo. Peça com extra e contrato ilegível é RE-RENDERIZADA como
 * está: as camadas e o contrato ficam, o aviso sai e só o slide troca.
 */
describe('recomporPaginaDefasada — PR9-F01: contrato recusa a leitura numa peça com camada extra', () => {
  // PR 10: com histórico cheio os extras são reconstruídos pela IDENTIDADE da camada (`specComACopyDaPagina`),
  // então a peça é RECOMPOSTA com o texto novo; com bloco que o contrato não comporta, re-render como está.
  const casos: Array<[string, string, (c: CopyAutoral) => CopyAutoral, 'recompoe' | 're-renderiza']> = [
    ['histórico cheio (200 revisões)', 'Amanhã', (c) => ({
      ...c,
      revisoes: Array.from({ length: 200 }, (_, i) => ({ em: '2026-09-12T13:00:00.000Z', autor: 'equipe' as const, motivo: `revisão ${i}`, blocos: ['h'] })),
    }), 'recompoe'],
    ['bloco novo que o contrato não comporta (RevisaoDaCopyInvalida)', 'A'.repeat(301), (c) => c, 're-renderiza'],
  ]
  for (const [nome, textoNovo, ajustarContrato, desfecho] of casos) {
    it(`${nome}: ${desfecho === 'recompoe' ? 'recompõe com o texto NOVO do extra' : 're-renderiza como está'}, sem gravar o texto antigo; contrato intacto, aviso e só o slide troca`, async () => {
      estado.page = null
      estado.generation = null
      estado.posts.clear()
      estado.specsCompostas = []
      estado.paginaGravada = null
      estado.generationGravada = null
      estado.comporCamadas = null
      estado.reRenderizadas = []
      const assinatura = montarAssinatura({
        pagina: {
          id: 'p-assinatura', name: 'Story', width: 1080, height: 1920,
          layers: [
            texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
            texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
          ],
        },
        formatoDaPagina: 'story',
        numerosDoProjeto: null,
      })
      const copy: CopyAutoral = {
        versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
        blocos: [
          { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
          { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['Hoje'], estilo: { herdaDe: 'apoio' } },
        ],
      }
      const specPersistida = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy }).spec as SpecDePeca
      const camadasHoje = prepararBlocos({
        assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
        medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec: specPersistida,
      }).montados.map((b) => b.layer)
      const nota = camadasHoje.find((l) => (l.metadata?.compositor as { extra?: { id?: string } } | undefined)?.extra?.id === 'nota')!
      const entrada = entradaDePersistencia({
        spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
        nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadasHoje, fundo: '#000', diagnostico: {}, fotoUrl: null,
      })
      const contrato = ajustarContrato(entrada.copyAutoral as CopyAutoral)
      const camadasEditadas = camadasHoje.map((l) => (l.id === nota.id ? { ...l, content: textoNovo } : l))
      estado.page = {
        id: 'pg-f01', name: 'Sex 18/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
        isTemplate: false, templateId: 't-1', copyAutoral: contrato, updatedAt: new Date('2026-09-18T15:00:00.000Z'),
        Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
      }
      estado.generation = {
        id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
        fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-f01' },
      }
      estado.camadasDaComposicao = camadasHoje
      const capa = 'https://blob.exemplo/capa.png'
      const slide3 = 'https://blob.exemplo/slide-3.png'
      estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })
      estado.posts.set('post-entregue', { id: 'post-entregue', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: 'zernio-1', mediaUrls: [URL_ANTIGA, slide3] })

      const { recomporPaginaDefasada } = await import('../recompor')
      const r = await recomporPaginaDefasada({ pageId: 'pg-f01' })
      const reRenderizadas = estado.reRenderizadas
      estado.reRenderizadas = null

      const urlNova = desfecho === 'recompoe' ? URL_NOVA : URL_RERENDER
      if (desfecho === 'recompoe') {
        expect(r.recomposta).toBe(true)
        expect(reRenderizadas).toEqual([])
        expect((estado.specsCompostas as SpecDePeca[]).map((sp) => sp.camadasExtras?.map((c) => [c.id, c.linhas]))).toEqual([[['nota', [textoNovo]]]])
        // A página mantém o contrato como estava (sem efetiva nova: o histórico está cheio).
        expect(estado.paginaGravada?.copyAutoral).toBeUndefined()
        expect(r.avisos.some((a) => /sem contrato/i.test(a))).toBe(true)
      } else {
        expect(estado.specsCompostas).toEqual([])
        expect(estado.paginaGravada).toBeNull()
        expect(r.recomposta).toBe(false)
        expect(reRenderizadas).toHaveLength(1)
        expect((reRenderizadas[0].layers as Layer[]).find((l) => l.id === nota.id)?.content).toBe(textoNovo)
        expect(r.avisos.some((a) => /camada extra/i.test(a))).toBe(true)
      }
      expect(estado.page.copyAutoral).toBe(contrato)
      expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
      expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([capa, urlNova, slide3])
      expect(estado.posts.get('post-entregue')!.mediaUrls).toEqual([URL_ANTIGA, slide3])
    })
  }
})

/**
 * PR9-F01, 2ª metade (revisão FINAL do Codex sobre b6980b5b, 21/09/2026): o extra COM FUNÇÃO — um serviço que herda o
 * estilo do apoio — não vive em `camadasExtras`: ele fica em `spec.blocos`, com `herdaDe`. A guarda do re-render olhava
 * só `camadasExtras`, e com o contrato recusando a leitura a recomposição seguia para `specComACopyDaPagina`, que
 * reconstrói cada bloco como `{ papel, linhas }` e descarta id e herança: com um serviço comum ao lado, dois serviços
 * comuns → `papel repetido` e o slide antigo; sozinho, o serviço perdia a herança. Os testes anteriores usavam só o
 * extra `livre` — a guarda tinha sido escrita pelo caso do exemplo, não pela regra.
 *
 * Todo caso roda nas duas formas da página: como a preparação grava e LEGADA (sem `bloco`/`linhas`) — a decisão do
 * re-render é da spec, e a marca não pode mudá-la.
 *
 * PR 10 (R1, 21/09/2026): no ciclo os extras voltam pela IDENTIDADE da camada, nas duas formas. Com o HISTÓRICO CHEIO a
 * leitura do contrato recusa, mas o texto da página cabe na spec: a peça pode ser RECOMPOSTA com o texto da equipe (o
 * que o PR 10 faz) ou re-renderizada como está (o que o PR 9 fazia) — as duas são corretas, e o teste afirma o DESFECHO
 * que a pessoa vê, não o mecanismo. Com a LEITURA INVÁLIDA o texto não cabe nem na spec (os limites de linha são os do
 * contrato, R06): recompor só pode terminar em SPEC_INVALIDA, então re-renderizar é a ÚNICA saída correta, e ali as
 * asserções do PR 9 ficam como estavam.
 *
 * Desfechos errados que o teste reprova: o slide com a arte antiga — inclusive quando a recomposição REJEITA
 * (SPEC_INVALIDA, `papel repetido`), o que derruba o teste no `await` —, o extra sem a herança (desenhado no estilo do
 * serviço), um segundo serviço comum, o texto de antes da edição, o contrato reescrito e o post entregue tocado.
 */
describe('recomporPaginaDefasada — PR9-F01: contrato recusa a leitura numa peça com extra COM FUNÇÃO', () => {
  type Saida = 'recompoe' | 're-renderiza'
  const recusas: Array<[string, string, (c: CopyAutoral) => CopyAutoral, Saida[]]> = [
    ['histórico cheio (200 revisões)', 'Retirada até 22h', (c) => ({
      ...c,
      revisoes: Array.from({ length: 200 }, (_, i) => ({ em: '2026-09-12T13:00:00.000Z', autor: 'equipe' as const, motivo: `revisão ${i}`, blocos: ['h'] })),
    }), ['recompoe', 're-renderiza']],
    ['leitura inválida (RevisaoDaCopyInvalida)', 'A'.repeat(301), (c) => c, ['re-renderiza']],
  ]
  const contratos: Array<[string, CopyAutoral['blocos']]> = [
    ['com serviço comum da mesma função', [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'svc', funcao: 'servico', ordem: 1, linhas: ['11h às 16h'] },
      { id: 'hora-extra', funcao: 'servico', ordem: 2, linhas: ['Delivery até 22h'], estilo: { herdaDe: 'apoio' } },
    ]],
    ['sem serviço comum (só o herdado)', [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'hora-extra', funcao: 'servico', ordem: 1, linhas: ['Delivery até 22h'], estilo: { herdaDe: 'apoio' } },
    ]],
  ]
  const semVinculo = (l: Layer): Layer => {
    const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
    return { ...l, metadata: { ...l.metadata, compositor } } as Layer
  }
  const idDoExtra = (l: Layer) => (l.metadata?.compositor as { extra?: { id?: string } } | undefined)?.extra?.id
  // O que a herança decide no desenho: fonte, corpo, cor e entrelinha do papel de onde o estilo vem.
  const estiloDesenhado = (l: Layer) => {
    const s = (l.style ?? {}) as Record<string, unknown>
    return { fontFamily: s.fontFamily, fontSize: s.fontSize, fill: s.fill, color: s.color, lineHeight: s.lineHeight }
  }
  const ehTexto = (l: Layer) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false
  for (const [nomeDoContrato, blocos] of contratos)
    for (const [nomeDaRecusa, textoNovo, ajustarContrato, saidasCorretas] of recusas)
      for (const forma of ['preparada', 'legada'] as const)
        it(`${nomeDoContrato} · ${nomeDaRecusa} · página ${forma}: a arte troca com o texto e a herança da equipe (${saidasCorretas.join(' ou ')}); contrato intacto, só o slide troca, post entregue intocado`, async () => {
          estado.page = null
          estado.generation = null
          estado.posts.clear()
          estado.specsCompostas = []
          estado.paginaGravada = null
          estado.generationGravada = null
          estado.comporCamadas = null
          estado.reRenderizadas = []
          const temServicoComum = blocos.some((b) => b.id === 'svc')
          const assinatura = montarAssinatura({
            pagina: {
              id: 'p-assinatura', name: 'Story', width: 1080, height: 1920,
              layers: [
                texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
                texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
                texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2 }, 'Serviço', { position: { x: 92, y: 1650 }, metadata: { groupId: 'g2' } }),
              ],
            },
            formatoDaPagina: 'story',
            numerosDoProjeto: null,
          })
          const preparar = (spec: SpecDePeca) =>
            prepararBlocos({
              assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
              medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec,
            }).montados.map((b) => b.layer)
          const copy: CopyAutoral = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [], blocos }
          const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy })
          expect(v.problemas).toEqual([])
          const specPersistida = v.spec as SpecDePeca
          // O extra COM FUNÇÃO está em `blocos`, não em `camadasExtras` — é essa a representação que a guarda não via.
          expect(specPersistida.camadasExtras ?? []).toEqual([])
          expect(specPersistida.blocos.some((b) => b.herdaDe === 'apoio' && b.id === 'hora-extra')).toBe(true)
          const preparadas = preparar(specPersistida)
          const camadasHoje = forma === 'legada' ? preparadas.map(semVinculo) : preparadas
          const doExtra = camadasHoje.find((l) => l.content === 'Delivery até 22h')!
          // Premissa: a herança se VÊ — o extra nasce no estilo do apoio, que não é o do serviço. Sem isso, comparar o
          // estilo do extra regravado com o de antes não distinguiria herança preservada de herança perdida.
          expect(estiloDesenhado(doExtra)).toMatchObject({ fontFamily: 'Barlow', fontSize: 40 })
          const entrada = entradaDePersistencia({
            spec: specPersistida, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
            nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: preparadas, fundo: '#000', diagnostico: {}, fotoUrl: null,
          })
          const contrato = ajustarContrato(entrada.copyAutoral as CopyAutoral)
          const camadasEditadas = camadasHoje.map((l) => (l.id === doExtra.id ? { ...l, content: textoNovo } : l))
          estado.page = {
            id: 'pg-f01b', name: 'Sex 18/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
            isTemplate: false, templateId: 't-1', copyAutoral: contrato, updatedAt: new Date('2026-09-18T15:00:00.000Z'),
            Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
          }
          estado.generation = {
            id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
            fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-f01b' },
          }
          estado.camadasDaComposicao = preparadas
          // A composição falsa refaz a PREPARAÇÃO sobre a spec que recebeu: a página regravada é a que a peça nova desenha.
          estado.comporCamadas = (spec) => preparar(spec as SpecDePeca)
          const capa = 'https://blob.exemplo/capa.png'
          const slide3 = 'https://blob.exemplo/slide-3.png'
          estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })
          estado.posts.set('post-entregue', { id: 'post-entregue', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: 'zernio-1', mediaUrls: [URL_ANTIGA, slide3] })

          const { recomporPaginaDefasada } = await import('../recompor')
          const r = await recomporPaginaDefasada({ pageId: 'pg-f01b' })
          const reRenderizadas = estado.reRenderizadas
          estado.reRenderizadas = null
          estado.comporCamadas = null

          const saida: Saida = r.recomposta ? 'recompoe' : 're-renderiza'
          expect(saidasCorretas).toContain(saida)
          // O que a pessoa vê no post: só o slide desta arte trocou, e não pela arte antiga; a capa e o slide 3 ficam.
          expect(r.trocados).toEqual([{ postId: 'post-carrossel', indice: 1, total: 3 }])
          expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([capa, saida === 'recompoe' ? URL_NOVA : URL_RERENDER, slide3])
          // O post já entregue ao publicador não é tocado — nem chega a ser tentado (nenhum "não trocado").
          expect(r.congelados).toEqual(['post-entregue'])
          expect(r.naoTrocados).toEqual([])
          expect(estado.posts.get('post-entregue')!.mediaUrls).toEqual([URL_ANTIGA, slide3])
          // O contrato fica como estava: nenhuma escrita da página o leva.
          expect(estado.page.copyAutoral).toBe(contrato)
          expect(estado.paginaGravada?.copyAutoral).toBeUndefined()

          if (saida === 're-renderiza') {
            // As asserções do PR 9: nada é recomposto, e a página é desenhada EXATAMENTE como a equipe a gravou.
            expect(estado.specsCompostas).toEqual([])
            expect(estado.paginaGravada).toBeNull()
            expect(reRenderizadas).toHaveLength(1)
            expect((reRenderizadas[0].layers as Layer[]).find((l) => l.id === doExtra.id)?.content).toBe(textoNovo)
            expect(reRenderizadas[0].layers).toEqual(camadasEditadas)
            expect(r.avisos.some((a) => /camada extra/i.test(a))).toBe(true)
            return
          }
          expect(reRenderizadas).toEqual([])
          // A spec que chegou ao compositor passou pelo `validarSpec` real (o falso de `comporPeca` o chama antes de
          // tudo) e leva o extra pela IDENTIDADE — id, função, herança — com o texto NOVO; ao lado, só o serviço comum
          // que o contrato tem (nenhum segundo serviço comum).
          expect(estado.specsCompostas).toHaveLength(1)
          const composta = estado.specsCompostas[0] as SpecDePeca
          expect(composta.blocos.filter((b) => b.herdaDe).map((b) => [b.id, b.papel, b.herdaDe, b.linhas])).toEqual([['hora-extra', 'servico', 'apoio', [textoNovo]]])
          expect(composta.blocos.filter((b) => !b.herdaDe).map((b) => [b.papel, b.linhas])).toEqual([
            ['headline', ['Costela']],
            ...(temServicoComum ? [['servico', ['11h às 16h']]] : []),
          ])
          // A página regravada é a peça nova: o texto que a equipe gravou, cada um na sua camada, e o extra continua
          // sendo o extra — desenhado no estilo do APOIO, como antes da edição.
          const gravadas = estado.paginaGravada!.layers as Layer[]
          expect(gravadas.filter(ehTexto).map((l) => l.content).sort()).toEqual(['Costela', textoNovo, ...(temServicoComum ? ['11h às 16h'] : [])].sort())
          const extraGravado = gravadas.find((l) => idDoExtra(l) === 'hora-extra')!
          expect(extraGravado.content).toBe(textoNovo)
          expect(extraGravado.metadata?.compositor).toMatchObject({ papel: 'servico', extra: { id: 'hora-extra', funcao: 'servico', herdaDe: 'apoio' } })
          expect(estiloDesenhado(extraGravado)).toEqual(estiloDesenhado(doExtra))
          // Relida no contrato da peça, a página regravada põe cada texto no seu bloco — nenhum `extra-*`, nenhum
          // serviço a mais: a edição seguinte não herda uma atribuição errada.
          const relida = copyEfetivaDasCamadas(entrada.copyAutoral as CopyAutoral, gravadas, { superficie: 'teste' })
          expect(relida.efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual(blocos.map((b) => [b.id, b.id === 'hora-extra' ? [textoNovo] : b.linhas]))
          // A arte gravada: a spec válida, com o extra e a herança; e o registro da copy NÃO afirma a efetiva desta
          // imagem, que não pôde ser medida contra o contrato cheio (PR3-F02).
          const fv = estado.generationGravada!.fieldValues as Record<string, unknown>
          expect(validarSpec(fv.spec).problemas).toEqual([])
          expect((fv.spec as SpecDePeca).blocos.find((b) => b.id === 'hora-extra')).toMatchObject({ papel: 'servico', herdaDe: 'apoio', linhas: [textoNovo] })
          expect(fv.copyAutoral).toMatchObject({ efetiva: null, comparavel: false })
          expect(r.avisos.some((a) => /sem contrato/i.test(a))).toBe(true)
        })
})

/**
 * O aviso de ajuste manual nomeia a camada EXTRA pela identidade que ela DECLARA (`metadata.compositor.extra.id`),
 * nunca pelo formato do id (varredura do PR 10 após o 2º restack, 21/09/2026). `idReservado` só proíbe `<papel>-N`
 * numérico: o extra `servico-fds` é id aceito, começava por `servico-` e o aviso o chamava de "servico" — numa peça
 * que também tem o serviço comum, a pessoa não sabia QUAL texto tinha sido mexido.
 *
 * O rótulo não decide nada (toda decisão lê a CONTAGEM de `mexidoNaMao`), então o desfecho conferido é o que a pessoa
 * vê: a decisão (re-render como está, com a página exatamente como a equipe a deixou) e QUEM o aviso aponta como
 * mexido — os nomes citados, não a frase.
 */
describe('recomporPaginaDefasada — o aviso de ajuste manual aponta o extra pela identidade declarada', () => {
  const casos: Array<[string, string[], string[]]> = [
    ['só o extra `servico-fds` movido', ['servico-fds'], ['servico-fds']],
    ['o serviço comum e o extra movidos', ['servico', 'servico-fds'], ['servico', 'servico-fds']],
  ]
  for (const [nome, movidas, apontadas] of casos)
    it(`${nome}: re-renderiza como está e o aviso aponta ${apontadas.join(' e ')} — nunca o extra como "servico"`, async () => {
      estado.page = null
      estado.generation = null
      estado.posts.clear()
      estado.specsCompostas = []
      estado.paginaGravada = null
      estado.generationGravada = null
      estado.comporCamadas = null
      estado.reRenderizadas = []
      const assinatura = montarAssinatura({
        pagina: {
          id: 'p-assinatura', name: 'Story', width: 1080, height: 1920,
          layers: [
            texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
            texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
            texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2 }, 'Serviço', { position: { x: 92, y: 1650 }, metadata: { groupId: 'g2' } }),
          ],
        },
        formatoDaPagina: 'story',
        numerosDoProjeto: null,
      })
      const copy: CopyAutoral = {
        versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
        blocos: [
          { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
          { id: 'svc', funcao: 'servico', ordem: 1, linhas: ['11h às 16h'] },
          { id: 'servico-fds', funcao: 'servico', ordem: 2, linhas: ['Sáb e dom, 12h às 16h'], estilo: { herdaDe: 'apoio' } },
        ],
      }
      const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy })
      expect(v.problemas).toEqual([])
      const preparadas = prepararBlocos({
        assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000',
        medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [], spec: v.spec as SpecDePeca,
      }).montados.map((b) => b.layer)
      // O cenário do defeito: o serviço comum se chama `servico`, e o extra de função `servico` tem um id que COMEÇA
      // por `servico-` — o formato do id não separa um do outro; só a identidade declarada separa.
      const comum = preparadas.find((l) => l.id === 'servico')!
      const extra = preparadas.find((l) => l.id === 'servico-fds')!
      expect((comum.metadata?.compositor as Record<string, unknown>).papel).toBe('servico')
      expect(comum.metadata?.compositor).not.toHaveProperty('extra')
      expect(extra.metadata?.compositor).toMatchObject({ papel: 'servico', extra: { id: 'servico-fds', funcao: 'servico', herdaDe: 'apoio' } })
      const entrada = entradaDePersistencia({
        spec: v.spec as SpecDePeca, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono' }, pasta: { id: 1, name: 'p' },
        nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: preparadas, fundo: '#000', diagnostico: {}, fotoUrl: null,
      })
      // A equipe arrasta à mão (sem mudar texto nenhum) as camadas do caso.
      const camadasEditadas = preparadas.map((l) => (movidas.includes(l.id) ? { ...l, position: { x: l.position.x, y: l.position.y + 40 } } : l))
      estado.page = {
        id: 'pg-aviso', name: 'Sáb 19/09 · 19:00 · Lagosta · slide 2/3', width: 1080, height: 1920, layers: camadasEditadas, background: '#000',
        isTemplate: false, templateId: 't-1', copyAutoral: entrada.copyAutoral, updatedAt: new Date('2026-09-18T16:00:00.000Z'),
        Template: { id: 't-1', name: 'Stories · Semana', projectId: 8 },
      }
      estado.generation = {
        id: 'gen-1', resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null,
        fieldValues: { ...(entrada.fieldValues as Record<string, unknown>), pageId: 'pg-aviso' },
      }
      const capa = 'https://blob.exemplo/capa.png'
      const slide3 = 'https://blob.exemplo/slide-3.png'
      estado.posts.set('post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'SCHEDULED', pageId: null, renderStatus: 'NOT_NEEDED', laterPostId: null, mediaUrls: [capa, URL_ANTIGA, slide3] })

      const { recomporPaginaDefasada } = await import('../recompor')
      const r = await recomporPaginaDefasada({ pageId: 'pg-aviso' })
      const reRenderizadas = estado.reRenderizadas
      estado.reRenderizadas = null

      // A decisão: ajuste à mão → re-render como está, com a página exatamente como a equipe a deixou; só o slide troca.
      expect(r.recomposta).toBe(false)
      expect(estado.specsCompostas).toEqual([])
      expect(reRenderizadas).toHaveLength(1)
      expect(reRenderizadas[0].layers).toEqual(camadasEditadas)
      expect(estado.posts.get('post-carrossel')!.mediaUrls).toEqual([capa, URL_RERENDER, slide3])
      // QUEM o aviso aponta como mexido: exatamente as camadas movidas, cada uma pelo nome que a separa das outras.
      const avisoDoAjuste = r.avisos.filter((a) => /ajustada à mão/.test(a))
      expect(avisoDoAjuste).toHaveLength(1)
      const apontadasNoAviso = [...avisoDoAjuste[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
      expect(apontadasNoAviso).toEqual([...apontadas].sort())
    })
})
