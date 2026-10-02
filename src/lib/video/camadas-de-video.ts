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

type Tamanho = { width: number; height: number }

/**
 * A caixa em que um motion entra na página. Motion na proporção da página
 * (o texto animado 9:16) cobre a página inteira, como sempre. Motion de OUTRA
 * proporção — a logo animada 1:1 — é um elemento solto: entra na própria
 * proporção, com um terço da largura da página, no centro, para a pessoa
 * posicionar. Cobrir a página com ele (cover) o cortaria e o deixaria gigante.
 * Sem medida do vídeo, vale a página inteira.
 */
export function caixaDoMotion(
  video: Tamanho | null | undefined,
  pagina: Tamanho,
): { size: Tamanho; position: { x: number; y: number } } {
  const inteira = { size: { width: pagina.width, height: pagina.height }, position: { x: 0, y: 0 } }
  if (!video?.width || !video?.height) return inteira
  const proporcao = video.width / video.height
  if (Math.abs(proporcao - pagina.width / pagina.height) < 0.02) return inteira
  let width = pagina.width / 3
  let height = width / proporcao
  if (height > pagina.height / 3) {
    height = pagina.height / 3
    width = height * proporcao
  }
  const size = { width: Math.round(width), height: Math.round(height) }
  return {
    size,
    position: { x: Math.round((pagina.width - size.width) / 2), y: Math.round((pagina.height - size.height) / 2) },
  }
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

/**
 * A página tem vídeo VISÍVEL? É a pergunta do RENDER de servidor, que não
 * desenha vídeo: a camada sairia como um buraco na imagem.
 */
export function temVideoVisivel(camadas: readonly CamadaLike[] | null | undefined): boolean {
  return videosDaPagina(camadas).length > 0
}

/**
 * A página É um vídeo? É a pergunta da PUBLICAÇÃO: página com vídeo visível
 * ou com música só vai ao ar como MP4 — agendada como imagem, a música (ou o
 * movimento) ficaria para trás sem aviso. Quem quer a imagem tira a música.
 */
export function paginaEVideo(
  camadas: readonly CamadaLike[] | null | undefined,
  trilha: TrilhaLike | null | undefined,
): boolean {
  return temVideoVisivel(camadas) || fatiaDaMusica(trilha) !== null
}

type CamadaComTrecho = CamadaLike & { id?: string; videoMetadata?: (TrechoLike & { overlay?: boolean }) | null }

/**
 * A duração da página como vídeo — a MESMA conta do export, com nome: o trecho
 * do vídeo principal, limitado pela fatia da música; sem vídeo, a fatia da
 * música. `duracoesCarregadas` (id da camada → duração do <video> montado)
 * cobre a camada cuja `duration` ainda não foi gravada. `null` = a página não
 * tem tempo (ou ainda não dá para saber).
 */
export function duracaoDaPagina(
  camadas: readonly CamadaComTrecho[] | null | undefined,
  trilha: TrilhaLike | null | undefined,
  duracoesCarregadas?: ReadonlyMap<string, number> | null,
): number | null {
  const principal = videoPrincipal(camadas)
  const trecho = principal
    ? trechoDoVideo(principal.videoMetadata, principal.id ? duracoesCarregadas?.get(principal.id) : undefined).duracao
    : null
  return duracaoDoExport(trecho, trilha)
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

/** O relógio da PÁGINA (relogio-da-pagina.ts): tempo desde o início da página. */
export type RelogioDaPeca = { t: number; tocando: boolean }

/** O que o `<video>` diz de si neste quadro. `readyState`/`seeking` são do elemento. */
export type EstadoDoVideo = EstadoDoMotion & { readyState?: number; seeking?: boolean }

export type PassoDoVideo = PassoDoMotion & {
  /** Não tem o quadro ainda (readyState < 2) ou está no meio de um seek. */
  aguardando: boolean
}

/**
 * O que um vídeo faz AGORA para acompanhar o relógio da página — todo vídeo,
 * não só o motion: o instante 0 da página é o início do trecho de cada um.
 * Chamado a cada quadro, sem estado: sobrevive a ordem de carregamento,
 * play/pause, volta do loop, trim e desfazer/refazer. Passado o fim do próprio
 * trecho, segura o último quadro (é o que o export grava).
 */
export function passoDoVideo(relogio: RelogioDaPeca, video: EstadoDoVideo): PassoDoVideo {
  const aguardando = (video.readyState ?? 4) < 2 || video.seeking === true
  const ultimoQuadro = Math.max(video.inicio, video.fim - MARGEM_DO_FIM)
  const alvo = video.inicio + Math.max(0, relogio.t)

  if (alvo >= ultimoQuadro) {
    const passo: PassoDoVideo = { aguardando }
    if (!video.pausado) passo.pausar = true
    if (Math.abs(video.tempo - ultimoQuadro) > MARGEM_DO_FIM * 2) passo.irPara = ultimoQuadro
    return passo
  }

  const desvio = Math.abs(video.tempo - alvo)
  if (!relogio.tocando) {
    const passo: PassoDoVideo = { aguardando }
    if (!video.pausado) passo.pausar = true
    // Parado, o quadro tem de ser o do instante do relógio
    if (desvio > MARGEM_DO_FIM) passo.irPara = alvo
    return passo
  }

  if (desvio > DESVIO_TOLERADO_DO_MOTION) {
    return video.pausado ? { irPara: alvo, tocar: true, aguardando } : { irPara: alvo, aguardando }
  }
  // Adiantado dentro da tolerância e já no fim do trecho: segura ali em vez de
  // passar do corte (ou de ficar alternando tocar/pausar até o relógio chegar)
  if (video.tempo >= ultimoQuadro) return video.pausado ? { aguardando } : { pausar: true, aguardando }
  return video.pausado ? { tocar: true, aguardando } : { aguardando }
}

/**
 * O motion acompanhando o vídeo PRINCIPAL (a forma antiga): o relógio é o
 * `currentTime` do principal descontado o início do trecho dele. Hoje é um
 * caso de `passoDoVideo`; fica pela leitura do harness e dos testes.
 */
export function passoDoMotion(relogio: EstadoDoRelogio, motion: EstadoDoMotion): PassoDoMotion {
  const { aguardando: _aguardando, ...passo } = passoDoVideo(
    { t: Math.max(0, relogio.tempo - relogio.inicio), tocando: !relogio.pausado },
    motion,
  )
  return passo
}
