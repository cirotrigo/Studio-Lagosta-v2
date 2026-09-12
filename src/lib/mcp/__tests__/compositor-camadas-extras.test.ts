import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PR 10 de "Marca simples, copy melhor": a camada EXTRA passa a ser anunciada
 * no conector. O que se prova é o que a porta faz — o schema público aceita a
 * identidade do extra (id, herdaDe, grupoVisual, grupoDeLeitura, ordem) nos
 * blocos e em `camadasExtras`, com o teto de blocos da spec, e os handlers
 * levam tudo até o compositor e a medição. Sem isso o zod aninhado descartaria
 * (ou recusaria) a chave e a camada extra nunca chegaria à peça.
 */
const mocks = vi.hoisted(() => ({ comporPeca: vi.fn(), enfileirarPeca: vi.fn(), medirCopyDoProjeto: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: mocks.comporPeca }))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: mocks.enfileirarPeca }))
vi.mock('@/lib/compositor/medir-copy-service', () => ({ medirCopyDoProjeto: mocks.medirCopyDoProjeto }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { preferenciasSchema, specSchema, validarSpec } from '@/lib/compositor/spec'
import { toolsDoCompositor } from '../catalogo/compositor'

const tool = (nome: string) => toolsDoCompositor.find((t) => t.nome === nome)!
const blocos = [
  { papel: 'headline', linhas: ['Costela'] },
  { papel: 'servico', linhas: ['Seg a sex, 11h às 15h'], id: 'hora', herdaDe: 'apoio', grupoVisual: 'rodape', grupoDeLeitura: 'agenda', ordem: 2 },
]
const camadasExtras = [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio', grupoVisual: 'principal', grupoDeLeitura: 'agenda', ordem: 1 }]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.comporPeca.mockResolvedValue({ prova: null, persistido: { generationId: 'g', pageId: 'p', url: 'u', editUrl: 'e', galleryUrl: 'gl' }, diagnostico: { posicao: { ancora: 'rodape', alinha: 'esquerda', crop: 'center-middle' }, logo: null, blocos: [], avisos: [] } })
  mocks.enfileirarPeca.mockResolvedValue({ generationId: 'g1' })
  mocks.medirCopyDoProjeto.mockResolvedValue({
    variante: { id: 'v', nome: 'v', formatoDaPagina: 'story', motivo: null },
    escolhaProvisoria: false,
    motivosDaProvisoriedade: [],
    fixacao: { variante: 'v', arranjos: [] },
    medicao: { areaUtil: {}, cabeTudo: true, naoMedido: false, aproximado: false, papeisAusentes: [], fontesNaoCarregadas: [], arranjos: [], alturaDosBlocos: 0, segundaVoz: null, avisos: [], blocos: [{ id: 'nota', papel: 'apoio', situacao: 'cabe', fonte: 'Barlow', escala: 1, fontSize: 40, width: 400, height: 48, linhasMedidas: [], naoMedido: false, aproximado: false, avisos: [], extra: { funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } }] },
    outrasVariantes: [],
  })
})

describe('schema público: a identidade da camada extra sobrevive à porta', () => {
  it('compor-arte: blocos com id/herdaDe/grupoVisual/grupoDeLeitura/ordem e camadasExtras', () => {
    const r = tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos, camadasExtras })
    expect(r.success).toBe(true)
    const data = r.success ? (r.data as { blocos?: unknown; camadasExtras?: unknown }) : null
    expect(data?.blocos).toEqual(blocos)
    expect(data?.camadasExtras).toEqual(camadasExtras)
  })
  it('compor-leva: o item aceita os mesmos campos', () => {
    const r = tool('compor-leva').schema.safeParse({ projectId: 8, itens: [{ formato: 'story', blocos, camadasExtras }] })
    expect(r.success).toBe(true)
    const itens = (r.success ? (r.data as { itens?: Array<{ blocos?: unknown; camadasExtras?: unknown }> }) : null)?.itens
    expect(itens?.[0]?.blocos).toEqual(blocos)
    expect(itens?.[0]?.camadasExtras).toEqual(camadasExtras)
  })
  it('medir-copy: aceita os mesmos campos', () => {
    const r = tool('medir-copy').schema.safeParse({ projectId: 8, formato: 'story', blocos, camadasExtras })
    expect(r.success).toBe(true)
    expect((r.success ? (r.data as { camadasExtras?: unknown }) : null)?.camadasExtras).toEqual(camadasExtras)
  })
  it('o teto de blocos é o da spec (40): papel repetido como camada extra passa de cinco blocos; 41 é recusado; camada extra sem herdaDe é recusada', () => {
    const muitos = (n: number) => [{ papel: 'headline', linhas: ['Costela'] }, ...Array.from({ length: n - 1 }, (_, i) => ({ papel: 'servico', linhas: [`linha ${i}`], id: `hora-${String.fromCharCode(97 + (i % 26))}${i}`, herdaDe: 'apoio' }))]
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos: muitos(6) }).success).toBe(true)
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos: muitos(40) }).success).toBe(true)
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos: muitos(41) }).success).toBe(false)
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos: [blocos[0]], camadasExtras: [{ id: 'nota', linhas: ['x'] }] }).success).toBe(false)
  })
})

