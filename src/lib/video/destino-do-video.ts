/**
 * Para onde vai o vídeo que a página exportou: só a galeria, a agenda (um post
 * novo) ou a SUBSTITUIÇÃO do vídeo de um post que já existe — e as decisões
 * puras de cada caminho.
 *
 * Tudo isto mora em `Generation.fieldValues.videoDaPagina`, e NUNCA em
 * `fieldValues.pageId`: esse campo diz "esta Generation é a arte (imagem) da
 * página", e é lido pela recomposição, pela trava do revisor e pela faixa da
 * agenda. O vídeo é outra coisa (ver `arte-da-pagina.ts`).
 *
 * Puro: sem Prisma. O processador da fila, a rota de enfileiramento e os
 * testes chamam as mesmas funções.
 */
import { z } from 'zod'
import { horarioPadrao, rotuloCurto, type HorariosPorDia } from '@/lib/posts/quando'

export const ANTECEDENCIA_MINIMA_MS = 10 * 60_000
/** Abaixo disto o horário pedido virou passado durante o processamento: o post nasce rascunho. */
export const FOLGA_NA_HORA_DO_DESTINO_MS = 60_000
/** Tempo do arrendamento de um job de vídeo (a rota da fila tem 300 s; 7 min cobre com folga). */
export const ARRENDAMENTO_DO_VIDEO_MS = 7 * 60_000
/** Quantas reservas um job de vídeo recebe antes de desistir. */
export const MAX_TENTATIVAS_DO_VIDEO = 2

export const destinoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('galeria') }),
  z.object({
    tipo: z.literal('agenda'),
    /** ISO com fuso. */
    quando: z.string().min(1),
    postType: z.enum(['STORY', 'REEL']),
    legenda: z.string().max(2200).optional(),
    situacao: z.enum(['agendado', 'rascunho']),
  }),
  z.object({ tipo: z.literal('substituir'), postId: z.string().min(1) }),
])

// Escrito à mão, não `z.infer`: com `strict: false` o infer marca toda chave
// como opcional e o `Extract` por `tipo` vira `never`.
export type DestinoAgenda = {
  tipo: 'agenda'
  quando: string
  postType: 'STORY' | 'REEL'
  legenda?: string
  situacao: 'agendado' | 'rascunho'
}
export type DestinoDoVideo = { tipo: 'galeria' } | DestinoAgenda | { tipo: 'substituir'; postId: string }

export type ResultadoDoDestino =
  | { ok: true; revisaoDepois: string; em: string }
  | { ok: false; motivo: string; em: string }

export interface VideoDaPagina {
  pageId: string
  /** `versaoDoVideo` do que foi GRAVADO (o design que a gravação levou). */
  versao: string | null
  /** A página no banco já era outra na hora da gravação (autosave atrasado). */
  divergiuNaGravacao: boolean
  destino: DestinoDoVideo
  /** Substituir: o post como estava quando o vídeo foi pedido. */
  esperado?: { revisao: string; mediaUrls: string[]; pageId: string }
  /** Substituir: os pedidos anteriores do mesmo post que ainda não tinham desfecho. */
  predecessoras?: string[]
  /** Agenda: o post criado. */
  postId?: string
  /** Agenda: o post nasceu rascunho porque o horário passou durante o preparo. */
  aviso?: string
  /** O desfecho do destino (substituir: aceito ou recusado; agenda: só a recusa). */
  resultado?: ResultadoDoDestino
}

export function lerVideoDaPagina(fieldValues: unknown): VideoDaPagina | null {
  if (!fieldValues || typeof fieldValues !== 'object' || Array.isArray(fieldValues)) return null
  const v = (fieldValues as Record<string, unknown>).videoDaPagina
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.pageId !== 'string') return null
  const destino = destinoSchema.safeParse(o.destino)
  if (!destino.success) return null
  return { ...(o as unknown as VideoDaPagina), destino: destino.data as DestinoDoVideo }
}

/** O formato manda no tipo: página 9:16 pode ser story (ou reel); feed só reel. */
export function tiposPermitidos(largura: number, altura: number): Array<'STORY' | 'REEL'> {
  const vertical = largura > 0 && Math.abs(altura / largura - 16 / 9) < 0.05
  return vertical ? ['STORY', 'REEL'] : ['REEL']
}

