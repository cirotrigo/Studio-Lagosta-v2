/** O gerador de fixtures do piloto PROJETA por esquema: só o conhecido sobrevive; o resto é descartado e listado; e a saída que ainda identifica o cliente é recusada. */
import { describe, expect, it } from 'vitest'
import { chunksDeMetadadoDoPng, conferirPseudonimo, fragmentosDoNome, pseudonimizar } from '../../../../scripts/fixtures/pseudonimizar'

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
  { id: 'headline', name: 'headline', type: 'text', content: 'Bistrô Maré: feijoada de sábado', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { fontFamily: 'Branley GC', textAlign: 'left', color: '#283D36', fontWeight: '400' }, effects: { shadow: { shadowColor: '#283D36', blur: 4 }, background: { fit: 'texto', baseColor: '#111111' }, blur: { enabled: true, blurRadius: 6 }, curved: { enabled: false, curvature: 12 } }, textboxConfig: { anchor: 'top', autoWrap: { breakMode: 'word' }, textMode: 'auto-wrap-fixed' }, metadata: { groupId: 'grupo-292f', nota: 'ligar pro Zé 99999-1234', layers: [{ type: 'image', position: { x: 0, y: 0 }, fileUrl: LOGO }] } },
  { id: 'b6b72c00', name: 'Imagem - Delivery-cmt05362.jpg', type: 'image', fileUrl: EXEMPLO, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { objectFit: 'cover', cropPosition: 'center-bottom', backgroundImage: 'https://blob.test/bg.jpg', fileUrl: LOGO, preview: { type: 'image', position: { x: 0, y: 0 }, fileUrl: LOGO } }, 'Bistrô Maré': 7, 'chave com espaço': 1, telefone: 5511999999999 },
  { id: 'veu', name: 'veu', type: 'shape', position: { x: 0, y: 0 }, size: { width: 1080, height: 400 }, style: { shapeType: 'svg-path', pathData: 'M0 0 L1080 0 L1080 400 Z', pathViewBox: [0, 0, 1080, 400], fill: '#000000' } },
]
const exp = {
  projeto: { id: 42, name: 'Bistrô Maré', assinatura: { fundo: '#112233', referencia: 'https://blob.test/ref.png', geometria: { story: { margemH: 96 } }, destaque: { fill: '#EA5328', pesado: true }, 'Bistrô Maré': 12, mare: { x: 1 } } },
  paginas: [{ id: 9, templateId: 7, isTemplate: true, name: 'Assinatura — Bistrô Maré', tags: ['assinatura', 'story', 'bistro', 'promo'], width: 1080, height: 1920, background: '#000', order: 0, layers: JSON.stringify(camadas) }],
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
    expect(p.tags).toEqual(['assinatura', 'story']) // 'bistro' (fragmento do nome) e 'promo' (fora das conhecidas) caem
    const [logo, head, img] = p.layers as Array<Record<string, unknown>>
    expect(logo).toEqual({ type: 'logo', fileUrl: 'fixture:logo-0', position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, style: { objectFit: 'cover', border: { color: '#000000', width: 2 } }, metadata: { groupId: 'ref-1' }, id: 'logo', name: 'logo' })
    expect(head.content).toBe('Almoço do dia')
    expect(head.id).toBe('headline')
    expect(head.style).toEqual({ fontFamily: 'Branley GC', textAlign: 'left', color: '#283D36', fontWeight: '400' })
    expect(head.effects).toEqual({ shadow: { shadowColor: '#283D36', blur: 4 }, background: { fit: 'texto', baseColor: '#111111' }, blur: { enabled: true, blurRadius: 6 }, curved: { enabled: false, curvature: 12 } }) // efeitos numéricos do tipo Layer preservados
    expect(head.textboxConfig).toEqual({ anchor: 'top', autoWrap: { breakMode: 'word' }, textMode: 'auto-wrap-fixed' })
    expect(head.metadata).toEqual({ groupId: 'ref-1', layers: [{ type: 'image', position: { x: 0, y: 0 } }] }) // `metadata.layers` aninhado NÃO é camada: o fileUrl dele cai
    expect(img.id).toBe('camada-3')
    expect(img.name).toBe('image-3')
    expect(img.fileUrl).toBe('fixture:arquivo-1')
    expect(img.style).toEqual({ objectFit: 'cover', cropPosition: 'center-bottom', preview: { type: 'image', position: { x: 0, y: 0 } } }) // backgroundImage e os fileUrl ANINHADOS (direto e no objeto-que-parece-camada) descartados; cropPosition fica
    const veu = (p.layers as Array<Record<string, unknown>>)[3]
    expect(veu.style).toEqual({ shapeType: 'svg-path', pathData: 'M0 0 L1080 0 L1080 400 Z', pathViewBox: [0, 0, 1080, 400], fill: '#000000' }) // o vetor da assinatura sobrevive inteiro
    expect(veu.id).toBe('veu')
    expect(Object.keys(img)).not.toContain('telefone')
    expect(Object.keys(img)).not.toContain('Bistrô Maré')
    expect(f.arquivos).toEqual({ 'fixture:logo-0': PNG_LIMPO, 'fixture:arquivo-1': PNG_LIMPO })
    expect(f.logos).toEqual([{ fileUrl: 'fixture:logo-0', isProjectLogo: true }])
    expect(f.candidatasDoVeu).toEqual(['#112233', '#EA5328'])
    expect(descartados).toEqual([
      'paginas[0].tags: tag fora das conhecidas',
      'paginas[0].tags: tag fora das conhecidas',
      'paginas[0].layers[0].metadata.driveFileId: string sob chave fora do esquema',
      'paginas[0].layers[0].metadata.externalId: string sob chave fora do esquema',
      'paginas[0].layers[1].metadata.nota: string sob chave fora do esquema',
      'paginas[0].layers[1].metadata.layers[0].fileUrl: fileUrl fora do topo da camada',
      'paginas[0].layers[2].style.backgroundImage: string sob chave fora do esquema',
      'paginas[0].layers[2].style.fileUrl: fileUrl fora do topo da camada',
      'paginas[0].layers[2].style.preview.fileUrl: fileUrl fora do topo da camada',
      'paginas[0].layers[2].Bistrô Maré: chave fora do esquema',
      'paginas[0].layers[2].chave com espaço: chave fora do esquema',
      'paginas[0].layers[2].telefone: number sob chave fora do esquema',
      'numerosDoProjeto.referencia: string sob chave fora do esquema',
      'numerosDoProjeto.Bistrô Maré: chave fora do esquema',
      'numerosDoProjeto.mare: chave fora do esquema',
    ])
    expect(fragmentosDoNome('Bistrô Maré')).toEqual(['bistromare', 'bistro', 'mare'])
    expect(fragmentosDoNome('Zé')).toEqual(['ze'])
    expect(conferirPseudonimo(f, 'Bistrô Maré')).toEqual([])
    expect(JSON.stringify(f).toLowerCase()).not.toMatch(/bistr|mare|delivery|zé|99999|blob\.test|acme/)
  })
  it('nome CURTO do cliente ("Zé") também não sobrevive, em chave nem em string', () => {
    const ze = { ...exp, projeto: { ...exp.projeto, name: 'Zé', assinatura: { fundo: '#112233', ze: 12 } } }
    const { fixture, descartados } = pseudonimizar(ze, 'cliente-02', arquivos)
    expect(fixture.numerosDoProjeto).toEqual({ fundo: '#112233' })
    expect(descartados).toContain('numerosDoProjeto.ze: chave fora do esquema')
    expect(conferirPseudonimo({ paginas: [{ layers: [{ name: 'zé' }] }] }, 'Zé')).toEqual(['fixture.paginas[0].layers[0].name: nome do cliente'])
  })
  it('nome curto com DUAS palavras ("Jo Li"): barra `fontFamily: \'Jo Li\'`, a chave `jo_li` e `joli`', () => {
    const joli = { ...exp, projeto: { ...exp.projeto, name: 'Jo Li', assinatura: { fundo: '#112233', jo_li: 12, joli: { margemH: 1 } } }, paginas: [{ ...exp.paginas[0], layers: JSON.stringify([{ id: 'headline', name: 'headline', type: 'text', content: 'x', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { fontFamily: 'Jo Li', color: '#fff' } }]) }] }
    const { fixture, descartados } = pseudonimizar(joli, 'cliente-03', arquivos)
    expect(fixture.numerosDoProjeto).toEqual({ fundo: '#112233' })
    expect((fixture.paginas[0].layers as Array<Record<string, unknown>>)[0].style).toEqual({ color: '#fff' })
    expect(descartados).toEqual(expect.arrayContaining(['paginas[0].layers[0].style.fontFamily: fonte com o nome do cliente', 'numerosDoProjeto.jo_li: chave fora do esquema', 'numerosDoProjeto.joli: chave fora do esquema']))
    expect(conferirPseudonimo({ a: 'jo-li', jo_li: 1 }, 'Jo Li')).toEqual(['fixture.a: nome do cliente', 'fixture.a: texto sob chave não prevista', 'fixture.jo_li: chave identifica ou fora da forma'])
  })
  it('campo visual TIPADO do Layer que o esquema não sabe projetar RECUSA a geração (a assinatura mudaria em silêncio)', () => {
    const cropRuim = { ...exp, paginas: [{ ...exp.paginas[0], layers: JSON.stringify([{ id: 'x', type: 'image', fileUrl: EXEMPLO, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { cropPosition: 'https://x' } }]) }] }
    expect(() => pseudonimizar(cropRuim, 'cliente-01', arquivos)).toThrow(/campo visual TIPADO descartado.*style\.cropPosition/)
    const pathRuim = { ...exp, paginas: [{ ...exp.paginas[0], layers: JSON.stringify([{ id: 'x', type: 'shape', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: { pathData: 'M0 0 bistro' } }]) }] }
    expect(() => pseudonimizar(pathRuim, 'cliente-01', arquivos)).toThrow(/pathData fora da gramática SVG/)
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
    const sobras = conferirPseudonimo({ paginas: [{ layers: [{ style: { bg: 'https://x' } }, { name: 'bistrô maré' }, { driveFileId: 'abc' }, { metadata: { externalId: 'acme' } }, { style: { color: '#fff', textAlign: 'left', opacidade: 'meia' } }, { 'Bistrô Maré': 1 }, { name: 'mare-alta' }] }], arquivos: { 'fixture:logo-0': comTexto(PNG_LIMPO) } }, 'Bistrô Maré')
    expect(sobras).toEqual([
      'fixture.paginas[0].layers[0].style.bg: URL',
      'fixture.paginas[0].layers[0].style.bg: texto sob chave não prevista',
      'fixture.paginas[0].layers[1].name: nome do cliente',
      'fixture.paginas[0].layers[2].driveFileId: identificador externo',
      'fixture.paginas[0].layers[2].driveFileId: texto sob chave não prevista',
      'fixture.paginas[0].layers[3].metadata.externalId: identificador externo',
      'fixture.paginas[0].layers[3].metadata.externalId: texto sob chave não prevista',
      'fixture.paginas[0].layers[4].style.opacidade: texto sob chave não prevista',
      'fixture.paginas[0].layers[5].Bistrô Maré: chave identifica ou fora da forma',
      'fixture.paginas[0].layers[6].name: nome do cliente',
      'fixture.arquivos.fixture:logo-0: PNG com tEXt',
    ])
  })
})
