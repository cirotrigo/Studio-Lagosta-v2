'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { BrandDnaSection } from '@/components/projects/brand-dna-section'
import { ArtImprovementPromptConfig } from '@/components/projects/art-improvement-prompt-config'
import { ContentPillarsSection } from '@/components/projects/content-pillars-section'

/**
 * O que SAIU da aba Marca (plano §8): a composição detalhada, o estilo visual,
 * a direção fotográfica e o prompt de melhoria são parâmetros AVANÇADOS —
 * moram em Configurações, recolhidos; o crivo de aprovação vai para o ARQUIVO
 * (continua editável, fora do caminho de quem escreve a copy). Os pilares de
 * conteúdo ficam com o planejamento (bancada), não aqui.
 */
export function DirecaoDeArteAvancada({ projectId, artImprovementPrompt }: { projectId: number; artImprovementPrompt: string | null | undefined }) {
  return (
    <Secao titulo="Avançado · direção de arte" resumo="Composição, estilo visual, direção fotográfica e o prompt de melhoria — o que a IA lê para desenhar. Mexer aqui muda peça, não copy.">
      <BrandDnaSection
        projectId={projectId}
        secoes={['composition', 'visualStyle', 'photoDirection']}
        titulo="DNA visual"
        descricao="As três seções de ARTE do DNA. Entram nos prompts de imagem; a identidade de texto mora na aba Marca."
        mostrarImportacaoDoTom={false}
        mostrarPrevia
      />
      <ArtImprovementPromptConfig projectId={projectId} initialPrompt={artImprovementPrompt} />
    </Secao>
  )
}

export function CrivoArquivado({ projectId }: { projectId: number }) {
  return (
    <Secao titulo="Arquivo · crivo de aprovação" resumo="As perguntas que a bancada confere antes de agendar. Nunca entram em prompt.">
      <BrandDnaSection projectId={projectId} secoes={['approvalChecklist']} titulo="Crivo de aprovação" descricao="Uma pergunta por linha, do jeito que você conferiria a peça." mostrarPrevia={false} mostrarImportacaoDoTom={false} />
    </Secao>
  )
}

export function PlanejamentoDePilares({ projectId }: { projectId: number }) {
  return (
    <Secao titulo="Planejamento · pilares de conteúdo" resumo="Sobre O QUÊ a marca fala, em 5–8 pilares aprovados. É o que distribui os temas da semana.">
      <ContentPillarsSection projectId={projectId} />
    </Secao>
  )
}

function Secao({ titulo, resumo, children }: { titulo: string; resumo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = React.useState(false)
  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger className="flex w-full items-start gap-3 rounded-md border border-border/60 bg-card/60 px-4 py-3 text-left hover:bg-card">
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{resumo}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">{aberto && children}</CollapsibleContent>
    </Collapsible>
  )
}
