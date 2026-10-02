/**
 * O que a página TOCA de música, dado `Page.audio` e a duração do vídeo. Módulo
 * PURO: a prévia (o `<audio>` do motor da página) e a fila do servidor
 * decidem pela MESMA função — a prévia nunca toca o que o export não vai ter
 * (decisão 9 do plano de 02/10/2026).
 *
 * O arquivo: `urls` traz as três versões da faixa (original, instrumental,
 * voz); a versão pedida que ainda não existe cai na original, como a fila já
 * faz (a voz é aditiva e nunca derruba a música).
 */

import { fatiaDaMusica } from './camadas-de-video'

type TrilhaLike = {
  source?: string
  musicId?: number | null
  audioVersion?: 'original' | 'instrumental' | 'vocals'
  startTime?: number
  endTime?: number
  volume?: number
  volumeMusic?: number
  fadeIn?: boolean
  fadeOut?: boolean
  fadeInDuration?: number
  fadeOutDuration?: number
}

export type UrlsDaFaixa = { original?: string | null; instrumental?: string | null; vocals?: string | null }

export type PlanoDeSom = {
  src: string
  /** Onde a música começa, no tempo DELA, quando a página está em 0. */
  inicio: number
  /** Até onde a página toca a música (tempo da página). */
  duracao: number
  /** 0–1 */
  volume: number
  fadeIn: number
  fadeOut: number
}

/**
 * `null` = a página não toca música (sem trilha, trilha sem fatia, ou arquivo
 * ainda não conhecido). `linha.duracao` é a duração da página como vídeo
 * (`duracaoDaPagina`): a música para onde o vídeo para.
 */
export function planoDeSom(
  linha: { duracao: number | null },
  trilha: TrilhaLike | null | undefined,
  urls: UrlsDaFaixa | null | undefined,
): PlanoDeSom | null {
  const fatia = fatiaDaMusica(trilha)
  if (fatia === null || !trilha) return null
  const versao = trilha.audioVersion ?? 'original'
  const src = (versao !== 'original' ? urls?.[versao] : null) ?? urls?.original
  if (!src) return null
  const duracao = Math.min(fatia, linha.duracao ?? fatia)
  if (duracao <= 0) return null
  const volume = trilha.source === 'mix' ? (trilha.volumeMusic ?? trilha.volume) : trilha.volume
  return {
    src,
    inicio: Math.max(0, trilha.startTime ?? 0),
    duracao,
    volume: Math.min(1, Math.max(0, (volume ?? 80) / 100)),
    fadeIn: trilha.fadeIn ? Math.max(0, trilha.fadeInDuration ?? 0) : 0,
    fadeOut: trilha.fadeOut ? Math.max(0, trilha.fadeOutDuration ?? 0) : 0,
  }
}

/** O volume no instante `t` da página, com os fades do plano. */
export function volumeEm(plano: PlanoDeSom, t: number): number {
  let fator = 1
  if (plano.fadeIn > 0 && t < plano.fadeIn) fator = Math.min(fator, t / plano.fadeIn)
  const restante = plano.duracao - t
  if (plano.fadeOut > 0 && restante < plano.fadeOut) fator = Math.min(fator, Math.max(0, restante) / plano.fadeOut)
  return plano.volume * Math.min(1, Math.max(0, fator))
}
