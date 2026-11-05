import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * Perfil MCP draft-only (H4 do Dot, 13/10/2026): o servidor NÃO DEIXA a
 * identidade do agente passar do rascunho, mesmo que ele ignore o manual,
 * chame a tool direto ou use um apelido. As letras são os testes pedidos pelo owner.
 */

// Nada aqui toca o banco: o perfil decide antes de qualquer handler. Um handler que chegasse ao db quebraria.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/mcp/tools', () => ({
  CLIENT_ID_LOCAL: 'claude-code-local',
  projetosVisiveis: vi.fn(async () => null),
  assertProjetoPermitido: vi.fn(async () => undefined),
  assertCuradorDoProjeto: vi.fn(async () => undefined),
}));
// integracao.ts confere o espelho das categorias contra o enum no load.
vi.mock('@prisma/client', () => {
  const cats = [
    'CAMPANHAS',
    'CARDAPIO',
    'DELIVERY',
    'DIFERENCIAIS',
    'ESTABELECIMENTO_INFO',
    'FAQ',
    'HORARIOS',
    'POLITICAS',
    'TOM_DE_VOZ',
  ];
  return {
    KnowledgeCategory: Object.fromEntries(cats.map((c) => [c, c])),
    Prisma: {},
  };
});

import { CATALOGO, INDICE_DO_CATALOGO } from '@/lib/mcp/catalogo';
import {
  executarToolRemota,
  listarToolsRemotas,
} from '@/lib/mcp/catalogo/integracao';
import { definirTool } from '@/lib/mcp/registro/definir';
import { executarTool } from '@/lib/mcp/registro/porta';
import {
  clientesDraftOnly,
  perfilDoPrincipal,
  registrarNoStdio,
  TOOLS_DRAFT_ONLY,
  TOOLS_INGLESAS_SO_RASCUNHO,
} from '@/lib/mcp/registro/perfil';
import { MANUAL_DO_DOT } from '@/lib/mcp/operacao-dot';

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
const SERVICO = { kind: 'service' as const };
const ENV = process.env.MCP_DRAFT_ONLY_CLIENT_IDS;

const STDIO = process.env.STUDIO_SO_RASCUNHO
beforeEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ' outro-id , cliente-dot-sintetico '
  delete process.env.STUDIO_SO_RASCUNHO;
});
afterEach(() => {
  process.env.MCP_DRAFT_ONLY_CLIENT_IDS = ENV
  if (STDIO === undefined) delete process.env.STUDIO_SO_RASCUNHO
  else process.env.STUDIO_SO_RASCUNHO = STDIO;
});

const texto = (r: { content: Array<{ text?: string }> }) =>
  r.content.map((c) => c.text).join('');
const desconhecida = (nome: string) => ({
  content: [{ type: 'text', text: `Ferramenta desconhecida: ${nome}` }],
  isError: true,
});

describe('perfil do principal', () => {
  it('P. a lista de clientIds é exata: espaços aparados, sem substring', () => {
    expect([...clientesDraftOnly(' a , b,,c ')]).toEqual(['a', 'b', 'c']);
    expect(perfilDoPrincipal(DOT)).toBe('draft-only');
    expect(perfilDoPrincipal({ ...DOT, clientId: 'cliente-dot' })).toBe(
      'normal'
    );
    expect(
      perfilDoPrincipal({ ...DOT, clientId: 'cliente-dot-sintetico-2' })
    ).toBe('normal');
    expect(
      perfilDoPrincipal({ ...DOT, clientId: 'CLIENTE-DOT-SINTETICO' })
    ).toBe('normal');
  });

  it('Q. env vazia ou ausente: ninguém é draft-only', () => {
    expect(perfilDoPrincipal(DOT, '')).toBe('normal');
    expect(perfilDoPrincipal(DOT, ' , ')).toBe('normal');
    delete process.env.MCP_DRAFT_ONLY_CLIENT_IDS;
    expect(perfilDoPrincipal(DOT)).toBe('normal');
  });

  it('O. o serviço nunca entra no perfil, nem usuário sem clientId', () => {
    expect(perfilDoPrincipal(SERVICO as never)).toBe('normal');
    expect(perfilDoPrincipal({ kind: 'user', userId: 'x' } as never)).toBe(
      'normal'
    );
    expect(perfilDoPrincipal(PESSOA)).toBe('normal');
  });
});

