/**
 * A linha única do autor distribuída em linhas EQUILIBRADAS quando não cabe no teto (pedido do Ciro, 03/11/2026):
 * cabe em 1 → 1; não cabe → a quebra que deixa a linha mais larga o mais estreita possível, em até `linhasMax`
 * linhas; nada cabendo, a escada desce sobre a quebra. Sem `linhasMax` (sem arquétipo), nada muda: recusa como antes.
 * A camada declara a quebra (`distribuida`), e o leitor da copy efetiva devolve a linha única do autor.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, type CopyAutoral } from '@/lib/copy-autoral'
import { distribuirLinha, montarBloco } from '../blocos'

/** Régua falsa: 0,55 × fontSize por caractere, uma linha por \n. */
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const larguraDaLinha = (l: string) => l.length * fontSize * 0.55
  const box = layer.size.width - 12
  const quebradas = linhas.reduce((n, l) => n + Math.max(1, Math.ceil(larguraDaLinha(l) / box)), 0)
  return { height: quebradas * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.min(box, Math.max(...linhas.map(larguraDaLinha))), lineCount: quebradas }
}

// 96 px × 0,55 = 52,8 px por caractere: na coluna de 896 cabem 16 caracteres por linha.
const estilo = { fontFamily: 'TrajanPro', fontSize: 96, lineHeight: 1, letterSpacing: 0, color: '#F8F8F8' }
const base = { papel: 'headline' as const, estilo, escalaDoFormato: 1, colunaUtil: 896, textAlign: 'left' as const, groupId: 'g', corDaMancha: '#000', medir: medirFalso, origem: { bloco: 'headline', linhas: [0] } }

describe('distribuirLinha', () => {
  const camada = montarBloco({ ...base, linhas: ['x'] }).bloco!.layer
  it('cabe em uma linha → null (fica em uma)', () => {
    expect(distribuirLinha(medirFalso, camada, 'Toast da casa', 896, 2)).toBeNull()
  })
  it('não cabe → a quebra que minimiza a linha mais larga, no menor n que cabe', () => {
    // 'Toast da casa com' (17) estoura; 'Toast da casa' / 'com ovos mexidos' (13 / 16) é a mais equilibrada que cabe.
    expect(distribuirLinha(medirFalso, camada, 'Toast da casa com ovos mexidos', 896, 2)).toEqual(['Toast da casa', 'com ovos mexidos'])
    // Com 3 linhas permitidas, 2 bastam: o menor n que cabe vence.
    expect(distribuirLinha(medirFalso, camada, 'Toast da casa com ovos mexidos', 896, 3)).toEqual(['Toast da casa', 'com ovos mexidos'])
  })
  it('nada cabe nem no teto de linhas → a melhor quebra mesmo assim', () => {
    expect(distribuirLinha(medirFalso, camada, 'Croissant amanteigado tradicional', 896, 2)).toEqual(['Croissant amanteigado', 'tradicional'])
  })
  it('palavra única, espaço duplo, NBSP ou \\n dentro do item → null (não há onde quebrar com fidelidade)', () => {
    expect(distribuirLinha(medirFalso, camada, 'Croissantamanteigadotradicional', 896, 2)).toBeNull()
    expect(distribuirLinha(medirFalso, camada, 'Toast da  casa com ovos mexidos', 896, 2)).toBeNull()
    expect(distribuirLinha(medirFalso, camada, 'Toast\u00A0da\u00A0casa\u00A0com\u00A0ovos\u00A0mexidos', 896, 2)).toBeNull()
    expect(distribuirLinha(medirFalso, camada, 'Toast da casa\ncom ovos mexidos', 896, 2)).toBeNull()
  })
})

