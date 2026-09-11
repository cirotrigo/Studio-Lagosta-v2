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

/**
 * Papel tipográfico do elemento. 'subtitle' é opcional na marca: quando o
 * projeto não define uma fonte própria de subtítulo, ele cai na do corpo —
 * marcas de duas fontes não precisam repetir nada.
 */
export type FontComboRole = 'title' | 'subtitle' | 'body'

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

/**
 * Ícone à esquerda de um texto da combinação (o alfinete do local, o relógio
 * do horário). Medidas em px na base de 1080 de largura, relativas ao canto
 * superior esquerdo da caixa do texto — o ícone acompanha o texto em qualquer
 * formato e na pilha da combinação.
 */
export interface FontComboIcon {
  url: string
  width: number
  height: number
  offsetX: number
  offsetY: number
}

/**
 * Papel SEMÂNTICO do texto para o compositor — outra coisa que o `role`
 * tipográfico, que só diz de qual fonte da marca a família vem. Com papel, a
 * combinação vira bloco da usina: a manchete da copy entra no texto `headline`,
 * o horário no `servico`. Combinação com texto sem papel não entra no compositor.
 */
export type PapelDaCombinacao = 'pre' | 'headline' | 'headline2' | 'apoio' | 'cta' | 'servico'

/** De que lado do texto o elemento gráfico fica. */
export type LadoDoOrnamento = 'antes' | 'depois' | 'acima' | 'abaixo'

/** Em `acima`/`abaixo`, a que borda do texto o elemento se alinha. */
export type EixoDoOrnamento = 'inicio' | 'centro' | 'fim'

/**
 * Elemento gráfico preso a um texto da combinação, além do ícone: o filete sob
 * a manchete, o selo depois do preço, o ornamento acima do pré-título. Medidas
 * em px na base de 1080 de largura, relativas à caixa do texto:
 * - `antes`: x a partir da borda ESQUERDA da caixa, y a partir do topo (como o ícone);
 * - `depois`: x a partir da borda DIREITA, y a partir do topo;
 * - `acima`: y a partir do topo, x a partir da borda do `eixo`;
 * - `abaixo`: y a partir da BASE, x a partir da borda do `eixo`.
 * Preso à borda certa, o elemento acompanha o texto quando ele cresce.
 */
export interface FontComboOrnamento {
  /** A imagem do elemento (ícone, selo, a logo). Ausente quando o elemento é uma forma do editor. */
  url?: string
  /**
   * A camada de uma forma do editor (o filete é uma `shape` de linha), sem id,
   * posição e tamanho — é copiada ao aplicar.
   */
  camada?: Record<string, unknown>
  /** O elemento é a LOGO da marca, presa ao texto: a peça não põe outra logo no canto. */
  logo?: boolean
  /** A caixa VISÍVEL do elemento (px na base de 1080) — já girada, quando a camada gira. */
  width: number
  height: number
  lado: LadoDoOrnamento
  eixo?: EixoDoOrnamento
  offsetX: number
  offsetY: number
  /** Camada girada ou forma: o tamanho sem giro (px na base de 1080). */
  tamanhoDaCamada?: { width: number; height: number }
  /** Onde a posição da camada fica em relação à caixa visível (px na base de 1080) — o giro do Konva é em torno da origem. */
  ajuste?: { x: number; y: number }
}

/** O estilo da palavra marcada com [colchetes] — o trecho do rich text que difere do resto. */
export interface FontComboDestaque {
  fill?: string
  fontFamily?: string
  fontStyle?: string
  textDecoration?: string
}

export interface FontComboElement {
  id: string
  label: string
  /** Define de qual fonte da marca o elemento herda a família */
  role: FontComboRole
  /**
   * Família específica escolhida pelo usuário. Só é gravada quando difere da
   * fonte da marca daquele papel — assim uma combinação que usa a fonte da
   * marca continua acompanhando quando a marca troca de fonte, e uma escolha
   * deliberada é preservada.
   */
  fontFamily?: string
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
  /** Posição e tamanho relativos ao canvas (0..1) */
  x: number
  y: number
  width: number
  /**
   * Altura da caixa. Opcional para combinações salvas antes deste campo —
   * nesses casos cai na estimativa por linhas.
   */
  height?: number
  /** Inclinação em graus */
  rotation?: number
  /** Ícone ao lado do texto; vira uma camada de imagem ao aplicar */
  icon?: FontComboIcon
  /** Papel do texto para o compositor */
  papel?: PapelDaCombinacao
  /** Elementos gráficos presos ao texto, além do ícone */
  ornamentos?: FontComboOrnamento[]
  /** Estilo da palavra marcada com [colchetes] no texto */
  destaque?: FontComboDestaque
  /**
   * Altura do canvas em que a combinação foi salva (px). As posições são
   * frações, e o compositor precisa do ritmo vertical em px: a mesma fração num
   * feed achataria os vãos de uma combinação desenhada num story.
   */
  alturaDeBase?: number
}

