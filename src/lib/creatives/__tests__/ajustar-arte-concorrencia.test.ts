/**
 * C3-01 (pré-revisão do commit bf85cb26, 12/09/2026): `ajustarArte` SEM
 * `versaoEsperada` (só foto ou só nome, pelo chat) não pode gravar por cima de
 * uma edição salva no meio do ajuste.
 *
 * O caminho real de `ajustarArte`, com o banco em memória e o render falso. A
 * intercalação é a do achado: a página é lida com as camadas X e o contrato X;
 * enquanto o ajuste mede e roda o autofix, o editor grava a headline Y (camadas
 * Y, contrato Y revisado pela equipe). Antes, a revisão do ajuste saía
 * `sem-mudanca` contra a leitura velha, as camadas X iam por cima sem
 * compare-and-set e a página terminava com camadas X e contrato Y — e a próxima
 * edição no editor assinava como `equipe` a volta de Y para X.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  // `any`: a página em memória tem o formato do Prisma (width, height, layers, copyAutoral…).
  pagina: null as any,
  relogio: 1_000,
  generations: [] as Array<Record<string, any>>,
  putSeq: 0,
  /** Roda uma vez no meio do ajuste — depois da leitura da página, antes da escrita. */
  duranteOAjuste: null as null | (() => void),
}))

vi.mock('@/lib/db', () => {
  const comTemplate = () => ({ ...banco.pagina, Template: { id: 77, name: 'Arte Rápida', projectId: 8 } })
  // Como o Prisma com `@updatedAt`: toda escrita na página move o carimbo.
  const tocar = (data: Record<string, unknown>) => {
    banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
  }
  const db: Record<string, any> = {
    project: {
      findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }),
    },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? comTemplate() : null),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) throw new Error('page not found')
        tocar(data)
        return comTemplate()
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date; isTemplate?: boolean }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) return { count: 0 }
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        if (where.isTemplate !== undefined && banco.pagina.isTemplate !== where.isTemplate) return { count: 0 }
        tocar(data)
        return { count: 1 }
      },
    },
    generation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `gen-${banco.generations.length + 1}`
        banco.generations.push({ id, createdAt: new Date(++banco.relogio), ...data })
        return { id }
      },
      findFirst: async () => banco.generations.at(-1) ?? null,
    },
    knowledgeBaseEntry: { findFirst: async () => null },
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
// O client gerado mora em prisma/generated (tsconfig `paths`); o vitest não lê paths.
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (caminho: string) => ({ url: `https://blob.test/${caminho}?n=${++banco.putSeq}` })),
  del: vi.fn(async () => undefined),
}))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    async renderDesign() {
      return Buffer.from('png-falso')
    }
  },
}))
// Registrar as fontes é o primeiro passo demorado depois da leitura da página: é ali que a edição concorrente cai.
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async () => {
    const edicao = banco.duranteOAjuste
    banco.duranteOAjuste = null
    edicao?.()
  },
  fetchBuffer: vi.fn(),
}))
vi.mock('@/lib/creatives/server-text-measurer', () => ({
  createServerTextMeasurer: async () => () => 100,
  createServerTextBoxMeasurer: async () => () => ({ width: 100, height: 100, maxLineWidth: 100, lineCount: 1 }),
}))
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: async (args: { layers: unknown[] }) => ({ layers: args.layers, autocorrecao: { aplicada: false }, avisos: [] }),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/recompor', () => ({
  travarRecomposicaoDaArte: vi.fn(async () => undefined),
  pedirRecomposicaoDaArteCongelada: vi.fn(async () => null),
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))

import { ajustarArte } from '../arte-rapida'
import { CreativeError } from '../errors'
import { versaoDaPagina } from '../revisao/versao'
import { copyAutoralDaPagina, revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { VERSAO_DO_CONTRATO, serializarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

function texto(id: string, y: number, content: string) {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 880, height: 120 }, style: { fontSize: 80, fontFamily: 'Montserrat', fill: '#ffffff' }, metadata: { compositor: { papel: id } } }
}

