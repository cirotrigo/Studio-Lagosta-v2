import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
import { reagendarRascunho } from '../reagendar-rascunho';
const input = () => ({
  projectId: 7,
  postId: 'p1',
  versaoEsperada: '2026-01-01T00:00:00.000Z',
  quandoISO: '2099-01-01T21:00:00.000Z',
});
function setup(overrides = {}, count = 1, vizinhos: any[] = []) {
  const post = {
    id: 'p1',
    projectId: 7,
    status: 'DRAFT',
    updatedAt: new Date(input().versaoEsperada),
    scheduledDatetime: new Date('2098-01-01T00:00:00Z'),
    postType: 'STORY',
    scheduleType: 'SCHEDULED',
    isRecurring: false,
    laterPostId: null,
    bufferId: null,
    sentAt: null,
    bufferSentAt: null,
    instagramMediaId: null,
    publishedUrl: null,
    ...overrides,
  };
  const tx = {
    $queryRaw: vi.fn(async () => []),
    socialPost: {
      findFirst: vi.fn(async () => post),
      findMany: vi.fn(async () => vizinhos),
      updateMany: vi.fn(async (..._args: any[]) => ({ count })),
    },
  };
  return { tx, db: { $transaction: vi.fn(async (f: any) => f(tx)) } };
}
describe('reagendar só rascunho, sem efeitos de publicação', () => {
  it('faz CAS escopado, só muda data e versão, e mantém DRAFT', async () => {
    const { tx, db } = setup();
    const r = await reagendarRascunho(input(), db as any);
    expect(r.situacao).toBe('rascunho');
    expect(r.quandoISO).toBe(input().quandoISO);
    const q = tx.socialPost.updateMany.mock.calls[0][0] as any;
    expect(q.where).toMatchObject({
      id: 'p1',
      projectId: 7,
      status: 'DRAFT',
      laterPostId: null,
      updatedAt: new Date(input().versaoEsperada),
    });
    expect(Object.keys(q.data).sort()).toEqual([
      'scheduledDatetime',
      'updatedAt',
    ]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each(['SCHEDULED', 'POSTING', 'POSTED', 'FAILED'])(
    'recusa %s sem escrever',
    async (status) => {
      const { tx, db } = setup({ status });
      await expect(reagendarRascunho(input(), db as any)).rejects.toMatchObject(
        { code: 'POST_NAO_E_RASCUNHO' }
      );
      expect(tx.socialPost.updateMany).not.toHaveBeenCalled();
    }
  );
  it.each([
    'laterPostId',
    'bufferId',
    'sentAt',
    'bufferSentAt',
    'instagramMediaId',
    'publishedUrl',
    'latePublishedAt',
    'latePlatformUrl',
  ])('recusa vestígio remoto %s', async (campo) => {
    const { tx, db } = setup({ [campo]: 'remoto' });
    await expect(reagendarRascunho(input(), db as any)).rejects.toMatchObject({
      code: 'RASCUNHO_COM_ENVIO',
    });
    expect(tx.socialPost.updateMany).not.toHaveBeenCalled();
  });
  it('recusa projeto diferente, recorrente e versão velha', async () => {
    for (const [extra, code] of [
      [{ projectId: 8 }, 'POST_NAO_ENCONTRADO'],
      [{ isRecurring: true }, 'RASCUNHO_RECORRENTE'],
      [{ updatedAt: new Date() }, 'VERSAO_DO_POST_MUDOU'],
    ] as const) {
      const { tx, db } = setup(extra);
      await expect(reagendarRascunho(input(), db as any)).rejects.toMatchObject(
        { code }
      );
      expect(tx.socialPost.updateMany).not.toHaveBeenCalled();
    }
  });
  it('recusa corrida no CAS sem afirmar sucesso', async () => {
    const { db } = setup({}, 0);
    await expect(reagendarRascunho(input(), db as any)).rejects.toMatchObject({
      code: 'VERSAO_DO_POST_MUDOU',
    });
  });
  it('recusa horário ocupado por mesmo formato, inclusive FAILED', async () => {
    const { tx, db } = setup({}, 1, [
      { postType: 'STORY', scheduledDatetime: new Date(input().quandoISO) },
    ]);
    await expect(reagendarRascunho(input(), db as any)).rejects.toMatchObject({
      code: 'HORARIO_OCUPADO',
    });
    expect(tx.socialPost.updateMany).not.toHaveBeenCalled();
  });
  it('outro formato não ocupa slot', async () => {
    const { db } = setup({}, 1, [
      { postType: 'POST', scheduledDatetime: new Date(input().quandoISO) },
    ]);
    expect((await reagendarRascunho(input(), db as any)).situacao).toBe(
      'rascunho'
    );
  });
  it('recusa passado, data ambígua/normalizada e autoridade extra antes de transação', async () => {
    for (const extra of [
      { quandoISO: '2000-01-01T00:00:00.000Z' },
      { quandoISO: '2099-02-30T21:00:00.000Z' },
      { quandoISO: '2099-01-01 18:00' },
      { status: 'SCHEDULED' },
      { force: true },
    ]) {
      const { db } = setup();
      await expect(
        reagendarRascunho({ ...input(), ...extra }, db as any)
      ).rejects.toThrow();
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  });
});