/** Onde o elemento gráfico fica, dada a caixa FINAL do texto (px) e a escala da base 1080. */
export function caixaDoOrnamento(
  o: FontComboOrnamento,
  texto: { x: number; y: number; width: number; height: number },
  escala: number,
): { x: number; y: number; width: number; height: number } {
  const w = o.width * escala
  const h = o.height * escala
  const dx = o.offsetX * escala
  const dy = o.offsetY * escala
  let x: number
  let y: number
  if (o.lado === 'antes') {
    x = texto.x + dx
    y = texto.y + dy
  } else if (o.lado === 'depois') {
    x = texto.x + texto.width + dx
    y = texto.y + dy
  } else {
    const eixo = o.eixo ?? 'inicio'
    x = eixo === 'inicio' ? texto.x + dx : eixo === 'centro' ? texto.x + texto.width / 2 + dx - w / 2 : texto.x + texto.width + dx - w
    y = o.lado === 'acima' ? texto.y + dy : texto.y + texto.height + dy
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }
}

/** A caixa visível de uma camada girada em torno da própria origem (a regra do Konva). */
export function caixaVisivel(l: {
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  rotation?: number
}): { x: number; y: number; width: number; height: number } {
  const x = l.position?.x ?? 0
  const y = l.position?.y ?? 0
  const w = l.size?.width ?? 0
  const h = l.size?.height ?? 0
  const graus = l.rotation ?? 0
  if (!graus) return { x, y, width: w, height: h }
  const r = (graus * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const xs = [0, w * cos, -h * sin, w * cos - h * sin].map((d) => x + d)
  const ys = [0, w * sin, h * cos, w * sin + h * cos].map((d) => y + d)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

/**
 * A camada de um elemento na caixa visível que `caixaDoOrnamento` calculou: a
 * forma volta do molde, a imagem e a logo do arquivo. A mesma conta serve ao
 * editor, ao aplicar a combinação, e ao compositor, ao montar a peça.
 */
export function camadaDoOrnamento(
  o: FontComboOrnamento,
  caixa: { x: number; y: number; width: number; height: number },
  escala: number,
  base: { id: string; name: string; metadata?: Record<string, unknown> },
): Layer {
  const position = {
    x: Math.round(caixa.x + (o.ajuste?.x ?? 0) * escala),
    y: Math.round(caixa.y + (o.ajuste?.y ?? 0) * escala),
  }
  const size = o.tamanhoDaCamada
    ? {
        width: Math.max(1, Math.round(o.tamanhoDaCamada.width * escala)),
        height: Math.max(1, Math.round(o.tamanhoDaCamada.height * escala)),
      }
    : { width: Math.max(1, Math.round(caixa.width)), height: Math.max(1, Math.round(caixa.height)) }
  const comum = {
    id: base.id,
    name: base.name,
    visible: true,
    locked: false,
    order: 0,
    position,
    size,
    ...(base.metadata ? { metadata: base.metadata } : {}),
  }
  if (o.camada) return { rotation: 0, ...o.camada, ...comum } as unknown as Layer
  return {
    ...comum,
    type: o.logo ? 'logo' : 'image',
    rotation: 0,
    fileUrl: o.url,
    style: { objectFit: 'contain' },
  } as unknown as Layer
}

type Layer = import('@/types/template').Layer

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
  /** Família de subtítulo. Ausente = a marca usa a do corpo também no subtítulo */
  subtitle?: string | null
}

export function resolveComboFontFamily(role: FontComboRole, pair: FontComboPair): string {
  if (role === 'title') return pair.title
  if (role === 'subtitle') return pair.subtitle || pair.body
  return pair.body
}

/** Altura estimada de um elemento (nº de linhas x fontSize x lineHeight) */
export function estimateComboElementHeight(element: FontComboElement, scale: number): number {
  const lines = element.text.split('\n').length
  return Math.round(element.fontSize * scale * element.lineHeight * lines)
}
