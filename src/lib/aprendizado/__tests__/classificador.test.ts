import { describe, it, expect } from 'vitest'
import {
  ecoDe,
  montarPromptDeClassificacao,
  reconciliarClassificacao,
  type PostParaClassificar,
} from '@/lib/aprendizado/classificador'
import { PILAR_OUTRO, type Pilar } from '@/lib/aprendizado/pilares'

const TAXONOMIA: Pilar[] = [
  { slug: 'happy-hour', nome: 'Happy hour' },
  { slug: 'almoco', nome: 'Almoço executivo' },
  { slug: 'delivery', nome: 'Delivery' },
]

const POSTS: PostParaClassificar[] = [
  { id: 'p1', texto: 'Happy hour todo dia das 16h às 19h com chope gelado' },
  { id: 'p2', texto: 'Almoço executivo de segunda a sexta, prato do dia' },
  { id: 'p3', texto: 'Peça pelo delivery e receba em casa hoje mesmo' },
]

describe('eco', () => {
  it('normaliza caixa, acento e pontuação', () => {
    expect(ecoDe('Almoço EXECUTIVO de segunda a sexta, prato', 4)).toBe('almoco executivo de segunda')
  })
})

describe('reconciliação — o índice do modelo não é confiável', () => {
  it('amarra pelo eco quando o modelo desloca a lista inteira', () => {
    // O defeito real medido no crivo do By Rock: respostas certas, índices
    // deslocados em uma posição. Pelo índice, cada post receberia o pilar do
    // vizinho; pelo eco, tudo cai no lugar.
    const itens = [
      { indice: 0, eco: 'Happy hour todo dia das', pilar: 'happy-hour', confianca: 0.9 },
      { indice: 1, eco: 'Almoço executivo de segunda a sexta', pilar: 'almoco', confianca: 0.9 },
      { indice: 2, eco: 'Peça pelo delivery e receba', pilar: 'delivery', confianca: 0.9 },
    ].map((x, i) => ({ ...x, indice: i + 1 })) // desloca TODOS os índices

    const r = reconciliarClassificacao(POSTS, itens, TAXONOMIA)
    expect(r.classificacoes.map((c) => [c.postId, c.pilar])).toEqual([
      ['p1', 'happy-hour'],
      ['p2', 'almoco'],
      ['p3', 'delivery'],
    ])
    expect(r.naoClassificados).toEqual([])
  })

  it('usa o índice apenas quando o eco não veio', () => {
    const r = reconciliarClassificacao(POSTS, [{ indice: 1, pilar: 'almoco', confianca: 0.9 }], TAXONOMIA)
    expect(r.classificacoes).toEqual([
      expect.objectContaining({ postId: 'p2', pilar: 'almoco' }),
    ])
  })

  it('eco que não casa é DESCARTADO — não cai no índice', () => {
    const r = reconciliarClassificacao(
      POSTS,
      [{ indice: 0, eco: 'texto que nunca existiu aqui', pilar: 'happy-hour', confianca: 0.99 }],
      TAXONOMIA,
    )
    expect(r.classificacoes).toEqual([])
    expect(r.naoClassificados).toEqual(['p1', 'p2', 'p3'])
    expect(r.avisos[0]).toContain('descartada')
  })

  it('eco ambíguo entre textos DIFERENTES não decide nada', () => {
    const gemeos: PostParaClassificar[] = [
      { id: 'a', texto: 'Happy hour hoje com chope' },
      { id: 'b', texto: 'Happy hour hoje com vinho' },
    ]
    const r = reconciliarClassificacao(
      gemeos,
      [{ eco: 'Happy hour hoje', pilar: 'happy-hour', confianca: 0.9 }],
      TAXONOMIA,
    )
    expect(r.classificacoes).toEqual([])
    expect(r.naoClassificados).toEqual(['a', 'b'])
  })

  it('empate entre textos IDÊNTICOS não é ambiguidade — a mesma peça sai duas vezes', () => {
    // Medido no Wine Vix: a mesma copy publicada duas vezes custava 8 de 25
    // classificações quando o empate era tratado como ambiguidade.
    const repetidos: PostParaClassificar[] = [
      { id: 'a', texto: 'Festival Italiano menu exclusivo durante todo o mês' },
      { id: 'b', texto: 'Festival Italiano menu exclusivo durante todo o mês' },
    ]
    const r = reconciliarClassificacao(
      repetidos,
      [
        { eco: 'Festival Italiano menu exclusivo', pilar: 'happy-hour', confianca: 0.9 },
        { eco: 'Festival Italiano menu exclusivo', pilar: 'happy-hour', confianca: 0.9 },
      ],
      TAXONOMIA,
    )
    expect(r.classificacoes.map((c) => c.postId).sort()).toEqual(['a', 'b'])
    expect(r.naoClassificados).toEqual([])
  })

  it('não usa o mesmo post duas vezes', () => {
    const itens = [
      { eco: 'Happy hour todo dia', pilar: 'happy-hour', confianca: 0.9 },
      { eco: 'Happy hour todo dia', pilar: 'delivery', confianca: 0.9 },
    ]
    const r = reconciliarClassificacao(POSTS, itens, TAXONOMIA)
    expect(r.classificacoes.length).toBe(1)
    expect(r.classificacoes[0].pilar).toBe('happy-hour')
  })
})

describe('travas do código, não do prompt', () => {
  it('pilar inventado pelo modelo vira "outro"', () => {
    const r = reconciliarClassificacao(
      POSTS,
      [{ eco: 'Happy hour todo dia', pilar: 'bebidas-geladas', confianca: 0.99 }],
      TAXONOMIA,
    )
    expect(r.classificacoes[0].pilar).toBe(PILAR_OUTRO)
  })

  it('confiança baixa vira "outro" mesmo com pilar válido', () => {
    const r = reconciliarClassificacao(
      POSTS,
      [{ eco: 'Happy hour todo dia', pilar: 'happy-hour', confianca: 0.3 }],
      TAXONOMIA,
    )
    expect(r.classificacoes[0].pilar).toBe(PILAR_OUTRO)
    expect(r.classificacoes[0].confianca).toBe(0.3)
  })

  it('confiança ausente vira "outro" — o schema aceita o campo faltando', () => {
    const r = reconciliarClassificacao(POSTS, [{ eco: 'Happy hour todo dia', pilar: 'happy-hour' }], TAXONOMIA)
    expect(r.classificacoes[0].pilar).toBe(PILAR_OUTRO)
    expect(r.classificacoes[0].confianca).toBeNull()
  })
})

describe('prompt', () => {
  it('lista a taxonomia e oferece "outro" explicitamente', () => {
    const prompt = montarPromptDeClassificacao(TAXONOMIA, POSTS)
    expect(prompt).toContain('happy-hour: Happy hour')
    expect(prompt).toContain('- outro:')
    expect(prompt).toContain('0. Happy hour todo dia')
  })
})
