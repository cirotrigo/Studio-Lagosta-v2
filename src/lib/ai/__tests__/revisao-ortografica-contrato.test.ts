import { describe, expect, it } from 'vitest'
import {
  aplicarSugestao,
  aplicarSugestaoEmTodos,
  concordanciaPlausivel,
  extrairVocabulario,
  MAX_SUSPEITAS,
  normalizar,
  protegidoPelaMarca,
  reconciliarSuspeitas,
  semAcento,
  soMudaAcento,
  termosDaMarca,
  trocaPlausivel,
} from '@/lib/ai/revisao-ortografica-contrato'

/** Um recorte do vocabulário real do By Rock (base + DNA). */
const BY_ROCK = extrairVocabulario([
  'By Rock',
  'Cardápio By Rock — petiscos, chapas, burgers e saladas',
  'Torresmo Rock: torresmo de barriguinha crocante com limão siciliano.',
  'Aerosmith: picanha premium grelhada ao molho gorgonzola.',
  'Chopp 300ml e 500ml entram no happy hour.',
  'Tom: animado, rock and roll, irreverente mas acolhedor.',
  'Palavras-chave: volume máximo, na veia, rock and roll, grelhado na brasa.',
])

describe('normalização', () => {
  it('minúsculas e espaços colapsados, MAS mantém o acento', () => {
    expect(normalizar('  Menu   HARMONIZADO  ')).toBe('menu harmonizado')
    expect(normalizar('Disponível')).toBe('disponível')
  })

  it('semAcento derruba os diacríticos', () => {
    expect(semAcento('disponível')).toBe('disponivel')
    expect(semAcento('TERÇA')).toBe('TERCA')
  })

  it('soMudaAcento distingue acentuação de troca de letra', () => {
    expect(soMudaAcento('disponivel', 'disponível')).toBe(true)
    expect(soMudaAcento('esta', 'está')).toBe(true)
    expect(soMudaAcento('chopp', 'chope')).toBe(false)
    // Igual não é "só muda o acento": não há mudança nenhuma.
    expect(soMudaAcento('chopp', 'chopp')).toBe(false)
  })
})

describe('vocabulário da marca', () => {
  it('protege a palavra da casa quando a sugestão NÃO é palavra da casa', () => {
    expect(protegidoPelaMarca('chopp', 'chope', BY_ROCK)).toBe(true)
    expect(protegidoPelaMarca('Aerosmith', 'Aerosmiths', BY_ROCK)).toBe(true)
    // O alarme falso real de 11/08: "picanha" → "picanhã".
    expect(protegidoPelaMarca('picanha', 'picanhã', BY_ROCK)).toBe(true)
  })

  it('protege expressão de mais de uma palavra', () => {
    expect(protegidoPelaMarca('By Rock', 'By Rocks', BY_ROCK)).toBe(true)
    expect(protegidoPelaMarca('rock and roll', "rock 'n' roll", BY_ROCK)).toBe(true)
  })

  it('NÃO protege quando quem é palavra da casa é a SUGESTÃO', () => {
    // O caso real do Wine Vix: a base tem "disponível" e não tem "disponivel".
    const wineVix = extrairVocabulario(['Menu harmonizado disponível durante o mês.'])
    expect(protegidoPelaMarca('disponivel', 'disponível', wineVix)).toBe(false)
  })

  it('com as DUAS formas na base, quem decide é o acento', () => {
    // Caso real do Espeto Gaúcho: a base tem "almoço" E "almoco".
    const espeto = extrairVocabulario(['Almoço executivo', 'almoco de segunda a sexta'])
    // Acentuação: a proteção cai — é a classe de erro que a revisão persegue.
    expect(protegidoPelaMarca('almoco', 'almoço', espeto)).toBe(false)
    // Troca de letra entre duas palavras da casa: a proteção vale.
    const ambas = extrairVocabulario(['chopp gelado', 'chope gelado'])
    expect(protegidoPelaMarca('chopp', 'chope', ambas)).toBe(true)
  })

  it('não protege palavra que não é da casa', () => {
    expect(protegidoPelaMarca('disponivel', 'disponível', BY_ROCK)).toBe(false)
  })
})

