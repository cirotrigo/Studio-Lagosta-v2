/**
 * A cadência de um cliente: que dia e que horário ele costuma publicar.
 *
 * Extraído de `sugerir-posts.ts` na F2 e reescrito. O cálculo antigo contava
 * post cru: cada publicação das últimas 8 semanas valia 1, e um bloco de 30
 * minutos virava "típico" ao aparecer em metade das ocasiões. Isso produzia
 * quatro defeitos que se somavam em silêncio:
 *
 * 1. **Sem peso por recência** — o que o cliente fazia há dois meses pesava o
 *    mesmo que ontem, então mudança de rotina levava meses para aparecer.
 * 2. **SCHEDULED contava como histórico** — o que ainda não aconteceu virava
 *    prova de que costuma acontecer, e como a própria sugestão vira SCHEDULED,
 *    o sistema se citava.
 * 3. **Campanha ensinava rotina** — um festival de duas semanas com peça toda
 *    quinta às 11h fazia "quinta às 11h" virar hábito permanente do cliente.
 * 4. **Auto-reforço** — post nascido de sugestão aceita voltava com peso cheio,
 *    e o perfil convergia para si mesmo.
 *
 * ── A REGRA QUE RESOLVE 3 E 4: CONFIRMA, NUNCA CRIA ───────────────────────
 * Há dois tipos de evidência FRACA, por motivos diferentes mas com a mesma
 * consequência: o post de campanha (que descreve um período, não o hábito) e o
 * post que nasceu de uma sugestão aceita sem edição (que é o sistema se
 * ouvindo). Nenhum dos dois pode CRIAR um horário típico; os dois podem
 * CONFIRMAR um que a rotina já sustenta. Uma única regra, um único limiar.
 *
 * Post de campanha ENCERRADA nem isso: sai inteiro do histórico. O período
 * acabou, e o que ele descrevia não existe mais.
 *
 * Módulo PURO (sem Prisma, sem rede) — é o que permite rodar a comparação
 * antes/depois contra os dados reais de produção sem escrever nada. Ver
 * `scripts/validar-cadencia-f2.ts`.
 */

/** Meia-vida do peso por recência, em dias. */
export const MEIA_VIDA_DIAS = 21

/**
 * Quanto vale um post que nasceu de sugestão aceita SEM edição.
 *
 * Não é zero de propósito: a pessoa concordou, e isso é informação. Mas com
 * peso cheio o sistema passaria a confirmar as próprias sugestões, e em poucas
 * semanas a "cadência do cliente" seria a cadência que o sistema inventou.
 * Sugestão EDITADA e escolha própria valem cheio — nas duas houve decisão
 * humana sobre o horário.
 */
export const PESO_AUTO_REFORCO = 0.3

/** Idem para o post de campanha ainda em curso (ver o cabeçalho). */
export const PESO_CAMPANHA = 0.3

/**
 * Peso forte mínimo para um bloco virar horário típico.
 *
 * O que 1,75 quer dizer na prática: duas publicações na última semana somam
 * 1,79 e PASSAM; três espalhadas num mês somam ~2,1 e passam; duas separadas
 * por um mês somam ~0,8 e não passam. Ou seja, "duas vezes já é indício" — a
 * régua da v1 —, mas só quando o indício é recente.
 *
 * Calibrado contra os 9 clientes reais em 11/08/2026, comparando o número de
 * horários típicos com quantas publicações o cliente de fato faz por semana:
 *
 *   cliente          posts/semana   v1   L1,5   L1,75   L2,0
 *   Real Gelateria         19,1     16     22      17     12
 *   TERO                   22,1     21     23      21     16
 *   Seu Quinto             24,7     24     30      25     23
 *   Bacana                 11,3     20     10       7      3
 *   Espeto Gaúcho          12,8     16      9       5      4
 *
 * A v1 propunha à Bacana 20 horários típicos para quem publica 11 vezes por
 * semana — chamava de hábito o que aconteceu duas vezes em oito semanas. Em
 * 1,5 a contagem volta a passar do volume real nos clientes regulares (Seu
 * Quinto: 30 contra 24,7); em 2,0 os clientes irregulares ficam quase mudos.
 * Em 1,75 ela fica logo abaixo do volume real em todos, que é a relação certa:
 * horário típico é um subconjunto do que o cliente publica, nunca um superconjunto.
 */
