import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CreativeError } from '../errors'

const banco = vi.hoisted(() => ({ decisoes: [] as Array<Record<string, unknown>>, tabelaCaiu: false, escritas: [] as unknown[] }))
const drive = vi.hoisted(() => ({
  catalogo: null as null | { images: Array<Record<string, unknown>> },
  findFileInFolder: vi.fn(),
  readFileAsJson: vi.fn(),
  writeFileAsJson: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ googleDriveImagesFolderId: '1pastaDoProjeto00000000000', googleDriveFolderId: null }) },
    photoAssunto: {
      findMany: async ({ where }: { where: { revogadoEm: null; driveFileId: { in: string[] } } }) => {
        if (banco.tabelaCaiu) throw new Error('tabela caiu')
        return banco.decisoes.filter((d) => !d.revogadoEm && where.driveFileId.in.includes(d.driveFileId as string))
      },
      upsert: async (args: unknown) => {
        banco.escritas.push(args)
      },
      updateMany: async (args: { where: { driveFileId: string } }) => {
        banco.escritas.push(args)
        for (const d of banco.decisoes) if (d.driveFileId === args.where.driveFileId) d.revogadoEm = new Date()
        return { count: 1 }
      },
    },
  },
}))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: drive }))
vi.mock('@/lib/creatives/embeddings-de-foto', () => ({}))

import { ASSUNTO_NAO_ANALISADO, assuntoEfetivoDaFoto } from '../assunto-da-foto-efetivo'
import { assuntosEfetivosDoProjeto, buscarNoAcervo, marcarAssuntoDaFoto } from '../acervo'
import { escreverCatalogoPreservandoCaixas } from '../reconciliar-catalogo'
import { fonteDaFoto } from '@/lib/compositor/assunto-da-foto'

const CAIXA = { x0: 0.1, y0: 0.2, x1: 0.5, y1: 0.6 }
const CAIXA_HUMANA = { x0: 0.3, y0: 0.3, x1: 0.9, y1: 0.9 }
const ANALISADA = '2026-11-02T00:00:00.000Z'

beforeEach(() => {
  banco.decisoes = []
  banco.tabelaCaiu = false
  banco.escritas = []
  drive.catalogo = { images: [{ driveFileId: 'a', fileName: 'a.jpg', folder: '', caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA }] }
  drive.findFileInFolder.mockReset().mockResolvedValue('catalogo-id')
  drive.readFileAsJson.mockReset().mockImplementation(async () => drive.catalogo)
  drive.writeFileAsJson.mockReset().mockResolvedValue(undefined)
})

describe('assuntoEfetivoDaFoto', () => {
  const visao = { caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA }

  it('a humana vence a visão, e a visão reescrita por --force não a toca', () => {
    expect(assuntoEfetivoDaFoto(visao, { decisao: 'caixa', caixa: CAIXA_HUMANA })).toEqual({ caixa: CAIXA_HUMANA, origem: 'humano', estado: 'localizada' })
    expect(assuntoEfetivoDaFoto({ caixaDoAssunto: null, caixaAnalisadaEm: ANALISADA }, { decisao: 'caixa', caixa: CAIXA_HUMANA }).origem).toBe('humano')
  })
  it('a negativa humana persiste sobre a caixa da visão', () => {
    expect(assuntoEfetivoDaFoto(visao, { decisao: 'sem-assunto', caixa: null })).toEqual({ caixa: null, origem: 'humano', estado: 'sem-assunto' })
  })
  it('a revogada não vale', () => {
    expect(assuntoEfetivoDaFoto(visao, { decisao: 'sem-assunto', caixa: null, revogadoEm: new Date() })).toEqual({ caixa: CAIXA, origem: 'visao', estado: 'localizada' })
  })
  it('null analisado é sem-assunto; ausente e nunca analisada são nao-analisada', () => {
    expect(assuntoEfetivoDaFoto({ caixaDoAssunto: null, caixaAnalisadaEm: ANALISADA }, null)).toEqual({ caixa: null, origem: 'visao', estado: 'sem-assunto' })
    expect(assuntoEfetivoDaFoto(undefined, null)).toEqual(ASSUNTO_NAO_ANALISADO)
    expect(assuntoEfetivoDaFoto({}, null)).toEqual(ASSUNTO_NAO_ANALISADO)
    expect(assuntoEfetivoDaFoto({ caixaDoAssunto: 'croissant' }, null)).toEqual(ASSUNTO_NAO_ANALISADO)
  })
})

