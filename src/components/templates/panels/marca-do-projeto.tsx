"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useProjectElements, type ProjectElement } from '@/hooks/use-project-elements'
import { useToast } from '@/hooks/use-toast'
import { casaBusca } from '@/lib/assets/painel-de-elementos'

const LARGURA_MAXIMA = 200

function dimensoesDaImagem(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = reject
    img.src = url
  })
}

/**
 * Seção "Marca" do painel Elementos (CP-V2d): os elementos do projeto, LISTADOS pelo `useProjectElements` e inseridos
 * como camada `image` (até 200 px de largura, proporção da imagem, centrada), como no painel antigo. Upload e exclusão
 * ficam fora do editor até o V2e (continuam na Identidade visual do projeto); daqui não sai envio nem exclusão.
 * Limite herdado do hook: resposta que não é lista (HTML 200 do login) vira lista vazia.
 */
export function MarcaDoProjeto({ busca }: { busca: string }) {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()
  const elementos = useProjectElements(projectId)
  const procurando = busca.trim().length > 0
  const visiveis = (elementos.data ?? []).filter((e) => casaBusca([e.name], busca))

  const inserir = React.useCallback(
    async (elemento: ProjectElement) => {
      try {
        const original = await dimensoesDaImagem(elemento.fileUrl)
        const escala = original.width > LARGURA_MAXIMA ? LARGURA_MAXIMA / original.width : 1
        const width = original.width * escala
        const height = original.height * escala
        const base = createDefaultLayer('image')
        addLayer({
          ...base,
          name: `Elemento - ${elemento.name}`,
          fileUrl: elemento.fileUrl,
          position: { x: (design.canvas.width - width) / 2, y: (design.canvas.height - height) / 2 },
          size: { width, height },
          style: { ...base.style, objectFit: 'cover' as const },
        })
        toast({ title: 'Elemento adicionado', description: 'Redimensione conforme necessário.' })
      } catch (erro) {
        console.error('[Marca] Falha ao medir a imagem do elemento', erro)
        toast({
          title: 'Erro ao adicionar elemento',
          description: 'Não foi possível carregar as dimensões da imagem.',
          variant: 'destructive',
        })
      }
    },
    [addLayer, design.canvas.height, design.canvas.width, toast],
  )

  // a busca só esconde a seção com a lista CONFIRMADA sem resultado: carregando e erro (com o "Tentar de novo") ficam
  if (procurando && elementos.isSuccess && visiveis.length === 0) return null

  return (
    <div data-secao="marca">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Marca</p>
      {elementos.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando os elementos da marca…
        </p>
      ) : elementos.isError ? (
        <div data-aviso="marca-erro" className="space-y-2 rounded-md border border-destructive/40 p-2 text-xs">
          <p>Não foi possível carregar os elementos da marca.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void elementos.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : visiveis.length === 0 ? (
        <p data-aviso="marca-vazia" className="text-xs text-muted-foreground">
          Nenhum elemento da marca ainda. Envie na Identidade visual do projeto.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {visiveis.map((elemento) => (
            <button
              key={elemento.id}
              type="button"
              data-marca={elemento.id}
              onClick={() => void inserir(elemento)}
              title={elemento.name}
              className="relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/40 p-2 transition hover:border-primary hover:bg-muted"
            >
              <Image src={elemento.fileUrl} alt={elemento.name} fill className="object-contain p-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
