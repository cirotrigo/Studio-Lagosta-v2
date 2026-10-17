/** O gerador de fixtures do piloto PSEUDONIMIZA em qualquer profundidade e recusa a saída que ainda identifica o cliente. */
import { describe, expect, it } from 'vitest'
import { chunksDeMetadadoDoPng, conferirPseudonimo, pseudonimizar } from '../../../../scripts/fixtures/pseudonimizar'

/** PNG 1×1 sem metadado. */
const PNG_LIMPO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
/** O mesmo PNG com um chunk tEXt ("Author") inserido antes do IDAT. */
function comTexto(b64: string): string {
  const png = Buffer.from(b64, 'base64')
  const dados = Buffer.from('Author\0Cliente Real', 'latin1')
  const chunk = Buffer.concat([Buffer.alloc(4), Buffer.from('tEXt', 'latin1'), dados, Buffer.alloc(4)])
  chunk.writeUInt32BE(dados.length, 0)
  const fimDoIHDR = 8 + 12 + 13
  return Buffer.concat([png.subarray(0, fimDoIHDR), chunk, png.subarray(fimDoIHDR)]).toString('base64')
}

const exp = {
  projeto: { id: 42, name: 'Bistrô Maré', assinatura: { fundo: '#112233', referencia: 'https://blob.test/ref.png', geometria: { story: { margemH: 96 } } } },
  paginas: [{ id: 9, templateId: 7, isTemplate: true, name: 'Assinatura — Bistrô Maré', tags: ['assinatura', 'story'], width: 1080, height: 1920, background: '#000', order: 0, layers: JSON.stringify([{ id: 'logo', type: 'logo', fileUrl: 'https://blob.test/logo.png', position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, style: { backgroundImage: 'https://blob.test/bg.jpg', color: '#ffffff' }, metadata: { driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', _imageUrl: 'https://drive.google.com/x' } }, { id: 'headline', type: 'text', content: 'Bistrô Maré: feijoada de sábado', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { fontFamily: 'Branley GC', textAlign: 'left' } }, { id: 'exemplo', type: 'image', fileUrl: 'https://blob.test/exemplo.jpg', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }]) }],
  logos: [{ id: 1, fileUrl: 'https://blob.test/logo.png', isProjectLogo: true }],
}

describe('pseudonimizar', () => {
  it('troca nome, URLs e identificadores externos em qualquer profundidade e só mantém os campos permitidos da página', () => {
    const f = pseudonimizar(exp, 'cliente-01', { 'https://blob.test/logo.png': PNG_LIMPO, 'https://blob.test/exemplo.jpg': PNG_LIMPO })
    expect(f.clienteId).toBe('cliente-01')
    expect(f.numerosDoProjeto).toMatchObject({ fundo: '#112233', geometria: { story: { margemH: 96 } } })
    expect((f.numerosDoProjeto as Record<string, string>).referencia).toMatch(/^fixture:arquivo-\d+$/)
    const p = f.paginas[0]
    expect(Object.keys(p).sort()).toEqual(['background', 'height', 'layers', 'name', 'order', 'tags', 'width'])
    expect(p.name).toBe('Assinatura — cliente-01')
    const l = (p.layers as Array<Record<string, unknown>>)[0]
    expect(l.fileUrl).toBe('fixture:logo-0')
    expect((l.style as Record<string, unknown>).backgroundImage).toMatch(/^fixture:arquivo-/)
    // O texto de exemplo da assinatura vira copy sintética pelo papel da camada; a imagem de exemplo vira token COM arquivo.
    const h = (p.layers as Array<Record<string, unknown>>)[1]
    expect(h.content).toBe('Almoço do dia')
    const ex = (p.layers as Array<Record<string, unknown>>)[2]
    expect(ex.fileUrl).toMatch(/^fixture:arquivo-/)
    expect(f.arquivos[ex.fileUrl as string]).toBe(PNG_LIMPO)
    expect((l.metadata as Record<string, unknown>).driveFileId).toBeNull()
    expect((l.metadata as Record<string, unknown>)._imageUrl).toBeNull()
    expect(f.logos).toEqual([{ fileUrl: 'fixture:logo-0', isProjectLogo: true }])
    expect(f.arquivos['fixture:logo-0']).toBe(PNG_LIMPO)
    expect(f.candidatasDoVeu).toEqual(['#112233'])
    expect(conferirPseudonimo(f, 'Bistrô Maré')).toEqual([])
  })
  it('a conferência acha o que sobrou: URL aninhada, nome do cliente, identificador externo, texto sob chave não prevista, PNG com metadado', () => {
    const sobras = conferirPseudonimo({ paginas: [{ layers: [{ style: { bg: 'https://x' } }, { name: 'bistrô maré' }, { driveFileId: 'abc' }, { metadata: { externalId: 'cli_8f3a9b2c7d1e' } }, { style: { color: '#fff', textAlign: 'left', opacidade: '0.5' } }] }], arquivos: { 'fixture:logo-0': comTexto(PNG_LIMPO) } }, 'Bistrô Maré')
    expect(sobras).toEqual([
      'fixture.paginas[0].layers[0].style.bg: URL',
      'fixture.paginas[0].layers[0].style.bg: texto sob chave não prevista',
      'fixture.paginas[0].layers[1].name: nome do cliente',
      'fixture.paginas[0].layers[2].driveFileId: identificador externo',
      'fixture.paginas[0].layers[3].metadata.externalId: texto sob chave não prevista',
      'fixture.arquivos.fixture:logo-0: PNG com tEXt',
    ])
  })
  it('a pseudonimização RECUSA a saída com identificador sob chave não prevista ou PNG com metadado', () => {
    const comExternalId = { ...exp, paginas: [{ ...exp.paginas[0], layers: JSON.stringify([{ id: 'x', type: 'shape', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, metadata: { externalId: 'cli_8f3a9b2c7d1e' } }]) }] }
    expect(() => pseudonimizar(comExternalId, 'cliente-01', { 'https://blob.test/logo.png': PNG_LIMPO })).toThrow(/externalId: texto sob chave não prevista/)
    // Texto livre nos números da assinatura, sob chave que ninguém previu: recusado (quem gerar decide se a chave entra na lista).
    const comTextoLivre = { ...exp, projeto: { ...exp.projeto, assinatura: { fundo: '#112233', textoPadrao: 'A casa te espera' } } }
    expect(() => pseudonimizar(comTextoLivre, 'cliente-01', { 'https://blob.test/logo.png': PNG_LIMPO, 'https://blob.test/exemplo.jpg': PNG_LIMPO })).toThrow(/textoPadrao: texto sob chave não prevista/)
    expect(() => pseudonimizar(exp, 'cliente-01', { 'https://blob.test/logo.png': comTexto(PNG_LIMPO), 'https://blob.test/exemplo.jpg': PNG_LIMPO })).toThrow(/PNG com tEXt/)
    expect(chunksDeMetadadoDoPng(Buffer.from(PNG_LIMPO, 'base64'))).toEqual([])
    expect(chunksDeMetadadoDoPng(Buffer.from('nao e png'))).toEqual(['não é PNG'])
  })
})
