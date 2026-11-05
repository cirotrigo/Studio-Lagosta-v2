import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOT_OPERACAO_VERSAO,
  MANUAL_DO_DOT,
  MAX_CICLOS_DE_REVISAO,
} from '@/lib/mcp/operacao-dot';
import { TARGET_DAYS_AHEAD } from '@/lib/posts/cobertura';

/**
 * Constituição operacional do Dot (H3, 13/10/2026). O manual é dado e vai em
 * toda auditoria: estes testes travam o que ele PRECISA dizer. As letras são
 * os testes pedidos pelo owner; A está em `auditar-operacao.test.ts`.
 */

const texto = JSON.stringify(MANUAL_DO_DOT);

describe('manual do agente operacional', () => {
  it('B. tem versão explícita', () => {
    expect(MANUAL_DO_DOT.versao).toBe(DOT_OPERACAO_VERSAO);
    expect(DOT_OPERACAO_VERSAO).toMatch(/^dot-operacao-v\d+$/);
  });

  it('C. o alvo é TARGET_DAYS_AHEAD', () => {
    expect(MANUAL_DO_DOT.alvoDias).toBe(TARGET_DAYS_AHEAD);
  });

  it('D. o modo é DRAFT_ONLY', () => {
    expect(MANUAL_DO_DOT.modo).toBe('DRAFT_ONLY');
    expect(MANUAL_DO_DOT.limite).toMatch(/PARA NO RASCUNHO/);
  });

  it('E. publicação, aprovação e cancelamento exigem humano', () => {
    expect(MANUAL_DO_DOT.limite).toMatch(/aprovação humana explícita/);
    expect(MANUAL_DO_DOT.requerHumano).toEqual(
      expect.arrayContaining(['aprovação final e publicação', 'cancelar'])
    );
  });

  it('F. esperados = 0 é "sem postagem prevista", nunca "conteúdo pronto"', () => {
    expect(MANUAL_DO_DOT.leitura.esperadosZero).toMatch(
      /"sem postagem prevista"/
    );
    expect(MANUAL_DO_DOT.leitura.esperadosZero).toMatch(
      /nunca "conteúdo pronto"/
    );
  });

  it('G. FAILED = relatar, nunca substituir', () => {
    expect(MANUAL_DO_DOT.acoes.RELATAR_FALHA).toMatch(/nunca criar substituto/);
    expect(texto).toMatch(/FAILED: relatar/);
  });

  it('H. PENDENTE nunca autoriza criação', () => {
    expect(MANUAL_DO_DOT.acoes.CONSERTO_PENDENTE).toMatch(/nunca criar outro/);
    expect(MANUAL_DO_DOT.regras).toContain(
      'PENDENTE nunca autoriza criação nova'
    );
  });

  it('I. SEM_ROTINA = não inventar agenda', () => {
    expect(MANUAL_DO_DOT.acoes.SEM_ROTINA).toMatch(/não inventar agenda/);
  });

  it('J. SEM_ASSINATURA não produz nem cai para IA', () => {
    expect(MANUAL_DO_DOT.acoes.SEM_ASSINATURA).toMatch(/não produzir/);
    expect(MANUAL_DO_DOT.foraDoLoop).toEqual(
      expect.arrayContaining([
        'melhorar-arte',
        'gerar-imagem',
        'gerar-imagem-lote',
      ])
    );
    expect(texto).toMatch(/nem usar IA/);
  });

  it('K. no máximo 2 ciclos de revisão', () => {
    expect(MAX_CICLOS_DE_REVISAO).toBe(2);
    expect(MANUAL_DO_DOT.producao.maxCiclosDeRevisao).toBe(2);
    expect(texto).toMatch(/REVISAO_HUMANA_NECESSARIA/);
  });

  it('L. fora do loop: publicar, aprovar, cancelar e os atalhos não idempotentes', () => {
    expect(MANUAL_DO_DOT.foraDoLoop).toEqual(
      expect.arrayContaining([
        'postar-agora',
        'aprovar-rascunhos',
        'cancelar-post',
        'colocar-na-agenda',
        'executar-plano',
        'propor-semana',
      ])
    );
    expect(MANUAL_DO_DOT.foraDoLoop.join(' ')).toMatch(/tools inglesas/);
  });

  it('a rodada começa por auditar-operacao, e hoje não é produção automática', () => {
    expect(MANUAL_DO_DOT.ordem[0]).toMatch(/^auditar-operacao/);
    expect(MANUAL_DO_DOT.leitura.hoje).toMatch(
      /não alvo de produção automática/
    );
  });

  it('é portátil: fala do agente, não de uma conversa ou de um modelo', () => {
    expect(texto).not.toMatch(/nesta conversa|o Claude|ChatGPT/i);
  });

  it('é compacto: vai em toda auditoria', () => {
    expect(texto.split(/\s+/).length).toBeLessThan(400);
  });

  it('o documento cita a versão do código (fonte canônica única)', () => {
    const doc = readFileSync(
      join(process.cwd(), 'docs/regras/dot-lagosta-operacao.md'),
      'utf8'
    );
    expect(doc).toContain(`\`${DOT_OPERACAO_VERSAO}\``);
    expect(doc).toContain('src/lib/mcp/operacao-dot.ts');
  });
});
