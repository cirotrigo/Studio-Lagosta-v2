'use client'

import { usePathname } from 'next/navigation'
import { useImproveQueueProcessor } from '@/hooks/use-improve-queue-processor'
import { ImproveQueueIndicator } from './improve-queue-indicator'

// Indicador flutuante nas páginas de criativos (galeria global, detalhe do
// projeto e galeria standalone) e na AGENDA, de onde a melhoria também é
// disparada. No editor de templates ele sobrepunha a lixeira e a paginação.
// O processor continua montado em todas as rotas para a fila não parar
// enquanto o usuário navega.
//
// A agenda entrou em 08/08/2026: quando ela virou rota própria, o `?tab=agenda`
// deixou de casar com `/projects/[id]` e o indicador sumiu justamente da tela
// onde fica o botão "Melhorar com IA" — pedia-se a melhoria e nada dava sinal
// de vida.
function shouldShowIndicator(pathname: string): boolean {
  if (pathname === '/criativos') return true
  if (pathname === '/agenda') return true
  if (/^\/projects\/[^/]+$/.test(pathname)) return true
  if (/^\/projects\/[^/]+\/creativos/.test(pathname)) return true
  if (/^\/projects\/[^/]+\/agenda/.test(pathname)) return true
  return false
}

/**
 * Provider single-instance da fila de melhorias com IA.
 *
 * Monta o processor (que processa items pending serialmente) e o indicador
 * flutuante. Coloque uma única vez no layout protegido — o processor é
 * idempotente quando montado várias vezes (usa ref pra evitar dupla execução),
 * mas usar uma única instância simplifica o raciocínio.
 */
export function ImproveQueueProvider() {
  useImproveQueueProcessor()
  const pathname = usePathname()
  if (!shouldShowIndicator(pathname)) return null
  return <ImproveQueueIndicator />
}
