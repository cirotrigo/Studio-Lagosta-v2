'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Video } from 'lucide-react'
import { capaDeVideoUrl } from './calendar-utils'

interface CapaDeVideoProps {
  /** A URL do vídeo (não a da capa). */
  src: string
  alt: string
  sizes: string
  /** Tamanho do ícone que aparece quando o vídeo não pôde ser lido. */
  iconClassName: string
}

/**
 * A capa de um post de vídeo nos cards da agenda: um quadro do vídeo, inteiro
 * (`contain`, como toda arte da agenda), dentro do contêiner `relative` de
 * quem chama.
 *
 * Vídeo morto (blob apagado, host antigo) cai no ícone — nunca fica em branco.
 */
export function CapaDeVideo({ src, alt, sizes, iconClassName }: CapaDeVideoProps) {
  // Guarda QUAL vídeo falhou, não um booleano: o card é reaproveitado quando
  // a mídia do post muda, e a falha da anterior não vale para a nova.
  const [falhouEm, setFalhouEm] = useState<string | null>(null)

  if (falhouEm === src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Video className={iconClassName} />
      </div>
    )
  }

  return (
    <Image
      src={capaDeVideoUrl(src)}
      alt={alt}
      fill
      sizes={sizes}
      className="object-contain"
      loading="lazy"
      // A rota já devolve o JPEG no tamanho do card, e o otimizador do Next
      // não chegaria a ela (a rota exige sessão).
      unoptimized
      onError={() => setFalhouEm(src)}
    />
  )
}
