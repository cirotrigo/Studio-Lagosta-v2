/**
 * Combinações de fontes — composições tipográficas prontas que usam as fontes
 * da marca do projeto (título + corpo).
 *
 * Os seis modelos aqui são o ponto de partida: no primeiro acesso de cada
 * projeto eles são copiados para o banco (tabela FontCombination), e a partir
 * daí cada marca ajusta o seu sem afetar as outras.
 *
 * Posição e largura são frações do canvas (0..1), então uma combinação salva
 * num story 1080x1920 continua coerente num post 1080x1350. Tamanhos de fonte
 * seguem em px na base de 1080 de largura.
 */

export type FontComboRole = 'title' | 'body'

/** Efeitos que sobrevivem à combinação — os que mantêm texto legível sobre foto */
export interface FontComboEffects {
  stroke?: { enabled: boolean; strokeColor: string; strokeWidth: number }
  shadow?: {
    enabled: boolean
    shadowColor: string
    shadowBlur: number
    shadowOffsetX: number
    shadowOffsetY: number
    shadowOpacity: number
  }
  background?: { enabled: boolean; backgroundColor: string; padding: number }
}

export interface FontComboElement {
  id: string
  label: string
  /** Define de qual fonte da marca o elemento herda a família */
  role: FontComboRole
  text: string
  /** px na base 1080 de largura de canvas */
  fontSize: number
  fontWeight: string
  fontStyle?: 'normal' | 'italic'
  textTransform?: 'none' | 'uppercase'
  letterSpacing?: number
  lineHeight: number
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  effects?: FontComboEffects
  /** Posição e largura relativas ao canvas (0..1) */
  x: number
  y: number
  width: number
}

export interface FontComboLayout {
  id: string
  name: string
  elements: FontComboElement[]
}

/** Largura de referência para os tamanhos de fonte */
export const COMBO_BASE_CANVAS_WIDTH = 1080

/** Modelos base, copiados para cada projeto no primeiro acesso */
export const FONT_COMBO_LAYOUTS: FontComboLayout[] =
[
    {
      "id": "titulo-detalhes",
      "name": "Título + detalhes",
      "elements": [
        {
          "id": "titulo",
          "label": "Título",
          "role": "title",
          "text": "Sabor\nde Verdade",
          "fontSize": 110,
          "fontWeight": "700",
          "lineHeight": 1.02,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.704,
          "width": 0.82
        },
        {
          "id": "detalhes",
          "label": "Detalhes",
          "role": "body",
          "text": "Terça a domingo, a partir das 18h.\nRua da Praça, 123 — Centro.\nReserve pelo direct.",
          "fontSize": 26,
          "fontWeight": "500",
          "textTransform": "uppercase",
          "letterSpacing": 3,
          "lineHeight": 1.5,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.839,
          "width": 0.82
        }
      ]
    },
    {
      "id": "marca-tagline",
      "name": "Marca + tagline",
      "elements": [
        {
          "id": "pretitulo",
          "label": "Pré-título",
          "role": "body",
          "text": "Desde 1990",
          "fontSize": 28,
          "fontWeight": "600",
          "textTransform": "uppercase",
          "letterSpacing": 6,
          "lineHeight": 1.2,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.714,
          "width": 0.82
        },
        {
          "id": "titulo",
          "label": "Título",
          "role": "title",
          "text": "Casa do\nSabor",
          "fontSize": 120,
          "fontWeight": "800",
          "textTransform": "uppercase",
          "lineHeight": 1,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.742,
          "width": 0.82
        },
        {
          "id": "tagline",
          "label": "Tagline",
          "role": "body",
          "text": "Nossa melhor tradição",
          "fontSize": 30,
          "fontWeight": "400",
          "lineHeight": 1.3,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.88,
          "width": 0.82
        }
      ]
    },
    {
      "id": "assinatura",
      "name": "Nome + assinatura",
      "elements": [
        {
          "id": "nome",
          "label": "Nome",
          "role": "title",
          "text": "Maria Silva",
          "fontSize": 88,
          "fontWeight": "500",
          "textTransform": "uppercase",
          "letterSpacing": 14,
          "lineHeight": 1.15,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.815,
          "width": 0.82
        },
        {
          "id": "cargo",
          "label": "Cargo",
          "role": "body",
          "text": "Chef de cozinha",
          "fontSize": 26,
          "fontWeight": "400",
          "textTransform": "uppercase",
          "letterSpacing": 8,
          "lineHeight": 1.3,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.882,
          "width": 0.82
        }
      ]
    },
    {
      "id": "citacao",
      "name": "Citação",
      "elements": [
        {
          "id": "frase",
          "label": "Frase",
          "role": "title",
          "text": "Cozinhar é um ato\nde amor.",
          "fontSize": 76,
          "fontWeight": "600",
          "fontStyle": "italic",
          "lineHeight": 1.25,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.766,
          "width": 0.82
        },
        {
          "id": "autor",
          "label": "Autor",
          "role": "body",
          "text": "— Equipe da casa",
          "fontSize": 28,
          "fontWeight": "500",
          "letterSpacing": 2,
          "lineHeight": 1.3,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.881,
          "width": 0.82
        }
      ]
    },
    {
      "id": "promo-impacto",
      "name": "Promoção",
      "elements": [
        {
          "id": "chamada",
          "label": "Chamada",
          "role": "body",
          "text": "Só nesta semana",
          "fontSize": 30,
          "fontWeight": "600",
          "textTransform": "uppercase",
          "letterSpacing": 4,
          "lineHeight": 1.2,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.711,
          "width": 0.82
        },
        {
          "id": "oferta",
          "label": "Oferta",
          "role": "title",
          "text": "Happy Hour\nem Dobro",
          "fontSize": 112,
          "fontWeight": "800",
          "lineHeight": 1.05,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.742,
          "width": 0.82
        },
        {
          "id": "cta",
          "label": "CTA",
          "role": "body",
          "text": "Chame no direct e garanta sua mesa",
          "fontSize": 28,
          "fontWeight": "500",
          "lineHeight": 1.4,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.88,
          "width": 0.82
        }
      ]
    },
    {
      "id": "convite",
      "name": "Convite",
      "elements": [
        {
          "id": "abertura",
          "label": "Abertura",
          "role": "body",
          "text": "Venha conhecer o",
          "fontSize": 32,
          "fontWeight": "400",
          "lineHeight": 1.3,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.751,
          "width": 0.82
        },
        {
          "id": "destaque",
          "label": "Destaque",
          "role": "title",
          "text": "Novo cardápio",
          "fontSize": 104,
          "fontWeight": "700",
          "lineHeight": 1.1,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.781,
          "width": 0.82
        },
        {
          "id": "info",
          "label": "Informações",
          "role": "body",
          "text": "Pratos e bebidas do nosso\ncardápio de verão",
          "fontSize": 28,
          "fontWeight": "400",
          "letterSpacing": 1,
          "lineHeight": 1.5,
          "textAlign": "center",
          "color": "#FFFFFF",
          "x": 0.09,
          "y": 0.856,
          "width": 0.82
        }
      ]
    }
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

/** Altura estimada de um elemento (nº de linhas x fontSize x lineHeight) */
export function estimateComboElementHeight(element: FontComboElement, scale: number): number {
  const lines = element.text.split('\n').length
  return Math.round(element.fontSize * scale * element.lineHeight * lines)
}
