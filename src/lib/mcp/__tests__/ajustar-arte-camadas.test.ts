/**
 * T1 (05/11/2026): `camadas` e `pagina` no handler de ajustar-arte — o schema estrito, a FASE 1 (forma) no handler,
 * a guarda de URL externa no draft-only e o repasse ao serviço. O serviço é mock: o que importa aqui é a porta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ajustarArte: vi.fn(async () => ({ ajustada: true, pageId: 'pg-1', versao: 'v1:nova', camadasAplicadas: [] })),
  assertPaginaSoEmRascunho: vi.fn(async () => undefined),
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/mcp/tools', () => ({
  CLIENT_ID_LOCAL: 'claude-code-local',
  quemDecidiu: vi.fn(async () => 'user-interno'),
  canalDoPrincipal: vi.fn(() => 'claude-ai'),
  projetosVisiveis: vi.fn(async () => null),
  assertProjetoPermitido: vi.fn(async () => undefined),
  assertCuradorDoProjeto: vi.fn(async () => undefined),
}))
vi.mock('@/lib/creatives/arte-rapida', () => ({ ajustarArte: m.ajustarArte }))
vi.mock('@/lib/mcp/guardas-draft-only', () => ({ assertPaginaSoEmRascunho: m.assertPaginaSoEmRascunho }))

import { toolsDeArteIA } from '@/lib/mcp/catalogo/arte-ia'

const tool = toolsDeArteIA.find((t) => t.nome === 'ajustar-arte')!
const DOT = { kind: 'user' as const, userId: 'clerk-dot', clientId: 'cliente-dot-sintetico' }
const PESSOA = { kind: 'user' as const, userId: 'clerk-ciro', clientId: 'cliente-claude-ai' }
const ENV = process.env.MCP_DRAFT_ONLY_CLIENT_IDS
beforeEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = 'cliente-dot-sintetico'
  m.ajustarArte.mockClear()
})
afterEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ENV
})

const base = { projectId: 8, pageId: 'pg-1', versaoEsperada: 'v1:abc' }
const mover = { op: 'definir', camada: 'logo', campos: { position: { x: 40, y: 40 } } }

describe('schema', () => {
  it('camadas e pagina entram no schema estrito: chave desconhecida em campos, em style ou em pagina é erro', () => {
    expect(tool.schema.safeParse({ ...base, camadas: [mover], pagina: { background: '#000000' } }).success).toBe(true)
    expect(tool.schema.safeParse({ ...base, camadas: [{ ...mover, campos: { metadata: {} } }] }).success).toBe(false)
    expect(tool.schema.safeParse({ ...base, camadas: [{ ...mover, campos: { style: { vetor: {} } } }] }).success).toBe(false)
    expect(tool.schema.safeParse({ ...base, camadas: [{ op: 'apagar', camada: 'x' }] }).success).toBe(false)
    expect(tool.schema.safeParse({ ...base, pagina: { audio: null } }).success).toBe(false)
    expect(tool.schemaJson).toMatchObject({ properties: { camadas: { type: 'array', maxItems: 40 }, pagina: { type: 'object', additionalProperties: false } } })
  })
})

describe('handler', () => {
  it('repassa camadas, pagina e versaoEsperada ao serviço, com o perfil', async () => {
    const r = await tool.handler({ ...base, camadas: [mover], pagina: { height: 1350 } }, PESSOA)
    expect(r).toMatchObject({ ajustada: true })
    expect(m.ajustarArte).toHaveBeenCalledWith(expect.objectContaining({ projectId: 8, pageId: 'pg-1', versaoEsperada: 'v1:abc', camadas: [mover], pagina: { height: 1350 }, apenasRascunho: false }))
  })

  it('FASE 1 no handler: faixa, cor e completude recusam ANTES do serviço, com a lista em details.erros', async () => {
    const r = tool.handler({ ...base, camadas: [{ op: 'definir', camada: 'headline', campos: { style: { fontSize: 2000, color: 'nada' } } }, { op: 'remover' }], pagina: { width: 10 } }, PESSOA)
    await expect(r).rejects.toMatchObject({
      code: 'VALOR_FORA_DA_FAIXA',
      status: 400,
      details: {
        ajusteGravado: false,
        erros: [
          expect.objectContaining({ indice: 0, codigo: 'VALOR_FORA_DA_FAIXA', campos: ['style.fontSize'] }),
          expect.objectContaining({ indice: 0, codigo: 'VALOR_FORA_DA_FAIXA', campos: ['style.color'] }),
          expect.objectContaining({ indice: 1, codigo: 'OPERACAO_INCOMPLETA' }),
          expect.objectContaining({ indice: -1, op: 'pagina', codigo: 'VALOR_FORA_DA_FAIXA' }),
        ],
      },
    })
    expect(m.ajustarArte).not.toHaveBeenCalled()
  })

  it('draft-only: fileUrl dentro de camadas é URL_EXTERNA_RECUSADA antes de qualquer leitura; driveImageId passa', async () => {
    await expect(tool.handler({ ...base, camadas: [{ op: 'definir', camada: 'bg', campos: { fileUrl: 'https://fora.test/x.jpg' } }] }, DOT)).rejects.toMatchObject({ code: 'URL_EXTERNA_RECUSADA' })
    expect(m.assertPaginaSoEmRascunho).not.toHaveBeenCalled()
    expect(m.ajustarArte).not.toHaveBeenCalled()
    await tool.handler({ ...base, camadas: [{ op: 'definir', camada: 'bg', campos: { driveImageId: 'drive-1' } }] }, DOT)
    expect(m.ajustarArte).toHaveBeenCalledWith(expect.objectContaining({ apenasRascunho: true, camadas: [{ op: 'definir', camada: 'bg', campos: { driveImageId: 'drive-1' } }] }))
  })

  it('a pessoa (perfil normal) pode mandar fileUrl', async () => {
    await tool.handler({ ...base, camadas: [{ op: 'adicionar', tipo: 'imagem', campos: { fileUrl: 'https://blob.test/x.jpg' } }] }, PESSOA)
    expect(m.ajustarArte).toHaveBeenCalledTimes(1)
  })
})
