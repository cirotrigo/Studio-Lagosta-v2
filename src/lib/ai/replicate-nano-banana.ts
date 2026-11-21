/**
 * Pedido de predição no Replicate para a família Nano Banana: a ALTERNATIVA
 * de `src/app/api/ai/generate-image/route.ts` quando o Gemini direto falha.
 *
 * 🔴 Por que existe fora da rota (21/11/2026): de 16/03 a 21/11/2026 a rota
 * mandava `{ version: AI_IMAGE_MODELS[...].version }` para `/v1/predictions`,
 * e esse `version` passou a ser o ID do GOOGLE (`gemini-3-pro-image-preview`).
 * O Replicate só aceita ali um hash de versão ou `owner/name`, então a
 * alternativa falhava sempre, e ninguém viu: nenhum teste olhava o pedido.
 * Agora o modelo do Replicate é um campo próprio (`replicateModel`) e o pedido
 * vai para o endpoint de modelo oficial, `/v1/models/{owner}/{name}/predictions`,
 * que não leva `version`. Puro: não toca rede nem env, para ser testável.
 */

import { AI_IMAGE_MODELS, type AIImageModel } from '@/lib/ai/image-models-config'

export interface ParametrosPredicaoReplicate {
  model: AIImageModel
  prompt: string
  aspectRatio: string
  resolution?: '1K' | '2K' | '4K'
  referenceImages?: string[]
  mode?: 'generate' | 'edit' | 'inpaint'
  baseImage?: string
  maskImage?: string
}

export function montarPredicaoReplicate(params: ParametrosPredicaoReplicate): {
  url: string
  body: { input: Record<string, unknown> }
} {
  const replicateModel = AI_IMAGE_MODELS[params.model]?.replicateModel
  if (!replicateModel || !/^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(replicateModel)) {
    throw new Error(
      `Replicate API error: o modelo ${params.model} não tem modelo no Replicate configurado (replicateModel).`,
    )
  }

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    output_format: 'png',
  }

  // Resolução (apenas Pro)
  if (params.model === 'nano-banana-pro' && params.resolution) {
    input.resolution = params.resolution
  }

  // Modo de edição: baseImage é a imagem principal; senão, as referências (até 14)
  if (params.mode === 'edit' && params.baseImage) {
    input.image_input = [params.baseImage]
  } else if (params.referenceImages && params.referenceImages.length > 0) {
    input.image_input = params.referenceImages.slice(0, 14)
  }

  // Filtro de segurança (apenas Pro)
  if (params.model === 'nano-banana-pro') {
    input.safety_filter_level = 'block_only_high'
  }

  return {
    url: `https://api.replicate.com/v1/models/${replicateModel}/predictions`,
    body: { input },
  }
}
