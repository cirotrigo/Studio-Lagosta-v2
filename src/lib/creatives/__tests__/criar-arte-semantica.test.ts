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
  // CP4.2b: ler × persistir separados — o Drive devolve bytes sem `put`; o `put` só acontece em `persistirCacheDoDrive`.
  lerImagemDeEntrada: vi.fn(async (url?: string, drive?: string | null, projectId?: number) => (url ? { url } : drive ? { url: null, drive: { bytes: Buffer.from('jpg'), chave: `chave-${drive}`, projectId } } : { url: null })),
  persistirCacheDoDrive: vi.fn(async (lida: { url: string | null; drive?: { chave: string } }) => ({ url: lida.drive ? `https://drive.test/${lida.drive.chave.replace('chave-', '')}` : lida.url })),
  persistAndRenderCreative: vi.fn(async () => ({ generationId: 'g1', pageId: 'nova', templateId: 500, url: 'u', editUrl: 'e', galleryUrl: 'g', width: 1080, height: 1920, sizeKB: 1 })),
}))
vi.mock('@/lib/creatives/halo/integracao-arte-rapida', () => ({
  lerFotoParaMedicao: vi.fn(async () => null),
  lerFotoDeBytes: vi.fn(async (_bytes: Buffer, _canvas: unknown, url = '') => ({ url, raster: { largura: 10, altura: 10 } })),
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
import { ensureArteTemplate, persistAndRenderCreative, lerImagemDeEntrada, persistirCacheDoDrive } from '@/lib/creatives/persist'
import { aplicarHaloNaArte, escolherPaginaPelaFoto, lerFotoDeBytes } from '@/lib/creatives/halo/integracao-arte-rapida'

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
  it('copyAutoral + chave legada de texto: COPY_COM_CHAVES_LEGADAS, com a mensagem combinada', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { 'a-h': 'Outro' }, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({
      code: 'COPY_COM_CHAVES_LEGADAS',
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
    expect(e).toMatchObject({ code: 'COPY_COM_CHAVES_LEGADAS', status: 400, details: { chaves: ['a-s'] } })
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

describe('revisão adversarial do B1c', () => {
  it('A. campo de texto com id repetido na página: 422 CAMPO_DE_TEXTO_DUPLICADO, nada some', async () => {
    estado.paginas.set('p-d', pagina('p-d', [texto('x', 'A'), texto('y', 'B'), texto('x', 'C')]))
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-d', slotValues: {}, copyPosicional: ['Um', 'Dois'] }))
    expect(e).toMatchObject({ code: 'CAMPO_DE_TEXTO_DUPLICADO', status: 422, details: { pageId: 'p-d', layerIds: ['x'] } })
    semEfeito()
  })

  it('B. campo oculto no modelo não recebe copy: o bloco fica sem campo e a arte recusa', async () => {
    estado.paginas.set('p-o', pagina('p-o', [texto('h', 'Título', { ...declarada('headline', 'm'), visible: false })]))
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-o', slotValues: {}, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({ code: 'COPY_NAO_CASA_COM_O_MODELO', status: 422 })
    semEfeito()
  })

  it('C. _slots numa camada oculta: CAMADA_OCULTA 422', async () => {
    estado.paginas.set('p-o', pagina('p-o', [texto('h', 'Título', { ...declarada('headline', 'm'), visible: false })]))
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-o', slotValues: { _slots: { m: 'novo' } } }))
    expect(e).toMatchObject({ code: 'CAMADA_OCULTA', status: 422 })
    semEfeito()
  })

  it('D. com copy, rich-text que ela não cobre sai oculto (o placeholder não é publicado)', async () => {
    estado.paginas.set('p-r', pagina('p-r', [texto('h', 'Título', declarada('headline', 'm')), { id: 'rt', name: 'Rico', type: 'rich-text', content: 'placeholder rico', visible: true }]))
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-r', slotValues: {}, copyAutoral: SO_MANCHETE })
    expect(conteudo('rt').visible).toBe(false)
    expect(r.avisos?.some((a) => a.includes('Rico'))).toBe(true)
  })

  it('chave com "_" fora das reservadas, com copy: COPY_COM_CHAVES_LEGADAS', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _titulo: 'x' }, copyAutoral: SO_MANCHETE }))
    expect(e).toMatchObject({ code: 'COPY_COM_CHAVES_LEGADAS', details: { chaves: ['_titulo'] } })
  })
})

describe('Codex #208 — CP1: copy posicional VAZIA não é copy (o item sem texto sai com o modelo inteiro)', () => {
  it('copyPosicional: [] não oculta rich-text nem avisa', async () => {
    estado.paginas.set('p-r', pagina('p-r', [texto('h', 'Título', declarada('headline', 'm')), { id: 'rt', name: 'Rico', type: 'rich-text', content: 'Até 15h', visible: true }]))
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-r', slotValues: { _driveImageId: 'd1' }, copyPosicional: [] })
    expect(conteudo('rt').visible).toBe(true)
    expect(conteudo('h').content).toBe('modelo h')
    expect(r.avisos?.some((a) => a.includes('Rico')) ?? false).toBe(false)
  })
})

describe('Codex #208 — CP2: contrato autoral sem texto nenhum não publica o texto do modelo como se fosse a copy', () => {
  it('todos os blocos vazios: COPY_AUTORAL_SEM_TEXTO 422, sem efeito', async () => {
    const vazio = contrato([{ id: 'h', funcao: 'headline', linhas: [] }])
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyAutoral: vazio }))
    expect(e).toMatchObject({ code: 'COPY_AUTORAL_SEM_TEXTO', status: 422 })
    semEfeito()
  })

  it('bloco vazio ao lado de bloco com texto: o campo do vazio sai oculto (não é perda)', async () => {
    const misto = contrato([
      { id: 'h', funcao: 'headline', linhas: ['Noite do vinho'] },
      { id: 's', funcao: 'servico', linhas: [] },
    ])
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: {}, copyAutoral: misto })
    expect(conteudo('a-h').content).toBe('Noite do vinho')
    expect(conteudo('a-s').visible).toBe(false)
  })
})

