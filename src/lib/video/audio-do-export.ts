/**
 * O som do vídeo exportado quando a trilha pedida NÃO pôde ser usada.
 *
 * Módulo PURO (sem ffmpeg, sem Prisma): a fila decide aqui o que tentar depois
 * de uma falha, e o card do criativo lê daqui o que mostrar. Antes disto o MP4
 * saía mudo, concluído e cobrado, sem registro nenhum — e a música ia embora
 * junto com o som do vídeo que tinha falhado.
 */

import type { AudioMixOptions } from './ffmpeg-server-converter'

/** O que saiu DIFERENTE do pedido. Gravado em Generation.fieldValues.audioAviso. */
export type AudioAviso = 'so-musica' | 'so-original' | 'sem-audio'

const AVISOS: readonly AudioAviso[] = ['so-musica', 'so-original', 'sem-audio']

/** O que o card do criativo mostra (curto, em âmbar). */
const ROTULO_DO_AVISO_DE_AUDIO: Record<AudioAviso, string> = {
  'so-musica': 'Saiu só com a música',
  'so-original': 'Saiu sem a música',
  'sem-audio': 'Saiu sem som',
}

/** O porquê, em fieldValues.audioAvisoMotivo — sem jargão: quem lê é a equipe. */
export const MOTIVO_DO_AVISO_DE_AUDIO: Record<AudioAviso, string> = {
  'so-musica':
    'Não foi possível usar o som do vídeo (ele pode não ter som). O vídeo saiu só com a música.',
  'so-original':
    'Não foi possível usar a música escolhida (ela pode não estar mais na biblioteca). O vídeo saiu só com o som dele.',
  'sem-audio':
    'Não foi possível usar o som escolhido (o vídeo pode não ter som, ou a música não está mais disponível). O vídeo saiu sem som.',
}

/**
 * A próxima tentativa de áudio depois que a conversão com trilha falhou (ex.:
 * mix com vídeo de origem sem faixa de áudio, ou música com arquivo inválido).
 * Uma escada só, e só o mix tem degraus:
 *
 *   som do vídeo + música → só a música → só o som do vídeo → sem áudio
 *
 * Cada degrau usa UMA fonte, para o ffmpeg nem abrir o arquivo que pode ter
 * falhado; a música mantém início, volume e fades. `pedido` é a trilha que a
 * página pediu — é por ela que se sabe o que ainda não foi tentado.
 *
 * `mix` ausente = desistir do áudio (a conversão sem trilha sempre pode ser tentada).
 */
export function proximaTentativaDeAudio(
  falhou: AudioMixOptions,
  pedido: AudioMixOptions = falhou,
): { mix?: AudioMixOptions; aviso: AudioAviso } {
  const eraMixCompleto = pedido.mode === 'mix' && !!pedido.originalPath && !!pedido.musicPath
  if (!eraMixCompleto) return { aviso: 'sem-audio' }

  if (falhou.mode === 'mix') {
    return {
      mix: {
        mode: 'library',
        musicPath: pedido.musicPath,
        musicStart: pedido.musicStart,
        musicVolume: pedido.musicVolume,
        fadeInDuration: pedido.fadeInDuration,
        fadeOutDuration: pedido.fadeOutDuration,
      },
      aviso: 'so-musica',
    }
  }
  if (falhou.mode === 'library') {
    return {
      mix: {
        mode: 'original',
        originalPath: pedido.originalPath,
        originalTrimStart: pedido.originalTrimStart,
        originalVolume: pedido.originalVolume,
      },
      aviso: 'so-original',
    }
  }
  return { aviso: 'sem-audio' }
}

/** Lê o aviso gravado na Generation; valor desconhecido não vira aviso. */
export function avisoDeAudioDe(
  fieldValues: Record<string, unknown> | null | undefined,
): { rotulo: string; motivo: string } | null {
  const aviso = fieldValues?.audioAviso
  if (typeof aviso !== 'string' || !AVISOS.includes(aviso as AudioAviso)) return null
  const motivo = fieldValues?.audioAvisoMotivo
  return {
    rotulo: ROTULO_DO_AVISO_DE_AUDIO[aviso as AudioAviso],
    motivo: typeof motivo === 'string' && motivo ? motivo : MOTIVO_DO_AVISO_DE_AUDIO[aviso as AudioAviso],
  }
}