describe('a FORMA da troca decide se ela é ortografia', () => {
  it('acentuação passa sempre', () => {
    expect(trocaPlausivel('disponivel', 'disponível')).toBe(true)
    expect(trocaPlausivel('as vezes', 'às vezes')).toBe(true)
  })

  it('uma palavra vira uma palavra: é grafia', () => {
    expect(trocaPlausivel('restaurante', 'restaurantes')).toBe(true)
  })

  it('concordância muda a terminação, nunca o radical', () => {
    expect(concordanciaPlausivel('MELHOR PRATO', 'MELHORES PRATOS')).toBe(true)
    expect(concordanciaPlausivel('OS MELHOR PRATO', 'OS MELHORES PRATOS')).toBe(true)
    // Artigo/preposição: troca do vocábulo inteiro, sem radical que comparar.
    expect(concordanciaPlausivel('a problema', 'o problema')).toBe(true)
    // 🔴 O alarme falso real: "PEDE" → "PIDE" não é concordância, é invenção.
    expect(concordanciaPlausivel('A NOITE PEDE', 'A NOITE PIDE')).toBe(false)
    expect(trocaPlausivel('A NOITE PEDE', 'A NOITE PIDE')).toBe(false)
  })

  it('recorte de meia frase é reescrita, não correção', () => {
    // 🔴 O outro alarme falso real: 5 palavras para trocar um plural de gosto.
    expect(
      trocaPlausivel('rock, petisco e boa companhia', 'rock, petiscos e boa companhia'),
    ).toBe(false)
  })

  it('mudar a quantidade de palavras não é concordância', () => {
    expect(trocaPlausivel('By Rock', 'By Rock Steakhouse')).toBe(false)
  })
})

describe('reconciliação das suspeitas', () => {
  const textos = ['MENU HARMONIZADO', 'disponivel durante o mês de agosto']

  it('aceita o erro real da arte do Wine Vix', () => {
    const suspeitas = reconciliarSuspeitas(
      textos,
      [{ trecho: 'disponivel', sugestao: 'disponível', motivo: 'falta o acento' }],
      BY_ROCK,
    )
    expect(suspeitas).toEqual([
      { trecho: 'disponivel', sugestao: 'disponível', motivo: 'falta o acento' },
    ])
  })

  it('descarta trecho que não existe no texto enviado', () => {
    const suspeitas = reconciliarSuspeitas(
      textos,
      [{ trecho: 'disponivell', sugestao: 'disponível', motivo: 'grafia' }],
      BY_ROCK,
    )
    expect(suspeitas).toEqual([])
  })

  it('descarta sugestão que não muda nada', () => {
    const suspeitas = reconciliarSuspeitas(
      textos,
      [{ trecho: 'agosto', sugestao: 'Agosto', motivo: 'maiúscula' }],
      BY_ROCK,
    )
    expect(suspeitas).toEqual([])
  })

  it('descarta campo faltando — a saída do modelo é reconciliada, não parseada', () => {
    const suspeitas = reconciliarSuspeitas(
      textos,
      [{ trecho: 'disponivel' }, { sugestao: 'disponível' }, {}],
      BY_ROCK,
    )
    expect(suspeitas).toEqual([])
  })

  it('descarta palavra da casa e mantém o erro de verdade na mesma leva', () => {
    const comMarca = ['CHOPP EM DOBRO', 'so hoje no By Rock']
    const suspeitas = reconciliarSuspeitas(
      comMarca,
      [
        { trecho: 'CHOPP', sugestao: 'chope', motivo: 'grafia' },
        { trecho: 'By Rock', sugestao: 'By Rocks', motivo: 'nome' },
        { trecho: 'so', sugestao: 'só', motivo: 'falta o acento' },
      ],
      BY_ROCK,
    )
    expect(suspeitas.map((s) => s.trecho)).toEqual(['so'])
  })

  it('descarta reescrita disfarçada de correção', () => {
    const textos = ['TERÇA NO BY ROCK', 'A NOITE PEDE', 'rock, petisco e boa companhia']
    const suspeitas = reconciliarSuspeitas(
      textos,
      [
        { trecho: 'A NOITE PEDE', sugestao: 'A NOITE PIDE', motivo: 'erro de grafia' },
        {
          trecho: 'rock, petisco e boa companhia',
          sugestao: 'rock, petiscos e boa companhia',
          motivo: 'concordância',
        },
      ],
      BY_ROCK,
    )
    expect(suspeitas).toEqual([])
  })

  it('deduplica pelo trecho e respeita o teto', () => {
    const muitos = Array.from({ length: MAX_SUSPEITAS + 4 }, () => ({
      trecho: 'disponivel',
      sugestao: 'disponível',
      motivo: 'acento',
    }))
    expect(reconciliarSuspeitas(textos, muitos, BY_ROCK)).toHaveLength(1)

    const variados = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map((t) => ({
      trecho: t,
      sugestao: `${t}z`,
      motivo: 'x',
    }))
    expect(reconciliarSuspeitas([variados.map((v) => v.trecho).join(' ')], variados, BY_ROCK))
      .toHaveLength(MAX_SUSPEITAS)
  })

  it('sobrevive a uma resposta que não é lista', () => {
    expect(reconciliarSuspeitas(textos, null, BY_ROCK)).toEqual([])
    expect(reconciliarSuspeitas(textos, undefined, BY_ROCK)).toEqual([])
  })

  it('preenche um motivo quando o modelo omite', () => {
    const [suspeita] = reconciliarSuspeitas(
      textos,
      [{ trecho: 'disponivel', sugestao: 'disponível' }],
      BY_ROCK,
    )
    expect(suspeita.motivo).toBe('possível erro')
  })
})

