/** O gerador de fixtures do piloto PROJETA por esquema: só o conhecido sobrevive; o resto é descartado e listado; e a saída que ainda identifica o cliente é recusada. */
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
const LOGO = 'https://blob.test/logo.png'
const EXEMPLO = 'https://blob.test/exemplo.jpg'
const camadas = [
  { id: '3afceabf-5c85', name: 'Logo - Ativo 2 Bistrô Maré.png', type: 'logo', fileUrl: LOGO, position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, style: { objectFit: 'cover', border: { color: '#000000', width: 2 } }, metadata: { driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', externalId: 'acme', groupId: 'grupo-292f' } },
  { id: 'headline', name: 'headline', type: 'text', content: 'Bistrô Maré: feijoada de sábado', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { fontFamily: 'Branley GC', textAlign: 'left', color: '#283D36', fontWeight: '400' }, effects: { shadow: { shadowColor: '#283D36', blur: 4 }, background: { fit: 'texto', baseColor: '#111111' } }, textboxConfig: { anchor: 'top', autoWrap: { breakMode: 'word' }, textMode: 'auto-wrap-fixed' }, metadata: { groupId: 'grupo-292f', nota: 'ligar pro Zé 99999-1234' } },
  { id: 'b6b72c00', name: 'Imagem - Delivery-cmt05362.jpg', type: 'image', fileUrl: EXEMPLO, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { objectFit: 'cover', backgroundImage: 'https://blob.test/bg.jpg' } },
]
const exp = {
  projeto: { id: 42, name: 'Bistrô Maré', assinatura: { fundo: '#112233', referencia: 'https://blob.test/ref.png', geometria: { story: { margemH: 96 } }, destaque: { fill: '#EA5328', pesado: true } } },
  paginas: [{ id: 9, templateId: 7, isTemplate: true, name: 'Assinatura — Bistrô Maré', tags: ['assinatura', 'story', 'Bistrô'], width: 1080, height: 1920, background: '#000', order: 0, layers: JSON.stringify(camadas) }],
  logos: [{ id: 1, fileUrl: LOGO, isProjectLogo: true }],
}
const arquivos = { [LOGO]: PNG_LIMPO, [EXEMPLO]: PNG_LIMPO }

describe('pseudonimizar (projeção por esquema)', () => {
  it('só o conhecido sobrevive: cores, números, enums, fonte; texto vira copy sintética; nome/id viram papel ou camada-N; fileUrl vira token COM bytes; o resto é descartado e listado', () => {
    const { fixture: f, descartados } = pseudonimizar(exp, 'cliente-01', arquivos)
    expect(f.clienteId).toBe('cliente-01')
    expect(f.numerosDoProjeto).toEqual({ fundo: '#112233', geometria: { story: { margemH: 96 } }, destaque: { fill: '#EA5328', pesado: true } })
    const p = f.paginas[0]
    expect(Object.keys(p).sort()).toEqual(['background', 'height', 'layers', 'name', 'order', 'tags', 'width'])
    expect(p.name).toBe('Assinatura — cliente-01 — story')
    expect(p.tags).toEqual(['assinatura', 'story']) // 'Bistrô' (maiúscula/acento) fora
    const [logo, head, img] = p.layers as Array<Record<string, unknown>>
    expect(logo).toEqual({ type: 'logo', fileUrl: 'fixture:logo-0', position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, style: { objectFit: 'cover', border: { color: '#000000', width: 2 } }, metadata: { groupId: 'grupo-1' }, id: 'logo', name: 'logo' })
    expect(head.content).toBe('Almoço do dia')
    expect(head.id).toBe('headline')
    expect(head.style).toEqual({ fontFamily: 'Branley GC', textAlign: 'left', color: '#283D36', fontWeight: '400' })
    expect(head.effects).toEqual({ shadow: { shadowColor: '#283D36', blur: 4 }, background: { fit: 'texto', baseColor: '#111111' } })
    expect(head.textboxConfig).toEqual({ anchor: 'top', autoWrap: { breakMode: 'word' }, textMode: 'auto-wrap-fixed' })
    expect(head.metadata).toEqual({ groupId: 'grupo-1' })
    expect(img.id).toBe('camada-3')
    expect(img.name).toBe('image-3')
    expect(img.fileUrl).toBe('fixture:arquivo-1')
    expect(f.arquivos).toEqual({ 'fixture:logo-0': PNG_LIMPO, 'fixture:arquivo-1': PNG_LIMPO })
    expect(f.logos).toEqual([{ fileUrl: 'fixture:logo-0', isProjectLogo: true }])
    expect(f.candidatasDoVeu).toEqual(['#112233', '#EA5328'])
    expect(descartados).toEqual([
      'numerosDoProjeto.referencia: string sob chave fora do esquema',
      'paginas[0].layers[0].metadata.driveFileId: string sob chave fora do esquema',
      'paginas[0].layers[0].metadata.externalId: string sob chave fora do esquema',
      'paginas[0].layers[1].metadata.nota: string sob chave fora do esquema',
      'paginas[0].layers[2].style.backgroundImage: string sob chave fora do esquema',
    ])
    expect(conferirPseudonimo(f, 'Bistrô Maré')).toEqual([])
    expect(JSON.stringify(f)).not.toMatch(/Bistr|Delivery|Zé|99999|blob\.test|acme/)
  })
  it('fileUrl sem bytes no export é ERRO (a fixture nunca sai incompleta)', () => {
    expect(() => pseudonimizar(exp, 'cliente-01', { [LOGO]: PNG_LIMPO })).toThrow(/layers\[2\]\.fileUrl: a camada aponta para um arquivo que o export não trouxe/)
  })
  it('PNG com metadado é recusado', () => {
    expect(() => pseudonimizar(exp, 'cliente-01', { [LOGO]: comTexto(PNG_LIMPO), [EXEMPLO]: PNG_LIMPO })).toThrow(/PNG com tEXt/)
    expect(chunksDeMetadadoDoPng(Buffer.from(PNG_LIMPO, 'base64'))).toEqual([])
    expect(chunksDeMetadadoDoPng(Buffer.from('nao e png'))).toEqual(['não é PNG'])
  })
  it('a segunda rede acha o que sobrou: URL aninhada, nome do cliente, identificador externo, texto sob chave não prevista', () => {
    const sobras = conferirPseudonimo({ paginas: [{ layers: [{ style: { bg: 'https://x' } }, { name: 'bistrô maré' }, { driveFileId: 'abc' }, { metadata: { externalId: 'acme' } }, { style: { color: '#fff', textAlign: 'left', opacidade: 'meia' } }] }], arquivos: { 'fixture:logo-0': comTexto(PNG_LIMPO) } }, 'Bistrô Maré')
    expect(sobras).toEqual([
      'fixture.paginas[0].layers[0].style.bg: URL',
      'fixture.paginas[0].layers[0].style.bg: texto sob chave não prevista',
      'fixture.paginas[0].layers[1].name: nome do cliente',
      'fixture.paginas[0].layers[2].driveFileId: identificador externo',
      'fixture.paginas[0].layers[2].driveFileId: texto sob chave não prevista',
      'fixture.paginas[0].layers[3].metadata.externalId: identificador externo',
      'fixture.paginas[0].layers[3].metadata.externalId: texto sob chave não prevista',
      'fixture.paginas[0].layers[4].style.opacidade: texto sob chave não prevista',
      'fixture.arquivos.fixture:logo-0: PNG com tEXt',
    ])
  })
})
