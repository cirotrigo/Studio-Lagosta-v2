/**
 * CP-X2a — varredura SÓ LEITURA, testada só com fixtures em memória (nenhum banco é aberto).
 * O cliente falso registra toda chamada: a varredura só pode chamar `findMany`.
 */
import { describe, expect, it, vi } from 'vitest'
import { CONTRATO_DA_VARREDURA, somenteLeitura, varrerVetores, type LeitorSomenteLeitura } from '../varredura'
import { AJUDA, descreverErro, main } from '../../../../scripts/varrer-vetores'

const PATH = 'M10 10 L90 10 L90 90 Z'
const vetor = (id: string, style: Record<string, unknown> = {}) => ({ id, type: 'shape', position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, style: { shapeType: 'svg-path', pathData: PATH, ...style } })
const texto = (id: string) => ({ id, type: 'text', content: 'oi', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } })

/** Modelo falso com paginação por cursor, como o Prisma: `take`, `skip: 1` e `cursor`. */
function modelo<T extends Record<string, unknown>>(linhas: T[], chave: (l: T) => string) {
  const chamadas: Array<Record<string, unknown>> = []
  const findMany = vi.fn(async (args: Record<string, unknown>) => {
    chamadas.push(args)
    const ordenadas = [...linhas].sort((a, b) => chave(a).localeCompare(chave(b)))
    let inicio = 0
    const cursor = args.cursor as Record<string, unknown> | undefined
    if (cursor) {
      const alvo = 'postId_mediaUrl' in cursor ? JSON.stringify(cursor.postId_mediaUrl) : JSON.stringify({ id: cursor.id })
      inicio = ordenadas.findIndex((l) => ('postId' in l ? JSON.stringify({ postId: l.postId, mediaUrl: l.mediaUrl }) : JSON.stringify({ id: l.id })) === alvo) + ((args.skip as number) ?? 0)
    }
    return ordenadas.slice(inicio, inicio + (args.take as number))
  })
  return { findMany, chamadas, update: vi.fn(), delete: vi.fn(), create: vi.fn(), updateMany: vi.fn() }
}

function banco() {
  const page = modelo(
    [
      { id: 'p1', templateId: 1, isTemplate: true, layers: [vetor('ok'), texto('t')] },
      { id: 'p2', templateId: 1, isTemplate: false, layers: JSON.stringify(JSON.stringify([vetor('ruim', { pathData: 'hello', fill: 'currentcolor' })])) }, // dupla-codificada
      { id: 'p3', templateId: 2, isTemplate: false, layers: 'isto não é json' },
      { id: 'p4', templateId: 2, isTemplate: false, layers: [{ ...vetor('oculto', { pathViewBox: null }), visible: false }] },
      { id: 'p5', templateId: 3, isTemplate: false, layers: [] },
    ],
    (l) => l.id,
  )
  const template = modelo(
    [
      { id: 1, designData: { canvas: {}, layers: [vetor('raiz', { fill: 123 })], pages: [{ layers: [vetor('pg', { strokeColor: 'inherit' })] }] } },
      { id: 2, designData: JSON.stringify({ layers: [vetor('ok2')] }) },
      { id: 3, designData: 42 },
    ],
    (l) => String(l.id).padStart(5, '0'),
  )
  const fontCombination = modelo(
    [{ id: 'f1', projectId: 1, elements: [{ ornamentos: [{ camada: vetor('orn', { border: { color: 'banana' } }) }, { url: 'https://x/y.png' }] }, { texto: 'sem ornamento' }] }],
    (l) => l.id,
  )
  const generation = modelo(
    [
      { id: 'g1', fieldValues: { layersSnapshot: [vetor('snap', { vetor: { partes: [] } })] } },
      { id: 'g2', fieldValues: { pageId: 'p1' } }, // sem snapshot: não conta
      { id: 'g3', fieldValues: null },
    ],
    (l) => l.id,
  )
  const postRenderProof = modelo(
    [
      { postId: 'post1', mediaUrl: 'https://b/1.png', layersSnapshot: [vetor('prova', { pathData: undefined })] },
      { postId: 'post1', mediaUrl: 'https://b/2.png', layersSnapshot: [vetor('ok')] },
    ],
    (l) => `${l.postId}|${l.mediaUrl}`,
  )
  return { page, template, fontCombination, generation, postRenderProof, $executeRaw: vi.fn(), $transaction: vi.fn() }
}

