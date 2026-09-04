/**
 * A PASTA onde uma peça composta mora na aba de templates (03/09/2026;
 * separada por FORMATO em 04/09/2026).
 *
 * Regra combinada com o Ciro: a peça vai para o template da SEMANA a que ela
 * pertence — pela data prevista de publicação, não pela leva que a criou.
 * Pedido de uma arte só, só a sexta, ou a semana inteira caem no mesmo lugar.
 * Sem data, a peça vai para "Avulsas · <mês>", e ao ganhar data no
 * agendamento é movida para a semana (`moverPaginaParaSemana`).
 *
 * Desde 04/09/2026 a pasta é por semana **e por FORMATO**: story e feed não se
 * misturam mais. Era isso que fazia o Ciro "se perder" ao aprovar — a pasta da
 * semana 7-13/09 da Lagosta tinha 13 stories e 17 páginas de feed
 * intercaladas, e a aprovação de cada frente corre separada. Cada pasta leva o
 * `type`/`dimensions` do seu formato (o rótulo deixou de ser mentira), e a
 * chave da tag ganha o sufixo do formato (`semana:2026-09-07:story`). A tag
 * SEM sufixo continua nas tags: é por ela que se filtra a semana inteira.
 *
 * A ORDEM dentro da pasta é a de POSTAGEM — dia, horário e, entre slides do
 * mesmo carrossel, a posição do slide (`ordemDaPagina`). Antes disso nenhuma
 * peça gravava `Page.order` e o editor listava na ordem arbitrária do
 * Postgres.
 *
 * Módulo PURO: datas em BRT, nomes em português. Semana começa na segunda.
 */

import { DIMENSOES, type Formato } from './spec'

export const CATEGORIA_PROGRAMACAO = 'programacao'
export const CATEGORIA_AVULSAS = 'avulsas'

const FUSO = 'America/Sao_Paulo'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Como o formato aparece no NOME da pasta. */
export const ROTULO_DA_PASTA: Record<Formato, string> = { story: 'Stories', feed: 'Feed', quadrado: 'Quadrado' }

/** O `Template.type` de cada formato — a pasta agora tem um só. */
export const TIPO_DE_TEMPLATE: Record<Formato, 'STORY' | 'FEED' | 'SQUARE'> = { story: 'STORY', feed: 'FEED', quadrado: 'SQUARE' }

/** Partes da data em BRT. */
export function emBrasilia(data: Date): { ano: number; mes: number; dia: number; diaDaSemana: number; hora: number; minuto: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(data).map((x) => [x.type, x.value]))
  const semana = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday as string] ?? 0
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), diaDaSemana: semana, hora: Number(p.hour) % 24, minuto: Number(p.minute) }
}

export interface Semana {
  /** `AAAA-MM-DD` da segunda-feira, em BRT — a chave estável. */
  chave: string
  /** "Semana 8 a 14/09" — o miolo do nome do template. */
  nome: string
  inicio: { ano: number; mes: number; dia: number }
  fim: { ano: number; mes: number; dia: number }
}