export const LIMIAR_DE_PESO = 1.75

/** Um horário que aconteceu uma vez só nunca é padrão, por mais recente que seja. */
export const MINIMO_DE_OCORRENCIAS = 2

/** Horários agregados em blocos de 30min para achar o padrão. */
export const BLOCO_MIN = 30

/** Janela em que um punhado de posts ainda é "novidade", não rotina. */
const DIAS_DE_NOVIDADE = 14

const DIA_MS = 24 * 3600_000

export const DIAS_SEMANA_CADENCIA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
]

/** Como a decisão do horário nasceu (`SocialPost.origem`). */
export type OrigemDoPost = 'sugerido-aceito' | 'sugerido-editado' | 'escolha-propria' | null | undefined

export interface PostDoHistorico {
  quando: Date
  origem?: OrigemDoPost
  escopo?: 'ROTINA' | 'CAMPANHA' | 'PONTUAL' | null
  campaignId?: string | null
  /** A campanha deste post já terminou? Quem resolve isso é o chamador. */
  campanhaEncerrada?: boolean
}

export interface SlotTipico {
  minutosDoDia: number
  hora: string
  /** Quantos posts caíram neste bloco (contagem crua, para a mensagem). */
  ocorrencias: number
  /** Em quantas ocasiões daquele dia da semana o cliente publicou. */
  ocasioes: number
  /** Peso total (recência × origem), incluindo a evidência fraca. */
  peso: number
  /** Só a evidência FORTE — é ela que decide se o bloco é típico. */
  pesoForte: number
  /** Todas as ocorrências são dos últimos 14 dias: novidade, não rotina. */
  picoRecente: boolean
  /** Houve evidência fraca (campanha ou auto-reforço) confirmando este horário. */
  apoioFraco: boolean
  /** A frase que explica o horário para quem lê a sugestão. */
  motivo: string
}

export interface CadenciaDoDia {
  diaSemana: string
  horariosTipicos: string[]
  /** Média por semana COM ATIVIDADE — não por semana de calendário. */
  postsPorSemana: number
}

export interface ResultadoDaCadencia {
  slotsPorDia: Map<number, SlotTipico[]>
  cadencia: CadenciaDoDia[]
  /** Quantos posts entraram na conta depois dos cortes. */
  postsConsiderados: number
  /** Quantos foram descartados por pertencerem a campanha encerrada. */
  descartadosPorCampanha: number
  /** Semanas (ISO, em BRT) em que o cliente publicou alguma coisa. */
  semanasComAtividade: number
}

/** Date → componentes em BRT (UTC-3, sem DST desde 2019). */
export function emBRT(d: Date): { dia: number; minutos: number; dataISO: string } {
  const brt = new Date(d.getTime() - 3 * 3600_000)
  return {
    dia: brt.getUTCDay(),
    minutos: brt.getUTCHours() * 60 + brt.getUTCMinutes(),
    dataISO: brt.toISOString().slice(0, 10),
  }
}

export function horaLabel(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Semana ISO em BRT, para contar "semanas com atividade". */
function semanaBRT(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 3600_000)
  // Segunda como início da semana.
  const dia = (brt.getUTCDay() + 6) % 7
  const segunda = new Date(brt.getTime() - dia * DIA_MS)
  return segunda.toISOString().slice(0, 10)
}

