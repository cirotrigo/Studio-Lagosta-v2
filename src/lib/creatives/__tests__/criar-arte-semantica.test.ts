/**
 * B1c: `createArteRapida` é o ÚNICO ponto que converte copy em valores de camada, e o faz contra a
 * página EFETIVA (depois da troca de layout pela foto). `_slots`/`_papeis` resolvem na mesma página,
 * por índice, e tudo o que pode recusar recusa ANTES de criar o template, persistir ou renderizar.
 *
 * Banco em memória; persistência, halo, autofix e medição falsos — o que importa aqui é o que chega
 * ao `bakeLayers` e ao `persistAndRenderCreative`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  paginas: new Map<string, any>(),
  /** Página que a foto escolhe (família "(3 layouts)"); null = a pedida. */
  irma: null as null | string,
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: vi.fn(async () => ({ id: 8, name: 'Bacana', userId: 'dono' })) },
    page: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => estado.paginas.get(where.id) ?? null) },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/persist', () => ({
  ARTE_TEMPLATE_NAMES: ['Arte Rápida'],
  getPublicAppUrl: () => 'https://app.test',
  renderPageAndRegister: vi.fn(),
  ensureArteTemplate: vi.fn(async () => ({ id: 500, name: 'Arte Rápida' })),
  resolveImageUrl: vi.fn(async (url?: string, drive?: string | null) => ({ url: url ?? (drive ? `https://drive.test/${drive}` : null) })),
  persistAndRenderCreative: vi.fn(async () => ({ generationId: 'g1', pageId: 'nova', templateId: 500, url: 'u', editUrl: 'e', galleryUrl: 'g', width: 1080, height: 1920, sizeKB: 1 })),
}))
vi.mock('@/lib/creatives/halo/integracao-arte-rapida', () => ({
  lerFotoParaMedicao: vi.fn(async () => null),
  escolherPaginaPelaFoto: vi.fn(async () => (estado.irma ? { pagina: { id: estado.irma }, layout: 'topo', motivo: 'teste' } : null)),
  aplicarHaloNaArte: vi.fn(async ({ layers }: { layers: unknown[] }) => ({ layers, aplicado: false, blocos: 0, avisos: [], halos: [], corDaMancha: null })),
}))
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: vi.fn(async ({ layers }: { layers: unknown[] }) => ({ layers, autocorrecao: { aplicada: false }, avisos: [] })),
}))
vi.mock('@/lib/combo-stack-reflow', () => ({ reflowLayersAfterFill: (l: unknown[]) => l }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: vi.fn(async () => undefined) }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextMeasurer: vi.fn(async () => () => 100) }))
vi.mock('@/lib/aprendizado/uso-de-modelo', () => ({ registrarUsoDeModelo: vi.fn(async () => undefined) }))
vi.mock('@/lib/aprendizado/sinal-de-modelo', () => ({ registrarSugestaoDeModelo: vi.fn(), fecharSugestaoDeModelo: vi.fn(async () => undefined) }))
vi.mock('@/lib/aprendizado/sinal-de-foto', () => ({ fecharSugestaoDeFoto: vi.fn(async () => undefined) }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: vi.fn(async () => undefined) }))

import { createArteRapida } from '../arte-rapida'
import { ensureArteTemplate, persistAndRenderCreative } from '@/lib/creatives/persist'

const texto = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, type: 'text', content: `modelo ${id}`, visible: true, ...extra })
const declarada = (papel: string, slot: string) => ({ metadata: { compositor: { papel }, slot: { id: slot } } })
const foto = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: 'Foto', type: 'image', isDynamic: true, visible: true, ...extra })

function pagina(id: string, layers: unknown[]) {
  return { id, name: `Página ${id}`, width: 1080, height: 1920, background: null, tags: [], layers, Template: { id: 10, name: 'Stories (3 layouts)', projectId: 8, type: 'STORY', dimensions: '1080x1920', tags: [] } }
}

