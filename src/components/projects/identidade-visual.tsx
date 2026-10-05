'use client'

import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, ExternalLink, Loader2, PenLine, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAssinaturasDaMarca } from '@/hooks/use-aba-marca'
import { ProjectAssetsPanel } from '@/components/projects/project-assets-panel'

/**
 * "Identidade visual" — a segunda área da aba Marca: logo, cores, fontes e
 * elementos (o painel de sempre) e a PRÉVIA DAS ASSINATURAS (as variantes que
 * a usina usa), cada uma com atalho para o editor — é lá que a equipe ajusta
 * fonte, tamanho, cor e destaque de cada papel.
 */
export function IdentidadeVisual({ projectId }: { projectId: number }) {
  return (
    <div className="space-y-4">
      <AssinaturasDaMarca projectId={projectId} />
      <ProjectAssetsPanel projectId={projectId} />
    </div>
  )
}

function AssinaturasDaMarca({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, error, refetch } = useAssinaturasDaMarca(projectId)
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Assinaturas</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            As páginas que definem como a peça sai: uma por variante e formato. A usina escolhe pela mensagem; quem muda fonte, tamanho ou cor de um papel abre a página no editor.
          </p>
        </div>
        {data?.editorUrl && (
          <Button asChild variant="outline" size="sm">
            <Link href={data.editorUrl}><ExternalLink className="mr-2 h-4 w-4" /> Abrir no editor</Link>
          </Button>
        )}
      </div>
      {isError ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Não consegui ler as assinaturas: {(error as Error)?.message || 'erro ao consultar'}. Isto NÃO quer dizer que o cliente não tem página.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo</Button>
        </div>
      ) : isLoading || !data ? (
        <div className="mt-4 flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando assinaturas…</div>
      ) : data.variantes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Este cliente ainda não tem página de assinatura. Ela nasce no template &quot;Assinatura&quot;, uma página por formato, com camadas de texto chamadas pelo papel.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.variantes.map((v) => (
            <Link key={v.id} href={v.editorUrl ?? '#'} className="group block space-y-1.5">
              <div className={`relative overflow-hidden rounded-md border border-border/60 bg-muted ${v.formato === 'story' ? 'aspect-[9/16]' : v.formato === 'quadrado' ? 'aspect-square' : 'aspect-[4/5]'}`}>
                {v.miniatura ? (
                  <Image src={v.miniatura} alt={v.nome} fill sizes="200px" className="object-contain" unoptimized />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">sem miniatura ainda</div>
                )}
              </div>
              <div className="text-xs">
                <div className="truncate font-medium group-hover:underline">{v.nome}</div>
                <div className="flex flex-wrap gap-1 text-muted-foreground">
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">{v.formato}</Badge>
                  <span className="truncate">{v.papeis.join(' · ')}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
