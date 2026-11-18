import { describe, expect, it } from 'vitest'
import {
  IDS_DAS_RECEITAS,
  RECEITAS_DE_FOTO,
  TETO_DO_PROMPT_DE_FOTO,
  blocoDePreservacao,
  conferenciasDasReceitas,
  melhoriaDeFotoLigada,
  montarPromptDeFoto,
  normalizarReceitas,
  trechosFotograficos,
} from '../receitas-de-foto'

describe('catálogo de receitas de foto', () => {
  it('tem as quatro receitas, cada uma com rótulo, descrição, proteção e conferências', () => {
    expect([...IDS_DAS_RECEITAS]).toEqual(['humanizar', 'foto-profissional', 'abrir-espaco', 'ajuste-livre'])
    for (const id of IDS_DAS_RECEITAS) {
      const r = RECEITAS_DE_FOTO[id]
      expect(r.id).toBe(id)
      expect(r.rotulo.length).toBeGreaterThan(3)
      expect(r.descricao.length).toBeGreaterThan(20)
      expect(r.protege.length).toBeGreaterThan(0)
      expect(r.preserva.length).toBeGreaterThan(0)
      expect(r.conferencias).toContain('rosto-em-foco')
    }
  })

  it('o trecho fotográfico fala de câmera, lente e luz, e leva os parâmetros', () => {
    const [humanizar] = trechosFotograficos([{ id: 'humanizar', gesto: 'a hand pulling a slice of pizza', lado: 'direita' }])
    expect(humanizar).toContain('a hand pulling a slice of pizza')
    expect(humanizar).toMatch(/right edge/i)
    const [pro] = trechosFotograficos([{ id: 'foto-profissional', intensidade: 'marcada' }])
    expect(pro).toMatch(/lens|f\/\d/i)
    expect(pro).toMatch(/white balance/i)
    const [espaco] = trechosFotograficos([{ id: 'abrir-espaco', area: { x: 0, y: 0, largura: 1, altura: 0.3 } }])
    expect(espaco).toMatch(/top/i)
  })
})

describe('normalizarReceitas', () => {
  it('aceita receitas combinadas num pedido só', () => {
    const r = normalizarReceitas([{ id: 'humanizar', gesto: 'mão puxando o queijo' }, { id: 'foto-profissional' }])
    expect(r.erros).toEqual([])
    expect(r.receitas.map((x) => x.id)).toEqual(['humanizar', 'foto-profissional'])
  })

  it('aceita o id solto, sem objeto', () => {
    expect(normalizarReceitas(['foto-profissional']).receitas).toEqual([{ id: 'foto-profissional' }])
  })

  it('ausente ou vazio é lista vazia, sem erro', () => {
    expect(normalizarReceitas(undefined)).toEqual({ receitas: [], erros: [] })
    expect(normalizarReceitas([])).toEqual({ receitas: [], erros: [] })
  })

  it('recusa receita desconhecida, repetida e parâmetro fora do limite, com todos os erros', () => {
    const r = normalizarReceitas([
      { id: 'postura-e-sorriso' },
      { id: 'humanizar', gesto: 'x'.repeat(201) },
      { id: 'foto-profissional' },
      { id: 'foto-profissional' },
      { id: 'ajuste-livre' },
      { id: 'ajuste-livre', texto: 'y'.repeat(501) },
    ])
    expect(r.receitas).toEqual([])
    expect(r.erros.join('\n')).toMatch(/postura-e-sorriso/)
    expect(r.erros.join('\n')).toMatch(/gesto/)
    expect(r.erros.join('\n')).toMatch(/repetida/)
    expect(r.erros.join('\n')).toMatch(/ajuste-livre.*texto/)
    expect(r.erros.length).toBeGreaterThanOrEqual(4)
  })

  it('recusa o que não é lista', () => {
    expect(normalizarReceitas('humanizar').erros.length).toBe(1)
  })
})

describe('blocoDePreservacao', () => {
  it('sem receita traz as regras da casa', () => {
    const b = blocoDePreservacao([])
    expect(b).toMatch(/food/i)
    expect(b).toMatch(/table|wall|furniture/i)
    expect(b).toMatch(/veil|gradient/i)
    expect(b).toMatch(/face/i)
  })

  it('com humanizar: gente pelas bordas, nunca de terno ou blazer, sem rosto em foco', () => {
    const b = blocoDePreservacao([{ id: 'humanizar' }])
    expect(b).toMatch(/never a suit or blazer/i)
    expect(b).toMatch(/edge/i)
    expect(b).toMatch(/no face in focus/i)
  })

  it('com rosto autorizado não proíbe o rosto em foco, e o terno segue proibido', () => {
    const b = blocoDePreservacao([{ id: 'humanizar', rosto: true }])
    expect(b).not.toMatch(/no face in focus/i)
    expect(b).toMatch(/never a suit or blazer/i)
  })

  it('não repete linha quando duas receitas protegem a mesma coisa', () => {
    const linhas = blocoDePreservacao([{ id: 'humanizar' }, { id: 'foto-profissional' }, { id: 'abrir-espaco' }]).split('\n')
    expect(new Set(linhas).size).toBe(linhas.length)
  })
})

describe('montarPromptDeFoto', () => {
  it('acrescenta o bloco ao fim e não duplica', () => {
    const base = 'Add a hand entering from the right edge.'
    const uma = montarPromptDeFoto(base, [{ id: 'humanizar' }])
    expect(uma.startsWith(base)).toBe(true)
    expect(uma.endsWith(blocoDePreservacao([{ id: 'humanizar' }]))).toBe(true)
    expect(montarPromptDeFoto(uma, [{ id: 'humanizar' }])).toBe(uma)
  })

  it('o teto do prompt de quem escreve é 4000', () => {
    expect(TETO_DO_PROMPT_DE_FOTO).toBe(4000)
  })
})

describe('conferências e chave', () => {
  it('une as conferências das receitas, sem repetir', () => {
    const c = conferenciasDasReceitas([{ id: 'humanizar' }, { id: 'foto-profissional' }])
    expect(c).toEqual(expect.arrayContaining(['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco']))
    expect(new Set(c).size).toBe(c.length)
  })

  it('sem receita (prompt pronto) roda todas', () => {
    expect(conferenciasDasReceitas([]).sort()).toEqual(['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'])
  })

  it('a chave nasce desligada', () => {
    expect(melhoriaDeFotoLigada(undefined)).toBe(false)
    expect(melhoriaDeFotoLigada('')).toBe(false)
    expect(melhoriaDeFotoLigada('false')).toBe(false)
    expect(melhoriaDeFotoLigada('true')).toBe(true)
    expect(melhoriaDeFotoLigada(' 1 ')).toBe(true)
  })
})
