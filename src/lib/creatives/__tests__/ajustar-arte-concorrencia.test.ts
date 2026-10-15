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
// CP4: a não-piora (medir antes → aplicar em memória → medir depois) é provada em
// `direcao-de-arte/__tests__/piloto-ciclo.test.ts` com o renderer REAL. Aqui o renderer é FALSO — a medida não
// teria o que medir e recusaria tudo por `AJUSTE_NAO_MEDIDO` —, e o que este arquivo prova é a CORRIDA e a
// escrita de `ajustarArte`: o executor vira o puro (`aplicarAjustes`), aceitando o que for estrutural.
vi.mock('@/lib/creatives/revisao/ajustar-sem-piorar', async () => {
  const { aplicarAjustes } = await import('@/lib/creatives/revisao/aplicar-ajustes')
  const vazio = { achados: 0, problemas: 0, naoAvaliadas: [] as string[] }
  return {
    aplicarAjustesSemPiorar: async (a: { page: { width: number; height: number }; camadas: unknown[]; ajustes: unknown[]; medir: unknown }) => ({
      ...aplicarAjustes(a.camadas as never, a.ajustes as never, { canvas: { width: a.page.width, height: a.page.height }, medir: a.medir as never }),
      medidas: { antes: vazio, depois: vazio },
    }),
  }
})
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

describe('página com vídeo é recusada ANTES de qualquer escrita (2ª revisão do Codex, 02/10/2026)', () => {
  const video = (visible: boolean) => ({ id: 'video-1', name: 'Vídeo', type: 'video', visible, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://blob.test/fundo.mp4', videoMetadata: {} })

  it('ajustarArte: 422 PAGINA_COM_VIDEO, e a página fica exatamente como estava (camadas, miniatura e carimbo)', async () => {
    banco.pagina = { ...paginaInicial(false), layers: [video(true), texto('headline', 1500, 'Almoço executivo')] }
    const antes = JSON.stringify(banco.pagina)

    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { headline: 'Almoço de sexta' } }))
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('PAGINA_COM_VIDEO')
    expect((erro as CreativeError).status).toBe(422)
    expect(JSON.stringify(banco.pagina)).toBe(antes)
    expect(banco.generations).toHaveLength(0)
  })

  it('controle: vídeo OCULTO não entra na imagem, e o ajuste segue', async () => {
    banco.pagina = { ...paginaInicial(false), layers: [video(false), texto('headline', 1500, 'Almoço executivo')] }
    await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { headline: 'Almoço de sexta' } })
    expect(manchete()).toBe('Almoço de sexta')
    expect(banco.generations).toHaveLength(1)
  })

  it('persistAndRenderCreative: recusa antes de criar a página (o banco falso nem tem page.create)', async () => {
    const { persistAndRenderCreative } = await import('../persist')
    const erro = await erroDe(
      persistAndRenderCreative({
        project: { id: 8, name: 'Lagosta Criativa', userId: 'dono-interno' },
        templateId: 77,
        templateName: 'Arte Rápida',
        pageName: 'Peça',
        width: 1080,
        height: 1920,
        layers: [video(true)],
        fieldValues: {},
        authorName: 'teste',
      } as never),
    )
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('PAGINA_COM_VIDEO')
    expect(banco.generations).toHaveLength(0)
  })
})

describe('B1c — _slots/_papeis em ajustarArte, sobre as camadas da própria página', () => {
  const comSlot = () => {
    banco.pagina = {
      ...banco.pagina,
      layers: (banco.pagina.layers as Array<Record<string, any>>).map((l) =>
        l.id === 'headline' ? { ...l, metadata: { ...l.metadata, slot: { id: 'manchete' } } } : l,
      ),
    }
  }

  it('_slots preenche a camada do slot', async () => {
    comSlot()
    await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { _slots: { manchete: 'Almoço de sexta' } } })
    expect(manchete()).toBe('Almoço de sexta')
  })

  it('_papeis preenche a camada com o papel DECLARADO', async () => {
    await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { _papeis: { headline: 'Almoço de sábado' } } })
    expect(manchete()).toBe('Almoço de sábado')
  })

  it('valor incompatível: 422 antes de resolver a foto e de qualquer escrita', async () => {
    comSlot()
    const antes = banco.pagina.updatedAt.getTime()
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { _imageUrl: 'https://f', _slots: { manchete: { fileUrl: 'https://x' } } } }))
    expect((erro as CreativeError).code).toBe('VALOR_INCOMPATIVEL_COM_CAMADA')
    expect((erro as CreativeError).status).toBe(422)
    expect(banco.pagina.updatedAt.getTime()).toBe(antes)
    expect(banco.generations).toHaveLength(0)
    expect(banco.putSeq).toBe(0)
  })

  it('slot legado pelo id e _slots divergentes no mesmo campo: VALOR_CONFLITANTE, nada gravado', async () => {
    comSlot()
    const erro = await erroDe(ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { headline: 'A', _slots: { manchete: 'B' } } }))
    expect((erro as CreativeError).code).toBe('VALOR_CONFLITANTE')
    expect(banco.generations).toHaveLength(0)
  })
})

