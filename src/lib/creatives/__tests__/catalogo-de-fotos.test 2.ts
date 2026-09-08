import { describe, it, expect } from 'vitest'
import {
  lerEntradasDoCatalogo,
  montarPromptDeAnalise,
  montarVocabularioDeTags,
  normalizarAnalise,
  tagDaPasta,
  VERSAO_DA_ANALISE,
} from '../catalogo-de-fotos'

const vocab = montarVocabularioDeTags({ pilares: ['sabores-real', 'pausas-e-aconchego'], pastas: ['Cafés, Tortas e salgados', '01_cortes/picanha', 'Crepes'] })

describe('vocabulário fechado', () => {
  it('pilares, folha da pasta (sem prefixo numérico) e canônicas entram; o caminho inteiro não', () => {
    expect(vocab.conjunto.has('sabores-real')).toBe(true)
    expect(vocab.conjunto.has('picanha')).toBe(true)
    expect(vocab.conjunto.has('cafes-tortas-e-salgados')).toBe(true)
    expect(vocab.conjunto.has('01-cortes/picanha')).toBe(false)
    expect(vocab.conjunto.has('happy-hour')).toBe(true)
  })
  it('tagDaPasta tira prefixo numérico e underline', () => {
    expect(tagDaPasta('08_sobremesas/rock\'n brownie')).toBe('rockn-brownie')
    expect(tagDaPasta('_Organizar/2025-12-17')).toBe('2025-12-17')
  })
})

describe('normalizarAnalise', () => {
  it('tag do vocabulário fica em tags; a desconhecida vai para tagsLivres; o assunto vira tag', () => {
    const a = normalizarAnalise(
      { assunto: 'Croissant', tags: ['Café da Manhã', 'crocante', 'happy-hour'], tagsLivres: ['folhado'], quality: 'alta', lotacao: 'CHEIO', momento: 'noite', enquadramento: 'close', pessoas: 'maos' },
      vocab,
      { pasta: 'Cafés' },
    )
    expect(a.tags).toContain('cafe-da-manha')
    expect(a.tags).toContain('happy-hour')
    expect(a.tags).not.toContain('crocante')
    expect(a.tagsLivres).toEqual(expect.arrayContaining(['crocante', 'folhado', 'croissant']))
    expect(a.assunto).toBe('croissant')
    expect(a.lotacao).toBe('cheio')
    expect(a.momento).toBe('noite')
    expect(a.enquadramento).toBe('close')
    expect(a.pessoas).toBe('maos')
    expect(a.analiseVersao).toBe(VERSAO_DA_ANALISE)
  })

  it('enum fora do vocabulário vira null, nunca lança; descrição ausente cai na pasta', () => {
    const a = normalizarAnalise({ lotacao: 'lotadíssimo', momento: 42, quality: 'ótima', mood: 'zen' }, vocab, { pasta: 'Crepes' })
    expect(a.lotacao).toBeNull()
    expect(a.momento).toBeNull()
    expect(a.quality).toBe('media')
    expect(a.mood).toBe('casual')
    expect(a.description).toContain('Crepes')
  })

  it('só grava precoLegivel/marcaDeTerceiro quando o modelo AFIRMOU', () => {
    const sem = normalizarAnalise({}, vocab, { pasta: 'x' })
    expect('precoLegivel' in sem).toBe(false)
    expect('marcaDeTerceiro' in sem).toBe(false)
    const com = normalizarAnalise({ precoLegivel: true, marcaDeTerceiro: null }, vocab, { pasta: 'x' })
    expect(com.precoLegivel).toBe(true)
    expect(com.marcaDeTerceiro).toBeNull()
  })

  it('qualidade baixa e cliente identificável viram tags, como na v2', () => {
    const a = normalizarAnalise({ quality: 'baixa', clienteIdentificavel: true, zona: 'Salão' }, vocab, { pasta: 'x' })
    expect(a.tags).toEqual(expect.arrayContaining(['descarte-sugerido', 'cliente-identificavel', 'salao']))
  })

  it('resposta que não é objeto não derruba nada', () => {
    expect(normalizarAnalise('lixo', vocab, { pasta: 'x' }).description).toContain('pasta: x')
    expect(normalizarAnalise(null, vocab, { pasta: 'x' }).tags).toEqual([])
  })
})

describe('lerEntradasDoCatalogo', () => {
  it('entrada torta é pulada e as demais sobrevivem; campo torto vira neutro', () => {
    const { entradas, puladas } = lerEntradasDoCatalogo({
      images: [
        { driveFileId: 'a', fileName: 'a.jpg', folder: 'x', tags: 'nao-e-lista', lotacao: 'errado' },
        { fileName: 'sem-id.jpg' },
        'string',
      ],
    })
    expect(entradas).toHaveLength(1)
    expect(entradas[0].tags).toEqual([])
    expect(entradas[0].lotacao).toBeNull()
    expect(puladas).toBe(2)
  })
})

describe('montarPromptDeAnalise', () => {
  it('leva o vocabulário fechado, o cardápio e as perguntas da v3', () => {
    const p = montarPromptDeAnalise({ projectName: 'Real Gelateria', pasta: 'Crepes', cardapio: 'Crepe de Nutella', contextoDaMarca: '', vocabulario: vocab })
    expect(p).toContain('VOCABULÁRIO FECHADO')
    expect(p).toContain('sabores-real')
    expect(p).toContain('Crepe de Nutella')
    for (const campo of ['"assunto"', '"elementos"', '"enquadramento"', '"momento"', '"lotacao"', '"pessoas"', '"tagsLivres"']) expect(p).toContain(campo)
  })
})
