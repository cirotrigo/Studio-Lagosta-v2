/** Cada cliente pseudonimizado entra no piloto com os PRÓPRIOS ativos (logo, páginas, véu), não com os da fixture de 13/10. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { carregarClientesDasFixtures } from './suporte/fixtures-de-clientes'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('carregarClientesDasFixtures', () => {
  it('troca os tokens pelos data URLs da própria fixture e lê formatos, logos e véu do cliente', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fixtures-piloto-'))
    fs.mkdirSync(path.join(pasta, 'cliente-07'))
    fs.writeFileSync(
      path.join(pasta, 'cliente-07', 'assinaturas.json'),
      JSON.stringify({
        clienteId: 'cliente-07',
        numerosDoProjeto: { fundo: '#101010' },
        paginas: [
          { name: 'Assinatura — cliente-07', tags: ['assinatura', 'story'], width: 1080, height: 1920, background: '#000', order: 0, layers: [{ id: 'logo', type: 'logo', fileUrl: 'fixture:logo-0', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }, { id: 'exemplo', type: 'image', fileUrl: 'fixture:arquivo-1', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }] },
          { name: 'Assinatura feed', tags: ['assinatura', 'feed'], width: 1080, height: 1350, background: '#000', order: 1, layers: [] },
        ],
        logos: [{ fileUrl: 'fixture:logo-0', isProjectLogo: true }],
        arquivos: { 'fixture:logo-0': PNG_1x1, 'fixture:arquivo-1': PNG_1x1 },
        candidatasDoVeu: ['#101010'],
      }),
    )
    const [c] = carregarClientesDasFixtures(pasta)
    expect(c.id).toBe('cliente-07')
    expect(c.formatos).toEqual(['story', 'feed'])
    expect(c.logos[0].fileUrl).toBe(`data:image/png;base64,${PNG_1x1}`)
    expect(c.paginas[0].layers[0].fileUrl).toBe(`data:image/png;base64,${PNG_1x1}`)
    expect(c.paginas[0].layers[1].fileUrl).toBe(`data:image/png;base64,${PNG_1x1}`)
    expect(c.paginas[0].id).toBe('cliente-07-pagina-0')
    expect(c.candidatasDoVeu).toEqual(['#101010'])
    expect(carregarClientesDasFixtures(path.join(pasta, 'nao-existe'))).toEqual([])
  })
  it('RECUSA a fixture cuja camada aponta para um token sem arquivo (nunca troca por outro arquivo em silêncio)', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fixtures-piloto-'))
    fs.mkdirSync(path.join(pasta, 'cliente-08'))
    fs.writeFileSync(path.join(pasta, 'cliente-08', 'assinaturas.json'), JSON.stringify({ clienteId: 'cliente-08', numerosDoProjeto: {}, paginas: [{ name: 'a', tags: ['story'], width: 1080, height: 1920, layers: [{ id: 'exemplo', type: 'image', fileUrl: 'fixture:arquivo-1', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] }], logos: [], arquivos: {}, candidatasDoVeu: [] }))
    expect(() => carregarClientesDasFixtures(pasta)).toThrow(/incompleta.*exemplo.*fixture:arquivo-1/)
  })
})
