/**
 * CP-X1 — o finalize e o `svg-path`. A rota grava o PNG que o CLIENTE desenhou; a aba
 * anterior ao CP-X1 desenhava retângulo. Guardas por DADO, depois do acesso e antes de
 * qualquer efeito externo:
 * - 422 vetor desenhado que a prévia não desenha igual ao servidor (com ou sem a marca);
 * - 409 vetor desenhado vindo de cliente sem `previa: 'vetor-v1'`.
 * A marca é compatibilidade do fluxo do app, não prova de pixel (chamada forjada passa).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  podeEscrever: true,
  efeitos: [] as string[],
  layersGravadas: null as unknown,
  pagina: null as any,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectWriteAccess: () => m.podeEscrever,
}))
vi.mock('@vercel/blob', () => ({
  put: async () => {
    m.efeitos.push('put')
    return { url: 'https://blob.test/c.png', pathname: 'c.png' }
  },
}))
vi.mock('@/lib/aprendizado/uso-de-modelo', () => ({
  registrarUsoDeModelo: async () => {
    m.efeitos.push('uso')
  },
}))
vi.mock('@/lib/db', () => ({
  db: {
    page: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        m.pagina && where.id === m.pagina.id && where.templateId === m.pagina.templateId ? m.pagina : null,
      count: async () => 0,
      create: async ({ data }: { data: { layers: string } }) => {
        m.efeitos.push('page')
        m.layersGravadas = JSON.parse(data.layers)
        return { id: 'nova' }
      },
    },
    generation: {
      create: async () => {
        m.efeitos.push('generation')
        return { id: 'g1' }
      },
    },
    aICreativeGeneration: {
      create: async () => {
        m.efeitos.push('ai')
        return { id: 'a1' }
      },
    },
  },
}))

import { POST } from '../route'

const vetor = (style: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 'v1', type: 'shape', name: 'Onda', visible: true,
  position: { x: 10, y: 10 }, size: { width: 300, height: 100 },
  style: {
    shapeType: 'svg-path', pathData: 'M10 10 L90 10 L90 90 Z', pathViewBox: [0, 0, 100, 100],
    pathFillRule: 'evenodd', flipH: true, fill: '#111111', strokeColor: '#000000', strokeWidth: 4,
    vetor: { asset: 'onda-base', papeis: { fill: 'escuro' } },
    ...style,
  },
  ...extra,
})
const texto = { id: 't1', type: 'text', name: 'Título', content: 'Oi', position: { x: 0, y: 0 }, size: { width: 100, height: 40 } }

const corpo = (extra: Record<string, unknown> = {}) => ({
  templateId: 5,
  templatePageId: 'pg1',
  // o PNG da aba antiga — com o retângulo. A rota não o inspeciona (limite declarado)
  dataUrl: 'data:image/png;base64,aGVsbG8=',
  images: {},
  texts: {},
  layers: [texto],
  ...extra,
})
const post = (b: unknown) => POST(new Request('http://t/api/gerar-criativo/finalize', { method: 'POST', body: JSON.stringify(b) }))

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = 'tok'
  m.podeEscrever = true
  m.efeitos = []
  m.layersGravadas = null
  m.pagina = {
    id: 'pg1', templateId: 5, isTemplate: true, width: 1080, height: 1920, background: null,
    Template: { id: 5, name: 'T', projectId: 7, Project: { name: 'Cliente' } },
  }
})

const NADA = [] as string[]
const TUDO = ['put', 'page', 'generation', 'ai', 'uso']

describe('finalize × svg-path: precedência', () => {
  it('sem escrita no projeto + vetor inválido → 404 (o acesso vem antes das guardas)', async () => {
    m.podeEscrever = false
    const r = await post(corpo({ layers: [vetor({ pathData: 'hello' })] }))
    expect(r.status).toBe(404)
    expect(m.efeitos).toEqual(NADA)
  })

  it('vetor inválido e sem a marca → 422, não 409 (dado antes de versão)', async () => {
    const r = await post(corpo({ layers: [vetor({ pathData: 'hello' })] }))
    expect(r.status).toBe(422)
    expect((await r.json()).codigo).toBe('VETOR_SEM_SUPORTE_NA_PREVIA')
    expect(m.efeitos).toEqual(NADA)
  })

  it('marca com valor desconhecido → 400', async () => {
    const r = await post(corpo({ layers: [vetor()], previa: 'vetor-v0' }))
    expect(r.status).toBe(400)
    expect(m.efeitos).toEqual(NADA)
  })
})

describe('finalize × svg-path: recusas (zero efeito externo)', () => {
  it('vetor desenhado sem a marca (PNG de cliente antigo, com retângulo) → 409 PREVIA_DESATUALIZADA', async () => {
    const r = await post(corpo({ layers: [texto, vetor()] }))
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ codigo: 'PREVIA_DESATUALIZADA' })
    expect(m.efeitos).toEqual(NADA)
  })

  it.each([
    ['path ausente', vetor({ pathData: undefined }), 'PATH_AUSENTE', undefined],
    ['path inválido', vetor({ pathData: 'M10 10 L' }), 'PATH_INVALIDO', 'ARGUMENTOS'],
    ['viewBox inválido', vetor({ pathViewBox: [0, 0, 0, 100] }), 'VIEWBOX_INVALIDO', undefined],
    ['viewBox null', vetor({ pathViewBox: null }), 'VIEWBOX_INVALIDO', undefined],
    ['sombra', vetor({}, { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 1 } } }), 'EFEITO_SEM_SUPORTE', 'shadow'],
    ['desfoque', vetor({}, { effects: { blur: { enabled: true, blurRadius: 40 } } }), 'EFEITO_SEM_SUPORTE', 'blur'],
  ])('%s, mesmo COM a marca → 422 com id e motivo', async (_nome, camada, codigo, detalhe) => {
    const r = await post(corpo({ layers: [texto, camada], previa: 'vetor-v1' }))
    expect(r.status).toBe(422)
    const json = await r.json()
    expect(json.codigo).toBe('VETOR_SEM_SUPORTE_NA_PREVIA')
    expect(json.camadas).toHaveLength(1)
    expect(json.camadas[0].id).toBe('v1')
    expect(json.camadas[0].motivos[0]).toMatchObject({ codigo, ...(detalhe ? { detalhe } : {}) })
    expect(m.efeitos).toEqual(NADA)
  })
})

describe('finalize × svg-path: aceites', () => {
  it('vetor em hiddenLayerIds, sem a marca → 200 e a camada não é gravada', async () => {
    const r = await post(corpo({ layers: [texto, vetor({ pathData: 'hello' })], hiddenLayerIds: ['v1'] }))
    expect(r.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
    expect((m.layersGravadas as Array<{ id: string }>).map((l) => l.id)).toEqual(['t1'])
  })

  it('vetor com visible: false e path inválido, sem a marca → 200 (não é desenhado; gravado oculto — porta do X2)', async () => {
    const r = await post(corpo({ layers: [texto, vetor({ pathData: 'hello' }, { visible: false })] }))
    expect(r.status).toBe(200)
    const gravadas = m.layersGravadas as Array<{ id: string; visible: boolean }>
    expect(gravadas.map((l) => [l.id, l.visible])).toEqual([['t1', undefined], ['v1', false]])
  })

  it('sem vetor e sem a marca → 200, igual a antes do CP-X1', async () => {
    const r = await post(corpo())
    expect(r.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
  })

  it('com a marca e vetor válido → 200, e o vetor é gravado byte a byte', async () => {
    const v = vetor()
    const r = await post(corpo({ layers: [texto, v], previa: 'vetor-v1' }))
    expect(r.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
    const gravado = (m.layersGravadas as Array<{ id: string; style: unknown }>).find((l) => l.id === 'v1')
    expect(gravado?.style).toEqual(v.style)
  })
})

/**
 * G4.2 (27/10/2026) — imagem e grade de fotos. A guarda corre nas camadas EFETIVAS (`processedLayers`, depois das fotos
 * trocadas) e antes de qualquer efeito: célula de grade ou foto com recorte manual vinda de cliente sem
 * `previaDeImagem: 'imagem-v1'` → 409; grade incoerente nas camadas efetivas (foto de host alheio, célula oculta) →
 * 422 MESMO com a marca. Camadas só de imagem, sem vetor nenhum.
 */
