import { describe, expect, it } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import { precedenciaDaVoz, type VozCompacta } from '@/lib/brand/voz'
import { corpoDoMoldeDaPorta } from '../contexto-visual-da-geracao'

/**
 * PR7-FINAL-03 (revisão final do Codex, 18/09/2026): cliente migrado com
 * regra de arte ativa, diretor fora do ar, geração pela porta — o molde
 * (manual ou referência) não lia `voz.regrasDeArte`, e a regra sumia
 * justamente no fallback. A voz passa pela precedência REAL: regra de arte
 * ativa entra, a substituída e a exclusiva de copy ficam fora, e a copy exata
 * continua sendo o fim do prompt.
 */

const ARTE = 'Horário e CTA sempre no rodapé, mesmo sem endereço'
const AMBAS = 'Nunca escrever preço em vermelho'
const SUBSTITUIDA = 'Horário sempre junto da manchete'
const SO_COPY = 'Nunca usar Vem pro fogo como CTA'

const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Fala de dono de churrascaria.',
  tratamento: 'você',
  exemplos: [],
  antesDepois: [],
  termos: [],
  proibicoes: [],
  regras: [
    { id: 'r-velha', texto: SUBSTITUIDA, motivo: 'antiga', em: '2026-09-01', escopo: 'arte', ativa: false },
    { id: 'r-arte', texto: ARTE, motivo: 'peça empilhada', em: '2026-09-10', escopo: 'arte', ativa: true, substitui: 'r-velha' },
    { id: 'r-ambas', texto: AMBAS, motivo: 'o Ciro pediu', em: '2026-09-11', escopo: 'ambas', ativa: true },
    { id: 'r-copy', texto: SO_COPY, motivo: 'reprovado', em: '2026-09-06', escopo: 'copy', ativa: true },
  ],
}

function marca(): BrandContext {
  return {
    projectId: 6,
    projectName: 'Espeto Gaúcho',
    fonts: { title: 'Bevan', subtitle: 'Caveat', body: 'Barlow Condensed' },
    specimenFontFamilies: [],
    colors: [{ name: 'Vermelho', hexCode: '#F4301A' }, { name: 'Creme', hexCode: '#F9F7F2' }],
    cuisineType: null,
    logoUrl: null,
    brandManualUrl: 'https://example.com/manual.png',
    artDirection: null,
    voz: precedenciaDaVoz({ registro: { voz, versao: 3, migradaEm: '2026-09-12T10:00:00.000Z' }, dna: { toneOfVoice: null, contentRules: null } }),
    dna: { visualStyle: null, composition: null, contentRules: null, toneOfVoice: null, photoDirection: null, approvalChecklist: null },
    estiloDasReferencias: null,
  } as unknown as BrandContext
}

const copy = ['Costela no bafo', 'Sexta, das 18h às 23h']

describe('o molde da porta leva as regras de arte da voz compacta (PR7-FINAL-03)', () => {
  const casos = [
    { nome: 'porta do manual', porta: 'manual' as const, soDiretor: false },
    { nome: 'porta da referência', porta: 'referencia' as const, soDiretor: false },
  ]
  for (const c of casos) {
    for (const canto of [null, 'bottom-right' as const]) {
      it(`${c.nome}${canto ? ' com logo colada' : ''}: regra ativa presente, substituída e exclusiva de copy ausentes, copy exata no fim`, () => {
        const { fallbackPorta, corpo } = corpoDoMoldeDaPorta({ porta: c.porta, referenciaSoParaODiretor: c.soDiretor, brand: marca(), copy, formato: 'story', cantoDaLogoColada: canto, layoutLivre: true })
        expect(fallbackPorta).toBe(c.porta)
        expect(corpo).toContain(ARTE)
        expect(corpo).toContain(AMBAS)
        expect(corpo).not.toContain(SUBSTITUIDA)
        expect(corpo).not.toContain(SO_COPY)
        // A prioridade da copy exata: nada vem depois dela.
        expect(corpo.lastIndexOf(copy[1])).toBeGreaterThan(corpo.lastIndexOf(AMBAS))
      })
    }
  }

  it('referência só para o diretor cai no manual — e o manual também leva a regra', () => {
    const { fallbackPorta, corpo } = corpoDoMoldeDaPorta({ porta: 'referencia', referenciaSoParaODiretor: true, brand: marca(), copy, cantoDaLogoColada: null, layoutLivre: false })
    expect(fallbackPorta).toBe('manual')
    expect(corpo).toContain(ARTE)
  })

  it('controle: cliente não migrado não ganha regra da voz', () => {
    const brand = { ...marca(), voz: precedenciaDaVoz({ registro: { voz, versao: 3, migradaEm: null }, dna: { toneOfVoice: null, contentRules: null } }) }
    for (const porta of ['manual', 'referencia'] as const) {
      const { corpo } = corpoDoMoldeDaPorta({ porta, referenciaSoParaODiretor: false, brand, copy, cantoDaLogoColada: null, layoutLivre: false })
      expect(corpo).not.toContain(ARTE)
    }
  })
})
