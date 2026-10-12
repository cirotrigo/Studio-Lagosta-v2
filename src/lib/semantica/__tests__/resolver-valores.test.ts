import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { resolverValoresSemanticos } from '../resolver-valores'
import { camada } from './fixtures'

const papel = (p: string, slot?: string) => ({ compositor: { papel: p }, ...(slot ? { slot: { id: slot } } : {}) })

/** Página: headline com slot, dois `servico` com slots, um CTA sem slot. */
const pagina: Layer[] = [
  camada({ id: 'text-h', name: 'Título', metadata: papel('headline', 'titulo') }),
  camada({ id: 'text-e', name: 'Endereço', metadata: papel('servico', 'servico-endereco') }),
  camada({ id: 'text-o', name: 'Horário', metadata: papel('servico', 'servico-horario') }),
  camada({ id: 'text-c', name: 'cta-botao', metadata: papel('cta') }),
]

const codigos = (r: ReturnType<typeof resolverValoresSemanticos>) => r.erros.map((e) => e.codigo)

describe('resolverValoresSemanticos — só lê _slots e _papeis', () => {
  it('sem _slots nem _papeis: nada resolvido, nada de erro (o legado fica com o caminho de sempre)', () => {
    const r = resolverValoresSemanticos(pagina, { 'text-h': 'legado', headline: 'legado' })
    expect(r).toEqual({ valores: new Map(), erros: [], avisos: [] })
  })

  it('_slots: cada chave é um slotId → valor pelo ÍNDICE, com a origem', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { 'servico-horario': 'Ter a dom' } })
    expect(r.erros).toEqual([])
    expect([...r.valores.entries()]).toEqual([[2, { indice: 2, valor: 'Ter a dom', origem: { tipo: 'slotId', chave: 'servico-horario' } }]])
  })

  it('_papeis: papel único resolve, e o valor original (objeto) é preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { cta: { content: 'Reserve', fileUrl: 'https://x' } } })
    expect(r.valores.get(3)).toEqual({ indice: 3, valor: { content: 'Reserve', fileUrl: 'https://x' }, origem: { tipo: 'semanticRole', chave: 'cta' } })
  })

  it('não aplica nada: as camadas de entrada saem intocadas', () => {
    const antes = JSON.stringify(pagina)
    resolverValoresSemanticos(pagina, { _slots: { titulo: 'X' }, _papeis: { cta: 'Y' } })
    expect(JSON.stringify(pagina)).toBe(antes)
  })

  it('"" é valor fornecido e é preservado como veio (a aplicação decide por caminho)', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: { titulo: '' } }).valores.get(0)?.valor).toBe('')
  })
})

describe('erros de endereçamento: estruturados, sem escolher camada', () => {
  it('papel repetido → AMBIGUOUS_TARGET do resolverAlvo, com os candidatos', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { servico: 'X' } })
    expect(r.valores.size).toBe(0)
    expect(r.erros).toEqual([
      expect.objectContaining({ codigo: 'ALVO_NAO_RESOLVIDO', origem: { tipo: 'semanticRole', chave: 'servico' }, erro: expect.objectContaining({ codigo: 'AMBIGUOUS_TARGET' }) }),
    ])
  })

  it('slot inexistente → SLOT_NOT_FOUND preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { 'servico-telefone': 'X' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'ALVO_NAO_RESOLVIDO', erro: { codigo: 'SLOT_NOT_FOUND', slotId: 'servico-telefone' } })
  })

  it('papel fora do vocabulário → PAPEL_DESCONHECIDO preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { preco: 'X' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'ALVO_NAO_RESOLVIDO', erro: { codigo: 'PAPEL_DESCONHECIDO' } })
  })

  it('um erro não impede as outras entradas de resolverem (quem chama decide recusar o todo)', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'T', nada: 'X' } })
    expect(codigos(r)).toEqual(['ALVO_NAO_RESOLVIDO'])
    expect(r.valores.get(0)?.valor).toBe('T')
  })
})

describe('validação estrutural', () => {
  it('_slots que não é objeto → ENTRADA_INVALIDA', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: 'titulo' }))).toEqual(['ENTRADA_INVALIDA'])
    expect(codigos(resolverValoresSemanticos(pagina, { _papeis: ['cta'] }))).toEqual(['ENTRADA_INVALIDA'])
  })

  it('_slots null ou ausente → como ausente (a regra ?? do legado)', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: null, _papeis: undefined }).erros).toEqual([])
  })

  it('valor que não é string nem objeto → VALOR_INVALIDO', () => {
    for (const valor of [3, true, null, ['x']]) {
      expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: valor } }))).toEqual(['VALOR_INVALIDO'])
    }
  })
})

