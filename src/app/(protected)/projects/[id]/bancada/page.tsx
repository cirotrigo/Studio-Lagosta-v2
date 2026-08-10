'use client'

/**
 * Bancada — a tela onde uma pessoa produz a leva do dia sem passar pelo chat.
 *
 * Fase 3 do plano docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md: é a
 * superfície que substitui a bancada do insta-automatico, reusando o motor de
 * geração (arte-ia), o acervo com papéis e a agenda que já existem aqui.
 */

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePageMetadata } from '@/contexts/page-metadata'
import { BancadaCompositor } from '@/components/bancada/bancada-compositor'
import { BancadaFila } from '@/components/bancada/bancada-fila'
import { useBancadaStore } from '@/stores/bancada-store'

export default function BancadaPage() {
  const params = useParams()
  const projectId = Number(params?.id)
  const valido = Number.isFinite(projectId) && projectId > 0

  const hidratou = useBancadaStore((s) => s.hidratou)
  const limparFinalizados = useBancadaStore((s) => s.limparFinalizados)
  const total = useBancadaStore((s) => s.itens.filter((i) => i.projectId === projectId).length)
  const finalizados = useBancadaStore(
    (s) =>
      s.itens.filter(
        (i) => i.projectId === projectId && (i.status === 'agendado' || i.status === 'erro'),
      ).length,
  )

  /*
    Sem título, sem descrição e sem trilha: o mesmo que a página do projeto e a
    agenda fazem. A faixa do `PageHeader` só some quando os TRÊS faltam — com
    título definido ela renderiza mesmo com `showBreadcrumbs: false`, e era isso
    que empurrava o menu do projeto para baixo só nesta tela.

    O rótulo também era redundante: o item aceso no menu já diz "Bancada".

    Restaurar no unmount é obrigatório — `useSetPageMetadata` não tem limpeza
    própria, e sair daqui deixaria as outras páginas sem trilha.
  */
  const { setMetadata } = usePageMetadata()
  React.useEffect(() => {
    setMetadata({ showBreadcrumbs: false })
    return () => setMetadata({ showBreadcrumbs: true })
  }, [setMetadata])

  if (!valido) {
    return (
      <Card className="m-8 p-6 text-sm text-muted-foreground">
        Projeto inválido. Verifique a URL ou selecione o projeto novamente.
      </Card>
    )
  }

  return (
    // Sem "Voltar ao projeto": o menu do projeto agora persiste no layout, e
    // um botão de volta ao lado dele só competiria com a própria navegação.
    <div className="flex flex-col gap-6 py-2">
      <BancadaCompositor projectId={projectId} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Fila {total > 0 ? `(${total})` : ''}
          </h2>
          {finalizados > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => limparFinalizados(projectId)}
            >
              Limpar finalizados ({finalizados})
            </Button>
          )}
        </div>
        {/* Só depois de hidratar: renderizar a fila vazia no servidor e
            preenchê-la no cliente faria a tela piscar "fila vazia". */}
        {hidratou ? (
          <BancadaFila projectId={projectId} />
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        )}
      </section>
    </div>
  )
}