describe('finalize × imagem e grade (G4.2)', () => {
  const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
  const gm = { id: 'g1', layout: '2-colunas', versao: 1, espacamento: 10, raio: 0, caixa: { x: 0, y: 0, w: 1080, h: 1350 } }
  const cel = (id: string, i: number, fileUrl: string, style: Record<string, unknown> = {}) => ({
    id, type: 'image', name: `Grade · foto ${i + 1}`, visible: true, locked: false, order: i, rotation: 0,
    position: { x: i === 0 ? 0 : 545, y: 0 }, size: { width: 535, height: 1350 }, fileUrl,
    style: { objectFit: 'cover', border: { radius: 0 }, ...style }, metadata: { grade: { ...gm, celula: i }, groupId: 'g1' },
  })
  const grade = () => [cel('c0', 0, `${BLOB}/a.jpg`, { crop: { x: 0.1, y: 0, width: 0.4, height: 1 } }), cel('c1', 1, '')]
  const avulsa = (style: Record<string, unknown>, fileUrl = `${BLOB}/f.jpg`) => ({ id: 'f', type: 'image', name: 'Foto', position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, fileUrl, style })
  const MARCA = { previaDeImagem: 'imagem-v1' }

  it('grade só de imagens, sem vetor, de cliente sem a marca → 409 PREVIA_DESATUALIZADA com as células, zero efeito', async () => {
    const r = await post(corpo({ layers: [texto, ...grade()], previa: 'vetor-v1' }))
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ codigo: 'PREVIA_DESATUALIZADA', camadas: ['c0', 'c1'] })
    expect(m.efeitos).toEqual(NADA)
  })

  it('foto avulsa com recorte manual, sem a marca → 409; a mesma foto só com cover → 200 (cliente antigo segue)', async () => {
    const r = await post(corpo({ layers: [texto, avulsa({ objectFit: 'cover', crop: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } })] }))
    expect(r.status).toBe(409)
    expect(m.efeitos).toEqual(NADA)
    const ok = await post(corpo({ layers: [texto, avulsa({ objectFit: 'cover' })] }))
    expect(ok.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
  })

  it('o override de foto é o que introduz o recorte: sem foto o recorte não é desenhado (200); com a foto trocada, 409', async () => {
    const semFoto = avulsa({ objectFit: 'cover', crop: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } }, '')
    expect((await post(corpo({ layers: [texto, semFoto] }))).status).toBe(200)
    m.efeitos = []
    const r = await post(corpo({ layers: [texto, semFoto], images: { f: { type: 'upload', url: `${BLOB}/nova.jpg` } } }))
    expect(r.status).toBe(409)
    expect(m.efeitos).toEqual(NADA)
  })

  it('com a marca: 200 e a grade gravada inteira (recorte, raio, metadata, vazia); a foto trocada numa célula vale', async () => {
    const r = await post(corpo({ layers: [texto, ...grade()], images: { c1: { type: 'upload', url: `${BLOB}/b.jpg` } }, ...MARCA }))
    expect(r.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
    const gravadas = m.layersGravadas as Array<Record<string, any>>
    expect(gravadas.find((l) => l.id === 'c0')).toEqual(grade()[0])
    expect(gravadas.find((l) => l.id === 'c1')!.fileUrl).toBe(`${BLOB}/b.jpg`)
    expect(gravadas.find((l) => l.id === 'c1')!.metadata).toEqual(grade()[1].metadata)
  })

  it.each([
    ['foto da célula de host alheio (data:)', { images: { c1: { type: 'upload', url: 'data:image/png;base64,aGVsbG8=' } } }, 'URL_INVALIDA'],
    ['foto da célula do CDN do Drive (lh3)', { images: { c0: { type: 'drive', url: 'https://lh3.googleusercontent.com/x' } } }, 'URL_INVALIDA'],
    ['célula oculta pelo assistente (grade gravada pela metade)', { hiddenLayerIds: ['c1'] }, 'GRADE_INCOERENTE'],
  ])('%s, MESMO com a marca → 422 com o diagnóstico, zero efeito', async (_nome, extra, codigo) => {
    const r = await post(corpo({ layers: [texto, ...grade()], ...MARCA, ...extra }))
    expect(r.status).toBe(422)
    const json = await r.json()
    expect(json.codigo).toBe('GRADE_INCOERENTE')
    expect(json.diagnosticos.map((d: { codigo: string }) => d.codigo)).toContain(codigo)
    expect(m.efeitos).toEqual(NADA)
  })

  it('marca de imagem com valor desconhecido → 400; a guarda do vetor segue igual (vetor sem `previa` → 409)', async () => {
    expect((await post(corpo({ layers: [texto, ...grade()], previaDeImagem: 'imagem-v0' }))).status).toBe(400)
    const r = await post(corpo({ layers: [texto, vetor(), ...grade()], ...MARCA }))
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ codigo: 'PREVIA_DESATUALIZADA' })
    expect(m.efeitos).toEqual(NADA)
  })

  it('as duas marcas, vetor válido e grade: 200', async () => {
    const r = await post(corpo({ layers: [texto, vetor(), ...grade()], previa: 'vetor-v1', ...MARCA }))
    expect(r.status).toBe(200)
    expect(m.efeitos).toEqual(TUDO)
  })
})
