import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H5 do Dot — comportamento operacional pela PORTA real do MCP (`executarToolRemota`), com o perfil
 * draft-only de um cliente OAuth sintético. Banco, fila e serviços externos são falsos; a regra provada não.
 *
 * Onde mora cada cenário:
 * - 1, 2, 4, 5, 6, 8, 9 e a idempotência da rodada: `src/lib/lotes/__tests__/agendar-itens.test.ts`
 *   ('H5 — rodada operacional do Dot'), com a auditoria real e o agendamento real sobre o mesmo banco.
 * - Identidade da leva sob duas rodadas simultâneas: `src/lib/lotes/__tests__/reserva-concorrente.test.ts`.
 * - Corrida A×B no mesmo horário: 'H4 — HORARIO_OCUPADO', CORRIDA, no agendar-itens.
 * - Aqui: 3 (sem material), 7 (repetição de tema), 10 (sem aprovação humana), a configuração do perfil
 *   (Parte 4) e o stdio restrito (Parte 8, junto de `perfil-draft-only.test.ts`).
 */

const m = vi.hoisted(() => ({
  posts: [] as Array<Record<string, any>>,
  paginas: [] as Array<Record<string, any>>,
  enfileirarPeca: vi.fn(async () => ({ generationId: 'gen-nova', lote: { desfecho: 'criado', situacao: 'pendente' } })),
}))

const casa = (linha: Record<string, any>, where: Record<string, any> = {}): boolean =>
  Object.entries(where).every(([k, c]) => {
    if (k === 'OR') return (c as any[]).some((w) => casa(linha, w))
    if (k === 'NOT' || k === 'Template' || k === 'learningScope') return true
    const v = linha[k]
    if (c && typeof c === 'object' && !(c instanceof Date) && !Array.isArray(c)) {
      if ('in' in c) return c.in.includes(v)
      if ('gte' in c || 'lte' in c) return v instanceof Date && (!c.gte || v >= c.gte) && (!c.lte || v <= c.lte)
      if ('not' in c) return v !== c.not
      return true
    }
    return v === c
  })

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: async ({ where }: any) => [{ id: 8, name: 'Espeto Gaúcho', status: 'ACTIVE' }].filter((p) => casa(p, where)).map(({ id, name }) => ({ id, name })),
    },
    socialPost: {
      findMany: async ({ where }: any) => structuredClone(m.posts.filter((p) => casa(p, where))),
      groupBy: async () => [],
    },
    generation: { findMany: async () => [] },
    page: { findMany: async ({ where }: any) => m.paginas.filter((p) => where.id.in.includes(p.id)).map((p) => ({ id: p.id, layers: p.layers })) },
    postRenderProof: { findMany: async () => [] },
    itemDeLote: { findMany: async () => [] },
    template: { findMany: async ({ where }: any) => (where.projectId.in.includes(8) ? [{ projectId: 8 }] : []) },
    knowledgeBaseEntry: {
      findMany: async ({ where }: any) =>
        where?.category?.in ? [{ projectId: 8, title: 'Padrões de Postagem — Espeto', content: 'SLOT 1 — 19h, todos os dias' }] : [],
    },
  },
}))
vi.mock('@prisma/client', () => {
  const cats = ['CAMPANHAS', 'CARDAPIO', 'DELIVERY', 'DIFERENCIAIS', 'ESTABELECIMENTO_INFO', 'FAQ', 'HORARIOS', 'POLITICAS', 'TOM_DE_VOZ']
  return { KnowledgeCategory: Object.fromEntries(cats.map((c) => [c, c])), Prisma: {} }
})
vi.mock('@/lib/mcp/tools', () => ({
  CLIENT_ID_LOCAL: 'claude-code-local',
  projetosVisiveis: vi.fn(async () => [8]),
  quemEstaConectado: vi.fn(async () => 'dot'),
  quemDecidiu: vi.fn(async () => 'user-interno'),
  canalDoPrincipal: vi.fn(() => 'mcp'),
  assertProjetoPermitido: vi.fn(async () => undefined),
  assertCuradorDoProjeto: vi.fn(async () => undefined),
}))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: m.enfileirarPeca }))

// O banco falso entra no cache antes de qualquer handler (ver a nota em ver-agenda-prova-do-render.test.ts).
import '@/lib/db'
import { executarToolRemota, listarToolsRemotas } from '@/lib/mcp/catalogo/integracao'
import { MANUAL_DO_DOT } from '@/lib/mcp/operacao-dot'
import { registrarNoStdio, TOOLS_INGLESAS_SO_RASCUNHO } from '@/lib/mcp/registro/perfil'