describe('Codex #208 — CP5 (opção B): com texto semântico, a Generation registra a copy VISUAL das camadas finais', () => {
  const leitores = async () => {
    const { textosDaGeneration } = await import('@/lib/posts/troca-de-arte')
    const { extractExpectedTexts } = await import('@/lib/ai/creative-text-verification')
    const { copyParaDecisao, diffDeCopy } = await import('@/lib/aprendizado/diff-copy')
    const fv = persistido().fieldValues
    const post = textosDaGeneration(fv)
    return { fv, post, conferencia: extractExpectedTexts(fv), diff: diffDeCopy(post, copyParaDecisao(persistido().layers)) }
  }
  const visivelDaPagina = () => persistido().layers.filter((l: any) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false).map((l: any) => l.content).sort()

  it('sem copy: slotValues = o que a página desenha, a entrada fica em slotValuesRecebidos, e não há falso diff', async () => {
    const entrada = { _slots: { manchete: 'Por slot' } }
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: entrada })
    const { fv, post, conferencia, diff } = await leitores()
    expect(fv.slotValuesRecebidos).toEqual(entrada)
    expect(Object.values(post ?? {}).sort()).toEqual(visivelDaPagina())
    expect([...conferencia].sort()).toEqual(visivelDaPagina())
    expect(diff.mudou).toBe(false)
  })

  it('copy casada em id "_x" + _slots equivalente: o texto chega aos leitores', async () => {
    estado.paginas.set('p-u', pagina('p-u', [texto('_x', 'Título', declarada('headline', 'm'))]))
    await createArteRapida({ projectId: 8, sourcePageId: 'p-u', slotValues: { _slots: { m: 'Noite do vinho' } }, copyAutoral: SO_MANCHETE })
    const { fv, post, conferencia } = await leitores()
    expect(post).toEqual({ Título: 'Noite do vinho' })
    expect(conferencia).toEqual(['Noite do vinho'])
    expect(fv.slotValuesRecebidos._x).toMatchObject({ content: 'Noite do vinho', bloco: 'h' })
  })

  it('nomes repetidos e id de uma = nome de outra: todos os textos, uma vez cada, sem falso diff', async () => {
    estado.paginas.set('p-c', pagina('p-c', [
      texto('foo', 'Texto', { metadata: { slot: { id: 's1' } } }),
      texto('b', 'Texto', { metadata: { slot: { id: 's2' } } }),
      texto('c', 'foo', { metadata: { slot: { id: 's3' } } }),
    ]))
    await createArteRapida({ projectId: 8, sourcePageId: 'p-c', slotValues: { _slots: { s1: 'Um', s2: 'Dois', s3: 'Três' } } })
    const { post, conferencia, diff } = await leitores()
    expect(Object.values(post ?? {}).sort()).toEqual(['Dois', 'Três', 'Um'])
    expect([...conferencia].sort()).toEqual(['Dois', 'Três', 'Um'])
    expect(diff.mudou).toBe(false)
  })

  it('valor legado equivalente pelo nome: o texto não duplica', async () => {
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { Título: 'Igual', _slots: { manchete: 'Igual' } } })
    const { post } = await leitores()
    expect(Object.values(post ?? {}).filter((t) => t === 'Igual')).toHaveLength(1)
  })

  it('campo oculto pela copy não aparece na copy registrada', async () => {
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: 'Noite do vinho' } }, copyAutoral: SO_MANCHETE })
    const { post } = await leitores()
    expect(post).toEqual({ Título: 'Noite do vinho' })
  })

  it('semântico só de imagem (checkpoint g): slotValues é a COPY VISUAL das camadas finais (o texto que o modelo mostra); o pedido vai para slotValuesRecebidos', async () => {
    const entrada = { _slots: { 'foto-principal': { fileUrl: 'https://f' } }, _driveImageId: 'd1' }
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: entrada })
    const { copyVisualDasCamadas } = await import('@/lib/creatives/procedencia-da-copy')
    const visual = copyVisualDasCamadas(persistido().layers)
    expect(Object.keys(visual ?? {}).length).toBeGreaterThan(0) // a página mostra texto
    expect(persistido().fieldValues.slotValues).toEqual(visual)
    expect(Object.keys(persistido().fieldValues.slotValues).some((k) => k.startsWith('_'))).toBe(false)
    expect(persistido().fieldValues.slotValuesRecebidos).toBe(entrada)
  })

  it('legado (sem contrato): o registro de sempre — o mesmo objeto, sem slotValuesRecebidos', async () => {
    const entrada = { Título: 'Noite' }
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: entrada })
    expect(persistido().fieldValues.slotValues).toBe(entrada)
    expect(persistido().fieldValues.slotValuesRecebidos).toBeUndefined()
  })

  it('camadas finais alteradas pelo autofix: a copy registrada é a final', async () => {
    const { aplicarAutofixOuFalhar } = await import('@/lib/creatives/text-autofix')
    vi.mocked(aplicarAutofixOuFalhar).mockImplementationOnce(async ({ layers }: any) => ({
      layers: layers.map((l: any) => (l.id === 'a-h' ? { ...l, content: 'Ajustado' } : l)),
      autocorrecao: { aplicada: true } as any,
      avisos: [],
    }))
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _slots: { manchete: 'Por slot' } } })
    const { post } = await leitores()
    expect(Object.values(post ?? {})).toContain('Ajustado')
    expect(Object.values(post ?? {})).not.toContain('Por slot')
  })
})

