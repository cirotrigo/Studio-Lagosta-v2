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
    $executeRaw: async () => 1,
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
import type { SpecDePeca } from '@/lib/compositor/spec'
import type { Layer } from '@/types/template'

function texto(id: string, papel: string, y: number, content: string) {
  return { id, name: id, type: 'text', content, visible: true, order: y, position: { x: 100, y }, size: { width: 880, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel } } }
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

beforeEach(() => {
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

describe('camadas com o MESMO id, dois blocos da função (varredura do PR3-R8-02)', () => {
  it('cada bloco fica com a sua camada — id repetido não faz a segunda sumir', () => {
    const dois: CopyAutoral = { ...original, blocos: [{ id: 'a1', funcao: 'apoio', ordem: 0, linhas: ['Primeiro'] }, { id: 'a2', funcao: 'apoio', ordem: 1, linhas: ['Segundo'] }] }
    const r = revisaoDaPaginaComCamadas(dois, [texto('apoio', 'apoio', 400, 'Primeiro'), texto('apoio', 'apoio', 500, 'Segundo')], { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })
})
