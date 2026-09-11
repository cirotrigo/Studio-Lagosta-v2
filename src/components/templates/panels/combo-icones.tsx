"use client"

import * as React from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectElement } from '@/hooks/use-project-elements'
import type { LadoDoOrnamento, PapelDaCombinacao } from '@/lib/font-combinations'
import type { Dimensoes } from '@/lib/font-combinations-icones'
import type { Layer } from '@/types/template'

/** Tamanho natural da imagem, para o ícone sair na proporção do arquivo */
export function carregarDimensoes(url: string): Promise<Dimensoes | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () =>
      resolve(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export interface LinhaDeIcone {
  texto: Layer
  icone: Layer | null
  /** Papel do texto para o compositor */
  papel?: PapelDaCombinacao | null
  /** Quantos elementos (além do ícone) estão presos a este texto */
  elementos?: number
}

/** Os papéis que o compositor entende, na ordem de leitura de uma peça */
export const ROTULOS_DE_PAPEL: Array<[PapelDaCombinacao, string]> = [
  ['pre', 'Pré-título'],
  ['headline', 'Manchete'],
  ['headline2', '2ª voz'],
  ['apoio', 'Apoio'],
  ['cta', 'CTA'],
  ['servico', 'Serviço'],
]

const SEM_PAPEL = 'nenhum'

const LADOS: Array<[LadoDoOrnamento, string, string]> = [
  ['antes', 'Ícone', 'À esquerda do texto (troca o ícone)'],
  ['acima', 'Acima', 'Acima do texto'],
  ['abaixo', 'Abaixo', 'Abaixo do texto (filete)'],
  ['depois', 'Depois', 'À direita do texto (selo)'],
]

interface IconesDaCombinacaoProps {
  linhas: LinhaDeIcone[]
  elementos: ProjectElement[] | undefined
  carregando: boolean
  onEscolher: (linha: LinhaDeIcone, elemento: ProjectElement, lado: LadoDoOrnamento) => void
  onTirar: (icone: Layer) => void
  onSelecionar: (layerId: string) => void
  onPapel: (texto: Layer, papel: PapelDaCombinacao | null) => void
}

function rotuloDoTexto(texto: Layer): string {
  const label = texto.metadata?.elementLabel
  if (typeof label === 'string' && label) return label
  return (texto.content ?? 'Texto').split('\n')[0]
}

/**
 * Cada texto da combinação em edição: o papel dele no compositor, o ícone ao
 * lado e os elementos presos a ele (filete, selo). Mora aqui, e não na aba
 * Elementos, porque trocar de aba desmonta o painel de Texto e a edição em
 * andamento se perde.
 */
export function IconesDaCombinacao({ linhas, elementos, carregando, onEscolher, onTirar, onSelecionar, onPapel }: IconesDaCombinacaoProps) {
  // Ícones primeiro: é o que se procura ao pôr um ícone ao lado de um texto
  const { icones, outros } = React.useMemo(() => {
    const lista = elementos ?? []
    const ehIcone = (e: ProjectElement) => /[ií]cone/i.test(e.category ?? '')
    return { icones: lista.filter(ehIcone), outros: lista.filter((e) => !ehIcone(e)) }
  }, [elementos])

  if (linhas.length === 0) return null

  return (
    <div className="space-y-1 border-t border-primary/20 pt-2">
      <p className="text-[10px] text-muted-foreground">
        Cada texto: o papel no compositor e os elementos presos a ele — clique no nome para selecionar e mover
      </p>
      {linhas.map((linha) => (
        <LinhaDoIcone
          key={linha.texto.id}
          linha={linha}
          icones={icones}
          outros={outros}
          carregando={carregando}
          onEscolher={onEscolher}
          onTirar={onTirar}
          onSelecionar={onSelecionar}
          onPapel={onPapel}
        />
      ))}
    </div>
  )
}

function LinhaDoIcone({
  linha,
  icones,
  outros,
  carregando,
  onEscolher,
  onTirar,
  onSelecionar,
  onPapel,
}: {
  linha: LinhaDeIcone
  icones: ProjectElement[]
  outros: ProjectElement[]
  carregando: boolean
  onEscolher: IconesDaCombinacaoProps['onEscolher']
  onTirar: IconesDaCombinacaoProps['onTirar']
  onSelecionar: IconesDaCombinacaoProps['onSelecionar']
  onPapel: IconesDaCombinacaoProps['onPapel']
}) {
  const [aberto, setAberto] = React.useState(false)
  const [lado, setLado] = React.useState<LadoDoOrnamento>('antes')
  const { icone } = linha

  const escolher = (elemento: ProjectElement) => {
    setAberto(false)
    onEscolher(linha, elemento, lado)
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelecionar(icone?.id ?? linha.texto.id)}
        title={icone ? 'Selecionar o ícone no canvas para mover ou redimensionar' : 'Selecionar o texto no canvas'}
        className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-background/60"
      >
        {rotuloDoTexto(linha.texto)}
      </button>

      <Select
        value={linha.papel ?? SEM_PAPEL}
        onValueChange={(valor) => onPapel(linha.texto, valor === SEM_PAPEL ? null : (valor as PapelDaCombinacao))}
      >
        <SelectTrigger className="h-7 w-[5.5rem] shrink-0 px-1.5 text-[10px]" title="Papel deste texto quando o compositor usar a combinação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_PAPEL} className="text-xs">
            Sem papel
          </SelectItem>
          {ROTULOS_DE_PAPEL.map(([valor, rotulo]) => (
            <SelectItem key={valor} value={valor} className="text-xs">
              {rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover
        open={aberto}
        onOpenChange={(abrir) => {
          setAberto(abrir)
          if (abrir) setLado('antes')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            title={icone ? 'Trocar o ícone ou pôr um elemento' : 'Pôr um ícone ou um elemento'}
            // Cinza médio: os ícones da marca vão do creme ao verde-escuro, e
            // fundo claro ou escuro esconde metade deles
            className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border/60 bg-zinc-400 transition hover:border-primary"
          >
            {icone?.fileUrl ? (
              <img src={icone.fileUrl} alt="" draggable={false} className="h-5 w-5 object-contain" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5 text-zinc-800" />
            )}
            {(linha.elementos ?? 0) > 0 && (
              <span className="absolute bottom-0 right-0 rounded-tl bg-primary px-0.5 text-[8px] leading-tight text-primary-foreground">
                +{linha.elementos}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 space-y-2 p-2">
          <div className="grid grid-cols-4 gap-1">
            {LADOS.map(([valor, rotulo, dica]) => (
              <button
                key={valor}
                type="button"
                title={dica}
                onClick={() => setLado(valor)}
                className={`rounded border py-0.5 text-[10px] transition ${
                  lado === valor ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {carregando ? (
            <p className="text-[11px] text-muted-foreground">Carregando elementos…</p>
          ) : icones.length + outros.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhum elemento neste projeto. Envie os ícones pela aba Elementos.
            </p>
          ) : (
            <>
              <GradeDeElementos titulo="Ícones" elementos={icones} atual={lado === 'antes' ? icone?.fileUrl : undefined} onEscolher={escolher} />
              <GradeDeElementos
                titulo={icones.length > 0 ? 'Outros elementos' : 'Elementos'}
                elementos={outros}
                atual={lado === 'antes' ? icone?.fileUrl : undefined}
                onEscolher={escolher}
              />
            </>
          )}
          {icone && lado === 'antes' && (
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                onTirar(icone)
              }}
              className="flex w-full items-center justify-center gap-1 rounded border border-border/60 py-1 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
              Tirar o ícone
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function GradeDeElementos({
  titulo,
  elementos,
  atual,
  onEscolher,
}: {
  titulo: string
  elementos: ProjectElement[]
  atual?: string
  onEscolher: (elemento: ProjectElement) => void
}) {
  if (elementos.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="grid max-h-40 grid-cols-5 gap-1 overflow-y-auto">
        {elementos.map((elemento) => (
          <button
            key={elemento.id}
            type="button"
            title={elemento.name}
            onClick={() => onEscolher(elemento)}
            className={`flex aspect-square items-center justify-center overflow-hidden rounded border bg-zinc-400 p-1 transition hover:border-primary ${
              elemento.fileUrl === atual ? 'border-primary' : 'border-border/60'
            }`}
          >
            <img src={elemento.fileUrl} alt={elemento.name} draggable={false} className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  )
}
