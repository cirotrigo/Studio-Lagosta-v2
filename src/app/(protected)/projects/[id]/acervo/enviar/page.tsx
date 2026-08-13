'use client'

/**
 * Mandar fotos do celular para o ACERVO do cliente (WP4).
 *
 * Mobile-first de propósito: quem usa isto está no restaurante, com o rolo da
 * câmera aberto. O input `accept="image/*" multiple` abre câmera/galeria no
 * iPhone; a prévia é em proporção REAL (object-contain, nunca cortada); o
 * envio é uma foto por vez, com estado por arquivo — falha de uma não derruba
 * a leva (contrato do serviço e do hook).
 *
 * A foto sobe INTOCADA para a pasta "Fotos do Celular" no Drive e só entra na
 * busca por tema depois da catalogação automática da madrugada — a tela diz
 * isso em voz alta para ninguém procurar a foto no seletor um minuto depois.
 */

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Camera, Loader2, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { usePageMetadata } from '@/contexts/page-metadata'
import { useAcervoUpload, type FotoEmEnvio } from '@/hooks/use-acervo-upload'
import { cn } from '@/lib/utils'

const CHIP: Record<FotoEmEnvio['situacao'], { rotulo: string; classe: string }> = {
  aguardando: { rotulo: 'Na fila', classe: 'bg-slate-500/15 text-slate-300' },
  enviando: { rotulo: 'Enviando…', classe: 'bg-primary/15 text-primary' },
  enviada: { rotulo: 'No acervo', classe: 'bg-emerald-500/15 text-emerald-400' },
  falha: { rotulo: 'Não foi', classe: 'bg-destructive/15 text-destructive' },
}

function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function EnviarParaAcervoPage() {
  const params = useParams()
  const projectId = Number(params?.id)
  const valido = Number.isFinite(projectId) && projectId > 0

  const inputRef = React.useRef<HTMLInputElement>(null)
  const {
    fotos,
    adicionar,
    remover,
    limpar,
    enviar,
    tentarDeNovo,
    enviando,
    aviso,
    avisoLocal,
  } = useAcervoUpload(projectId)

  // Mesmo arranjo da bancada: sem título/trilha duplicando o menu do projeto.
  const { setMetadata } = usePageMetadata()
  React.useEffect(() => {
    setMetadata({ showBreadcrumbs: false })
    return () => setMetadata({ showBreadcrumbs: true })
  }, [setMetadata])

  if (!valido) {
    return (
      <Card className="m-8 p-6 text-sm text-muted-foreground">
        Projeto inválido. Verifique a URL ou selecione o projeto novamente.
      </Card>
    )
  }

  const naFila = fotos.filter((f) => f.situacao === 'aguardando').length
  const enviadas = fotos.filter((f) => f.situacao === 'enviada').length
  const falhas = fotos.filter((f) => f.situacao === 'falha').length
  const terminou = fotos.length > 0 && naFila === 0 && !enviando
  const temFalhaHeic = fotos.some((f) => f.situacao === 'falha' && /HEIC/i.test(f.motivo ?? ''))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-2">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Mandar fotos para o acervo</h1>
        <p className="text-sm text-muted-foreground">
          As fotos vão para a pasta <span className="font-medium">“Fotos do Celular”</span> no
          Drive do cliente, do jeito que saíram da câmera. De madrugada elas são catalogadas e
          passam a aparecer na busca por tema.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) adicionar(e.target.files)
          // Permite escolher o mesmo arquivo de novo depois de remover.
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 active:border-primary/60 disabled:opacity-60"
      >
        <Camera className="h-6 w-6 text-muted-foreground" />
        <span className="font-medium">
          {fotos.length === 0 ? 'Toque para escolher as fotos' : 'Adicionar mais fotos'}
        </span>
        <span className="text-xs text-muted-foreground">JPEG, PNG ou WebP · até 25 MB cada · 20 por leva</span>
      </button>

      {avisoLocal && (
        <p className="text-xs text-amber-600 dark:text-amber-500">{avisoLocal}</p>
      )}

      {fotos.length > 0 && (
        <div className="space-y-3">
          {fotos.map((foto) => (
            <div
              key={foto.id}
              className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
            >
              {/* Proporção REAL: object-contain com teto de altura — a foto
                  nunca é cortada na prévia. <img> cru porque é object URL
                  local, fora do alcance do next/image. */}
              <img
                src={foto.previewUrl}
                alt={foto.nome}
                className="max-h-64 w-full bg-muted/30 object-contain"
                onError={(e) => {
                  // HEIC não renderiza fora do Safari — some a prévia, fica o card.
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{foto.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{tamanhoLegivel(foto.tamanhoBytes)}</p>
                </div>
                <span
                  className={cn(
                    'flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    CHIP[foto.situacao].classe,
                  )}
                >
                  {foto.situacao === 'enviando' && (
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  )}
                  {CHIP[foto.situacao].rotulo}
                </span>
                {foto.situacao === 'falha' && /conexão/i.test(foto.motivo ?? '') && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 flex-shrink-0"
                    onClick={() => tentarDeNovo(foto.id)}
                    title="Tentar de novo"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                {(foto.situacao === 'aguardando' || foto.situacao === 'falha') && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 flex-shrink-0"
                    onClick={() => remover(foto.id)}
                    title="Tirar da leva"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {foto.situacao === 'falha' && foto.motivo && (
                <p className="border-t border-border/40 px-3 py-2 text-[11px] text-destructive">
                  {foto.motivo}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {temFalhaHeic && (
        <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-500">
          <p className="font-medium">Foto em HEIC (formato do iPhone)</p>
          <p className="mt-1">
            Para as próximas: no iPhone, abra <span className="font-medium">Ajustes › Câmera ›
            Formatos</span> e escolha <span className="font-medium">Mais Compatível</span> — a
            câmera passa a salvar em JPEG. Para as fotos que já existem, re-exporte como JPEG
            (por exemplo, compartilhando por e-mail ou salvando uma cópia editada) e envie de
            novo.
          </p>
        </div>
      )}

      {fotos.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="h-11 flex-1"
            onClick={() => void enviar()}
            disabled={enviando || naFila === 0}
          >
            {enviando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {naFila > 0
                  ? `Enviar ${naFila} ${naFila === 1 ? 'foto' : 'fotos'}`
                  : 'Nada na fila'}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={limpar}
            disabled={enviando}
            title="Limpar a leva"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {terminou && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
          <p>
            {enviadas > 0 && (
              <span className="font-medium text-emerald-400">
                {enviadas} {enviadas === 1 ? 'foto no acervo' : 'fotos no acervo'}
              </span>
            )}
            {enviadas > 0 && falhas > 0 && ' · '}
            {falhas > 0 && (
              <span className="font-medium text-destructive">
                {falhas} {falhas === 1 ? 'não foi' : 'não foram'}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {aviso ??
              'As fotos entram na busca por tema depois da catalogação automática da madrugada.'}
          </p>
        </div>
      )}

      <p className="pb-4 text-center text-xs text-muted-foreground">
        <Link
          href={`/projects/${projectId}/bancada`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Voltar à bancada
        </Link>
      </p>
    </div>
  )
}