it('Codex #208 — CP5 (fail-closed): _slots de texto em camada nomeada "_n" recusa antes de qualquer efeito', async () => {
  estado.paginas.set('p-n2', pagina('p-n2', [texto('_x', '_n', { metadata: { slot: { id: 's' } } })]))
  const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-n2', slotValues: { _slots: { s: 'Manchete' } } }))
  expect(e).toMatchObject({ code: 'CHAVE_VISUAL_RESERVADA', status: 422 })
  semEfeito()
})

it('checkpoint g (Codex): pedido semântico só de IMAGEM + texto visível em camada nomeada "_aviso" recusa — a copy visual perderia esse texto', async () => {
  estado.paginas.set('p-r', pagina('p-r', [texto('av', '_aviso'), foto('f', { metadata: { slot: { id: 'foto' } } })]))
  const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-r', slotValues: { _slots: { foto: { fileUrl: 'https://f' } } } }))
  expect(e).toMatchObject({ code: 'CHAVE_VISUAL_RESERVADA', status: 422, details: { layerIds: ['av'] } })
  semEfeito()
})

it('Codex #208 — CP5 (rodada 3): texto legado em camada nomeada "_n" + texto semântico em OUTRA camada recusa antes de qualquer efeito', async () => {
  estado.paginas.set('p-m', pagina('p-m', [texto('ok', '_n'), texto('t', 'Título', { metadata: { slot: { id: 's' } } })]))
  const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-m', slotValues: { ok: 'Legado', _slots: { s: 'Semântico' } } }))
  expect(e).toMatchObject({ code: 'CHAVE_VISUAL_RESERVADA', status: 422, details: { layerIds: ['ok'] } })
  semEfeito()
})

