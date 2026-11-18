/**
 * O GERADOR da melhoria de arte (17/11/2026).
 *
 * A melhoria nasceu cravada no gpt-image (`images.edit`), que redesenha a
 * imagem inteira: a foto muda mesmo quando o pedido é só texto, e o que
 * devolve a foto (`preservar-foto.ts`) recusa elemento gráfico novo. O Nano
 * Banana edita mantendo o resto, e com ele a recomposição é por zona
 * (`recompor-por-zona.ts`).
 *
 * A escolha vem de `MELHORIA_GERADOR` (`openai` | `gemini`). O padrão é
 * `openai`: nada muda em produção até a variável ser ligada. Mesmo prompt
 * (o do diretor de arte) e mesmas imagens de entrada nos dois.
 */

import { getCurrentImageModel, improveCreative, promptDaMelhoria, type ImproveCreativeOptions } from './openai-image-client'
import { generateImageWithGemini, idDoModeloGemini, type GeminiImageModel } from './gemini-image-client'
import { inferFormatFromDimensions, type ImprovementFormat } from './creative-improvement-format'

export type GeradorDaMelhoria = 'openai' | 'gemini'

/** O Nano Banana da melhoria. Id confirmado na listagem da API em 17/11/2026. */
const MODELO_GEMINI: GeminiImageModel = 'nano-banana-2.1'

const PROPORCAO: Record<ImprovementFormat, string> = { STORY: '9:16', FEED_PORTRAIT: '4:5', SQUARE: '1:1' }

export function geradorDaMelhoria(valor: string | undefined = process.env.MELHORIA_GERADOR): GeradorDaMelhoria {
  return valor?.trim().toLowerCase() === 'gemini' ? 'gemini' : 'openai'
}

/** O modelo que o gerador chama, para o registro da Generation. */
export function modeloDaMelhoria(gerador: GeradorDaMelhoria = geradorDaMelhoria()): string {
  return gerador === 'gemini' ? idDoModeloGemini(MODELO_GEMINI) : getCurrentImageModel()
}

/**
 * Gera a peça melhorada no gerador escolhido. Devolve a imagem como o gerador
 * a entregou: o Gemini devolve em 2K na proporção pedida (1536x2752 no story),
 * e quem alinha ao tamanho da arte é a recomposição.
 */
export async function gerarMelhoria(gerador: GeradorDaMelhoria, opcoes: ImproveCreativeOptions): Promise<Buffer> {
  if (gerador === 'openai') return improveCreative(opcoes)

  const prompt = promptDaMelhoria(opcoes)
  opcoes.aoMontarPrompt?.(prompt)
  const [largura, altura] = opcoes.size.split('x').map(Number)
  const referencias = opcoes.references ?? []
  const r = await generateImageWithGemini({
    model: MODELO_GEMINI,
    prompt,
    mode: 'edit',
    // A mesma ordem do `images.edit`: a arte é a IMAGEM 1, as referências vêm depois.
    baseImage: opcoes.imageBuffer,
    baseImageType: opcoes.mimeType,
    referenceImages: referencias.map((ref) => ref.buffer),
    referenceImageTypes: referencias.map((ref) => ref.mimeType),
    aspectRatio: PROPORCAO[inferFormatFromDimensions(largura, altura)],
    resolution: '2K',
    timeoutMs: opcoes.timeoutMs,
  })
  opcoes.aoConcluir?.(r.usage ?? {})
  return r.imageBuffer
}