const fixo = () => new Date('2026-10-21T22:00:00.000Z')

describe('varrerVetores (fixtures em memória)', () => {
  it('conta por fonte e por código, com amostra de ids, separando o que é só informação', async () => {
    const b = banco()
    const r = await varrerVetores(somenteLeitura(b), { lote: 2, commit: 'abc123', agora: fixo })
    const por = Object.fromEntries(r.fontes.map((f) => [f.fonte, f]))

    expect(r.contrato).toBe(CONTRATO_DA_VARREDURA)
    expect(r.commit).toBe('abc123')
    expect(r.iniciadoEm).toBe('2026-10-21T22:00:00.000Z')

    expect(por['Page.layers']).toMatchObject({
      gravavel: true, registros: 5, ilegiveis: 1, amostraIlegivel: [{ registro: 'page:p3', motivo: 'lista de camadas ilegível' }], camadasVetoriais: 3, camadasComProblema: 2,
      porCodigo: { 'PATH_INVALIDO:NAO_COMECA_COM_M': 1, 'COR_INVALIDA:fill': 1, VIEWBOX_INVALIDO: 1 },
      palavrasDeContexto: { currentcolor: 1 },
    })
    expect(por['Page.layers'].amostra).toEqual([
      { registro: 'page:p2', camada: 'ruim', codigos: ['PATH_INVALIDO:NAO_COMECA_COM_M', 'COR_INVALIDA:fill'] },
      { registro: 'page:p4', camada: 'oculto', codigos: ['VIEWBOX_INVALIDO'] }, // oculta também entra
    ])
    expect(por['Template.designData']).toMatchObject({
      registros: 3, ilegiveis: 1, camadasVetoriais: 3, camadasComProblema: 2,
      porCodigo: { 'COR_INVALIDA:fill': 1, 'COR_INVALIDA:strokeColor': 1 },
      palavrasDeContexto: { inherit: 1 },
    })
    expect(por['FontCombination.elements']).toMatchObject({ registros: 1, camadasVetoriais: 1, porCodigo: { 'COR_INVALIDA:border.color': 1 } })
    expect(por['Template.designData'].amostraIlegivel).toEqual([{ registro: 'template:3', motivo: 'designData não é objeto' }])
    expect(por['Generation.layersSnapshot']).toMatchObject({ registros: 3, ilegiveis: 0, camadasVetoriais: 1, porCodigo: { PARTES_INVALIDAS: 1 } })
    expect(por['PostRenderProof.layersSnapshot']).toMatchObject({ gravavel: false, registros: 2, camadasComProblema: 1, porCodigo: { PATH_AUSENTE: 1 } })

    // gate: só as fontes graváveis contam (2 + 2 + 1 + 1), a prova imutável fica de fora; ilegíveis também bloqueiam
    expect(r.falhasGravaveis).toBe(6)
    expect(r.ilegiveisGravaveis).toBe(2)
    expect(r.gate.aprovado).toBe(false)
    expect(r.gate.motivos).toHaveLength(2)
    expect(r.limites.join(' ')).toContain('fotografia')
  })

  it('pagina por cursor até o fim (lote menor que o total) e só chama findMany', async () => {
    const b = banco()
    await varrerVetores(somenteLeitura(b), { lote: 2, agora: fixo })
    expect(b.page.chamadas.map((c) => c.cursor ?? null)).toEqual([null, { id: 'p2' }, { id: 'p4' }])
    expect(b.page.chamadas.every((c) => c.take === 2 && (c.cursor ? c.skip === 1 : true))).toBe(true)
    expect(b.postRenderProof.chamadas[1]).toMatchObject({ cursor: { postId_mediaUrl: { postId: 'post1', mediaUrl: 'https://b/2.png' } }, skip: 1 })
    for (const m of [b.page, b.template, b.fontCombination, b.generation, b.postRenderProof]) {
      expect(m.findMany).toHaveBeenCalled()
      for (const escrita of [m.update, m.delete, m.create, m.updateMany]) expect(escrita).not.toHaveBeenCalled()
    }
    expect(b.$executeRaw).not.toHaveBeenCalled()
    expect(b.$transaction).not.toHaveBeenCalled()
  })

  it('o select nunca pede mais do que precisa (sem conteúdo extra das linhas)', async () => {
    const b = banco()
    await varrerVetores(somenteLeitura(b), { agora: fixo })
    expect(b.page.chamadas[0].select).toEqual({ id: true, templateId: true, isTemplate: true, layers: true })
    expect(b.generation.chamadas[0].select).toEqual({ id: true, fieldValues: true })
  })

  it('somenteLeitura expõe só findMany', () => {
    const leitor = somenteLeitura(banco()) as unknown as Record<string, Record<string, unknown>>
    for (const nome of ['page', 'template', 'fontCombination', 'generation', 'postRenderProof']) {
      expect(Object.keys(leitor[nome])).toEqual(['findMany'])
    }
    expect(Object.keys(leitor).sort()).toEqual(['fontCombination', 'generation', 'page', 'postRenderProof', 'template'])
  })

  it('banco vazio → zero em tudo e gate aprovado', async () => {
    const vazio = () => ({ findMany: vi.fn(async () => []) })
    const r = await varrerVetores({ page: vazio(), template: vazio(), fontCombination: vazio(), generation: vazio(), postRenderProof: vazio() } as unknown as LeitorSomenteLeitura, { agora: fixo })
    expect(r.falhasGravaveis).toBe(0)
    expect(r.ilegiveisGravaveis).toBe(0)
    expect(r.gate).toEqual({ aprovado: true, motivos: [] })
    expect(r.fontes.every((f) => f.registros === 0 && f.camadasVetoriais === 0)).toBe(true)
  })

  it('fonte não lida NÃO vira gate zerado: contêiner presente e ilegível bloqueia; ausência opcional não', async () => {
    const so = <T,>(linhas: T[]) => ({ findMany: vi.fn(async (a: Record<string, unknown>) => (a.cursor ? [] : linhas)) })
    const r = await varrerVetores(
      {
        page: so([{ id: 'p', templateId: 1, isTemplate: false, layers: null }]), // ausente: ok
        template: so([
          { id: 1, designData: '{"layers": [' }, // JSON malformado
          { id: 2, designData: { pages: 'não é lista' } }, // pages presente e não-lista
          { id: 3, designData: { pages: [{ layers: '{quebrado' }, 7, null] } }, // camadas malformadas; página não-objeto; página nula (ausente)
          { id: 4, designData: null }, // ausente: ok
          { id: 5, designData: { canvas: {} } }, // sem layers/pages: ok
        ]),
        fontCombination: so([
          { id: 'a', projectId: 1, elements: '[{"ornamentos":' }, // malformado
          { id: 'b', projectId: 1, elements: { nao: 'lista' } }, // não-lista
          { id: 'c', projectId: 1, elements: [{ ornamentos: 'x' }, 'elemento', { ornamentos: [5, { url: 'u' }] }] },
        ]),
        generation: so([
          { id: 'g1', fieldValues: '{"layersSnapshot":' }, // malformado
          { id: 'g2', fieldValues: { layersSnapshot: 'nao-json' } }, // snapshot ilegível
          { id: 'g3', fieldValues: { layersSnapshot: null } }, // ausente: ok
        ]),
        postRenderProof: so([{ postId: 'x', mediaUrl: 'm', layersSnapshot: 'quebrado' }]), // só informação
      } as unknown as LeitorSomenteLeitura,
      { agora: fixo },
    )
    const por = Object.fromEntries(r.fontes.map((f) => [f.fonte, f]))
    expect(por['Page.layers'].ilegiveis).toBe(0)
    expect(por['Template.designData'].amostraIlegivel).toEqual([
      { registro: 'template:1', motivo: 'designData com JSON malformado' },
      { registro: 'template:2', motivo: 'designData.pages presente e não é lista' },
      { registro: 'template:3/pages[0]', motivo: 'lista de camadas ilegível' },
      { registro: 'template:3/pages[1]', motivo: 'página não é objeto' },
    ])
    expect(por['FontCombination.elements'].amostraIlegivel).toEqual([
      { registro: 'fontCombination:a', motivo: 'elements com JSON malformado' },
      { registro: 'fontCombination:b', motivo: 'elements não é lista' },
      { registro: 'fontCombination:c/elements[0]', motivo: 'ornamentos presente e não é lista' },
      { registro: 'fontCombination:c/elements[1]', motivo: 'elemento não é objeto' },
      { registro: 'fontCombination:c/elements[2]/ornamentos[0]', motivo: 'ornamento não é objeto' },
    ])
    expect(por['Generation.layersSnapshot'].amostraIlegivel).toEqual([
      { registro: 'generation:g1', motivo: 'fieldValues com JSON malformado' },
      { registro: 'generation:g2', motivo: 'lista de camadas ilegível' },
    ])
    expect(por['PostRenderProof.layersSnapshot'].ilegiveis).toBe(1) // anotado, mas fora do gate
    expect(r.falhasGravaveis).toBe(0) // nenhum vetor inválido foi visto…
    expect(r.ilegiveisGravaveis).toBe(11) // …mas 11 contêineres não foram lidos
    expect(r.gate.aprovado).toBe(false) // então o gate NÃO fica zerado
    expect(r.gate.motivos[0]).toContain('não auditada')
  })
})

