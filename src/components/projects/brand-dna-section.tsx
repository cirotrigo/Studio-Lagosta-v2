'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  Dna,
  Download,
  Eye,
  Loader2,
  Save,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * DNA da Marca — o coração da aba Marca.
 *
 * Cinco seções de identidade que entram INCONDICIONALMENTE nos prompts de
 * geração. Difere da base de conhecimento, que é conteúdo pesquisado por
 * relevância (horários, cardápio, campanhas): DNA é COMO a marca fala e
 * aparece; a base é O QUE ela tem a dizer.
 */

interface BrandDNASections {
  toneOfVoice: string | null
  contentRules: string | null
  composition: string | null
  visualStyle: string | null
  photoDirection: string | null
}

interface BrandContextResponse {
  projectId: number
  projectName: string
  dna: BrandDNASections
  cuisineType: string | null
  fonts: { title: string | null; subtitle: string | null; body: string | null }
  colors: Array<{ name: string; hexCode: string }>
  logoUrl: string | null
  artDirection: string | null
}

interface PromptSection {
  id: string
  title: string
  origin: 'system' | 'editable' | 'runtime'
  content: string
  customized?: boolean
}

const MAX_CHARS = 10_000

const SECOES: Array<{
  key: keyof BrandDNASections
  label: string
  usadoEm: string
  placeholder: string
}> = [
  {
    key: 'toneOfVoice',
    label: 'Tom de voz',
    usadoEm: 'copies e chat',
    placeholder:
      'Como a marca fala. Ex: caloroso e direto, com orgulho gaúcho; trata o cliente por "tu"; evita gíria corporativa.',
  },
  {
    key: 'contentRules',
    label: 'Regras',
    usadoEm: 'copies, chat e artes',
    placeholder:
      'O que nunca fazer ou dizer. Ex: nunca prometer "o melhor da cidade"; não mencionar concorrentes; preço sempre com centavos.',
  },
  {
    key: 'composition',
    label: 'Composição / Layout',
    usadoEm: 'artes',
    placeholder:
      'Como os elementos se organizam. Ex: título no terço superior, logo sempre no rodapé, respiro generoso nas margens.',
  },
  {
    key: 'visualStyle',
    label: 'Estilo visual',
    usadoEm: 'artes',
    placeholder:
      'A estética geral. Ex: rústico e acolhedor, madeira e fogo de chão, tradição gaúcha sem clichê de estância.',
  },
  {
    key: 'photoDirection',
    label: 'Direção fotográfica',
    usadoEm: 'artes',
    placeholder:
      'Luz e tratamento. Ex: luz quente lateral, fundo desfocado, vapor e brasa em evidência, nada de flash estourado.',
  },
]

