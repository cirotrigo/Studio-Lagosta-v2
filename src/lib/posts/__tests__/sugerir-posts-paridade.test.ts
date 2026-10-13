import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paridade da extração (H2 do Dot, 13/10/2026).
 *
 * A expectativa de posts do cliente (grade aprovada + cadência dos POSTED de
 * 56 dias + formato por bloco) saiu de dentro de `sugerirPosts` para
 * `cobertura.ts`, para a auditoria da carteira e a sugestão nunca divergirem.
 * O snapshot abaixo foi gravado com o código ANTERIOR à extração: se ele
 * mudar, a extração mudou a sugestão — pare e investigue, não atualize.
 */

const AGORA = new Date('2026-10-13T12:00:00Z'); // terça, 09:00 em Brasília
const PROJETO = 7;

/** "AAAA-MM-DD HH:mm" em Brasília → Date. */
const brt = (s: string) => new Date(`${s.replace(' ', 'T')}:00-03:00`);

function historico() {
  const posts: any[] = [];
  // Seis semanas para trás a partir da segunda 12/10.
  for (let w = 1; w <= 6; w++) {
    const d = (dia: number) => {
      const base = new Date('2026-10-12T12:00:00Z'); // segunda
      base.setUTCDate(base.getUTCDate() - 7 * w + dia);
      return base.toISOString().slice(0, 10);
    };
    posts.push({
      scheduledDatetime: brt(`${d(0)} 18:00`),
      postType: 'STORY',
      status: 'POSTED',
      origem: null,
      learningScope: 'ROTINA',
      campaignId: null,
    });
    posts.push({
      scheduledDatetime: brt(`${d(2)} 18:00`),
      postType: 'STORY',
      status: 'POSTED',
      origem: null,
      learningScope: 'ROTINA',
      campaignId: null,
    });
    posts.push({
      scheduledDatetime: brt(`${d(3)} 12:00`),
      postType: 'POST',
      status: 'POSTED',
      origem: null,
      learningScope: 'ROTINA',
      campaignId: null,
    });
    posts.push({
      scheduledDatetime: brt(`${d(4)} 19:30`),
      postType: 'STORY',
      status: 'POSTED',
      origem: null,
      learningScope: 'ROTINA',
      campaignId: null,
    });
    // Campanha ENCERRADA: sai da cadência.
    posts.push({
      scheduledDatetime: brt(`${d(5)} 20:00`),
      postType: 'STORY',
      status: 'POSTED',
      origem: null,
      learningScope: 'CAMPANHA',
      campaignId: 'camp-velha',
    });
    // Domingo de cadência sem grade (a grade é de segunda a sexta).
    posts.push({
      scheduledDatetime: brt(`${d(6)} 11:00`),
      postType: 'STORY',
      status: 'POSTED',
      origem: null,
      learningScope: 'ROTINA',
      campaignId: null,
    });
  }
  return posts;
}

const FUTUROS = [
  // Ocupa o slot de quarta 10h da grade (a 10 min).
  {
    id: 'p-qua',
    scheduledDatetime: brt('2026-10-14 09:50'),
    postType: 'STORY',
    status: 'DRAFT',
  },
  // Feed de quinta 12h: ocupa só o FEED.
  {
    id: 'p-qui',
    scheduledDatetime: brt('2026-10-15 12:20'),
    postType: 'POST',
    status: 'SCHEDULED',
  },
];

const ENTRADAS = [
  {
    id: 'grade-1',
    projectId: PROJETO,
    status: 'ACTIVE',
    category: 'POLITICAS',
    title: 'Padrões de Postagem — Teste',
    content: 'SLOT 1 — 10h, de segunda a sexta',
    tags: [],
    expiresAt: null,
  },
  {
    id: 'camp-velha',
    projectId: PROJETO,
    status: 'ACTIVE',
    category: 'CAMPANHAS',
    title: 'Festival de outubro',
    content: 'todo sábado',
    tags: [],
    expiresAt: new Date('2026-10-01T03:00:00Z'),
  },
];

