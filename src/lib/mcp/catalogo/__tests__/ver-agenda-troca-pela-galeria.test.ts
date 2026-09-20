/**
 * R51 da revisão FINAL sobre 16af4e20 (13/09/2026): trocar a arte de um rascunho
 * de mídia única pela GALERIA deixa `pageId` como vínculo HISTÓRICO
 * (`NOT_NEEDED`, página conservada). `ver-agenda` carregava a página antiga e
 * devolvia os textos DELA com origem `pagina`, antes de olhar a mídia atual e a
 * procedência dela — a revisão semanal recebia a copy da arte anterior.
 *
 * O caminho real, ponta a ponta: o post nasce com `pageId=A` renderizando da
 * página A, `trocarArteDoPost` troca pela arte B da galeria, e o handler de
 * `ver-agenda` lê o post como ficou. Banco falso; serviço e handler reais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  post: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  paginas: [] as Array<Record<string, any>>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => structuredClone(banco.post),
      findMany: async () => [structuredClone(banco.post)],
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.post = { ...banco.post, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findFirst: async ({ where }: { where: { id: string; projectId: number } }) =>
        banco.generations.find((g) => g.id === where.id && g.projectId === where.projectId) ?? null,
      findMany: async ({ where }: { where: { projectId: number; resultUrl: { in: string[] } } }) =>
        banco.generations.filter((g) => g.projectId === where.projectId && where.resultUrl.in.includes(g.resultUrl)),
    },
    page: {
      findMany: async ({ where }: { where: { id: { in: string[] }; Template: { projectId: number } } }) =>
        banco.paginas.filter((p) => where.id.in.includes(p.id) && p.projectId === where.Template.projectId).map((p) => ({ id: p.id, layers: p.layers })),
    },
    knowledgeBaseEntry: { findMany: async () => [] },
    postLog: { create: async () => ({}) },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }), ehHostProprio: () => true }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test', renderPageAndRegister: vi.fn() }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: async () => null }))

import { Prisma } from '../../../../../prisma/generated/client'
import { trocarArteDoPost } from '@/lib/posts/trocar-arte-do-post'
import { toolsDeAgenda } from '../agenda'

const URL_A = 'https://blob.test/arte-rapida/8/A.png'
const URL_B = 'https://blob.test/arte-rapida/8/B.png'
const verAgenda = toolsDeAgenda.find((t) => t.nome === 'ver-agenda')!

const camadasDaPaginaA = JSON.stringify([
  { id: 'h', name: 'headline', type: 'text', content: 'Copy da página A', visible: true, order: 1 },
  { id: 'a', name: 'apoio', type: 'text', content: 'Apoio de A', visible: true, order: 2 },
])

function arteB(fieldValues: Record<string, unknown>) {
  return { id: 'gen-b', projectId: 8, resultUrl: URL_B, fieldValues }
}

async function itemDaAgenda() {
  const r = (await verAgenda.handler({ projectId: 8, from: '2026-09-14', to: '2026-09-20' }, { kind: 'service' } as never)) as { dias: Array<{ posts: Array<Record<string, any>> }> }
  return r.dias[0].posts[0]
}

beforeEach(() => {
  banco.paginas = [{ id: 'pag-A', projectId: 8, layers: camadasDaPaginaA }]
  banco.generations = [{ id: 'gen-a', projectId: 8, resultUrl: URL_A, fieldValues: { source: 'post-schedule', pageId: 'pag-A' } }]
  banco.post = {
    id: 'post-1',
    projectId: 8,
    postType: 'STORY',
    status: 'DRAFT',
    caption: null,
    scheduledDatetime: new Date('2026-09-16T22:00:00Z'),
    publishedUrl: null,
    publishType: 'DIRECT',
    mediaUrls: [URL_A],
    generationId: 'gen-a',
    laterPostId: null,
    learningScope: 'ROTINA',
    campaignId: null,
    pageId: 'pag-A',
    templateId: 77,
    renderStatus: 'RENDERED',
    slotValues: null,
  }
})

describe('R51 — ver-agenda depois de trocar a arte pela galeria', () => {
  it('controle: o post que renderiza da SUA página segue devolvendo os textos da página', async () => {
    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy da página A', 'Apoio de A'])
    expect(item.textosOrigem).toBe('pagina')
  })

  it('B re-renderizada SEM marcador: nenhum texto de A — a fonte é declarada indisponível', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-B-fora-do-projeto', slotValues: { headline: 'Copy de outra versão de B' }, recomposicao: { estado: 're-renderizada' } }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.pageId).toBe('pag-A')
    expect(banco.post!.renderStatus).toBe('NOT_NEEDED')
    expect(banco.post!.slotValues).toBe(Prisma.DbNull)
    banco.post!.slotValues = null // o que o banco devolve de um DbNull

    const item = await itemDaAgenda()
    expect(JSON.stringify(item)).not.toContain('página A')
    expect(JSON.stringify(item)).not.toContain('Apoio de A')
    expect(JSON.stringify(item)).not.toContain('outra versão')
    expect(item.textos).toBeUndefined()
    expect(item.textosIndisponiveis).toMatch(/re-renderizada/)
  })

  it('B re-renderizada COM a copy visual regravada: só a copy de B, qualificada como parcial — nada de A', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-B-fora-do-projeto', slotValues: { headline: 'Copy B regravada' }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.pageId).toBe('pag-A')

    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy B regravada'])
    expect(item.textosOrigem).toBe('arte')
    expect(item.textosParciais).toBe(true)
    expect(JSON.stringify(item)).not.toContain('página A')
  })

  it('registro ANTIGO (anterior ao C6-03) já nessa situação: nem a página A nem a copy de outra versão guardada no post são afirmadas', async () => {
    banco.generations.push(arteB({ source: 'ajuste-arte', slotValues: { headline: 'Copy de outra versão de B' }, recomposicao: { estado: 're-renderizada' } }))
    banco.post = { ...banco.post!, mediaUrls: [URL_B], generationId: 'gen-b', renderStatus: 'NOT_NEEDED', slotValues: { headline: 'Copy de outra versão de B' } }

    const item = await itemDaAgenda()
    expect(item.textos).toBeUndefined()
    expect(item.textosIndisponiveis).toBeTruthy()
    expect(JSON.stringify(item)).not.toContain('página A')
    expect(JSON.stringify(item)).not.toContain('Apoio de A')
  })

  /**
   * R52 (revisão FINAL sobre 7e96c643, 18/09/2026): a arte B da galeria é de MODELO (`post-schedule`) e aponta para a
   * MESMA página do post. O render aplicou `{ l1: '' , headline: 'Costela' }` — o id vence o nome, e o PNG não tem
   * "Costela". A troca descarta o `l1` vazio e grava `{ headline: 'Costela' }` no post; a igualdade de `pageId` fazia
   * a agenda aplicar isso à página e afirmar "Costela". A procedência da mídia manda, com ou sem registro das camadas.
   */
  describe('R52 — B de modelo apontando para a MESMA página do post, com id e nome endereçando a mesma camada', () => {
    const paginaDoModelo = [{ id: 'l1', name: 'headline', type: 'text', content: 'Título do modelo', visible: true, order: 1 }]
    for (const [caso, snapshot] of [['sem registro das camadas', undefined], ['com registro das camadas', paginaDoModelo]] as const) {
      it(`${caso}: "Costela" não é afirmado`, async () => {
        banco.paginas = [{ id: 'pag-A', projectId: 8, layers: JSON.stringify(paginaDoModelo) }]
        banco.generations.push(arteB({ source: 'post-schedule', pageId: 'pag-A', slotValues: { l1: { content: '' }, headline: 'Costela' }, ...(snapshot ? { layersSnapshot: snapshot } : {}) }))
        await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
        expect(banco.post!.pageId).toBe('pag-A')
        expect(banco.post!.renderStatus).toBe('NOT_NEEDED')
        expect(banco.post!.slotValues).toEqual({ headline: 'Costela' })

        const item = await itemDaAgenda()
        expect(JSON.stringify(item)).not.toContain('Costela')
        expect(item.textosOrigem).not.toBe('pagina-com-copy-do-post')
        expect(item.textos ?? []).toEqual([])
        expect(item.textosIndisponiveis).toBeTruthy()
      })
    }
  })

  /**
   * R53 (revisão FINAL sobre f96820bf, 20/09/2026): a arte B é de IA — não é de modelo, não foi re-renderizada e não
   * guarda camadas. R51 descarta a página A (certo), B não resolve texto nenhum e as duas invalidações do PR não
   * disparam: o fallback devolvia a copy de A gravada no post como se fosse o texto da mídia nova, dizendo apenas que
   * a leitura era parcial. A troca só REGRAVA os textos do post quando a arte nova carrega copy registrada.
   */
  describe('R53 — B de IA sem copy registrada: a copy de A que ficou no post não é da mídia nova', () => {
    const copyDeA = { headline: 'Oferta A', apoio: 'Só nesta semana' }
    for (const [caso, slotValuesDoPost] of [
      ['copy própria', copyDeA],
      ['cópia da página (_copiaDaPagina)', { ...copyDeA, _copiaDaPagina: true }],
    ] as const) {
      it(`${caso}: nada de A — a fonte é declarada indisponível, dizendo que o texto é de outra arte`, async () => {
        banco.post!.slotValues = { ...slotValuesDoPost }
        banco.generations.push(arteB({ source: 'geracao-ia', track: 'arte' }))
        await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
        expect(banco.post!.renderStatus).toBe('NOT_NEEDED')
        expect(banco.post!.pageId).toBe('pag-A')
        // 🔴 A troca de HOJE APAGA a cópia (R55) — quem ainda carrega o texto de A é a linha LEGADA, gravada
        //    antes daquele conserto. O write fix não alcança o que já está no banco, então a leitura continua
        //    sendo a guarda dessa população: é esse estado que ela precisa recusar.
        expect(banco.post!.slotValues).toBe(Prisma.DbNull)
        banco.post!.slotValues = { ...slotValuesDoPost }

        const item = await itemDaAgenda()
        expect(JSON.stringify(item)).not.toContain('Oferta A')
        expect(JSON.stringify(item)).not.toContain('Só nesta semana')
        expect(JSON.stringify(item)).not.toContain('página A')
        expect(item.textos).toBeUndefined()
        expect(item.textosIndisponiveis).toMatch(/de OUTRA arte/)
      })
    }

    it('controle: B de IA COM copy registrada — a troca regrava o post com a copy DELA, e é ela que volta', async () => {
      banco.post!.slotValues = { ...copyDeA }
      banco.generations.push(arteB({ source: 'geracao-ia', slotValues: { bloco1: 'Oferta B', bloco2: '  ' } }))
      await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
      expect(banco.post!.slotValues).toEqual({ bloco1: 'Oferta B' })

      const item = await itemDaAgenda()
      expect(item.textos).toEqual(['Oferta B'])
      expect(JSON.stringify(item)).not.toContain('Oferta A')
      expect(JSON.stringify(item)).not.toContain('página A')
    })

    it('controle: o post que continua renderizando da SUA página devolve a página, mesmo com copy própria gravada', async () => {
      banco.post!.slotValues = { headline: 'Copy própria do post' }
      const item = await itemDaAgenda()
      expect(item.textos).toEqual(['Copy própria do post', 'Apoio de A'])
      expect(item.textosOrigem).toBe('pagina-com-copy-do-post')
    })
  })

  /**
   * R54 (revisão FINAL sobre a996a082, 20/09/2026): o MESMO defeito no post que nunca teve página — o rascunho criado
   * por `generationId` nasce com `pageId` nulo. O guard do R53 exigia `paginaHistorica`, que é falso aí, então a
   * evidência de troca nem era avaliada e "Oferta A" voltava como `copy-do-post`, vivo e depois da entrega.
   *
   * 🔴 A copy de um post SEM página vem da ARTE: `agendarPost` grava `apenasTextos(copyVisual)`, os `slotValues` da
   *    própria Generation. É por isso que a divergência PROVA troca — e é o que separa este caso do R32, em que a
   *    arte é a do post e só a página dela não pôde ser lida.
   */
  describe('R54 — post SEM página própria: a mesma troca, o mesmo defeito', () => {
    const copyDeA = { headline: 'Oferta A', apoio: 'Só nesta semana' }
    // o estado real de quem agendou por `generationId`: sem página, a copy do post é a copy registrada na arte A
    const semPagina = () => {
      banco.paginas = []
      banco.generations = [{ id: 'gen-a', projectId: 8, resultUrl: URL_A, fieldValues: { source: 'geracao-ia', slotValues: { ...copyDeA } } }]
      banco.post = { ...banco.post, pageId: null, templateId: null, renderStatus: 'NOT_NEEDED', slotValues: { ...copyDeA } }
    }

    for (const [estado, status] of [['rascunho', 'DRAFT'], ['entregue', 'POSTED']] as const) {
      it(`${estado}: B de IA sem copy registrada — nada de A, a fonte é declarada indisponível dizendo que o texto é de outra arte`, async () => {
        semPagina()
        banco.generations.push(arteB({ source: 'geracao-ia', track: 'arte' }))
        await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
        expect(banco.post!.pageId).toBeNull()
        // 🔴 Linha LEGADA, como no R53 acima: a troca de hoje apaga a cópia (R55) e a leitura guarda o que já
        //    está gravado no banco.
        expect(banco.post!.slotValues).toBe(Prisma.DbNull)
        banco.post!.slotValues = { ...copyDeA }
        banco.post!.status = status

        const item = await itemDaAgenda()
        expect(JSON.stringify(item)).not.toContain('Oferta A')
        expect(JSON.stringify(item)).not.toContain('Só nesta semana')
        expect(item.textos).toBeUndefined()
        expect(item.textosIndisponiveis).toMatch(/de OUTRA arte/)
      })
    }

    it('controle: B COM copy registrada — a troca regrava o post e é a copy DELA que volta', async () => {
      semPagina()
      banco.generations.push(arteB({ source: 'geracao-ia', slotValues: { bloco1: 'Oferta B' } }))
      await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
      expect(banco.post!.slotValues).toEqual({ bloco1: 'Oferta B' })
      const item = await itemDaAgenda()
      expect(item.textos).toEqual(['Oferta B'])
      expect(JSON.stringify(item)).not.toContain('Oferta A')
    })

    it('controle R12 — nenhuma arte casada com a mídia: a copy do post continua valendo, PARCIAL', async () => {
      semPagina()
      banco.post!.mediaUrls = ['https://blob.test/arte-rapida/8/sem-arte.png']
      const item = await itemDaAgenda()
      expect(item.textos).toEqual(['Oferta A', 'Só nesta semana'])
      expect(item.textosParciais).toBe(true)
    })

    it('controle R13 — a arte da mídia foi RE-RENDERIZADA (mesma peça refeita): a copy do post não vira "de outra arte"', async () => {
      semPagina()
      banco.generations[0].fieldValues = { ...banco.generations[0].fieldValues, recomposicao: { estado: 're-renderizada' } }
      const item = await itemDaAgenda()
      expect(item.textosIndisponiveis ?? '').not.toMatch(/de OUTRA arte/)
    })

    it('controle: a arte casada CONFERE com a copy do post (o estado normal de quem agendou por generationId)', async () => {
      semPagina()
      const item = await itemDaAgenda()
      expect(item.textos).toEqual(['Oferta A', 'Só nesta semana'])
      expect(item.textosIndisponiveis).toBeUndefined()
    })
  })

  /**
   * Varredura da classe do R52 (18/09/2026): com a arte da PRÓPRIA página (não de modelo), a página segue sendo a
   * fonte — mas os slots que o post herdou na troca NÃO são entrada de render nenhum (`NOT_NEEDED`: o PNG é o da arte,
   * mantido em dia com a página pela recomposição). Depois de editar a página, aplicá-los devolvia o texto de antes.
   */
  it('arte da própria página, página editada depois da troca: vale a página como está, nunca os slots herdados', async () => {
    const pagina = (texto: string) => JSON.stringify([{ id: 'h', name: 'headline', type: 'text', content: texto, visible: true, order: 1 }])
    banco.paginas = [{ id: 'pag-A', projectId: 8, layers: pagina('Copy X') }]
    banco.generations.push(arteB({ source: 'ajuste-arte', pageId: 'pag-A', slotValues: { headline: 'Copy X' }, layersSnapshot: JSON.parse(pagina('Copy X')) }))
    await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
    expect(banco.post!.slotValues).toEqual({ headline: 'Copy X' })
    // a página é editada e a arte B é re-renderizada como a página ficou, com a copy visual regravada
    banco.paginas = [{ id: 'pag-A', projectId: 8, layers: pagina('Copy Y') }]
    banco.generations[1].fieldValues = { ...banco.generations[1].fieldValues, slotValues: { headline: 'Copy Y' }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }

    const item = await itemDaAgenda()
    expect(item.textos).toEqual(['Copy Y'])
    expect(item.textosOrigem).toBe('pagina')
    expect(JSON.stringify(item)).not.toContain('Copy X')
  })
})

