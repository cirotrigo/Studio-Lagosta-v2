'use client'

/**
 * "Variante da marca" — copiar a PÁGINA ABERTA como variante do template "Assinatura" (T5, 24/10/2026), sem sair do
 * editor. A cópia leva estilo e posições, nasce FORA do rodízio e só entra numa peça quando pedida pelo nome ou id;
 * esta página fica igual. Contrato: `POST /api/templates/[id]/pages/[pageId]/promover-variante`.
 *
 * Mesmo gate do "Modelo" (`page-model-control.tsx`): só o curador, travado enquanto a permissão carrega. Antes do POST
 * o autosave da página é DESCARREGADO pela mesma função do "Salvar" (`usePageSync().descarregar`): a cópia lê o último
 * estado gravado. O shell não monta este controle no template "Assinatura" (lá, duplicar a página é o gesto).
 */

import * as React from 'react'
import { Layers, Loader2, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ToastAction } from '@/components/ui/toast'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useProject } from '@/hooks/use-project'
import { usePromoverVariante } from '@/hooks/use-promover-variante'
import { useToast } from '@/hooks/use-toast'
import { usePageSync } from './page-sync-wrapper'

interface PageVariantControlProps {
  projectId: number
}

/** O estado e a ação, compartilhados pelo botão do desktop e pela seção do celular. */
function usePromocao(projectId: number) {
  const { templateId, currentPage } = useMultiPage()
  const projectQuery = useProject(projectId)
  const pageSync = usePageSync()
  const promover = usePromoverVariante(projectId, templateId)
  const { toast } = useToast()
  const [aberto, setAberto] = React.useState(false)

  const carregandoPermissao = projectQuery.isLoading
  const travado = !currentPage || carregandoPermissao || projectQuery.data?.canCurate !== true

  const confirmar = async () => {
    if (!currentPage) return
    try {
      await pageSync?.descarregar()
      const r = await promover.mutateAsync(currentPage.id)
      setAberto(false)
      toast({
        title: r.jaExistia ? 'Esta página já é uma variante da marca' : 'Variante da marca criada',
        description: `"${r.nome}" está no template Assinatura, fora do rodízio.${r.avisos.length ? ` ${r.avisos.join(' ')}` : ''}`,
        action: (
          <ToastAction altText="Abrir variante" onClick={() => window.location.assign(r.editorUrl)}>
            Abrir variante
          </ToastAction>
        ),
      })
    } catch (error: unknown) {
      setAberto(false)
      toast({
        title: 'Não deu para criar a variante',
        description: error instanceof Error ? error.message : 'Tente de novo em instantes',
        variant: 'destructive',
      })
    }
  }

  return { currentPage, carregandoPermissao, travado, aberto, setAberto, confirmar, pendente: promover.isPending }
}

function DialogoDaPromocao({ estado }: { estado: ReturnType<typeof usePromocao> }) {
  const deLayouts = (estado.currentPage?.tags ?? []).includes('layout')
  return (
    <AlertDialog open={estado.aberto} onOpenChange={(v) => !estado.pendente && estado.setAberto(v)}>
      <AlertDialogContent data-dialogo="variante-da-marca">
        <AlertDialogHeader>
          <AlertDialogTitle>Copiar como variante da marca?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="list-disc space-y-1.5 pl-5 text-left text-sm text-muted-foreground">
              <li>Copia esta página para o template Assinatura; esta página fica igual.</li>
              <li>A variante leva o estilo e as posições dos textos, não o layout.</li>
              <li>Ela nasce fora do rodízio: só entra numa peça quando for pedida pelo nome ou pelo id.</li>
              <li>A variante é editável no template Assinatura, e a edição vale para as próximas peças e recomposições.</li>
              {deLayouts && <li data-aviso="layouts">Esta página nasceu de um layout: a foto em caixa, o fundo liso e os acentos não se repetem nas peças.</li>}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={estado.pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={estado.pendente}
            onClick={(e) => {
              e.preventDefault()
              void estado.confirmar()
            }}
          >
            {estado.pendente ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {estado.pendente ? 'Copiando...' : 'Copiar como variante'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const motivoDaTrava = (carregando: boolean) =>
  carregando ? 'Conferindo suas permissões...' : 'Só o dono do projeto (ou um admin da organização) cria variantes da marca.'

/** O botão do header do editor (desktop). */
export function PageVariantButton({ projectId }: PageVariantControlProps) {
  const estado = usePromocao(projectId)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-controle="variante-da-marca"
        disabled={estado.travado}
        title={estado.travado ? motivoDaTrava(estado.carregandoPermissao) : 'Copiar esta página como variante da marca (fora do rodízio)'}
        onClick={() => estado.setAberto(true)}
      >
        {estado.carregandoPermissao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : estado.travado ? <Lock className="mr-2 h-4 w-4" /> : <Layers className="mr-2 h-4 w-4" />}
        Variante da marca
      </Button>
      <DialogoDaPromocao estado={estado} />
    </>
  )
}

/** A linha do menu "O que você quer fazer?" (celular). */
export function PageVariantMobileSection({ projectId }: PageVariantControlProps) {
  const estado = usePromocao(projectId)
  return (
    <div className="rounded-lg p-3" data-controle="variante-da-marca-celular">
      <div className="mb-3 flex items-start gap-3">
        <Layers className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Variante da marca</span>
          <span className="block text-xs text-muted-foreground">Copia esta página para a assinatura, fora do rodízio</span>
        </span>
      </div>
      {estado.travado && estado.currentPage && (
        <p className="mb-2 flex items-start gap-2 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          {estado.carregandoPermissao ? <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" /> : <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
          <span>{motivoDaTrava(estado.carregandoPermissao)}</span>
        </p>
      )}
      <Button size="sm" variant="outline" className="w-full" disabled={estado.travado} onClick={() => estado.setAberto(true)}>
        Copiar como variante
      </Button>
      <DialogoDaPromocao estado={estado} />
    </div>
  )
}
