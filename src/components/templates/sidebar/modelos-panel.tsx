'use client'

/**
 * O painel Modelos do editor (S7, 06/11/2026): a mesma vitrine da aba Modelos do projeto (`ModelosGrid` com
 * `compact`), filtrada pelo formato da página aberta.
 *
 * "Usar" cria uma PÁGINA NOVA no arquivo aberto (rota `usar` com `destinoTemplateId`) e o editor pula para ela. A
 * página aberta nunca é tocada: nada de `loadTemplate` sobre ela, o desfazer dela continua, e desfazer o "Usar" é
 * apagar a página nova (`docs/regras/modelos.md`, seção da S7).
 */

import * as React from 'react'
import { Loader2 } from 'lucide-react'
// O Toaster montado no layout é o do `use-toast` (o de 'sonner' não aparece).
import { toast } from '@/hooks/use-toast'

import { ModelosGrid } from '@/components/modelos/modelos-grid'
import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { usePageSync } from '@/components/templates/page-sync-wrapper'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useAbrirPaginaCriada } from '@/hooks/use-layouts'
import { useModelosDoProjeto, useUsarModelo, type ModeloDoProjeto } from '@/hooks/use-modelos-do-projeto'
import { formatoPeloTamanho } from '@/lib/compositor/formato'
import { ehRecusaDoVetor } from '@/lib/editor/recusa-do-vetor'
import { ROTULO_DO_FORMATO } from '@/lib/modelos/vitrine'

export function ModelosPanel({ aoCriarPagina }: { aoCriarPagina?: () => void }) {
  const { projectId, templateId, design } = useTemplateEditor()
  const { pages, setCurrentPageId } = useMultiPage()
  const pageSync = usePageSync()
  const { data: modelos = [], isLoading, isError } = useModelosDoProjeto(projectId)
  const usar = useUsarModelo(projectId)
  const abrirPagina = useAbrirPaginaCriada()

  const formatoDaPagina = formatoPeloTamanho(design.canvas.width, design.canvas.height)
  const [todosOsFormatos, setTodosOsFormatos] = React.useState(false)
  const deOutrosFormatos = React.useMemo(
    () => modelos.filter((m) => m.formato !== formatoDaPagina).length,
    [modelos, formatoDaPagina],
  )

  // O pulo espera a página nova chegar à lista do editor: trocar o id antes faz o MultiPage cair na primeira página
  // (o fallback de "página que não existe"). Mesmo caminho do painel Layouts: no contínuo, quem ativa e rola até a
  // página é o workspace (o evento da PagesBar); no clássico e no celular não há ouvinte e a troca direta basta.
  const [pularPara, setPularPara] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (pularPara && pages.some((p) => p.id === pularPara)) {
      window.dispatchEvent(new CustomEvent('lagosta:activate-page', { detail: pularPara }))
      setCurrentPageId(pularPara)
      setPularPara(null)
      aoCriarPagina?.()
    }
  }, [pularPara, pages, setCurrentPageId, aoCriarPagina])

  // A página que a rota CRIOU e o editor não conseguiu abrir: enquanto existir, nenhum "Usar" cria outra; a
  // recuperação só repete a abertura (GET), nunca o POST — como o painel Layouts.
  const [criadaSemAbrir, setCriadaSemAbrir] = React.useState<{ pageId: string; modelo: string } | null>(null)
  const [abrindo, setAbrindo] = React.useState(false)

  const abrirCriada = async (criada: { pageId: string; modelo: string }) => {
    setAbrindo(true)
    try {
      // ESPERA a lista nova com a página (o editor lê `['pages', templateId]`); lança se ela não vier.
      await abrirPagina(templateId, criada.pageId)
      setCriadaSemAbrir(null)
      setPularPara(criada.pageId)
      toast({ title: `Página nova criada a partir de ${criada.modelo}` })
    } catch (erro) {
      setCriadaSemAbrir(criada)
      toast({
        title: 'Página criada, mas não deu para abri-la',
        description: `${erro instanceof Error && erro.message ? erro.message : 'Erro desconhecido'}. Ela já existe: tente abrir de novo, sem criar outra.`,
        variant: 'destructive',
        duration: 12_000,
        action: (
          <ToastAction altText="Tentar abrir de novo" onClick={() => void abrirCriada(criada)}>
            Tentar de novo
          </ToastAction>
        ),
      })
    } finally {
      setAbrindo(false)
    }
  }

  const handleUsar = async (modelo: ModeloDoProjeto) => {
    if (criadaSemAbrir) {
      toast({ title: 'Abra a página criada antes de usar outro modelo', variant: 'destructive' })
      return
    }
    // A edição pendente da página aberta sai ANTES. Só seguimos com ela gravada, ou quando o servidor a RECUSOU
    // (422): aí o aviso do PageSync a guarda e a troca de página a reenvia. Qualquer outra falha (rede) deixaria a
    // edição em lugar nenhum no pulo de página: para tudo.
    try {
      await pageSync?.descarregar()
    } catch (erro) {
      if (!ehRecusaDoVetor(erro)) {
        console.error('[ModelosPanel] não deu para salvar a página aberta:', erro)
        toast({
          title: 'Não deu para salvar a página aberta. Salve antes de usar um modelo.',
          variant: 'destructive',
          duration: 10_000,
        })
        return
      }
    }
    let copia: { pageId: string }
    try {
      copia = await usar.mutateAsync({ pageId: modelo.id, destinoTemplateId: templateId })
    } catch (erro) {
      toast({
        title: 'Não deu para usar o modelo',
        description: erro instanceof Error && erro.message ? erro.message : 'Tente de novo.',
        variant: 'destructive',
        duration: 10_000,
      })
      return
    }
    await abrirCriada({ pageId: copia.pageId, modelo: modelo.name })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando modelos" />
      </div>
    )
  }
  if (isError) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Não deu para carregar os modelos.</p>
  }
  if (modelos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Este cliente ainda não tem modelos. Marque uma página com &quot;Marcar modelo&quot;.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {criadaSemAbrir && (
        <div role="alert" className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-2 text-[11px] leading-snug">
          <p>A página do modelo foi criada, mas a lista de páginas não recarregou. Abra-a antes de usar outro.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={abrindo}
            onClick={() => void abrirCriada(criadaSemAbrir)}
          >
            {abrindo ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Abrir página criada
          </Button>
        </div>
      )}
      <ModelosGrid
        projectId={projectId}
        modelos={modelos}
        canCurate={false}
        compact
        formatoFixo={todosOsFormatos ? undefined : formatoDaPagina}
        onUsar={handleUsar}
      />
      {deOutrosFormatos > 0 && (
        <button
          type="button"
          onClick={() => setTodosOsFormatos((v) => !v)}
          className="w-full rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {todosOsFormatos
            ? `Mostrar só ${ROTULO_DO_FORMATO[formatoDaPagina].toLowerCase()}`
            : `${deOutrosFormatos} ${deOutrosFormatos === 1 ? 'modelo' : 'modelos'} de outros formatos`}
        </button>
      )}
    </div>
  )
}
