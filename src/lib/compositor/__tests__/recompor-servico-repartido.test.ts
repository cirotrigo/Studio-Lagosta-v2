/**
 * PR3-R8-02 (revisão FINAL do Codex sobre cc14f30a, 18/09/2026): o compositor
 * reparte UM bloco de serviço em duas camadas (`servico` e `servico-2`, as duas
 * com papel `servico`) quando o arranjo tem dois textos do papel — o horário e o
 * endereço, cada um com o seu ícone. A leitura efetiva dava a 1ª camada ao bloco
 * e criava OUTRO bloco `servico` com a 2ª: `Page.copyAutoral` ficava com dois
 * serviços, e a recomposição seguinte morria em `papel repetido: servico`, com o
 * slide preso na imagem anterior.
 *
 * Percurso real: spec com um serviço de duas linhas → as camadas repartidas →
 * `entradaDePersistencia` (o contrato que a página grava) → edição da manchete
 * no editor (`revisaoDaPaginaComCamadas`) → `recomporPaginaDefasada`, com o
 * `comporPeca` falso validando a spec pelo `validarSpec` real (é a 1ª coisa que
 * o verdadeiro faz). Confere o contrato, a troca do slide e a capa intacta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  posts: new Map<string, Record<string, any>>(),
  specsRecebidas: [] as unknown[],
  composta: [] as Array<Record<string, any>>,
  sql: [] as unknown[][],
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 8 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async () => banco.generations.at(-1) ?? null,
    },
    socialPost: {
      findMany: async () => [...banco.posts.values()].map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: { id: string } }) => (banco.posts.has(where.id) ? { ...banco.posts.get(where.id) } : null),
      updateMany: async ({ where, data }: { where: { id: string; mediaUrls?: { equals: string[] } }; data: Record<string, unknown> }) => {
        const p = banco.posts.get(where.id)
        if (!p || (where.mediaUrls && JSON.stringify(where.mediaUrls.equals) !== JSON.stringify(p.mediaUrls))) return { count: 0 }
        banco.posts.set(where.id, { ...p, ...data })
        return { count: 1 }
      },
    },
    postLog: { create: async ({ data }: { data: unknown }) => data },
    $executeRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push(valores)
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async () => ({ url: 'https://blob.test/arte-rapida/8/p9-nova.png' })), del: vi.fn() }))
vi.mock('@/lib/creatives/persist', () => ({
  getPublicAppUrl: () => 'https://studio.test',
  renderPageAndRegister: async () => {
    throw new Error('a recomposição desta prova não re-renderiza')
  },
}))
vi.mock('@/lib/compositor/compor', async () => {
  const { validarSpec } = await import('../spec')
  const { CreativeError } = await import('@/lib/creatives/errors')
  return {
    comporPeca: vi.fn(async (entrada: unknown) => {
      banco.specsRecebidas.push(entrada)
      const v = validarSpec(entrada)
      if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400)
      return { layers: banco.composta, prova: Buffer.from('png'), diagnostico: { avisos: [] } }
    }),
  }
})
vi.mock('@/lib/ai/generation-queue', () => ({
  marcarForcaAtendida: vi.fn(),
  marcarForcaEmExecucao: vi.fn(),
  marcarRenderComoEsta: vi.fn(),
  pedirNovaTentativa: vi.fn(),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { entradaDePersistencia } from '@/lib/compositor/persistencia'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { validarSpec, type SpecDePeca } from '@/lib/compositor/spec'
import type { Layer } from '@/types/template'

function texto(id: string, papel: string, y: number, content: string, vinculo?: { bloco: string; linhas: number[] }) {
  return {
    id,
    name: id,
    type: 'text',
    content,
    visible: true,
    order: y,
    position: { x: 100, y },
    size: { width: 880, height: 60 },
    style: { fontSize: 40 },
    // A marca que `montarBloco` grava (ver a prova em `compositor.test.ts`).
    metadata: { compositor: { papel, ...(vinculo ? { bloco: vinculo.bloco, linhas: vinculo.linhas } : {}) } },
  }
}

const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
    { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
  ],
  revisoes: [],
}
const spec = { projectId: 8, formato: 'story', copyAutoral: original, blocos: [{ papel: 'headline', linhas: ['Almoço executivo'] }, { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }], foto: { url: 'https://blob.test/foto.png' } } as unknown as SpecDePeca

/** O serviço repartido pelo arranjo: o horário numa camada, o endereço na outra (`compor.ts`, `${papel}-${n}`). */
const repartidas = (manchete: string) => [texto('headline', 'headline', 300, manchete), texto('servico', 'servico', 1600, 'Das 11h às 15h'), texto('servico-2', 'servico', 1680, 'Rua Aleixo Netto, 1158')]

