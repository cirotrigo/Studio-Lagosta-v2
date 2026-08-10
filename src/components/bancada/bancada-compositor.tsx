'use client'

/**
 * Compositor da bancada: monta UM item e o põe na fila, sem gerar nada.
 *
 * Separar "montar" de "gerar" é o que permite preparar a leva inteira e
 * revisar antes de gastar crédito — é assim que a bancada do insta-automatico
 * funciona, e o aviso ao lado do botão diz isso em voz alta, porque a
 * expectativa natural de quem clica em "adicionar" é que algo já comece.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  ArteIaImagePicker,
  contarPorPapel,
  type PapelReferencia,
  type ReferenciaSelecionada,
} from '@/components/creatives/arte-ia-image-picker'
import { useBancadaStore, type NovoItem } from '@/stores/bancada-store'

type Formato = 'story' | 'feed' | 'quadrado'

const FORMATOS: Array<{ valor: Formato; titulo: string }> = [
  { valor: 'story', titulo: 'Story' },
  { valor: 'feed', titulo: 'Feed' },
  { valor: 'quadrado', titulo: 'Quadrado' },
]

interface SugestaoSlot {
  /** "YYYY-MM-DD HH:mm" em BRT — o que vai para o agendamento. */
  scheduledDatetime: string
  data: string
  quandoBRT: string
  diaSemana: string
  hora: string
  motivo: string
}

/**
 * "sexta, 15/08 · 19:00" — montado dos campos estruturados.
 * Recortar o `quandoBRT` com regex produzia rótulo quebrado ("segunda
 * /08/2026, 10:30 · 10:30"), porque o formato dele varia.
 */
function rotuloDoSlot(s: SugestaoSlot): string {
  const [, mes, dia] = s.data.split('-')
  return `${s.diaSemana}, ${dia}/${mes} · ${s.hora}`
}

interface SlotsResposta {
  sugestoes: SugestaoSlot[]
  avisos: string[]
}

