"use client"

import * as React from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ProjectElement } from '@/hooks/use-project-elements'
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
}

interface IconesDaCombinacaoProps {
  linhas: LinhaDeIcone[]
  elementos: ProjectElement[] | undefined
  carregando: boolean
  onEscolher: (linha: LinhaDeIcone, elemento: ProjectElement) => void
  onTirar: (icone: Layer) => void
  onSelecionar: (layerId: string) => void
}

function rotuloDoTexto(texto: Layer): string {
  const label = texto.metadata?.elementLabel
  if (typeof label === 'string' && label) return label
  return (texto.content ?? 'Texto').split('\n')[0]
}

/**
 * Ícone ao lado de cada texto da combinação em edição: trocar, pôr e tirar
 * sem sair do painel. Mora aqui, e não na aba Elementos, porque trocar de aba
 * desmonta o painel de Texto e a edição em andamento se perde.
 */
export function IconesDaCombinacao({ linhas, elementos, carregando, onEscolher, onTirar, onSelecionar }: IconesDaCombinacaoProps) {
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
        Ícone de cada texto — clique no nome para selecionar e mover; no quadrado, troque
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
}: {
  linha: LinhaDeIcone
  icones: ProjectElement[]
  outros: ProjectElement[]
  carregando: boolean
  onEscolher: IconesDaCombinacaoProps['onEscolher']
  onTirar: IconesDaCombinacaoProps['onTirar']
  onSelecionar: IconesDaCombinacaoProps['onSelecionar']
}) {
  const [aberto, setAberto] = React.useState(false)
  const { icone } = linha

  const escolher = (elemento: ProjectElement) => {
    setAberto(false)
    onEscolher(linha, elemento)
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

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={icone ? 'Trocar o ícone' : 'Pôr um ícone'}
            // Cinza médio: os ícones da marca vão do creme ao verde-escuro, e
            // fundo claro ou escuro esconde metade deles
            className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border/60 bg-zinc-400 transition hover:border-primary"
          >
            {icone?.fileUrl ? (
              <img src={icone.fileUrl} alt="" draggable={false} className="h-5 w-5 object-contain" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5 text-zinc-800" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 space-y-2 p-2">
          {carregando ? (
            <p className="text-[11px] text-muted-foreground">Carregando elementos…</p>
          ) : icones.length + outros.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhum elemento neste projeto. Envie os ícones pela aba Elementos.
            </p>
          ) : (
            <>
              <GradeDeElementos titulo="Ícones" elementos={icones} atual={icone?.fileUrl} onEscolher={escolher} />
              <GradeDeElementos
                titulo={icones.length > 0 ? 'Outros elementos' : 'Elementos'}
                elementos={outros}
                atual={icone?.fileUrl}
                onEscolher={escolher}
              />
            </>
          )}
          {icone && (
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