describe('assuntosEfetivosDoProjeto', () => {
  const semCatalogo = () => drive.findFileInFolder.mockResolvedValue(null)

  it('mescla a entrada e a decisão humana', async () => {
    banco.decisoes = [{ driveFileId: 'b', decisao: 'sem-assunto', caixa: null }]
    const m = await assuntosEfetivosDoProjeto(1, ['a', 'b', 'c'])
    expect(m.get('a')).toMatchObject({ origem: 'visao', estado: 'localizada' })
    expect(m.get('b')).toMatchObject({ origem: 'humano', estado: 'sem-assunto' })
    expect(m.get('c')).toEqual(ASSUNTO_NAO_ANALISADO)
  })
  it('SEM_CATALOGO: a decisão humana vale sem catálogo', async () => {
    semCatalogo()
    banco.decisoes = [
      { driveFileId: 'a', decisao: 'caixa', caixa: CAIXA_HUMANA },
      { driveFileId: 'b', decisao: 'sem-assunto', caixa: null },
    ]
    const m = await assuntosEfetivosDoProjeto(1, ['a', 'b', 'c'])
    expect(m.get('a')).toEqual({ caixa: CAIXA_HUMANA, origem: 'humano', estado: 'localizada' })
    expect(m.get('b')).toEqual({ caixa: null, origem: 'humano', estado: 'sem-assunto' })
    expect(m.get('c')).toEqual(ASSUNTO_NAO_ANALISADO)
  })
  it('a tabela e o catálogo lançando LANÇAM: quem decide é quem chama', async () => {
    banco.tabelaCaiu = true
    await expect(assuntosEfetivosDoProjeto(1, ['a'])).rejects.toThrow('tabela caiu')
    banco.tabelaCaiu = false
    drive.readFileAsJson.mockRejectedValue(new Error('drive caiu'))
    await expect(assuntosEfetivosDoProjeto(1, ['a'])).rejects.toThrow('drive caiu')
  })
})

describe('buscarNoAcervo devolve o assunto efetivo', () => {
  const buscar = () => buscarNoAcervo({ projectId: 1, registrarSugestao: false })

  it('por foto, com a decisão humana mesclada', async () => {
    banco.decisoes = [{ driveFileId: 'a', decisao: 'sem-assunto', caixa: null }]
    const r = await buscar()
    expect(r.images[0].assuntoEfetivo).toEqual({ caixa: null, origem: 'humano', estado: 'sem-assunto' })
  })
  it('a tabela caindo não derruba a busca: tira o campo e avisa', async () => {
    banco.tabelaCaiu = true
    const r = await buscar()
    expect(r.images).toHaveLength(1)
    expect(r.images[0]).not.toHaveProperty('assuntoEfetivo')
    expect(r.avisos?.join(' ')).toContain('assuntoEfetivo')
  })
})

describe('marcarAssuntoDaFoto', () => {
  const base = { projectId: 1, driveFileId: 'a', decididoPor: 'u1' }

  it('caixa inválida recusa antes de qualquer leitura ou escrita', async () => {
    await expect(marcarAssuntoDaFoto({ ...base, decisao: 'caixa', caixa: { x0: 0.5, y0: 0, x1: 0.2, y1: 1 } })).rejects.toMatchObject({ code: 'CAIXA_DO_ASSUNTO_INVALIDA' })
    await expect(marcarAssuntoDaFoto({ ...base, decisao: 'caixa' })).rejects.toBeInstanceOf(CreativeError)
    expect(banco.escritas).toEqual([])
    expect(drive.readFileAsJson).not.toHaveBeenCalled()
  })
  it('sem-assunto persiste, vence a visão e devolve o anterior', async () => {
    const r = await marcarAssuntoDaFoto({ ...base, decisao: 'sem-assunto' })
    expect(r.anterior).toMatchObject({ origem: 'visao', estado: 'localizada' })
    expect(r.efetivo).toEqual({ caixa: null, origem: 'humano', estado: 'sem-assunto' })
    expect(banco.escritas).toHaveLength(1)
  })
  it('caixa grava a humana; automatico revoga e a visão volta', async () => {
    const r = await marcarAssuntoDaFoto({ ...base, decisao: 'caixa', caixa: CAIXA_HUMANA })
    expect(r.efetivo).toEqual({ caixa: CAIXA_HUMANA, origem: 'humano', estado: 'localizada' })
    banco.decisoes = [{ driveFileId: 'a', decisao: 'caixa', caixa: CAIXA_HUMANA }]
    const volta = await marcarAssuntoDaFoto({ ...base, decisao: 'automatico' })
    expect(volta.anterior.origem).toBe('humano')
    expect(volta.efetivo).toEqual({ caixa: CAIXA, origem: 'visao', estado: 'localizada' })
  })
  it('nada é escrito no JSON do Drive', async () => {
    await marcarAssuntoDaFoto({ ...base, decisao: 'sem-assunto' })
    expect(drive.writeFileAsJson).not.toHaveBeenCalled()
  })
})

