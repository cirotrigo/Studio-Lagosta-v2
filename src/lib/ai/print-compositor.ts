/**
 * Composição FIEL de um documento na arte — o papel `documento` (23/08/2026).
 *
 * O problema que este módulo resolve: todos os papéis de referência significam
 * "inspire-se nisto", e o gpt-image REDESENHA o que recebe — é o defeito
 * medido quatro vezes na logo do TERO ("TERRO", "TLRO"). Um print de avaliação
 * do Google redesenhado sai com o nome e as palavras reescritos, perdendo
 * exatamente a verdade que ele carrega. A saída é a mesma da logo
 * (`logo-compositor.ts`): o arquivo NUNCA vai ao modelo — a arte é gerada com
 * uma FAIXA RESERVADA (ver `buildArtePrompt`) e o cartão é colado por código,
 * depois da finalização e ANTES da logo (a logo mede calma/contraste do quadro
 * e, medindo depois da colagem, desvia do cartão sozinha).
 *
 * O cartão sai com cantos arredondados e sombra suave — um documento flutuando
 * sobre a foto, não um retângulo chapado.
 *
 * ⚠️ Armadilha da casa: medição por região no sharp exige materializar o
 * recorte (`.toBuffer()`) — aqui não medimos região nenhuma de propósito: a
 * posição é DETERMINÍSTICA por formato, porque é ela que o prompt reservou.
 * Compor num lugar "mais calmo" que o prometido poria o cartão sobre a copy.
 */

import sharp from 'sharp'

export type FormatoDoCartao = 'story' | 'feed' | 'quadrado'

/** Fração da largura da peça que o cartão ocupa. */
export const LARGURA_DO_CARTAO: Record<FormatoDoCartao, number> = {
  story: 0.78,
  feed: 0.8,
  quadrado: 0.8,
}

/**
 * Onde fica o CENTRO vertical do cartão. Levemente abaixo do meio: o topo é
 * da manchete e o rodapé é do serviço/safe area — a faixa entre os dois é a
 * mais desocupada da diagramação da casa.
 */
export const CENTRO_DO_CARTAO: Record<FormatoDoCartao, number> = {
  story: 0.56,
  feed: 0.55,
  quadrado: 0.55,
}

/** O cartão nunca come mais que isto da altura — sobra espaço para a copy. */
const ALTURA_MAX_FRAC = 0.4

export interface PlanoDoCartao {
  largura: number
  altura: number
  left: number
  top: number
}

/**
 * Decide tamanho e posição do cartão para uma peça `arteW`×`arteH`. É chamada
 * DUAS vezes de propósito — antes do prompt (para reservar a faixa em PIXEL,
 * a lição do "número confere, fração se interpreta" de 17/08) e na composição
 * — e por isso precisa ser determinística.
 */
export async function planejarCartao(
  documento: Buffer,
  arteW: number,
  arteH: number,
  formato: FormatoDoCartao,
): Promise<PlanoDoCartao> {
  const meta = await sharp(documento).metadata()
  if (!meta.width || !meta.height) throw new Error('O documento não tem dimensões legíveis.')
  const aspecto = meta.width / meta.height

  let largura = Math.round(arteW * LARGURA_DO_CARTAO[formato])
  let altura = Math.round(largura / aspecto)
  if (altura > arteH * ALTURA_MAX_FRAC) {
    altura = Math.round(arteH * ALTURA_MAX_FRAC)
    largura = Math.round(altura * aspecto)
    if (largura > arteW * 0.9) {
      largura = Math.round(arteW * 0.9)
      altura = Math.round(largura / aspecto)
    }
  }

  let top = Math.round(arteH * CENTRO_DO_CARTAO[formato] - altura / 2)
  // Em story o último 1/8 é a safe area do Instagram — mesmo limite do texto.
  const baseMax = formato === 'story' ? Math.round((arteH * 7) / 8) : Math.round(arteH * 0.96)
  if (top + altura > baseMax) top = baseMax - altura
  if (top < Math.round(arteH * 0.2)) top = Math.round(arteH * 0.2)

  return { largura, altura, left: Math.round((arteW - largura) / 2), top }
}

/**
 * Cola o documento na arte, tal e qual — cantos arredondados + sombra.
 * Devolve JPEG (o formato de publicação da trilha `arte`).
 */
export async function comporDocumento(
  arte: Buffer,
  documento: Buffer,
  { formato }: { formato: FormatoDoCartao },
): Promise<{ buffer: Buffer; plano: PlanoDoCartao }> {
  const meta = await sharp(arte).metadata()
  if (!meta.width || !meta.height) throw new Error('A arte não tem dimensões legíveis.')
  const plano = await planejarCartao(documento, meta.width, meta.height, formato)

  const raio = Math.max(12, Math.round(plano.largura * 0.028))

  // O cartão: redimensionado exato + máscara de cantos arredondados (dest-in).
  const redimensionado = await sharp(documento)
    .resize(plano.largura, plano.altura, { fit: 'fill' })
    .png()
    .toBuffer()
  const mascara = Buffer.from(
    `<svg width="${plano.largura}" height="${plano.altura}"><rect width="${plano.largura}" height="${plano.altura}" rx="${raio}" ry="${raio}" fill="#fff"/></svg>`,
  )
  const cartao = await sharp(redimensionado)
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer()

  // A sombra: o mesmo retângulo em preto meio-transparente, borrado e
  // deslocado um pouco para baixo — o que faz o cartão "flutuar".
  const margem = raio * 3
  const sombraSvg = Buffer.from(
    `<svg width="${plano.largura + margem * 2}" height="${plano.altura + margem * 2}"><rect x="${margem}" y="${margem}" width="${plano.largura}" height="${plano.altura}" rx="${raio}" ry="${raio}" fill="rgba(0,0,0,0.45)"/></svg>`,
  )
  const sombra = await sharp(sombraSvg).png().blur(Math.max(8, Math.round(raio * 0.9))).toBuffer()

  const buffer = await sharp(arte)
    .composite([
      {
        input: sombra,
        left: plano.left - margem,
        top: plano.top - margem + Math.round(raio * 0.7),
      },
      { input: cartao, left: plano.left, top: plano.top },
    ])
    .jpeg({ quality: 92 })
    .toBuffer()

  return { buffer, plano }
}
