/**
 * Combinações de fontes (estilo Canva) — composições tipográficas prontas
 * que usam as fontes da marca do projeto (título + corpo).
 *
 * Cada layout define elementos com papel 'title' ou 'body'; na aplicação,
 * o papel é resolvido para a família de fonte da marca correspondente.
 * Os tamanhos são proporcionais à largura do canvas (base 1080px).
 */

export type FontComboRole = 'title' | 'body'

export interface FontComboElement {
  id: string
  label: string
  role: FontComboRole
  text: string
  /** Tamanho da fonte em px na base 1080 de largura de canvas */
  fontSize: number
  fontWeight: string
  fontStyle?: 'normal' | 'italic'
  textTransform?: 'none' | 'uppercase'
  letterSpacing?: number
  lineHeight: number
  /** Espaço (px, base 1080) entre este elemento e o anterior */
  spacingBefore?: number
}

export interface FontComboLayout {
  id: string
  name: string
  elements: FontComboElement[]
}

/** Largura de referência para os tamanhos definidos nos layouts */
export const COMBO_BASE_CANVAS_WIDTH = 1080

export const FONT_COMBO_LAYOUTS: FontComboLayout[] = [
  {
    id: 'titulo-detalhes',
    name: 'Título + detalhes',
    elements: [
      {
        id: 'titulo',
        label: 'Título',
        role: 'title',
        text: 'Sabor\nde Verdade',
        fontSize: 110,
        fontWeight: '700',
        lineHeight: 1.02,
        textTransform: 'none',
      },
      {
        id: 'detalhes',
        label: 'Detalhes',
        role: 'body',
        text: 'Terça a domingo, a partir das 18h.\nRua da Praça, 123 — Centro.\nReserve pelo direct.',
        fontSize: 26,
        fontWeight: '500',
        letterSpacing: 3,
        lineHeight: 1.5,
        textTransform: 'uppercase',
        spacingBefore: 36,
      },
    ],
  },
  {
    id: 'marca-tagline',
    name: 'Marca + tagline',
    elements: [
      {
        id: 'pretitulo',
        label: 'Pré-título',
        role: 'body',
        text: 'Desde 1990',
        fontSize: 28,
        fontWeight: '600',
        letterSpacing: 6,
        lineHeight: 1.2,
        textTransform: 'uppercase',
      },
      {
        id: 'titulo',
        label: 'Título',
        role: 'title',
        text: 'Casa do\nSabor',
        fontSize: 120,
        fontWeight: '800',
        lineHeight: 1.0,
        textTransform: 'uppercase',
        spacingBefore: 20,
      },
      {
        id: 'tagline',
        label: 'Tagline',
        role: 'body',
        text: 'Nossa melhor tradição',
        fontSize: 30,
        fontWeight: '400',
        lineHeight: 1.3,
        spacingBefore: 24,
      },
    ],
  },
  {
    id: 'assinatura',
    name: 'Nome + assinatura',
    elements: [
      {
        id: 'nome',
        label: 'Nome',
        role: 'title',
        text: 'Maria Silva',
        fontSize: 88,
        fontWeight: '500',
        letterSpacing: 14,
        lineHeight: 1.15,
        textTransform: 'uppercase',
      },
      {
        id: 'cargo',
        label: 'Cargo',
        role: 'body',
        text: 'Chef de cozinha',
        fontSize: 26,
        fontWeight: '400',
        letterSpacing: 8,
        lineHeight: 1.3,
        textTransform: 'uppercase',
        spacingBefore: 28,
      },
    ],
  },
  {
    id: 'citacao',
    name: 'Citação',
    elements: [
      {
        id: 'frase',
        label: 'Frase',
        role: 'title',
        text: 'Cozinhar é um ato\nde amor.',
        fontSize: 76,
        fontWeight: '600',
        fontStyle: 'italic',
        lineHeight: 1.25,
      },
      {
        id: 'autor',
        label: 'Autor',
        role: 'body',
        text: '— Equipe da casa',
        fontSize: 28,
        fontWeight: '500',
        letterSpacing: 2,
        lineHeight: 1.3,
        spacingBefore: 32,
      },
    ],
  },
  {
    id: 'promo-impacto',
    name: 'Promoção',
    elements: [
      {
        id: 'chamada',
        label: 'Chamada',
        role: 'body',
        text: 'Só nesta semana',
        fontSize: 30,
        fontWeight: '600',
        letterSpacing: 4,
        lineHeight: 1.2,
        textTransform: 'uppercase',
      },
      {
        id: 'oferta',
        label: 'Oferta',
        role: 'title',
        text: 'Happy Hour\nem Dobro',
        fontSize: 112,
        fontWeight: '800',
        lineHeight: 1.05,
        spacingBefore: 22,
      },
      {
        id: 'cta',
        label: 'CTA',
        role: 'body',
        text: 'Chame no direct e garanta sua mesa',
        fontSize: 28,
        fontWeight: '500',
        lineHeight: 1.4,
        spacingBefore: 30,
      },
    ],
  },
  {
    id: 'convite',
    name: 'Convite',
    elements: [
      {
        id: 'abertura',
        label: 'Abertura',
        role: 'body',
        text: 'Venha conhecer o',
        fontSize: 32,
        fontWeight: '400',
        lineHeight: 1.3,
      },
      {
        id: 'destaque',
        label: 'Destaque',
        role: 'title',
        text: 'Novo cardápio',
        fontSize: 104,
        fontWeight: '700',
        lineHeight: 1.1,
        spacingBefore: 16,
      },
      {
        id: 'info',
        label: 'Informações',
        role: 'body',
        text: 'Pratos e bebidas do nosso\ncardápio de verão',
        fontSize: 28,
        fontWeight: '400',
        letterSpacing: 1,
        lineHeight: 1.5,
        spacingBefore: 30,
      },
    ],
  },
]

export interface FontComboPair {
  /** Família aplicada aos elementos com papel 'title' */
  title: string
  /** Família aplicada aos elementos com papel 'body' */
  body: string
}

export function resolveComboFontFamily(role: FontComboRole, pair: FontComboPair): string {
  return role === 'title' ? pair.title : pair.body
}

/** Altura estimada de um elemento (nº de linhas × fontSize × lineHeight) */
export function estimateComboElementHeight(element: FontComboElement, scale: number): number {
  const lines = element.text.split('\n').length
  return Math.round(element.fontSize * scale * element.lineHeight * lines)
}
