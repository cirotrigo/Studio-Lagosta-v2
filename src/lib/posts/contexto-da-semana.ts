/**
 * O CONTEXTO DA SEMANA que `sugerir-posts` entrega ao Claude (PR 6 de "Marca
 * simples, copy melhor", F2, 12/09/2026) — módulo PURO, sem Prisma.
 *
 * O que muda em relação ao "dias à frente" de antes:
 *  - a janela tem INÍCIO e FIM (datas em Brasília), não só "os próximos N
 *    dias": quem monta a semana que vem pede de segunda a domingo;
 *  - cada peça tem FORMATO (story × feed), e a OCUPAÇÃO é por formato — um
 *    feed às 19h não ocupa o slot do story das 19h, e vice-versa;
 *  - a GRADE COMPLETA sai por dia da semana, com a ORIGEM de cada horário
 *    (combinado = grade aprovada na base; histórico = o que o cliente faz;
 *    nova = só apareceu nas últimas duas semanas), o formato e a evidência.
 */

import { CreativeError } from '@/lib/creatives/errors'
import { blocoDeMinutos, emBRT } from '@/lib/posts/cadencia'
import { DIAS_SEMANA } from '@/lib/posts/dia-semana'

/** Teto da janela: três semanas. Mais que isso é planejamento de mês, que a proposta por slot não serve. */
export const TETO_DE_DIAS_DA_JANELA = 21

export type FormatoDaPeca = 'story' | 'feed'

/** Story é story; o resto (post, carrossel, reel) disputa o mesmo lugar no feed. */
export function formatoDoTipo(postType: string | null | undefined): FormatoDaPeca {
  return postType === 'STORY' ? 'story' : 'feed'
}

/**
 * O formato de SLOT que uma peça ocupa, pelo formato em que ela nasce
 * (bancada, plano): story é story; feed, quadrado e carrossel disputam o feed.
 * É o par de `formatoDoTipo` para quem ainda não é post — a bancada e o
 * `propor-semana` escolhem o slot por horário E formato (R22 da revisão de
 * 386118cc): um horário livre para FEED não é um horário livre para outro
 * STORY sobre o que já existe.
 */
export function formatoDoSlotDaPeca(formatoDaPeca: string | null | undefined): FormatoDaPeca {
  return formatoDaPeca === 'story' ? 'story' : 'feed'
}

/** A chave de ocupação de um slot: horário E formato — é assim que a fila da bancada reserva e que a disponibilidade se confere. */
export function chaveDoSlot(quando: string, formato: FormatoDaPeca): string {
  return `${quando}|${formato}`
}

/**
 * A chave de IDEMPOTÊNCIA da proposta de slot (`LearningSignal.chave`): a
 * proposta é `(projeto, horário, FORMATO)` desde que a ocupação passou a ser
 * por formato — o mesmo bloco pode ser classificado como story numa semana e
 * como feed na seguinte (a população do histórico mudou), e são propostas
 * DIFERENTES: sem o formato na chave, o feed herdava o `descartada` do story,
 * e a precedência de desfechos impedia o aceite de sobrescrever (R33 da
 * revisão de 4bf1d0a3). Emissão nova sempre leva o formato; a legada (sem
 * ele) fica como está, com a chave antiga — o histórico não é reescrito.
 */
export function chaveDaPropostaDeSlot(projectId: number, scheduledDatetime: string, versao: string, formato: FormatoDaPeca | null | undefined): string {
  return formato ? `slot|${versao}|${projectId}|${scheduledDatetime}|${formato}` : `slot|${versao}|${projectId}|${scheduledDatetime}`
}

/**
 * Os slots que servem a uma peça: só os do formato dela, fora os já reservados
 * (por horário E formato). `formato` ausente no slot (resposta antiga) é story.
 */
