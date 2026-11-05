import { describe, expect, it } from 'vitest'
import {
  ACCEPT_DO_ENVIO,
  ListaDeElementosInvalida,
  RespostaDeElementoInvalida,
  TETO_DO_ENVIO,
  chavesDosElementos,
  lerElementoCriado,
  lerExclusaoConfirmada,
  lerListaDeElementos,
  mensagemDoErroDeEnvio,
  recusaDoArquivoNoEditor,
} from '../lista-de-elementos'

/**
 * CP-V2e: os leitores das três respostas do endpoint de elementos. Nenhuma resposta estranha vira "vazia" nem
 * "sucesso": HTML 200 do login, texto, lista de outro projeto e item incompleto LANÇAM.
 */
const ITEM = { id: 11, name: 'Selo', fileUrl: 'https://blob.test/selo.png', category: null, projectId: 8 }
const HTML_200 = '<!DOCTYPE html><html><body>sign-in</body></html>'

describe('lerListaDeElementos', () => {
  it('[] é vazia confirmada; lista válida volta com só os 5 campos', () => {
    expect(lerListaDeElementos([], 8)).toEqual([])
    const comExtras = { ...ITEM, uploadedBy: 'user_x', createdAt: '2026-10-23T00:00:00Z' }
    expect(lerListaDeElementos([comExtras, { ...ITEM, id: 12, category: 'icone' }], 8)).toEqual([ITEM, { ...ITEM, id: 12, category: 'icone' }])
  })

  it.each([
    ['HTML 200 (texto)', HTML_200],
    ['texto vazio', ''],
    ['objeto', {}],
    ['{ error }', { error: 'x' }],
    ['null', null],
    ['undefined', undefined],
    ['número', 3],
  ])('não-lista lança: %s', (_nome, dado) => {
    expect(() => lerListaDeElementos(dado, 8)).toThrow(ListaDeElementosInvalida)
  })

  it.each([
    ['sem id', { ...ITEM, id: undefined }],
    ['id 0', { ...ITEM, id: 0 }],
    ['id negativo', { ...ITEM, id: -1 }],
    ['id fracionário', { ...ITEM, id: 1.5 }],
    ['id inseguro', { ...ITEM, id: 2 ** 53 }],
    ['id em texto', { ...ITEM, id: '11' }],
    ['sem name', { ...ITEM, name: undefined }],
    ['name número', { ...ITEM, name: 1 }],
    ['sem fileUrl', { ...ITEM, fileUrl: undefined }],
    ['fileUrl vazia', { ...ITEM, fileUrl: '' }],
    ['fileUrl sem http(s)', { ...ITEM, fileUrl: 'javascript:alert(1)' }],
    ['fileUrl relativa', { ...ITEM, fileUrl: '/selo.png' }],
    ['category ausente', { ...ITEM, category: undefined }],
    ['category número', { ...ITEM, category: 3 }],
    ['projectId de outro projeto', { ...ITEM, projectId: 9 }],
    ['projectId em texto', { ...ITEM, projectId: '8' }],
    ['item nulo', null],
    ['item texto', 'x'],
    ['item lista', [ITEM]],
  ])('um item malformado recusa a lista inteira: %s', (_nome, item) => {
    expect(() => lerListaDeElementos([ITEM, item], 8)).toThrow(ListaDeElementosInvalida)
  })

  it('o projeto pedido é o que vale: a mesma lista é válida para 8 e recusada para 9', () => {
    expect(lerListaDeElementos([ITEM], 8)).toHaveLength(1)
    expect(() => lerListaDeElementos([ITEM], 9)).toThrow(ListaDeElementosInvalida)
  })
})

