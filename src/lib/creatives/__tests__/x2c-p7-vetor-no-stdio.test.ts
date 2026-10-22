/**
 * CP-X2c (P7) — o vetor inválido no MCP stdio (`create-page`, `create-template`) e no `prepararCamadasParaGravar`.
 *
 * Os handlers REAIS de `scripts/mcp-server.ts`, capturados por um `McpServer` falso: nenhum servidor sobe, nenhum
 * transporte abre, o `.env` não é lido (`dotenv/config` mockado) e o Prisma é um cliente em memória. O setup do
 * vitest já bloqueia rede e apaga `DATABASE_URL`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const registro = vi.hoisted(() => ({
  handlers: new Map<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>>(),
  conectou: 0,
}))
const banco = vi.hoisted(() => ({ templates: [] as unknown[], paginas: [] as unknown[] }))

vi.mock('dotenv/config', () => ({}))
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    registerTool(nome: string, _cfg: unknown, handler: never) {
      registro.handlers.set(nome, handler)
    }
    async connect() {
      registro.conectou++
    }
  },
}))
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: class {} }))
vi.mock('googleapis/build/src/apis/drive', () => ({ auth: { OAuth2: class { setCredentials() {} } }, drive: () => ({}) }))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async () => { throw new Error('Blob não pode ser usado neste teste') }) }))
vi.mock('../../../../prisma/generated/client', () => ({
  PrismaClient: class {
    project = { findUnique: async () => ({ userId: 'u-interno' }) }
    template = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const t = { id: 500 + banco.templates.length, ...data }
        banco.templates.push(t)
        return t
      },
    }
    page = {
      aggregate: async () => ({ _max: { order: 2 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: `pg-${banco.paginas.length}`, ...data }
        banco.paginas.push(p)
        return p
      },
    }
    async $disconnect() {}
  },
}))
vi.mock('../../mcp/catalogo', () => ({ CATALOGO: new Map() }))
vi.mock('../../mcp/catalogo/integracao', () => ({ executarToolLocal: vi.fn() }))
vi.mock('../../mcp/autor-local', () => ({ principalLocal: vi.fn(), resolverAutorLocal: vi.fn(async () => null) }))

import { prepararCamadasParaGravar, validarCamadas } from '../layer-contract'

const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z'
const vetor = (id: string, style: Record<string, unknown> = {}) => ({
  id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 10, y: 20 }, size: { width: 300, height: 200 },
  style: { shapeType: 'svg-path', pathData: ETIQUETA, fill: '#f97316', ...style },
})
const texto = (id: string) => ({ id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 0, y: 0 }, size: { width: 800, height: 80 }, content: 'Sexta', style: { fontSize: 40, fontWeight: 700 } })

describe('prepararCamadasParaGravar (P7): vetor inválido é problema avulso, com VETOR_INVALIDO no texto', () => {
  it('recusa com o código e os motivos; a camada não é retirada antes (o schema não muda)', () => {
    const entrada = [texto('t'), vetor('etq', { pathData: '' }), vetor('b', { fill: 'currentcolor' })]
    expect(() => prepararCamadasParaGravar(entrada)).toThrow(/camada etq: VETOR_INVALIDO \(PATH_AUSENTE\).*camada b: VETOR_INVALIDO \(COR_INVALIDA:fill\)/)
    // o contrato de leitura (`validarCamadas`, que o reverter usa) continua aceitando a camada e sem problema vetorial
    const v = validarCamadas(entrada)
    expect(v.camadas.map((c) => c.id)).toEqual(['t', 'etq', 'b'])
    expect(v.problemas).toEqual([])
  })

  it('vetor válido: mesma normalização de antes; problemas de schema seguem no mesmo texto', () => {
    const r = prepararCamadasParaGravar([texto('t'), vetor('etq')])
    // a normalização de antes renumera e ordena pelo `order` (o vetor tem order 1, o texto 2)
    expect(r.camadas.map((c) => c.id)).toEqual(['etq', 't'])
    expect((r.camadas.find((c) => c.id === 'etq')!.style as Record<string, unknown>).pathData).toBe(ETIQUETA)
    expect(() => prepararCamadasParaGravar([{ id: 'x', type: 'shape' }, vetor('v', { pathViewBox: null })])).toThrow(/camada x: .*\| camada v: VETOR_INVALIDO \(VIEWBOX_INVALIDO\)/)
  })

  it('schema E vetor inválidos na MESMA camada: o texto traz os dois (candidatos crus), e nenhuma camada é descartada antes', () => {
    const { size: _size, ...semTamanho } = vetor('solta', { pathData: '' })
    const erro = (() => {
      try {
        prepararCamadasParaGravar([texto('t'), semTamanho])
      } catch (e) {
        return (e as Error).message
      }
      return ''
    })()
    expect(erro).toMatch(/camada solta: size: Required/)
    expect(erro).toMatch(/camada solta: VETOR_INVALIDO \(PATH_AUSENTE\)/)
  })

  it('tipo errado de cor não lança TypeError: vira problema', () => {
    expect(() => prepararCamadasParaGravar([vetor('etq', { strokeColor: {} })])).toThrow(/VETOR_INVALIDO \(COR_INVALIDA:strokeColor\)/)
  })
})

describe('MCP stdio (P7): handlers reais, sem servidor nem banco', () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBeUndefined()
    await import('../../../../scripts/mcp-server')
  })
  beforeEach(() => {
    banco.templates = []
    banco.paginas = []
  })
  const chamar = (nome: string, args: Record<string, unknown>) => registro.handlers.get(nome)!(args)

  it('o servidor falso registrou as tools; o `connect` do main() foi o falso (nenhum transporte real)', () => {
    expect(registro.conectou).toBe(1)
    expect(registro.handlers.has('create-page')).toBe(true)
    expect(registro.handlers.has('create-template')).toBe(true)
  })

  it('create-page com vetor inválido → isError com VETOR_INVALIDO; nada criado', async () => {
    const r = await chamar('create-page', { templateId: 77, name: 'Sexta', layers: JSON.stringify([texto('t'), vetor('etq', { pathData: 'M0 0 Z L1 1' })]) })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/VETOR_INVALIDO/)
    expect(r.content[0].text).toMatch(/camada etq/)
    expect(banco.paginas).toEqual([])
  })

  it('create-template com a 2ª página inválida → isError; NEM o template nem página nenhuma (todas preparadas antes)', async () => {
    const pages = JSON.stringify([
      { name: 'A', layers: [texto('t'), vetor('ok')] },
      { name: 'B', layers: [vetor('ruim', { fill: 'inherit' })] },
    ])
    const r = await chamar('create-template', { projectId: 8, name: 'Tema', pages })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/camada ruim: VETOR_INVALIDO \(COR_INVALIDA:fill\)/)
    expect(banco.templates).toEqual([])
    expect(banco.paginas).toEqual([])
  })

  it('vetores válidos: create-page e create-template criam como antes', async () => {
    const p = await chamar('create-page', { templateId: 77, name: 'Sexta', layers: JSON.stringify([texto('t'), vetor('etq')]) })
    expect(p.isError).toBeUndefined()
    expect(JSON.parse(p.content[0].text)).toMatchObject({ created: true, isTemplate: false })
    const t = await chamar('create-template', { projectId: 8, name: 'Tema', pages: JSON.stringify([{ name: 'A', layers: [vetor('ok')] }]) })
    expect(t.isError).toBeUndefined()
    expect(JSON.parse(t.content[0].text)).toMatchObject({ created: true, pageCount: 1 })
    expect(banco.paginas).toHaveLength(2)
  })
})
