"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useProjectElements, useUploadProjectElement, type ProjectElement } from '@/hooks/use-project-elements'
import { useToast } from '@/hooks/use-toast'
import { casaBusca } from '@/lib/assets/painel-de-elementos'
import { ACCEPT_DO_ENVIO, recusaDoArquivoNoEditor } from '@/lib/brand/lista-de-elementos'
import { useConfirmarExclusaoDeElemento } from '@/components/projects/confirmar-exclusao-de-elemento'

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
 * Seção "Marca" do painel Elementos: os elementos do projeto, LISTADOS pelo `useProjectElements` (estrito desde o
 * CP-V2e: resposta que não é lista válida vira erro, nunca "vazia") e inseridos como camada `image` (até 200 px de
 * largura, proporção da imagem, centrada).
 *
 * CP-V2e: envio e exclusão voltam, SÓ pelos hooks (nenhum `fetch` aqui).
 * - Envio: vários arquivos, em série; o tipo e o teto (4 MiB) são conferidos antes de qualquer requisição. A fila
 *   captura o projeto ao selecionar; um erro no meio não para os demais e o resumo sai no fim. Troca de projeto ou
 *   desmontagem cancela o que ainda não saiu; o envio em voo termina e reconcilia só o projeto de origem.
 * - Exclusão: a lixeira é IRMÃ do botão de inserir (nunca chama `addLayer`) e só abre a confirmação D6.
 * - Nada é inserido sozinho: o elemento enviado aparece na lista pela nova leitura.
 */
export function MarcaDoProjeto({ busca }: { busca: string }) {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()
  const elementos = useProjectElements(projectId)
  const enviar = useUploadProjectElement()
  const exclusao = useConfirmarExclusaoDeElemento(projectId)
  const entrada = React.useRef<HTMLInputElement>(null)
  const fila = React.useRef<{ cancelada: boolean } | null>(null)
  const [progresso, setProgresso] = React.useState<{ atual: number; total: number } | null>(null)
  const procurando = busca.trim().length > 0
  const visiveis = (elementos.data ?? []).filter((e) => casaBusca([e.name], busca))

  React.useEffect(
    () => () => {
      if (fila.current) fila.current.cancelada = true
      fila.current = null
      setProgresso(null)
    },
    [projectId],
  )

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

  const enviarArquivos = async (arquivos: File[]) => {
    const origem = projectId
    if (typeof origem !== 'number' || fila.current) return
    const recusados = arquivos.flatMap((f) => {
      const motivo = recusaDoArquivoNoEditor(f)
      return motivo ? [`${f.name}: ${motivo}`] : []
    })
    const aceitos = arquivos.filter((f) => recusaDoArquivoNoEditor(f) === null)
    if (recusados.length > 0) toast({ title: 'Arquivo não enviado', description: recusados.join('; '), variant: 'destructive' })
    if (aceitos.length === 0) return

    const execucao = { cancelada: false }
    fila.current = execucao
    const falhas: string[] = []
    for (let i = 0; i < aceitos.length && !execucao.cancelada; i++) {
      setProgresso({ atual: i + 1, total: aceitos.length })
      try {
        await enviar.mutateAsync({ projectId: origem, file: aceitos[i] })
      } catch (erro) {
        falhas.push(`${aceitos[i].name}: ${erro instanceof Error ? erro.message : 'falha no envio'}`)
      }
    }
    // projeto trocado ou painel desmontado: o resto foi cancelado e nada é anunciado no projeto novo
    if (execucao.cancelada) return
    fila.current = null
    setProgresso(null)
    const enviados = aceitos.length - falhas.length
    if (falhas.length === 0) {
      toast({ title: enviados === 1 ? 'Elemento enviado' : `${enviados} elementos enviados`, description: 'Já está na Marca.' })
    } else {
      toast({ title: `${falhas.length} de ${aceitos.length} não enviados`, description: falhas.join('; '), variant: 'destructive' })
    }
  }

  // a busca só esconde a seção com a lista CONFIRMADA sem resultado: carregando e erro (com o "Tentar de novo") ficam
  if (procurando && elementos.isSuccess && visiveis.length === 0) return null

  return (
    <div data-secao="marca">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Marca</p>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={ACCEPT_DO_ENVIO}
          className="hidden"
          data-envio="marca"
          onChange={(evento) => {
            const arquivos = Array.from(evento.target.files ?? [])
            evento.target.value = ''
            void enviarArquivos(arquivos)
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          data-acao="enviar-marca"
          disabled={progresso !== null || typeof projectId !== 'number'}
          onClick={() => entrada.current?.click()}
        >
          {progresso ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Enviando… ({progresso.atual} de {progresso.total})
            </>
          ) : (
            <>
              <Upload className="mr-1 h-3 w-3" /> Enviar
            </>
          )}
        </Button>
      </div>
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
          Nenhum elemento da marca ainda. Use &quot;Enviar&quot; para adicionar.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {visiveis.map((elemento) => (
            <div key={elemento.id} className="relative">
              <button
                type="button"
                data-marca={elemento.id}
                onClick={() => void inserir(elemento)}
                title={elemento.name}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg border border-border/40 bg-muted/40 p-2 transition hover:border-primary hover:bg-muted ${exclusao.apagando === elemento.id ? 'opacity-50' : ''}`}
              >
                <Image src={elemento.fileUrl} alt={elemento.name} fill className="object-contain p-2" />
              </button>
              <button
                type="button"
                data-apagar={elemento.id}
                aria-label={`Apagar ${elemento.name} da Marca`}
                disabled={exclusao.apagando === elemento.id}
                onClick={() => exclusao.pedir({ projectId: elemento.projectId, elementId: elemento.id, nome: elemento.name })}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {exclusao.dialogo}
    </div>
  )
}