export function BancadaCompositor({ projectId }: { projectId: number }) {
  const adicionar = useBancadaStore((s) => s.adicionar)
  const itens = useBancadaStore((s) => s.itens)

  const [formato, setFormato] = React.useState<Formato>('story')
  const [copyTexto, setCopyTexto] = React.useState('')
  const [pedido, setPedido] = React.useState('')
  const [instrucao, setInstrucao] = React.useState('')
  const [mostrarInstrucao, setMostrarInstrucao] = React.useState(false)
  const [referencias, setReferencias] = React.useState<ReferenciaSelecionada[]>([])
  const [slot, setSlot] = React.useState('')
  const [dataManual, setDataManual] = React.useState('')
  const [horaManual, setHoraManual] = React.useState('')

  const { data: slots } = useQuery<SlotsResposta>({
    queryKey: ['projeto', projectId, 'slots'],
    queryFn: () => api.get<SlotsResposta>(`/api/projects/${projectId}/slots?dias=7`),
    staleTime: 5 * 60_000,
  })

  const blocos = React.useMemo(
    () => copyTexto.split('\n').map((l) => l.trim()).filter(Boolean),
    [copyTexto],
  )
  const temPrato = contarPorPapel(referencias, 'subject') > 0
  const papelPadrao: PapelReferencia = temPrato ? 'anchor-ambient' : 'subject'

  /**
   * Slots já reservados por itens que estão na fila — sem isso, dois itens da
   * mesma leva nasceriam no mesmo horário e o operador só descobriria ao
   * agendar o segundo.
   */
  const reservados = React.useMemo(
    () => new Set(itens.filter((i) => i.projectId === projectId && i.quando).map((i) => i.quando!)),
    [itens, projectId],
  )
  const disponiveis = React.useMemo(
    () => (slots?.sugestoes ?? []).filter((s) => !reservados.has(s.scheduledDatetime)),
    [slots, reservados],
  )

  // O próximo slot livre já vem escolhido; a cada item adicionado, avança.
  React.useEffect(() => {
    if (!slot && disponiveis.length > 0) setSlot(disponiveis[0].scheduledDatetime)
  }, [disponiveis, slot])

  const quandoManual = dataManual && horaManual ? `${dataManual} ${horaManual}` : ''
  const quando = quandoManual || slot || null

  const impedimento = (() => {
    if (blocos.length === 0) return 'Escreva a copy (um bloco por linha).'
    if (blocos.some((b) => b.length > 200)) return 'Cada bloco deve ter até 200 caracteres.'
    if (!temPrato) return 'Escolha a foto que será a cena (papel "Prato / produto").'
    return null
  })()

  const limpar = () => {
    setCopyTexto('')
    setPedido('')
    setInstrucao('')
    setMostrarInstrucao(false)
    setReferencias([])
    setDataManual('')
    setHoraManual('')
    setSlot('')
  }

  const adicionarNaFila = () => {
    if (impedimento) return
    const motivo = disponiveis.find((s) => s.scheduledDatetime === slot)?.motivo
    const item: NovoItem = {
      projectId,
      trilha: 'arte',
      formato,
      copy: blocos,
      pedido: pedido.trim(),
      instrucaoImagem: instrucao.trim() || null,
      referencias: referencias.map((r) => ({
        papel: r.papel,
        driveFileId: r.driveFileId,
        url: r.url,
        label: r.label,
        thumbUrl: r.thumbUrl,
      })),
      quando,
      motivoDoSlot: quandoManual ? null : (motivo ?? null),
    }
    adicionar(item)
    limpar()
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Montar item
        </h2>
        <div className="flex gap-1">
          {FORMATOS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFormato(f.valor)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                formato === f.valor
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-primary/50',
              )}
            >
              {f.titulo}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="copy-bancada">Copy (um bloco por linha)</Label>
          <span className="text-xs text-muted-foreground">{blocos.length} blocos</span>
        </div>
        <Textarea
          id="copy-bancada"
          value={copyTexto}
          onChange={(e) => setCopyTexto(e.target.value)}
          rows={3}
          placeholder={'HOJE TEM\nHAPPY HOUR\nchope em dobro até 20h'}
          className="resize-none font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Fotos do acervo</Label>
        <ArteIaImagePicker
          projectId={projectId}
          referencias={referencias}
          onChange={setReferencias}
          papelPadrao={papelPadrao}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="slot-bancada">Horário</Label>
          <select
            id="slot-bancada"
            value={quandoManual ? '' : slot}
            onChange={(e) => {
              setSlot(e.target.value)
              setDataManual('')
              setHoraManual('')
            }}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
          >
            <option value="">— sem horário (defino depois) —</option>
            {disponiveis.map((s) => (
              <option key={s.scheduledDatetime} value={s.scheduledDatetime}>
                {rotuloDoSlot(s)}
              </option>
            ))}
          </select>
          {slots && disponiveis.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              {slots.avisos[0] ??
                'Sem horário livre sugerido nos próximos 7 dias — use a data manual ao lado.'}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Ou data e hora</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={dataManual}
              onChange={(e) => setDataManual(e.target.value)}
              className="h-9"
            />
            <Input
              type="time"
              value={horaManual}
              onChange={(e) => setHoraManual(e.target.value)}
              className="h-9 w-28"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMostrarInstrucao((v) => !v)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', mostrarInstrucao && 'rotate-180')} />
          Direção adicional e ajuste da foto
        </button>
        {mostrarInstrucao && (
          <div className="space-y-2">
            <Textarea
              value={pedido}
              onChange={(e) => setPedido(e.target.value.slice(0, 1200))}
              rows={2}
              placeholder="Direção de arte: ex. clima de fim de tarde, título em destaque no rodapé"
              className="resize-none"
            />
            <Textarea
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Ajuste da foto (opcional): ex. escurecer o fundo atrás do texto"
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Por padrão a foto NÃO é alterada — a arte é a foto original com os textos e a logo
              por cima.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <p className="text-xs text-muted-foreground">
          {impedimento ?? 'Nada é gerado agora — a geração começa no botão Gerar do card.'}
        </p>
        <Button onClick={adicionarNaFila} disabled={!!impedimento}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar à fila
        </Button>
      </div>
    </div>
  )
}