/** Decaimento exponencial: 1 hoje, 0,5 numa meia-vida, 0,25 em duas. */
export function pesoPorRecencia(quando: Date, agora: Date): number {
  const idadeEmDias = Math.max(0, (agora.getTime() - quando.getTime()) / DIA_MS)
  return Math.pow(2, -idadeEmDias / MEIA_VIDA_DIAS)
}

/** `true` quando o post é evidência FRACA (confirma, mas não cria). */
export function ehEvidenciaFraca(post: PostDoHistorico): boolean {
  if (post.origem === 'sugerido-aceito') return true
  if (post.escopo === 'CAMPANHA') return true
  if (post.campaignId) return true
  return false
}

/** O peso do post: recência × o desconto que a origem dele merece. */
export function pesoDoPost(post: PostDoHistorico, agora: Date): number {
  const recencia = pesoPorRecencia(post.quando, agora)
  if (post.origem === 'sugerido-aceito') return recencia * PESO_AUTO_REFORCO
  if (post.escopo === 'CAMPANHA' || post.campaignId) return recencia * PESO_CAMPANHA
  return recencia
}

function motivoDoSlot(dia: number, slot: Omit<SlotTipico, 'motivo'>): string {
  const nomeDoDia = DIAS_SEMANA_CADENCIA[dia]
  const base = slot.picoRecente
    ? `nas últimas duas semanas passou a postar ${nomeDoDia} por volta das ${slot.hora} (${slot.ocorrencias}x) — é novidade, ainda não é rotina`
    : `costuma postar ${nomeDoDia} por volta das ${slot.hora} (${slot.ocorrencias}x em ${slot.ocasioes} ${slot.ocasioes === 1 ? 'ocasião' : 'ocasiões'})`
  // A ressalva vale nos DOIS casos: um horário novo sustentado por campanha é
  // a informação mais importante que esta frase pode carregar, e ela sumia
  // quando o ramo do pico devolvia cedo.
  return slot.apoioFraco ? `${base}; parte disso veio de campanha ou de sugestão aceita` : base
}

/**
 * Calcula a cadência a partir do histórico já filtrado por projeto e janela.
 *
 * `agora` é injetável para o teste (e a comparação antes/depois) não depender
 * do relógio.
 */
