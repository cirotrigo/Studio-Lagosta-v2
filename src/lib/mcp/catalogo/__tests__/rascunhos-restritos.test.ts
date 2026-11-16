import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const servico = vi.hoisted(() => vi.fn(async () => ({ situacao: 'rascunho' })));
vi.mock('@/lib/posts/reagendar-rascunho', () => ({
  reagendarRascunho: servico,
}));
import { toolsDeRascunhosRestritos } from '../rascunhos-restritos';
import { executarTool } from '../../registro/porta';
import {
  TOOLS_DRAFT_ONLY,
  registrarNoStdio,
  perfilDoPrincipal,
} from '../../registro/perfil';
const args = {
  projectId: 7,
  postId: 'p1',
  versaoEsperada: '2026-01-01T00:00:00.000Z',
  quandoISO: '2099-01-01T21:00:00.000Z',
};
beforeEach(() => servico.mockClear());
afterEach(() => vi.unstubAllEnvs());
describe('porta restrita para reagendar DRAFT', () => {
  it('existe no catálogo restrito e allowlist, sem liberar tools antigas', () => {
    expect(toolsDeRascunhosRestritos.map((t) => t.nome)).toEqual([
      'reagendar-rascunho',
    ]);
    expect(TOOLS_DRAFT_ONLY.has('reagendar-rascunho')).toBe(true);
    expect(TOOLS_DRAFT_ONLY.has('reagendar-post')).toBe(false);
    expect(TOOLS_DRAFT_ONLY.has('cancelar-post')).toBe(false);
  });
  it('exige curador/projeto na porta antes do serviço', async () => {
    const tool = toolsDeRascunhosRestritos[0];
    expect(tool).toBeDefined();
    const curador = vi.fn(async () => {
      throw new Error('SEM_PERMISSAO');
    });
    const r = await executarTool(
      new Map([[tool.nome, tool]]),
      'remoto',
      tool.nome,
      args,
      { kind: 'service' },
      { gates: { projeto: vi.fn(), curador } }
    );
    expect(r.isError).toBe(true);
    expect(curador).toHaveBeenCalledWith(7, { kind: 'service' });
    expect(servico).not.toHaveBeenCalled();
  });
  it('aceita apenas payload estrito sem publicar/force/status', async () => {
    const tool = toolsDeRascunhosRestritos[0];
    expect(tool).toBeDefined();
    for (const extra of [
      { status: 'SCHEDULED' },
      { force: true },
      { publicar: true },
    ])
      expect(tool.schema.safeParse({ ...args, ...extra }).success).toBe(false);
    const r = await executarTool(
      new Map([[tool.nome, tool]]),
      'remoto',
      tool.nome,
      args,
      { kind: 'service' },
      { gates: { projeto: vi.fn(), curador: vi.fn() } }
    );
    expect(r.isError).not.toBe(true);
    expect(servico).toHaveBeenCalledWith(args);
  });
});

describe('OAuth draft-only nas duas superfícies', () => {
  it.each(['remoto', 'local'] as const)(
    'executa %s com curador e não libera ferramenta antiga',
    async (superficie) => {
      vi.stubEnv('MCP_DRAFT_ONLY_CLIENT_IDS', 'cliente-restrito');
      const principal = {
        kind: 'user' as const,
        userId: 'clerk-teste',
        clientId: 'cliente-restrito',
      };
      expect(perfilDoPrincipal(principal)).toBe('draft-only');
      const tool = toolsDeRascunhosRestritos[0];
      expect(tool.superficies).toContain(superficie);
      expect(registrarNoStdio(tool.nome, 'catalogo', true)).toBe(true);
      const indice = new Map([
        [tool.nome, tool],
        ['reagendar-post', { ...tool, nome: 'reagendar-post' }],
      ]);
      const curador = vi.fn(async () => undefined);
      const r = await executarTool(
        indice,
        superficie,
        tool.nome,
        args,
        principal,
        { gates: { projeto: vi.fn(), curador } }
      );
      expect(r.isError).not.toBe(true);
      expect(curador).toHaveBeenCalledWith(7, principal);
      expect(servico).toHaveBeenCalledTimes(1);
      const proibida = await executarTool(
        indice,
        superficie,
        'reagendar-post',
        args,
        principal,
        { gates: { projeto: vi.fn(), curador } }
      );
      expect(proibida.isError).toBe(true);
      expect(servico).toHaveBeenCalledTimes(1);
    }
  );
});
