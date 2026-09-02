/**
 * A GRADE APROVADA do cliente, lida da base de conhecimento.
 *
 * O que estava faltando (teste real de 01/09/2026, O Quintal Parrilla):
 * `sugerir-posts` propôs quinta às 10h e 13h pelo HISTÓRICO, enquanto a base
 * tinha a entrada "Padrões de Postagem — O Quintal Parrilla" com a grade que o
 * Ciro aprovou em 24/08 — "SLOT FIXO 1 — 08h, de segunda a domingo", "SLOT
 * FIXO 2 — entre 9h e 10h, de segunda a sexta", "SLOT FIXO 3 — entre 14h e
 * 14h30, de terça a sexta". Nenhum código lia essa entrada: a cadência do
 * histórico é o que o cliente FAZIA, e a grade é o que foi COMBINADO.
 *
 * Este módulo é PURO (sem Prisma, sem rede — precedente de `cadencia.ts` e
 * `dia-semana.ts`): recebe o TEXTO da entrada e devolve os slots fixos. Quem
 * busca as entradas e liga o resultado à sugestão é `sugerir-posts.ts`.
 *
 * ── O PARSER É TOLERANTE, MAS DESCONFIADO ─────────────────────────────────
 * A entrada real do Quintal tem linhas de CONTEXTO com hora e dia que NÃO são
 * slots — "segunda das 11h às 16h, terça a sábado das 11h às 00h" é o horário
 * de funcionamento, "Happy hour, das 16h às 19h" é o conteúdo do post, "11h e
 * 12h no fim de semana" é orientação para os slots LIVRES. Um parser que
 * pegasse toda linha com hora inventaria uma grade de doze horários a partir
 * de uma grade de três. Por isso a linha só vale como slot quando:
 *
 *  1. DECLARA um slot ANTES da primeira hora ("slot", "story/stories",
 *     "post/postar/publicar") — é como a casa escreve a grade nas duas
 *     entradas reais (Quintal e Bacana);
 *  2. NÃO fala de feed/carrossel (a cadência de feed é outra entrada) nem de
 *     "livre" (slot livre não é fixo);
 *  3. a hora não vem em construção de FUNCIONAMENTO ("das 11h às 16h",
 *     "abre 11h30", "a partir das 17h", "até 23h").
 *
 * Os DIAS se leem do texto FORA dos parênteses: no Bacana, "SLOT 3 — 17h30,
 * todos os dias (… na SEGUNDA ela não abre …)" tem "segunda" só na explicação.
 * O TEMA é o que vem entre parênteses logo depois da hora, ou depois de ":"
 * quando esse trecho não contém hora.
 */

import { normalizar } from '@/lib/posts/dia-semana'

export interface SlotFixo {
  /** 'HH:mm' — no intervalo ("entre 9h e 10h") vale o INÍCIO. */
  hora: string
  /** 0=domingo … 6=sábado. */
  dias: number[]
  tema?: string
  origem: 'grade'
  /** A linha da base de onde o slot saiu — vira o motivo da sugestão. */
  linha: string
}

/** Versão do parser — entra na chave de sugestão dos slots vindos da grade. */
export const VERSAO_DA_GRADE = 'grade-v1'

const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]

const DIA_POR_TOKEN: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6,
}

