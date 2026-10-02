/**
 * Regras das camadas de vídeo de uma página, compartilhadas entre o editor, o
 * export e a fila do servidor. Módulo PURO (sem DOM, sem Prisma): navegador e
 * servidor precisam escolher o MESMO vídeo e calcular a MESMA duração.
 *
 * MOTION = camada de vídeo com fundo transparente (WebM com canal alfa) que
 * fica POR CIMA de uma foto ou de outro vídeo: `videoMetadata.overlay === true`.
 * Ele não é "o vídeo da página": não dita o som original e, havendo um vídeo
 * de base, não dita a duração — só acompanha o relógio dele.
 */

type CamadaLike = {
  type?: string
  visible?: boolean
  videoMetadata?: { overlay?: boolean; [campo: string]: unknown } | null
}

export function ehMotion(camada: CamadaLike | null | undefined): boolean {
  return camada?.type === 'video' && camada.videoMetadata?.overlay === true
}

/**
 * Os vídeos que PARTICIPAM da página: camada oculta não entra na imagem do
 * export, então também não pode ditar duração nem som.
 */
export function videosDaPagina<T extends CamadaLike>(camadas: readonly T[] | null | undefined): T[] {
  return (camadas ?? []).filter((c) => c?.type === 'video' && c.visible !== false)
}

/** O vídeo de fundo da página: o primeiro vídeo visível que não é motion. */
export function videoDeBase<T extends CamadaLike>(camadas: readonly T[] | null | undefined): T | null {
  return videosDaPagina(camadas).find((c) => !ehMotion(c)) ?? null
}

/**
 * O vídeo que dita duração e relógio do export: o de base ou, na página que só
 * tem motion (motion sobre FOTO), o primeiro motion.
 */
export function videoPrincipal<T extends CamadaLike>(camadas: readonly T[] | null | undefined): T | null {
  return videoDeBase(camadas) ?? videosDaPagina(camadas)[0] ?? null
}

/**
 * ponytail: a extensão é o único sinal de transparência que o navegador dá sem
 * decodificar o arquivo. Câmera e celular entregam .mp4/.mov; .webm, nesta
 * casa, é motion convertido por scripts/converter-motion.sh. É SUGESTÃO: quem
 * insere avisa na tela, e o painel do vídeo tem o interruptor "Motion".
 */
export function pareceMotion(nomeOuUrl: string | null | undefined): boolean {
  return /\.webm(\?|#|$)/i.test(nomeOuUrl ?? '')
}

type TrechoLike = { trimStart?: number; trimEnd?: number; duration?: number }

/**
 * O trecho do vídeo que toca: do trimStart ao trimEnd (ou ao fim do arquivo).
 * `duracaoDaFonte` cobre a camada cuja duração ainda não foi gravada.
 */
export function trechoDoVideo(
  metadata: TrechoLike | null | undefined,
  duracaoDaFonte?: number | null,
): { inicio: number; duracao: number | null } {
  const inicio = Math.max(0, metadata?.trimStart ?? 0)
  const fim = metadata?.trimEnd
  if (fim !== undefined && fim > inicio) return { inicio, duracao: fim - inicio }
  const fonte = metadata?.duration && metadata.duration > 0 ? metadata.duration : duracaoDaFonte
  if (!fonte || !Number.isFinite(fonte) || fonte <= 0) return { inicio, duracao: null }
  return { inicio, duracao: Math.max(0.5, fonte - inicio) }
}

type TrilhaLike = { source?: string; musicId?: number | null; startTime?: number; endTime?: number }

/** A fatia da música escolhida na página, quando há música. */
export function fatiaDaMusica(trilha: TrilhaLike | null | undefined): number | null {
  if (!trilha || (trilha.source !== 'library' && trilha.source !== 'mix') || !trilha.musicId) return null
  if (trilha.startTime === undefined || trilha.endTime === undefined) return null
  const fatia = trilha.endTime - trilha.startTime
  return fatia > 0 ? fatia : null
}

/**
 * Duração do vídeo exportado: o trecho do vídeo principal, limitado pela fatia
 * da música. Regra ÚNICA — gravação, fila, chip do painel e aba Músicas.
 */
export function duracaoDoExport(
  duracaoDoTrecho: number | null,
  trilha: TrilhaLike | null | undefined,
): number | null {
  const fatia = fatiaDaMusica(trilha)
  if (duracaoDoTrecho === null) return fatia
  return fatia === null ? duracaoDoTrecho : Math.min(duracaoDoTrecho, fatia)
}

/** Acima disto o motion é reposicionado; abaixo, deixa tocar (seek engasga). */
export const DESVIO_TOLERADO_DO_MOTION = 0.25
/** Margem para o último quadro: seek exato na duração pode devolver vazio. */
const MARGEM_DO_FIM = 0.04

export type EstadoDoRelogio = {
  /** currentTime do vídeo principal */
  tempo: number
  /** início do trecho do principal */
  inicio: number
  pausado: boolean
}

export type EstadoDoMotion = {
  tempo: number
  inicio: number
  /** fim do trecho do motion (trimEnd ou duração do arquivo) */
  fim: number
  pausado: boolean
}

export type PassoDoMotion = { irPara?: number; tocar?: boolean; pausar?: boolean }

/**
 * O que o motion faz AGORA para acompanhar o vídeo principal. Chamado a cada
 * quadro: não guarda estado, só reconcilia — por isso sobrevive a ordem de
 * carregamento, play/pause, volta do loop, trim e desfazer/refazer.
 *
 * O motion toca UMA vez: passado o fim do próprio trecho, segura o último quadro.
 */
export function passoDoMotion(relogio: EstadoDoRelogio, motion: EstadoDoMotion): PassoDoMotion {
  const decorrido = Math.max(0, relogio.tempo - relogio.inicio)
  const ultimoQuadro = Math.max(motion.inicio, motion.fim - MARGEM_DO_FIM)
  const alvo = motion.inicio + decorrido

  if (alvo >= ultimoQuadro) {
    const passo: PassoDoMotion = {}
    if (!motion.pausado) passo.pausar = true
    if (Math.abs(motion.tempo - ultimoQuadro) > MARGEM_DO_FIM * 2) passo.irPara = ultimoQuadro
    return passo
  }

  const desvio = Math.abs(motion.tempo - alvo)
  if (relogio.pausado) {
    const passo: PassoDoMotion = {}
    if (!motion.pausado) passo.pausar = true
    // Parado, o quadro tem de ser o do instante do relógio
    if (desvio > MARGEM_DO_FIM) passo.irPara = alvo
    return passo
  }

  if (desvio > DESVIO_TOLERADO_DO_MOTION) {
    return motion.pausado ? { irPara: alvo, tocar: true } : { irPara: alvo }
  }
  // Adiantado dentro da tolerância e já no fim do trecho: segura ali em vez de
  // passar do corte (ou de ficar alternando tocar/pausar até o relógio chegar)
  if (motion.tempo >= ultimoQuadro) return motion.pausado ? {} : { pausar: true }
  return motion.pausado ? { tocar: true } : {}
}