/** Validação do destino na FILA (antes de cobrar). Devolve o motivo, em português, ou `null`. */
export function validarDestinoNaFila(
  destino: DestinoDoVideo,
  contexto: { agora: Date; largura: number; altura: number },
): string | null {
  if (destino.tipo !== 'agenda') return null
  const quando = new Date(destino.quando)
  if (Number.isNaN(quando.getTime())) return 'A data e a hora do post não são válidas.'
  if (quando.getTime() - contexto.agora.getTime() < ANTECEDENCIA_MINIMA_MS) {
    return 'Escolha um horário com pelo menos 10 minutos de antecedência — o vídeo ainda precisa ser preparado.'
  }
  if (!tiposPermitidos(contexto.largura, contexto.altura).includes(destino.postType)) {
    return 'Story precisa de página vertical (9:16). Esta página só pode ir como Reel.'
  }
  return null
}

export interface PostParaSubstituir {
  id: string
  projectId: number
  pageId: string | null
  status: string
  laterPostId: string | null
  updatedAt: Date
  mediaUrls: string[]
  videoDaPagina?: boolean | null
}

const SITUACOES_EDITAVEIS = new Set(['DRAFT', 'SCHEDULED'])

/** O post pode ter o vídeo trocado? Vale na fila e na hora de trocar. */
function motivoDoPost(
  post: PostParaSubstituir | null,
  pageId: string,
  ehVideo: boolean,
): string | null {
  if (!post) return 'O post não existe mais na agenda.'
  if (post.laterPostId) return 'O post já foi entregue para publicar — o vídeo dele não pode mais ser trocado.'
  if (!SITUACOES_EDITAVEIS.has(post.status)) return 'O post já saiu da agenda (publicado ou com falha).'
  if (post.pageId !== pageId) return 'O post está ligado a outra página.'
  if (!ehVideo) return 'Esse post não é de vídeo.'
  return null
}

export function validarSubstituicaoNaFila(
  post: PostParaSubstituir | null,
  contexto: { projectId: number; pageId: string; ehVideo: boolean },
): string | null {
  if (post && post.projectId !== contexto.projectId) return 'O post não existe mais na agenda.'
  return motivoDoPost(post, contexto.pageId, contexto.ehVideo)
}

/**
 * As revisões em que o post ainda é "o que se pediu": a do pedido, mais a que
 * cada pedido ANTERIOR do mesmo post deixou ao trocar o vídeo. É o que faz a
 * cadeia terminar no vídeo mais novo em qualquer ordem de chegada: o mais novo
 * aceita a troca feita pelo mais antigo; o mais antigo recusa a feita pelo novo.
 */
export function revisoesAceitas(
  esperado: { revisao: string },
  resultadosDasPredecessoras: Array<ResultadoDoDestino | null | undefined>,
): number[] {
  const tempos = [esperado.revisao]
  for (const r of resultadosDasPredecessoras) if (r && r.ok) tempos.push(r.revisaoDepois)
  return tempos.map((t) => new Date(t).getTime()).filter((t) => Number.isFinite(t))
}

export function decidirSubstituicao(
  post: PostParaSubstituir | null,
  esperado: { revisao: string; pageId: string },
  aceitas: number[],
  ehVideo: boolean,
): { aceitar: true } | { aceitar: false; motivo: string } {
  const motivo = motivoDoPost(post, esperado.pageId, ehVideo)
  if (motivo) return { aceitar: false, motivo }
  if (!aceitas.includes(post!.updatedAt.getTime())) {
    return {
      aceitar: false,
      motivo: 'O post foi mudado na agenda depois que este vídeo foi pedido — a mudança de lá foi mantida.',
    }
  }
  return { aceitar: true }
}

/** As mídias depois da troca: o vídeo anterior dá lugar ao novo; sem vídeo, o novo vira a mídia. */
export function midiasDepoisDaTroca(mediaUrls: string[], anterior: string | null, novo: string): string[] {
  if (anterior && mediaUrls.includes(anterior)) return mediaUrls.map((u) => (u === anterior ? novo : u))
  return [novo]
}

/**
 * O horário pedido virou passado (ou quase) enquanto o vídeo era preparado:
 * o post nasce rascunho, e o motivo vai para quem pediu.
 */