const RE_DIA = /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)(?:-feiras?|s)?\b/g
/** "9h", "09h30", "14:00" — nunca "200g", "29/08" ou "1kg". */
const RE_HORA = /\b(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?!\d)/g
/** A linha DECLARA um slot de postagem. */
const RE_DECLARA_SLOT = /\b(slots?|story|stories|posts?|postar|postagem|postagens|publicar|publicacao|publicacoes)\b/
const RE_LINHA_FORA = /\b(feed|carross\w*|livres?)\b/
const RE_TODOS_OS_DIAS = /\b(todos os dias|todo dia|todo o dia|diariamente|diario|diaria)\b/
const RE_FIM_DE_SEMANA = /\b(fim|fins|final|finais) de semana\b/
const RE_DIA_UTIL = /\bdias? uteis\b|\bdia util\b/
/** Hora que é FUNCIONAMENTO, não slot: o que vem logo antes dela. */
const RE_FUNCIONAMENTO_ANTES = /\b(das|abre|abrem|fecha|fecham|ate|servido|servida|funciona|partir)\s*(das?|as?|de|do|dos)?\s*$/
const RE_CONECTOR_INTERVALO = /^\s*(as|ate|a|-|–|—)\s*$/
const RE_CONECTOR_INTERVALO_ENTRE = /^\s*(e|a|as|ate|-|–|—)\s*$/
const RE_CONECTOR_LISTA = /^\s*(,|e|nem|\/|ou)\s*$/
const RE_EXCLUI_ANTES = /\b(exceto|menos|salvo|tirando|nunca|nao)\b[^a-z0-9]*(na|no|nas|nos|aos|as|os|a|o|em|de)?\s*$/

const TEMA_MAX = 120

/**
 * Quebra a entrada em linhas e devolve os slots fixos que ela declara.
 * Texto sem grade (ou só com contexto) devolve `[]`.
 */
export function lerGradeDaBase(texto: string): SlotFixo[] {
  const slots: SlotFixo[] = []
  const vistos = new Set<string>()

  for (const linhaCrua of (texto ?? '').split(/\r?\n/)) {
    const linha = linhaCrua.trim()
    if (!linha) continue
    const n = normalizar(linha)
    if (RE_LINHA_FORA.test(n)) continue

    const horas = lerHoras(n)
    if (horas.length === 0) continue

    // A declaração de slot tem de vir ANTES da primeira hora: "os stories do
    // dia falam apenas da Praia da Costa" depois de "abre 11h30" não é grade.
    const declara = RE_DECLARA_SLOT.exec(n)
    if (!declara || declara.index > horas[0].index) continue

    const dias = lerDias(semParenteses(n))
    if (dias.length === 0) continue

    const temaDaLinha = temaDepoisDosDoisPontos(linha, n)

    for (let i = 0; i < horas.length; i++) {
      const h = horas[i]
      if (!h.valeComoSlot) continue
      const fimDoTrecho = i + 1 < horas.length ? horas[i + 1].index : linha.length
      const tema = temaEntreParenteses(linha.slice(h.end, fimDoTrecho)) ?? temaDaLinha
      const slot: SlotFixo = {
        hora: `${String(h.hora).padStart(2, '0')}:${String(h.minutos).padStart(2, '0')}`,
        dias,
        origem: 'grade',
        linha,
        ...(tema ? { tema } : {}),
      }
      const chave = `${slot.hora}|${dias.join(',')}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      slots.push(slot)
    }
  }

  return slots
}

/**
 * Várias entradas da base de uma vez. Entrada cujo TÍTULO fala de feed ou
 * carrossel fica de fora inteira — no Bacana a cadência do feed vive numa
 * entrada com a tag `cadencia` e linhas com dia e hora ("qui 03/09 18h30 —
 * carnes no kilo"), e nenhuma delas é grade de story.
 */
export function lerGradeDasEntradas(entradas: Array<{ title: string; content: string }>): SlotFixo[] {
  const slots: SlotFixo[] = []
  const vistos = new Set<string>()
  for (const entrada of entradas) {
    if (RE_LINHA_FORA.test(normalizar(entrada.title ?? ''))) continue
    for (const slot of lerGradeDaBase(entrada.content ?? '')) {
      const chave = `${slot.hora}|${slot.dias.join(',')}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      slots.push(slot)
    }
  }
  return slots
}

// ── Fusão com a cadência ───────────────────────────────────────────────────

export interface SlotDeCadenciaMinimo {
  minutosDoDia: number
  hora: string
  motivo: string
}

export interface SlotFundido {
  minutosDoDia: number
  hora: string
  motivo: string
  origem: 'grade' | 'cadencia'
  tema?: string
}