// A pedida e a irmã que a foto escolhe: MESMA estrutura, layer.id DIFERENTES (as famílias 207 e 308 de produção).
const PEDIDA = [texto('a-h', 'Título', declarada('headline', 'manchete')), texto('a-s', 'Horário', declarada('servico', 'horario')), foto('a-img', declarada('foto', 'foto-principal'))]
const IRMA = [texto('b-h', 'Título', declarada('headline', 'manchete')), texto('b-s', 'Horário', declarada('servico', 'horario')), foto('b-img', declarada('foto', 'foto-principal'))]

const contrato = (blocos: Array<{ id: string; funcao: string; linhas: string[] }>) => ({
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  blocos: blocos.map((b, ordem) => ({ ...b, ordem })),
  revisoes: [],
})
const SO_MANCHETE = contrato([{ id: 'h', funcao: 'headline', linhas: ['Noite do vinho'] }])

const persistido = () => (persistAndRenderCreative as any).mock.calls.at(-1)?.[0]
const conteudo = (id: string) => persistido().layers.find((l: any) => l.id === id)

async function falha(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e as { code: string; status: number; message: string; details?: any }
  }
  throw new Error('não lançou')
}

/** Nada de efeito colateral: nem template criado, nem página persistida/renderizada. */
function semEfeito() {
  expect(ensureArteTemplate).not.toHaveBeenCalled()
  expect(persistAndRenderCreative).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.paginas = new Map([
    ['p-a', pagina('p-a', PEDIDA)],
    ['p-b', pagina('p-b', IRMA)],
  ])
  estado.irma = null
})

describe('A. a copy é casada contra a página EFETIVA', () => {
  it('a foto troca para a irmã: o contrato cai nos ids da IRMÃ, e o campo não coberto sai oculto', async () => {
    estado.irma = 'p-b'
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _imageUrl: 'https://f' }, copyAutoral: SO_MANCHETE })
    expect(conteudo('b-h').content).toBe('Noite do vinho')
    expect(conteudo('b-s').visible).toBe(false)
    expect(persistido().fieldValues.slotValues).toMatchObject({ 'b-h': { content: 'Noite do vinho', bloco: 'h' }, 'b-s': { hidden: true } })
    expect(Object.keys(persistido().fieldValues.slotValues)).not.toContain('a-h')
  })

  it('posicional (executor): mesma regra, e os [colchetes] saem', async () => {
    estado.irma = 'p-b'
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _imageUrl: 'https://f' }, copyPosicional: ['Noite do [vinho]'] })
    expect(conteudo('b-h').content).toBe('Noite do vinho')
    expect(conteudo('b-s').visible).toBe(false)
  })

  it('os avisos do casamento voltam na arte', async () => {
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyAutoral: SO_MANCHETE })
    expect(r.avisos?.some((a) => a.includes('ficou oculto'))).toBe(true)
  })
})

describe('B/C. copy que não cabe no modelo recusa — nunca some', () => {
  it('contrato com bloco sem campo: COPY_NAO_CASA_COM_O_MODELO 422, sem texto da copy nos detalhes', async () => {
    const c = contrato([
      { id: 'h', funcao: 'headline', linhas: ['Noite do vinho'] },
      { id: 's', funcao: 'servico', linhas: ['Sex 19h'] },
      { id: 'x', funcao: 'cta', linhas: ['Reserve já'] },
    ])
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyAutoral: c }))
    expect(e).toMatchObject({ code: 'COPY_NAO_CASA_COM_O_MODELO', status: 422, details: { pageId: 'p-a', quantidade: 1, blockIds: ['x'] } })
    expect(JSON.stringify(e.details)).not.toContain('Reserve')
    semEfeito()
  })

  it('posicional com sobra: 422 com as posições', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyPosicional: ['um', 'dois', 'três'] }))
    expect(e).toMatchObject({ code: 'COPY_NAO_CASA_COM_O_MODELO', status: 422, details: { pageId: 'p-a', quantidade: 1, semCampo: [2] } })
    semEfeito()
  })

  it('posicional sem texto: a arte sai com os textos do modelo (como antes)', async () => {
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyPosicional: [] })
    expect(conteudo('a-h').content).toBe('modelo a-h')
    expect(conteudo('a-s').visible).toBe(true)
  })
})

