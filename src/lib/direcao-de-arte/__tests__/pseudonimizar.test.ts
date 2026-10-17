/** O gerador de fixtures do piloto PSEUDONIMIZA em qualquer profundidade e recusa a saída que ainda identifica o cliente. */
import { describe, expect, it } from 'vitest'
import { conferirPseudonimo, pseudonimizar } from '../../../../scripts/fixtures/pseudonimizar'

const exp = {
  projeto: { id: 42, name: 'Bistrô Maré', assinatura: { fundo: '#112233', textoPadrao: 'Bistrô Maré te espera', referencia: 'https://blob.test/ref.png' } },
  paginas: [{ id: 9, templateId: 7, isTemplate: true, name: 'Assinatura — Bistrô Maré', tags: ['assinatura', 'story'], width: 1080, height: 1920, background: '#000', order: 0, layers: JSON.stringify([{ id: 'logo', type: 'logo', fileUrl: 'https://blob.test/logo.png', position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, style: { backgroundImage: 'https://blob.test/bg.jpg', texto: 'por bistrô maré' }, metadata: { driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', _imageUrl: 'https://drive.google.com/x' } }]) }],
  logos: [{ id: 1, fileUrl: 'https://blob.test/logo.png', isProjectLogo: true }],
}

describe('pseudonimizar', () => {
  it('troca nome, URLs e identificadores externos em qualquer profundidade e só mantém os campos permitidos da página', () => {
    const f = pseudonimizar(exp, 'cliente-01', { 'https://blob.test/logo.png': 'iVBORw0KGgo=' })
    expect(f.clienteId).toBe('cliente-01')
    expect(f.numerosDoProjeto).toMatchObject({ fundo: '#112233', textoPadrao: 'cliente-01 te espera' })
    expect((f.numerosDoProjeto as Record<string, string>).referencia).toMatch(/^fixture:arquivo-\d+$/)
    const p = f.paginas[0]
    expect(Object.keys(p).sort()).toEqual(['background', 'height', 'layers', 'name', 'order', 'tags', 'width'])
    expect(p.name).toBe('Assinatura — cliente-01')
    const l = (p.layers as Array<Record<string, unknown>>)[0]
    expect(l.fileUrl).toBe('fixture:logo-0')
    expect((l.style as Record<string, unknown>).backgroundImage).toMatch(/^fixture:arquivo-/)
    expect((l.style as Record<string, unknown>).texto).toBe('por cliente-01')
    expect((l.metadata as Record<string, unknown>).driveFileId).toBeNull()
    expect((l.metadata as Record<string, unknown>)._imageUrl).toBeNull()
    expect(f.logos).toEqual([{ fileUrl: 'fixture:logo-0', isProjectLogo: true }])
    expect(f.arquivos['fixture:logo-0']).toBe('iVBORw0KGgo=')
    expect(f.candidatasDoVeu).toEqual(['#112233'])
    expect(conferirPseudonimo(f, 'Bistrô Maré')).toEqual([])
  })
  it('a conferência acha o que sobrou: URL aninhada, nome do cliente, identificador externo', () => {
    const sobras = conferirPseudonimo({ paginas: [{ layers: [{ style: { bg: 'https://x' } }, { name: 'bistrô maré' }, { driveFileId: 'abc' }] }] }, 'Bistrô Maré')
    expect(sobras).toEqual(['fixture.paginas[0].layers[0].style.bg: URL', 'fixture.paginas[0].layers[1].name: nome do cliente', 'fixture.paginas[0].layers[2].driveFileId: identificador externo'])
  })
})