describe('B1c (codex review) — fileUrl explícito não é sobrescrito pelo fallback da foto genérica', () => {
  it('_slots com {fileUrl} na única imagem + imageUrl: a imagem fica com a URL pedida', async () => {
    banco.pagina = {
      ...banco.pagina,
      layers: [
        ...(banco.pagina.layers as unknown[]),
        { id: 'img', name: 'Foto', type: 'image', visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://blob.test/antiga.jpg', metadata: { slot: { id: 'foto' } } },
      ],
    }
    await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues: { _slots: { foto: { fileUrl: 'https://blob.test/pedida.jpg' } } } })
    expect((banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === 'img')!.fileUrl).toBe('https://blob.test/pedida.jpg')
  })
})

describe('Codex #208 — fallback da foto genérica só no FUNDO (a primeira imagem), nunca na logo', () => {
  const img = (id: string, fileUrl: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'image', visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, fileUrl, ...extra })
  const comFundoELogo = () => {
    banco.pagina = {
      ...banco.pagina,
      layers: [img('fundo', 'https://blob.test/fundo-antigo.jpg', { metadata: { slot: { id: 'fundo' } } }), img('logo', 'https://blob.test/logo.png'), ...(banco.pagina.layers as unknown[])],
    }
  }
  const camada = (id: string) => (banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === id)!

  it('_slots com {fileUrl} no fundo + imageUrl: o fundo fica com a pedida, a logo intacta, imageApplied false e aviso', async () => {
    comFundoELogo()
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues: { _slots: { fundo: { fileUrl: 'https://blob.test/pedida.jpg' } } } })
    expect(camada('fundo').fileUrl).toBe('https://blob.test/pedida.jpg')
    expect(camada('logo').fileUrl).toBe('https://blob.test/logo.png')
    expect(r.imageApplied).toBe(false)
    expect(r.imageWarning).toMatch(/não foi aplicada/)
  })

  it('fileUrl LEGADO por layerId no fundo + imageUrl: mesma regra', async () => {
    comFundoELogo()
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues: { fundo: { fileUrl: 'https://blob.test/pedida.jpg' } } })
    expect(camada('fundo').fileUrl).toBe('https://blob.test/pedida.jpg')
    expect(camada('logo').fileUrl).toBe('https://blob.test/logo.png')
    expect(r.imageApplied).toBe(false)
    expect(r.imageWarning).toMatch(/não foi aplicada/)
  })

  it('sem fileUrl explícito: a foto genérica vai para o fundo, como sempre', async () => {
    comFundoELogo()
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg' })
    expect(camada('fundo').fileUrl).toBe('https://blob.test/generica.jpg')
    expect(camada('logo').fileUrl).toBe('https://blob.test/logo.png')
    expect(r.imageApplied).toBe(true)
  })
})

it('Codex #208 — fallback: _papeis {foto: {fileUrl}} no fundo + imageUrl: logo intacta', async () => {
  const img = (id: string, fileUrl: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'image', visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, fileUrl, ...extra })
  banco.pagina = { ...banco.pagina, layers: [img('fundo', 'https://blob.test/fundo-antigo.jpg', { metadata: { compositor: { papel: 'foto' } } }), img('logo', 'https://blob.test/logo.png'), ...(banco.pagina.layers as unknown[])] }
  const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues: { _papeis: { foto: { fileUrl: 'https://blob.test/pedida.jpg' } } } })
  const camada = (id: string) => (banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === id)!
  expect(camada('fundo').fileUrl).toBe('https://blob.test/pedida.jpg')
  expect(camada('logo').fileUrl).toBe('https://blob.test/logo.png')
  expect(r.imageApplied).toBe(false)
})

