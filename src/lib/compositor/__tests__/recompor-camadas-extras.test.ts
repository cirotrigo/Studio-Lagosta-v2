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
import { VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import { montarAssinatura } from '../assinatura'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec, type SpecDePeca } from '../spec'

const URL_ANTIGA = 'https://blob.exemplo/arte-rapida/8/pg-1-antiga.png'
const URL_NOVA = 'https://blob.exemplo/arte-rapida/8/pg-1-nova.png'

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
}))

vi.mock('@/lib/db', () => ({
  db: {
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
vi.mock('@/lib/creatives/persist', () => ({ renderPageAndRegister: async () => { throw new Error('não deveria re-renderizar: a página só teve texto editado') } }))
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
      return [l?.content, (l?.metadata?.compositor as { linhasDoBloco?: number[] } | undefined)?.linhasDoBloco]
    }
    expect([marca('servico'), marca('servico-2')]).toEqual([[ENDERECO_NOVO, [1]], [HORARIO, [0]]])
    const efetiva = estado.paginaGravada?.copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, ENDERECO_NOVO]]])
    // Uma revisão só: a edição do endereço (lida pela recomposição). Nenhuma nascida da distribuição.
    expect(efetiva.revisoes.map((rv) => rv.blocos)).toEqual([['svc']])
    expect(validarSpec((estado.generationGravada?.fieldValues as Record<string, unknown>).spec).problemas).toEqual([])
  })
})