function somarDias(ano: number, mes: number, dia: number, n: number) {
  const d = new Date(Date.UTC(ano, mes - 1, dia + n))
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

const dd = (n: number) => String(n).padStart(2, '0')

/** A semana (segunda a domingo, BRT) de uma data. */
export function semanaDe(data: Date): Semana {
  const b = emBrasilia(data)
  const recuo = (b.diaDaSemana + 6) % 7 // segunda = 0
  const inicio = somarDias(b.ano, b.mes, b.dia, -recuo)
  const fim = somarDias(inicio.ano, inicio.mes, inicio.dia, 6)
  const nome =
    inicio.mes === fim.mes
      ? `Semana ${inicio.dia} a ${fim.dia}/${dd(fim.mes)}`
      : `Semana ${inicio.dia}/${dd(inicio.mes)} a ${fim.dia}/${dd(fim.mes)}`
  return { chave: `${inicio.ano}-${dd(inicio.mes)}-${dd(inicio.dia)}`, nome, inicio, fim }
}

export interface PastaDaPeca {
  categoria: typeof CATEGORIA_PROGRAMACAO | typeof CATEGORIA_AVULSAS
  nome: string
  /** Tag que identifica a pasta de forma estável: período + formato. */
  chave: string
  /** A mesma tag SEM o formato — é por ela que se filtra a semana inteira. */
  chaveDoPeriodo: string
  formato: Formato
  tipo: 'STORY' | 'FEED' | 'SQUARE'
  dimensoes: string
  tags: string[]
}

/** Lê `quando` (ISO ou Date). Inválido = sem data. */
export function dataDe(quando: string | Date | null | undefined): Date | null {
  if (!quando) return null
  const d = quando instanceof Date ? quando : new Date(quando)
  return Number.isNaN(d.getTime()) ? null : d
}

function montarPasta(args: { categoria: PastaDaPeca['categoria']; periodo: string; miolo: string; formato: Formato }): PastaDaPeca {
  const { width, height } = DIMENSOES[args.formato]
  return {
    categoria: args.categoria,
    nome: `${ROTULO_DA_PASTA[args.formato]} · ${args.miolo}`,
    chave: `${args.periodo}:${args.formato}`,
    chaveDoPeriodo: args.periodo,
    formato: args.formato,
    tipo: TIPO_DE_TEMPLATE[args.formato],
    dimensoes: `${width}x${height}`,
    // A tag do período fica ao lado da chave com formato: quem filtra a semana
    // inteira (a aba, o `chaveDaSemana` da classificação) continua achando.
    tags: [args.categoria, args.periodo, `${args.periodo}:${args.formato}`],
  }
}

/** Onde a peça mora: a semana da data, ou as avulsas do mês — sempre no seu formato. */
export function pastaDaPeca(quando: string | Date | null | undefined, formato: Formato, agora: Date = new Date()): PastaDaPeca {
  const data = dataDe(quando)
  if (data) {
    const s = semanaDe(data)
    return montarPasta({ categoria: CATEGORIA_PROGRAMACAO, periodo: `semana:${s.chave}`, miolo: s.nome, formato })
  }
  const b = emBrasilia(agora)
  return montarPasta({ categoria: CATEGORIA_AVULSAS, periodo: `mes:${b.ano}-${dd(b.mes)}`, miolo: `Avulsas · ${MESES[b.mes - 1]}`, formato })
}

/**
 * Quantos slides cabem num mesmo minuto na ordenação. Teto folgado: o maior
 * carrossel do Instagram tem 20 mídias, e o produto `minutos × 100` cabe em
 * Int com sobra (10079 × 100 + 20).
 */
export const SLIDES_POR_MINUTO = 100

/**
 * A ordem de POSTAGEM da página dentro da pasta da semana: minutos desde a
 * segunda 00:00 BRT, com o slide como desempate no mesmo minuto.
 *
 * `null` quando não há data — a peça está nas avulsas, e lá quem ordena é a
 * chegada (`ordemNaPasta` cai em max+1).
 */
export function ordemDaPagina(quando: string | Date | null | undefined, slide?: number | null): number | null {
  const data = dataDe(quando)
  if (!data) return null
  const b = emBrasilia(data)
  const minutosNaSemana = ((b.diaDaSemana + 6) % 7) * 1440 + b.hora * 60 + b.minuto
  const s = Math.min(Math.max(Math.trunc(slide ?? 0), 0), SLIDES_POR_MINUTO - 1)
  return minutosNaSemana * SLIDES_POR_MINUTO + s
}

/**
 * Os campos são opcionais porque o projeto roda com `strict: false`, e ali o
 * `z.infer` da spec marca TODA chave como opcional — campo obrigatório no zod
 * chega aqui tipado como opcional. A garantia é de runtime (`validarSpec`), e
 * quem lê confere antes de usar.
 */
/**
 * "Qui 10/09 · 19:30" — data e hora em BRT na MESMA forma do nome da página.
 *
 * Mora aqui, e não na tela, para o horário que o botão "Agendar" promete não
 * poder divergir do que está escrito na faixa ao lado dele. String vazia em
 * data inválida: rótulo de botão não é lugar para "Invalid Date".
 */
export function horarioCurto(quando: string | Date | null | undefined): string {
  const d = dataDe(quando)
  if (!d) return ''
  const b = emBrasilia(d)
  return `${DIAS[b.diaDaSemana]} ${dd(b.dia)}/${dd(b.mes)} · ${dd(b.hora)}:${dd(b.minuto)}`
}

export interface CarrosselDaPagina {
  /** Posição no carrossel como ele sai no Instagram, 1 = capa. */
  slide?: number | null
  /** Total de mídias do carrossel, quando se sabe. */
  de?: number | null
}

/**
 * "Qua 09/09 · 19:30 · Seu Quinto · slide 2/5" — o nome da página na pasta.
 *
 * Leva a DATA (não só o dia da semana) porque é o que a equipe lê ao corrigir
 * e aprovar, e o número do SLIDE porque sem ele os quatro slides do mesmo
 * carrossel saíam com nomes idênticos. O formato NÃO entra: ele já é o começo
 * do nome da pasta.
 */
export function nomeDaPagina(args: {
  quando?: string | Date | null
  tema?: string | null
  nome?: string | null
  carrossel?: CarrosselDaPagina | null
  /**
   * Desempate de última hora: a N-ésima peça composta para o MESMO minuto sem
   * declarar o slide. Só entra quando não há carrossel declarado, e diz "peça"
   * porque é a ordem de composição, não a posição no Instagram.
   */
  peca?: number | null
}): string {
  const data = dataDe(args.quando)
  const partes: string[] = []
  if (data) {
    const b = emBrasilia(data)
    partes.push(`${DIAS[b.diaDaSemana]} ${dd(b.dia)}/${dd(b.mes)}`)
    partes.push(`${dd(b.hora)}:${dd(b.minuto)}`)
  }
  const assunto = (args.tema ?? args.nome ?? '').trim()
  if (assunto) partes.push(assunto.slice(0, 60))
  const c = args.carrossel
  if (c && typeof c.slide === 'number' && Number.isFinite(c.slide)) partes.push(c.de ? `slide ${c.slide}/${c.de}` : `slide ${c.slide}`)
  else if (typeof args.peca === 'number' && args.peca > 1) partes.push(`peça ${args.peca}`)
  return partes.join(' · ')
}
