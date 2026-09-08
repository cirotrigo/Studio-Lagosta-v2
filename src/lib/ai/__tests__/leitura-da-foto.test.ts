/**
 * A leitura medida da foto: o mapa de calma vira texto para o diretor. Foto
 * sintética — metade de cima lisa e escura, metade de baixo ruidosa e clara —
 * tem de sair como "terço superior calmo e escuro" e assunto embaixo.
 */
import { describe, expect, it } from 'vitest'
import { estimarAssunto, mapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import { regioesDoMapa, resumirCatalogoDaFoto, resumirMapaDeCalma } from '../leitura-da-foto'

function fotoSintetica(width = 108, height = 192): FotoCinza {
  const data = Buffer.alloc(width * height)
  let semente = 7
  const rand = () => {
    semente = (semente * 1103515245 + 12345) & 0x7fffffff
    return semente / 0x7fffffff
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // topo: parede lisa e escura; base: textura clara e agitada
      data[y * width + x] = y < height / 2 ? 40 : 150 + Math.floor(rand() * 100)
    }
  }
  // A foto reduzida representa um canvas de story: escala 0,1.
  return { data, width, height, stride: 1, escala: width / 1080, canvas: { width: 1080, height: 1920 } } as FotoCinza
}

describe('resumirMapaDeCalma', () => {
  const mapa = mapaDeCalma(fotoSintetica())
  it('lê o terço superior como calmo e escuro, e o inferior como agitado e claro', () => {
    const regioes = regioesDoMapa(mapa)
    const topo = regioes.filter((r) => r.faixa === 'superior')
    const base = regioes.filter((r) => r.faixa === 'inferior')
    expect(topo.every((r) => r.calma === 'calma' && r.tom === 'escura')).toBe(true)
    expect(base.every((r) => r.calma === 'agitada' && r.tom === 'clara')).toBe(true)
  })
  it('escreve o resumo com as três faixas, o assunto e as regiões mais calmas', () => {
    const texto = resumirMapaDeCalma(mapa, estimarAssunto(mapa))
    expect(texto).toMatch(/^LEITURA MEDIDA DA FOTO/)
    expect(texto).toMatch(/terço superior: esquerda calma e escura/)
    expect(texto).toMatch(/terço inferior: esquerda agitada e clara/)
    expect(texto).toMatch(/assunto estimado .* da altura/)
    expect(texto).toMatch(/regiões mais calmas, em ordem: superior-/)
  })
  it('diz quando o assunto não foi localizado', () => {
    expect(resumirMapaDeCalma(mapa, null)).toMatch(/assunto: não localizado/)
  })
})

describe('resumirCatalogoDaFoto', () => {
  it('monta uma linha com o que a análise do acervo sabe', () => {
    const t = resumirCatalogoDaFoto({
      assunto: 'picanha',
      elementos: ['tábua', 'farofa', 'cliente ao fundo'],
      enquadramento: 'close',
      pessoas: 'nenhuma',
      momento: 'noite',
    })
    expect(t).toBe('CATÁLOGO DA FOTO (análise prévia por visão do acervo): assunto: picanha · também no quadro: tábua, farofa, cliente ao fundo · enquadramento: close · pessoas: nenhuma · momento: noite.')
  })
  it('cai na descrição quando os campos v3 não existem, e em null sem nada', () => {
    expect(resumirCatalogoDaFoto({ description: 'Prato de massa em mesa de madeira' })).toMatch(/Prato de massa/)
    expect(resumirCatalogoDaFoto({})).toBeNull()
    expect(resumirCatalogoDaFoto(null)).toBeNull()
  })
})