describe('aplicar a sugestão', () => {
  const suspeita = { trecho: 'disponivel', sugestao: 'disponível', motivo: 'acento' }

  it('preserva a CAIXA de cada ocorrência', () => {
    expect(aplicarSugestao('MENU DISPONIVEL', suspeita)).toBe('MENU DISPONÍVEL')
    expect(aplicarSugestao('Disponivel agora', suspeita)).toBe('Disponível agora')
    expect(aplicarSugestao('menu disponivel', suspeita)).toBe('menu disponível')
  })

  it('troca todas as ocorrências, inclusive em linhas diferentes', () => {
    expect(aplicarSugestao('disponivel\nDISPONIVEL', suspeita)).toBe('disponível\nDISPONÍVEL')
  })

  it('não mexe em texto que não contém o trecho', () => {
    expect(aplicarSugestao('HAPPY HOUR', suspeita)).toBe('HAPPY HOUR')
    expect(aplicarSugestao('', suspeita)).toBe('')
  })

  it('trata caractere especial do trecho como texto, não como regex', () => {
    const preco = { trecho: 'R$ 49,90', sugestao: 'R$ 49,90 por pessoa', motivo: 'x' }
    expect(aplicarSugestao('de R$ 49,90', preco)).toBe('de R$ 49,90 por pessoa')
  })

  it('aplica a todos os campos de uma vez', () => {
    expect(aplicarSugestaoEmTodos(['DISPONIVEL', 'nada', 'disponivel'], suspeita)).toEqual([
      'DISPONÍVEL',
      'nada',
      'disponível',
    ])
  })
})

describe('termos para o prompt', () => {
  it('pega nome próprio no meio da frase e ignora o início dela', () => {
    const termos = termosDaMarca([
      'Aerosmith: picanha premium grelhada ao molho gorgonzola.',
      'Todos os dias tem Chopp e Torresmo Rock na casa.',
    ])
    expect(termos).toContain('Chopp')
    expect(termos).toContain('Torresmo')
    expect(termos).toContain('Rock')
    // "Aerosmith" abre a frase — entra só se reaparecer no meio de outra.
    expect(termos).not.toContain('Todos')
  })

  it('respeita o teto', () => {
    const texto = Array.from({ length: 50 }, (_, i) => `linha com Termo${i} no meio`).join('\n')
    expect(termosDaMarca([texto], 10)).toHaveLength(10)
  })
})