/**
 * Nos dias que a grade COBRE, os slots fixos SUBSTITUEM os horários típicos do
 * histórico; nos dias que ela não cobre, a cadência continua valendo. A grade
 * é o combinado; o histórico, o hábito — e onde há combinado, ele manda.
 *
 * Com grade vazia é a identidade (só troca o formato), então `sugerir-posts`
 * chama sempre e não precisa de dois caminhos.
 */
export function fundirGradeComCadencia<T extends SlotDeCadenciaMinimo>(
  slotsPorDia: Map<number, T[]>,
  grade: SlotFixo[],
): Map<number, SlotFundido[]> {
  const porDia = new Map<number, SlotFundido[]>()

  for (const slot of grade) {
    const [h, m] = slot.hora.split(':').map(Number)
    const minutosDoDia = h * 60 + m
    for (const dia of slot.dias) {
      const lista = porDia.get(dia) ?? []
      if (lista.some((s) => s.minutosDoDia === minutosDoDia)) continue
      lista.push({
        minutosDoDia,
        hora: slot.hora,
        motivo: `grade aprovada do cliente: ${slot.linha}`,
        origem: 'grade',
        ...(slot.tema ? { tema: slot.tema } : {}),
      })
      porDia.set(dia, lista)
    }
  }
  for (const lista of porDia.values()) lista.sort((a, b) => a.minutosDoDia - b.minutosDoDia)

  for (const [dia, tipicos] of slotsPorDia) {
    if (porDia.has(dia)) continue
    porDia.set(
      dia,
      tipicos.map((t) => ({ minutosDoDia: t.minutosDoDia, hora: t.hora, motivo: t.motivo, origem: 'cadencia' as const })),
    )
  }

  return porDia
}

// ── Horas ──────────────────────────────────────────────────────────────────

interface HoraLida {
  hora: number
  minutos: number
  index: number
  end: number
  valeComoSlot: boolean
}

function lerHoras(n: string): HoraLida[] {
  const brutas: HoraLida[] = []
  RE_HORA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_HORA.exec(n)) !== null) {
    const hora = Number(m[1])
    const minutos = Number(m[2] ?? m[3] ?? 0)
    if (hora > 23 || minutos > 59) continue
    brutas.push({ hora, minutos, index: m.index, end: m.index + m[0].length, valeComoSlot: true })
  }

  for (let i = 0; i < brutas.length; i++) {
    const h = brutas[i]
    const antes = n.slice(Math.max(0, h.index - 24), h.index)
    if (RE_FUNCIONAMENTO_ANTES.test(antes)) h.valeComoSlot = false

    // A hora seguinte é o FIM de um intervalo? "entre 9h e 10h" (vale o
    // início), "14h às 14h30", "das 11h às 16h" (funcionamento: nenhuma vale).
    const proxima = brutas[i + 1]
    if (!proxima) continue
    const gap = n.slice(h.end, proxima.index)
    const precedidaDeEntre = /\bentre\s*$/.test(antes)
    const ehIntervalo = precedidaDeEntre ? RE_CONECTOR_INTERVALO_ENTRE.test(gap) : RE_CONECTOR_INTERVALO.test(gap)
    if (ehIntervalo) proxima.valeComoSlot = false
  }

  return brutas
}

// ── Dias ───────────────────────────────────────────────────────────────────

function semParenteses(n: string): string {
  return n.replace(/\([^)]*\)/g, ' ')
}

interface DiaLido {
  dia: number
  abreviado: boolean
  index: number
  end: number
}

