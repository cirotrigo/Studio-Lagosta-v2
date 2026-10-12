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

  it('objeto com chave desconhecida nunca é equivalente', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: { content: 'A', x: 1 } }, _papeis: { headline: { content: 'A', x: 1 } } }))).toEqual(['VALOR_CONFLITANTE'])
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