const CLIENTE_DOT = 'cliente-dot-sintetico'
const DOT = { kind: 'user' as const, userId: 'clerk-dot', clientId: CLIENTE_DOT }
const ENV = process.env.MCP_DRAFT_ONLY_CLIENT_IDS
const AGORA = new Date('2026-09-13T12:00:00Z') // domingo 09:00 em Brasília
const em = (texto: string) => new Date(`${texto.replace(' ', 'T')}:00-03:00`)
const json = (r: { content: Array<{ text?: string }> }) => JSON.parse(r.content[0].text!)
const desconhecida = (nome: string) => ({ content: [{ type: 'text', text: `Ferramenta desconhecida: ${nome}` }], isError: true })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = CLIENTE_DOT
  m.posts = []
  m.paginas = []
  m.enfileirarPeca.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ENV
})

const compor = (itens: Array<Record<string, unknown>>) =>
  executarToolRemota('compor-leva', { projectId: 8, loteId: 'dot-8-2026-S38', itens }, DOT)
const blocos = [{ papel: 'headline', linhas: ['Espeto corrido'] }]

describe('cenário 3 — buraco sem foto adequada: MATERIAL_NECESSARIO, nada improvisado', () => {
  it('a auditoria pede COMPOR, mas sem foto do acervo a peça não nasce (nem sobre o fundo liso)', async () => {
    const audit = json(await executarToolRemota('auditar-operacao', {}, DOT))
    expect(audit.clientes[0].acao.codigo).toBe('COMPOR')

    const r = json(await compor([{ itemId: '2026-09-14T19:00-story', formato: 'story', blocos, quando: '2026-09-14 19:00' }]))
    expect(r.falhas).toEqual([expect.objectContaining({ codigo: 'MATERIAL_NECESSARIO' })])
    expect(m.enfileirarPeca).not.toHaveBeenCalled()
  })

  it('foto por URL de fora também não entra; com foto do acervo, a peça vai para a fila', async () => {
    const externa = json(await compor([{ itemId: 'a', formato: 'story', blocos, fotoUrl: 'https://qualquer.test/x.jpg' }]))
    expect(externa.falhas).toEqual([expect.objectContaining({ codigo: 'URL_EXTERNA_RECUSADA' })])
    expect(m.enfileirarPeca).not.toHaveBeenCalled()
    await compor([{ itemId: 'b', formato: 'story', blocos, fotoDriveId: 'drive-acervo-1' }])
    expect(m.enfileirarPeca).toHaveBeenCalledTimes(1)
  })

  it('não há caminho para improvisar: gerar imagem, colocar post vazio na agenda e melhorar por IA não existem para o perfil', async () => {
    for (const nome of ['gerar-imagem', 'gerar-imagem-lote', 'colocar-na-agenda', 'agendar-post', 'melhorar-arte', 'importar-arte', 'pedir-foto']) {
      expect(await executarToolRemota(nome, { projectId: 8 }, DOT)).toEqual(desconhecida(nome))
    }
  })
})

describe('cenário 7 — tema já presente na janela: o MCP entrega o que é preciso para não repetir', () => {
  /**
   * Não há regra de similaridade no servidor (decisão do H5): repetir tema é decisão do agente. O contrato
   * testado é a INFORMAÇÃO: o manual manda ler a agenda antes de escrever, e o ver-agenda (permitido ao perfil)
   * devolve os textos completos das peças já na janela. O rodízio de fotos é do buscar-fotos.
   */
  it('o manual põe ver-agenda antes de escrever, e o perfil pode chamá-lo', () => {
    expect(MANUAL_DO_DOT.producao.antes[0]).toBe('ver-agenda')
    expect(listarToolsRemotas(DOT).map((t) => t.name)).toContain('ver-agenda')
  })

  it('ver-agenda devolve o texto da peça já agendada no dia seguinte', async () => {
    m.paginas = [{ id: 'pag-1', layers: JSON.stringify([{ id: 'h', name: 'h', type: 'text', content: 'Picanha na brasa hoje', visible: true, order: 1 }]) }]
    m.posts = [
      {
        id: 'agendado', projectId: 8, postType: 'STORY', status: 'SCHEDULED', caption: null, scheduledDatetime: em('2026-09-15 19:00'),
        publishedUrl: null, publishType: 'DIRECT', mediaUrls: [], generationId: null, laterPostId: null, learningScope: 'ROTINA',
        campaignId: null, pageId: 'pag-1', renderStatus: 'NOT_NEEDED', slotValues: null,
      },
    ]
    const r = json(await executarToolRemota('ver-agenda', { projectId: 8, from: '2026-09-14', to: '2026-09-16' }, DOT))
    const item = r.dias.flatMap((d: any) => d.posts).find((p: any) => p.postId === 'agendado')
    expect(item.textos).toEqual(['Picanha na brasa hoje'])
  })
})

