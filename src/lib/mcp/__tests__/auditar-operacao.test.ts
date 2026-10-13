import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tool `auditar-operacao` (H2 do Dot, 13/10/2026): escopo do principal,
 * observação pura e número fixo de consultas para a carteira inteira.
 */

const AGORA = new Date('2026-10-13T12:00:00Z'); // terça, 09:00 em Brasília
const brt = (s: string) => new Date(`${s.replace(' ', 'T')}:00-03:00`);

const m = vi.hoisted(() => ({
  projetos: [] as Array<{ id: number; name: string; status: string }>,
  posts: [] as any[],
  grades: [] as any[],
  templates: [] as Array<{ projectId: number }>,
  semHorario: [] as Array<{ projectId: number; _count: { _all: number } }>,
  chamadas: [] as string[],
  visiveis: vi.fn(),
  registrarSugestoes: vi.fn(),
}));

const leitura = (nome: string, fn: (args: any) => any) =>
  vi.fn(async (args: any) => {
    m.chamadas.push(nome);
    return fn(args);
  });
const noEscopo = (where: any, projectId: number) =>
  !where.projectId?.in || where.projectId.in.includes(projectId);

// Só leitura no dublê: qualquer escrita (create, update, upsert, delete…) não existe e quebra o teste.
vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: leitura('project', ({ where }) =>
        m.projetos
          .filter(
            (p) =>
              p.status === where.status &&
              (!where.id?.in || where.id.in.includes(p.id))
          )
          .map(({ id, name }) => ({ id, name }))
      ),
    },
    socialPost: {
      findMany: leitura('socialPost', ({ where }) =>
        m.posts.filter(
          (p) =>
            noEscopo(where, p.projectId) &&
            (where.status ? p.status === where.status : true)
        )
      ),
      groupBy: leitura('socialPost.groupBy', ({ where }) =>
        m.semHorario.filter((g) => noEscopo(where, g.projectId))
      ),
    },
    knowledgeBaseEntry: {
      findMany: leitura('knowledgeBaseEntry', ({ where }) =>
        where.id?.in ? [] : m.grades.filter((g) => noEscopo(where, g.projectId))
      ),
    },
    template: {
      findMany: leitura('template', ({ where }) =>
        m.templates.filter((t) => noEscopo(where, t.projectId))
      ),
    },
  },
}));
vi.mock('@/lib/mcp/tools', () => ({
  projetosVisiveis: m.visiveis,
  quemEstaConectado: vi.fn(async () => 'fulano@exemplo'),
}));
vi.mock('@/lib/aprendizado/captura', () => ({
  registrarSugestoes: m.registrarSugestoes,
  sugestoesJaEmitidas: m.registrarSugestoes,
  registrarSinal: m.registrarSugestoes,
}));
function carteira(n: number) {
  m.projetos = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Cliente ${i + 1}`,
    status: 'ACTIVE',
  }));
  m.grades = m.projetos.map((p) => ({
    projectId: p.id,
    title: 'Padrões de Postagem',
    content: 'SLOT 1 — 10h, todos os dias',
  }));
  m.templates = m.projetos.map((p) => ({ projectId: p.id }));
  m.semHorario = [];
  m.posts = m.projetos.flatMap((p) => [
    {
      id: `a${p.id}`,
      projectId: p.id,
      scheduledDatetime: brt('2026-10-14 10:00'),
      postType: 'STORY',
      status: 'SCHEDULED',
      mediaUrls: [],
      pageId: 'pg',
      renderStatus: 'PENDING',
      renderError: null,
      errorMessage: null,
      verificationStatus: 'SKIPPED',
      campaignId: null,
    },
  ]);
}

async function auditar(principal: unknown) {
  const { toolsDeAgenda } = await import('@/lib/mcp/catalogo/agenda');
  const tool = toolsDeAgenda.find((t) => t.nome === 'auditar-operacao')!;
  return (await tool.handler({}, principal as any)) as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  m.chamadas = [];
  m.visiveis.mockReset();
  m.registrarSugestoes.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('auditar-operacao', () => {
  it('é declarada só leitura e idempotente', async () => {
    const { toolsDeAgenda } = await import('@/lib/mcp/catalogo/agenda');
    const tool = toolsDeAgenda.find((t) => t.nome === 'auditar-operacao')!;
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(tool.acesso).toEqual({ tipo: 'autenticado' });
  });

  it('S. projeto invisível ao principal não aparece', async () => {
    carteira(3);
    m.visiveis.mockResolvedValue([2]);
    const r = await auditar({ kind: 'user', userId: 'u' });
    expect(r.clientes.map((c: any) => c.projectId)).toEqual([2]);
    expect(r.resumo.total).toBe(1);
  });

  it('principal sem projeto nenhum: lista vazia com aviso', async () => {
    carteira(2);
    m.visiveis.mockResolvedValue([]);
    const r = await auditar({ kind: 'user', userId: 'u' });
    expect(r.clientes).toEqual([]);
    expect(r.aviso).toMatch(/Nenhum cliente visível/);
  });

  it('service (null) mantém a semântica de hoje: a carteira ativa inteira', async () => {
    carteira(3);
    m.visiveis.mockResolvedValue(null);
    expect((await auditar({ kind: 'service' })).resumo.total).toBe(3);
  });

  it('T. nenhum LearningSignal nem sugestão registrada', async () => {
    carteira(2);
    m.visiveis.mockResolvedValue(null);
    await auditar({ kind: 'service' });
    expect(m.registrarSugestoes).not.toHaveBeenCalled();
  });

  it('U. número de consultas não cresce com a carteira', async () => {
    m.visiveis.mockResolvedValue(null);
    carteira(1);
    await auditar({ kind: 'service' });
    const comUm = [...m.chamadas];
    m.chamadas = [];
    carteira(12);
    await auditar({ kind: 'service' });
    expect(m.chamadas.length).toBe(comUm.length);
    expect(m.chamadas.length).toBeLessThanOrEqual(7);
  });

  it('saída por cliente: estruturada e compacta', async () => {
    carteira(1);
    m.visiveis.mockResolvedValue(null);
    const r = await auditar({ kind: 'service' });
    expect(r).toMatchObject({ alvoDias: 2, agora: '2026-10-13 09:00' });
    const [c] = r.clientes;
    expect(Object.keys(c).sort()).toEqual(
      [
        'acao',
        'rascunhosSemHorario',
        'acoes',
        'agendados',
        'amanha',
        'assinatura',
        'avisosDeCampanha',
        'buracos',
        'conflitosDeHorario',
        'depoisDeAmanha',
        'diasAdiantados',
        'falhas',
        'fonte',
        'hoje',
        'nome',
        'projectId',
        'rascunhos',
      ].sort()
    );
    // Agendado sem mídia ainda cobre: o render sai no cron antes do horário.
    expect(c.amanha.estado).toBe('coberto');
    expect(c.depoisDeAmanha.estado).toBe('falta');
    expect(c.diasAdiantados).toBe(1);
    expect(c.acao.codigo).toBe('COMPOR');
  });

  it('rascunho sem horário segura o COMPOR atrás da conferência', async () => {
    carteira(1);
    m.semHorario = [{ projectId: 1, _count: { _all: 2 } }];
    m.visiveis.mockResolvedValue(null);
    const [c] = (await auditar({ kind: 'service' })).clientes;
    expect(c.rascunhosSemHorario).toBe(2);
    expect(c.acoes.map((a: any) => a.codigo)).toEqual([
      'CONSERTO_PENDENTE',
      'COMPOR',
    ]);
  });

  it('A. inclui o manual canônico do agente operacional, com versão', async () => {
    carteira(1);
    m.visiveis.mockResolvedValue(null);
    const r = await auditar({ kind: 'service' });
    const { MANUAL_DO_DOT, DOT_OPERACAO_VERSAO } =
      await import('@/lib/mcp/operacao-dot');
    expect(r.manual).toBe(MANUAL_DO_DOT);
    expect(r.manual.versao).toBe(DOT_OPERACAO_VERSAO);
    expect(r.manual.alvoDias).toBe(r.alvoDias);
  });
});
