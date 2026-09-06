/**
 * Repostar: quais artes já publicadas valem voltar ao ar num slot — a parte
 * PURA (sem Prisma; a rota e a tool do conector alimentam esta função).
 *
 * O que a medição de 05/09/2026 impôs ao desenho (8.649 posts publicados):
 * - repostar já é 31% do que vai ao ar (2.605 reposts), sem ferramenta;
 * - dia da semana + faixa de horário é sinal: 49% dos reposts reais caem na
 *   mesma combinação, contra 8% de dois posts ao acaso — por isso ORDENA;
 * - mas 51% caem fora: por isso NUNCA ESCONDE (score ordena, filtro nenhum
 *   apaga — a mesma lei do ranking do acervo);
 * - 47% dos reposts têm menos de 14 dias e não são recorrentes: os 14 dias são
 *   SEMÁFORO (verde ≥14, âmbar 7-13, vermelho <7), não portão;
 * - 2.595 de 2.605 reposts são STORY: quem chama só oferece em story;
 * - 1.374 posts têm `generationId` cuja mídia publicada é outra (a melhoria com
 *   IA cria arte nova): o contador conta a IMAGEM (URL), não a Generation.
 */
import { emBRT } from '@/lib/posts/cadencia'

export interface PostPublicadoParaRepost {
  id: string
  /** `mediaUrls[0]` do post — é o que o olho reconhece. */
  mediaUrl: string
  generationId: string | null
  /**
   * `Generation.resultUrl` quando a Generation existe e está COMPLETED. É a
   * URL que o cleanup de 90 dias mantém viva (reapontada para o Drive); a do
   * post pode ter morrido junto com o blob.
   */
  generationUrl: string | null
  templateName: string | null
  quando: Date
  caption: string | null
  alcance: number | null
}

export interface ArteParaRepost {
  /** A URL normalizada da mídia — o que define "a mesma arte". */
  chave: string
  /** A URL a usar no post novo. */
  url: string
  generationId: string | null
  templateName: string | null
  vezesUsada: number
  ultimoUso: Date
  ultimoPostId: string
  legenda: string | null
  alcance: number | null
}

export type Semaforo = 'verde' | 'ambar' | 'vermelho'

export interface SugestaoDeRepost extends ArteParaRepost {
  diasDesde: number
  /** Dia da semana (0=dom) e hora 'HH:mm' do ÚLTIMO uso, em BRT. */
  diaDaSemana: number
  hora: string
  mesmoDia: boolean
  mesmaFaixa: boolean
  semaforo: Semaforo
  avisoDePrazo: string | null
  pontos: number
}

export const VERSAO_DO_REPOST = 'repost-v1'
export const JANELA_PADRAO_DIAS = 60
export const TETO_PADRAO = 24

