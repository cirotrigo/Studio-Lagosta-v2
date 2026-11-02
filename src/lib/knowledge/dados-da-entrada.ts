/**
 * Os `dados` estruturados de uma entrada da base: o que a pessoa pode alterar pelo MCP, a versão que evita sobrescrita
 * e a coerência com os textos do cliente. `dados` é a parte da PESSOA em `metadata` (ver `marca-de-indexado.ts`).
 *
 * Módulo PURO, sem Prisma: `operacao-da-base.ts` lê e grava; aqui só se decide.
 *
 * Não existe formato único (35 chaves distintas em 12 clientes, levantadas em 02/11/2026): a lista fechada
 * abaixo cobre os vocabulários REAIS de horário, endereço e happy hour. Cardápio e promoções ficam de fora de propósito.
 */
import { createHash } from 'node:crypto'
import { metadataComoObjeto, metadataDaPessoa } from './marca-de-indexado'

const DIAS_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DIAS_PT = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const
const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]

type TipoDoValor = 'faixas' | 'dias' | 'texto'
interface CampoPermitido {
  padrao: RegExp
  tipo: TipoDoValor
  exemplo: string
}

/** Só altera chave que já existe: criar `address` ao lado de `endereco`, ou `horarios.quarta` ao lado de `horarios.terca-sabado`, daria duas verdades. */
const CAMPOS: CampoPermitido[] = [
  { padrao: new RegExp(`^hours\\.(${DIAS_EN.join('|')})$`), tipo: 'faixas', exemplo: 'hours.monday' },
  { padrao: /^horarios\.[a-z]+(-[a-z]+)?$/, tipo: 'faixas', exemplo: 'horarios.segunda' },
  { padrao: /^horarios_funcionamento\.[a-z_]+$/, tipo: 'faixas', exemplo: 'horarios_funcionamento.todos_os_dias' },
  { padrao: /^delivery\.[a-z_]+$/, tipo: 'faixas', exemplo: 'delivery.segunda_a_quinta' },
  { padrao: /^happy_hour\.(time|horario)$/, tipo: 'faixas', exemplo: 'happy_hour.time' },
  { padrao: /^happy_hour\.(days|dias)$/, tipo: 'dias', exemplo: 'happy_hour.days' },
  { padrao: /^happy_hour\.(offer|desconto)$/, tipo: 'texto', exemplo: 'happy_hour.offer' },
  { padrao: /^(address|endereco)$/, tipo: 'texto', exemplo: 'address' },
]
export const CAMPOS_PERMITIDOS = CAMPOS.map((c) => c.exemplo)

export interface Alteracao {
  campo: string
  valor: string
}
export interface ProblemaDeCampo {
  campo: string
  motivo: string
}
export interface MudancaDeCampo {
  campo: string
  antes: unknown
  depois: unknown
}

function minutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
}

/** Cada faixa "HH:MM-HH:MM"; turnos separados por ", ". Fim 24:00 ou 00:00 é meia-noite; fim antes do início atravessa a madrugada. */
function problemaDasFaixas(valor: string): string | null {
  const turnos: [number, number][] = []
  for (const faixa of valor.split(', ')) {
    const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(faixa)
    if (!m) return `"${faixa}" não está no formato HH:MM-HH:MM`
    const [inicio, fim] = [minutos(m[1]), minutos(m[2])]
    if (inicio > 23 * 60 + 59 || Number(m[1].slice(3)) > 59) return `início inválido em "${faixa}"`
    if (fim > 24 * 60 || Number(m[2].slice(3)) > 59) return `fim inválido em "${faixa}"`
    if (inicio === fim % (24 * 60)) return `início e fim iguais em "${faixa}"`
    turnos.push([inicio, fim <= inicio ? fim + 24 * 60 : fim])
  }
  // O turno que atravessa a madrugada também ocupa o começo do dia seguinte: compara em linha do tempo, não por ordem.
  const cruzam = (a: [number, number], b: [number, number]) => [-1, 0, 1].some((d) => a[0] < b[1] + d * 24 * 60 && b[0] + d * 24 * 60 < a[1])
  const sobrepostos = turnos.some((a, i) => turnos.slice(i + 1).some((b) => cruzam(a, b)))
  return sobrepostos ? `os turnos se sobrepõem em "${valor}"` : null
}