export function calcularCadencia(
  posts: PostDoHistorico[],
  opcoes: { agora?: Date; limiarDePeso?: number } = {},
): ResultadoDaCadencia {
  const agora = opcoes.agora ?? new Date()
  const limiar = opcoes.limiarDePeso ?? LIMIAR_DE_PESO

  const validos = posts.filter((p) => !!p.quando)
  const semCampanhaEncerrada = validos.filter((p) => !p.campanhaEncerrada)
  const descartadosPorCampanha = validos.length - semCampanhaEncerrada.length

  /**
   * 🔴 O decaimento é medido contra a ÚLTIMA ATIVIDADE do cliente, não contra
   * o relógio.
   *
   * Medido em 11/08/2026 contra produção: com a referência no relógio, o Espeto
   * Gaúcho caía de 16 horários típicos para 3 e a Bacana de 20 para 3 — não
   * porque a rotina deles mudou, mas porque pararam de publicar há algumas
   * semanas, e o peso de tudo que fizeram encolheu junto. O efeito seria o
   * sistema emudecer justamente com o cliente que precisa voltar a postar.
   *
   * A recência é comparação DENTRO do histórico ("o que ele faz agora vale mais
   * que o que fazia há dois meses"), não um relógio de validade. Ancorada na
   * última publicação, ela mantém essa comparação intacta e deixa a cadência de
   * quem parou disponível para quando ele voltar.
   */
  const ultimaAtividade = semCampanhaEncerrada.reduce<number>(
    (maior, p) => Math.max(maior, p.quando.getTime()),
    0,
  )
  const referencia =
    ultimaAtividade > 0 ? new Date(Math.min(ultimaAtividade, agora.getTime())) : agora

  const semanas = new Set(semCampanhaEncerrada.map((p) => semanaBRT(p.quando)))
  const semanasComAtividade = Math.max(1, semanas.size)

  interface Acumulado {
    ocorrencias: number
    peso: number
    pesoForte: number
    /** Ocorrências ANTERIORES à janela de novidade — ver `picoRecente`. */
    ocorrenciasAntigas: number
  }
  const porDia = new Map<
    number,
    { blocos: Map<number, Acumulado>; datas: Set<string>; total: number }
  >()

  for (const post of semCampanhaEncerrada) {
    const { dia, minutos, dataISO } = emBRT(post.quando)
    const info = porDia.get(dia) ?? { blocos: new Map<number, Acumulado>(), datas: new Set<string>(), total: 0 }
    const bloco = Math.round(minutos / BLOCO_MIN) * BLOCO_MIN
    const atual = info.blocos.get(bloco) ?? { ocorrencias: 0, peso: 0, pesoForte: 0, ocorrenciasAntigas: 0 }

    const peso = pesoDoPost(post, referencia)
    const fraca = ehEvidenciaFraca(post)
    atual.ocorrencias += 1
    atual.peso += peso
    if (!fraca) atual.pesoForte += peso
    if (referencia.getTime() - post.quando.getTime() > DIAS_DE_NOVIDADE * DIA_MS) atual.ocorrenciasAntigas += 1

    info.blocos.set(bloco, atual)
    info.datas.add(dataISO)
    info.total += 1
    porDia.set(dia, info)
  }

  const slotsPorDia = new Map<number, SlotTipico[]>()
  const cadencia: CadenciaDoDia[] = []

  for (let dia = 0; dia < 7; dia++) {
    const info = porDia.get(dia)
    if (!info || info.datas.size === 0) continue

    const tipicos: SlotTipico[] = []
    for (const [minutos, acc] of [...info.blocos.entries()].sort((a, b) => a[0] - b[0])) {
      // O corte é sobre o peso FORTE: campanha e auto-reforço confirmam um
      // horário existente, nunca criam um novo.
      if (acc.pesoForte < limiar) continue
      if (acc.ocorrencias < MINIMO_DE_OCORRENCIAS) continue

      const parcial = {
        minutosDoDia: minutos,
        hora: horaLabel(minutos),
        ocorrencias: acc.ocorrencias,
        ocasioes: info.datas.size,
        peso: Math.round(acc.peso * 100) / 100,
        pesoForte: Math.round(acc.pesoForte * 100) / 100,
        // 🔴 Novidade é "não existe NENHUMA ocorrência mais velha que a
        // janela", não "a maior parte do peso é recente". Com meia-vida de 21
        // dias, os últimos 14 concentram a maior parte do peso até numa rotina
        // de cinco semanas — pela fração, uma rotina consolidada era anunciada
        // ao usuário como "novidade".
        picoRecente: acc.ocorrenciasAntigas === 0,
        apoioFraco: acc.peso - acc.pesoForte > 0.01,
      }
      tipicos.push({ ...parcial, motivo: motivoDoSlot(dia, parcial) })
    }

    if (tipicos.length === 0) continue
    slotsPorDia.set(dia, tipicos)
    cadencia.push({
      diaSemana: DIAS_SEMANA_CADENCIA[dia],
      horariosTipicos: tipicos.map((t) => t.hora),
      // Semanas COM ATIVIDADE no denominador: dividir por 8 fixas faz o cliente
      // que passou duas semanas parado parecer menos ativo do que é, e essa
      // média é o que a bancada mostra como "ritmo do cliente".
      postsPorSemana: Math.round((info.total / semanasComAtividade) * 10) / 10,
    })
  }

  return {
    slotsPorDia,
    cadencia,
    postsConsiderados: semCampanhaEncerrada.length,
    descartadosPorCampanha,
    semanasComAtividade,
  }
}