describe('opção C (#208) no AJUSTE: fileUrl semântico no primeiro alvo não deixa a foto escorrer', () => {
  const dyn = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'image', isDynamic: true, visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, ...extra })
  const camada = (id: string) => (banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === id)!
  const duasFotos = () => {
    banco.pagina = { ...banco.pagina, layers: [dyn('bg', { metadata: { compositor: { papel: 'foto' }, slot: { id: 'fundo' } } }), dyn('segunda'), ...(banco.pagina.layers as unknown[])] }
  }

  it.each([
    ['_slots', { _slots: { fundo: { fileUrl: 'https://blob.test/semantica.jpg' } } }],
    ['_papeis', { _papeis: { foto: { fileUrl: 'https://blob.test/semantica.jpg' } } }],
  ])('%s no fundo + imageUrl: segunda intacta, imageApplied false, aviso com a causa', async (_n, slotValues) => {
    duasFotos()
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues })
    expect(camada('bg').fileUrl).toBe('https://blob.test/semantica.jpg')
    expect(camada('segunda').fileUrl).toBeUndefined()
    expect(r.imageApplied).toBe(false)
    expect(r.imageWarning).toMatch(/_slots\/_papeis/)
  })

  it('LEGADO por layerId no fundo: a genérica cai na segunda, como sempre', async () => {
    duasFotos()
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', imageUrl: 'https://blob.test/generica.jpg', slotValues: { bg: { fileUrl: 'https://blob.test/legado.jpg' } } })
    expect([camada('bg').fileUrl, camada('segunda').fileUrl]).toEqual(['https://blob.test/legado.jpg', 'https://blob.test/generica.jpg'])
    expect(r.imageApplied).toBe(true)
  })
})