function problemaDosDias(campo: string, valor: string): string | null {
  const dias: readonly string[] = campo.endsWith('.days') ? DIAS_EN : DIAS_PT
  if (!campo.endsWith('.days') && valor === 'todos_os_dias') return null
  const partes = valor.split('-')
  return partes.length <= 2 && partes.every((p) => dias.includes(p)) ? null : `use um dia ou intervalo como "${dias[1]}-${dias[4]}"`
}

function problemaDoTexto(valor: string): string | null {
  if (!valor.trim()) return 'não pode ficar vazio'
  if (valor.length > 300 || /\n/.test(valor)) return 'deve ser uma linha de até 300 caracteres'
  return null
}

function folhaDe(dados: Record<string, unknown>, campo: string): { pai: Record<string, unknown> | null; chave: string } {
  const partes = campo.split('.')
  const chave = partes.pop() as string
  if (partes.length === 0) return { pai: dados, chave }
  const pai = Object.hasOwn(dados, partes[0]) ? dados[partes[0]] : undefined
  return { pai: pai && typeof pai === 'object' && !Array.isArray(pai) ? (pai as Record<string, unknown>) : null, chave }
}

/** Confere o pedido contra a lista fechada e contra o que a entrada já tem. Lista vazia = pode aplicar. */
export function problemasDasAlteracoes(dados: Record<string, unknown>, alteracoes: Alteracao[]): ProblemaDeCampo[] {
  const problemas: ProblemaDeCampo[] = []
  const vistos = new Set<string>()
  for (const { campo, valor } of alteracoes) {
    const regra = CAMPOS.find((c) => c.padrao.test(campo))
    if (vistos.has(campo)) problemas.push({ campo, motivo: 'campo repetido no mesmo pedido' })
    vistos.add(campo)
    if (!regra) {
      problemas.push({ campo, motivo: 'campo fora da lista permitida' })
      continue
    }
    const { pai, chave } = folhaDe(dados, campo)
    // Sem o objeto pai a entrada usa OUTRO vocabulário: criar `hours` ao lado de `horarios` daria duas verdades na mesma linha.
    if (!pai) {
      problemas.push({ campo, motivo: `esta entrada não tem "${campo.split('.')[0]}" como objeto` })
      continue
    }
    if (!Object.hasOwn(pai, chave)) {
      problemas.push({ campo, motivo: 'só altera chave que já existe nesta entrada' })
      continue
    }
    const motivo = regra.tipo === 'faixas' ? problemaDasFaixas(valor) : regra.tipo === 'dias' ? problemaDosDias(campo, valor) : problemaDoTexto(valor)
    if (motivo) problemas.push({ campo, motivo })
  }
  return problemas
}

/** Aplica sobre uma cópia: o que não foi pedido fica como estava, inclusive chave que ninguém conhece. */
export function aplicarAlteracoes(dados: Record<string, unknown>, alteracoes: Alteracao[]): Record<string, unknown> {
  const novo = structuredClone(dados)
  for (const { campo, valor } of alteracoes) {
    const { pai, chave } = folhaDe(novo, campo)
    if (pai) pai[chave] = valor
  }
  return novo
}

function folhas(valor: unknown, prefixo: string, saida: Map<string, unknown>): void {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    for (const [k, v] of Object.entries(valor)) folhas(v, prefixo ? `${prefixo}.${k}` : k, saida)
  } else if (prefixo) {
    saida.set(prefixo, valor)
  }
}

