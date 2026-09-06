'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock, Repeat, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  classificarDia,
  comHora,
  horaDe,
  horarioPadrao,
  horasDoDia,
  inicioDoDia,
  maisDias,
  rotuloLongo,
  type HorariosPorDia,
} from '@/lib/posts/quando'

type ScheduleType = 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING'

interface QuandoBarProps {
  scheduleType: ScheduleType
  scheduledDatetime?: Date
  onChange: (next: { scheduleType: ScheduleType; scheduledDatetime?: Date }) => void
  horariosPorDia?: HorariosPorDia
  /** A consulta dos horários típicos ainda não voltou — segura o padrão. */
  horariosCarregando?: boolean
  /** Dia vindo do "+" da agenda, sem hora: a primeira hora típica preenche. */
  diaSugerido?: Date
  /** Editando post existente: nunca inventa horário por cima do gravado. */
  editando?: boolean
}

/**
 * O primeiro bloco do formulário de post: QUANDO, numa linha.
 *
 *   [ Agora ] [ Hoje ] [ Amanhã ] [ 📅 sex 11/09 ]
 *   horários da casa: [ 10h ] [ 12h ] [ 19h ]   [ 19:30 ]
 *
 * Por que a data vem primeiro (05/09/2026): 40% dos posts nascem a menos de
 * 2h do horário e a data era o QUARTO bloco, atrás de tipo, mídia e legenda —
 * e ainda vinha errada (10:00 cravado pelo "+" da agenda, "amanhã 12:00" pelo
 * picker). Com o dia e a hora escolhidos antes da mídia, a faixa "Repostar"
 * já nasce sabendo dia da semana e faixa.
 *
 * Os chips de hora são os horários típicos do cliente naquele dia da semana
 * (`/horarios-tipicos`); o campo de hora ao lado serve para qualquer outro.
 */
export function QuandoBar({
  scheduleType,
  scheduledDatetime,
  onChange,
  horariosPorDia,
  horariosCarregando,
  diaSugerido,
  editando,
}: QuandoBarProps) {
  const agora = useMemo(() => new Date(), [])
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const padraoAplicado = useRef(false)

  /*
    O padrão é aplicado UMA vez, quando os horários típicos chegam (ou quando
    se sabe que não há nenhum): o próximo típico ainda hoje; passou o último,
    amanhã no primeiro; com dia sugerido, o primeiro típico daquele dia. Na
    edição o horário gravado manda e nada é inventado.
  */
  useEffect(() => {
    if (padraoAplicado.current || editando || horariosCarregando) return
    if (scheduleType !== 'SCHEDULED') { padraoAplicado.current = true; return }
    if (scheduledDatetime) { padraoAplicado.current = true; return }
    padraoAplicado.current = true
    onChange({ scheduleType: 'SCHEDULED', scheduledDatetime: horarioPadrao(horariosPorDia, agora, { diaSugerido }) })
  }, [agora, diaSugerido, editando, horariosCarregando, horariosPorDia, onChange, scheduleType, scheduledDatetime])

  const dia = scheduledDatetime ?? diaSugerido ?? agora
  const horasTipicas = horasDoDia(horariosPorDia, dia)
  const classe = scheduledDatetime ? classificarDia(scheduledDatetime, agora) : null
  const horaAtual = scheduledDatetime ? horaDe(scheduledDatetime) : ''

  /** Troca o dia mantendo a hora; sem hora ainda, a primeira típica do dia. */
  const escolherDia = (novoDia: Date) => {
    const base = inicioDoDia(novoDia)
    const hora = scheduledDatetime ? horaDe(scheduledDatetime) : horasDoDia(horariosPorDia, base)[0] ?? '10:00'
    onChange({ scheduleType: 'SCHEDULED', scheduledDatetime: comHora(base, hora) })
  }

  const escolherHora = (hora: string) => {
    if (!/^\d{2}:\d{2}$/.test(hora)) return
    onChange({ scheduleType: 'SCHEDULED', scheduledDatetime: comHora(inicioDoDia(dia), hora) })
  }

  const chip = (ativo: boolean) =>
    cn(
      'h-8 rounded-full px-3 text-xs font-medium transition-colors',
      ativo ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-foreground hover:bg-muted/70',
    )

  if (scheduleType === 'RECURRING') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          <Repeat className="h-3.5 w-3.5" /> Série recorrente
        </span>
        <span className="text-xs text-muted-foreground">Dias e horário ficam em “Mais opções”.</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ scheduleType: 'SCHEDULED', scheduledDatetime })}>
          Voltar para data única
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(scheduleType === 'IMMEDIATE')} onClick={() => onChange({ scheduleType: 'IMMEDIATE', scheduledDatetime })}>
          <Zap className="mr-1 inline h-3.5 w-3.5" />
          Agora
        </button>
        <button type="button" className={chip(scheduleType === 'SCHEDULED' && classe === 'hoje')} onClick={() => escolherDia(agora)}>
          Hoje
        </button>
        <button type="button" className={chip(scheduleType === 'SCHEDULED' && classe === 'amanha')} onClick={() => escolherDia(maisDias(agora, 1))}>
          Amanhã
        </button>
        <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
          <PopoverTrigger asChild>
            <button type="button" className={chip(scheduleType === 'SCHEDULED' && classe === 'outro')}>
              <CalendarIcon className="mr-1 inline h-3.5 w-3.5" />
              {scheduleType === 'SCHEDULED' && scheduledDatetime && classe === 'outro'
                ? format(scheduledDatetime, "EEE dd/MM", { locale: ptBR })
                : 'Outro dia'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={scheduledDatetime}
              onSelect={(d) => {
                if (!d) return
                escolherDia(d)
                setCalendarioAberto(false)
              }}
              disabled={(d) => d < inicioDoDia(agora)}
              initialFocus
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      </div>

      {scheduleType === 'SCHEDULED' && (
        <div className="flex flex-wrap items-center gap-2">
          {horasTipicas.length > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">horários da casa:</span>
              {horasTipicas.map((h) => (
                <button key={h} type="button" className={chip(horaAtual === h)} onClick={() => escolherHora(h)}>
                  {h.endsWith(':00') ? `${Number(h.slice(0, 2))}h` : h}
                </button>
              ))}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {horariosCarregando ? 'lendo os horários da casa…' : 'sem horário típico neste dia ainda'}
            </span>
          )}
          <div className="relative">
            <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="time"
              value={horaAtual}
              onChange={(e) => escolherHora(e.target.value)}
              className="h-8 w-[7.5rem] pl-8 text-xs"
              aria-label="Horário"
            />
          </div>
        </div>
      )}

      <p className={cn('text-xs', scheduledDatetime && scheduleType === 'SCHEDULED' && scheduledDatetime <= agora ? 'text-destructive' : 'text-muted-foreground')}>
        {scheduleType === 'IMMEDIATE'
          ? 'Vai sair assim que você confirmar.'
          : scheduledDatetime
            ? scheduledDatetime <= agora
              ? `⚠️ ${rotuloLongo(scheduledDatetime)} já passou — escolha um horário futuro.`
              : `Sai ${rotuloLongo(scheduledDatetime)}.`
            : 'Escolha o dia e a hora.'}
      </p>
    </div>
  )
}