export function situacaoNaHoraDoDestino(
  destino: DestinoAgenda,
  agora: Date,
): { situacao: 'agendado' | 'rascunho'; motivo?: string } {
  if (destino.situacao === 'rascunho') return { situacao: 'rascunho' }
  const quando = new Date(destino.quando).getTime()
  if (quando - agora.getTime() <= FOLGA_NA_HORA_DO_DESTINO_MS) {
    return {
      situacao: 'rascunho',
      motivo: 'O horário escolhido passou enquanto o vídeo era preparado — o post ficou como rascunho para você escolher outro.',
    }
  }
  return { situacao: 'agendado' }
}

/**
 * O que fazer com o job preso em PROCESSING além do arrendamento: devolver à
 * fila enquanto houver tentativa; esgotado, falhar — a não ser que o vídeo já
 * exista (a etapa que falhou foi a do destino), e aí o vídeo fica na galeria e
 * o destino registra o motivo.
 */
export function decidirRecuperacao(job: {
  attempts: number
  videoPronto: boolean
}): 'devolver' | 'falhar' | 'concluir-sem-destino' {
  if (job.attempts < MAX_TENTATIVAS_DO_VIDEO) return 'devolver'
  return job.videoPronto ? 'concluir-sem-destino' : 'falhar'
}

export const MOTIVO_DESTINO_NAO_CONCLUIDO =
  'O vídeo ficou pronto e está na galeria, mas não deu para colocá-lo na agenda. Agende pela galeria.'

/**
 * A antecedência que a TELA exige antes de gravar: a da fila mais o tempo da
 * própria gravação (a duração do vídeo) e do envio. Exigir só os 10 min da
 * fila fazia a pessoa gravar inteiro para ouvir "escolha outro horário".
 */
export function antecedenciaParaGravar(duracaoSegundos: number | null): number {
  return ANTECEDENCIA_MINIMA_MS + Math.max(0, duracaoSegundos ?? 0) * 1000 + 2 * 60_000
}

/**
 * O horário que o diálogo de gerar propõe: o previsto da página (a composição
 * sabe quando a peça sai) se ainda cabe; senão o horário típico do cliente
 * (`horarioPadrao`, o mesmo do Novo Post — nunca `sugerirPosts`), contado a
 * partir de quando a gravação termina.
 */
export function quandoInicialDoVideo(
  previsto: string | null | undefined,
  porDia: HorariosPorDia | undefined,
  agora: Date,
  antecedenciaMs: number,
): Date {
  const p = previsto ? new Date(previsto) : null
  if (p && Number.isFinite(p.getTime()) && p.getTime() - agora.getTime() >= antecedenciaMs) return p
  // `horarioPadrao` já guarda 10 min de folga: deslocar o "agora" pelo resto
  // faz o resultado nunca cair antes da antecedência pedida.
  return horarioPadrao(porDia, new Date(agora.getTime() + Math.max(0, antecedenciaMs - ANTECEDENCIA_MINIMA_MS)))
}

/**
 * Para onde o vídeo foi, dito no card da galeria. `null` = vídeo só da galeria
 * (ou sem registro). O horário sai no relógio de quem olha (a equipe opera em
 * Brasília), como no Novo Post.
 */
/** O motivo de um destino recusado; `null` quando deu certo ou ainda não rodou. */
export function motivoDaRecusa(r: ResultadoDoDestino | null | undefined): string | null {
  return r && r.ok === false && 'motivo' in r ? r.motivo : null
}

export function rotuloDoDestino(fieldValues: unknown): { texto: string; recusa: boolean } | null {
  const v = lerVideoDaPagina(fieldValues)
  if (!v || v.destino.tipo === 'galeria') return null
  const r = v.resultado
  const motivo = motivoDaRecusa(r)
  if (v.destino.tipo === 'substituir') {
    if (!r) return { texto: 'vai substituir o vídeo de um post da agenda', recusa: false }
    return motivo === null
      ? { texto: 'substituiu o vídeo do post na agenda', recusa: false }
      : { texto: `não substituiu: ${motivo}`, recusa: true }
  }
  if (motivo !== null) return { texto: `fora da agenda: ${motivo}`, recusa: true }
  if (v.postId) return { texto: v.aviso ? `na agenda como rascunho: ${v.aviso}` : 'na agenda', recusa: false }
  const quando = new Date(v.destino.quando)
  const hora = Number.isFinite(quando.getTime()) ? `: ${rotuloCurto(quando)}` : ''
  return { texto: `vai para a agenda${v.destino.situacao === 'rascunho' ? ' como rascunho' : ''}${hora}`, recusa: false }
}