// "Codex #208 — CP5 (rodada 3): semântico só de imagem numa página com _n segue normal" foi SUBSTITUÍDO no B1d checkpoint
// g: o pedido só de imagem passou a registrar a copy VISUAL das camadas (não mais o pedido), e a mesma guarda de nome
// reservado vale — ver o teste "pedido semântico só de IMAGEM + texto visível em camada nomeada _aviso recusa".
it('checkpoint g: semântico só de imagem numa página SEM camada "_" segue normal (a foto entra)', async () => {
  estado.paginas.set('p-m2', pagina('p-m2', [texto('ok', 'Título'), foto('i', { metadata: { slot: { id: 'f' } } })]))
  await createArteRapida({ projectId: 8, sourcePageId: 'p-m2', slotValues: { _slots: { f: { fileUrl: 'https://f' } } } })
  expect(conteudo('i').fileUrl).toBe('https://f')
})

describe('opção C (#208) na CRIAÇÃO: fileUrl semântico no primeiro alvo não deixa a foto escorrer', () => {
  const duasFotos = () => estado.paginas.set('p-2f', pagina('p-2f', [foto('bg', { metadata: { slot: { id: 'fundo' } } }), foto('segunda', { metadata: { slot: { id: 'detalhe' } } })]))

  it('_slots no fundo + _imageUrl: segunda intacta, imageApplied false, aviso com a causa', async () => {
    duasFotos()
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-2f', slotValues: { _imageUrl: 'https://generica', _slots: { fundo: { fileUrl: 'https://semantica' } } } })
    expect(conteudo('bg').fileUrl).toBe('https://semantica')
    expect(conteudo('segunda').fileUrl).toBeUndefined()
    expect(r.imageApplied).toBe(false)
    expect(r.imageWarning).toMatch(/_slots\/_papeis/)
  })

  it('_slots na segunda: a genérica vai para o fundo', async () => {
    duasFotos()
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-2f', slotValues: { _imageUrl: 'https://generica', _slots: { detalhe: { fileUrl: 'https://semantica' } } } })
    expect([conteudo('bg').fileUrl, conteudo('segunda').fileUrl]).toEqual(['https://generica', 'https://semantica'])
    expect(r.imageApplied).toBe(true)
  })

  it('LEGADO por layerId no fundo: a genérica cai na segunda, como sempre', async () => {
    duasFotos()
    const r = await createArteRapida({ projectId: 8, sourcePageId: 'p-2f', slotValues: { _imageUrl: 'https://generica', bg: { fileUrl: 'https://legado' } } })
    expect([conteudo('bg').fileUrl, conteudo('segunda').fileUrl]).toEqual(['https://legado', 'https://generica'])
    expect(r.imageApplied).toBe(true)
  })
})

