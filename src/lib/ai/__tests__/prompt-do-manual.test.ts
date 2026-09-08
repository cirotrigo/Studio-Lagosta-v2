/**
 * O prompt do manual: a peça descrita a partir do design system. O que se
 * protege são os cinco defeitos consertados em 08/09/2026 antes da segunda
 * rodada (caixa do mapa da casa, destaque encaixado na paleta, prosa sem
 * tratamento da foto, pontuação do "evite", numeração contígua) e as duas
 * variações que o runner manda (logo colada, ajuste na foto).
 */
import { describe, expect, it } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import type { EstiloDasReferencias } from '@/lib/brand/estilo-das-referencias'
import { cantoDaLogoDoEstilo, coresDaPeca, montarPromptDoManual } from '../prompt-do-manual'

function marca(projectId: number, projectName: string): BrandContext {
  return {
    projectId,
    projectName,
    dna: { toneOfVoice: null, contentRules: null, composition: null, visualStyle: null, photoDirection: null } as BrandContext['dna'],
    cuisineType: null,
    fonts: { title: 'Didot', subtitle: 'Cormorant', body: 'Montserrat' },
    specimenFontFamilies: [],
    colors: [
      { name: 'Merlot Profundo', hexCode: '#722f37' },
      { name: 'Cinza Chumbo', hexCode: '#2C3E50' },
      { name: 'Creme Off-White', hexCode: '#F9F7F2' },
      { name: 'Amarelo da logo', hexCode: '#FCE77B' },
    ] as BrandContext['colors'],
    logoUrl: null,
    brandManualUrl: 'https://blob/manual.png',
    artDirection: null,
  }
}

function estilo(extra: Partial<EstiloDasReferencias> = {}): EstiloDasReferencias {
  return {
    resumo: 'Linguagem clássica de adega: manchetes em serifa itálica, acentos dourados com filetes finos',
    evitar: ['Manchete em fonte manuscrita.', 'Contorno nas letras;'],
    caixaDaManchete: 'alta',
    coresDeDestaque: [{ hex: '#D6B15A', nome: 'dourado' }],
    separadores: ['linha-com-ponto'],
    logo: 'selo circular no canto superior direito',
    diagramacao: 'blocos alinhados à esquerda',
    ...extra,
  } as unknown as EstiloDasReferencias
}

const COPY = ['Happy Hour', 'Brinde com descontos especiais em vinhos e entradas selecionadas.', 'Seg a Sáb - 16h às 19h']