describe('D. entradas que se excluem', () => {
  it('copyAutoral + chave legada de texto: COPY_AUTORAL_COM_CHAVES_LEGADAS, com a mensagem combinada', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { 'a-h': 'Outro' }, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({
      code: 'COPY_AUTORAL_COM_CHAVES_LEGADAS',
      status: 400,
      message: 'Com copyAutoral, não envie texto diretamente por layerId ou nome da camada. Use _slots/_papeis para endereçamento semântico ou apenas controles de imagem.',
      details: { chaves: ['a-h'] },
    })
    semEfeito()
  })

  it('copyAutoral + copyPosicional: 400', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyAutoral: SO_MANCHETE, copyPosicional: ['x'] }))
    expect(e).toMatchObject({ code: 'COPY_DUPLICADA', status: 400 })
  })
})

describe('E. copy e semântica no MESMO campo', () => {
  it('equivalente: sucesso', async () => {
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: 'Noite do vinho' } }, copyAutoral: SO_MANCHETE })
    expect(conteudo('a-h').content).toBe('Noite do vinho')
  })

  it('divergente: VALOR_CONFLITANTE 422, sem efeito', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: 'Outra coisa' } }, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({ code: 'VALOR_CONFLITANTE', status: 422 })
    expect(e.details.erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', layerId: 'a-h' })
    semEfeito()
  })
})

describe('_slots/_papeis sem copy', () => {
  it('resolvem na página EFETIVA (a irmã), por slot e por papel declarado', async () => {
    estado.irma = 'p-b'
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _imageUrl: 'https://f', _slots: { manchete: 'Por slot' }, _papeis: { servico: 'Por papel' } } })
    expect(conteudo('b-h').content).toBe('Por slot')
    expect(conteudo('b-s').content).toBe('Por papel')
  })

  it('slot que não existe: ALVO_NAO_RESOLVIDO 422 antes de qualquer efeito', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { inexistente: 'x' } } }))
    expect(e).toMatchObject({ code: 'ALVO_NAO_RESOLVIDO', status: 422 })
    semEfeito()
  })

  it('_slots malformado: 400 antes de ler a página', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: { hidden: true } } } }))
    expect(e).toMatchObject({ code: 'VALOR_INVALIDO', status: 400 })
    semEfeito()
  })
})

describe('H–M. copy como autoridade textual e compatibilidade com a camada', () => {
  it('H. texto NÃO coberto pela copy + _slots: VALOR_FORA_DA_COPY_AUTORAL', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { horario: 'Sex 19h' } }, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({ code: 'VALOR_FORA_DA_COPY_AUTORAL', status: 422, details: { layerIds: ['a-s'] } })
    semEfeito()
  })

  it('H. também no posicional', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _papeis: { servico: 'Sex 19h' } }, copyPosicional: ['Noite do vinho'] }))
    expect(e).toMatchObject({ code: 'VALOR_FORA_DA_COPY_AUTORAL', status: 422 })
  })

  it('I. imagem não coberta + _slots.fileUrl: permitido (e o oculto continua oculto)', async () => {
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { 'foto-principal': { fileUrl: 'https://pedida' } } }, copyAutoral: SO_MANCHETE })
    expect(conteudo('a-img').fileUrl).toBe('https://pedida')
    expect(conteudo('a-s').visible).toBe(false)
  })

  it('J. fileUrl em texto: VALOR_INCOMPATIVEL_COM_CAMADA', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: { fileUrl: 'https://x' } } } }))
    expect(e).toMatchObject({ code: 'VALOR_INCOMPATIVEL_COM_CAMADA', status: 422 })
    expect(e.details.erros[0]).toEqual({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: 'a-h', type: 'text', origem: { tipo: 'slotId', chave: 'manchete' }, efeito: 'fileUrl' })
  })

  it('K. content em imagem: VALOR_INCOMPATIVEL_COM_CAMADA', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { 'foto-principal': 'texto' } } }))
    expect(e).toMatchObject({ code: 'VALOR_INCOMPATIVEL_COM_CAMADA', status: 422 })
  })

  it('L. content + fileUrl: VALOR_INCOMPATIVEL_COM_CAMADA', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: { content: 'a', fileUrl: 'https://x' } } } }))
    expect(e).toMatchObject({ code: 'VALOR_INCOMPATIVEL_COM_CAMADA', status: 422 })
  })

  it('M. nenhuma recusa de compatibilidade cria template, persiste ou renderiza', async () => {
    await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: { fileUrl: 'https://x' } } } }))
    semEfeito()
  })
})

