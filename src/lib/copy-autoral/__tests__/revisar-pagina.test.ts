import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, lerCopyAutoral, revisaoDaPaginaComCamadas, serializarCopyAutoral, type CopyAutoral } from '..'

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

  it('duas camadas soltas com o mesmo apelido ganham ids únicos', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('Nota!', 500, 'a', { metadata: {} } as Partial<Layer>), texto('nota', 560, 'b', { metadata: {} } as Partial<Layer>)]
    const r = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' })
    const ids = r.efetiva.blocos.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(lerCopyAutoral(serializarCopyAutoral(r.efetiva)).problemas).toEqual([])
  })
})
