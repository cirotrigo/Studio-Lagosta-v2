import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Escopo EXPLÍCITO na resolução de projeto (pós-merge do #202, 13/10/2026).
 *
 * LOW 2: `resolveProject` tratava escopo ausente como "todos os projetos" —
 * um chamador novo que esquecesse o argumento ganhava busca global calado.
 * Agora quem chama declara `number[]` (o que o principal enxerga) ou `'todos'`
 * (decisão explícita de serviço), e a falta disso LANÇA.
 *
 * LOW 1: a tool inglesa `prepare-creative` do servidor local chamava
 * `prepareCreative` sem escopo nem gate, mesmo com `STUDIO_AUTOR` declarando
 * um usuário. Agora ela passa pela mesma porta do catálogo, com o mesmo
 * principal (`principalLocal(AUTOR_LOCAL)`).
 */
const PROJETOS = [
  { id: 1, name: 'Bacana', status: 'ACTIVE' },
  { id: 2, name: 'Bacana Eventos', status: 'ACTIVE' },
  { id: 9, name: 'Segredo Alheio', status: 'ACTIVE' },
]

const m = vi.hoisted(() => ({ visiveis: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: vi.fn(async ({ where }: any) =>
        PROJETOS.filter(
          (p) =>
            p.status === where.status &&
            p.name.toLowerCase().includes(String(where.name.contains).toLowerCase()) &&
            (!where.id?.in || where.id.in.includes(p.id)),
        ),
      ),
      findUnique: vi.fn(async ({ where }: any) => PROJETOS.find((p) => p.id === where.id) ?? null),
    },
    template: { findMany: vi.fn(async () => []) },
  },
}))
// integracao.ts confere o espelho das categorias contra o enum no load.
vi.mock('@prisma/client', () => {
  const cats = ['CAMPANHAS', 'CARDAPIO', 'DELIVERY', 'DIFERENCIAIS', 'ESTABELECIMENTO_INFO', 'FAQ', 'HORARIOS', 'POLITICAS', 'TOM_DE_VOZ']
  return { KnowledgeCategory: Object.fromEntries(cats.map((c) => [c, c])), Prisma: {} }
})
vi.mock('@/lib/mcp/tools', () => ({
  CLIENT_ID_LOCAL: 'claude-code-local',
  projetosVisiveis: m.visiveis,
  // Mesma regra do real: service (null) passa; usuário só no que enxerga.
  assertProjetoPermitido: vi.fn(async (id: number, principal: unknown) => {
    const permitidos = await m.visiveis(principal)
    if (permitidos && !permitidos.includes(id)) {
      const { CreativeError } = await import('@/lib/creatives/errors')
      throw new CreativeError('PROJETO_SEM_ACESSO', `sem acesso ao cliente ${id}`, 403)
    }
  }),
  assertCuradorDoProjeto: vi.fn(async () => undefined),
}))

import { resolveProject } from '@/lib/creatives/arte-rapida'
import { executarToolLocal } from '../catalogo/integracao'
import { principalLocal } from '../autor-local'

const codigo = (p: Promise<unknown>) =>
  p.then(
    () => 'resolveu',
    (e: any) => e.code as string,
  )
const nome = async (p: Promise<any>) => (await p).name as string

beforeEach(() => {
  vi.clearAllMocks()
  m.visiveis.mockImplementation(async (p: { kind: string }) => (p.kind === 'service' ? null : [1]))
})

