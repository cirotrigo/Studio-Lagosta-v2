'use client'

/**
 * Seletor de imagens de referência da geração de arte por IA, com PAPÉIS.
 *
 * O papel é a informação que faz a diferença de qualidade: o backend monta o
 * preâmbulo do prompt a partir dele ("Image 2 is a REAL photograph of the
 * restaurant environment… it is a real existing place"). Escolher a foto sem
 * dizer o papel dela é o que faz o modelo inventar cenário.
 *
 * Os tetos (1 prato + 3 âncoras + 2 estilo) não são decoração: várias
 * referências competindo causam deriva visual — a regra veio das skills que
 * produzem as melhores artes hoje.
 */

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Search, Upload, X, Check, ImageIcon, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export type PapelReferencia = 'subject' | 'anchor-ambient' | 'anchor-dish' | 'style'

export interface ReferenciaSelecionada {
  /** Chave estável na lista: driveFileId ou a URL do upload. */
  key: string
  papel: PapelReferencia
  driveFileId?: string
  url?: string
  label?: string
  /** Miniatura para exibir (proxy do Drive ou a própria URL). */
  thumbUrl: string
}

interface PapelInfo {
  valor: PapelReferencia
  titulo: string
  ajuda: string
  max: number
}

export const PAPEIS: PapelInfo[] = [
  {
    valor: 'subject',
    titulo: 'Prato / produto',
    ajuda: 'A foto que É a cena da arte. Não é recriada nem "melhorada" — o dono precisa reconhecer o próprio prato.',
    max: 1,
  },
  {
    valor: 'anchor-ambient',
    titulo: 'Ambiente',
    ajuda: 'Foto real do salão. A cena gerada acontece NESTE lugar — sem ela o modelo inventa um ambiente genérico.',
    max: 3,
  },
  {
    valor: 'anchor-dish',
    titulo: '2º ângulo do prato',
    ajuda: 'Outra foto do mesmo prato, para o modelo ser fiel à aparência real dele.',
    max: 3,
  },
  {
    valor: 'style',
    titulo: 'Estilo',
    ajuda: 'Arte aprovada como referência de tom e luminosidade — o estilo vem daqui, não do tema do post.',
    max: 2,
  },
]

const MAX_ANCORAS = 3
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

interface ImagemAcervo {
  driveFileId: string
  fileName: string
  folder: string
  menuItem: string | null
  tags: string[]
  bestFor: string[]
  quality: string | null
  ultimoUso: string
}

interface RespostaAcervo {
  temCatalogo: boolean
  total: number
  acervoCompleto: number
  pastasDisponiveis: string[]
  images: ImagemAcervo[]
  aviso?: string
}

export function contarPorPapel(refs: ReferenciaSelecionada[], papel: PapelReferencia) {
  return refs.filter((r) => r.papel === papel).length
}

/** Motivo pelo qual o papel não cabe, ou null quando cabe. */
export function bloqueioDoPapel(
  refs: ReferenciaSelecionada[],
  papel: PapelReferencia,
  ignorarKey?: string,
): string | null {
  const outras = refs.filter((r) => r.key !== ignorarKey)
  const info = PAPEIS.find((p) => p.valor === papel)!
  if (outras.filter((r) => r.papel === papel).length >= info.max) {
    return `Só ${info.max} ${info.titulo.toLowerCase()}${info.max > 1 ? ' por geração' : ''}.`
  }
  if (papel === 'anchor-ambient' || papel === 'anchor-dish') {
    const ancoras = outras.filter(
      (r) => r.papel === 'anchor-ambient' || r.papel === 'anchor-dish',
    ).length
    if (ancoras >= MAX_ANCORAS) {
      return `Máximo de ${MAX_ANCORAS} fotos-âncora — mais que isso faz o visual derivar.`
    }
  }
  return null
}

interface Props {
  projectId: number
  referencias: ReferenciaSelecionada[]
  onChange: (refs: ReferenciaSelecionada[]) => void
  /** Papel sugerido para a próxima imagem escolhida. */
  papelPadrao?: PapelReferencia
}

