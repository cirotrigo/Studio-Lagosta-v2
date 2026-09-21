/**
 * PR5-12 — conteúdo NOVO não herda a declaração de prefixo da camada anterior.
 *
 * A cadeia REAL da via de modelo, sem banco: contrato →
 * `mapearContratoParaCampos` → `bakeLayers` → `copyEfetivaDasCamadas`. É a
 * única forma de ver o defeito: ele nasce na escrita da camada (o prefixo que
 * fica) e só aparece na leitura (o desconto que some com o texto do autor).
 */
import { describe, expect, it } from 'vitest'
import { mapearContratoParaCampos, type CampoDeTexto } from '@/lib/planos/execucao'
import { bakeLayers } from '@/lib/creatives/bake-layers'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, semPrefixoHerdado, type CopyAutoral } from '@/lib/copy-autoral'

/** O modelo: um CTA que a assinatura desenha com a seta declarada em `metadata.compositor.prefixo`. */
const camadaDoModelo = () => [
  {
    id: 'cta-1',
    name: 'Chamada',
    type: 'text',
    content: '→ Reserve já',
    metadata: { compositor: { papel: 'cta', prefixo: '→ ' } },
  },
]

const campos: CampoDeTexto[] = [{ layerId: 'cta-1', name: 'Chamada', papel: 'cta' }]

const contratoCom = (linha: string): CopyAutoral => ({
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude' },
  blocos: [{ id: 'cta', funcao: 'cta', ordem: 0, linhas: [linha] }],
  revisoes: [],
})

describe('PR5-12 — a declaração de prefixo não sobrevive ao conteúdo novo', () => {
  it('CTA autoral que COMEÇA pela mesma seta: a arte mostra a seta e o contrato a guarda (sem revisão fictícia)', () => {
    const contrato = contratoCom('→ Venha hoje')
    const mapa = mapearContratoParaCampos(campos, contrato)
    expect(mapa.slotValues['cta-1']).toEqual({ content: '→ Venha hoje', bloco: 'cta', papel: 'cta' })

    const { layers } = bakeLayers(camadaDoModelo(), mapa.slotValues, null)
    // o que a ARTE mostra
    expect(layers[0].content).toBe('→ Venha hoje')
    // a camada deixou de DECLARAR um prefixo que não pôs
    expect((layers[0].metadata as any).compositor.prefixo).toBeUndefined()
    // e o papel/bloco carimbados continuam
    expect((layers[0].metadata as any).compositor).toMatchObject({ papel: 'cta', bloco: 'cta' })

    // o contrato persistido descreve o que a página mostra, sem transformação do sistema
    const efetiva = copyEfetivaDasCamadas(contrato, layers as never, { superficie: 'modelo' })
    expect(efetiva.efetiva.blocos.find((b) => b.id === 'cta')!.linhas).toEqual(['→ Venha hoje'])
    expect(efetiva.efetiva.revisoes).toEqual([])
    expect(efetiva.mudancas).toEqual([])

    // releitura da página como ela está: nada muda
    expect(copyEfetivaDasCamadas(efetiva.efetiva, layers as never, { superficie: 'editor' }).mudancas).toEqual([])
  })

  it('CTA autoral SEM seta: o prefixo herdado também sai, e o texto volta inteiro', () => {
    const contrato = contratoCom('Venha hoje')
    const mapa = mapearContratoParaCampos(campos, contrato)
    const { layers } = bakeLayers(camadaDoModelo(), mapa.slotValues, null)
    expect(layers[0].content).toBe('Venha hoje')
    expect((layers[0].metadata as any).compositor.prefixo).toBeUndefined()
    expect(copyEfetivaDasCamadas(contrato, layers as never, { superficie: 'modelo' }).efetiva.blocos[0].linhas).toEqual(['Venha hoje'])
  })

  it('a camada que NÃO recebe conteúdo novo continua declarando o prefixo do compositor', () => {
    // nenhum slot para `cta-1`: é a peça do compositor, em que a seta É ornamento dele
    const { layers } = bakeLayers(camadaDoModelo(), {}, null)
    expect((layers[0].metadata as any).compositor.prefixo).toBe('→ ')
    const contrato = contratoCom('Reserve já')
    const efetiva = copyEfetivaDasCamadas(contrato, layers as never, { superficie: 'compositor' })
    // o prefixo é descontado: o autor escreveu "Reserve já", o compositor desenhou a seta
    expect(efetiva.efetiva.blocos[0].linhas).toEqual(['Reserve já'])
    expect(efetiva.efetiva.revisoes).toEqual([])
  })

  it('`semPrefixoHerdado` preserva o resto do metadata e devolve a camada intacta quando não há o que tirar', () => {
    const com = { metadata: { compositor: { papel: 'cta', prefixo: '→ ' }, groupId: 'g1' }, id: 'x' }
    const sem = semPrefixoHerdado(com)
    expect(sem.metadata).toEqual({ compositor: { papel: 'cta' }, groupId: 'g1' })
    expect(sem.id).toBe('x')
    const nada = { metadata: { compositor: { papel: 'cta' } } }
    expect(semPrefixoHerdado(nada)).toBe(nada)
    expect(semPrefixoHerdado({ id: 'y' } as never)).toEqual({ id: 'y' })
  })
})
