/**
 * O "Quando" do formulário de post — a parte PURA.
 *
 * Trabalha em horário LOCAL do navegador (a equipe opera em Brasília), como o
 * `SchedulePicker` sempre fez. O servidor, quando precisa do dia da semana em
 * BRT, usa `slotEmBrasilia` — aqui é o relógio de quem está clicando.
 *
 * Por que existe: até 05/09/2026 a hora de um post novo era chute — "amanhã
 * 12:00" no picker, 10:00 cravado no "+" da agenda. Medido: 72% dos posts
 * saem em :00/:30 e 40% nascem a menos de 2h do horário. A hora certa é a que
 * o cliente costuma usar naquele dia, e ela vira um toque.
 */

export type HorariosPorDia = Record<number, string[]>

/** `dia` com a hora `HH:mm` aplicada (segundos zerados). */
export function comHora(dia: Date, hora: string): Date {
  const [h, m] = hora.split(':').map(Number)
  const d = new Date(dia)
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return d
}

export function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function mesmoDiaLocal(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function inicioDoDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function maisDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Os horários típicos do dia da semana de `dia`, em ordem. */
export function horasDoDia(porDia: HorariosPorDia | undefined, dia: Date): string[] {
  return porDia?.[dia.getDay()] ?? []
}

const FOLGA_MIN = 10
const HORA_SEM_HISTORICO = '10:00'

/**
 * O primeiro horário típico de `dia` que ainda está no futuro (com 10 min de
 * folga); sem nenhum, o primeiro do dia; sem histórico, 10:00. Se `dia` já
 * passou inteiro, devolve `null` — quem chama decide o dia seguinte.
 */
export function primeiraHoraLivre(porDia: HorariosPorDia | undefined, dia: Date, agora: Date): Date | null {
  const horas = horasDoDia(porDia, dia)
  const limite = new Date(agora.getTime() + FOLGA_MIN * 60_000)
  if (horas.length === 0) {
    const d = comHora(dia, HORA_SEM_HISTORICO)
    if (d > limite) return d
    // Hoje, depois das 10h: a próxima hora cheia ainda dá tempo.
    if (mesmoDiaLocal(dia, agora)) {
      const prox = new Date(limite)
      prox.setMinutes(0, 0, 0)
      prox.setHours(prox.getHours() + 1)
      return mesmoDiaLocal(prox, dia) ? prox : null
    }
    return null
  }
  for (const h of horas) {
    const d = comHora(dia, h)
    if (d > limite) return d
  }
  return null
}

/**
 * O padrão de um post novo: o próximo horário típico ainda hoje; passou o
 * último, amanhã no primeiro. Com `diaSugerido` (o "+" de um dia da agenda),
 * é o primeiro horário típico DAQUELE dia — e se ele já passou, o próximo do
 * mesmo dia.
 */
export function horarioPadrao(
  porDia: HorariosPorDia | undefined,
  agora: Date,
  opcoes: { diaSugerido?: Date } = {},
): Date {
  if (opcoes.diaSugerido) {
    const dia = inicioDoDia(opcoes.diaSugerido)
    const livre = primeiraHoraLivre(porDia, dia, agora)
    if (livre) return livre
    // Dia inteiro já passou (raro: o "+" só existe em dia presente/futuro).
    const horas = horasDoDia(porDia, dia)
    return comHora(dia, horas[0] ?? HORA_SEM_HISTORICO)
  }
  const hoje = primeiraHoraLivre(porDia, inicioDoDia(agora), agora)
  if (hoje) return hoje
  const amanha = inicioDoDia(maisDias(agora, 1))
  const horas = horasDoDia(porDia, amanha)
  return comHora(amanha, horas[0] ?? HORA_SEM_HISTORICO)
}

/**
 * "Agendar e próximo": o horário típico seguinte ao de `base`, no mesmo dia;
 * sem próximo típico, uma hora depois. Nunca volta no tempo.
 */
export function proximoHorario(porDia: HorariosPorDia | undefined, base: Date): Date {
  const horas = horasDoDia(porDia, base)
  for (const h of horas) {
    const d = comHora(base, h)
    if (d > base) return d
  }
  return new Date(base.getTime() + 3600_000)
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "sex 11/09 às 19:00" — o que o botão e a prévia dizem. */
export function rotuloCurto(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${DIAS_CURTOS[d.getDay()]} ${dd}/${mm} às ${horaDe(d)}`
}

/** "sexta, 11/09 às 19:00" */
export function rotuloLongo(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${DIAS_LONGOS[d.getDay()]}, ${dd}/${mm} às ${horaDe(d)}`
}

/** "Agendar sex 19h" / "Agendar sex 19:30" / "Postar agora" / "Criar série". */
export function rotuloDoBotao(
  scheduleType: 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING',
  quando: Date | undefined,
  editando: boolean,
): string {
  if (editando) return 'Salvar alterações'
  if (scheduleType === 'IMMEDIATE') return 'Postar agora'
  if (scheduleType === 'RECURRING') return 'Criar série'
  if (!quando) return 'Agendar'
  const h = quando.getMinutes() === 0 ? `${quando.getHours()}h` : horaDe(quando)
  return `Agendar ${DIAS_CURTOS[quando.getDay()]} ${h}`
}

/** Hoje / Amanhã / outro dia — para marcar o chip certo. */
export function classificarDia(d: Date, agora: Date): 'hoje' | 'amanha' | 'outro' {
  if (mesmoDiaLocal(d, agora)) return 'hoje'
  if (mesmoDiaLocal(d, maisDias(agora, 1))) return 'amanha'
  return 'outro'
}
