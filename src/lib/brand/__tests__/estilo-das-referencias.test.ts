import { describe, expect, it } from 'vitest'
import {
  estiloBrutoSchema,
  formatarEstiloParaPrompt,
  lerEstiloDasReferencias,
  normalizarEstilo,
  type EstiloBruto,
} from '../estilo-das-referencias'

const bruto: EstiloBruto = {
  tipografia: { manchete: 'slab pesada', apoio: 'grotesk', servico: 'grotesk pequena', destaque: 'manuscrita em amarelo' },
  caixaDaManchete: 'CAIXA ALTA',
  coresDeDestaque: [{ hex: '#FFFFFF', papel: 'texto' }, { hex: '#D53A2A', papel: 'destaque' }],
  separadores: ['filete fino', 'Linha com losango central', 'sublinhado manuscrito amarelo', 'ondulação decorativa'],
  icones: ['relógio', 'Pin de mapa', 'ícone de grupo de pessoas', 'foguete', 'relógio'],
  ornamentos: ['vinheta no rodapé'],
  diagramacao: 'texto à esquerda',
  tratamentoDaFoto: 'intacta',
  logo: 'boi vermelho no canto',
  evitar: ['véu inteiro'],
  resumo: 'Impacto com slab branca e vermelha.',
}

describe('normalizarEstilo — o vocabulário é reconciliado no código, não no parse', () => {
  it('casa sinônimos e acentos com o vocabulário fechado, sem repetir', () => {
    const estilo = normalizarEstilo(bruto)
    expect(estilo.separadores).toEqual(['filete-fino', 'linha-com-losango', 'sublinhado-manuscrito'])
    expect(estilo.icones).toEqual(['relogio', 'pin-de-mapa', 'pessoas'])
    expect(estilo.caixaDaManchete).toBe('alta')
  })

  it('o que não casa vira ornamento descrito, nunca é perdido nem recusa a resposta', () => {
    const estilo = normalizarEstilo(bruto)
    expect(estilo.ornamentos).toContain('separador: ondulação decorativa')
    expect(estilo.ornamentos).toContain('ícone: foguete')
    expect(estilo.ornamentos[0]).toBe('vinheta no rodapé')
  })

  it('o acabamento da manchete é reconciliado do texto do modelo', () => {
    expect(normalizarEstilo({ ...bruto, efeitoDaManchete: 'sombra dura deslocada em verde' }).efeitoDaManchete).toBe('sombra-dura')
    expect(normalizarEstilo({ ...bruto, efeitoDaManchete: 'contorno branco' }).efeitoDaManchete).toBe('contorno')
    expect(normalizarEstilo({ ...bruto, efeitoDaManchete: 'sombra suave' }).efeitoDaManchete).toBe('sombra-suave')
    expect(normalizarEstilo(bruto).efeitoDaManchete).toBe('nenhum')
    expect(formatarEstiloParaPrompt(normalizarEstilo({ ...bruto, efeitoDaManchete: 'sombra-dura' }))).toContain('sombra DURA')
  })

  it('sem ícone reconhecido devolve ["nenhum"], e caixa desconhecida vira natural', () => {
    const estilo = normalizarEstilo({ ...bruto, icones: ['foguete'], caixaDaManchete: 'title case' })
    expect(estilo.icones).toEqual(['nenhum'])
    expect(estilo.caixaDaManchete).toBe('natural')
  })

  it('o schema bruto aceita texto livre onde o modelo erra o vocabulário', () => {
    expect(estiloBrutoSchema.safeParse(bruto).success).toBe(true)
  })
})

describe('lerEstiloDasReferencias — o Json do banco é lido com tolerância', () => {
  it('devolve null para forma inválida, nunca lança', () => {
    expect(lerEstiloDasReferencias(null)).toBeNull()
    expect(lerEstiloDasReferencias('x')).toBeNull()
    expect(lerEstiloDasReferencias({ tipografia: {} })).toBeNull()
  })

  it('lê o que foi gravado e preserva a proveniência', () => {
    const gravado = { ...normalizarEstilo(bruto), fontes: { generationIds: ['g1'], urls: [], lidoEm: '2026-09-05', modelo: 'gpt-5.2' } }
    const lido = lerEstiloDasReferencias(JSON.parse(JSON.stringify(gravado)))
    expect(lido?.separadores).toEqual(['filete-fino', 'linha-com-losango', 'sublinhado-manuscrito'])
    expect(lido?.fontes.generationIds).toEqual(['g1'])
  })
})

describe('formatarEstiloParaPrompt — o texto que o diretor de arte recebe', () => {
  it('nomeia separadores e ícones em português e diz quando a marca não usa nenhum', () => {
    const texto = formatarEstiloParaPrompt(normalizarEstilo(bruto))
    expect(texto).toContain('filete fino, filete com losango central, sublinhado manuscrito')
    expect(texto).toContain('relógio, pin de mapa, pessoas')
    expect(texto).toContain('caixa alta')
    const semNada = formatarEstiloParaPrompt(normalizarEstilo({ ...bruto, separadores: [], icones: [] }))
    expect(semNada).toContain('A marca não usa separadores.')
    expect(semNada).toContain('A marca não usa ícones.')
  })
})