describe('LOW 2: resolveProject exige escopo declarado', () => {
  it('quem esquece o escopo NÃO ganha busca global — lança MISSING_SCOPE', async () => {
    expect(await codigo(resolveProject({ projectHint: 'segredo' } as any))).toBe('MISSING_SCOPE')
    expect(await codigo(resolveProject({ projectId: 9 } as any))).toBe('MISSING_SCOPE')
    // Com strict: false o TS aceita null/undefined explícitos; o runtime não.
    expect(await codigo(resolveProject({ projectHint: 'segredo', projetosVisiveis: null as any }))).toBe(
      'MISSING_SCOPE',
    )
    expect(await codigo(resolveProject({ projectHint: 'segredo', projetosVisiveis: undefined as any }))).toBe(
      'MISSING_SCOPE',
    )
  })

  it("'todos' é a decisão explícita de serviço: vê tudo", async () => {
    expect(await nome(resolveProject({ projectHint: 'segredo', projetosVisiveis: 'todos' }))).toBe('Segredo Alheio')
    expect(await nome(resolveProject({ projectId: 9, projetosVisiveis: 'todos' }))).toBe('Segredo Alheio')
  })

  it('lista de visíveis filtra o hint E o id, e invisível = inexistente', async () => {
    expect(await nome(resolveProject({ projectHint: 'bacana', projetosVisiveis: [1] }))).toBe('Bacana')
    expect(await codigo(resolveProject({ projectHint: 'segredo', projetosVisiveis: [1] }))).toBe('PROJECT_NOT_FOUND')

    const invisivel = await resolveProject({ projectId: 9, projetosVisiveis: [1] }).catch((e) => e.toJSON())
    const inexistente = await resolveProject({ projectId: 777, projetosVisiveis: [1] }).catch((e) => e.toJSON())
    expect(invisivel.error).toBe('PROJECT_NOT_FOUND')
    expect(JSON.stringify(invisivel).replace('9', 'N')).toBe(JSON.stringify(inexistente).replace('777', 'N'))
  })

  it('lista vazia não vê nada', async () => {
    expect(await codigo(resolveProject({ projectHint: 'bacana', projetosVisiveis: [] }))).toBe('PROJECT_NOT_FOUND')
    expect(await codigo(resolveProject({ projectId: 1, projetosVisiveis: [] }))).toBe('PROJECT_NOT_FOUND')
  })

  it('projectId 0 é id, não cai na busca por nome', async () => {
    expect(await codigo(resolveProject({ projectId: 0, projectHint: 'segredo', projetosVisiveis: 'todos' }))).toBe(
      'PROJECT_NOT_FOUND',
    )
  })

  it('invisível não conta para ambiguidade; dois visíveis ambíguos listam só os visíveis', async () => {
    expect(await nome(resolveProject({ projectHint: 'bacana', projetosVisiveis: [1, 9] }))).toBe('Bacana')
    const erro = await resolveProject({ projectHint: 'a', projetosVisiveis: [1, 2] }).catch((e) => e.toJSON())
    expect(erro.error).toBe('AMBIGUOUS_PROJECT')
    expect(JSON.stringify(erro)).not.toContain('Segredo')
  })
})

describe('LOW 1: o servidor local resolve com o principal de quem está no Mac', () => {
  const autor = { id: 'u1', clerkId: 'user_roberta', email: null, name: null }
  const local = (args: Record<string, unknown>, a: typeof autor | null) =>
    executarToolLocal('escolher-modelo', { theme: 'happy hour', ...args }, principalLocal(a)).then((r) =>
      String(r.content[0]?.text),
    )

  it('com STUDIO_AUTOR (usuário): hint e id alheios não resolvem', async () => {
    const hint = await local({ projectHint: 'segredo' }, autor)
    expect(hint).toContain('PROJECT_NOT_FOUND')
    expect(hint).not.toContain('Segredo Alheio')
    expect(await local({ projectId: 9 }, autor)).toContain('PROJETO_SEM_ACESSO')
  })

  it('sem STUDIO_AUTOR (service): continua vendo tudo', async () => {
    expect(await local({ projectHint: 'segredo' }, null)).toContain('Segredo Alheio')
    expect(await local({ projectId: 9 }, null)).toContain('Segredo Alheio')
  })

  it('a tool inglesa prepare-creative delega para essa porta, sem chamar prepareCreative direto', () => {
    const fonte = readFileSync(join(process.cwd(), 'scripts/mcp-server.ts'), 'utf8')
    const inicio = fonte.indexOf("'prepare-creative',")
    const fim = fonte.indexOf('toolEstrita(', inicio)
    const corpo = fonte.slice(inicio, fim)
    expect(corpo).toMatch(/executarToolLocal\(\s*'escolher-modelo'/)
    expect(corpo).toContain('principalLocal(AUTOR_LOCAL)')
    expect(corpo).not.toContain('prepareCreative(')
  })
})

describe('todo chamador de prepareCreative declara o escopo', () => {
  it('nenhuma chamada fora de teste omite projetosVisiveis', () => {
    const chamadores = [
      'src/lib/mcp/catalogo/modelos.ts',
      'src/app/api/external/creatives/prepare/route.ts',
      'scripts/validar-voz-compacta.ts',
    ]
    for (const arquivo of chamadores) {
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
      const chamadas = fonte.split('prepareCreative({').slice(1)
      expect(chamadas.length, arquivo).toBeGreaterThan(0)
      for (const c of chamadas) expect(c.slice(0, c.indexOf('})')), arquivo).toContain('projetosVisiveis')
    }
  })
})
