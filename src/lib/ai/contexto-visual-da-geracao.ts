import type { BrandContext } from '@/lib/brand/brand-context';

export const VERSAO_DO_CONTEXTO_VISUAL = '2026-09-08.1';

export interface ResolucaoVisual {
  versao: string;
  escopo: 'geracao';
  ativo: boolean;
  ajustes: Array<{
    fonte: string;
    trecho: string;
    decisao: 'suprimido' | 'revisao';
    motivo: string;
  }>;
}

const EFEITO = /\b(?:halo|v[ée]u|degrad[êe]?|gradiente|vinheta)\b|escurec/i;
const FOTO =
  /foto|imagem|fundo|leitura|luminos|luz|escuro|atr[aá]s\s+d[oa]s?\s+(?:blocos?\s+de\s+)?textos?/i;
const NEGACAO = /\b(?:sem|n[aã]o|nunca|evit\w*|proibid\w*)\b/i;
const CONTEUDO =
  /hor[aá]rio|endere[cç]o|pre[cç]o|telefone|\bcopy\b|\d|texto exato|verbatim/i;
// "Gradiente de leitura" pode nomear hierarquia, não um efeito de imagem.
// Uma mesma oração também pode descrever layout e foto; nesses casos não a cortar.
const DIRECAO_MISTA =
  /hierarquia|pr[eé]-t[ií]tulo|manchete|serifa|grotesk|tipograf|\bfonte\b|\blogo\b|\blayout\b|alinhamento|alinhad/i;

/**
 * Resolve apenas descrições estéticas herdadas de tratamento fotográfico.
 * Copy, pedido, fatos, regras explícitas e efeitos tipográficos não são editados.
 * Frases ambíguas permanecem e são apontadas para revisão do cadastro.
 */
export function resolverContextoVisualDaGeracao(
  brand: BrandContext | null,
  ativo = true
): {
  brand: BrandContext | null;
  resolucao: ResolucaoVisual;
} {
  const resolucao: ResolucaoVisual = {
    versao: VERSAO_DO_CONTEXTO_VISUAL,
    escopo: 'geracao',
    ativo,
    ajustes: [],
  };
  if (!brand || !ativo) return { brand, resolucao };
  const anotar = (
    fonte: string,
    trecho: string,
    decisao: 'suprimido' | 'revisao',
    motivo: string
  ) => {
    resolucao.ajustes.push({
      fonte,
      trecho: trecho.slice(0, 400),
      decisao,
      motivo,
    });
  };
  const filtrar = (
    texto: string | null | undefined,
    fonte: string
  ): string | null => {
    if (!texto) return texto ?? null;
    // A oração é a unidade: não apagar uma seção inteira por uma observação de foto.
    const trechos = texto.split(/(?<=[.;!?])\s+|\n+|,\s+(?=[a-záéíóúç])/);
    let mudou = false;
    const mantidos = trechos.filter((trecho) => {
      if (!EFEITO.test(trecho)) return true;
      if (
        NEGACAO.test(trecho) ||
        CONTEUDO.test(trecho) ||
        DIRECAO_MISTA.test(trecho) ||
        !FOTO.test(trecho)
      ) {
        anotar(
          fonte,
          trecho,
          'revisao',
          'Menção preservada: proibição, conteúdo ou efeito de escopo ambíguo'
        );
        return true;
      }
      mudou = true;
      anotar(
        fonte,
        trecho,
        'suprimido',
        'Tratamento herdado da fotografia não governa a geração'
      );
      return false;
    });
    return mudou
      ? mantidos.map((t) => (/[.;!?]$/.test(t) ? t : `${t}.`)).join(' ')
      : texto;
  };
  const dna = {
    ...brand.dna,
    visualStyle: filtrar(brand.dna.visualStyle, 'dna.visualStyle'),
    composition: filtrar(brand.dna.composition, 'dna.composition'),
  };
  for (const trecho of (brand.dna.contentRules ?? '').split(/\n+/)) {
    if (EFEITO.test(trecho))
      anotar(
        'dna.contentRules',
        trecho,
        'revisao',
        'Regra explícita: mantida integralmente'
      );
  }
  let estiloDasReferencias = brand.estiloDasReferencias;
  if (estiloDasReferencias) {
    if (estiloDasReferencias.tratamentoDaFoto?.trim()) {
      anotar(
        'estilo.tratamentoDaFoto',
        estiloDasReferencias.tratamentoDaFoto,
        'suprimido',
        'Campo fotográfico histórico, não instrução para esta peça'
      );
    }
    estiloDasReferencias = {
      ...estiloDasReferencias,
      tratamentoDaFoto: '',
      resumo: filtrar(estiloDasReferencias.resumo, 'estilo.resumo') ?? '',
      diagramacao:
        filtrar(estiloDasReferencias.diagramacao, 'estilo.diagramacao') ?? '',
    };
  }
  return { brand: { ...brand, dna, estiloDasReferencias }, resolucao };
}

/** As imagens efetivamente enviadas determinam o molde do fallback. */
export function portaDoFallback(
  porta: 'manual' | 'referencia',
  referenciaSoParaODiretor: boolean
): 'manual' | 'referencia' {
  return porta === 'referencia' && referenciaSoParaODiretor ? 'manual' : porta;
}
