// Convenção JS Date.getDay() / Postgres EXTRACT(DOW): 0 = Domingo, 6 = Sábado
export interface WeekdayOption {
  value: number
  label: string
  short: string
}

export const WEEKDAY_OPTIONS: WeekdayOption[] = [
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 0, label: 'Domingo', short: 'Dom' },
]

export const WEEKDAY_TIMEZONE = 'America/Sao_Paulo'
