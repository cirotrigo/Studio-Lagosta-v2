import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyVersionDe, estavel, identidadeDaPagina, versaoDaPagina } from '../versao'

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

describe('CP5b — identidadeDaPagina (H1–H3)', () => {
  const peca = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/direcao-de-arte/__tests__/fixtures/piloto-2026-10-13/peca.json'), 'utf8'))
  const pagina = { id: 'pg-piloto', name: 'Qua 14/10 · 10:00 · story', tags: [] as string[], width: 1080, height: 1920, background: '#000000', layers: peca.v1.layers, copyAutoral: { versao: 'copy-autoral-v1', blocos: [] } }

  it('H1: pageVersion = versaoDaPagina(page), copyVersion = copyVersionDe(Page.copyAutoral), os dois formatos', () => {
    const id = identidadeDaPagina(pagina)
    expect(id).toEqual({ pageId: 'pg-piloto', formato: 'story', formatoDoCompositor: 'story', pageVersion: versaoDaPagina(pagina), copyVersion: copyVersionDe(pagina.copyAutoral) })
    expect(id.pageVersion).toMatch(/^v1:/)
    expect(id.copyVersion).toMatch(/^c1:/)
    expect(identidadeDaPagina({ ...pagina, copyAutoral: undefined }).copyVersion).toBe('sem-contrato')
    expect(identidadeDaPagina({ ...pagina, name: 'x', width: 500, height: 500 })).toMatchObject({ formato: 'quadrado', formatoDoCompositor: 'quadrado' })
    expect(identidadeDaPagina({ ...pagina, name: 'x', width: 400, height: 300 })).toMatchObject({ formato: null, formatoDoCompositor: 'feed' })
    // O formato do revisor vem do nome quando a geometria não decide; o do compositor, das tags: renomear ou retaguear não muda o hash.
    expect(identidadeDaPagina({ ...pagina, name: 'feed de quarta' })).toMatchObject({ formato: 'feed', formatoDoCompositor: 'story', pageVersion: id.pageVersion })
    expect(identidadeDaPagina({ ...pagina, name: 'x', tags: ['feed'], height: 1350 })).toMatchObject({ formato: 'feed', formatoDoCompositor: 'feed' })
    expect(identidadeDaPagina({ ...pagina, name: 'x', tags: ['story'], height: 1350 })).toMatchObject({ formato: 'feed', formatoDoCompositor: 'story' })
  })

  it('H2: a mesma página com áudio tem o mesmo pageVersion (a identidade é sem áudio)', () => {
    const emMovimento = { ...pagina, layers: [{ id: 'f', type: 'image', position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, movimento: 'afastar' }] }
    const id = identidadeDaPagina(emMovimento)
    expect(id.pageVersion).toBe(versaoDaPagina(emMovimento))
    expect(id.pageVersion).not.toBe(versaoDaPagina(emMovimento, { audio: { source: 'library', musicId: 1, startTime: 0, endTime: 10 } }))
  })

  it('H3: layers como string JSON (dupla) dá o mesmo pageVersion do array; ilegível → null', () => {
    const doArray = identidadeDaPagina(pagina).pageVersion
    expect(identidadeDaPagina({ ...pagina, layers: JSON.stringify(peca.v1.layers) }).pageVersion).toBe(doArray)
    expect(identidadeDaPagina({ ...pagina, layers: JSON.stringify(JSON.stringify(peca.v1.layers)) }).pageVersion).toBe(doArray)
    expect(identidadeDaPagina({ ...pagina, layers: '{nao é json' }).pageVersion).toBeNull()
  })

  it('estavel é exportado e é a normalização dos hashes: chaves ordenadas, undefined fora', () => {
    expect(estavel({ b: 1, a: undefined, c: [{ z: 1, y: undefined }] })).toEqual({ b: 1, c: [{ z: 1 }] })
    expect(JSON.stringify(estavel({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}')
  })
})
