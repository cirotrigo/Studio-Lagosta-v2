import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  criarControleDoDiretor,
  limiteDaRodada,
  tempoParaGerar,
  registrarContextoDoDiretor,
} from '../controle-do-diretor';
import {
  planejarArte,
  planejarMelhoria,
  type PlanejarArteArgs,
  type PlanejarMelhoriaArgs,
} from '../diretor-de-arte';
import { generateObject } from 'ai';

vi.mock('ai', () => ({ generateObject: vi.fn() }));

const arte: PlanejarArteArgs = {
  brand: null,
  copy: ['Olá'],
  pedido: '',
  referencias: [],
  formato: 'story',
  alturaPx: 1920,
  instrucaoImagem: null,
  logoCompor: false,
};
const melhoria: PlanejarMelhoriaArgs = {
  brand: null,
  copy: ['Olá'],
  pedido: '',
  imagens: [],
  modo: 'rediagramar',
  formato: 'STORY',
  arteSemTexto: false,
  instrucaoImagem: null,
  logoCompor: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe('prazo compartilhado do diretor', () => {
  it('identifica contexto e ordem das imagens sem gravar seu conteúdo', () => {
    const controle = criarControleDoDiretor();
    const imagens = [Buffer.from('foto'), Buffer.from('manual')];
    registrarContextoDoDiretor(
      controle,
      'modelo',
      'system',
      'contexto privado',
      imagens
    );
    const primeiro = JSON.stringify(controle.registro.contexto);
    registrarContextoDoDiretor(
      controle,
      'modelo',
      'system',
      'contexto privado',
      imagens
    );
    expect(JSON.stringify(controle.registro.contexto)).toBe(primeiro);
    expect(primeiro).not.toContain('contexto privado');
    registrarContextoDoDiretor(
      controle,
      'modelo',
      'system',
      'contexto privado',
      [...imagens].reverse()
    );
    expect(JSON.stringify(controle.registro.contexto)).not.toBe(primeiro);
    expect(controle.registro.contexto?.contextoHash).toHaveLength(64);
  });

  it('limita a rodada ao tempo restante e recusa iniciar sem orçamento', () => {
    const controle = criarControleDoDiretor(100_000);
    expect(limiteDaRodada(controle, 75_000, 80_000)).toBe(20_000);
    expect(limiteDaRodada(controle, 75_000, 96_000)).toBe(0);
    expect(controle.registro.motivoFallback).toBe('prazo');
  });

  it('mantém o teto por rodada para chamadores sem deadline', () => {
    expect(limiteDaRodada(criarControleDoDiretor(), 75_000)).toBe(75_000);
  });

  it('não inventa 30 segundos quando a imagem já não cabe no orçamento', () => {
    expect(() => tempoParaGerar(100_000, 70_001)).toThrow('Tempo insuficiente');
    expect(tempoParaGerar(100_000, 70_000)).toBe(30_000);
  });

  it.each(['arte', 'melhoria'])(
    'não chama o provedor com prazo vencido: %s',
    async (via) => {
      const controle = criarControleDoDiretor(Date.now() - 1);
      const resultado =
        via === 'arte'
          ? await planejarArte({ ...arte, controle })
          : await planejarMelhoria({ ...melhoria, controle });
      expect(resultado).toBeNull();
      expect(generateObject).not.toHaveBeenCalled();
      expect(controle.registro).toMatchObject({
        estado: 'fallback',
        motivoFallback: 'prazo',
        tentativas: [],
      });
    }
  );

  it('preserva a recusa e usa fallback sem iniciar uma segunda rodada que não cabe', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let agora = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);
    const controle = criarControleDoDiretor(110_000);
    vi.mocked(generateObject).mockImplementation(async () => {
      agora = 108_000;
      return { object: { prompt: 'sem a copy' } } as never;
    });
    expect(await planejarArte({ ...arte, controle })).toBeNull();
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 })
    );
    expect(controle.registro).toMatchObject({
      estado: 'fallback',
      motivoFallback: 'prazo',
    });
    expect(controle.registro.tentativas[0]).toMatchObject({
      desfecho: 'recusado',
      duracaoMs: 8_000,
      limiteMs: 10_000,
    });
    expect(controle.registro.tentativas[0].motivos.join(' ')).toContain(
      'NÃO estão'
    );
  });

  it.each(['arte', 'melhoria'])(
    'registra falhas sem persistir erro arbitrário do provedor: %s',
    async (via) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(generateObject).mockRejectedValue(
        new Error('secret-provider-payload')
      );
      const controle = criarControleDoDiretor();
      const resultado =
        via === 'arte'
          ? await planejarArte({ ...arte, controle })
          : await planejarMelhoria({ ...melhoria, controle });
      expect(resultado).toBeNull();
      expect(generateObject).toHaveBeenCalledTimes(3);
      expect(controle.registro).toMatchObject({
        estado: 'fallback',
        motivoFallback: 'tentativas-esgotadas',
      });
      expect(controle.registro.tentativas).toHaveLength(3);
      expect(JSON.stringify(controle.registro)).not.toContain(
        'secret-provider-payload'
      );
    }
  );

  it('registra aprovação após recusa sem alterar o contrato da melhoria', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: { prompt: 'sem texto' } } as never)
      .mockResolvedValueOnce({
        object: { prompt: 'Use "Olá".', copyFinal: ['Outra copy'] },
      } as never);
    const controle = criarControleDoDiretor();
    const resultado = await planejarMelhoria({ ...melhoria, controle });
    expect(resultado?.copyFinal).toEqual(['Olá']);
    expect(resultado?.tentativas).toBe(2);
    expect(controle.registro.estado).toBe('aprovado');
    expect(controle.registro.tentativas.map((t) => t.desfecho)).toEqual([
      'recusado',
      'aprovado',
    ]);
    expect(controle.registro.motivoFallback).toBeNull();
  });

  it('classifica uma rodada abortada como timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sinal = AbortSignal.abort();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(sinal);
    vi.mocked(generateObject).mockRejectedValue(new Error('aborted'));
    const controle = criarControleDoDiretor();
    await planejarArte({ ...arte, controle });
    expect(
      controle.registro.tentativas.every((t) => t.desfecho === 'timeout')
    ).toBe(true);
  });
});
