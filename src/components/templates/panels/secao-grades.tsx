"use client"

import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { casaBusca } from '@/lib/assets/painel-de-elementos'
import { CATALOGO_DE_GRADES, type LayoutDeGrade } from '@/lib/grades/catalogo'
import { celulasDaGrade, espacamentoInicial } from '@/lib/grades/geometria'
// G2: o mesmo medidor do preenchimento, com prazo (a medida que nunca termina vira "sem medida", não botão preso)
import { medirFotoNoNavegador } from '@/lib/grades/medir-foto'
import { paginaEVideo } from '@/lib/video/camadas-de-video'

const TERMOS = ['grade', 'grades', 'grid', 'colagem', 'fotos']

/** Layouts que casam com a busca do painel (nome, nome com × lido como x, e os termos da seção) */
export function gradesDaBusca(busca: string): LayoutDeGrade[] {
  return CATALOGO_DE_GRADES.filter((l) => casaBusca([l.nome, l.nome.replace(/×/g, 'x'), ...TERMOS], busca))
}

/**
 * Seção "Grades" do painel Elementos (G1): os layouts do catálogo em miniatura na proporção da página, com o
 * espaçamento com que cada um entra (`espacamentoInicial`: 10, ou 0 nas quadradas do Q2, com a ajuda da margem).
 * Clique = `inserirGrade` do contexto (um desfazer). Não depende da paleta da marca (só as formas esperam por ela);
 * página de vídeo desabilita com o motivo escrito.
 */
export function SecaoGrades({ busca }: { busca: string }) {
  const { design, inserirGrade } = useTemplateEditor()
  const { toast } = useToast()
  const [inserindo, setInserindo] = React.useState(false)
  const grades = gradesDaBusca(busca)
  if (grades.length === 0) return null
  const { width, height } = design.canvas
  const video = paginaEVideo(design.layers, design.audio)

  const inserir = async (layout: LayoutDeGrade) => {
    setInserindo(true)
    try {
      const r = await inserirGrade(layout.id, { medirFoto: medirFotoNoNavegador })
      if (!r.ok) toast({ variant: 'destructive', description: r.mensagem })
      else if (r.aviso) toast({ description: r.aviso.mensagem })
      else toast({ description: r.convertida ? 'Grade inserida com a foto de fundo na primeira célula.' : 'Grade inserida.' })
    } finally {
      setInserindo(false)
    }
  }

  return (
    <div data-secao="grades" role="group" aria-label="Grades">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Grades</p>
      {video && <p className="mb-2 text-xs text-muted-foreground">Página de vídeo: as grades só entram em página de imagem.</p>}
      <div className="grid grid-cols-3 gap-2">
        {grades.map((layout) => {
          const geo = celulasDaGrade(layout, { x: 0, y: 0, w: width, h: height }, espacamentoInicial(layout))
          return (
            <button
              key={layout.id}
              type="button"
              data-grade={layout.id}
              aria-label={`Grade ${layout.nome}`}
              title={layout.nome}
              onClick={() => void inserir(layout)}
              disabled={inserindo || video}
              className="flex items-center justify-center rounded-lg border border-border/40 bg-muted/40 p-2 transition hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* espaçamento real (até 10 px) some na miniatura: o contorno da cor do fundo separa as células */}
              <svg viewBox={`0 0 ${width} ${height}`} className="h-16 max-w-full" aria-hidden="true">
                {geo.ok &&
                  geo.valor.celulas.map((c, i) => (
                    <rect key={i} data-celula={i} x={c.x} y={c.y} width={c.w} height={c.h} className="fill-muted-foreground/60 stroke-background" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  ))}
              </svg>
            </button>
          )
        })}
      </div>
      {grades.some((l) => l.politica === 'quadradas') && (
        <p data-ajuda="grades-quadradas" className="mt-2 text-xs text-muted-foreground">
          Nas grades quadradas as fotos ficam sempre 1:1, então pode sobrar uma pequena margem na página. No Story 1080×1920 com 28 fotos, o espaçamento 40 encaixa exato.
        </p>
      )}
    </div>
  )
}
