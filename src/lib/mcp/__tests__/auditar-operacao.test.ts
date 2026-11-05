import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOT_OPERACAO_VERSAO } from '../operacao-dot';

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
  generations: [] as any[],
  pages: [] as any[],
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
    // CP5e § 2: as DUAS consultas do bloco `gate` (só quando há post com generationId).
    generation: {
      findMany: leitura('generation', ({ where }) =>
        Array.from(m.generations as any[]).filter((g) => where.id.in.includes(g.id))
      ),
    },
    page: {
      findMany: leitura('page', ({ where }) =>
        m.pages.filter((pg) => where.id.in.includes(pg.id))
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

  it('CP5e § 2: o bloco `gate` lê o registro dos posts da janela em DUAS consultas a mais (só quando há post com arte), rotula coincidente/historico/semRegistro e nunca mede nem escreve', async () => {
    const { decidirOk } = await import('@/lib/creatives/revisao/__tests__/suporte/pagina-limpa');
    const { PAGINA_LIMPA } = await import('@/lib/creatives/revisao/__tests__/suporte/pagina-limpa');
    const { CHAVE_DO_GATE } = await import('@/lib/creatives/revisao/gate-registro');
    carteira(2);
    const registro = decidirOk().registro; // projeto 8, gen-1, pg-1, APTO
    m.projetos = [{ id: 8, name: 'Oito', status: 'ACTIVE' }, { id: 9, name: 'Nove', status: 'ACTIVE' }];
    m.grades = m.projetos.map((p) => ({ projectId: p.id, title: 'Padrões de Postagem', content: 'SLOT 1 — 10h, todos os dias' }));
    m.templates = m.projetos.map((p) => ({ projectId: p.id }));
    const base = { scheduledDatetime: brt('2026-10-14 10:00'), postType: 'STORY', status: 'DRAFT', mediaUrls: ['x'], renderStatus: 'RENDERED', renderError: null, errorMessage: null, verificationStatus: 'SKIPPED', campaignId: null };
    m.posts = [
      { id: 'c1', projectId: 8, pageId: 'pg-1', generationId: 'gen-1', ...base }, // coincidente APTO
      { id: 'h1', projectId: 8, pageId: 'pg-2', generationId: 'gen-2', ...base, scheduledDatetime: brt('2026-10-15 10:00') }, // página mudou → historico
      { id: 's1', projectId: 9, pageId: 'pg-9', generationId: null, ...base }, // sem arte → semRegistro
    ];
    m.generations = [
      { id: 'gen-1', projectId: 8, fieldValues: { source: 'compositor', pageId: 'pg-1', [CHAVE_DO_GATE]: registro } },
      { id: 'gen-2', projectId: 8, fieldValues: { source: 'compositor', pageId: 'pg-2', [CHAVE_DO_GATE]: registro } },
    ];
    m.pages = [
      { ...PAGINA_LIMPA, Template: { projectId: 8 } },
      { ...PAGINA_LIMPA, id: 'pg-2', layers: (PAGINA_LIMPA.layers as any[]).map((l) => (l.id === 'apoio' ? { ...l, content: 'mudou' } : l)), Template: { projectId: 8 } },
    ];
    m.visiveis.mockResolvedValue(null);
    const antes = m.chamadas.length;
    const r = await auditar({ kind: 'service' });
    expect(m.chamadas.filter((c) => c === 'generation' || c === 'page')).toEqual(['generation', 'page']);
    expect(m.chamadas.length - antes).toBeLessThanOrEqual(9);
    expect(r.gate).toMatchObject({ posts: 3, coincidente: { APTO: 1, REVISAO_HUMANA_NECESSARIA: 0 }, historico: 1, semRegistro: 1, registroInvalido: 0, parcial: false });
    expect(r.gate.aviso).toMatch(/não é o veredito atual/);
    const oito = r.clientes.find((c: any) => c.projectId === 8);
    const nove = r.clientes.find((c: any) => c.projectId === 9);
    expect(oito.gate).toMatchObject({ posts: 2, coincidente: { APTO: 1 }, historico: 1 });
    expect(nove.gate).toMatchObject({ posts: 1, semRegistro: 1 });
    // Registro de gen-2 alega a pg-1? Vínculo cruzado → registroInvalido (o registro de gen-2 foi gravado com pageId pg-1).
    expect(oito.gate.registroInvalido).toBe(0);
  });

  it('CP5e § 2: o bloco `gate` nunca some — sem projetos visíveis vem VAZIO; quando a leitura do registro falha vem `indisponivel` com o motivo (a auditoria segue)', async () => {
    carteira(0);
    m.visiveis.mockResolvedValue(null);
    const vazio = await auditar({ kind: 'service' });
    expect(vazio.gate).toMatchObject({ posts: 0, coincidente: { APTO: 0, REVISAO_HUMANA_NECESSARIA: 0 }, parcial: false, teto: 200 });
    carteira(1);
    const base = { scheduledDatetime: brt('2026-10-14 10:00'), postType: 'STORY', status: 'DRAFT', mediaUrls: ['x'], renderStatus: 'RENDERED', renderError: null, errorMessage: null, verificationStatus: 'SKIPPED', campaignId: null };
    m.posts = [{ id: 'c1', projectId: 1, pageId: 'pg-1', generationId: 'gen-1', ...base }];
    m.generations = { get length() { throw new Error('banco piscou'); } } as any;
    const r = await auditar({ kind: 'service' });
    expect(r.gate).toMatchObject({ indisponivel: true, motivo: expect.stringMatching(/banco piscou/) });
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].gate).toBeUndefined();
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
        // CP5e § 2: o resumo do registro do gate dos posts da janela (só leitura).
        'gate',
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

  describe('seguranca.perfilEfetivo — a proteção MECÂNICA desta chamada (dot-operacao-v4)', () => {
    const ENV = process.env.MCP_DRAFT_ONLY_CLIENT_IDS;
    const CLIENTE = 'cliente-chatgpt-sintetico';
    const usuario = (clientId: string) => ({ kind: 'user', userId: 'clerk-sintetico-123', clientId });
    afterEach(() => {
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ENV;
    });

    it('A/B/C/D. normal, draft-only, serviço e clientId parecido', async () => {
      carteira(1);
      m.visiveis.mockResolvedValue(null);
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = CLIENTE;
      expect((await auditar(usuario('outro-cliente'))).seguranca).toEqual({ perfilEfetivo: 'normal' });
      expect((await auditar(usuario(CLIENTE))).seguranca).toEqual({ perfilEfetivo: 'draft-only' });
      expect((await auditar({ kind: 'service' })).seguranca).toEqual({ perfilEfetivo: 'normal' });
      expect((await auditar(usuario(`${CLIENTE}-extra`))).seguranca).toEqual({ perfilEfetivo: 'normal' });
    });

    it('E. mudar a env entre chamadas: a auditoria seguinte já reflete', async () => {
      carteira(1);
      m.visiveis.mockResolvedValue(null);
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = '';
      expect((await auditar(usuario(CLIENTE))).seguranca.perfilEfetivo).toBe('normal');
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = `outro, ${CLIENTE}`;
      expect((await auditar(usuario(CLIENTE))).seguranca.perfilEfetivo).toBe('draft-only');
    });

    it('F. o manual continua DRAFT_ONLY seja qual for o perfil efetivo, e a regra do perfil está nele', async () => {
      carteira(1);
      m.visiveis.mockResolvedValue(null);
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = '';
      const r = await auditar(usuario(CLIENTE));
      expect(r.manual).toMatchObject({ modo: 'DRAFT_ONLY', versao: DOT_OPERACAO_VERSAO });
      expect(r.manual.regras.join(' ')).toMatch(/seguranca\.perfilEfetivo = draft-only.*PERFIL_DE_SEGURANCA_INATIVO/);
    });

    it('G. nenhum clientId, userId, token ou env na resposta; H. e nada é gravado', async () => {
      carteira(2);
      m.visiveis.mockResolvedValue(null);
      process.env.MCP_DRAFT_ONLY_CLIENT_IDS = CLIENTE;
      const texto = JSON.stringify(await auditar(usuario(CLIENTE)));
      for (const sensivel of [CLIENTE, 'clerk-sintetico-123', 'MCP_DRAFT_ONLY_CLIENT_IDS', 'clientId', 'userId', 'token']) {
        expect(texto).not.toContain(sensivel);
      }
      expect(m.registrarSugestoes).not.toHaveBeenCalled();
      // O dublê do banco só tem leituras (findMany/groupBy): qualquer escrita quebraria aqui.
    });

    it('G2. sem projeto visível, o aviso também não identifica a conta', async () => {
      carteira(1);
      m.visiveis.mockResolvedValue([]);
      const r = await auditar(usuario(CLIENTE));
      expect(r.aviso).toMatch(/Nenhum cliente visível/);
      expect(JSON.stringify(r)).not.toMatch(/fulano@exemplo|clerk-sintetico-123|cliente-chatgpt-sintetico/);
    });
  });
});
