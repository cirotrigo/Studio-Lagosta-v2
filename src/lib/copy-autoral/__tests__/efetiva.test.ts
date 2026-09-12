import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyComparavel, copyEfetivaDasCamadas, espelhoPosicional, type CopyAutoral } from '..'

function texto(id: string, y: number, content: string, extra: Partial<Layer> = {}): Layer {
  return { id, name: id, type: 'text', visible: true, locked: false, order: 1, content, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id.replace(/-\d+$/, '') } }, ...extra } as Layer
}

const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Na sexta o'] },
    { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Milk-shake', 'vem [em dobro]'], estilo: { linhasNaVoz2: [1] } },
    { id: 'servico-horario', funcao: 'servico', ordem: 2, linhas: ['Seg a sáb · 11h às 22h'] },
    { id: 'servico-lugar', funcao: 'servico', ordem: 3, linhas: ['Praia do Canto'] },
  ],
  revisoes: [],
}

describe('a copy efetiva lida das camadas', () => {
  it('peça fiel: mesmas linhas, segunda voz volta ao bloco da manchete DECLARADA, rich text volta com [colchetes] — sem revisão', () => {
    const camadas: Layer[] = [
      texto('pre', 100, 'Na sexta o'),
      texto('headline', 200, 'Milk-shake'),
      { ...texto('headline2', 300, 'vem em dobro'), type: 'rich-text', richTextStyles: [{ start: 4, end: 12, fill: '#ff0000' }], style: { fontSize: 40, color: '#ffffff' } } as Layer,
      texto('servico', 1700, 'Seg a sáb · 11h às 22h'),
      texto('servico-2', 1760, 'Praia do Canto', { metadata: { compositor: { papel: 'servico' } } } as Partial<Layer>),
    ]
    const r = copyEfetivaDasCamadas(original, camadas, { superficie: 'compositor' })
    expect(r.lacunas).toEqual([])
    expect(r.mudancas).toEqual([])
    expect(r.efetiva.revisoes).toEqual([])
    const manchete = r.efetiva.blocos.find((b) => b.id === 'headline')!
    expect(manchete.linhas).toEqual(['Milk-shake', 'vem [em dobro]'])
    expect(r.efetiva.blocos.find((b) => b.id === 'servico-lugar')!.linhas).toEqual(['Praia do Canto'])
    expect(copyComparavel(r.efetiva)).toBe(true)
  })

  it('segunda voz NÃO declarada pelo autor e desenhada pela arte é revisão do sistema no campo estilo — nunca some em silêncio', () => {
    const semVoz2: CopyAutoral = { ...original, blocos: original.blocos.map((b) => (b.id === 'headline' ? { id: b.id, funcao: b.funcao, ordem: b.ordem, linhas: b.linhas } : b)) }
    const camadas: Layer[] = [texto('pre', 100, 'Na sexta o'), texto('headline', 200, 'Milk-shake'), texto('headline2', 300, 'vem [em dobro]'), texto('servico', 1700, 'Seg a sáb · 11h às 22h'), texto('servico-2', 1760, 'Praia do Canto')]
    const r = copyEfetivaDasCamadas(semVoz2, camadas, { superficie: 'compositor' })
    expect(r.mudancas).toEqual([expect.objectContaining({ id: 'headline', tipo: 'alterado', campos: ['estilo'] })])
    expect(r.efetiva.revisoes[0]).toMatchObject({ autor: 'sistema', blocos: ['headline'] })
    expect(r.efetiva.blocos.find((b) => b.id === 'headline')!.estilo).toEqual({ linhasNaVoz2: [1] })
  })

  it('a arte mudou uma palavra: revisão do SISTEMA com a superfície, e o diff aponta o bloco', () => {
    const camadas: Layer[] = [texto('pre', 100, 'Na sexta o'), texto('headline', 200, 'Milk-shake\nvem em dobro'), texto('servico', 1700, 'Seg a sáb · 11h as 22h'), texto('servico-2', 1760, 'Praia do Canto')]
    const r = copyEfetivaDasCamadas(original, camadas, { superficie: 'compositor', em: '2026-09-12T10:05:00.000Z' })
    expect(r.mudancas.map((m) => m.id).sort()).toEqual(['headline', 'servico-horario'])
    expect(r.efetiva.revisoes).toHaveLength(1)
    expect(r.efetiva.revisoes[0]).toMatchObject({ autor: 'sistema', superficie: 'compositor', blocos: expect.arrayContaining(['headline', 'servico-horario']) })
    // a manchete sem headline2 e sem colchetes é diferença REAL (perdeu o destaque)
    expect(r.efetiva.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Milk-shake', 'vem em dobro'])
  })

  it('bloco não desenhado volta VAZIO com lacuna; texto a mais vira bloco extra com lacuna — nada some', () => {
    const camadas: Layer[] = [texto('pre', 100, 'Na sexta o'), texto('headline', 200, 'Milk-shake\nvem [em dobro]'), texto('servico', 1700, 'Seg a sáb · 11h às 22h'), texto('aviso-solto', 1800, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const r = copyEfetivaDasCamadas(original, camadas, { superficie: 'ajuste-arte' })
    expect(r.efetiva.blocos.find((b) => b.id === 'servico-lugar')!.linhas).toEqual([])
    expect(r.lacunas.some((l) => /"servico-lugar".*não foi desenhado/.test(l))).toBe(true)
    const extra = r.efetiva.blocos.find((b) => b.id.startsWith('extra-'))!
    expect(extra).toMatchObject({ funcao: 'livre', linhas: ['Só hoje'] })
    expect(r.lacunas.some((l) => /a arte tem um texto que a copy não tinha/.test(l))).toBe(true)
    expect(r.efetiva.lacunas).toEqual(expect.arrayContaining(r.lacunas))
  })

  it('camada oculta não conta como desenhada', () => {
    const camadas: Layer[] = [texto('pre', 100, 'Na sexta o'), texto('headline', 200, 'Milk-shake\nvem [em dobro]'), texto('servico', 1700, 'x', { visible: false } as Partial<Layer>), texto('servico-2', 1760, 'Praia do Canto')]
    const r = copyEfetivaDasCamadas(original, camadas, { superficie: 'editor' })
    // a única camada visível de serviço casa com o PRIMEIRO bloco de serviço; o segundo fica vazio
    expect(r.efetiva.blocos.find((b) => b.id === 'servico-horario')!.linhas).toEqual(['Praia do Canto'])
    expect(r.efetiva.blocos.find((b) => b.id === 'servico-lugar')!.linhas).toEqual([])
  })
})

describe('o espelho posicional', () => {
  it('um item por bloco, na ordem de leitura, linhas unidas por \\n', () => {
    expect(espelhoPosicional(original)).toEqual(['Na sexta o', 'Milk-shake\nvem [em dobro]', 'Seg a sáb · 11h às 22h', 'Praia do Canto'])
  })
})