describe('CP4.1 — o agente autônomo (draft-only) não apaga copy pelo slotValues; o humano pode, e fica auditado', () => {
  const cta = () => (banco.pagina!.layers as Array<Record<string, any>>).find((l) => l.id === 'cta')!
  const comSlot = () => {
    banco.pagina = {
      ...banco.pagina,
      layers: (banco.pagina.layers as Array<Record<string, any>>).map((l) => (l.id === 'headline' ? { ...l, metadata: { ...l.metadata, slot: { id: 'manchete' } } } : l)),
    }
  }
  const intacto = async (chamada: Promise<unknown>, operacao: 'escondido' | 'esvaziado' | 'sem-conteudo', endereco: { tipo: string; chave: string }, layerId = 'cta', chave = layerId) => {
    const antes = banco.pagina.updatedAt.getTime()
    const erro = (await erroDe(chamada)) as CreativeError
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro.code).toBe('CONTEUDO_NAO_PODE_SER_REMOVIDO')
    expect(erro.status).toBe(422)
    expect(erro.details).toMatchObject({ ajusteGravado: false, copyRemovida: [{ layerId, chave, operacao, tinhaConteudo: true, endereco }] })
    // Sem o texto integral nos details; a mensagem diz o nome da camada e a operação.
    expect(JSON.stringify(erro.details)).not.toContain('Reserve pelo direct')
    expect(erro.message).toMatch(new RegExp(`"${chave}" seria ${operacao === 'sem-conteudo' ? 'reduzido a pontuação sem conteúdo' : operacao}`))
    // 11/12: nenhuma escrita, nenhuma Generation, nenhum render/Blob.
    expect(banco.pagina.updatedAt.getTime()).toBe(antes)
    expect(cta().visible).not.toBe(false)
    expect(cta().content).toBe('Reserve pelo direct')
    expect(banco.generations).toHaveLength(0)
    expect(banco.putSeq).toBe(0)
  }

  it('1. draft-only: `{ cta: { hidden: true } }` sobre texto com conteúdo → recusado, nada gravado', async () => {
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: { hidden: true } } }), 'escondido', { tipo: 'layerId', chave: 'cta' })
  })
  it('2. draft-only: `{ cta: "" }` → recusado (esvaziado)', async () => {
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: '' } }), 'esvaziado', { tipo: 'layerId', chave: 'cta' })
  })
  it('3. draft-only: `{ cta: { content: "   " } }` (só espaço) → recusado (esvaziado)', async () => {
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: { content: '   ' } } }), 'esvaziado', { tipo: 'layerId', chave: 'cta' })
  })
  it('4. draft-only: `_slots` que resolve para vazio → recusado, com o endereço do slot', async () => {
    comSlot()
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { _slots: { manchete: '' } } }), 'esvaziado', { tipo: 'slotId', chave: 'manchete' }, 'headline')
  })
  it('5. draft-only: `_papeis` equivalente → recusado, com o endereço do papel', async () => {
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { _papeis: { headline: ' ' } } }), 'esvaziado', { tipo: 'semanticRole', chave: 'headline' }, 'headline')
  })
  it('4b. draft-only: pela chave de NOME (atinge toda camada com esse nome) → recusado, endereço `name`', async () => {
    banco.pagina = { ...banco.pagina, layers: (banco.pagina.layers as Array<Record<string, any>>).map((l) => (l.id === 'cta' ? { ...l, name: 'Chamada' } : l)) }
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { Chamada: { hidden: true } } }), 'escondido', { tipo: 'name', chave: 'Chamada' }, 'cta', 'Chamada')
  })
  it('6. draft-only: trocar "Texto A" por "Texto B" → permitido, sujeito aos gates normais; sem `copyRemovida`', async () => {
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: 'Reserve pelo WhatsApp' } })
    expect(cta().content).toBe('Reserve pelo WhatsApp')
    expect(r.camposAlterados).toEqual(['cta'])
    expect(r.copyRemovida).toBeUndefined()
    expect((banco.generations.at(-1)!.fieldValues as Record<string, unknown>).copyRemovida).toBeUndefined()
  })
  it('7. draft-only: esconder um slot de texto que JÁ estava vazio → segue o contrato de sempre (entra)', async () => {
    banco.pagina = { ...banco.pagina, layers: [...(banco.pagina.layers as Array<Record<string, any>>), texto('badge', 200, '   ')] }
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { badge: { hidden: true } } })
    expect(r.ajustada).toBe(true)
    expect((banco.pagina.layers as Array<Record<string, any>>).find((l) => l.id === 'badge')!.visible).toBe(false)
    expect(r.copyRemovida).toBeUndefined()
  })
  it('8/10. humano: `hidden: true` em texto com conteúdo continua permitido — e a procedência registra "escondido" (retorno e Generation)', async () => {
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { cta: { hidden: true } } })
    expect(cta().visible).toBe(false)
    const registro = { layerId: 'cta', chave: 'cta', operacao: 'escondido', endereco: { tipo: 'layerId', chave: 'cta' }, tinhaConteudo: true }
    expect(r.copyRemovida).toEqual([registro])
    expect((banco.generations.at(-1)!.fieldValues as Record<string, any>).copyRemovida).toEqual([registro])
    // "conteúdo alterado" é outra coisa: a camada escondida não é texto alterado.
    expect(r.camposAlterados).toEqual([])
  })
  it('9/10. humano: conteúdo → "" continua permitido — e a procedência distingue "esvaziado" de "alterado"', async () => {
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { cta: '', headline: 'Jantar executivo' } })
    expect(cta().content).toBe('')
    expect(r.copyRemovida).toEqual([{ layerId: 'cta', chave: 'cta', operacao: 'esvaziado', endereco: { tipo: 'layerId', chave: 'cta' }, tinhaConteudo: true }])
    // "alterado" é texto trocado por OUTRO texto: o esvaziado não entra em camposAlterados.
    expect(r.camposAlterados).toEqual(['headline'])
  })
  // Ajuste final do owner (15/10): trocar a copy por PONTUAÇÃO é apagar com outra sintaxe.
  it('S1–S3. draft-only: "Texto real" → "." / "..." / "—" (e "___", "!!!", "()", "/", "•••") → recusado como sem-conteudo, nada gravado', async () => {
    for (const pontuacao of ['.', '...', '—', '___', '!!!', '()', '/', '•••', ' - ', '…']) {
      await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: pontuacao } }), 'sem-conteudo', { tipo: 'layerId', chave: 'cta' })
    }
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: { content: '.' } } }), 'sem-conteudo', { tipo: 'layerId', chave: 'cta' })
  })
  it('S5. draft-only: via `_slots` → "." → recusado, endereço do slot', async () => {
    comSlot()
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { _slots: { manchete: '.' } } }), 'sem-conteudo', { tipo: 'slotId', chave: 'manchete' }, 'headline')
  })
  it('S6. draft-only: via `_papeis` → "-" → recusado, endereço do papel', async () => {
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { _papeis: { headline: '-' } } }), 'sem-conteudo', { tipo: 'semanticRole', chave: 'headline' }, 'headline')
  })
  it('S7–S9. draft-only: "Texto real" → "11h30" / "🍷" / "Novo texto!" / "R$ 79" / "50% OFF" → permitido (conteúdo substantivo), sem copyRemovida', async () => {
    for (const novo of ['11h30', '🍷', 'Novo texto!', 'R$ 79', '50% OFF', '🇧🇷']) {
      const r = await ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: novo } })
      expect(cta().content).toBe(novo)
      expect(r.copyRemovida).toBeUndefined()
      expect(r.camposAlterados).toEqual(['cta'])
      banco.pagina = { ...banco.pagina, layers: (banco.pagina.layers as Array<Record<string, any>>).map((l) => (l.id === 'cta' ? { ...l, content: 'Reserve pelo direct' } : l)) }
    }
  })
  it('S10. origem que JÁ era só pontuação ("-", placeholder decorativo) não vira copy protegida: esconder, esvaziar ou trocar por "." entra', async () => {
    banco.pagina = { ...banco.pagina, layers: [...(banco.pagina.layers as Array<Record<string, any>>), texto('traco', 200, '-')] }
    for (const valor of [{ hidden: true }, '', '.']) {
      const r = await ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { traco: valor } })
      expect(r.ajustada).toBe(true)
      expect(r.copyRemovida).toBeUndefined()
    }
  })
  it('S11. humano: "Texto real" → "." continua permitido — e `copyRemovida` registra "sem-conteudo" (retorno e Generation); não é "alterado"', async () => {
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { cta: '.', headline: 'Jantar executivo' } })
    expect(cta().content).toBe('.')
    const registro = { layerId: 'cta', chave: 'cta', operacao: 'sem-conteudo', endereco: { tipo: 'layerId', chave: 'cta' }, tinhaConteudo: true }
    expect(r.copyRemovida).toEqual([registro])
    expect((banco.generations.at(-1)!.fieldValues as Record<string, any>).copyRemovida).toEqual([registro])
    expect(r.camposAlterados).toEqual(['headline'])
  })
  it('A1. draft-only: texto só de caracteres INVISÍVEIS (zero-width, soft hyphen, braille em branco) é esvaziar com outra sintaxe → recusado', async () => {
    for (const invisivel of ['\u200b', '\u200c\u200d', '\u2060', '\u00ad', '\u2800', ' \u200b ']) {
      await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { cta: invisivel } }), 'esvaziado', { tipo: 'layerId', chave: 'cta' })
    }
  })
  it('A2/A3. draft-only: camada escondida pelo REVISOR (com marca) recebendo `hidden: true` conta como esconder; camada escondida pela PESSOA com conteúdo não pode ser esvaziada', async () => {
    banco.pagina = {
      ...banco.pagina,
      layers: [
        ...(banco.pagina.layers as Array<Record<string, any>>),
        { ...texto('pelo-revisor', 1800, 'Texto que o revisor escondeu'), visible: false, metadata: { revisao: { ocultaPeloRevisor: { em: '2026-10-01T00:00:00.000Z', ajuste: 0 } } } },
        { ...texto('pela-pessoa', 1850, 'Texto que a pessoa escondeu'), visible: false },
      ],
    }
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { 'pelo-revisor': { hidden: true } } }), 'escondido', { tipo: 'layerId', chave: 'pelo-revisor' }, 'pelo-revisor')
    await intacto(ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { 'pela-pessoa': '' } }), 'esvaziado', { tipo: 'layerId', chave: 'pela-pessoa' }, 'pela-pessoa')
    // Esconder de novo o que a pessoa já escondeu não é remoção (já estava escondido, nada muda).
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', apenasRascunho: true, slotValues: { 'pela-pessoa': { hidden: true } } })
    expect(r.copyRemovida).toBeUndefined()
  })
})