function casaData(v: Date | null, f: any): boolean {
  if (!f) return true;
  if (!v) return false;
  if (f.gte && v < f.gte) return false;
  if (f.lte && v > f.lte) return false;
  return true;
}

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === PROJETO ? { id: PROJETO } : null
      ),
    },
    socialPost: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where.status === 'POSTED') {
          return historico().filter(
            (p) =>
              casaData(p.scheduledDatetime, where.scheduledDatetime) &&
              p.learningScope !== where.learningScope?.not
          );
        }
        return FUTUROS.filter(
          (p) =>
            where.status.in.includes(p.status) &&
            casaData(p.scheduledDatetime, where.scheduledDatetime)
        );
      }),
    },
    knowledgeBaseEntry: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where.id?.in) {
          return ENTRADAS.filter(
            (e) =>
              where.id.in.includes(e.id) &&
              e.projectId === where.projectId &&
              e.expiresAt &&
              e.expiresAt < where.expiresAt.lt
          ).map((e) => ({ id: e.id }));
        }
        if (where.category === 'CAMPANHAS') return [];
        return ENTRADAS.filter((e) =>
          where.category.in.includes(e.category)
        ).map((e) => ({ title: e.title, content: e.content }));
      }),
    },
    page: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/aprendizado/captura', () => ({
  registrarSugestoes: vi.fn(async () => {
    throw new Error('a prova de paridade não registra sinal');
  }),
  sugestoesJaEmitidas: vi.fn(async () => new Map()),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

describe('sugerirPosts — paridade da extração da expectativa', () => {
  it('a saída é a mesma de antes da extração (snapshot gravado no código anterior)', async () => {
    const { sugerirPosts } = await import('@/lib/posts/sugerir-posts');
    const r = await sugerirPosts({
      projectId: PROJETO,
      dias: 7,
      registrarSugestoes: false,
    });
    expect({
      janela: r.janela,
      postsNoHistorico: r.postsNoHistorico,
      cadencia: r.cadencia,
      grade: r.grade,
      excecoes: r.excecoes,
      ocupacao: r.ocupacao,
      jaNaAgenda: r.jaNaAgenda,
      sugestoes: r.sugestoes,
      sinaisRegistrados: r.sinaisRegistrados,
      avisos: r.avisos,
    }).toMatchSnapshot();
  });
});

vi.mock('@/lib/posts/cobertura', async (original) => {
  const real = await original<typeof import('@/lib/posts/cobertura')>();
  return { ...real, expectativaDoProjeto: vi.fn(real.expectativaDoProjeto) };
});

describe('X. sugerirPosts e auditar-operacao leem a MESMA expectativa', () => {
  it('sugerirPosts chama expectativaDoProjeto, e os buracos são os horários esperados livres', async () => {
    const cobertura = await import('@/lib/posts/cobertura');
    vi.mocked(cobertura.expectativaDoProjeto).mockClear();
    const { sugerirPosts } = await import('@/lib/posts/sugerir-posts');
    const r = await sugerirPosts({
      projectId: PROJETO,
      dias: 7,
      registrarSugestoes: false,
    });
    expect(cobertura.expectativaDoProjeto).toHaveBeenCalledTimes(1);

    // A mesma expectativa, montada direto: todo horário esperado da janela,
    // tirado o que já passou e os dois ocupados de FUTUROS, é uma sugestão.
    const expectativa = vi.mocked(cobertura.expectativaDoProjeto).mock
      .results[0].value;
    const ocupados = new Set([
      '2026-10-14 10:00 story',
      '2026-10-15 12:00 feed',
    ]);
    const esperados = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2026-10-13T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    })
      .flatMap((data) => cobertura.slotsEsperadosNaData(expectativa, data))
      .filter((s) => s.quandoUTC > AGORA.getTime() + 30 * 60_000)
      .map((s) => `${s.data} ${s.hora} ${s.formato}`)
      .filter((k) => !ocupados.has(k));
    expect(r.sugestoes.map((s) => `${s.data} ${s.hora} ${s.formato}`)).toEqual(
      esperados
    );
  });
});