describe('conflito entre _slots e _papeis na MESMA camada', () => {
  it('mesmo valor → uma resolução só, sem erro (a origem mais forte, slotId, fica)', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: 'A' } })
    expect(r.erros).toEqual([])
    expect([...r.valores.values()]).toEqual([{ indice: 0, valor: 'A', origem: { tipo: 'slotId', chave: 'titulo' } }])
  })

  it('string e { content } com o mesmo texto não vazio são equivalentes', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: { content: 'A' } } }).erros).toEqual([])
  })

  it('valores diferentes → VALOR_CONFLITANTE com as duas origens, e nenhum valor para a camada', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: 'B' } })
    expect(r.valores.has(0)).toBe(false)
    expect(r.erros).toEqual([
      { codigo: 'VALOR_CONFLITANTE', indice: 0, layerId: 'text-h', origens: [{ tipo: 'slotId', chave: 'titulo' }, { tipo: 'semanticRole', chave: 'headline' }] },
    ])
  })

  it('"" NÃO equivale a { content: "" } (semânticas diferentes no render)', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: '' }, _papeis: { headline: { content: '' } } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('objeto com chave fora do contrato semântico é VALOR_INVALIDO (fail-closed), nunca entra na comparação', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: { content: 'A', x: 1 } }, _papeis: { headline: { content: 'A', x: 1 } } }))).toEqual(['VALOR_INVALIDO', 'VALOR_INVALIDO'])
  })
})

describe('conflito com a chave LEGADA explicitamente enviada para a mesma camada', () => {
  it('chave pelo id com outro valor → VALOR_CONFLITANTE', () => {
    const r = resolverValoresSemanticos(pagina, { 'text-h': 'A', _slots: { titulo: 'B' } })
    expect(r.erros).toEqual([{ codigo: 'VALOR_CONFLITANTE', indice: 0, layerId: 'text-h', origens: [{ tipo: 'layerId', chave: 'text-h' }, { tipo: 'slotId', chave: 'titulo' }] }])
  })

  it('chave pelo nome com outro valor → VALOR_CONFLITANTE', () => {
    const r = resolverValoresSemanticos(pagina, { 'cta-botao': 'A', _papeis: { cta: 'B' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: 'cta-botao' }, { tipo: 'semanticRole', chave: 'cta' }] })
  })

  it('chave legada com valor equivalente → sem conflito', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': 'A', _slots: { titulo: { content: 'A' } } }).erros).toEqual([])
  })

  it('chave legada "" é FORNECIDA (não é ausente): conflita com um valor semântico diferente', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': '', _slots: { titulo: 'B' } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('chave legada null/undefined é ausente (a regra ?? do legado)', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': null, Título: undefined, _slots: { titulo: 'B' } }).erros).toEqual([])
  })

  it('chave legada para OUTRA camada não conflita', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-c': 'A', _slots: { titulo: 'B' } }).erros).toEqual([])
  })
})

describe('revisão adversarial B1a', () => {
  it('F1: só a fonte legada EFETIVA (id ?? nome) conta — nome ignorado pelo legado não gera conflito falso', () => {
    // o legado aplica 'A' (o id vence); 'B' pelo nome nunca chega a esta camada
    expect(resolverValoresSemanticos(pagina, { 'text-h': 'A', Título: 'B', _slots: { titulo: 'A' } }).erros).toEqual([])
  })

  it('F1: sem chave pelo id, o nome É a fonte efetiva e conflita', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { Título: 'B', _slots: { titulo: 'A' } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('F2: o índice é a posição no ARRAY RECEBIDO, não a ordem de desenho (`order`)', () => {
    const foraDeOrdem = [
      camada({ id: 'b', order: 1, metadata: papel('apoio', 'apoio') }),
      camada({ id: 'a', order: 0, metadata: papel('headline', 'titulo') }),
    ]
    const r = resolverValoresSemanticos(foraDeOrdem, { _slots: { titulo: 'X' } })
    expect([...r.valores.keys()]).toEqual([1])
    expect(foraDeOrdem[1].id).toBe('a')
  })
})

describe('contrato SEMÂNTICO: string ou { content?, fileUrl?, hidden: true } — fail-closed', () => {
  const valida = (valor: unknown) => codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: valor } }))

  it('válidos', () => {
    for (const v of ['X', '', { content: 'X' }, { content: '' }, { fileUrl: 'https://x' }, { hidden: true }, { content: 'X', hidden: true }, { content: 'X', fileUrl: 'https://x' }]) {
      expect(valida(v)).toEqual([])
    }
  })

  it('papel e bloco são identidade interna: inválidos no contrato semântico', () => {
    expect(valida({ papel: 'cta' })).toEqual(['VALOR_INVALIDO'])
    expect(valida({ bloco: 'b1' })).toEqual(['VALOR_INVALIDO'])
    expect(valida({ content: 'X', papel: 'cta' })).toEqual(['VALOR_INVALIDO'])
  })

  it('chave desconhecida, objeto vazio, array e null: inválidos', () => {
    for (const v of [{ banana: 123 }, {}, ['x'], null]) expect(valida(v)).toEqual(['VALOR_INVALIDO'])
  })

  it('tipos errados e operações sem efeito: inválidos', () => {
    for (const v of [{ content: 3 }, { fileUrl: '' }, { fileUrl: 7 }, { hidden: false }, { hidden: 'sim' }]) expect(valida(v)).toEqual(['VALOR_INVALIDO'])
  })
})