describe('montarBloco com linhasMax', () => {
  it('a linha que não cabe no teto sai em 2 linhas cheias, declaradas na camada', () => {
    const r = montarBloco({ ...base, linhas: ['Toast da casa com ovos mexidos'], linhasMax: 2 })
    expect(r.bloco).not.toBeNull()
    expect(r.bloco!.escala).toBe(1)
    expect(r.bloco!.layer.content).toBe('Toast da casa\ncom ovos mexidos')
    expect(r.bloco!.distribuida).toEqual(['Toast da casa', 'com ovos mexidos'])
    expect(r.bloco!.layer.metadata?.compositor).toEqual({ papel: 'headline', bloco: 'headline', linhas: [0], distribuida: 2 })
    expect(r.avisos).toEqual(['headline: "Toast da casa com ovos mexidos" distribuída em 2 linhas pelo compositor'])
  })
  it('a linha que cabe fica em uma, sem marca', () => {
    const r = montarBloco({ ...base, linhas: ['Toast da casa'], linhasMax: 2 })
    expect(r.bloco!.layer.content).toBe('Toast da casa')
    expect(r.bloco!.distribuida).toBeUndefined()
    expect(r.bloco!.layer.metadata?.compositor).toEqual({ papel: 'headline', bloco: 'headline', linhas: [0] })
  })
  it('nada cabe no teto nem quebrada: a escada desce sobre a quebra', () => {
    const r = montarBloco({ ...base, linhas: ['Croissant amanteigado tradicional'], linhasMax: 2 })
    expect(r.bloco).not.toBeNull()
    expect(r.bloco!.layer.content).toBe('Croissant amanteigado\ntradicional')
    expect(r.bloco!.escala).toBeLessThan(1)
  })
  it('duas linhas do autor não são redistribuídas; sem linhasMax a recusa é a de sempre', () => {
    const duas = montarBloco({ ...base, linhas: ['Toast da casa', 'com ovos mexidos'], linhasMax: 2 })
    expect(duas.bloco!.distribuida).toBeUndefined()
    const sem = montarBloco({ ...base, linhas: ['Toast da casa com ovos mexidos'] })
    expect(sem.bloco).toBeNull()
    expect(sem.recusa!.orcamento[0]).toMatchObject({ linha: 'Toast da casa com ovos mexidos', coluna: 896 })
  })
  it('linha com [destaque] não é distribuída (o colchete não atravessa a quebra)', () => {
    const r = montarBloco({ ...base, linhas: ['Toast da casa com [ovos] mexidos'], linhasMax: 2, destaque: { fontFamily: 'TrajanPro', fill: '#FFD166' } })
    expect(r.bloco).toBeNull()
  })
})

describe('a copy efetiva devolve a linha única do autor', () => {
  const original: CopyAutoral = {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-11-03T10:00:00.000Z', superficie: 'chat' },
    blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Toast da casa com ovos mexidos'] }],
    revisoes: [],
  }
  it('camada distribuída em 2 → bloco com 1 linha, sem mudança registrada', () => {
    const layer = montarBloco({ ...base, linhas: ['Toast da casa com ovos mexidos'], linhasMax: 2 }).bloco!.layer
    const r = copyEfetivaDasCamadas(original, [{ ...layer, position: { x: 0, y: 200 } }], { superficie: 'compositor' })
    expect(r.efetiva.blocos[0].linhas).toEqual(['Toast da casa com ovos mexidos'])
    expect(r.mudancas).toEqual([])
  })
  it('a equipe acrescentou uma linha na camada distribuída → a declaração não cobre, as linhas valem como estão', () => {
    const layer = montarBloco({ ...base, linhas: ['Toast da casa com ovos mexidos'], linhasMax: 2 }).bloco!.layer
    const r = copyEfetivaDasCamadas(original, [{ ...layer, content: 'Toast da casa\ncom ovos mexidos\nhoje', position: { x: 0, y: 200 } }], { superficie: 'editor' })
    expect(r.efetiva.blocos[0].linhas).toEqual(['Toast da casa', 'com ovos mexidos', 'hoje'])
  })
})
