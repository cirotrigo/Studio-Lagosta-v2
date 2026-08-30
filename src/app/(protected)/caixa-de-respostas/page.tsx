'use client'

import { usePageConfig } from '@/hooks/use-page-config'
import { CaixaDeRespostasPainel } from '@/components/caixa/caixa-de-respostas'

export default function CaixaDeRespostasPage() {
  usePageConfig(
    'Caixa de Respostas',
    'Comentários do Instagram e avaliações do Google aguardando resposta — a IA propõe, você edita e envia.',
  )
  return <CaixaDeRespostasPainel />
}