describe('a fonte legada espelha o casamento real (id ?? nome), inclusive com "_"', () => {
  const comUnderscore: Layer[] = [camada({ id: '_x', name: '_n', metadata: papel('headline', 'titulo') })]

  it('id com "_" é fonte legada efetiva → conflita', () => {
    expect(resolverValoresSemanticos(comUnderscore, { _x: 'A', _slots: { titulo: 'B' } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'layerId', chave: '_x' }, { tipo: 'slotId', chave: 'titulo' }] })
  })

  it('name com "_" sem id → fonte efetiva → conflita', () => {
    expect(resolverValoresSemanticos(comUnderscore, { _n: 'A', _slots: { titulo: 'B' } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: '_n' }, { tipo: 'slotId', chave: 'titulo' }] })
  })

  it('id null deixa o nome ser a fonte efetiva', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': null, Título: 'B', _slots: { titulo: 'A' } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: 'Título' }, { tipo: 'slotId', chave: 'titulo' }] })
  })
})

describe('_slots e _papeis são reservados: não podem colidir com id/name de layer', () => {
  it('layer com id "_slots" e o contrato novo em uso → CHAVE_RESERVADA_COLIDE_COM_LAYER, nada resolvido daquele campo', () => {
    const colide: Layer[] = [...pagina, camada({ id: '_slots', name: 'x' })]
    const r = resolverValoresSemanticos(colide, { _slots: { titulo: 'A' } })
    expect(r.erros).toEqual([{ codigo: 'CHAVE_RESERVADA_COLIDE_COM_LAYER', chave: '_slots', indice: 4, layerId: '_slots' }])
    expect(r.valores.size).toBe(0)
  })

  it('layer com name "_papeis" também colide', () => {
    const colide: Layer[] = [...pagina, camada({ id: 'l9', name: '_papeis' })]
    expect(codigos(resolverValoresSemanticos(colide, { _papeis: { cta: 'A' } }))).toEqual(['CHAVE_RESERVADA_COLIDE_COM_LAYER'])
  })

  it('sem o campo reservado em uso, a layer de nome reservado não é problema desta função', () => {
    const colide: Layer[] = [...pagina, camada({ id: 'l9', name: '_papeis' })]
    expect(resolverValoresSemanticos(colide, { _slots: { titulo: 'A' } }).erros).toEqual([])
  })
})

describe('equivalência legado ↔ semântico pelo EFEITO editável', () => {
  it('legado com papel/bloco internos e o mesmo content não conflita', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': { content: 'Reserve', papel: 'headline', bloco: 'b1' }, _slots: { titulo: { content: 'Reserve' } } }).erros).toEqual([])
    expect(resolverValoresSemanticos(pagina, { 'text-h': { content: 'Reserve', papel: 'headline' }, _slots: { titulo: 'Reserve' } }).erros).toEqual([])
  })

  it('diferenças reais continuam conflito: content, fileUrl, hidden', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': { content: 'A', papel: 'headline' }, _slots: { titulo: { content: 'B' } } }))).toEqual(['VALOR_CONFLITANTE'])
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': { fileUrl: 'https://a' }, _slots: { titulo: { fileUrl: 'https://b' } } }))).toEqual(['VALOR_CONFLITANTE'])
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': { content: 'A' }, _slots: { titulo: { content: 'A', hidden: true } } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('"" × { content: "" } continua conflito, também contra o legado', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': '', _slots: { titulo: { content: '' } } }))).toEqual(['VALOR_CONFLITANTE'])
  })
})