describe('stdio em modo só-rascunho: o processo inteiro é draft-only (Codex, H4)', () => {
  it('com STUDIO_SO_RASCUNHO=1, qualquer principal local é draft-only, e as guardas das mutações rodam', async () => {
    process.env.STUDIO_SO_RASCUNHO = '1'
    expect(perfilDoPrincipal(SERVICO as never)).toBe('draft-only')
    expect(perfilDoPrincipal({ kind: 'user', userId: 'x', clientId: 'claude-code-local' })).toBe('draft-only')
    expect(await executarToolRemota('postar-agora', {}, SERVICO as never)).toEqual(desconhecida('postar-agora'))
  })
})

describe('tools/list', () => {
  it('A. o perfil normal (e o serviço) vê o catálogo de sempre', () => {
    const remotas = [...CATALOGO.values()]
      .filter((t) => t.superficies.includes('remoto'))
      .map((t) => t.nome);
    expect(listarToolsRemotas(PESSOA).map((t) => t.name)).toEqual(remotas);
    expect(listarToolsRemotas(SERVICO as never).map((t) => t.name)).toEqual(
      remotas
    );
  });

  it('B. o draft-only vê só a allowlist, e toda tool da allowlist existe no catálogo', () => {
    const nomes = listarToolsRemotas(DOT).map((t) => t.name);
    expect(new Set(nomes)).toEqual(TOOLS_DRAFT_ONLY);
    for (const nome of TOOLS_DRAFT_ONLY) expect(CATALOGO.has(nome)).toBe(true);
  });

  it('I/J/K. auditar-operacao, compor-leva e agendar-leva estão na lista do draft-only; publicar não', () => {
    const nomes = listarToolsRemotas(DOT).map((t) => t.name);
    expect(nomes).toEqual(
      expect.arrayContaining([
        'auditar-operacao',
        'compor-leva',
        'agendar-leva',
        'ajustar-arte',
      ])
    );
    for (const proibida of [
      'postar-agora',
      'aprovar-rascunhos',
      'cancelar-post',
      'colocar-na-agenda',
      'atualizar-dna',
      'melhorar-arte',
      'gerar-imagem',
    ]) {
      expect(nomes).not.toContain(proibida);
    }
  });
});

describe('tools/call: fora da allowlist a tool não existe', () => {
  it.each([
    'postar-agora',
    'aprovar-rascunhos',
    'cancelar-post',
    'atualizar-dna',
    'executar-plano',
    'virar-regra',
    'gerar-imagem-lote',
    'voltar-para-rascunho',
  ])(
    'D/F/G/H. %s → a MESMA resposta da ferramenta inexistente, antes do schema (args inválidos não viram "Entrada inválida")',
    async (nome) => {
      expect(await executarToolRemota(nome, { lixo: true }, DOT)).toEqual(
        desconhecida(nome)
      );
      expect(await executarToolRemota('nao-existe-mesmo', {}, DOT)).toEqual(
        desconhecida('nao-existe-mesmo')
      );
    }
  );

  it('E. apelido de tool proibida também é desconhecido; apelido de tool permitida passa à porta', async () => {
    expect(
      await executarToolRemota('agendar-post', { lixo: true }, DOT)
    ).toEqual(desconhecida('agendar-post'));
    expect(await executarToolRemota('prepare-creative', {}, DOT)).toEqual(
      desconhecida('prepare-creative')
    );
    // list-posts é apelido de ver-agenda (permitida): passa do perfil e para no schema.
    const r = await executarToolRemota('list-posts', {}, DOT);
    expect(texto(r)).not.toMatch(/Ferramenta desconhecida/);
  });

  it('o perfil normal chama as mesmas tools como sempre (chega ao schema)', async () => {
    const r = await executarToolRemota('postar-agora', {}, PESSOA);
    expect(texto(r)).not.toMatch(/Ferramenta desconhecida/);
  });

  it('C. tool NOVA, fora da allowlist: invisível e desconhecida para o draft-only, normal para os outros', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const nova = definirTool({
      nome: 'tool-nova-do-futuro',
      descricao: 'tool de teste',
      schema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: true },
      acesso: { tipo: 'autenticado' },
      superficies: ['remoto'],
      handler,
    });
    const indice = new Map([[nova.nome, nova]]);
    const deps = {
      gates: { projeto: async () => undefined, curador: async () => undefined },
    };
    expect(
      await executarTool(indice, 'remoto', nova.nome, {}, DOT, deps)
    ).toEqual(desconhecida(nova.nome));
    expect(handler).not.toHaveBeenCalled();
    expect(
      texto(await executarTool(indice, 'remoto', nova.nome, {}, PESSOA, deps))
    ).toMatch(/"ok": true/);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lista e chamada não divergem: o que o draft-only não vê, ele não chama', async () => {
    const visiveis = new Set(listarToolsRemotas(DOT).map((t) => t.name));
    for (const tool of CATALOGO.values()) {
      if (!tool.superficies.includes('remoto') || visiveis.has(tool.nome))
        continue;
      expect(await executarToolRemota(tool.nome, {}, DOT)).toEqual(
        desconhecida(tool.nome)
      );
      for (const apelido of tool.apelidos ?? [])
        expect(await executarToolRemota(apelido, {}, DOT)).toEqual(
          desconhecida(apelido)
        );
    }
  });
});