describe('montarPromptDoManual', () => {
  it('a caixa vem do mapa da casa, não da leitura das peças', () => {
    // Wine Vix (11) está no mapa como natural; a leitura diz alta e perde.
    expect(montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: estilo(), copy: COPY })).toContain('em caixa natural (só a inicial maiúscula)')
    // TERO (3) está no mapa como alta; a leitura diz natural e perde.
    expect(montarPromptDoManual({ brand: marca(3, 'TERO'), estilo: estilo({ caixaDaManchete: 'natural' }), copy: COPY })).toContain('em CAIXA ALTA')
    // Fora do mapa, vale a leitura.
    expect(montarPromptDoManual({ brand: marca(99, 'Outra'), estilo: estilo({ caixaDaManchete: 'natural' }), copy: COPY })).toContain('em caixa natural')
  })

  it('a cor de destaque lida nas peças é encaixada na cor mais próxima da PALETA, com nome', () => {
    const { texto, destaque } = coresDaPeca(marca(11, 'Wine Vix'), estilo())
    expect(texto).toEqual({ nome: 'Creme Off-White', hex: '#F9F7F2' })
    expect(destaque).toEqual({ nome: 'Amarelo da logo', hex: '#FCE77B' })
    const p = montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: estilo(), copy: COPY })
    expect(p).toContain('UMA palavra-chave em Amarelo da logo (#FCE77B)')
    expect(p).not.toContain('#D6B15A')
    expect(p).not.toContain('em destaque (')
  })

  it('a direção estética perde as orações sobre tratamento da foto e fecha a pontuação', () => {
    const p = montarPromptDoManual({
      brand: marca(7, 'By Rock'),
      estilo: estilo({ resumo: 'Assinatura “rock bar” com foto escura + tarja preta, manchete em grotesk condensada, waveform vermelha como divisor. Logo no topo, sobre degradê escuro.' }),
      copy: COPY,
    })
    const direcao = p.split('DIREÇÃO ESTÉTICA\n')[1].split('\n')[0]
    expect(direcao).not.toMatch(/tarja|degrad/)
    expect(direcao.startsWith('Manchete em grotesk condensada, waveform vermelha como divisor. Logo no topo.')).toBe(true)
    // "Evite" sem pontuação dobrada: o ponto final de cada item some.
    expect(direcao).toContain('Evite: Manchete em fonte manuscrita; Contorno nas letras.')
    expect(direcao).not.toContain('.;')
    expect(direcao).not.toContain('..')
  })

  it('as seções são numeradas de forma contígua, e o serviço vai ao rodapé', () => {
    const p = montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: estilo(), copy: COPY })
    // Só os CABEÇALHOS (linha inteira em caixa alta) — a lista da hierarquia também é numerada.
    const numeros = [...p.matchAll(/^(\d+)\. [A-ZÁÉÍÓÚÇ ]+$/gm)].map((m) => Number(m[1]))
    expect(numeros).toEqual(numeros.map((_, i) => i + 1))
    expect(p).toContain('RODAPÉ\nTexto exato: “Seg a Sáb - 16h às 19h”')
    expect(p).toContain('TÍTULO\nTexto exato: “Happy Hour”')
    expect(p).toContain('SUBTÍTULO\nTexto exato: “Brinde com descontos especiais em vinhos e entradas selecionadas.”')
    expect(p).toContain('FILETE\nFeche o bloco com um filete com ponto central do manual')
    // Os textos exatos são a última seção.
    expect(p.trim().endsWith(`TEXTOS EXATOS — NÃO MODIFICAR:\n${COPY.join('\n')}`)).toBe(true)
  })

  it('sem serviço na copy não há RODAPÉ nem linha de serviço na hierarquia', () => {
    const p = montarPromptDoManual({ brand: marca(1, 'Real'), estilo: estilo(), copy: ['Feriado merece sabores Real', 'Croissant, quentinho'] })
    expect(p).not.toContain('RODAPÉ')
    expect(p.split('HIERARQUIA\n')[1]).not.toContain('a linha de serviço')
  })

  it('logo colada por código: a seção da logo vira reserva do canto e a marca sai da hierarquia', () => {
    const p = montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: estilo(), copy: COPY, logo: { modo: 'compor', canto: 'top-right' } })
    expect(p).toContain('LOGOTIPO\nNão desenhe o logotipo: o arquivo oficial é colado pelo sistema depois da geração, no canto superior direito.')
    expect(p).not.toContain('Reproduza o logotipo')
    expect(p).not.toContain('o logotipo como assinatura')
    expect(p).not.toContain('logo abaixo da logo')
  })

  it('ajuste na foto e observação de quem pediu', () => {
    const p = montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: estilo(), copy: COPY, instrucaoImagem: 'tire o garfo da esquerda', pedido: 'título menor' })
    expect(p).toContain('A ÚNICA alteração permitida na fotografia é esta, pedida pelo cliente: tire o garfo da esquerda. Fora isso, não altere')
    expect(p).toContain('Alterar a fotografia além do que foi pedido.')
    expect(p).toContain('OBSERVAÇÃO DE QUEM PEDIU A PEÇA — atenda sem sair do manual:\ntítulo menor')
    expect(p.indexOf('OBSERVAÇÃO')).toBeLessThan(p.indexOf('TEXTOS EXATOS'))
  })

  it('sem estilo lido, o prompt sai inteiro com os defaults', () => {
    const p = montarPromptDoManual({ brand: marca(11, 'Wine Vix'), estilo: null, copy: COPY })
    expect(p).not.toContain('DIREÇÃO ESTÉTICA')
    expect(p).toContain('centralizada na parte superior')
    expect(p).toContain('Feche o bloco com um filete fino do manual')
  })
})

describe('cantoDaLogoDoEstilo', () => {
  it('lê o canto da prosa e devolve null para marca centralizada', () => {
    expect(cantoDaLogoDoEstilo(estilo())).toBe('top-right')
    expect(cantoDaLogoDoEstilo(estilo({ logo: 'logo no rodapé, canto inferior esquerdo' }))).toBe('bottom-left')
    expect(cantoDaLogoDoEstilo(estilo({ logo: 'logo centralizada no topo', diagramacao: 'centralizado' }))).toBeNull()
    expect(cantoDaLogoDoEstilo(null)).toBeNull()
  })
})