describe('escreverCatalogoPreservandoCaixas', () => {
  const entrada = (id: string, extra: Record<string, unknown> = {}) => ({ driveFileId: id, description: `foto ${id}`, ...extra })
  const gravado = () => drive.writeFileAsJson.mock.calls[0][1] as { images: Array<Record<string, unknown>> }

  it('o escritor com snapshot velho NÃO apaga a caixa gravada depois dele', async () => {
    drive.catalogo = { images: [entrada('a', { caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA })] }
    await escreverCatalogoPreservandoCaixas('c', { images: [entrada('a', { description: 'do cron' })] }, { alteradas: new Set() })
    expect(gravado().images[0]).toEqual({ driveFileId: 'a', description: 'do cron', caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA })
  })
  it('quem analisou a foto nesta rodada grava por cima', async () => {
    drive.catalogo = { images: [entrada('a', { caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA })] }
    await escreverCatalogoPreservandoCaixas('c', { images: [entrada('a', { caixaDoAssunto: null, caixaAnalisadaEm: 'novo' })] }, { alteradas: new Set(['a']) })
    expect(gravado().images[0]).toMatchObject({ caixaDoAssunto: null, caixaAnalisadaEm: 'novo' })
  })
  it('análise inválida nesta rodada: fora de `alteradas`, a caixa e o carimbo frescos sobrevivem', async () => {
    drive.catalogo = { images: [entrada('a', { caixaDoAssunto: CAIXA_HUMANA, caixaAnalisadaEm: 'do concorrente' })] }
    await escreverCatalogoPreservandoCaixas('c', { images: [entrada('a', { caixaDoAssunto: CAIXA, caixaAnalisadaEm: ANALISADA })] }, { alteradas: new Set() })
    expect(gravado().images[0]).toMatchObject({ caixaDoAssunto: CAIXA_HUMANA, caixaAnalisadaEm: 'do concorrente' })
  })
  it('a entrada que o fresco não tem fica como veio, e a caixa que o fresco não tem some do documento velho', async () => {
    drive.catalogo = { images: [entrada('a')] }
    await escreverCatalogoPreservandoCaixas('c', { images: [entrada('a', { caixaDoAssunto: CAIXA }), entrada('b', { caixaDoAssunto: CAIXA })] }, { alteradas: new Set() })
    expect(gravado().images[0]).not.toHaveProperty('caixaDoAssunto')
    expect(gravado().images[1]).toMatchObject({ caixaDoAssunto: CAIXA })
  })
  it('o save do catálogo só passa pela função: o cron e o enriquecedor não escrevem por fora', () => {
    const fonte = (arquivo: string) => readFileSync(resolve(process.cwd(), arquivo), 'utf8')
    const cron = fonte('src/lib/creatives/reconciliar-catalogo.ts')
    expect(cron.match(/writeFileAsJson/g)).toHaveLength(1)
    expect(cron).toContain('await escreverCatalogoPreservandoCaixas(')
    const enriquecer = fonte('scripts/enriquecer-catalogo.ts')
    expect(enriquecer).not.toContain('files.update')
    expect(enriquecer).toContain('escreverCatalogoPreservandoCaixas(catalog.catalogFileId!')
  })
})

describe('fonteDaFoto', () => {
  const LH3 = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w2000`
  const PROXY = (id: string) => `https://studio.test/api/google-drive/image/${id}`

  it('driveFileId sozinho ou lh3 do mesmo id: coerente', () => {
    expect(fonteDaFoto({ driveFileId: 'A' })).toEqual({ id: 'A', coerente: true })
    expect(fonteDaFoto({ url: LH3('A') })).toEqual({ id: 'A', coerente: true })
    expect(fonteDaFoto({ url: LH3('A'), driveFileId: 'A' })).toEqual({ id: 'A', coerente: true })
  })
  it('a caixa de A nunca cai sobre B', () => {
    expect(fonteDaFoto({ url: LH3('B'), driveFileId: 'A' })).toEqual({ id: 'B', coerente: false, motivo: 'id-diverge-da-url' })
  })
  it('o proxy serve o arquivo original: não coerente, com e sem driveFileId', () => {
    expect(fonteDaFoto({ url: PROXY('A'), driveFileId: 'A' })).toEqual({ id: 'A', coerente: false, motivo: 'url-nao-renderizada-pelo-drive' })
    expect(fonteDaFoto({ url: PROXY('A') })).toEqual({ id: 'A', coerente: false, motivo: 'url-nao-renderizada-pelo-drive' })
  })
  it('Blob: sem id; com driveFileId ao lado, a fonte desenhada segue sendo o Blob', () => {
    const blob = 'https://x.public.blob.vercel-storage.com/foto.jpg'
    expect(fonteDaFoto({ url: blob })).toEqual({ id: null, coerente: false, motivo: 'sem-id' })
    expect(fonteDaFoto({ url: blob, driveFileId: 'A' })).toEqual({ id: null, coerente: false, motivo: 'url-nao-renderizada-pelo-drive' })
    expect(fonteDaFoto({})).toEqual({ id: null, coerente: false, motivo: 'sem-id' })
  })
})