describe('lerElementoCriado (resposta do POST)', () => {
  it('objeto válido do mesmo projeto vira o elemento', () => {
    expect(lerElementoCriado({ ...ITEM, uploadedBy: 'u', createdAt: 'x' }, 8)).toEqual(ITEM)
  })
  it.each([
    ['HTML 200', HTML_200],
    ['texto', 'ok'],
    ['lista', [ITEM]],
    ['{}', {}],
    ['{ success: true }', { success: true }],
    ['sem fileUrl', { ...ITEM, fileUrl: undefined }],
    ['outro projectId', { ...ITEM, projectId: 9 }],
    ['null', null],
  ])('lança: %s', (_nome, dado) => {
    expect(() => lerElementoCriado(dado, 8)).toThrow(RespostaDeElementoInvalida)
  })
})

describe('lerExclusaoConfirmada (resposta do DELETE)', () => {
  it('só { success: true } (objeto) é sucesso', () => {
    expect(() => lerExclusaoConfirmada({ success: true })).not.toThrow()
  })
  it.each([
    ['HTML 200', HTML_200],
    ['texto', 'ok'],
    ['texto "true"', 'true'],
    ['{}', {}],
    ['{ success: false }', { success: false }],
    ['{ success: "true" }', { success: 'true' }],
    ['[{ success: true }]', [{ success: true }]],
    ['null', null],
    ['undefined', undefined],
  ])('lança: %s', (_nome, dado) => {
    expect(() => lerExclusaoConfirmada(dado)).toThrow(RespostaDeElementoInvalida)
  })
})

describe('chavesDosElementos', () => {
  it('as 3 keys vivas do endpoint, do projeto pedido', () => {
    expect(chavesDosElementos(8)).toEqual([
      ['project-elements', 8],
      ['project-assets', 8, 'elements'],
      ['project', 8, 'elements'],
    ])
  })
})

describe('envio no editor: formato e teto', () => {
  const arquivo = (name: string, type: string, size = 10) => ({ name, type, size })
  it('teto de 4.194.304 bytes (4 MiB), e o accept cobre os 4 formatos', () => {
    expect(TETO_DO_ENVIO).toBe(4_194_304)
    for (const t of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) expect(ACCEPT_DO_ENVIO).toContain(t)
  })
  it.each([
    ['PNG', arquivo('a.png', 'image/png')],
    ['JPEG', arquivo('a.jpg', 'image/jpeg')],
    ['WebP', arquivo('a.webp', 'image/webp')],
    ['SVG', arquivo('a.svg', 'image/svg+xml')],
    ['SVG sem tipo do sistema', arquivo('a.SVG', '')],
    ['exatamente no teto', arquivo('a.png', 'image/png', 4_194_304)],
  ])('aceita %s', (_nome, f) => {
    expect(recusaDoArquivoNoEditor(f)).toBeNull()
  })
  it('recusa formato e tamanho com mensagem', () => {
    expect(recusaDoArquivoNoEditor(arquivo('a.gif', 'image/gif'))).toMatch(/formato/i)
    expect(recusaDoArquivoNoEditor(arquivo('a.pdf', 'application/pdf'))).toMatch(/formato/i)
    expect(recusaDoArquivoNoEditor(arquivo('a.gif', ''))).toMatch(/formato/i)
    expect(recusaDoArquivoNoEditor(arquivo('a.png', 'image/png', 4_194_305))).toBe('arquivo acima de 4 MB: envie pela Identidade visual')
  })
})

describe('mensagemDoErroDeEnvio', () => {
  it('usa o "error" do JSON; 413 que não é JSON vira "grande demais"; resto, o status', () => {
    expect(mensagemDoErroDeEnvio(415, JSON.stringify({ error: 'Formato não suportado' }))).toBe('Formato não suportado')
    expect(mensagemDoErroDeEnvio(413, 'Request Entity Too Large')).toMatch(/grande demais/)
    expect(mensagemDoErroDeEnvio(413, JSON.stringify({ error: 'Arquivo acima de 100 MB' }))).toBe('Arquivo acima de 100 MB')
    expect(mensagemDoErroDeEnvio(500, HTML_200)).toBe('Falha ao enviar (HTTP 500)')
    expect(mensagemDoErroDeEnvio(403, JSON.stringify({ nada: 1 }))).toBe('Falha ao enviar (HTTP 403)')
  })
})
