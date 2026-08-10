'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePageConfig } from '@/hooks/use-page-config'
import { CreativesGallery } from '@/components/projects/creatives-gallery'

/**
 * Galeria de criativos em tela cheia (rota própria).
 *
 * Até 09/08/2026 esta rota carregava uma CÓPIA inline da galeria, que foi
 * ficando para trás da aba do projeto: sem melhorar com IA, sem antes/depois,
 * sem filtro por dia da semana, sem densidade de grid, sem "Gerar com IA",
 * sem auto-refresh enquanto a IA gera e sem paginação (parava em 100).
 * Pior, ela lia `generation.template` (minúsculo) enquanto a API devolve
 * `Template` — então TODO criativo caía no default 1080x1080 e story abria
 * achatado no lightbox, a busca por nome de template nunca casava e a lista
 * nunca mostrava as dimensões.
 *
 * Agora a rota é só o cabeçalho: o conteúdo é o MESMO componente da aba.
 * Recurso novo nasce nas duas telas de uma vez.
 */
export default function ProjectCreativesPage() {
  const params = useParams()
  const router = useRouter()

  const projectId = Number(params?.id)
  const isValidProject = Number.isFinite(projectId) && projectId > 0

  usePageConfig(
    'Galeria de Criativos',
    'Visualize, melhore e agende todos os criativos do projeto.',
    [
      { label: 'Dashboard', href: '/studio' },
      { label: 'Projetos', href: '/projects' },
      isValidProject ? { label: `Projeto ${projectId}`, href: `/projects/${projectId}` } : undefined,
      { label: 'Criativos' },
    ].filter(Boolean) as { label: string; href?: string }[],
  )

  if (!isValidProject) {
    return (
      <Card className="m-8 p-6 text-sm text-muted-foreground">
        Projeto inválido. Verifique a URL ou selecione o projeto novamente.
      </Card>
    )
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-8">
      {/* Sem <h1> próprio: o shell já imprime o título e a descrição do
          usePageConfig acima do breadcrumb — a página antiga repetia os dois. */}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => router.push(`/projects/${projectId}`)}>
          Voltar ao projeto
        </Button>
      </div>

      <CreativesGallery projectId={projectId} />
    </div>
  )
}