describe('cenário 10 — sem aprovação humana, nada passa do rascunho (porta real, perfil malicioso)', () => {
  it.each([
    'aprovar-rascunhos',
    'postar-agora',
    'cancelar-post',
    'voltar-para-rascunho',
    'reagendar-post',
    'editar-post',
    'trocar-arte-do-post',
    'colocar-na-agenda',
    'agendar-post', // apelido de colocar-na-agenda
    'atualizar-dna',
    'virar-regra',
    'executar-plano',
    'reverter-arte',
  ])('%s → ferramenta desconhecida, com argumentos montados à mão', async (nome) => {
    const r = await executarToolRemota(nome, { projectId: 8, postIds: ['p1'], postId: 'p1', situacao: 'agendado', confirmar: true }, DOT)
    expect(r).toEqual(desconhecida(nome))
  })

  it('o agendamento permitido não aceita pedir "agendado": o schema recusa a chave antes do serviço', async () => {
    const r = await executarToolRemota('agendar-leva', { projectId: 8, loteId: 'l', itens: [{ itemId: 'a' }], situacao: 'agendado' }, DOT)
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/situacao/)
  })

  it('a lista do perfil não tem caminho de publicação: nenhuma tool listada publica, aprova ou cancela', () => {
    const nomes = listarToolsRemotas(DOT).map((t) => t.name)
    for (const nome of ['aprovar-rascunhos', 'postar-agora', 'cancelar-post', 'voltar-para-rascunho', 'reagendar-post', 'colocar-na-agenda']) {
      expect(nomes).not.toContain(nome)
    }
    // E toda tool listada que escreve é uma das três da produção até rascunho.
    const escritas = listarToolsRemotas(DOT).filter((t) => t.annotations?.readOnlyHint === false).map((t) => t.name).sort()
    expect(escritas).toEqual(['agendar-leva', 'ajustar-arte', 'buscar-fotos', 'compor-leva'])
  })
})

describe('Parte 4 — configuração do perfil, lida a cada chamada', () => {
  it('env ausente: ninguém fica restrito por acidente', async () => {
    delete process.env.MCP_DRAFT_ONLY_CLIENT_IDS
    expect(listarToolsRemotas(DOT).map((t) => t.name)).toContain('postar-agora')
  })

  it('clientId parecido não casa (abc × abc-extra), e o serviço é sempre normal', async () => {
    process.env.MCP_DRAFT_ONLY_CLIENT_IDS = 'abc'
    expect(listarToolsRemotas({ ...DOT, clientId: 'abc-extra' }).map((t) => t.name)).toContain('postar-agora')
    expect(listarToolsRemotas({ ...DOT, clientId: 'abc' }).map((t) => t.name)).not.toContain('postar-agora')
    expect(listarToolsRemotas({ kind: 'service' } as never).map((t) => t.name)).toContain('postar-agora')
  })

  it('mudar a env ENTRE chamadas vale na hora, sem renovar o token (o mesmo principal)', async () => {
    process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ''
    const antes = await executarToolRemota('postar-agora', {}, DOT)
    expect(antes.content[0].text).not.toMatch(/Ferramenta desconhecida/)
    process.env.MCP_DRAFT_ONLY_CLIENT_IDS = CLIENTE_DOT
    expect(await executarToolRemota('postar-agora', {}, DOT)).toEqual(desconhecida('postar-agora'))
  })
})

describe('Parte 8 — stdio restrito', () => {
  it('com STUDIO_SO_RASCUNHO=1 nenhuma escrita perigosa é registrada; sem a flag, tudo como hoje', () => {
    for (const perigosa of ['create-post', 'update-post', 'delete-posts', 'recover-stuck-post', 'sync-zernio-posts', 'render-story', 'plan-week']) {
      expect(registrarNoStdio(perigosa, 'inglesa', true)).toBe(false)
      expect(registrarNoStdio(perigosa, 'inglesa', false)).toBe(true)
    }
    for (const leitura of TOOLS_INGLESAS_SO_RASCUNHO) expect(registrarNoStdio(leitura, 'inglesa', true)).toBe(true)
    // A classificação das 24 inglesas (e a perigosa nova nascendo de fora) está em perfil-draft-only.test.ts.
  })
})
