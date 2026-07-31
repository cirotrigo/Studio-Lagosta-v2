import { CANVAS_MARGIN } from './canvas-margin'

/**
 * Geometria da interface (chrome) do story do Instagram, em pixels de uma arte
 * 1080x1920 — a base da máscara de referência do editor (tecla `M`).
 *
 * ## O contrato: o chrome cabe DENTRO das margens de segurança
 *
 * A máscara é derivada de `CANVAS_MARGIN`: o cabeçalho vive inteiro acima da
 * guia superior e a caixa de mensagem inteira abaixo da inferior. Isso torna as
 * duas referências uma coisa só — **conteúdo dentro das guias azuis é conteúdo
 * que a interface não cobre**. Mexeu na margem, a máscara acompanha sozinha.
 *
 * Foi uma decisão de projeto, não uma medição: os guias de "safe zone" pregam
 * 250px no topo e na base, mas isso é recomendação conservadora, com folga
 * embutida — não a extensão real do chrome. Na tela o cabeçalho ocupa bem
 * menos, entre outras razões porque numa tela 19,5:9 a arte 9:16 é escalada
 * para preencher a altura e a interface, ancorada nas bordas da TELA, cobre uma
 * fatia menor da ARTE do que o mapeamento ingênuo sugere.
 *
 * ## Confiança dos números
 *
 * O Instagram não publica a geometria da interface, e ela varia por aparelho.
 * As proporções abaixo vêm do layout do app iOS (escalado por 1080/390 ≈ 2,77)
 * e foram comprimidas para caber nas faixas das margens. Serve para posicionar
 * arte; não serve como especificação do app.
 *
 * ## Escala
 *
 * Tudo é expresso na base 1080x1920 e multiplicado por `canvasWidth / 1080` no
 * consumidor. Só faz sentido em canvas 9:16 — use `isStoryRatio()` antes.
 */

export const STORY_REFERENCE_WIDTH = 1080
export const STORY_REFERENCE_HEIGHT = 1920

/** Distância das bordas laterais. O chrome do Instagram encosta bem mais na
 *  borda que o conteúdo (70px), e é isso mesmo: ele só ocupa a faixa externa. */
const EDGE = 28

export type StoryChrome = ReturnType<typeof buildStoryChrome>

/**
 * Monta a geometria para uma arte de altura `baseHeight` (na base 1080 de
 * largura). As frações verticais são sobre a faixa da margem, então o desenho
 * encolhe e cresce junto com `CANVAS_MARGIN`.
 */
export function buildStoryChrome(baseHeight: number = STORY_REFERENCE_HEIGHT) {
  const topBand = CANVAS_MARGIN.top
  const bottomBand = CANVAS_MARGIN.bottom

  // Cabeçalho: barra de progresso em cima, linha do perfil embaixo
  const headerCy = topBand * 0.62
  const avatarRadius = topBand * 0.3

  // Rodapé: a pílula centrada na faixa, com um respiro maior embaixo
  const replyHeight = bottomBand * 0.68
  const replyCy = baseHeight - bottomBand * 0.54

  return {
    /** Barra de progresso: um segmento por story da sequência. */
    progressBar: {
      x: EDGE,
      y: topBand * 0.13,
      width: STORY_REFERENCE_WIDTH - EDGE * 2,
      height: Math.max(4, topBand * 0.042),
      segments: 3,
      gap: 10,
      /** Índice do segmento "atual" (cheio); os demais ficam translúcidos. */
      activeIndex: 0,
    },
    /** Foto de perfil — círculo. */
    avatar: {
      cx: EDGE + avatarRadius,
      cy: headerCy,
      radius: avatarRadius,
      /** Fração do diâmetro ocupada pela logo dentro do círculo. */
      logoFit: 0.76,
    },
    username: {
      x: EDGE + avatarRadius * 2 + topBand * 0.18,
      cy: headerCy,
      fontSize: topBand * 0.27,
    },
    timestamp: {
      text: '2 h',
      fontSize: topBand * 0.23,
      /** Espaço entre o fim do @ e o horário. */
      gap: topBand * 0.15,
    },
    /** "..." do menu de opções. */
    moreIcon: {
      cx: STORY_REFERENCE_WIDTH - EDGE - 122,
      cy: headerCy,
      dotRadius: Math.max(4, topBand * 0.042),
      dotGap: topBand * 0.13,
    },
    /** "✕" de fechar. */
    closeIcon: {
      cx: STORY_REFERENCE_WIDTH - EDGE - 26,
      cy: headerCy,
      size: topBand * 0.32,
    },
    /** Caixa "Enviar mensagem". */
    replyBox: {
      x: EDGE,
      y: replyCy - replyHeight / 2,
      width: 800,
      height: replyHeight,
      paddingX: 34,
      fontSize: bottomBand * 0.3,
      placeholder: 'Enviar mensagem',
    },
    heartIcon: {
      cx: 900,
      cy: replyCy,
      size: bottomBand * 0.52,
    },
    shareIcon: {
      cx: STORY_REFERENCE_WIDTH - EDGE - 40,
      cy: replyCy,
      size: bottomBand * 0.52,
    },
  }
}

/** Ícones em viewBox 24x24, desenhados com traço (como os do Instagram). */
export const STORY_ICON_PATHS = {
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  share: 'M22 2 11 13M22 2l-7 20-4-9-9-4Z',
  close: 'M18 6 6 18M6 6l12 12',
} as const

const STORY_RATIO = 9 / 16

/**
 * A máscara só descreve o story. Num canvas de feed (4:5) ou quadrado a
 * interface do Instagram é outra, e mostrar esta seria pior que não mostrar
 * nada.
 */
export function isStoryRatio(width: number, height: number, tolerance = 0.02): boolean {
  if (!width || !height) return false
  return Math.abs(width / height - STORY_RATIO) <= tolerance
}
