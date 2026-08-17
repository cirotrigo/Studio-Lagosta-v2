'use client'

/**
 * "Modelo" — promover a PÁGINA ABERTA no editor a modelo do cliente, com as
 * tags de tema, sem sair do editor.
 *
 * Por que isto existe: até 16/08/2026 marcar modelo pela web só dava pela aba
 * **Modelos** do projeto, e só no caminho de CRIAR um modelo em branco
 * (`POST /api/projects/[id]/modelos`). Página já desenhada no editor não tinha
 * como ser promovida — a aba lista apenas `isTemplate: true`
 * (`/api/templates/[id]/template-pages`), então a página comum nunca aparecia
 * lá nem para virar modelo, nem para receber tag. O switch existia
 * (`ToggleTemplateButton`) e a rota existia, mas o botão nunca foi montado em
 * lugar nenhum — código morto desde sempre.
 *
 * O switch e as tags moram JUNTOS de propósito. Modelo sem tag não é achado
 * por tema: `prepareCreative` (`src/lib/creatives/arte-rapida.ts`) casa o tema
 * pedido contra `Page.tags` + `Template.tags` e FALHA quando nada casa. Separar
 * os dois controles produz exatamente o modelo mudo que a curadoria de 10/08
 * teve de despromover em massa.
 *
 * Ordem obrigatória: a rota de tags
 * (`/api/projects/[id]/template-pages/[pageId]/tags`) exige `isTemplate: true`,
 * então o campo de tags só abre depois que a página vira modelo.
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Star, Tag } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TagInput } from '@/components/projects/tag-input'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useProject } from '@/hooks/use-project'
import { useProjectTags } from '@/hooks/use-project-tags'
import { useToggleTemplate } from '@/hooks/use-toggle-template'
import { useUpdateTemplatePageTags } from '@/hooks/use-template-page-tags'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface PageModelControlProps {
  projectId: number
}

/** O miolo, compartilhado pelo popover do desktop e pelo diálogo do celular. */
function PageModelForm({ projectId }: PageModelControlProps) {
  const { templateId, currentPage, isLoading: paginasCarregando } = useMultiPage()
  const { toast } = useToast()

  const queryClient = useQueryClient()
  const projectQuery = useProject(projectId)
  const projectTagsQuery = useProjectTags({ projectId })
  const toggleTemplate = useToggleTemplate(templateId)
  const updateTags = useUpdateTemplatePageTags(projectId)

  const isModelo = Boolean(currentPage?.isTemplate)

  /**
   * Só o curador (dono do projeto ou admin da org com quem ele é
   * compartilhado) promove modelo — o mesmo gate que já protege as tags e a
   * criação de modelos na aba Modelos. Enquanto a resposta não chega, o
   * controle fica travado: habilitar antes de saber só trocaria o cadeado por
   * um 403 depois do clique.
   */
  const canCurate = projectQuery.data?.canCurate === true
  const carregandoPermissao = projectQuery.isLoading

  const [rascunhoTags, setRascunhoTags] = React.useState<string[]>([])
  const [tagsSujas, setTagsSujas] = React.useState(false)

  const tagsDaPagina = React.useMemo(
    () => currentPage?.tags ?? [],
    [currentPage?.tags],
  )

  /**
   * A sincronização do rascunho é disparada pelo CONTEÚDO das tags, nunca pela
   * referência do array.
   *
   * O autosave do editor chama `useUpdatePage({ skipInvalidation: true })`, que
   * SUBSTITUI o objeto inteiro da página no cache `['pages', templateId]` pela
   * resposta do PATCH (use-pages.ts:145), a cada pausa da digitação no canvas.
   * Com a referência do array na dependência, isso remontaria o rascunho e
   * zeraria `tagsSujas` — as tags sendo escritas sumiriam junto com o botão
   * "Salvar tags".
   *
   * Hoje o `replaceEqualDeep` do TanStack Query preserva a referência quando o
   * conteúdo é igual, então o wipe não chega a acontecer. Mas essa proteção
   * depende de a rota nunca parar de mandar `tags`: sem o campo, o `?? []`
   * acima cria um array novo a cada render e o problema volta em silêncio.
   */
  const assinaturaDasTags = JSON.stringify(tagsDaPagina)
  React.useEffect(() => {
    setRascunhoTags(JSON.parse(assinaturaDasTags) as string[])
    setTagsSujas(false)
  }, [assinaturaDasTags, currentPage?.id])

  const sugestoes = React.useMemo(() => {
    const set = new Set<string>()
    for (const tag of projectTagsQuery.data ?? []) {
      if (tag.name) set.add(tag.name)
    }
    for (const tag of tagsDaPagina) {
      if (tag) set.add(tag)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [projectTagsQuery.data, tagsDaPagina])

  if (!currentPage) {
    // "Ainda não carregou" e "não há página" pedem frases diferentes: abrir o
    // popover durante o carregamento mandava criar uma página que já existia.
    return paginasCarregando ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando as páginas...
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">
        Abra uma página para marcá-la como modelo.
      </p>
    )
  }

  const handleToggle = (checked: boolean) => {
    toggleTemplate.mutate({ pageId: currentPage.id, isTemplate: checked })
  }

  const handleSalvarTags = async () => {
    try {
      const salvo = await updateTags.mutateAsync({
        pageId: currentPage.id,
        tags: rascunhoTags,
      })
      /**
       * `useUpdateTemplatePageTags` invalida `['template-pages']` (a aba
       * Modelos), mas o editor lê `['pages', templateId]` — outra entrada, que
       * ficaria com as tags ANTIGAS. Como o popover desmonta ao fechar, o
       * rascunho é reconstruído desse cache e reabrir mostraria o valor velho.
       * Escrita cirúrgica em vez de invalidar: refetch de `['pages']` traria
       * todas as páginas COM layers de volta só por causa de uma lista de tags.
       */
      queryClient.setQueryData(
        ['pages', templateId],
        (paginas: Array<{ id: string }> | undefined) =>
          paginas?.map((p) =>
            p.id === currentPage.id ? { ...p, tags: salvo.tags } : p,
          ),
      )
      setTagsSujas(false)
      toast({ title: 'Tags atualizadas' })
    } catch (error: unknown) {
      toast({
        title: 'Não deu para salvar as tags',
        description:
          error instanceof Error ? error.message : 'Tente de novo em instantes',
        variant: 'destructive',
      })
    }
  }

  const travado = !canCurate || carregandoPermissao

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label
            htmlFor="page-model-switch"
            className="cursor-pointer text-sm font-medium"
          >
            Página modelo
          </Label>
          <p className="text-xs text-muted-foreground">
            Vira base para as próximas artes deste cliente.
          </p>
        </div>
        <Switch
          id="page-model-switch"
          checked={isModelo}
          onCheckedChange={handleToggle}
          disabled={travado || toggleTemplate.isPending}
        />
      </div>

      {travado && (
        <p className="flex items-start gap-2 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          {carregandoPermissao ? (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" />
          ) : (
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span>
            {carregandoPermissao
              ? 'Conferindo suas permissões...'
              : 'Só o dono do projeto (ou um admin da organização) pode definir modelos.'}
          </span>
        </p>
      )}

      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          <span>Tags de tema</span>
        </div>
        <TagInput
          value={rascunhoTags}
          onChange={(next) => {
            setRascunhoTags(next)
            setTagsSujas(true)
          }}
          suggestions={sugestoes}
          placeholder={
            isModelo ? 'almoco-executivo, happy-hour...' : 'Marque como modelo primeiro'
          }
          disabled={travado || !isModelo}
        />
        <p className="text-xs text-muted-foreground">
          {isModelo
            ? 'É por elas que o Studio acha este modelo a partir de uma frase ("faz o story de happy hour"). Sem tag, ele não é encontrado por tema.'
            : 'Disponíveis depois que a página virar modelo.'}
        </p>
        {isModelo && !travado && tagsSujas && (
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRascunhoTags(tagsDaPagina)
                setTagsSujas(false)
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSalvarTags}
              disabled={updateTags.isPending}
            >
              {updateTags.isPending ? 'Salvando...' : 'Salvar tags'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** O botão do header do editor (desktop). */
export function PageModelButton({ projectId }: PageModelControlProps) {
  const { currentPage } = useMultiPage()
  const isModelo = Boolean(currentPage?.isTemplate)

  /**
   * Pré-aquece a permissão. O `useProject` do formulário só dispararia quando o
   * popover monta, e aí a primeira abertura passava ~1s em "Conferindo suas
   * permissões..." com os controles travados. Aqui a query sobe junto com o
   * editor e o popover já abre resolvido — mesma queryKey, mesmo cache.
   */
  useProject(projectId)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={isModelo ? 'default' : 'outline'}
          title={
            isModelo
              ? 'Esta página é um modelo do cliente'
              : 'Marcar esta página como modelo do cliente'
          }
        >
          <Star
            className={cn('mr-2 h-4 w-4', isModelo && 'fill-current')}
          />
          {isModelo ? 'Modelo' : 'Marcar modelo'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PageModelForm projectId={projectId} />
      </PopoverContent>
    </Popover>
  )
}

/** A linha do menu "O que você quer fazer?" (celular). */
export function PageModelMobileSection({ projectId }: PageModelControlProps) {
  const { currentPage } = useMultiPage()
  const isModelo = Boolean(currentPage?.isTemplate)

  return (
    <div className="rounded-lg p-3">
      <div className="mb-3 flex items-start gap-3">
        <Star
          className={cn(
            'mt-0.5 h-5 w-5 flex-shrink-0 text-primary',
            isModelo && 'fill-current',
          )}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {isModelo ? 'Modelo do cliente' : 'Usar como modelo'}
          </span>
          <span className="block text-xs text-muted-foreground">
            Deixa esta página disponível para as próximas artes
          </span>
        </span>
      </div>
      <PageModelForm projectId={projectId} />
    </div>
  )
}
