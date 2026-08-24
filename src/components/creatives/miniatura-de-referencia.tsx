'use client'

/**
 * Miniatura de foto de referência com dois níveis de "ver melhor":
 *
 *  - HOVER (desktop): prévia flutuante ~2,5× ao lado da miniatura. Vai por
 *    PORTAL com `position: fixed` — dentro do contêiner ela seria cortada
 *    pelo `overflow-hidden` do card (a lição do lightbox de 10/08: elemento
 *    com caixa correta que some é recorte de ancestral).
 *  - CLIQUE: abre a imagem grande num Dialog. É o caminho do celular também,
 *    onde hover não existe (regra da casa desde o botão X invisível).
 *
 * Pedido do Ciro em 23/08/2026, junto com as múltiplas fotos por item: poder
 * conferir a foto de referência como já se confere a arte pronta.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A miniatura do acervo sai de `/api/drive/thumbnail/<id>` sem `size` — para a
 * prévia e o Dialog pedimos uma versão maior à MESMA rota (ela honra o
 * parâmetro desde 13/08). URL de Blob já é o arquivo; vai como está.
 */
function urlMaior(thumbUrl: string, px: number): string {
  if (!thumbUrl.includes('/api/drive/thumbnail/')) return thumbUrl
  return thumbUrl.includes('?') ? thumbUrl : `${thumbUrl}?size=${px}`
}

export function MiniaturaDeReferencia({
  thumbUrl,
  label,
  className,
  sizes = '64px',
}: {
  thumbUrl: string
  label?: string | null
  /** Classes do contêiner interno da imagem (o chamador dá a moldura). */
  className?: string
  sizes?: string
}) {
  const [previewRect, setPreviewRect] = React.useState<DOMRect | null>(null)
  const [aberta, setAberta] = React.useState(false)

  if (!thumbUrl) return null

  const alt = label ?? 'Foto de referência'

  // ~2,5× a miniatura, com piso para a prévia dizer alguma coisa.
  const previewSize = previewRect ? Math.min(Math.max(previewRect.width * 2.5, 180), 340) : 0
  const previewStyle: React.CSSProperties | null = previewRect
    ? {
        position: 'fixed',
        zIndex: 90,
        width: previewSize,
        height: previewSize,
        left: Math.min(previewRect.right + 8, Math.max(8, window.innerWidth - previewSize - 8)),
        top: Math.min(
          Math.max(previewRect.top + previewRect.height / 2 - previewSize / 2, 8),
          Math.max(8, window.innerHeight - previewSize - 8),
        ),
      }
    : null

  return (
    <>
      <button
        type="button"
        className={cn('relative block h-full w-full cursor-zoom-in', className)}
        onMouseEnter={(e) => setPreviewRect(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setPreviewRect(null)}
        onClick={() => {
          setPreviewRect(null)
          setAberta(true)
        }}
        title={`${alt} — clique para ampliar`}
      >
        <Image src={thumbUrl} alt={alt} fill sizes={sizes} className="object-cover" unoptimized />
      </button>

      {previewStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={previewStyle}
            className="pointer-events-none overflow-hidden rounded-lg border border-border bg-background shadow-xl"
          >
            {/* A prévia pede uma versão maior — esticar a thumb de 64px em 2,5× só amplia o borrão. */}
            <Image src={urlMaior(thumbUrl, 640)} alt={alt} fill sizes="340px" className="object-cover" unoptimized />
          </div>,
          document.body,
        )}

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-[min(92vw,900px)] p-2 sm:p-3">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* A arte aparece INTEIRA, na proporção dela — nunca cortada (regra de 13/08). */}
          <div className="relative max-h-[80dvh] w-full overflow-hidden rounded-md bg-muted">
            <img
              src={urlMaior(thumbUrl, 1600)}
              alt={alt}
              className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain"
            />
          </div>
          {label ? <p className="truncate px-1 text-center text-xs text-muted-foreground">{label}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