describe('handlers: a camada extra chega ao compositor, à fila e à medição', () => {
  it('compor-arte leva blocos e camadasExtras para comporPeca', async () => {
    await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos, camadasExtras }, { kind: 'user' } as never)
    expect(mocks.comporPeca.mock.calls[0][0]).toMatchObject({ blocos, camadasExtras })
  })
  it('compor-leva leva camadasExtras de cada item para a fila', async () => {
    await tool('compor-leva').handler({ projectId: 8, itens: [{ formato: 'story', blocos, camadasExtras }] }, { kind: 'user' } as never)
    expect(mocks.enfileirarPeca.mock.calls[0][0]).toMatchObject({ projectId: 8, blocos, camadasExtras })
  })
  it('medir-copy leva camadasExtras para a medição e devolve a identidade do extra em cada bloco', async () => {
    const r = (await tool('medir-copy').handler({ projectId: 8, formato: 'story', blocos, camadasExtras }, { kind: 'user' } as never)) as { blocos: Array<{ id: string; extra?: unknown }> }
    expect(mocks.medirCopyDoProjeto.mock.calls[0][0]).toMatchObject({ blocos, camadasExtras })
    expect(r.blocos.find((b) => b.id === 'nota')?.extra).toEqual({ funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' })
  })
})

/**
 * R02 da revisão dos patches do PR 10 (12/09/2026): o schema público recusava
 * linhas que a spec aceita — linha vazia (respiro) e de 7 a 12 linhas. Os
 * limites agora vêm da spec; acima do teto COMUM (13 linhas, 301 caracteres)
 * as três portas recusam, como `validarSpec`.
 */
describe('R02: as linhas do bloco e da camada extra têm os limites da spec nas três portas', () => {
  const linhasCom = (n: number) => Array.from({ length: n }, (_, i) => (i % 3 === 1 ? '' : `linha ${i}`))
  const entradaDe = (nomeDaTool: string, linhas: string[]) => {
    const blocosDaPeca = [{ papel: 'headline', linhas }, { papel: 'servico', linhas, id: 'hora', herdaDe: 'apoio' }]
    const extras = [{ id: 'nota', linhas, herdaDe: 'apoio' }]
    return nomeDaTool === 'compor-leva'
      ? { projectId: 8, itens: [{ formato: 'story', blocos: blocosDaPeca, camadasExtras: extras }] }
      : { projectId: 8, formato: 'story', blocos: blocosDaPeca, camadasExtras: extras }
  }
  const pecaDe = (nomeDaTool: string, data: unknown) =>
    (nomeDaTool === 'compor-leva' ? (data as { itens: unknown[] }).itens[0] : data) as { blocos: Array<{ linhas: string[] }>; camadasExtras: Array<{ linhas: string[] }> }

  for (const nomeDaTool of ['compor-arte', 'compor-leva', 'medir-copy']) {
    it(`${nomeDaTool}: respiro inicial, interno e final e de 7 a 12 linhas passam preservados; 13 linhas e linha de 301 caracteres são recusadas`, () => {
      const respiros = ['', 'vale só', '', 'no almoço', '']
      for (const linhas of [respiros, ...[7, 8, 9, 10, 11, 12].map(linhasCom)]) {
        const r = tool(nomeDaTool).schema.safeParse(entradaDe(nomeDaTool, linhas))
        expect(r.success, `${linhas.length} linhas`).toBe(true)
        const peca = pecaDe(nomeDaTool, r.success ? r.data : null)
        expect(peca.blocos.map((b) => b.linhas)).toEqual([linhas, linhas])
        expect(peca.camadasExtras.map((e) => e.linhas)).toEqual([linhas])
        // O que a porta deixa passar, a spec também aceita — e vice-versa.
        expect(validarSpec({ projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas }], camadasExtras: [{ id: 'nota', linhas, herdaDe: 'apoio' }] }).problemas).toEqual([])
      }
      expect(tool(nomeDaTool).schema.safeParse(entradaDe(nomeDaTool, linhasCom(13))).success).toBe(false)
      expect(tool(nomeDaTool).schema.safeParse(entradaDe(nomeDaTool, ['x'.repeat(301)])).success).toBe(false)
      expect(validarSpec({ projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas: linhasCom(13) }] }).problemas).not.toEqual([])
    })
  }

  it('paridade: o JSON Schema público de blocos, camadasExtras, fotosCandidatas, carrossel e preferencias.arranjos tem os MESMOS limites da spec', () => {
    const semDescricao = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(semDescricao)
      if (v && typeof v === 'object') {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([k]) => k !== 'description' && k !== '$schema')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, semDescricao(x)]),
        )
      }
      return v
    }
    const json = (s: z.ZodTypeAny) => semDescricao(zodToJsonSchema(s, { $refStrategy: 'none', target: 'jsonSchema7' }))
    const publico = tool('compor-arte').schema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>
    const itemDaLeva = ((tool('compor-leva').schema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>).shape.itens as unknown as z.ZodArray<z.ZodObject<Record<string, z.ZodTypeAny>>>).element
    const medir = tool('medir-copy').schema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>
    for (const campo of ['blocos', 'camadasExtras', 'fotosCandidatas', 'carrossel'] as const) {
      expect(json(publico.shape[campo]), `compor-arte.${campo}`).toEqual(json(specSchema.shape[campo]))
      expect(json(itemDaLeva.shape[campo]), `compor-leva.itens.${campo}`).toEqual(json(specSchema.shape[campo]))
    }
    for (const campo of ['blocos', 'camadasExtras'] as const) expect(json(medir.shape[campo]), `medir-copy.${campo}`).toEqual(json(specSchema.shape[campo]))
    const arranjosPublicos = (publico.shape.preferencias as unknown as z.ZodOptional<z.ZodObject<Record<string, z.ZodTypeAny>>>).unwrap().shape.arranjos
    expect(json(arranjosPublicos)).toEqual(json(preferenciasSchema.shape.arranjos))
  })
})
