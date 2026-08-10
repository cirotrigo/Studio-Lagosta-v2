/**
 * QA da arte gerada, ALÉM da verificação de texto (Fase 4 do plano
 * docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md).
 *
 * A verificação existente responde "os textos certos estão na peça?".
 * Faltavam três perguntas que reprovam arte com o texto todo correto:
 *
 * 1. **A proporção bate?** — e esta é a que mais machuca em silêncio. O runner
 *    finaliza com `sharp().resize(w, h, { fit: 'cover' })`: se o modelo devolve
 *    uma proporção diferente da pedida, o `cover` CORTA para caber, sem erro e
 *    sem aviso. Numa peça 4:5 gerada como 1:1, o corte come ~20% da altura —
 *    exatamente onde mora o bloco de texto. Por isso a regra do plano:
 *    **assert de proporção, nunca resize de proporção errada.**
 * 2. **Dá para ler?** — contraste do texto contra a foto.
 * 3. **Algum texto está cortado na borda?** — o modelo às vezes encosta ou
 *    sangra a última linha.
 *
 * As duas últimas são perguntas de VISÃO, e visão fora do ar nunca derruba a
 * peça: sem resposta, a arte passa com o motivo registrado. Arte imperfeita é
 * editável; arte descartada por soluço de API é trabalho jogado fora — a mesma
 * escolha que o pipeline de melhoria já faz para a checagem de texto.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import sharp from 'sharp'

/** Modelo de visão barato — é inspeção, não raciocínio. */
const VISION_MODEL = 'gpt-4o-mini'

/**
 * Tolerância da proporção, em fração do aspect ratio pedido.
 *
 * 2% cobre o arredondamento dos tamanhos nativos (o gpt-image-2 exige lados
 * múltiplos de 16, então 1088×1360 é 0,8 e 1088×1936 é 0,5620 contra os 0,5625
 * de 9:16) sem deixar passar troca real de formato — 4:5 contra 1:1 é 25% de
 * desvio, 9:16 contra 4:5 é 42%.
 */
export const ASPECT_TOLERANCE = 0.02

export interface AspectCheck {
  ok: boolean
  /** Proporção largura/altura recebida. */
  encontrada: number
  /** Proporção largura/altura pedida. */
  esperada: number
  /** Desvio relativo (0,25 = 25% fora). */
  desvio: number
  largura: number
  altura: number
}

/**
 * Compara a proporção do buffer com a pedida. NÃO redimensiona nada — quem
 * decide o que fazer com o desvio é o chamador, e a única decisão correta para
 * desvio grande é gerar de novo, não cortar.
 */
export async function checarProporcao(
  buffer: Buffer,
  alvo: { width: number; height: number },
): Promise<AspectCheck> {
  const meta = await sharp(buffer).metadata()
  const largura = meta.width ?? 0
  const altura = meta.height ?? 0
  const esperada = alvo.width / alvo.height

  if (!largura || !altura) {
    // Sem metadados não dá para afirmar que está errado — e reprovar por isso
    // derrubaria arte boa. Passa, com os números zerados para o registro.
    return { ok: true, encontrada: 0, esperada, desvio: 0, largura, altura }
  }

  const encontrada = largura / altura
  const desvio = Math.abs(encontrada - esperada) / esperada
  return { ok: desvio <= ASPECT_TOLERANCE, encontrada, esperada, desvio, largura, altura }
}

const qaSchema = z.object({
  legivel: z
    .boolean()
    .describe('true se TODO o texto tem contraste suficiente para ser lido no celular, sem esforço'),
  textoCortado: z
    .boolean()
    .describe('true se qualquer letra, palavra ou linha está cortada, sangrando ou encostando na borda do quadro'),
  problemas: z
    .array(z.string())
    .describe('Cada defeito em uma frase curta e concreta. Lista vazia quando a peça está boa.'),
})

export type QAVisual = z.infer<typeof qaSchema>

export interface QAResult {
  /** false só quando a visão respondeu E apontou defeito. */
  aprovada: boolean
  /** true quando a visão não pôde ser consultada — a peça passa assim mesmo. */
  pulada: boolean
  motivo?: string
  detalhe?: QAVisual
}

/**
 * Inspeciona a arte por visão. Só faz sentido em peça COM texto — foto pura
 * (capa de carrossel, trilha `imagem`) não tem o que ficar ilegível.
 */
export async function inspecionarArte(buffer: Buffer): Promise<QAResult> {
  try {
    const { object } = await generateObject({
      model: openai(VISION_MODEL),
      temperature: 0,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(40_000),
      schema: qaSchema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: buffer },
            {
              type: 'text',
              text: [
                'Você é o revisor de qualidade de uma agência. Inspecione esta arte de Instagram e responda apenas sobre EXECUÇÃO, não sobre gosto.',
                '',
                'LEGIBILIDADE: todo texto se lê sem esforço numa tela de celular? Texto claro sobre foto clara, ou escuro sobre escuro, reprova.',
                'CORTE: alguma letra, palavra ou linha está cortada pela borda, sangrando para fora ou encostada nela?',
                '',
                'Não reclame de gosto: escolha de cor, layout, enquadramento e estilo NÃO são defeito.',
                'Não invente defeito. Se a peça está boa, devolva legivel=true, textoCortado=false e a lista de problemas vazia.',
              ].join('\n'),
            },
          ],
        },
      ],
    })

    const aprovada = object.legivel && !object.textoCortado
    return { aprovada, pulada: false, detalhe: object }
  } catch (error) {
    // Visão indisponível nunca derruba a peça — mesmo contrato da checagem de
    // texto no runner de melhoria.
    const motivo = error instanceof Error ? error.message : String(error)
    console.warn('[qa] visão indisponível — arte segue sem inspeção:', motivo)
    return { aprovada: true, pulada: true, motivo: `visão indisponível: ${motivo}` }
  }
}

/** Resumo curto do QA para o log e para o `fieldValues`. */
export function resumirQA(aspecto: AspectCheck, visual: QAResult | null): string {
  const partes: string[] = []
  partes.push(
    aspecto.ok
      ? `proporção ok (${aspecto.largura}x${aspecto.altura})`
      : `proporção FORA: ${aspecto.largura}x${aspecto.altura} = ${aspecto.encontrada.toFixed(3)} contra ${aspecto.esperada.toFixed(3)} pedido (${(aspecto.desvio * 100).toFixed(0)}% de desvio)`,
  )
  if (!visual) partes.push('sem inspeção visual')
  else if (visual.pulada) partes.push('inspeção visual pulada')
  else if (visual.aprovada) partes.push('inspeção visual ok')
  else partes.push(`inspeção visual REPROVOU: ${visual.detalhe?.problemas.join('; ') || 'sem detalhe'}`)
  return partes.join(' | ')
}