describe('chamador legado (sem copy, sem _slots/_papeis): nada muda', () => {
  it('o slotValues gravado é o recebido, e o preenchimento é o de sempre', async () => {
    const slotValues = { 'a-h': 'Legado', Horário: { content: 'pelo nome' }, _driveImageId: 'd1' }
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues })
    expect(persistido().fieldValues.slotValues).toBe(slotValues)
    expect(conteudo('a-h').content).toBe('Legado')
    expect(conteudo('a-s').content).toBe('pelo nome')
    expect(conteudo('a-img').fileUrl).toBe('https://drive.test/d1')
  })
})

describe('posicional também não aceita texto legado ao lado', () => {
  it('copyPosicional + chave de texto: 400, nada some em silêncio debaixo do oculto', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { 'a-s': 'Sex 19h' }, copyPosicional: ['Noite do vinho'] }))
    expect(e).toMatchObject({ code: 'COPY_AUTORAL_COM_CHAVES_LEGADAS', status: 400, details: { chaves: ['a-s'] } })
    semEfeito()
  })
})

describe('a promessa do escolher-modelo é a capacidade da criação (addressableBy ponta a ponta)', () => {
  const MODELO = [
    texto('t-h', 'Título', declarada('headline', 'manchete')),
    texto('t-1', 'Endereço', declarada('servico', 'endereco')),
    texto('t-2', 'Horário', declarada('servico', 'horario')),
    texto('t-x', 'Texto livre'),
    foto('t-img', declarada('foto', 'foto-principal')),
    texto('t-o', 'Oculto', { ...declarada('cta', 'oculto'), visible: false }),
  ]

  it('todo endereço anunciado é aceito e a camada CERTA recebe; o não anunciado falha explícito', async () => {
    estado.paginas.set('p-n', pagina('p-n', MODELO))
    const { analisarSlotFields } = await import('../slot-fields')
    const campos = analisarSlotFields(MODELO).slotFields
    let anunciados = 0
    for (const f of campos) {
      for (const via of f.semantic.addressableBy) {
        anunciados++
        const valor = f.type === 'image' ? { fileUrl: `https://${f.layerId}` } : `novo ${f.layerId}`
        const slotValues =
          via === 'layerId' ? { [f.layerId]: valor } : via === 'slotId' ? { _slots: { [f.semantic.slot.id!]: valor } } : { _papeis: { [f.semantic.role.value!]: valor } }
        await createArteRapida({ projectId: 8, sourcePageId: 'p-n', slotValues })
        const recebeu = conteudo(f.layerId)
        expect(f.type === 'image' ? recebeu.fileUrl : recebeu.content).toBe(f.type === 'image' ? `https://${f.layerId}` : `novo ${f.layerId}`)
        // e só ela: as outras camadas de texto ficam como no modelo
        for (const outra of persistido().layers.filter((l: any) => l.id !== f.layerId && l.type === 'text')) expect(outra.content).toBe(`modelo ${outra.id}`)
      }
    }
    expect(anunciados).toBe(11)
    // servico é ambíguo (não anunciado): pedir por papel falha explícito, sem efeito
    vi.clearAllMocks()
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-n', slotValues: { _papeis: { servico: 'x' } } }))
    expect(e.status).toBe(422)
    semEfeito()
  })
})
