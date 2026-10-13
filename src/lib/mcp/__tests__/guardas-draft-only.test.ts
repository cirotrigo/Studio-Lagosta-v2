import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guardas das mutações PERMITIDAS ao perfil draft-only (H4): ajustar-arte,
 * compor-leva e agendar-leva nunca alcançam peça aprovada. As letras são os
 * testes do owner (L, M, N).
 */

const m = vi.hoisted(() => ({
  posts: [] as Array<Record<string, any>>,
  generations: [] as Array<Record<string, any>>,
  itensDeLote: [] as Array<Record<string, any>>,
  itensDePlano: [] as Array<Record<string, any>>,
  ajustarArte: vi.fn(async () => ({ pageId: 'pg-1', ok: true })),
  enfileirarPeca: vi.fn(async () => ({
    generationId: 'gen-nova',
    lote: { desfecho: 'criado', situacao: 'pendente' },
  })),
  agendarItensDoLote: vi.fn(async (entrada: any) => ({
    loteId: entrada.loteId,
    simulado: false,
    resumo: { concluidos: 0, pendentes: 0, falhas: 0 },
    itens: [],
  })),
  falharLeitura: false,
}));

const casaWhere = (
  linha: Record<string, any>,
  where: Record<string, any>
): boolean =>
  Object.entries(where).every(([k, c]) => {
    if (k === 'OR') return (c as any[]).some((w) => casaWhere(linha, w));
    if (k === 'fieldValues') return linha.fieldValues?.pageId === c.equals;
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if ('in' in c) return c.in.includes(linha[k]);
      if ('hasSome' in c)
        return (linha[k] ?? []).some((u: string) => c.hasSome.includes(u));
      if ('not' in c) return linha[k] !== c.not && linha[k] !== undefined;
    }
    return linha[k] === c;
  });
const tabela = (
  nome: 'posts' | 'generations' | 'itensDeLote' | 'itensDePlano'
) => ({
  findMany: async ({ where }: any) => {
    if (m.falharLeitura) throw new Error('a conexão caiu');
    return m[nome].filter((l) => casaWhere(l, where));
  },
});

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: tabela('posts'),
    generation: tabela('generations'),
    itemDeLote: tabela('itensDeLote'),
    itemDePlano: tabela('itensDePlano'),
  },
}));
vi.mock('@/lib/mcp/tools', () => ({
  CLIENT_ID_LOCAL: 'claude-code-local',
  quemDecidiu: vi.fn(async () => 'user-interno'),
  canalDoPrincipal: vi.fn(() => 'mcp'),
  projetosVisiveis: vi.fn(async () => null),
  assertProjetoPermitido: vi.fn(async () => undefined),
  assertCuradorDoProjeto: vi.fn(async () => undefined),
}));
vi.mock('@/lib/creatives/arte-rapida', () => ({ ajustarArte: m.ajustarArte }));
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: m.enfileirarPeca }));
vi.mock('@/lib/lotes/agendar-itens', () => ({
  agendarItensDoLote: m.agendarItensDoLote,
}));

import { toolsDeArteIA } from '@/lib/mcp/catalogo/arte-ia';
import { toolsDoCompositor } from '@/lib/mcp/catalogo/compositor';

const DOT = {
  kind: 'user' as const,
  userId: 'clerk-dot',
  clientId: 'cliente-dot-sintetico',
};
const PESSOA = {
  kind: 'user' as const,
  userId: 'clerk-ciro',
  clientId: 'cliente-claude-ai',
};
const ENV = process.env.MCP_DRAFT_ONLY_CLIENT_IDS;
const tool = (
  lista: Array<{ nome: string; handler: (a: any, p: any) => Promise<unknown> }>,
  nome: string
) => lista.find((t) => t.nome === nome)!;

beforeEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = 'cliente-dot-sintetico';
  m.posts = [];
  m.generations = [
    {
      id: 'gen-1',
      projectId: 8,
      resultUrl: 'https://blob.test/pg-1-v1.png',
      fieldValues: { pageId: 'pg-1' },
    },
  ];
  m.itensDeLote = [];
  m.itensDePlano = [];
  m.falharLeitura = false;
  m.ajustarArte.mockClear();
  m.enfileirarPeca.mockClear();
  m.agendarItensDoLote.mockClear();
});
afterEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ENV;
});

const post = (extra: Record<string, any>) => ({
  id: 'p1',
  projectId: 8,
  status: 'DRAFT',
  laterPostId: null,
  pageId: null,
  generationId: null,
  mediaUrls: [],
  ...extra,
});
const ajustar = (principal: unknown, extra: Record<string, unknown> = {}) =>
  tool(toolsDeArteIA as never, 'ajustar-arte').handler(
    {
      projectId: 8,
      pageId: 'pg-1',
      slotValues: { headline: 'novo' },
      ...extra,
    },
    principal
  );

