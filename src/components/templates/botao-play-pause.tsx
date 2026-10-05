'use client'

import * as React from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { useRelogioDaPagina } from '@/lib/video/relogio-da-pagina'

/**
 * Toca/pausa o relógio da página aberta. Só aparece em página que é vídeo
 * (vídeo visível ou música). `compacto` é a versão do cabeçalho da página no
 * workspace contínuo (mesmo tamanho dos botões de duplicar/excluir).
 */
export function BotaoPlayPause({ compacto = false }: { compacto?: boolean }) {
  const { design } = useTemplateEditor()
  const { relogio, estado } = useRelogioDaPagina(useMultiPageOpcional()?.currentPageId)
  if (!paginaEVideo(design.layers, design.audio)) return null

  const rotulo = estado.tocando ? 'Pausar' : 'Tocar'
  const Icone = estado.tocando ? Pause : Play
  const gravando = estado.modo === 'gravacao'

  if (compacto) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        title={`${rotulo} (espaço)`}
        aria-label={rotulo}
        disabled={gravando}
        onClick={() => relogio.alternar()}
      >
        <Icone className="h-3.5 w-3.5" />
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-2"
      title={`${rotulo} (espaço)`}
      aria-label={rotulo}
      disabled={gravando}
      onClick={() => relogio.alternar()}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </Button>
  )
}
