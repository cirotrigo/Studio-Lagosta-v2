/**
 * A caixa da manchete é decidida na STRING, e a prova tem de ser feita no
 * PROMPT — não na função de conversão.
 *
 * A lei que este teste guarda foi medida três vezes (16/08 e 17/08/2026):
 * instrução sobre a caixa perde para a copy literal, venha ela da identidade da
 * marca, do TYPOGRAPHY LOCK ou do MODELO SPINE. Testar `paraCaixaAlta` sozinha
 * provaria que `toLocaleUpperCase` funciona; o que importa é o bloco de copy
 * que chega ao gpt-image.
 *
 * O risco desta mudança é dos dois lados — gritar quem não pede e calar quem
 * pede —, então cada cliente do mapa tem um caso e há um cliente FORA dele.
 */
import { describe, expect, it } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import { buildArtePrompt } from '../image-prompt-builder'

function marca(projectId: number, projectName: string): BrandContext {
  return {
    projectId,
    projectName,
    dna: {
      toneOfVoice: null,
      contentRules: null,
      composition: null,
      visualStyle: null,
      photoDirection: null,
    } as BrandContext['dna'],
    cuisineType: null,
    fonts: { title: 'Didot HTF B06 Bold', subtitle: null, body: 'Montserrat' },
    specimenFontFamilies: [],
    colors: [],
    logoUrl: null,
    brandManualUrl: null,
    artDirection: null,
  }
}

/** Só as linhas do bloco de copy — é lá que a caixa é decidida. */
function blocosDeCopy(prompt: string): string[] {
  const inicio = prompt.indexOf('[COPY — REPRODUZIR VERBATIM, NA ORDEM]')
  const trecho = prompt.slice(inicio)
  return [...trecho.matchAll(/^- "(.+)"$/gm)].map((m) => m[1])
}

function copyDoPrompt(brand: BrandContext | null, copy: string[]): string[] {
  return blocosDeCopy(buildArtePrompt({ copy, brand, refs: [] }))
}

const COPY_DO_TERO = [
  'Almoço executivo',
  'Prato principal e dois acompanhamentos',
  'De terça a sexta, no almoço',
  'Vem provar',
]

describe('caixa da manchete no prompt de arte', () => {
  it('sobe a manchete do TERO para caixa alta, e só ela', () => {
    // A leva reprovada em 17/08/2026: o cliente pediu a headline em caixa alta
    // duas vezes, e o apoio e o CTA saem em caixa natural nas artes aprovadas.
    expect(copyDoPrompt(marca(3, 'TERO'), COPY_DO_TERO)).toEqual([
      'ALMOÇO EXECUTIVO',
      'Prato principal e dois acompanhamentos',
      'De terça a sexta, no almoço',
      'Vem provar',
    ])
  })

  it('não mexe na manchete do TERO que já veio gritada', () => {
    const [manchete] = copyDoPrompt(marca(3, 'TERO'), ['HAPPY HOUR', 'Das 16h às 20h'])
    expect(manchete).toBe('HAPPY HOUR')
  })

  it('desfaz a copy gritada da Real Gelateria, como antes', () => {
    // Regressão do conserto de 16/08: `alta` não pode ter quebrado `natural`.
    expect(copyDoPrompt(marca(1, 'Real Gelateria'), ['DESACELERE E DESFRUTE'])).toEqual([
      'Desacelere e Desfrute',
    ])
  })

  it('não toca na copy de quem está fora do mapa, nas duas direções', () => {
    // By Rock ficou de fora de propósito em 16/08 — a correção para natural
    // mudou o look dele sem ninguém pedir. Sair do mapa é não ter opinião.
    const brand = marca(7, 'By Rock')
    expect(copyDoPrompt(brand, ['Happy hour todo dia'])).toEqual(['Happy hour todo dia'])
    expect(copyDoPrompt(brand, ['HAPPY HOUR TODO DIA'])).toEqual(['HAPPY HOUR TODO DIA'])
  })

  it('sem marca não há caixa a aplicar', () => {
    expect(copyDoPrompt(null, ['Almoço executivo'])).toEqual(['Almoço executivo'])
  })
})

describe('a foto não se trata', () => {
  const prompt = buildArtePrompt({ copy: ['Almoço executivo'], brand: marca(3, 'TERO'), refs: [] })

  it('proíbe puxar contraste, exposição e saturação', () => {
    // A licença antiga ("ajuste global MUITO sutil de contraste, exposição e
    // nitidez") foi o que produziu a foto estourada que o cliente reprovou.
    expect(prompt).toMatch(/NÃO RELUMIE E NÃO TRATE A FOTO/)
    expect(prompt).not.toMatch(/ajuste global MUITO sutil/)
  })

  it('mantém a exceção quando o cliente pede um ajuste', () => {
    const comPedido = buildArtePrompt({
      copy: ['Almoço executivo'],
      brand: marca(3, 'TERO'),
      refs: [],
      instrucaoImagem: 'corte a picanha ao meio',
    })
    expect(comPedido).toMatch(/EXCEÇÃO AUTORIZADA PELO CLIENTE.*corte a picanha ao meio/)
  })
})
