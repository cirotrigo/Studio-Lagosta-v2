import { describe, expect, it } from 'vitest'
import { cabemMaisClipes, criarReservaDeClipes, inserirClipe, problemasDosClipes } from '../linha-do-tempo'
import { trechoDoVideo, MAX_CLIPES } from '../camadas-de-video'
import { fonteEfetiva } from '../audio-do-export'
import { volumeDoVideoNaPagina } from '../plano-de-som'
import { recusaComoImagem, recusaPorCamadas, videoNaPagina } from '../pagina-com-video'

const CANVAS = { width: 1080, height: 1920 }
const foto = (id: string, order: number, clipe?: { duracao?: number }) => ({
  id, type: 'image', order, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, ...(clipe ? { clipe } : {}),
})
const video = (id: string, order: number, meta: Record<string, unknown>, clipe?: { duracao?: number }) => ({
  id, type: 'video', order, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, videoMetadata: meta, ...(clipe ? { clipe } : {}),
})

describe('inserirClipe põe o clipe novo no FIM da sequência', () => {
  it('a camada nova (order 0) não entra no meio', () => {
    const layers = [foto('a', 0, {}), foto('b', 1, {}), foto('c', 2, {})]
    const ids = inserirClipe(layers, foto('nova', 0), CANVAS).map((l) => l.id)
    expect(ids).toEqual(['a', 'b', 'c', 'nova'])
  })

  it('o teto de clipes é conferido antes de inserir', () => {
    const cheia = Array.from({ length: MAX_CLIPES }, (_, i) => foto(`f${i}`, i, {}))
    expect(cabemMaisClipes(cheia)).toBe(false)
    expect(cabemMaisClipes(cheia.slice(1))).toBe(true)
    expect(cabemMaisClipes(cheia.slice(2), 2)).toBe(true)
    expect(cabemMaisClipes(cheia.slice(1), 2)).toBe(false)
  })
})

describe('o trecho do vídeo é validado e lido na defensiva', () => {
  it('fim além do arquivo, NaN e início negativo são recusados', () => {
    expect(problemasDosClipes([video('v', 0, { duration: 4, trimEnd: 90 }, {})])).toHaveLength(1)
    expect(problemasDosClipes([video('v', 0, { duration: 4, trimStart: Number.NaN }, {})])).toHaveLength(1)
    expect(problemasDosClipes([video('v', 0, { duration: 4, trimStart: -1 }, {})])).toHaveLength(1)
    expect(problemasDosClipes([video('v', 0, { duration: 4, trimStart: 1, trimEnd: 3 }, {})])).toEqual([])
  })

  it('o fim gravado além do arquivo é preso ao fim do arquivo', () => {
    expect(trechoDoVideo({ duration: 4, trimStart: 1, trimEnd: 90 })).toEqual({ inicio: 1, duracao: 3 })
    expect(trechoDoVideo({ duration: 4, trimStart: Number.NaN })).toEqual({ inicio: 0, duracao: 4 })
  })
})

describe('o mix que vira só a música mantém o volume da música', () => {
  it('volumeMusic vence o volume da trilha', () => {
    expect(fonteEfetiva({ source: 'mix', musicId: 7, volumeMusic: 10, volume: 80 }, false)).toEqual({
      config: { source: 'library', musicId: 7, volumeMusic: 10, volume: 10 },
      aviso: 'so-musica',
    })
  })
})

describe('o som do vídeo na prévia é o mesmo do export', () => {
  const layers = [{ ...video('v', 0, { duration: 6 }), fileUrl: 'https://x/v.mp4' }]
  it('mix: o volume do original; mudo, ou sem original: zero', () => {
    expect(volumeDoVideoNaPagina(layers, { source: 'mix', volumeOriginal: 50 }, 'v')).toBe(0.5)
    expect(volumeDoVideoNaPagina(layers, { source: 'mix', volumeOriginal: 0 }, 'v')).toBe(0)
    expect(volumeDoVideoNaPagina(layers, { source: 'original' }, 'v')).toBe(1)
    expect(volumeDoVideoNaPagina(layers, { source: 'library', musicId: 1 }, 'v')).toBe(0)
    expect(volumeDoVideoNaPagina([{ ...video('v', 0, { duration: 6, muted: true }), fileUrl: 'https://x/v.mp4' }], { source: 'original' }, 'v')).toBe(0)
  })
})

describe('sequência só de fotos: renderiza, mas não vai ao ar como imagem', () => {
  const sequencia = [foto('a', 0, {}), foto('b', 1, {})]
  it('o render a aceita; a publicação a recusa', () => {
    expect(videoNaPagina(sequencia)).toBe('sem-video')
    expect(recusaPorCamadas(sequencia)?.codigo).toBe('PAGINA_COM_VIDEO')
    expect(recusaComoImagem(sequencia, null)?.codigo).toBe('PAGINA_COM_VIDEO')
    expect(recusaPorCamadas([foto('a', 0)])).toBeNull()
  })
})

describe('rodada 2: teto de clipes num lote de duplicações', () => {
  it('9 clipes + duplicar 2 no mesmo lote: só o primeiro entra', () => {
    const nove = Array.from({ length: MAX_CLIPES - 1 }, (_, i) => foto(`f${i}`, i, {}))
    const reserva = criarReservaDeClipes()
    expect(reserva.reservar(nove)).toBe(true)
    expect(reserva.reservar(nove)).toBe(false)
    // a renderização seguinte já conta o que entrou
    reserva.zerar()
    expect(reserva.reservar([...nove, foto('nova', 9, {})])).toBe(false)
    expect(reserva.reservar(nove.slice(1))).toBe(true)
  })
})

describe('rodada 2: o trecho lido fica dentro do arquivo', () => {
  it('início além do fim é preso ao último trecho mínimo; duração ≤ 0 é desconhecida', () => {
    expect(trechoDoVideo({ duration: 4, trimStart: 90 })).toEqual({ inicio: 3.5, duracao: 0.5 })
    expect(trechoDoVideo({ duration: 4, trimStart: 90, trimEnd: 95 })).toEqual({ inicio: 3.5, duracao: 0.5 })
    expect(trechoDoVideo({ duration: -3, trimStart: 1 })).toEqual({ inicio: 1, duracao: null })
    expect(trechoDoVideo({ trimStart: 1 }, -2)).toEqual({ inicio: 1, duracao: null })
    expect(trechoDoVideo({ trimStart: 1 }, 6)).toEqual({ inicio: 1, duracao: 5 })
  })

  it('o validador recusa duração ≤ 0', () => {
    expect(problemasDosClipes([video('v', 0, { duration: -3 }, {})])).toHaveLength(1)
    expect(problemasDosClipes([video('v', 0, { duration: 0 }, {})])).toHaveLength(1)
  })
})