const contratoX: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Reserve pelo direct'] },
  ],
  revisoes: [],
}

function paginaInicial(comContrato = true) {
  return {
    id: 'p1',
    name: 'Peça do chat',
    width: 1080,
    height: 1920,
    background: '#101010',
    isTemplate: false,
    templateId: 77,
    thumbnail: 'https://blob.test/render-anterior.png',
    updatedAt: new Date(banco.relogio),
    layers: [texto('headline', 1500, 'Almoço executivo'), texto('cta', 1650, 'Reserve pelo direct')],
    copyAutoral: comContrato ? serializarCopyAutoral(contratoX) : null,
  }
}

const manchete = () => (banco.pagina!.layers as Array<Record<string, any>>).find((l) => l.id === 'headline')!.content

/** O PATCH do editor: camadas novas e, havendo contrato, a revisão da equipe NA MESMA escrita. */
function editarNoEditor(novaManchete: string) {
  const layers = (banco.pagina.layers as Array<Record<string, any>>).map((l) => (l.id === 'headline' ? { ...l, content: novaManchete } : l))
  const revisao = revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, layers, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
  banco.pagina = {
    ...banco.pagina,
    layers,
    ...(revisao.estado === 'registrada' ? { copyAutoral: serializarCopyAutoral(revisao.copy!) } : {}),
    updatedAt: new Date(++banco.relogio),
  }
}

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  return promessa.then(
    () => null,
    (erro: unknown) => erro,
  )
}

beforeEach(() => {
  banco.relogio = 1_000
  banco.pagina = paginaInicial()
  banco.generations = []
  banco.putSeq = 0
  banco.duranteOAjuste = null
})