const ORIGIN_LABEL: Record<PromptSection['origin'], { label: string; className: string }> = {
  system: { label: 'Sistema', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  editable: { label: 'Editável', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  runtime: { label: 'Na hora', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
}

export function BrandDnaSection({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()

  const { data: brand, isLoading } = useQuery<BrandContextResponse>({
    queryKey: ['brand-dna', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/brand-dna`),
    staleTime: 60_000,
  })

  const [valores, setValores] = React.useState<Record<string, string>>({})
  const [carregado, setCarregado] = React.useState(false)

  React.useEffect(() => {
    if (!brand || carregado) return
    const inicial: Record<string, string> = {}
    for (const s of SECOES) inicial[s.key] = brand.dna[s.key] ?? ''
    setValores(inicial)
    setCarregado(true)
  }, [brand, carregado])

  const houveMudanca = React.useMemo(() => {
    if (!brand) return false
    return SECOES.some((s) => (valores[s.key] ?? '') !== (brand.dna[s.key] ?? ''))
  }, [valores, brand])

  const salvar = useMutation({
    mutationFn: async () => {
      const patch: Record<string, string | null> = {}
      for (const s of SECOES) {
        if ((valores[s.key] ?? '') !== (brand?.dna[s.key] ?? '')) {
          patch[s.key] = valores[s.key] || null
        }
      }
      return api.patch(`/api/projects/${projectId}/brand-dna`, patch)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-dna', projectId] })
      queryClient.invalidateQueries({ queryKey: ['prompt-preview', projectId] })
      setCarregado(false)
      toast.success('DNA da marca salvo — vale a partir da próxima geração.')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar o DNA'),
  })

  // Importação assistida do TOM_DE_VOZ da base de conhecimento: essas entradas
  // NÃO chegam ao gerador de copy da UI (nunca chegaram — a categoria ficou
  // fora do pipeline), então o lugar certo delas é aqui.
  const { data: tomEntries } = useQuery<{ entries: Array<{ id: string; title: string; content: string }> }>({
    queryKey: ['knowledge-tom-de-voz', projectId],
    queryFn: () => api.get(`/api/knowledge?projectId=${projectId}&category=TOM_DE_VOZ&status=ACTIVE&limit=20`),
    staleTime: 5 * 60_000,
  })
  const tomDaBase = tomEntries?.entries ?? []

  const importarTom = () => {
    const texto = tomDaBase.map((e) => e.content.trim()).join('\n\n')
    setValores((prev) => ({
      ...prev,
      toneOfVoice: prev.toneOfVoice ? `${prev.toneOfVoice}\n\n${texto}` : texto,
    }))
    toast.info(
      `${tomDaBase.length} entrada(s) importada(s). Revise, salve — e depois arquive-as na base para não duplicar.`,
    )
  }

  if (isLoading || !brand) {
    return (
      <Card className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando DNA da marca…
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Dna className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">DNA da Marca</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Identidade que entra em <strong>toda</strong> geração de copy e arte, sempre.
                Conteúdo pesquisável (horários, cardápio, campanhas) fica na{' '}
                <Link href="/knowledge" className="underline underline-offset-2">
                  base de conhecimento
                </Link>
                .
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/knowledge">
                <BookOpen className="mr-2 h-4 w-4" />
                Base de conhecimento
              </Link>
            </Button>
          </div>

          {tomDaBase.length > 0 && !brand.dna.toneOfVoice && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <span>
                Você tem <strong>{tomDaBase.length}</strong> entrada(s) de tom de voz na base de
                conhecimento — elas <strong>não chegam</strong> ao gerador de copy por lá. Importe
                para o DNA.
              </span>
              <Button size="sm" variant="outline" onClick={importarTom}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Importar
              </Button>
            </div>
          )}

          <div className="space-y-5">
            {SECOES.map((secao) => (
              <div key={secao.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`dna-${secao.key}`}>
                    {secao.label}{' '}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      · usado em {secao.usadoEm}
                    </span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {(valores[secao.key] ?? '').length.toLocaleString()}/{MAX_CHARS.toLocaleString()}
                  </span>
                </div>
                <Textarea
                  id={`dna-${secao.key}`}
                  value={valores[secao.key] ?? ''}
                  onChange={(e) =>
                    setValores((prev) => ({
                      ...prev,
                      [secao.key]: e.target.value.slice(0, MAX_CHARS),
                    }))
                  }
                  placeholder={secao.placeholder}
                  rows={3}
                  className="resize-y text-sm"
                  disabled={salvar.isPending}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={() => salvar.mutate()} disabled={!houveMudanca || salvar.isPending}>
              {salvar.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Salvar DNA
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      <PromptPreviewCard projectId={projectId} />
    </div>
  )
}

/**
 * Prévia do prompt de "Melhorar com IA", seção por seção, com a origem de cada
 * uma. É montada pela MESMA função e pelos MESMOS dados que a geração real —
 * o que aparece aqui é o que vai para o modelo.
 */
function PromptPreviewCard({ projectId }: { projectId: number }) {
  const [aberto, setAberto] = React.useState(false)

  const { data, isLoading } = useQuery<{ sections: PromptSection[]; runtimeNotes: string[] }>({
    queryKey: ['prompt-preview', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/prompt-preview`),
    enabled: aberto,
    staleTime: 30_000,
  })

  return (
    <Card className="p-6">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Prévia do prompt de melhoria</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Exatamente o que é enviado ao modelo de imagem, seção por seção, com a origem de cada
            uma — para você saber onde ajustar quando o resultado não agradar.
          </p>
        </div>
        <ChevronDown className={cn('h-5 w-5 shrink-0 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Montando o prompt real…
            </div>
          )}
          {data?.sections.map((s) => {
            const origem = ORIGIN_LABEL[s.origin]
            return (
              <div key={s.id} className="overflow-hidden rounded-lg border border-border/50">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">{s.title}</span>
                  <div className="flex items-center gap-2">
                    {s.customized && (
                      <Badge variant="outline" className="text-[10px]">
                        personalizado
                      </Badge>
                    )}
                    <Badge className={cn('text-[10px]', origem.className)} variant="secondary">
                      {origem.label}
                    </Badge>
                  </div>
                </div>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
                  {s.content}
                </pre>
              </div>
            )
          })}
          {data && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium">Entram só na hora de gerar:</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {data.runtimeNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
