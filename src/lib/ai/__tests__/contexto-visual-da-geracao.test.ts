import { describe, expect, it } from 'vitest';
import type { BrandContext } from '@/lib/brand/brand-context';
import {
  resolverContextoVisualDaGeracao,
  portaDoFallback,
} from '../contexto-visual-da-geracao';
import { montarContextoDaGeracao } from '../diretor-de-arte';
import { montarPromptDoManual } from '../prompt-do-manual';

function marca(nome = 'Real Gelateria'): BrandContext {
  return {
    projectId: 99,
    projectName: nome,
    fonts: { title: 'Branley', subtitle: 'Spritz', body: 'Stage' },
    specimenFontFamilies: [],
    colors: [{ name: 'Menta', hexCode: '#00AA88' }],
    cuisineType: null,
    logoUrl: null,
    brandManualUrl: 'https://example.com/manual.png',
    artDirection: null,
    dna: {
      visualStyle:
        'Editorial; gradiente de leitura sobre a foto; manchete em serifa.',
      composition: 'Bloco no rodapé.',
      contentRules: 'Não inventar horários. Endereço: Rua A, 52.',
      toneOfVoice: null,
      photoDirection: null,
      approvalChecklist: 'Não exportar para o prompt.',
    },
  };
}

describe('resolução da identidade apenas para geração', () => {
  it('retira uma preferência fotográfica sem remover tipografia, posição ou fatos', () => {
    const entrada = marca();
    const antes = JSON.stringify(entrada);
    const { brand, resolucao } = resolverContextoVisualDaGeracao(entrada);
    expect(brand?.dna.visualStyle).toBe('Editorial; manchete em serifa.');
    expect(brand?.dna.composition).toBe('Bloco no rodapé.');
    expect(brand?.dna.contentRules).toBe(entrada.dna.contentRules);
    expect(resolucao.ajustes).toEqual([
      expect.objectContaining({
        fonte: 'dna.visualStyle',
        decisao: 'suprimido',
      }),
    ]);
    expect(JSON.stringify(entrada)).toBe(antes);
  });

  it.each([
    'Sem gradiente sobre a foto.',
    'Não escurecer o fundo.',
    'Gradiente nas letras.',
    'Gradiente no fundo e horário às 22h.',
  ])('preserva a frase ambígua ou obrigatória: %s', (texto) => {
    const entrada = marca();
    entrada.dna.visualStyle = texto;
    const { brand, resolucao } = resolverContextoVisualDaGeracao(entrada);
    expect(brand?.dna.visualStyle).toBe(texto);
    expect(resolucao.ajustes[0].decisao).toBe('revisao');
  });

  it('não modifica regras explícitas mesmo quando contradizem a política da geração', () => {
    const entrada = marca();
    entrada.dna.contentRules =
      'Usar gradiente de leitura. Nunca alterar o endereço.';
    const { brand, resolucao } = resolverContextoVisualDaGeracao(entrada);
    expect(brand?.dna.contentRules).toBe(entrada.dna.contentRules);
    expect(resolucao.ajustes).toContainEqual(
      expect.objectContaining({ fonte: 'dna.contentRules', decisao: 'revisao' })
    );
  });

  it.each([
    'O gradiente de leitura é construído com uma hierarquia clara: pré-título pequeno em caps',
    'Layout vertical com foto em tela cheia e bloco de texto ancorado no rodapé sobre tarja/gradiente escuro.',
    'logo em selo circular no topo direito e fundo fotográfico quente com degradê escuro para sustentar a leitura.',
  ])('preserva direção mista encontrada no inventário: %s', (trecho) => {
    const entrada = marca();
    entrada.dna.composition = trecho;
    const resultado = resolverContextoVisualDaGeracao(entrada);
    expect(resultado.brand?.dna.composition).toBe(trecho);
    expect(resultado.resolucao.ajustes).toContainEqual(
      expect.objectContaining({ fonte: 'dna.composition', decisao: 'revisao' })
    );
  });

  it('remove o campo histórico de foto, mantendo efeitos das letras e ornamentos', () => {
    const entrada = marca();
    entrada.estiloDasReferencias = {
      tipografia: {
        manchete: 'serifa',
        apoio: 'sans',
        servico: 'sans',
        destaque: 'cor',
      },
      caixaDaManchete: 'natural',
      coresDeDestaque: [],
      separadores: [],
      icones: [],
      evitar: [],
      logo: 'rodapé',
      tratamentoDaFoto: 'Gradiente de leitura',
      efeitoDaManchete: 'sombra-dura',
      ornamentos: ['onda'],
      resumo: 'Foto com véu escuro; fonte da marca.',
      diagramacao: 'Rodapé centralizado.',
    } as BrandContext['estiloDasReferencias'];
    const { brand } = resolverContextoVisualDaGeracao(entrada);
    expect(brand?.estiloDasReferencias?.tratamentoDaFoto).toBe('');
    expect(brand?.estiloDasReferencias?.efeitoDaManchete).toBe('sombra-dura');
    expect(brand?.estiloDasReferencias?.ornamentos).toEqual(['onda']);
    expect(entrada.estiloDasReferencias?.tratamentoDaFoto).toBe(
      'Gradiente de leitura'
    );
  });

  it.each(['Wine Vix', 'TERO', 'By Rock', 'Real Gelateria'])(
    'mantém identidade e copy intactas no contexto de %s',
    (nome) => {
      const contexto = montarContextoDaGeracao({
        brand: marca(nome),
        copy: ['Festival de gradientes', 'Funcionamento - 10h às 22h'],
        pedido: 'Manter alinhamento à esquerda.',
        referencias: [],
        formato: 'story',
        alturaPx: 1920,
        instrucaoImagem: null,
        logoCompor: false,
      });
      expect(contexto).toContain(nome);
      expect(contexto).toContain('Festival de gradientes');
      expect(contexto).toContain('Funcionamento - 10h às 22h');
      expect(contexto).toContain('Manter alinhamento à esquerda.');
      expect(contexto).not.toContain('gradiente de leitura sobre a foto');
      expect(contexto).not.toContain('Não exportar para o prompt.');
    }
  );

  it('aceita marca ausente', () => {
    expect(resolverContextoVisualDaGeracao(null).brand).toBeNull();
  });

  it('permite rollback sem modificar a marca nem produzir ajustes', () => {
    const entrada = marca();
    const resultado = resolverContextoVisualDaGeracao(entrada, false);
    expect(resultado.brand).toBe(entrada);
    expect(resultado.resolucao).toMatchObject({ ativo: false, ajustes: [] });
  });

  it('fallback do manual não reintroduz tratamento sobre a foto e respeita ajuste solicitado', () => {
    const prompt = montarPromptDoManual({
      brand: marca(),
      estilo: null,
      copy: ['Happy Hour'],
      instrucaoImagem: 'Remova o copo vazio',
    });
    expect(prompt).not.toMatch(/degrad|gradiente|halo|véu/i);
    expect(prompt).toContain('Remova o copo vazio');
    expect(prompt).toContain('Happy Hour');
    expect(prompt).toContain('regiões calmas');
  });

  it('fallback descreve o manual quando a referência não foi enviada ao gerador', () => {
    expect(portaDoFallback('referencia', true)).toBe('manual');
    expect(portaDoFallback('referencia', false)).toBe('referencia');
    expect(portaDoFallback('manual', false)).toBe('manual');
  });
});