describe('C3-01 — ajustarArte sem versaoEsperada não grava por cima de uma edição salva no meio do ajuste', () => {
  it('o editor grava a headline Y durante um ajuste só de nome: 409, nada gravado, e camadas e contrato ficam da MESMA versão (a da equipe)', async () => {
    banco.duranteOAjuste = () => editarNoEditor('Almoço executivo de sexta')
    const carimboDaEquipe = () => banco.pagina.updatedAt.getTime()

    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' }))
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('PAGINA_MUDOU_DURANTE_O_AJUSTE')
    expect((erro as CreativeError).status).toBe(409)
    expect((erro as CreativeError).details).toMatchObject({ ajusteGravado: false })
    // A mensagem não convida a repetir na hora: manda rever a arte e confirmar com a pessoa.
    expect((erro as CreativeError).message).toMatch(/Não repita o ajuste direto/)
    expect((erro as CreativeError).message).toMatch(/confirme/)

    // A edição da equipe ficou inteira: camadas Y, contrato Y, e nada do ajuste (nem o nome).
    expect(manchete()).toBe('Almoço executivo de sexta')
    expect(copyAutoralDaPagina(banco.pagina.copyAutoral)!.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Almoço executivo de sexta'])
    expect(banco.pagina.name).toBe('Peça do chat')
    expect(banco.pagina.updatedAt.getTime()).toBe(carimboDaEquipe())
    expect(banco.generations).toHaveLength(0)

    // O contrato descreve as camadas: a próxima escrita da equipe (mover uma caixa) não vira revisão autoral dela.
    const movidas = (banco.pagina.layers as Array<Record<string, any>>).map((l) => (l.id === 'cta' ? { ...l, position: { x: 140, y: 1680 } } : l))
    expect(revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, movidas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' }).estado).toBe('sem-mudanca')
  })

  it('vale também para página SEM contrato: a edição da equipe não é apagada em silêncio', async () => {
    banco.pagina = paginaInicial(false)
    banco.duranteOAjuste = () => editarNoEditor('Almoço executivo de sexta')
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' }))
    expect((erro as CreativeError).code).toBe('PAGINA_MUDOU_DURANTE_O_AJUSTE')
    expect(manchete()).toBe('Almoço executivo de sexta')
    expect(banco.pagina.copyAutoral).toBeNull()
  })

  it('só o CONTRATO muda no meio (conteúdo idêntico): 409 — o que foi decidido contra a leitura não vale mais', async () => {
    const contratoNovo = serializarCopyAutoral({ ...contratoX, origem: { ...contratoX.origem, em: '2026-09-12T11:00:00.000Z' } })
    banco.duranteOAjuste = () => {
      banco.pagina = { ...banco.pagina, copyAutoral: contratoNovo, updatedAt: new Date(++banco.relogio) }
    }
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' }))
    expect((erro as CreativeError).code).toBe('PAGINA_MUDOU_DURANTE_O_AJUSTE')
    expect(banco.pagina.name).toBe('Peça do chat')
    expect(banco.pagina.copyAutoral).toBe(contratoNovo)
    expect(banco.generations).toHaveLength(0)
  })

  it('controle: a escrita concorrente que só troca a MINIATURA (autosave do editor aberto) não derruba o ajuste — o conteúdo lido continua valendo', async () => {
    banco.duranteOAjuste = () => {
      banco.pagina = { ...banco.pagina, thumbnail: 'data:image/jpeg;base64,AAAA', updatedAt: new Date(++banco.relogio) }
    }
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' })
    expect(banco.pagina.name).toBe('Novo nome')
    expect(manchete()).toBe('Almoço executivo')
    expect(copyAutoralDaPagina(banco.pagina.copyAutoral)!.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Almoço executivo'])
    expect(banco.pagina.thumbnail).toBe(r.url)
    expect(banco.generations).toHaveLength(1)
  })

  it('controle: sem concorrência o ajuste grava como sempre', async () => {
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' })
    expect(banco.pagina.name).toBe('Novo nome')
    expect(banco.pagina.thumbnail).toBe(r.url)
    expect(banco.generations).toHaveLength(1)
  })
})

describe('C3-12 — a página promovida a MODELO durante o ajuste não é gravada', () => {
  /** "Marcar modelo" no editor (`db.page.update`, move o carimbo) — ou um escritor que NÃO o move. */
  const promover = (moverCarimbo: boolean) => () => {
    banco.pagina = { ...banco.pagina, isTemplate: true, ...(moverCarimbo ? { updatedAt: new Date(++banco.relogio) } : {}) }
  }

  function esperarNadaGravado() {
    expect(banco.pagina.isTemplate).toBe(true)
    expect(banco.pagina.name).toBe('Peça do chat')
    expect(banco.pagina.thumbnail).toBe('https://blob.test/render-anterior.png')
    expect((banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === 'headline')!.position.y).toBe(1500)
    expect(banco.generations).toHaveLength(0)
  }

  it.each([
    ['move o carimbo (a releitura enxerga)', true],
    ['não move o carimbo (o `where` da escrita segura)', false],
  ])('sem versaoEsperada, a promoção %s: PAGINA_E_MODELO, nada gravado', async (_rotulo, moverCarimbo) => {
    banco.duranteOAjuste = promover(moverCarimbo)
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', name: 'Novo nome' }))
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('PAGINA_E_MODELO')
    expect((erro as CreativeError).status).toBe(400)
    esperarNadaGravado()
  })

  it.each([
    ['move o carimbo', true],
    ['não move o carimbo', false],
  ])('com versaoEsperada (ajuste do revisor), a promoção %s: PAGINA_E_MODELO, nada gravado', async (_rotulo, moverCarimbo) => {
    const v0 = versaoDaPagina(banco.pagina)!
    banco.duranteOAjuste = promover(moverCarimbo)
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v0, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -10 }] }))
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('PAGINA_E_MODELO')
    esperarNadaGravado()
  })

  it('controle: com versaoEsperada e uma edição comum no meio, a recusa continua sendo VERSAO_DIVERGENTE', async () => {
    const v0 = versaoDaPagina(banco.pagina)!
    banco.duranteOAjuste = () => editarNoEditor('Almoço executivo de sexta')
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v0, ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -10 }] }))
    expect((erro as CreativeError).code).toBe('VERSAO_DIVERGENTE')
    expect(manchete()).toBe('Almoço executivo de sexta')
  })
})