export function slotsParaAPeca<T extends { scheduledDatetime: string; formato?: FormatoDaPeca | null }>(
  sugestoes: T[],
  formatoDaPeca: string | null | undefined,
  reservados: ReadonlySet<string>,
): T[] {
  const alvo = formatoDoSlotDaPeca(formatoDaPeca)
  return sugestoes.filter((s) => (s.formato ?? 'story') === alvo && !reservados.has(chaveDoSlot(s.scheduledDatetime, s.formato ?? 'story')))
}

/** A proposta que o slot selecionado ainda é: só vale se está na lista disponível AGORA (R25). */
export function slotValido<T extends { scheduledDatetime: string }>(slot: string | null | undefined, disponiveis: T[]): T | null {
  if (!slot) return null
  return disponiveis.find((s) => s.scheduledDatetime === slot) ?? null
}

/**
 * A seleção de slot RECONCILIADA com a lista disponível (R25 da revisão de
 * fde1fb73): o slot que saiu da lista — mudou o formato da peça, o tipo
 * (carrossel) ou a disponibilidade (outro item da fila reservou o horário) — é
 * SUBSTITUÍDO pelo primeiro disponível, ou LIMPO quando não há nenhum; o slot
 * que segue na lista fica; sem seleção, o primeiro disponível entra (a
 * pré-seleção de sempre). Sem isso a bancada trocava o story pré-selecionado
 * das 19h por um feed e incluía a peça nas mesmas 19h — em cima do feed que
 * ocupava o horário e tinha tirado o slot da lista.
 */
export function reconciliarSlot<T extends { scheduledDatetime: string }>(slot: string, disponiveis: T[]): string {
  if (slotValido(slot, disponiveis)) return slot
  return disponiveis[0]?.scheduledDatetime ?? ''
}

/**
 * O horário com que a peça é INCLUÍDA e a proposta que ele carrega: o horário
 * digitado à mão vence; o automático só existe enquanto o slot selecionado é
 * uma proposta VÁLIDA (na lista) — um slot que saiu da lista entre a troca de
 * formato e a reconciliação não vira horário da peça. A proposta volta mesmo
 * com horário manual, porque é ela que recebe o desfecho "editada".
 */