describe('manual × política', () => {
  it('o loop do manual cabe na allowlist, e o que o manual tira do loop está fora dela', () => {
    for (const nome of [
      ...MANUAL_DO_DOT.producao.antes,
      ...MANUAL_DO_DOT.producao.passos.map((p) => p.tool),
      'auditar-operacao',
    ]) {
      expect(TOOLS_DRAFT_ONLY.has(nome)).toBe(true);
    }
    for (const nome of MANUAL_DO_DOT.foraDoLoop) {
      if (INDICE_DO_CATALOGO.has(nome))
        expect(TOOLS_DRAFT_ONLY.has(INDICE_DO_CATALOGO.get(nome)!.nome)).toBe(
          false
        );
    }
  });
});

describe('stdio com STUDIO_SO_RASCUNHO=1', () => {
  const PERIGOSAS = [
    'create-template',
    'create-page',
    'create-post',
    'update-post',
    'recover-stuck-post',
    'delete-posts',
    'render-story',
    'download-drive-image',
    'plan-week',
    'sync-zernio-posts',
    'prepare-creative',
    'upload-to-drive',
    'create-arte-rapida',
    'upload-creative',
    'upload-element',
  ];

  it('sem a flag, tudo como sempre', () => {
    for (const nome of [...PERIGOSAS, 'postar-agora'])
      expect(
        registrarNoStdio(
          nome,
          nome === 'postar-agora' ? 'catalogo' : 'inglesa',
          false
        )
      ).toBe(true);
  });

  it('com a flag: nenhuma inglesa perigosa nem tool do catálogo fora da allowlist', () => {
    for (const nome of PERIGOSAS)
      expect(registrarNoStdio(nome, 'inglesa', true)).toBe(false);
    for (const nome of TOOLS_INGLESAS_SO_RASCUNHO)
      expect(registrarNoStdio(nome, 'inglesa', true)).toBe(true);
    expect(registrarNoStdio('postar-agora', 'catalogo', true)).toBe(false);
    expect(registrarNoStdio('aprovar-rascunhos', 'catalogo', true)).toBe(false);
    expect(registrarNoStdio('compor-leva', 'catalogo', true)).toBe(true);
  });

  it('as 24 inglesas do stdio estão TODAS classificadas, e a perigosa nova nasce de fora', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'scripts/mcp-server.ts'),
      'utf8'
    );
    const registradas = [
      ...fonte.matchAll(/^toolEstrita\(\s*\n?\s*'([a-z-]+)'/gm),
    ].map((m) => m[1]);
    expect(registradas).toHaveLength(24);
    for (const nome of registradas)
      expect(
        TOOLS_INGLESAS_SO_RASCUNHO.has(nome) || PERIGOSAS.includes(nome)
      ).toBe(true);
    expect(registrarNoStdio('inglesa-nova', 'inglesa', true)).toBe(false);
    // O filtro mora no funil único das inglesas e no laço do catálogo.
    expect(fonte).toMatch(/if \(!registrarNoStdio\(name, 'inglesa'\)\) return/);
    expect(fonte).toMatch(
      /if \(!registrarNoStdio\(tool\.nome, 'catalogo'\)\) continue/
    );
  });
});
