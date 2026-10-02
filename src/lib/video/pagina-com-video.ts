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
import { videosDaPagina } from './camadas-de-video'

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
  return videosDaPagina(camadas as Array<{ type?: string; visible?: boolean }>).length > 0 ? 'tem-video' : 'sem-video'
}