export function quandoDaPeca<T extends { scheduledDatetime: string }>(args: { quandoManual: string; slot: string; disponiveis: T[] }): { quando: string | null; proposta: T | null } {
  const proposta = slotValido(args.slot, args.disponiveis)
  return { quando: args.quandoManual || proposta?.scheduledDatetime || null, proposta }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * "AAAA-MM-DD" que EXISTE no calendário. `new Date('2026-02-31')` não recusa:
 * normaliza para 3 de março em silêncio — e a base seria consultada para outro
 * dia, a foto excluída por uma data que não existe. A prova é a ida e volta:
 * o ISO da data lida tem de ser o texto que entrou.
 */
export function dataValida(texto: string | null | undefined): boolean {
  if (typeof texto !== 'string') return false
  const t = texto.trim()
  if (!RE_DATA.test(t)) return false
  const d = new Date(`${t}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t
}

/** "AAAA-MM-DD" do instante em Brasília. */
export function dataBRT(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

function inicioDoDiaBRT(dataISO: string): Date {
  return new Date(`${dataISO}T00:00:00-03:00`)
}
function fimDoDiaBRT(dataISO: string): Date {
  return new Date(`${dataISO}T23:59:59.999-03:00`)
}
function somarDias(dataISO: string, n: number): string {
  const d = new Date(`${dataISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function conferirData(valor: string, campo: string): string {
  const texto = valor.trim()
  if (!dataValida(texto)) {
    throw new CreativeError('JANELA_INVALIDA', `${campo} inválido: "${valor}". Use AAAA-MM-DD (data em Brasília).`, 400)
  }
  return texto
}

export interface JanelaDaSugestao {
  /** Primeiro instante considerado (nunca antes de agora). */
  inicio: Date
  /** Último instante considerado (fim do último dia, em Brasília). */
  fim: Date
  inicioISO: string
  fimISO: string
  /** Os dias da janela, em "AAAA-MM-DD" (Brasília), do primeiro ao último. */
  datas: string[]
  avisos: string[]
}

/**
 * A janela pedida, saneada: início no passado vira agora; fim antes do início
 * é erro; mais que o teto é cortada com aviso. Sem início nem fim é o
 * comportamento de sempre (agora + `dias`).
 */
export function janelaDaSugestao(args: { agora: Date; inicio?: string | null; fim?: string | null; dias?: number | null }): JanelaDaSugestao {
  const avisos: string[] = []
  const hojeISO = dataBRT(args.agora)
  let inicioISO = args.inicio ? conferirData(args.inicio, 'inicio') : hojeISO
  if (inicioISO < hojeISO) {
    avisos.push(`O início pedido (${inicioISO}) já passou: a janela começa hoje (${hojeISO}).`)
    inicioISO = hojeISO
  }
  const dias = Math.min(Math.max(Math.round(args.dias ?? 7), 1), TETO_DE_DIAS_DA_JANELA)
  let fimISO = args.fim ? conferirData(args.fim, 'fim') : somarDias(inicioISO, dias - 1)
  if (fimISO < inicioISO) {
    throw new CreativeError('JANELA_INVALIDA', `O fim (${fimISO}) vem antes do início (${inicioISO}).`, 400)
  }
  const tetoISO = somarDias(inicioISO, TETO_DE_DIAS_DA_JANELA - 1)
  if (fimISO > tetoISO) {
    avisos.push(`A janela pedida passa de ${TETO_DE_DIAS_DA_JANELA} dias: cortada em ${tetoISO}. Peça o resto em outra chamada.`)
    fimISO = tetoISO
  }
  const datas: string[] = []
  for (let d = inicioISO; d <= fimISO; d = somarDias(d, 1)) datas.push(d)
  const inicio = inicioISO === hojeISO ? args.agora : inicioDoDiaBRT(inicioISO)
  return { inicio, fim: fimDoDiaBRT(fimISO), inicioISO, fimISO, datas, avisos }
}

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD" em Brasília. */
export function diaDaSemanaDe(dataISO: string): number {
  return new Date(`${dataISO}T12:00:00Z`).getUTCDay()
}

export interface PostComFormato {
  quando: Date
  postType: string
}

/**
 * O histórico que dá FORMATO aos horários: a mesma população que dá origem a
 * eles na cadência — sem campanha encerrada. A cadência já a descarta
 * (`campanhaEncerrada`); se o formato olhasse o histórico bruto, uma campanha
 * de feed já encerrada transformaria o story de rotina daquele bloco em feed,
 * e mudaria também a ocupação.
 */
export function historicoParaFormato<T extends { scheduledDatetime: Date | null; postType: string; campaignId?: string | null }>(
  historico: T[],
  campanhasEncerradas: ReadonlySet<string>,
): PostComFormato[] {
  return historico
    .filter((p) => p.scheduledDatetime && !(p.campaignId && campanhasEncerradas.has(p.campaignId)))
    .map((p) => ({ quando: p.scheduledDatetime!, postType: p.postType }))
}

/**
 * O formato de um horário TÍPICO do histórico: a maioria do que o cliente
 * publicou naquele dia da semana, naquele bloco de meia hora — o MESMO bloco
 * que a cadência usou para criar o horário (`blocoDeMinutos`, arredondamento
 * ao mais próximo). Empate e bloco vazio caem em story — é o formato de 92%
 * do que a carteira publica.
 */
export function formatoDoBloco(historico: PostComFormato[], dia: number, minutosDoDia: number): FormatoDaPeca {
  const bloco = blocoDeMinutos(minutosDoDia)
  let story = 0
  let feed = 0
  for (const p of historico) {
    const b = emBRT(p.quando)
    if (b.dia !== dia || blocoDeMinutos(b.minutos) !== bloco) continue
    if (formatoDoTipo(p.postType) === 'story') story++
    else feed++
  }
  return feed > story ? 'feed' : 'story'
}

export interface Ocupante {
  /** Instante do post (ms). */
  t: number
  formato: FormatoDaPeca
}

/** O slot está ocupado quando há post do MESMO formato a até `toleranciaMin` dele. */
/**
 * A janela de CONSULTA da ocupação: a pedida, alargada pela tolerância dos dois
 * lados (R27 da revisão de 2848096f). A consulta que começava exatamente no
 * início da janela não trazia o story de domingo 23h45 — e o slot de segunda
 * 0h saía livre a 15 minutos dele. Sugestões, `ocupacao` e `jaNaAgenda`
 * continuam limitados à janela pedida (`dentroDaJanela`); só a detecção de
 * conflito enxerga a borda.
 */
export function janelaDeConsultaDeOcupacao(janela: { inicio: Date; fim: Date }, toleranciaMin: number): { inicio: Date; fim: Date } {
  const folga = Math.max(0, toleranciaMin) * 60_000
  return { inicio: new Date(janela.inicio.getTime() - folga), fim: new Date(janela.fim.getTime() + folga) }
}

/** O instante cai DENTRO da janela pedida (bordas inclusivas)? */
export function dentroDaJanela(quando: Date | null | undefined, janela: { inicio: Date; fim: Date }): boolean {
  if (!quando) return false
  const t = quando.getTime()
  return t >= janela.inicio.getTime() && t <= janela.fim.getTime()
}

export function slotOcupado(ocupados: Ocupante[], quandoUTC: number, formato: FormatoDaPeca, toleranciaMin: number): boolean {
  const tol = toleranciaMin * 60_000
  return ocupados.some((o) => o.formato === formato && Math.abs(o.t - quandoUTC) <= tol)
}

export type OrigemDoHorario = 'combinado' | 'historico' | 'nova'

export interface HorarioDaGrade {
  hora: string
  formato: FormatoDaPeca
  /** combinado = grade aprovada na base; histórico = rotina medida; nova = só nas últimas duas semanas. */
  origem: OrigemDoHorario
  /** Evidência FRACA: o horário se sustenta em campanha ou em sugestão aceita sem edição, ou é novidade. */
  evidenciaFraca: boolean
  tema?: string
  motivo: string
}

export interface DiaDaGrade {
  dia: number
  diaSemana: string
  horarios: HorarioDaGrade[]
}

export interface SlotParaGrade {
  minutosDoDia: number
  hora: string
  motivo: string
  origem: 'grade' | 'cadencia'
  tema?: string
  novidade?: boolean
  evidenciaFraca?: boolean
}

/**
 * A grade da semana INTEIRA (os 7 dias, mesmo os vazios), com a origem e o
 * formato de cada horário. `excecoes` são os dias da semana sem horário nenhum.
 */
export function montarGradeDaSemana(
  slotsPorDia: Map<number, SlotParaGrade[]>,
  formatoDe: (dia: number, slot: SlotParaGrade) => FormatoDaPeca,
): { grade: DiaDaGrade[]; excecoes: string[] } {
  const grade: DiaDaGrade[] = []
  const excecoes: string[] = []
  for (let dia = 0; dia < 7; dia++) {
    const slots = [...(slotsPorDia.get(dia) ?? [])].sort((a, b) => a.minutosDoDia - b.minutosDoDia)
    if (slots.length === 0) excecoes.push(DIAS_SEMANA[dia])
    grade.push({
      dia,
      diaSemana: DIAS_SEMANA[dia],
      horarios: slots.map((s) => ({
        hora: s.hora,
        formato: formatoDe(dia, s),
        origem: s.origem === 'grade' ? 'combinado' : s.novidade ? 'nova' : 'historico',
        evidenciaFraca: s.origem !== 'grade' && (!!s.evidenciaFraca || !!s.novidade),
        ...(s.tema ? { tema: s.tema } : {}),
        motivo: s.motivo,
      })),
    })
  }
  return { grade, excecoes }
}