function lerDias(n: string): number[] {
  const tokens: DiaLido[] = []
  RE_DIA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_DIA.exec(n)) !== null) {
    tokens.push({ dia: DIA_POR_TOKEN[m[1]], abreviado: m[1].length === 3, index: m.index, end: m.index + m[0].length })
  }

  const gap = (k: number) => n.slice(tokens[k].end, tokens[k + 1].index)
  const ehIntervalo = (k: number) => k + 1 < tokens.length && RE_CONECTOR_INTERVALO.test(gap(k))
  const ehLista = (k: number) => k + 1 < tokens.length && RE_CONECTOR_LISTA.test(gap(k))

  // Abreviação de três letras só vale em RANGE ou LISTA com outro dia
  // ("seg–sáb", "ter a sex", "seg, qua e sex"): solta, "ter" é o verbo.
  const valido = (k: number): boolean => {
    if (!tokens[k].abreviado) return true
    const comProximo = ehIntervalo(k) || ehLista(k)
    const comAnterior = k > 0 && (ehIntervalo(k - 1) || ehLista(k - 1))
    return comProximo || comAnterior || n[tokens[k].end] === '.'
  }

  const incluidos = new Set<number>()
  const excluidos = new Set<number>()
  let excluindo = false

  for (let k = 0; k < tokens.length; k++) {
    if (!valido(k)) { excluindo = false; continue }
    const antes = n.slice(Math.max(0, tokens[k].index - 20), tokens[k].index)
    // "exceto segunda", "nunca na segunda, no sábado nem no domingo": a
    // exclusão se propaga pela lista que a segue.
    if (RE_EXCLUI_ANTES.test(antes)) excluindo = true
    else if (!(k > 0 && ehLista(k - 1) && excluindo)) excluindo = false

    const alvo = excluindo ? excluidos : incluidos
    if (ehIntervalo(k) && valido(k + 1)) {
      for (const d of intervalo(tokens[k].dia, tokens[k + 1].dia)) alvo.add(d)
      k++ // o fim do intervalo já entrou
    } else {
      alvo.add(tokens[k].dia)
    }
  }

  if (RE_FIM_DE_SEMANA.test(n)) { incluidos.add(6); incluidos.add(0) }
  if (RE_DIA_UTIL.test(n)) for (const d of [1, 2, 3, 4, 5]) incluidos.add(d)

  const base = RE_TODOS_OS_DIAS.test(n) || incluidos.size === 0 ? TODOS_OS_DIAS : TODOS_OS_DIAS.filter((d) => incluidos.has(d))
  return base.filter((d) => !excluidos.has(d))
}

/** De `de` até `ate` na ordem da semana, com volta ("segunda a domingo"). */
function intervalo(de: number, ate: number): number[] {
  const dias: number[] = []
  let d = de
  for (let passos = 0; passos < 7; passos++) {
    dias.push(d)
    if (d === ate) break
    d = (d + 1) % 7
  }
  return dias
}

// ── Tema ───────────────────────────────────────────────────────────────────

function limparTema(t: string): string | undefined {
  const limpo = t.replace(/\s+/g, ' ').trim().replace(/^[,;:\-–—]\s*/, '').replace(/[,;.\s]+$/, '')
  if (!limpo) return undefined
  return limpo.length > TEMA_MAX ? `${limpo.slice(0, TEMA_MAX - 1)}…` : limpo
}

function temaEntreParenteses(trecho: string): string | undefined {
  const m = /\(([^)]+)\)/.exec(trecho)
  return m ? limparTema(m[1]) : undefined
}

/**
 * O que vem depois do ÚLTIMO ":" que não é parte de hora ("14:00") — e só
 * quando esse trecho não tem hora nenhuma ("3 stories por dia: 9h, 12h e 17h"
 * não tem tema; "seg a sex: story às 9h" também não).
 */
function temaDepoisDosDoisPontos(linha: string, n: string): string | undefined {
  let pos = -1
  for (let i = n.length - 1; i >= 0; i--) {
    if (n[i] !== ':') continue
    const dentroDeHora = /\d/.test(n[i - 1] ?? '') && /\d/.test(n[i + 1] ?? '')
    if (dentroDeHora) continue
    pos = i
    break
  }
  if (pos < 0) return undefined
  const depois = n.slice(pos + 1)
  RE_HORA.lastIndex = 0
  if (RE_HORA.test(depois)) return undefined
  return limparTema(linha.slice(pos + 1))
}