export function diffDeDados(antes: Record<string, unknown>, depois: Record<string, unknown>): MudancaDeCampo[] {
  const [a, d] = [new Map<string, unknown>(), new Map<string, unknown>()]
  folhas(antes, '', a)
  folhas(depois, '', d)
  return [...new Set([...a.keys(), ...d.keys()])]
    .filter((campo) => JSON.stringify(a.get(campo)) !== JSON.stringify(d.get(campo)))
    .sort()
    .map((campo) => ({ campo, antes: a.get(campo) ?? null, depois: d.get(campo) ?? null }))
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico)
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => [k, canonico(v)]))
  }
  return valor
}
function hash(valor: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonico(valor))).digest('hex').slice(0, 16)
}

export interface CamposDaVersao {
  title: string
  content: string
  category: string
  status: string
  tags: string[]
  expiresAt: Date | null
  metadata: unknown
}
/**
 * A versão esperada. Hash, e não `updatedAt`: cada renovação do arrendamento da indexação avança o `updatedAt`, e a
 * operação tomaria conflito sem ninguém ter mudado nada. Só entra o que a pessoa controla.
 */
export function versaoDaEntrada(linha: CamposDaVersao): string {
  return hash([linha.title, linha.content, linha.category, linha.status, linha.tags, linha.expiresAt, metadataDaPessoa(linha.metadata)])
}
/** Identifica o PEDIDO: o mesmo `operacaoId` com outro conteúdo é reuso indevido, nunca repetição. */
export function hashDoPedido(pedido: unknown): string {
  return hash(pedido)
}

/** O que `consultar-base` mostra: `origem`/`revisao` são carimbos de quem gravou, e as chaves do sistema nunca são fato do cliente. */
export function dadosVisiveis(metadata: unknown): Record<string, unknown> | undefined {
  const { origem: _o, revisao: _r, ...resto } = metadataDaPessoa(metadata)
  return Object.keys(resto).length > 0 ? resto : undefined
}

// ── Coerência entre dados e textos ──────────────────────────────────────────

