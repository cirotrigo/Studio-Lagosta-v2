/**
 * L1 do H4 (13/10/2026): post entregue ao publicador (`laterPostId`) nunca entra na fila do cron — nem em
 * `urgentes` nem em `restantes`. `renderPostArt` recusaria reservá-lo ("ocupado") sem contar tentativa, e o PENDING
 * dele ocuparia uma das 5 vagas de cada rodada para sempre. A recuperação de reserva órfã (#220) convive: ela roda
 * antes e também pula `laterPostId`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  posts: [] as any[],
  consultas: [] as any[],
  recuperou: 0,
}));

function casa(p: any, where: any): boolean {
  if (where.renderStatus && p.renderStatus !== where.renderStatus) return false;
  if (
    'laterPostId' in where &&
    where.laterPostId === null &&
    p.laterPostId !== null
  )
    return false;
  if (where.status?.in && !where.status.in.includes(p.status)) return false;
  if (typeof where.status === 'string' && p.status !== where.status)
    return false;
  if (where.id?.notIn?.includes(p.id)) return false;
  if (where.scheduledDatetime) {
    const t = p.scheduledDatetime?.getTime();
    if (
      t === undefined ||
      t <= where.scheduledDatetime.gt.getTime() ||
      t > where.scheduledDatetime.lte.getTime()
    )
      return false;
  }
  return true;
}

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findMany: vi.fn(async ({ where, take }: any) => {
        estado.consultas.push(where);
        return estado.posts.filter((p) => casa(p, where)).slice(0, take);
      }),
    },
  },
}));
vi.mock('@/lib/posts/render-post-art', () => ({
  renderPostArt: vi.fn(async () => ({
    ok: true,
    url: 'https://blob.test/r.png',
  })),
  recuperarRendersInterrompidos: vi.fn(async () => {
    estado.recuperou++;
    return { devolvidos: 0, falharam: 0 };
  }),
}));
vi.mock('../../../../../../prisma/generated/client', () => ({
  PostStatus: { SCHEDULED: 'SCHEDULED', DRAFT: 'DRAFT' },
  RenderStatus: { PENDING: 'PENDING' },
}));

import { GET } from '../route';
import { renderPostArt } from '@/lib/posts/render-post-art';

async function rodar() {
  process.env.CRON_SECRET = 'segredo';
  const res = await GET(
    new Request('http://x/api/cron/render-stories', {
      headers: { authorization: 'Bearer segredo' },
    }) as never
  );
  return res.json();
}

const daqui = (min: number) => new Date(Date.now() + min * 60_000);
const post = (id: string, extra: any) => ({
  id,
  pageId: 'pg',
  renderStatus: 'PENDING',
  renderAttempts: 0,
  laterPostId: null,
  status: 'DRAFT',
  scheduledDatetime: daqui(600),
  ...extra,
});

beforeEach(() => {
  estado.consultas = [];
  estado.recuperou = 0;
  vi.mocked(renderPostArt).mockClear();
});

describe('render-stories: post entregue não ocupa a fila', () => {
  it('PENDING + laterPostId nunca é selecionado, em urgentes nem em restantes', async () => {
    estado.posts = [
      post('entregue-urgente', {
        status: 'SCHEDULED',
        laterPostId: 'z1',
        scheduledDatetime: daqui(3),
      }),
      post('entregue-tarde', { status: 'SCHEDULED', laterPostId: 'z2' }),
      post('rascunho-entregue', { laterPostId: 'z3' }),
    ];
    expect(await rodar()).toMatchObject({ rendered: 0 });
    expect(renderPostArt).not.toHaveBeenCalled();
    for (const where of estado.consultas) expect(where.laterPostId).toBeNull();
  });

  it('PENDING sem laterPostId continua elegível, e a recuperação de órfãos roda antes', async () => {
    estado.posts = [
      post('agendado-urgente', {
        status: 'SCHEDULED',
        scheduledDatetime: daqui(3),
      }),
      post('rascunho', {}),
      post('entregue', { status: 'SCHEDULED', laterPostId: 'z1' }),
    ];
    const r = await rodar();
    expect(r).toMatchObject({ processed: 2, rendered: 2 });
    expect(vi.mocked(renderPostArt).mock.calls.map(([p]: any) => p.id)).toEqual(
      ['agendado-urgente', 'rascunho']
    );
    expect(estado.recuperou).toBe(1);
  });
});