const CAPA = 'https://blob.test/capa.png'
const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'

/** A `copyAutoral` do último merge da arte (a recomposição grava por `$executeRaw`). */
function copyDaArteGravada(): Record<string, any> {
  const patches = banco.sql.map((v) => { try { return JSON.parse(String(v[0])) } catch { return null } }).filter((p) => p && p.copyAutoral)
  expect(patches.length).toBeGreaterThan(0)
  return patches.at(-1)!.copyAutoral
}

beforeEach(() => {
  banco.sql = []
  banco.specsRecebidas = []
  banco.posts = new Map([['post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [CAPA, URL_ANTIGA], laterPostId: null }]])
})

describe('serviço repartido em duas camadas volta a UM bloco (PR3-R8-02)', () => {
  it('composição → persistência → edição da manchete → recomposição: um serviço só, spec válida, slide trocado e capa intacta', async () => {
    const camadas = repartidas('Almoço executivo')
    // 1. persistência: o contrato que a página grava é a efetiva sobre as camadas repartidas
    const entrada = entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
    const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
    expect(daPagina.blocos.filter((b) => b.funcao === 'servico')).toEqual([expect.objectContaining({ id: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] })])
    expect(daPagina.revisoes).toEqual([])

    // 2. a equipe edita só a manchete no editor
    const editadas = repartidas('Almoço de sexta')
    const revisao = revisaoDaPaginaComCamadas(daPagina, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(revisao.estado).toBe('registrada')
    expect(revisao.blocos).toEqual(['headline'])
    const contratoEditado = revisao.copy!
    expect(contratoEditado.blocos.filter((b) => b.funcao === 'servico')).toHaveLength(1)

    // 3. a recomposição do slide
    banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: contratoEditado }
    banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
    banco.composta = repartidas('Almoço de sexta')
    await recomporPaginaDefasada({ pageId: 'p9' })

    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço de sexta'] },
      { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ])
    expect(banco.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.test/arte-rapida/8/p9-nova.png'])
    const final = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(final.blocos.filter((b) => b.funcao === 'servico')).toHaveLength(1)
  })

  it('controle: numa camada SÓ, reordenar as linhas continua sendo mudança registrada (a tolerância vale só para o repartido)', () => {
    const umaSo = [texto('headline', 'headline', 300, 'Almoço executivo'), texto('servico', 'servico', 1600, 'Rua Aleixo Netto, 1158\nDas 11h às 15h')]
    const r = revisaoDaPaginaComCamadas(original, umaSo, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('registrada')
    expect(r.copy!.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Rua Aleixo Netto, 1158', 'Das 11h às 15h'])
  })
})

describe('o arranjo que pôs o endereço ACIMA do horário (PR3-R8-02)', () => {
  /** O arranjo inverte: o endereço no grupo do alfinete (em cima), o horário no do relógio. */
  const invertidas = (horario: string) => [texto('headline', 'headline', 300, 'Almoço executivo'), texto('servico-2', 'servico', 1600, 'Rua Aleixo Netto, 1158'), texto('servico', 'servico', 1680, horario)]

  it('as mesmas linhas em outra ordem entre camadas: o bloco mantém a ordem do autor, sem revisão', () => {
    const r = revisaoDaPaginaComCamadas(original, invertidas('Das 11h às 15h'), { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })

  /**
   * PR3-R9-02: editar SÓ o horário não pode inverter as linhas do contrato. A
   * parte que continua igual guarda a posição do autor, e a editada fica com a
   * vaga que sobrou — nada de cair para a ordem visual porque um texto mudou.
   */
  it('editar só o horário: um bloco só, com o MESMO id, na ordem do autor — e a recomposição recebe essa ordem', async () => {
    const camadas = invertidas('Das 11h às 15h')
    const entrada = entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
    const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
    expect(daPagina.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Das 11h às 15h', 'Rua Aleixo Netto, 1158'])

    const editadas = invertidas('Das 11h às 16h')
    const revisao = revisaoDaPaginaComCamadas(daPagina, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(revisao.estado).toBe('registrada')
    expect(revisao.blocos).toEqual(['servico'])
    const contratoEditado = revisao.copy!
    expect(contratoEditado.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico', linhas: ['Das 11h às 16h', 'Rua Aleixo Netto, 1158'] }),
    ])

    banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: contratoEditado }
    banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
    banco.composta = invertidas('Das 11h às 16h')
    await recomporPaginaDefasada({ pageId: 'p9' })

    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço executivo'] },
      { papel: 'servico', linhas: ['Das 11h às 16h', 'Rua Aleixo Netto, 1158'] },
    ])
    const final = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(final.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico', linhas: ['Das 11h às 16h', 'Rua Aleixo Netto, 1158'] }),
    ])
  })
})

describe('serviço repartido entre DOIS GRUPOS da página (PR3-R8-02, varredura)', () => {
  it('as duas camadas saem com o MESMO id `servico` (o contador de repetição é por grupo em compor.ts) e nenhuma linha se perde', () => {
    // Happy wine do TERO: o horário vai ao grupo do horário e o endereço ao do endereço; cada grupo numera do 1.
    const doisGrupos = [texto('headline', 'headline', 300, 'Almoço executivo'), texto('servico', 'servico', 900, 'Das 11h às 15h'), texto('servico', 'servico', 1700, 'Rua Aleixo Netto, 1158')]
    const r = revisaoDaPaginaComCamadas(original, doisGrupos, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })
})

/**
 * PR3-R10-01 (revisão do Codex sobre 89930e44, 20/09/2026): bloco
 * explicitamente VAZIO (`linhas: []`) é "esta camada fica sem texto". A
 * conversão para a spec o OMITE, então ele nunca originou camada — mas a
 * leitura efetiva o CONTAVA entre os blocos da função e entregava uma camada a
 * cada um: o horário migrava para o bloco vazio e o endereço ficava sozinho no
 * preenchido. A página passava a guardar dois serviços com texto, e editar só a
 * manchete levava a recomposição a `papel repetido: servico` — o slide ficava
 * com a imagem antiga.
 */
describe('bloco VAZIO de propósito não consome camada do irmão preenchido (PR3-R10-01)', () => {
  const comVazio: CopyAutoral = {
    ...original,
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
      { id: 'servico-vazio', funcao: 'servico', ordem: 1, linhas: [] },
      { id: 'servico-info', funcao: 'servico', ordem: 2, linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ],
  }
  const specComVazio = { ...spec, copyAutoral: comVazio } as unknown as SpecDePeca

  it('spec válida → duas camadas de serviço → edição só da manchete → recomposição com as duas linhas no bloco preenchido', async () => {
    // 0. a premissa do cenário: com o vazio omitido, a spec tem UM serviço e é aceita
    const naPorta = validarSpec(specComVazio)
    expect(naPorta.problemas).toEqual([])
    expect(naPorta.spec!.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço executivo'] },
      { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ])

    // 1. a persistência lê as duas camadas de serviço do arranjo
    const camadas = repartidas('Almoço executivo')
    const entrada = entradaDePersistencia({ spec: specComVazio, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
    const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
    expect(daPagina.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico-vazio', linhas: [] }),
      expect.objectContaining({ id: 'servico-info', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }),
    ])
    // nenhuma revisão artificial: o texto não migrou de id
    expect(daPagina.revisoes).toEqual([])

    // 2. a equipe edita só a manchete
    const editadas = repartidas('Almoço de sexta')
    const revisao = revisaoDaPaginaComCamadas(daPagina, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(revisao.estado).toBe('registrada')
    expect(revisao.blocos).toEqual(['headline'])

    // 3. a recomposição: um serviço só na spec, slide trocado, capa intacta
    banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
    banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
    banco.composta = repartidas('Almoço de sexta')
    await recomporPaginaDefasada({ pageId: 'p9' })

    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço de sexta'] },
      { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ])
    expect(banco.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.test/arte-rapida/8/p9-nova.png'])
    const final = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(final.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico-vazio', linhas: [] }),
      expect.objectContaining({ id: 'servico-info', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }),
    ])
  })

  it('controle: com TODOS os blocos da função vazios, a camada desenhada continua indo para o bloco (alguém a preencheu no editor)', () => {
    const soVazio: CopyAutoral = {
      ...original,
      blocos: [
        { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
        { id: 'servico-vazio', funcao: 'servico', ordem: 1, linhas: [] },
      ],
    }
    const comTexto = [texto('headline', 'headline', 300, 'Almoço executivo'), texto('servico', 'servico', 1600, 'Das 11h às 15h')]
    const r = revisaoDaPaginaComCamadas(soVazio, comTexto, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['servico-vazio'])
    expect(r.copy!.blocos.find((b) => b.id === 'servico-vazio')!.linhas).toEqual(['Das 11h às 15h'])
  })
})

describe('camadas com o MESMO id, dois blocos da função (varredura do PR3-R8-02)', () => {
  it('cada bloco fica com a sua camada — id repetido não faz a segunda sumir', () => {
    const dois: CopyAutoral = { ...original, blocos: [{ id: 'a1', funcao: 'apoio', ordem: 0, linhas: ['Primeiro'] }, { id: 'a2', funcao: 'apoio', ordem: 1, linhas: ['Segundo'] }] }
    const r = revisaoDaPaginaComCamadas(dois, [texto('apoio', 'apoio', 400, 'Primeiro'), texto('apoio', 'apoio', 500, 'Segundo')], { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })
})

/**
 * PR3-R11-01 (revisão FINAL do Codex sobre 61de523f, 20/09/2026): esconder as
 * DUAS camadas do serviço repartido e reexibi-las numa única escrita passava o
 * horário para o bloco que o autor deixou VAZIO — com os dois blocos vazios,
 * `vaziosPorFuncao` contava dois concorrentes e a ordem visual decidia. O texto
 * mudava de id sem decisão autoral, a página ficava com dois serviços
 * preenchidos, a recomposição seguinte morria em `papel repetido: servico` e a
 * reexibição ainda atribuía a redistribuição à EQUIPE.
 *
 * O vínculo é gravado por quem DESENHA (`metadata.compositor.bloco`), e por
 * isso sobrevive ao esconder: a camada oculta não é lida, mas volta com a marca.
 */
describe('esconder e reexibir o serviço repartido não move texto para o bloco vazio (PR3-R11-01)', () => {
  const comVazio: CopyAutoral = {
    ...original,
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
      { id: 'servico-vazio', funcao: 'servico', ordem: 1, linhas: [] },
      { id: 'servico-info', funcao: 'servico', ordem: 2, linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ],
  }
  const specComVazio = { ...spec, copyAutoral: comVazio } as unknown as SpecDePeca
  /** As camadas como o compositor as desenha: cada uma declarando o bloco e a posição que desenha. */
  const comVinculo = (manchete: string, visivel = true) =>
    [
      texto('headline', 'headline', 300, manchete, { bloco: 'headline', linhas: [0] }),
      { ...texto('servico', 'servico', 1600, 'Das 11h às 15h', { bloco: 'servico-info', linhas: [0] }), visible: visivel },
      { ...texto('servico-2', 'servico', 1680, 'Rua Aleixo Netto, 1158', { bloco: 'servico-info', linhas: [1] }), visible: visivel },
    ]

  it('composição → esconder as duas → reexibir juntas → editar a manchete → recompor: o vazio intacto e as duas linhas no bloco do autor', async () => {
    // 1. composição: o vazio fica vazio e calado; as duas linhas no bloco preenchido
    const entrada = entradaDePersistencia({ spec: specComVazio, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: comVinculo('Almoço executivo') as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
    const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
    expect(daPagina.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico-vazio', linhas: [] }),
      expect.objectContaining({ id: 'servico-info', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }),
    ])
    expect(daPagina.revisoes).toEqual([])
    expect(daPagina.lacunas ?? []).toEqual([])

    // 2. a equipe esconde as DUAS camadas do serviço e salva: o bloco desenhado
    // fica sem texto (com a lacuna), e o vazio do autor continua vazio e calado
    const escondidas = revisaoDaPaginaComCamadas(daPagina, comVinculo('Almoço executivo', false), { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(escondidas.estado).toBe('registrada')
    expect(escondidas.blocos).toEqual(['servico-info'])
    const ocultas = escondidas.copy!
    expect(ocultas.blocos.filter((b) => b.funcao === 'servico').map((b) => b.linhas)).toEqual([[], []])
    expect(ocultas.lacunas ?? []).toEqual(['o bloco "servico-info" (servico) não foi desenhado'])

    // 3. reexibir AS DUAS numa escrita só: o texto volta para o bloco de onde saiu
    const reexibidas = revisaoDaPaginaComCamadas(ocultas, comVinculo('Almoço executivo'), { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(reexibidas.estado).toBe('registrada')
    expect(reexibidas.blocos).toEqual(['servico-info'])
    const voltou = reexibidas.copy!
    expect(voltou.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico-vazio', linhas: [] }),
      expect.objectContaining({ id: 'servico-info', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }),
    ])

    // 4. a equipe edita a manchete e a peça é recomposta
    const editadas = comVinculo('Almoço de sexta')
    const revisao = revisaoDaPaginaComCamadas(voltou, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(revisao.blocos).toEqual(['headline'])
    banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
    banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
    banco.composta = comVinculo('Almoço de sexta')
    await recomporPaginaDefasada({ pageId: 'p9' })

    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço de sexta'] },
      { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ])
    expect(banco.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.test/arte-rapida/8/p9-nova.png'])
    const final = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(final.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico-vazio', linhas: [] }),
      expect.objectContaining({ id: 'servico-info', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }),
    ])
  })

  it('controle: SEM a marca (página composta antes de 20/09/2026) vale a reserva de sempre', () => {
    // A reserva não distingue o vazio do autor do bloco temporariamente oculto —
    // é a limitação declarada, e é por isso que o vínculo é gravado no desenho.
    const semMarca = [texto('headline', 'headline', 300, 'Almoço executivo'), texto('servico', 'servico', 1600, 'Das 11h às 15h'), texto('servico-2', 'servico', 1680, 'Rua Aleixo Netto, 1158')]
    const primeira = revisaoDaPaginaComCamadas(comVazio, semMarca, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(primeira.estado).toBe('sem-mudanca')
  })
})

/**
 * PR3-R11-02 (mesma revisão): com o endereço desenhado ACIMA do horário, editar
 * AS DUAS partes no MESMO salvamento deixava todas as correspondências de texto
 * em -1, e as vagas eram preenchidas pela ordem VISUAL — o contrato saía
 * `[endereço novo, horário novo]`, invertido, assinado pela equipe e entregue
 * assim à recomposição. A correção do R9-02 só valia enquanto uma das linhas
 * continuasse igual; a marca da camada diz a posição, mude o texto ou não.
 */
describe('editar as DUAS partes do serviço mantém a ordem do autor (PR3-R11-02)', () => {
  /** O arranjo inverte: o endereço no grupo do alfinete (em cima), o horário no do relógio. */
  const invertidas = (horario: string, endereco: string) => [
    texto('headline', 'headline', 300, 'Almoço executivo', { bloco: 'headline', linhas: [0] }),
    texto('servico-2', 'servico', 1600, endereco, { bloco: 'servico', linhas: [1] }),
    texto('servico', 'servico', 1680, horario, { bloco: 'servico', linhas: [0] }),
  ]

  it('horário E endereço trocados na mesma escrita: a Page, a spec recomposta e a efetiva da arte na ordem do autor', async () => {
    const camadas = invertidas('Das 11h às 15h', 'Rua Aleixo Netto, 1158')
    const entrada = entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
    const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
    expect(daPagina.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Das 11h às 15h', 'Rua Aleixo Netto, 1158'])

    const editadas = invertidas('Das 11h às 16h', 'Rua Aleixo Netto, 1200')
    const revisao = revisaoDaPaginaComCamadas(daPagina, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(revisao.estado).toBe('registrada')
    expect(revisao.blocos).toEqual(['servico'])
    const contratoEditado = revisao.copy!
    expect(contratoEditado.blocos.filter((b) => b.funcao === 'servico')).toEqual([
      expect.objectContaining({ id: 'servico', linhas: ['Das 11h às 16h', 'Rua Aleixo Netto, 1200'] }),
    ])

    banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: contratoEditado }
    banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
    banco.composta = invertidas('Das 11h às 16h', 'Rua Aleixo Netto, 1200')
    await recomporPaginaDefasada({ pageId: 'p9' })

    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.blocos).toEqual([
      { papel: 'headline', linhas: ['Almoço executivo'] },
      { papel: 'servico', linhas: ['Das 11h às 16h', 'Rua Aleixo Netto, 1200'] },
    ])
    const naPagina = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(naPagina.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Das 11h às 16h', 'Rua Aleixo Netto, 1200'])
    const naArte = copyDaArteGravada()
    expect(lerCopyAutoral(naArte.efetiva).copy!.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Das 11h às 16h', 'Rua Aleixo Netto, 1200'])
  })

  it('a camada que ganhou uma linha desalinha a marca e cai na reserva — declaração incompleta não reordena meio bloco', () => {
    const comLinhaNova = [
      texto('headline', 'headline', 300, 'Almoço executivo', { bloco: 'headline', linhas: [0] }),
      texto('servico-2', 'servico', 1600, 'Rua Aleixo Netto, 1158', { bloco: 'servico', linhas: [1] }),
      texto('servico', 'servico', 1680, 'Das 11h às 15h\nReserve pelo direct', { bloco: 'servico', linhas: [0] }),
    ]
    const r = revisaoDaPaginaComCamadas(original, comLinhaNova, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('registrada')
    // A reserva ancora pelas linhas IGUAIS (R9-02): as duas do autor voltam às
    // posições delas e a acrescentada entra depois.
    expect(r.copy!.blocos.find((b) => b.id === 'servico')!.linhas).toEqual(['Das 11h às 15h', 'Rua Aleixo Netto, 1158', 'Reserve pelo direct'])
  })
})