describe('scripts/varrer-vetores.ts (entrypoint)', () => {
  it('importar o módulo não executa nada (o teste chegou aqui sem banco e sem saída)', () => {
    expect(typeof main).toBe('function')
    expect(AJUDA).toContain('--executar')
  })

  it('sem --executar: imprime a ajuda e NÃO carrega o cliente do banco', async () => {
    const carregarCliente = vi.fn()
    const saida: string[] = []
    const r = await main([], { carregarCliente, escrever: (t) => saida.push(t) })
    expect(r).toEqual({ executou: false })
    expect(carregarCliente).not.toHaveBeenCalled()
    expect(saida.join('')).toBe(AJUDA)
  })

  it('com --executar e cliente injetado: só findMany, relatório em JSON, desconecta e não vaza credencial', async () => {
    const anterior = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://usuario:SEGREDO@host.exemplo/banco'
    try {
      const b = { ...banco(), $disconnect: vi.fn(async () => undefined) }
      const saida: string[] = []
      const r = await main(['--executar', '--commit', 'def456', '--lote', '2'], { carregarCliente: async () => b, escrever: (t) => saida.push(t) })
      expect(r.executou).toBe(true)
      const json = JSON.parse(saida.join(''))
      expect(json.commit).toBe('def456')
      expect(json.falhasGravaveis).toBe(6)
      expect(json.gate.aprovado).toBe(false)
      expect(saida.join('')).not.toMatch(/SEGREDO|postgres(ql)?:\/\//i)
      expect(b.$disconnect).toHaveBeenCalledTimes(1)
      expect(b.$executeRaw).not.toHaveBeenCalled()
      expect(b.page.update).not.toHaveBeenCalled()
    } finally {
      if (anterior === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = anterior
    }
  })

  it('erro de leitura desconecta mesmo assim', async () => {
    const b = { ...banco(), $disconnect: vi.fn(async () => undefined) }
    b.page.findMany.mockRejectedValueOnce(new Error("Can't reach database server at postgres://usuario:senha@host:5432/db"))
    await expect(main(['--executar'], { carregarCliente: async () => b, escrever: () => undefined })).rejects.toThrow()
    expect(b.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('a mensagem externa é genérica: nunca repassa message/stack, só o código permitido', () => {
    const comSegredo = Object.assign(new Error('postgres://usuario:senha@host:5432/db?sslmode=require token=abc'), { code: 'P1001' })
    expect(descreverErro(comSegredo)).toBe('falha na leitura do banco (código P1001)')
    const codigoForjado = Object.assign(new Error('x'), { code: 'postgres://usuario:senha@host' })
    expect(descreverErro(codigoForjado)).toBe('falha na leitura do banco (detalhes omitidos para não expor a conexão)')
    for (const e of [comSegredo, codigoForjado, new Error('postgres://usuario:senha@host'), 'postgres://usuario:senha@host', null]) {
      expect(descreverErro(e)).not.toMatch(/usuario|senha|postgres|token|host/)
    }
  })
})