export function ArteIaImagePicker({
  projectId,
  referencias,
  onChange,
  papelPadrao = 'subject',
}: Props) {
  const { toast } = useToast()
  const [busca, setBusca] = React.useState('')
  const [temaAtivo, setTemaAtivo] = React.useState('')
  const [pasta, setPasta] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const { data: acervo, isLoading } = useQuery<RespostaAcervo>({
    queryKey: ['projeto', projectId, 'acervo', temaAtivo, pasta],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (temaAtivo) qs.set('tema', temaAtivo)
      if (pasta) qs.set('pasta', pasta)
      qs.set('limite', '40')
      return api.get<RespostaAcervo>(`/api/projects/${projectId}/acervo?${qs.toString()}`)
    },
    staleTime: 2 * 60_000,
  })

  const { upload, isUploading, progress } = useBlobUpload({
    onError: (err) =>
      toast({ title: 'Falha no upload', description: err.message, variant: 'destructive' }),
  })

  /** Escolhe o papel que ainda cabe, começando pelo sugerido. */
  const papelDisponivel = React.useCallback(
    (refs: ReferenciaSelecionada[]): PapelReferencia | null => {
      const ordem: PapelReferencia[] = [
        papelPadrao,
        ...PAPEIS.map((p) => p.valor).filter((v) => v !== papelPadrao),
      ]
      return ordem.find((p) => !bloqueioDoPapel(refs, p)) ?? null
    },
    [papelPadrao],
  )

  const adicionar = (nova: Omit<ReferenciaSelecionada, 'papel'>) => {
    if (referencias.some((r) => r.key === nova.key)) {
      onChange(referencias.filter((r) => r.key !== nova.key))
      return
    }
    const papel = papelDisponivel(referencias)
    if (!papel) {
      toast({
        title: 'Limite de referências atingido',
        description: 'Remova uma imagem antes de adicionar outra — poucas referências boas rendem mais.',
      })
      return
    }
    onChange([...referencias, { ...nova, papel }])
  }

  const trocarPapel = (key: string, papel: PapelReferencia) => {
    const bloqueio = bloqueioDoPapel(referencias, papel, key)
    if (bloqueio) {
      toast({ title: 'Não dá para usar esse papel', description: bloqueio })
      return
    }
    onChange(referencias.map((r) => (r.key === key ? { ...r, papel } : r)))
  }

  const remover = (key: string) => onChange(referencias.filter((r) => r.key !== key))

  const enviarArquivo = async (file: File) => {
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({
        title: 'Formato não suportado',
        description: 'Envie JPG, PNG ou WebP.',
        variant: 'destructive',
      })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: 'Imagem muito grande', description: 'O máximo é 10 MB.', variant: 'destructive' })
      return
    }
    try {
      const url = await upload(file)
      adicionar({ key: url, url, thumbUrl: url, label: file.name })
    } catch {
      // erro tratado no onError
    }
  }

  return (
    <div className="space-y-3">
      {referencias.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Referências escolhidas ({referencias.length})
            </Label>
          </div>
          <div className="space-y-2">
            {referencias.map((ref) => (
              <div key={ref.key} className="flex items-center gap-3">
                <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-background">
                  <Image
                    src={ref.thumbUrl}
                    alt={ref.label ?? 'Referência'}
                    fill
                    sizes="56px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs text-muted-foreground">{ref.label ?? 'Imagem'}</p>
                  <div className="flex flex-wrap gap-1">
                    {PAPEIS.map((p) => {
                      const ativo = ref.papel === p.valor
                      const bloqueado = !ativo && !!bloqueioDoPapel(referencias, p.valor, ref.key)
                      return (
                        <button
                          key={p.valor}
                          type="button"
                          title={bloqueado ? bloqueioDoPapel(referencias, p.valor, ref.key)! : p.ajuda}
                          disabled={bloqueado}
                          onClick={() => trocarPapel(ref.key, p.valor)}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                            ativo
                              ? 'border-primary bg-primary text-primary-foreground'
                              : bloqueado
                                ? 'cursor-not-allowed border-border/40 text-muted-foreground/50'
                                : 'border-border/60 hover:border-primary/60',
                          )}
                        >
                          {p.titulo}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => remover(ref.key)}
                  title="Remover"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
            {PAPEIS.find((p) => p.valor === referencias[referencias.length - 1]?.papel)?.ajuda}
          </p>
        </div>
      )}

      <Tabs defaultValue="acervo">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="acervo">Acervo do cliente</TabsTrigger>
          <TabsTrigger value="upload">Enviar imagem</TabsTrigger>
        </TabsList>

        <TabsContent value="acervo" className="space-y-2 pt-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setTemaAtivo(busca.trim())
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por tema: happy hour, picanha, sobremesa…"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>

          {acervo && acervo.pastasDisponiveis.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setPasta('')}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  pasta === '' ? 'border-primary bg-primary/10' : 'border-border/60',
                )}
              >
                Todas
              </button>
              {acervo.pastasDisponiveis.slice(0, 12).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPasta(p === pasta ? '' : p)}
                  title={p}
                  className={cn(
                    'max-w-[160px] truncate rounded-full border px-2 py-0.5 text-[11px]',
                    pasta === p ? 'border-primary bg-primary/10' : 'border-border/60',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {acervo?.aviso && (
            <p className="text-[11px] italic text-amber-600 dark:text-amber-500">{acervo.aviso}</p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : !acervo || acervo.images.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/60 py-8 text-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma foto encontrada.</p>
              {temaAtivo && (
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => {
                    setBusca('')
                    setTemaAtivo('')
                  }}
                >
                  Limpar a busca
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
                {acervo.images.map((img) => {
                  const selecionada = referencias.some((r) => r.key === img.driveFileId)
                  return (
                    <button
                      key={img.driveFileId}
                      type="button"
                      title={`${img.fileName}${img.folder ? ` · ${img.folder}` : ''}${
                        img.ultimoUso === 'nunca' ? ' · nunca usada' : ` · usada em ${img.ultimoUso}`
                      }`}
                      onClick={() =>
                        adicionar({
                          key: img.driveFileId,
                          driveFileId: img.driveFileId,
                          thumbUrl: `/api/drive/thumbnail/${img.driveFileId}`,
                          label: img.menuItem ?? img.fileName,
                        })
                      }
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-md border-2 bg-muted/30 transition-all hover:border-primary/60',
                        selecionada ? 'border-primary ring-2 ring-primary/30' : 'border-border/40',
                      )}
                    >
                      <Image
                        src={`/api/drive/thumbnail/${img.driveFileId}`}
                        alt={img.fileName}
                        fill
                        sizes="100px"
                        className="object-cover"
                        unoptimized
                      />
                      {selecionada && (
                        <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {acervo.total} de {acervo.acervoCompleto} fotos · as menos usadas aparecem primeiro
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="upload" className="pt-3">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_MIME.join(',')}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void enviarArquivo(file)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border/60 bg-muted/20 px-4 py-8 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">
              {isUploading ? `Enviando ${progress?.percentage ?? 0}%` : 'Clique para enviar uma foto'}
            </span>
            <span className="text-xs text-muted-foreground">JPG, PNG ou WebP até 10 MB</span>
          </button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