export interface LinhaDaBase {
  id: string
  title: string
  content: string
  updatedAt: Date
  expiresAt: Date | null
  metadata: unknown
}
export interface Divergencia {
  campo: string
  valorNosDados: string
  valorNoTexto: string
  trecho: string
  origem: { entradaId: string; titulo: string; atualizadaEm: string }
  /** A entrada dona do campo: o texto de uma entrada pode contradizer os dados de outra. */
  entradaDosDados?: string
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const DIA_RE = `(?:${DIAS_PT.map((d) => (d === 'sabado' || d === 'domingo' ? d : `${d}(?:-feira)?`)).join('|')}|${DIAS_CURTOS.join('|')})\\b`
const DIAS_RE = `(?:todos os dias|${DIA_RE}(?:\\s*(?:,|e|a|–|—|-)\\s*${DIA_RE})*)`
const HORA_RE = `(?:\\d{1,2}(?:h\\d{0,2}|:\\d{2})|meia[- ]noite|meio[- ]dia)`
const ATE_RE = `\\s*(?:as?|ate|–|—|-)\\s*`
// Exige "das": "qui só à tarde 15–18h" é medição de engajamento e "ter–sex, 16h–19h" é mecânica, não funcionamento.
const VERBO_DA_CASA = '(?:funcionam?|funcionamos|abrem?|abrimos|(?:estamos|ficamos|esta|fica)\\s+abert[ao]s?)'
const ADVERBIO_RE = '(?:habitualmente|normalmente)'
const FAIXA_DO_DIA = new RegExp(`\\b(${DIAS_RE})[\\s:,–—-]*(?:${VERBO_DA_CASA}\\s+|${ADVERBIO_RE}\\s+)*das?\\s+(${HORA_RE})${ATE_RE}(${HORA_RE})`, 'g')
const TURNO_SEGUINTE = new RegExp(`^\\s*(?:,|e)\\s*das?\\s+(${HORA_RE})${ATE_RE}(${HORA_RE})`)
const FECHA_DO_DIA = new RegExp(`\\b(${DIAS_RE})\\s+(?:a casa\\s+)?fecha\\s+as\\s+(${HORA_RE})`, 'g')
const FAIXA = new RegExp(`\\bdas?\\s+(${HORA_RE})${ATE_RE}(${HORA_RE})`, 'g')

/** Serviço com horário próprio na mesma linha: não é o funcionamento da casa. */
const OUTRO_SERVICO = /executivo|delivery|entrega|ifood|retirada|cozinha|brunch/
const HAPPY_HOUR = /happy[ -]?hour/
/**
 * A faixa é de outro assunto só com sujeito colado nela: "segunda e domingo funcionam das 11h às 17h", "Almoço das 11h".
 * Palavra solta não muda de quem ela é ("na varanda aberta", "antes do jantar"): sem sujeito, vale o happy hour.
 */
const CASA_NA_FAIXA = new RegExp(`(?:\\b${DIAS_RE}[\\s:,–—-]*${VERBO_DA_CASA}\\s+(?:${ADVERBIO_RE}\\s+)*|(?:a casa\\s+(?:funciona|abre)|funcionamento(?:\\s+habitual)?)[\\s:]+(?:de\\s+)?${DIAS_RE}[\\s:,–—-]*)das?\\s+${HORA_RE}`)
/** "Terça a sexta das 16h às 19h, jantar das 19h às 23h": cada faixa se julga no seu trecho, um sujeito não leva a vizinha. */
const ANTES_DO_SUJEITO = new RegExp(`(?<=\\d|\\dh|noite|dia)(?:[,:]|\\se)\\s+(?=(?:${DIAS_RE}[\\s:,–—-]*${VERBO_DA_CASA}\\s|a casa\\s+(?:funciona|abre)|funcionamento|(?:o\\s+)?(?:almoco|jantar)\\b))`)
const REFEICAO_NA_FAIXA = new RegExp(`(?<!(?:antes|depois) d[oe] |apos o )\\b(?:almoco|jantar)\\b:?[^,;:]*?\\bdas?\\s+${HORA_RE}`)
/** "Horário de funcionamento e happy hour" não empresta assunto. "Happy Hour: horários e condições" empresta: sem sinal claro, vale o exclusivo. */
const TITULO_MISTO = /funcionamento|expediente|almoco|jantar|\bhorarios?\s+(?:da casa|e\s+happy)|happy[ -]?hour\s+e\s+horarios?\b/
/** Linha que fala de uma data ou de feriado é exceção: fica preservada e não se compara com o horário habitual. */
const DATADA = /\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} de (?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|feriado|vespera|natal|reveillon|carnaval|pascoa|excepcional/
/** "habitual" sozinho não serve: "no lugar do horário habitual" é justamente a exceção. */
const VALE_SEMPRE = /habitualmente|vigente desde|nao e excecao/

function horaDe(token: string, comoFim: boolean): string {
  if (token.startsWith('meia')) return '24:00'
  if (token.startsWith('meio')) return '12:00'
  const [h, m = ''] = token.split(/[h:]/)
  const hora = `${h.padStart(2, '0')}:${m.padEnd(2, '0')}`
  return comoFim && hora === '00:00' ? '24:00' : hora
}

function diasDe(expressao: string): number[] {
  if (expressao.startsWith('todos')) return TODOS_OS_DIAS
  const dias: number[] = []
  const re = new RegExp(`(${DIA_RE})|(a|–|—|-)`, 'g')
  let intervalo = false
  for (const m of expressao.matchAll(re)) {
    if (m[2]) {
      intervalo = true
      continue
    }
    const dia = DIAS_CURTOS.indexOf(m[1].slice(0, 3) as (typeof DIAS_CURTOS)[number])
    if (intervalo) for (let d = (dias[dias.length - 1] + 1) % 7; d !== dia; d = (d + 1) % 7) dias.push(d)
    dias.push(dia)
    intervalo = false
  }
  return dias
}

const faixaNormal = (valor: string) => valor.split(', ').map((f) => f.replace(/-00:00$/, '-24:00')).join(', ')

/** As cláusulas de uma linha. A que segue uma data herda a exceção ("Natal: seg das 11h às 14h; ter das 11h às 15h"), até uma que se diga regra. */
function clausulasDaLinha(linha: string): { clausula: string; datada: boolean }[] {
  let datada = false
  return linha
    .split(/\s·\s|;\s*|(?<=[.!?])\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((clausula) => {
      const c = semAcento(clausula)
      datada = !VALE_SEMPRE.test(c) && (datada || DATADA.test(c))
      return { clausula, datada }
    })
}

/** Os trechos do texto que são exceção datada. É o que uma troca de texto não pode apagar sem dizer. */
export function linhasDatadas(texto: string): string[] {
  return texto.split(/\n+/).flatMap((l) => clausulasDaLinha(l).filter((c) => c.datada).map((c) => c.clausula))
}

/** A faixa achada e os turnos colados nela ("das 11h às 15h e das 18h às 23h"): início e fim são os dois últimos grupos de `m`. */
function turnosDesde(texto: string, m: RegExpMatchArray): string {
  const turnos = [`${horaDe(m[m.length - 2], false)}-${horaDe(m[m.length - 1], true)}`]
  let resto = texto.slice((m.index as number) + m[0].length)
  for (let t = TURNO_SEGUINTE.exec(resto); t; t = TURNO_SEGUINTE.exec(resto)) {
    turnos.push(`${horaDe(t[1], false)}-${horaDe(t[2], true)}`)
    resto = resto.slice(t[0].length)
  }
  return turnos.join(', ')
}

interface FatoDoTexto {
  dias: number[] | null
  faixa: string | null
  fim: string | null
  trecho: string
}
function fatosDoTexto(titulo: string, texto: string): FatoDoTexto[] {
  const fatos: FatoDoTexto[] = []
  const tituloNormal = semAcento(titulo)
  // Só a entrada exclusiva empresta o assunto à frase sem sujeito ("Terça a sexta, das 16h às 19h.").
  const soDeHappyHour = HAPPY_HOUR.test(tituloNormal) && !TITULO_MISTO.test(tituloNormal) && !OUTRO_SERVICO.test(tituloNormal)
  for (const linha of texto.split(/\n+/)) {
    for (const { clausula: trecho, datada } of clausulasDaLinha(linha)) {
      if (datada) continue
      for (const c of semAcento(trecho).split(ANTES_DO_SUJEITO)) {
        const citacao = c.search(HAPPY_HOUR)
        let doResto = c
        if (citacao >= 0 || (soDeHappyHour && !CASA_NA_FAIXA.test(c) && !REFEICAO_NA_FAIXA.test(c) && !OUTRO_SERVICO.test(c))) {
          // Só a faixa depois de "happy hour" e as coladas nela: "e delivery das 20h às 23h" é de outro serviço.
          const doHappy = c.slice(Math.max(citacao, 0))
          const [m] = doHappy.matchAll(FAIXA)
          if (m) fatos.push({ dias: null, faixa: turnosDesde(doHappy, m), fim: null, trecho })
          // O que vem antes da citação só se compara se disser que é da casa: pode ser o próprio happy hour se apresentando.
          if (!m || citacao <= 0 || !CASA_NA_FAIXA.test(c.slice(0, citacao))) continue
          doResto = c.slice(0, citacao)
        }
        if (OUTRO_SERVICO.test(doResto) || OUTRO_SERVICO.test(tituloNormal) || (REFEICAO_NA_FAIXA.test(doResto) && !CASA_NA_FAIXA.test(doResto))) continue
        for (const m of doResto.matchAll(FAIXA_DO_DIA)) {
          if (/almoco/.test(doResto.slice(0, m.index))) continue
          fatos.push({ dias: diasDe(m[1]), faixa: turnosDesde(doResto, m), fim: null, trecho })
        }
        for (const m of doResto.matchAll(FECHA_DO_DIA)) fatos.push({ dias: diasDe(m[1]), faixa: null, fim: horaDe(m[2], true), trecho })
      }
    }
  }
  return fatos
}

interface HorarioNosDados {
  dias: number[] | null
  campo: string
  valor: string
}
/** Os horários dos `dados` nos vocabulários conhecidos: `dias: null` é o happy hour, que não é o funcionamento de um dia. */
function horariosNosDados(dados: Record<string, unknown>): HorarioNosDados[] {
  const saida: HorarioNosDados[] = []
  const objeto = (chave: string) => (dados[chave] && typeof dados[chave] === 'object' ? (dados[chave] as Record<string, unknown>) : {})
  const anotar = (dias: number[] | null, campo: string, valor: unknown) => {
    if (typeof valor === 'string' && !problemaDasFaixas(valor)) saida.push({ dias, campo, valor })
  }
  for (const [i, dia] of DIAS_EN.entries()) anotar([i], `hours.${dia}`, objeto('hours')[dia])
  for (const [chave, valor] of Object.entries(objeto('horarios'))) {
    const [a, b] = chave.split('-').map((d) => DIAS_PT.indexOf(d as (typeof DIAS_PT)[number]))
    if (a < 0 || b < 0) continue
    anotar(b === undefined ? [a] : diasDe(`${DIAS_CURTOS[a]} a ${DIAS_CURTOS[b]}`), `horarios.${chave}`, valor)
  }
  anotar(TODOS_OS_DIAS, 'horarios_funcionamento.todos_os_dias', objeto('horarios_funcionamento').todos_os_dias)
  for (const chave of ['time', 'horario']) anotar(null, `happy_hour.${chave}`, objeto('happy_hour')[chave])
  return saida
}

export function temHorarioNosDados(metadata: unknown): boolean {
  return horariosNosDados(metadataComoObjeto(metadata)).length > 0
}

/** Os campos que o detector NÃO compara com os textos: a proposta diz, para ninguém ler "sem divergência" como "conferido". */
export function camposSemConferencia(dados: Record<string, unknown>, campos: string[]): string[] {
  const comparados = new Set(horariosNosDados(dados).map((h) => h.campo))
  return campos.filter((c) => !comparados.has(c))
}

/**
 * Compara os `dados` dados com o que TODOS os textos ativos do cliente afirmam. Só aponta: quem decide é a pessoa.
 * Entrada com validade é campanha, logo exceção por natureza, e não entra.
 */
export function divergenciasDe(dados: Record<string, unknown>, textos: LinhaDaBase[]): Divergencia[] {
  const noDados = horariosNosDados(dados)
  const achadas = new Map<string, Divergencia>()
  for (const linha of textos) {
    if (linha.expiresAt) continue
    for (const fato of fatosDoTexto(linha.title, linha.content)) {
      for (const h of noDados) {
        const mesmoAlvo = fato.dias === null ? h.dias === null : h.dias !== null && fato.dias.some((d) => h.dias?.includes(d))
        if (!mesmoAlvo) continue
        const valorNoDado = faixaNormal(h.valor)
        const valorNoTexto = fato.faixa ?? `fecha ${fato.fim}`
        if (fato.faixa ? valorNoDado === fato.faixa : valorNoDado.endsWith(`-${fato.fim}`)) continue
        achadas.set(`${h.campo}|${valorNoTexto}|${linha.id}`, {
          campo: h.campo,
          valorNosDados: h.valor,
          valorNoTexto,
          trecho: fato.trecho,
          origem: { entradaId: linha.id, titulo: linha.title, atualizadaEm: linha.updatedAt.toISOString() },
        })
      }
    }
  }
  return [...achadas.values()]
}
