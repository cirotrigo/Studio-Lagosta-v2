/**
 * "Esta página pode virar post como IMAGEM?" — a pergunta de toda porta que
 * publica a página sem passar pelo "Exportar Vídeo".
 *
 * Página com vídeo (ou motion) VISÍVEL só vai ao ar como MP4: o render do
 * servidor e o JPEG do editor são um quadro parado, e o story sai como imagem
 * sem ninguém perceber (5 foram ao ar assim até 02/10/2026).
 *
 * Módulo PURO (sem Prisma, sem DOM): o servidor recebe `Page.layers` como está
 * no banco — array, string JSON ou string dupla-codificada — e o editor, o
 * array já lido. As duas pontas precisam da MESMA resposta.
 */

import { lerCamadas } from '@/lib/posts/page-layers'
import { fatiaDaMusica, paginaEhSequencia, videosDaPagina } from './camadas-de-video'

export type VideoNaPagina = 'tem-video' | 'sem-video' | 'ilegivel'

/** O que dizer em toda porta que recusa publicar a página como imagem. */
export const MENSAGEM_PAGINA_COM_VIDEO =
  'Esta página tem vídeo. Exporte o vídeo (botão "Exportar Vídeo" no editor) e agende o MP4 pela aba Criativos.'

/**
 * `ilegivel` NÃO é `sem-video`: camadas que não deu para ler não provam que a
 * página não tem vídeo. Quem trava (o agendamento) recusa; quem só avisa (a
 * tela) não afirma nada.
 *
 * Camada oculta não conta — é a regra de `videosDaPagina`: ela não entra na
 * imagem, então a página É uma imagem.
 */
export function videoNaPagina(layersCruas: unknown): VideoNaPagina {
  const { camadas, legivel } = lerCamadas(layersCruas)
  if (!legivel) return 'ilegivel'
  // Só vídeo VISÍVEL: o render não o desenha. Sequência só de fotos RENDERIZA
  // (o quadro de 0 — miniatura, ajuste); quem a impede de ir ao ar como imagem
  // é a trava de publicação (`recusaComoImagem`).
  return videosDaPagina(camadas as Array<{ type?: string; visible?: boolean }>).length > 0 ? 'tem-video' : 'sem-video'
}

/** Sequência de fotos sem vídeo nenhum: a mensagem fala de linha do tempo, não de vídeo. */
export const MENSAGEM_PAGINA_COM_SEQUENCIA =
  'Esta página tem uma sequência de clipes na linha do tempo: ela vai ao ar como vídeo. Exporte o vídeo (botão "Exportar Vídeo" no editor) e agende o MP4 pela aba Criativos.'

/** Página com música e sem vídeo: ela é um vídeo, e a saída é exportar ou tirar a música. */
export const MENSAGEM_PAGINA_COM_MUSICA =
  'Esta página tem música: ela vai ao ar como vídeo. Exporte o vídeo (botão "Exportar Vídeo" no editor) e agende o MP4 — ou tire a música (aba Músicas) para agendar a imagem.'

export type RecusaComoImagem = { codigo: 'PAGINA_COM_VIDEO' | 'PAGINA_COM_MUSICA'; mensagem: string }

/** `Page.audio` como está no banco: objeto, string JSON ou nada. */
function lerTrilha(audioCru: unknown): Record<string, unknown> | null {
  let valor = audioCru
  for (let i = 0; i < 2 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

/**
 * A trava de PUBLICAÇÃO: por que esta página não pode virar post como imagem —
 * ou `null`, quando pode. Vídeo visível OU música: nos dois casos o post
 * sairia como um quadro parado, sem o movimento ou sem o som, em silêncio.
 *
 * Diferente da trava de RENDER (`videoNaPagina`): página com música e sem vídeo
 * RENDERIZA como imagem (miniatura, ajuste de arte) — só não se PUBLICA assim.
 */
export function recusaComoImagem(layersCruas: unknown, audioCru: unknown): RecusaComoImagem | null {
  return recusaPorCamadas(layersCruas) ?? recusaPorMusica(audioCru)
}

/**
 * A parte da trava de publicação que vem das CAMADAS: vídeo visível ou
 * sequência. É a que vale para post que JÁ existe (render-story do MCP, cron):
 * a exceção dos posts de imagem anteriores à música fica de fora — a música só
 * é conferida quando o post nasce.
 */
export function recusaPorCamadas(layersCruas: unknown): RecusaComoImagem | null {
  if (videoNaPagina(layersCruas) === 'tem-video') return { codigo: 'PAGINA_COM_VIDEO', mensagem: MENSAGEM_PAGINA_COM_VIDEO }
  const { camadas, legivel } = lerCamadas(layersCruas)
  if (legivel && paginaEhSequencia(camadas as Array<{ type?: string; visible?: boolean; order?: number; clipe?: { duracao?: number } | null }>)) {
    return { codigo: 'PAGINA_COM_VIDEO', mensagem: MENSAGEM_PAGINA_COM_SEQUENCIA }
  }
  return null
}

function recusaPorMusica(audioCru: unknown): RecusaComoImagem | null {
  if (fatiaDaMusica(lerTrilha(audioCru)) !== null) {
    return { codigo: 'PAGINA_COM_MUSICA', mensagem: MENSAGEM_PAGINA_COM_MUSICA }
  }
  return null
}
