import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, idDeExtra, lerCopyAutoral, renomearExtrasDuplicados, revisaoDaPaginaComCamadas, serializarCopyAutoral, type CopyAutoral } from '..'

function texto(id: string, y: number, content: string, extra: Partial<Layer> = {}): Layer {
  return { id, name: id, type: 'text', visible: true, locked: false, order: 1, content, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id.replace(/-\d+$/, '') } }, ...extra } as Layer
}

const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Conheça nossos pacotes'] },
  ],
  revisoes: [],
}

describe('a revisão da página a partir das camadas (puro — entra na MESMA escrita das camadas)', () => {
  it('sem contrato gravado: sem-contrato, nada é inventado', () => {
    expect(revisaoDaPaginaComCamadas(null, [texto('headline', 100, 'X')], { autor: 'equipe', motivo: 'm', superficie: 'editor' }).estado).toBe('sem-contrato')
  })

  it('camadas ilegíveis: ilegivel — nunca "nada mudou"', () => {
    expect(revisaoDaPaginaComCamadas(contrato, '{{{nao-json', { autor: 'equipe', motivo: 'm', superficie: 'editor' }).estado).toBe('ilegivel')
  })

  it('mesmo texto: sem-mudanca; texto diferente: registrada com o autor de quem escreveu, só nos blocos que mudaram', () => {
    const iguais = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes')]
    expect(revisaoDaPaginaComCamadas(serializarCopyAutoral(contrato), iguais, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
    const editadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Fale com a gente')]
    const r = revisaoDaPaginaComCamadas(contrato, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em: '2026-09-12T11:00:00.000Z' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['cta'])
    expect(r.copy!.revisoes).toEqual([{ em: '2026-09-12T11:00:00.000Z', autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', blocos: ['cta'], campos: { cta: ['linhas'] } }])
    expect(lerCopyAutoral(serializarCopyAutoral(r.copy!)).problemas).toEqual([])
  })

  it('R03: texto solto lido como bloco extra é RELIDO estável — segunda leitura sem mudança, sem id duplicado, contrato válido', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('aviso', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const primeira = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' })
    expect(primeira.efetiva.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-aviso'])
    expect(lerCopyAutoral(serializarCopyAutoral(primeira.efetiva)).problemas).toEqual([])
    const segunda = copyEfetivaDasCamadas(primeira.efetiva, camadas, { superficie: 'compositor' })
    expect(segunda.mudancas).toEqual([])
    expect(segunda.efetiva.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-aviso'])
    expect(segunda.efetiva.revisoes).toEqual(primeira.efetiva.revisoes)
    expect(lerCopyAutoral(serializarCopyAutoral(segunda.efetiva)).problemas).toEqual([])
    const r = revisaoDaPaginaComCamadas(primeira.efetiva, camadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })

  it('R04: camadas soltas cujo id saneado COLIDE ("nota!" e "nota?") ganham ids distintos e REPRODUTÍVEIS — três leituras iguais', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('nota!', 500, 'a', { metadata: {} } as Partial<Layer>), texto('nota?', 560, 'b', { metadata: {} } as Partial<Layer>), texto('Nota', 620, 'c', { metadata: {} } as Partial<Layer>)]
    const l1 = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' })
    const ids = l1.efetiva.blocos.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(2)).toEqual([idDeExtra('nota!'), idDeExtra('nota?'), 'extra-Nota'])
    const l2 = copyEfetivaDasCamadas(l1.efetiva, camadas, { superficie: 'compositor' })
    const l3 = copyEfetivaDasCamadas(l2.efetiva, camadas, { superficie: 'compositor' })
    expect(l2.mudancas).toEqual([])
    expect(l3.mudancas).toEqual([])
    expect(l3.efetiva.blocos).toEqual(l1.efetiva.blocos)
    expect(l3.efetiva.revisoes).toEqual(l1.efetiva.revisoes)
    expect(lerCopyAutoral(serializarCopyAutoral(l3.efetiva)).problemas).toEqual([])
  })

  it('R03: duplicar a página regenera os ids das camadas e os blocos extra acompanham, no bloco e no histórico', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('aviso', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const original = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' }).efetiva
    const editada = copyEfetivaDasCamadas(original, camadas.map((c) => (c.id === 'aviso' ? { ...c, content: 'Só amanhã' } : c)), { superficie: 'editor' }).efetiva
    const mapa = new Map([['headline', 'uuid-1'], ['cta', 'uuid-2'], ['aviso', 'uuid-3']])
    const copia = renomearExtrasDuplicados(editada, mapa)
    expect(copia.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-uuid-3'])
    expect(copia.revisoes.every((r) => !r.blocos.includes('extra-aviso'))).toBe(true)
    expect(copia.revisoes.some((r) => r.blocos.includes('extra-uuid-3'))).toBe(true)
    expect(lerCopyAutoral(serializarCopyAutoral(copia)).problemas).toEqual([])
    // na página duplicada, a leitura com as camadas de ids novos NÃO muda nada
    const camadasDaCopia = camadas.map((c) => ({ ...c, id: mapa.get(c.id)!, name: mapa.get(c.id)!, content: c.id === 'aviso' ? 'Só amanhã' : c.content })) as Layer[]
    const camadasComPapel = camadasDaCopia.map((c) => ({ ...c, metadata: c.id === 'uuid-3' ? {} : { compositor: { papel: c.id === 'uuid-1' ? 'headline' : 'cta' } } })) as Layer[]
    expect(copyEfetivaDasCamadas(copia, camadasComPapel, { superficie: 'editor' }).mudancas).toEqual([])
  })
})
