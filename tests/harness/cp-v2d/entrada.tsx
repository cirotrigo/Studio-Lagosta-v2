/**
 * Entrada do harness do CP-V2d: o `TemplateEditorShell` REAL dentro do `QueryProvider` REAL do app (mesmo retry e
 * cache). `window.__v2dAbrir(template)` monta ou troca o template; o `QueryClient` sobrevive à troca (navegação SPA).
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from '@/components/ui/toaster'
import { TemplateEditorShell } from '@/components/templates/template-editor-shell'
import { ProjectAssetsPanel } from '@/components/projects/project-assets-panel'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { TemplateDto } from '@/hooks/use-template'
import type { Layer } from '@/types/template'
import { MASCARAS_DE_IMAGEM } from '@/lib/assets/shapes-library'
import Konva from 'konva'
import { pinturaDoSvgPath, shapeKonvaDoSvgPath } from '@/lib/vetor/desenhar'

export interface AreaDeClique {
  /** fração de uma grade 21×21 sobre a caixa que acerta a forma */
  fracao: number
  centro: boolean
  /** um pixel pintado da própria forma (sobre o traço ou o preenchimento visível) */
  sobreOTraco: boolean | null
  fora: boolean
}
declare global {
  interface Window {
    __v2dAbrir: (template: TemplateDto) => void
    /** CP-V2e: monta a Identidade visual REAL (`ProjectAssetsPanel`) do projeto, no mesmo `QueryProvider` */
    __v2dAbrirIdentidade: (projectId: number) => void
    __v2dMascaras: Array<[string, string | undefined]>
    __v2dAreaDeClique: (layer: Layer) => AreaDeClique
  }
}

function App({ template }: { template: TemplateDto }) {
  return (
    <QueryProvider>
      <TemplateEditorShell key={template.id} template={template} />
      <Toaster />
    </QueryProvider>
  )
}

function Identidade({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()
  React.useEffect(() => {
    window.__v2dQueryClient = queryClient as QueryClient
  }, [queryClient])
  return <ProjectAssetsPanel projectId={projectId} />
}

const raiz = createRoot(document.getElementById('app')!)
window.__v2dAbrir = (template) => raiz.render(<App template={template} />)
window.__v2dAbrirIdentidade = (projectId) =>
  raiz.render(
    <QueryProvider>
      <Identidade projectId={projectId} />
      <Toaster />
    </QueryProvider>,
  )

window.__v2dMascaras = MASCARAS_DE_IMAGEM.map((m) => [m.id, m.pathData])

/**
 * Área de clique (medição, sem ajuste): monta a camada num `Konva.Stage` com as MESMAS props que o
 * `konva-layer-factory` usa para `svg-path` (`shapeKonvaDoSvgPath` + `pinturaDoSvgPath`) e para `line` (`Konva.Line`
 * com `stroke = fill`), e pergunta ao Konva (`getIntersection`) em que pontos ela é clicável.
 */
window.__v2dAreaDeClique = (layer) => {
  const { width: w, height: h } = layer.size
  const margem = 20
  const div = document.createElement('div')
  document.body.appendChild(div)
  const stage = new Konva.Stage({ container: div, width: w + 2 * margem, height: h + 2 * margem })
  const camada = new Konva.Layer()
  stage.add(camada)
  const st = layer.style ?? {}
  const fill = st.fill ?? '#000000'
  const forma =
    st.shapeType === 'line'
      ? new Konva.Line({ x: margem, y: margem, points: [0, h / 2, w, h / 2], stroke: fill, strokeWidth: st.strokeWidth ?? 4 })
      : new Konva.Shape({
          x: margem,
          y: margem,
          width: w,
          height: h,
          ...shapeKonvaDoSvgPath(st.pathData ?? '', st.pathViewBox, pinturaDoSvgPath(st, { fill, stroke: st.strokeColor, strokeWidth: st.strokeWidth ?? 0 })),
        })
  camada.add(forma)
  camada.draw()
  const acerta = (x: number, y: number) => stage.getIntersection({ x, y }) === forma
  let acertos = 0
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) if (acerta(margem + (w * i) / 20, margem + (h * j) / 20)) acertos++
  const ctx = (camada.getCanvas() as unknown as { getContext: () => { getImageData: (...a: number[]) => ImageData } }).getContext()
  const dados = ctx.getImageData(0, 0, stage.width(), stage.height()).data
  let sobreOTraco: boolean | null = null
  for (let p = 3; p < dados.length; p += 4) {
    if (dados[p] > 200) {
      const k = (p - 3) / 4
      sobreOTraco = acerta(k % stage.width(), Math.floor(k / stage.width()))
      break
    }
  }
  const resultado = { fracao: acertos / 441, centro: acerta(margem + w / 2, margem + h / 2), sobreOTraco, fora: acerta(margem / 2, margem / 2) }
  stage.destroy()
  div.remove()
  return resultado
}