/** Mesma imagem = mesma URL sem query/hash. */
export function chaveDaImagem(url: string): string {
  const limpa = url.trim()
  const corte = limpa.search(/[?#]/)
  return corte === -1 ? limpa : limpa.slice(0, corte)
}

export function semaforoPorIdade(dias: number): Semaforo {
  if (dias >= 14) return 'verde'
  if (dias >= 7) return 'ambar'
  return 'vermelho'
}

const DIAS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIA_RE: Array<[number, RegExp]> = [
  [0, /\bdomingo\b/i],
  [1, /\bsegunda(?:-feira)?\b/i],
  [2, /\bter[cç]a(?:-feira)?\b/i],
  [3, /\bquarta(?:-feira)?\b/i],
  [4, /\bquinta(?:-feira)?\b/i],
  [5, /\bsexta(?:-feira)?\b/i],
  [6, /\bs[aá]bado\b/i],
]
const DATA_RE = /\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/
const MES_RE = /\b(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i
const URGENCIA_RE = /\b(?:hoje|amanh[aã]|[uú]ltima chance|s[oó] at[eé]|[uú]ltimo dia|es[st]a semana|nest[ea] (?:s[aá]bado|domingo|semana|fim de semana))\b/i
const DATA_COMEMORATIVA_RE = /\b(?:dia d(?:a|o|as|os) (?:m[aã]es|pais|namorados|crian[cç]as|mulher|trabalhador|professor)|natal|ano novo|r[eé]veillon|carnaval|p[aá]scoa|restaurant week|black friday|festa junina|s[aã]o jo[aã]o|halloween|copa)\b/i

/**
 * Aviso de conteúdo com PRAZO — estreito de propósito.
 *
 * Medido em 3.907 legendas: data dd/mm + nome de mês + urgência disparam em 5%,
 * e o que pegam é o que não pode voltar ("Dia das Mães", "Feliz Dia dos
 * Pais", "Restaurant Week"). 🔴 `pareceDado` (text-comparison.ts) dispara em
 * 97% — foi calibrado para blocos de arte, não serve aqui. Dia da semana só
 * conta quando é DIFERENTE do dia escolhido: "Domingo no Tero" numa sugestão
 * para domingo não é aviso.
 */
export function avisoDePrazo(legenda: string | null | undefined, diaEscolhido: number): string | null {
  if (!legenda) return null
  const texto = legenda.replace(/\s+/g, ' ')
  const comemorativa = texto.match(DATA_COMEMORATIVA_RE)
  if (comemorativa) return `fala em "${comemorativa[0]}"`
  const data = texto.match(DATA_RE)
  if (data) return `tem a data ${data[0].replace(/\s+/g, '')}`
  const urgencia = texto.match(URGENCIA_RE)
  if (urgencia) return `diz "${urgencia[0]}"`
  const mes = texto.match(MES_RE)
  if (mes) return `cita ${mes[0].toLowerCase()}`
  for (const [dia, re] of DIA_RE) {
    if (dia !== diaEscolhido && re.test(texto)) return `fala em ${DIAS_PT[dia]}`
  }
  return null
}

/** Agrupa os posts publicados pela IMAGEM; a arte mais recente de cada grupo manda. */
export function agruparPorArte(posts: PostPublicadoParaRepost[]): ArteParaRepost[] {
  const grupos = new Map<string, PostPublicadoParaRepost[]>()
  for (const p of posts) {
    if (!p.mediaUrl) continue
    const chave = chaveDaImagem(p.mediaUrl)
    const lista = grupos.get(chave) ?? []
    lista.push(p)
    grupos.set(chave, lista)
  }
  const artes: ArteParaRepost[] = []
  for (const [chave, lista] of grupos) {
    const ordenada = [...lista].sort((a, b) => b.quando.getTime() - a.quando.getTime())
    const ultimo = ordenada[0]
    // A Generation viva de QUALQUER uso serve — a mais recente primeiro.
    const comGen = ordenada.find((p) => p.generationUrl)
    artes.push({
      chave,
      url: comGen?.generationUrl ?? ultimo.mediaUrl,
      generationId: comGen?.generationId ?? ultimo.generationId,
      templateName: ultimo.templateName ?? comGen?.templateName ?? null,
      vezesUsada: lista.length,
      ultimoUso: ultimo.quando,
      ultimoPostId: ultimo.id,
      legenda: ultimo.caption?.trim() || null,
      alcance: ordenada.find((p) => p.alcance != null)?.alcance ?? null,
    })
  }
  return artes
}

export interface OpcoesDeRanking {
  /** O slot escolhido no formulário. */
  quando: Date
  agora?: Date
  teto?: number
  /** Chaves de imagem / generationIds já agendados à frente — não sugerir de novo. */
  jaAgendadas?: Set<string>
}

/** Pontua UMA arte para o slot — exposta para o teste dizer o porquê de cada posição. */
export function pontuar(arte: ArteParaRepost, slot: { dia: number; minutos: number }, agora: Date): SugestaoDeRepost {
  const ultimo = emBRT(arte.ultimoUso)
  const diasDesde = Math.floor((agora.getTime() - arte.ultimoUso.getTime()) / 86_400_000)
  const mesmoDia = ultimo.dia === slot.dia
  const distancia = Math.abs(ultimo.minutos - slot.minutos)
  const mesmaFaixa = distancia <= 120
  let pontos = 0
  if (mesmoDia) pontos += 3
  if (mesmaFaixa) pontos += 2
  else if (distancia <= 180) pontos += 1
  if (diasDesde >= 14 && diasDesde <= 60) pontos += 2
  if (diasDesde < 7) pontos -= 3
  if (arte.generationId) pontos += 1
  if (arte.vezesUsada === 1) pontos += 1
  if (arte.vezesUsada > 2) pontos -= arte.vezesUsada - 2
  const h = Math.floor(ultimo.minutos / 60)
  const m = ultimo.minutos % 60
  return {
    ...arte,
    diasDesde,
    diaDaSemana: ultimo.dia,
    hora: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    mesmoDia,
    mesmaFaixa,
    semaforo: semaforoPorIdade(diasDesde),
    avisoDePrazo: avisoDePrazo(arte.legenda, slot.dia),
    pontos,
  }
}

/**
 * A lista ranqueada para o slot. Ordena; nunca esconde por afinidade. O que
 * sai é só o que já está agendado à frente (a mesma peça duas vezes na mesma
 * semana sem querer) — e isso é decisão de quem chama, pelo `jaAgendadas`.
 */
export function ranquearRepost(posts: PostPublicadoParaRepost[], opcoes: OpcoesDeRanking): SugestaoDeRepost[] {
  const agora = opcoes.agora ?? new Date()
  const slot = emBRT(opcoes.quando)
  const ja = opcoes.jaAgendadas ?? new Set<string>()
  return agruparPorArte(posts)
    .filter((a) => !ja.has(a.chave) && !(a.generationId && ja.has(a.generationId)))
    .map((a) => pontuar(a, slot, agora))
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        a.vezesUsada - b.vezesUsada ||
        b.ultimoUso.getTime() - a.ultimoUso.getTime(),
    )
    .slice(0, opcoes.teto ?? TETO_PADRAO)
}

/** "há 21 dias" / "ontem" / "hoje" — o que o card diz. */
export function rotuloDeIdade(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/** "2ª vez" / "nunca repostada" / "5ª vez" — para o post NOVO, que seria o uso seguinte. */
export function rotuloDeUso(vezesUsada: number): string {
  if (vezesUsada <= 1) return 'nunca repostada'
  return `${vezesUsada + 1}ª vez`
}

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