describe('quarentena do rich-text (#209) na CRIAÇÃO', () => {
  it('_slots em rich-text: VALOR_INCOMPATIVEL_COM_CAMADA 422 antes de qualquer efeito', async () => {
    estado.paginas.set('p-rq', pagina('p-rq', [{ id: 'rt', name: 'Rico', type: 'rich-text', content: 'rico', visible: true, metadata: { slot: { id: 'rico' } } }]))
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-rq', slotValues: { _slots: { rico: 'Novo' } } }))
    expect(e).toMatchObject({ code: 'VALOR_INCOMPATIVEL_COM_CAMADA', status: 422 })
    semEfeito()
  })

  it('legado por layerId em rich-text: aplicado como sempre', async () => {
    estado.paginas.set('p-rl', pagina('p-rl', [{ id: 'rt', name: 'Rico', type: 'rich-text', content: 'rico', visible: true }]))
    await createArteRapida({ projectId: 8, sourcePageId: 'p-rl', slotValues: { rt: 'Novo' } })
    expect(conteudo('rt').content).toBe('Novo')
  })
})

describe('CP4.2b — na criação: formato antes da foto (400); endereço contra o modelo EFETIVO antes do put do cache do Drive, do template, da persistência e do render (422)', () => {
  it('V16: foto do Drive + chave sem camada → 422 CHAVE_DESCONHECIDA; a miniatura foi LIDA (residual), mas o put NÃO rodou e nada foi criado', async () => {
    estado.irma = 'p-b'
    // Sem contrato de copy (com contrato, chave legada já é COPY_COM_CHAVES_LEGADAS antes): o caminho legado puro.
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _driveImageId: 'd1', naoExiste: 'x' } }))
    expect(e.code).toBe('CHAVE_DESCONHECIDA')
    expect(e.status).toBe(422)
    expect(e.details?.erros).toEqual([{ codigo: 'CHAVE_DESCONHECIDA', origem: { tipo: 'chave', chave: 'naoExiste' } }])
    expect(lerImagemDeEntrada).toHaveBeenCalledTimes(1)
    expect(escolherPaginaPelaFoto).toHaveBeenCalledTimes(1)
    expect(persistirCacheDoDrive).not.toHaveBeenCalled()
    semEfeito()
  })
  it('formato inválido → 400 VALOR_INVALIDO ANTES de ler a foto (nem o Drive é consultado)', async () => {
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _driveImageId: 'd1', 'a-h': 123 } }))
    expect(e.code).toBe('VALOR_INVALIDO')
    expect(e.status).toBe(400)
    expect(lerImagemDeEntrada).not.toHaveBeenCalled()
    semEfeito()
  })
  it('caminho válido com foto do Drive: a foto lida por bytes escolhe o layout (a irmã), o put roda UMA vez depois do endereço, e o halo recebe a foto com a URL FINAL', async () => {
    estado.irma = 'p-b'
    await createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _driveImageId: 'd1' }, copyAutoral: SO_MANCHETE })
    expect(lerFotoDeBytes).toHaveBeenCalledTimes(1)
    expect((escolherPaginaPelaFoto as any).mock.calls[0][0].foto).toMatchObject({ raster: { largura: 10 } })
    expect(persistirCacheDoDrive).toHaveBeenCalledTimes(1)
    const urlFinal = 'https://drive.test/d1'
    expect((aplicarHaloNaArte as any).mock.calls[0][0].fotoLida).toMatchObject({ url: urlFinal })
    // A arte persistida aponta para a irmã (o layout da foto) e para a URL final do cache.
    expect(persistido().fieldValues.imageUrl).toBe(urlFinal)
    expect(conteudo('b-h').content).toBe('Noite do vinho')
  })
  it('URL direta: sem Drive, sem put; o endereço é validado contra a irmã escolhida pela foto', async () => {
    estado.irma = 'p-b'
    const e = await falha(createArteRapida({ projectId: 8, sourcePageId: 'p-a', slotValues: { _imageUrl: 'https://f', 'a-h': 'Texto pelo id da PEDIDA' } }))
    // `a-h` é id da página PEDIDA; o modelo efetivo é a irmã (ids b-*): chave desconhecida no modelo efetivo.
    expect(e.code).toBe('CHAVE_DESCONHECIDA')
    expect(persistirCacheDoDrive).not.toHaveBeenCalled()
    semEfeito()
  })
})
