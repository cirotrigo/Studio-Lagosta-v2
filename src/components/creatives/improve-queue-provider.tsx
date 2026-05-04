'use client'

import { useImproveQueueProcessor } from '@/hooks/use-improve-queue-processor'
import { ImproveQueueIndicator } from './improve-queue-indicator'

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
  return <ImproveQueueIndicator />
}