/**
 * 🔴 A INVARIANTE da classe, testada de uma vez (R53 → R54 → R55, 20/09/2026).
 *
 * **O texto que a agenda devolve descreve a mídia ATUAL do post, ou é declarado
 * indisponível — nunca o texto de outra arte.**
 *
 * As três rodadas acharam três células da MESMA família (página histórica; sem
 * página; cópia marcada + arte re-renderizada sem slots). A matriz cruza os
 * eixos que apareceram nelas — o que o post carregava antes × o que a arte NOVA
 * é × vivo ou entregue — e roda o caminho REAL (`trocarArteDoPost` → handler de
 * `ver-agenda`). Célula nova da família passa a nascer coberta.
 *
 * O que a matriz NÃO cruza, e por quê: CARROSSEL (a leitura é slide a slide e
 * nenhum fallback do post a alcança — R15/R20, testados na prova 3e) e a troca
 * pela PÁGINA (ali a mídia volta a sair do render da página do post, que
 * `renderPostArt` mantém em dia — é o único ramo em que a cópia anterior
 * sobrevive, e de propósito).
 */
describe('INVARIANTE: depois da troca, o texto é o da mídia ATUAL ou é declarado', () => {
  const COPY_B = 'Copy registrada de B'
  const camadasDeB = JSON.stringify([{ id: 'h', name: 'headline', type: 'text', content: COPY_B, visible: true, order: 1 }])

  // O que a arte NOVA é. `texto` = o que a agenda PODE afirmar por ela; null = nada a afirmar.
  const artes = [
    { nome: 'íntegra com copy registrada', fv: { source: 'arte-rapida', slotValues: { headline: COPY_B } }, texto: COPY_B },
    { nome: 'íntegra sem copy nenhuma', fv: { source: 'geracao-ia' }, texto: null },
    { nome: 're-renderizada SEM slotValues (peça do compositor refeita)', fv: { source: 'compositor', recomposicao: { estado: 're-renderizada' } }, texto: null },
    { nome: 're-renderizada com slots e SEM marcador', fv: { source: 'ajuste-arte', slotValues: { headline: 'Copy de outra versão de B' }, recomposicao: { estado: 're-renderizada' } }, texto: null },
    { nome: 're-renderizada COM a copy visual regravada', fv: { source: 'ajuste-arte', slotValues: { headline: COPY_B }, recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }, texto: COPY_B },
    { nome: 'de MODELO com copy e registro das camadas', fv: { source: 'post-schedule', pageId: 'pag-A', slotValues: { headline: COPY_B }, layersSnapshot: camadasDeB }, texto: COPY_B },
  ] as const

  // O que o post carregava ANTES da troca — os três produtores reais de cópia textual.
  const anteriores = [
    { nome: 'cópia MARCADA da página (agendarPost/render)', sv: { headline: 'Oferta A', _copiaDaPagina: true } },
    { nome: 'copy PRÓPRIA do post', sv: { headline: 'Oferta A' } },
    { nome: 'sem cópia nenhuma', sv: null },
  ] as const

  // Tem página própria? A troca pela galeria CONSERVA o `pageId` (vínculo histórico, R51) e o
  // rascunho nascido por `generationId` nunca teve um (R54) — o guard tem de valer nos dois.
  const paginas = [
    { nome: 'página histórica', post: { pageId: 'pag-A', templateId: 77, renderStatus: 'RENDERED' } },
    { nome: 'sem página', post: { pageId: null, templateId: null, renderStatus: 'NOT_NEEDED' } },
  ] as const

  for (const pagina of paginas) {
  for (const anterior of anteriores) {
    for (const arte of artes) {
      for (const entregue of [false, true]) {
        it(`${pagina.nome} + ${anterior.nome} + arte ${arte.nome} + ${entregue ? 'entregue' : 'rascunho'}`, async () => {
          Object.assign(banco.post!, pagina.post)
          banco.post!.slotValues = anterior.sv
          banco.generations.push(arteB(arte.fv as Record<string, unknown>))

          await trocarArteDoPost({ projectId: 8, postId: 'post-1', generationId: 'gen-b' })
          // O que o banco devolve de um DbNull é `null`.
          if (banco.post!.slotValues === Prisma.DbNull) banco.post!.slotValues = null
          if (entregue) banco.post!.status = 'POSTED'

          const item = await itemDaAgenda()
          const json = JSON.stringify(item)
          // 1. Nada da arte ANTERIOR: nem a cópia que o post carregava, nem a página que ele renderizava.
          expect(json).not.toContain('Oferta A')
          expect(json).not.toContain('Copy da página A')
          expect(json).not.toContain('Apoio de A')
          expect(json).not.toContain('outra versão')
          // 2. Ou o texto da mídia atual, ou a declaração — nunca silêncio.
          if (arte.texto) {
            expect(item.textos).toContain(arte.texto)
          } else {
            expect(item.textos).toBeUndefined()
            expect(typeof item.textosIndisponiveis).toBe('string')
          }
        })
      }
    }
  }
  }
})
