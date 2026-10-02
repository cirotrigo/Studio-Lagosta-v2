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

import { ehMotion, fatiaDaMusica, trechoDoVideo, videoDeBase } from './camadas-de-video'
import { linhaDoTempo } from './linha-do-tempo'

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

type CamadaComVideo = {
  id: string
  type?: string
  visible?: boolean
  order?: number
  fileUrl?: string
  videoMetadata?: { trimStart?: number; trimEnd?: number; duration?: number; overlay?: boolean; [k: string]: unknown } | null
  clipe?: { duracao?: number } | null
  [k: string]: unknown
}

/** Um trecho de vídeo da página, no relógio DELA: de onde vem o som original. */
export type TrechoOriginal = {
  id: string
  fileUrl: string
  /** Início do trecho dentro do arquivo */
  trimStart: number
  /** Instante da página em que entra */
  inicio: number
  /** Quanto toca (0 = ainda não se sabe; quem consome ignora) */
  duracao: number
}

/**
 * Os trechos de vídeo que PODEM carregar som original (Fase 4): numa
 * sequência, cada clipe de vídeo na posição dele; na página legada, o vídeo de
 * base em 0 — o comando de hoje. Motion nunca entra (não tem som). Se ter
 * faixa de áudio de verdade só o servidor sabe (`temFaixaDeAudio`).
 */
export function trechosDeVideo(
  layers: readonly CamadaComVideo[] | null | undefined,
  duracoesCarregadas?: ReadonlyMap<string, number> | null,
): TrechoOriginal[] {
  const linha = linhaDoTempo(layers, null, duracoesCarregadas)
  if (linha.clipes.length === 0) {
    const base = videoDeBase(layers)
    if (!base?.fileUrl) return []
    const trecho = trechoDoVideo(base.videoMetadata, duracoesCarregadas?.get(base.id))
    return [{ id: base.id, fileUrl: base.fileUrl, trimStart: trecho.inicio, inicio: 0, duracao: trecho.duracao ?? 0 }]
  }
  const porId = new Map((layers ?? []).map((l) => [l.id, l]))
  const trechos: TrechoOriginal[] = []
  for (const c of linha.clipes) {
    const camada = porId.get(c.id)
    if (c.tipo !== 'video' || c.duracao <= 0 || !camada?.fileUrl || ehMotion(camada)) continue
    trechos.push({ id: c.id, fileUrl: camada.fileUrl, trimStart: c.trimStart, inicio: c.inicio, duracao: c.duracao })
  }
  return trechos
}

/**
 * Os trechos cujo som original TOCA, dada a trilha: só com `original` ou
 * `mix`, e cortados onde a página termina (a música pode encurtá-la). A
 * prévia (qual `<video>` fica sem mudo) e a fila (os `originais` do ffmpeg)
 * decidem por aqui.
 */
export function trechosOriginais(
  layers: readonly CamadaComVideo[] | null | undefined,
  trilha: TrilhaLike | null | undefined,
  duracoesCarregadas?: ReadonlyMap<string, number> | null,
): TrechoOriginal[] {
  if (trilha?.source !== 'original' && trilha?.source !== 'mix') return []
  const fim = linhaDoTempo(layers, trilha, duracoesCarregadas).duracao
  return trechosDeVideo(layers, duracoesCarregadas)
    // duração 0 = legada e ainda desconhecida (fica em 0; o `-t` do export corta)
    .map((t) => (fim === null || t.duracao === 0 ? t : { ...t, duracao: Math.min(t.duracao, fim - t.inicio) }))
    .filter((t) => t.inicio === 0 || t.duracao > 0)
}

/** O volume no instante `t` da página, com os fades do plano. */
export function volumeEm(plano: PlanoDeSom, t: number): number {
  let fator = 1
  if (plano.fadeIn > 0 && t < plano.fadeIn) fator = Math.min(fator, t / plano.fadeIn)
  const restante = plano.duracao - t
  if (plano.fadeOut > 0 && restante < plano.fadeOut) fator = Math.min(fator, Math.max(0, restante) / plano.fadeOut)
  return plano.volume * Math.min(1, Math.max(0, fator))
}
