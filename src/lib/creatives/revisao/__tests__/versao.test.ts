import { describe, expect, it } from 'vitest'
import { versaoDaPagina } from '../versao'

const camadas = [{ id: 'a', type: 'text', style: { fontSize: 40, color: '#ffffff' }, position: { x: 1, y: 2 } }]

describe('a versão da página', () => {
  it('não depende da ordem das chaves nem de as camadas virem gravadas como string', () => {
    const v1 = versaoDaPagina({ width: 1080, height: 1920, background: '#000', layers: camadas })
    const v2 = versaoDaPagina({
      width: 1080,
      height: 1920,
      background: '#000',
      layers: JSON.stringify([{ position: { y: 2, x: 1 }, style: { color: '#ffffff', fontSize: 40 }, type: 'text', id: 'a' }]),
    })
    expect(v1).toBe(v2)
    expect(v1).toMatch(/^v1:[0-9a-f]{20}$/)
  })

  it('campo undefined não muda a versão (o JSON do banco nunca o guarda)', () => {
    const com = versaoDaPagina({ width: 1080, height: 1920, layers: [{ ...camadas[0], rotation: undefined }] })
    expect(com).toBe(versaoDaPagina({ width: 1080, height: 1920, layers: camadas }))
  })

  it('muda quando a peça muda: corpo, fundo ou tamanho', () => {
    const base = versaoDaPagina({ width: 1080, height: 1920, background: '#000', layers: camadas })
    expect(versaoDaPagina({ width: 1080, height: 1920, background: '#000', layers: [{ ...camadas[0], style: { fontSize: 41, color: '#ffffff' } }] })).not.toBe(base)
    expect(versaoDaPagina({ width: 1080, height: 1920, background: '#111', layers: camadas })).not.toBe(base)
    expect(versaoDaPagina({ width: 1080, height: 1350, background: '#000', layers: camadas })).not.toBe(base)
  })

  it('camadas ilegíveis não têm versão', () => {
    expect(versaoDaPagina({ width: 1080, height: 1920, layers: '{nao é json' })).toBeNull()
  })
})

describe('a versão com o áudio do quadro 0 (achado 6 do Codex)', () => {
  const musica = { source: 'library', musicId: 1, startTime: 0, endTime: 10 }
  const foto = { id: 'f', type: 'image', position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 } }

  it('página sem foto em movimento: o hash é o de sempre, com ou sem música', () => {
    const pagina = { width: 1080, height: 1920, background: '#000', layers: [foto, ...camadas] }
    const deSempre = versaoDaPagina(pagina)
    expect(versaoDaPagina(pagina, { audio: musica })).toBe(deSempre)
    expect(versaoDaPagina(pagina, { audio: null })).toBe(deSempre)
  })

  it('foto em movimento: com música o quadro 0 sai com o zoom, e a versão muda', () => {
    const pagina = { width: 1080, height: 1920, background: '#000', layers: [{ ...foto, movimento: 'afastar' }] }
    const semMusica = versaoDaPagina(pagina, { audio: null })
    expect(versaoDaPagina(pagina, { audio: musica })).not.toBe(semMusica)
    // Sem música o PNG é o da foto parada: a versão é a de quem não passa o áudio
    expect(semMusica).toBe(versaoDaPagina(pagina))
    // A versão é do CONTEÚDO: a mesma música em outra forma não muda nada
    expect(versaoDaPagina(pagina, { audio: { ...musica, volume: 30 } })).toBe(versaoDaPagina(pagina, { audio: musica }))
  })
})