describe('ajustar-arte no perfil draft-only', () => {
  it('L. a peça própria ainda em rascunho: permitido', async () => {
    m.posts = [post({ pageId: 'pg-1' })];
    await expect(ajustar(DOT)).resolves.toMatchObject({ ok: true });
    expect(m.ajustarArte).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['M. SCHEDULED pelo pageId', { pageId: 'pg-1', status: 'SCHEDULED' }],
    ['N. POSTED pelo pageId', { pageId: 'pg-1', status: 'POSTED' }],
    ['POSTING pela Generation', { generationId: 'gen-1', status: 'POSTING' }],
    ['FAILED (é da recuperação)', { pageId: 'pg-1', status: 'FAILED' }],
    ['rascunho entregue ao publicador', { pageId: 'pg-1', laterPostId: 'z1' }],
    [
      'slide de carrossel agendado (pela mídia)',
      {
        mediaUrls: ['https://blob.test/pg-1-v1.png', 'https://blob.test/x.png'],
        status: 'SCHEDULED',
      },
    ],
  ])('%s: recusado antes de qualquer escrita', async (_nome, extra) => {
    m.posts = [post(extra)];
    await expect(ajustar(DOT)).rejects.toMatchObject({
      code: 'POST_APROVADO_INTOCAVEL',
    });
    expect(m.ajustarArte).not.toHaveBeenCalled();
  });

  it('post aprovado achado pelo item de lote ou de plano: recusado', async () => {
    m.posts = [post({ id: 'p-lote', status: 'SCHEDULED' })];
    m.itensDeLote = [{ projectId: 8, generationId: 'gen-1', postId: 'p-lote' }];
    await expect(ajustar(DOT)).rejects.toMatchObject({
      code: 'POST_APROVADO_INTOCAVEL',
    });
    m.itensDeLote = [];
    m.itensDePlano = [{ projectId: 8, pageId: 'pg-1', postId: 'p-lote' }];
    await expect(ajustar(DOT)).rejects.toMatchObject({
      code: 'POST_APROVADO_INTOCAVEL',
    });
    expect(m.ajustarArte).not.toHaveBeenCalled();
  });

  it('fail-closed: sem conseguir conferir, não ajusta', async () => {
    m.falharLeitura = true;
    await expect(ajustar(DOT)).rejects.toThrow(/conexão caiu/);
    expect(m.ajustarArte).not.toHaveBeenCalled();
  });

  it('foto por URL externa é recusada; pelo acervo passa', async () => {
    await expect(
      ajustar(DOT, { imageUrl: 'https://qualquer.test/x.jpg' })
    ).rejects.toMatchObject({ code: 'URL_EXTERNA_RECUSADA' });
    await expect(
      ajustar(DOT, { driveImageId: 'drive-1' })
    ).resolves.toBeTruthy();
  });

  it('o perfil normal ajusta como sempre (sem a guarda)', async () => {
    m.posts = [post({ pageId: 'pg-1', status: 'SCHEDULED' })];
    await expect(
      ajustar(PESSOA, { imageUrl: 'https://qualquer.test/x.jpg' })
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('compor-leva no perfil draft-only', () => {
  const compor = (principal: unknown) =>
    tool(toolsDoCompositor as never, 'compor-leva').handler(
      {
        projectId: 8,
        loteId: 'dot-8-2026-S42',
        itens: [
          { itemId: 'aprovado', blocos: [] },
          { itemId: 'novo', blocos: [] },
        ],
      },
      principal
    ) as Promise<any>;

  it('item cuja identidade já virou post aprovado não volta à produção; o resto segue', async () => {
    m.itensDeLote = [
      {
        projectId: 8,
        loteId: 'dot-8-2026-S42',
        itemId: 'aprovado',
        postId: 'p1',
      },
    ];
    m.posts = [post({ status: 'SCHEDULED' })];
    const r = await compor(DOT);
    expect(r.falhas).toEqual([
      expect.objectContaining({ indice: 0, codigo: 'POST_APROVADO_INTOCAVEL' }),
    ]);
    expect(m.enfileirarPeca).toHaveBeenCalledTimes(1);
  });

  it('item ligado a rascunho segue (retry idempotente), e o perfil normal não confere nada', async () => {
    m.itensDeLote = [
      {
        projectId: 8,
        loteId: 'dot-8-2026-S42',
        itemId: 'aprovado',
        postId: 'p1',
      },
    ];
    m.posts = [post({})];
    expect((await compor(DOT)).falhas).toEqual([]);
    m.posts = [post({ status: 'SCHEDULED' })];
    expect((await compor(PESSOA)).falhas).toEqual([]);
  });
});

describe('agendar-leva no perfil draft-only', () => {
  const agendar = (principal: unknown, itens: unknown[] = [{ itemId: 'a' }]) =>
    tool(toolsDoCompositor as never, 'agendar-leva').handler(
      { projectId: 8, loteId: 'dot-8-2026-S42', itens },
      principal
    );

  it('pede apenasRascunho ao serviço; o perfil normal não', async () => {
    await agendar(DOT);
    expect(m.agendarItensDoLote).toHaveBeenLastCalledWith(
      expect.objectContaining({ apenasRascunho: true })
    );
    await agendar(PESSOA);
    expect(m.agendarItensDoLote).toHaveBeenLastCalledWith(
      expect.objectContaining({ apenasRascunho: false })
    );
  });

  it('recriar rascunho apagado pela equipe exige gente: recusado sem chamar o serviço', async () => {
    await expect(
      agendar(DOT, [{ itemId: 'a', recriarRascunhoApagado: true }])
    ).rejects.toMatchObject({ code: 'CONFIRMACAO_HUMANA_NECESSARIA' });
    expect(m.agendarItensDoLote).not.toHaveBeenCalled();
  });
});
