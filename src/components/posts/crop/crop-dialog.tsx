'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Crop as CropIcon, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  POST_TYPE_DIMENSIONS,
  type CropPostType,
  type CropRegion,
} from '@/lib/images/client-resize'

/**
 * Escolha do enquadramento antes de a imagem virar mídia de post.
 *
 * A moldura é travada na proporção do formato (4:5 no feed, 9:16 no story):
 * arrastar reposiciona, as alças dos cantos aproximam/afastam, e o que fica de
 * fora aparece esmaecido — a pessoa vê o que está perdendo.
 *
 * O padrão é o CENTRO com a maior área possível: quem não quer escolher clica
 * em aplicar e segue, com o mesmo resultado do corte automático de antes — só
 * que agora tendo visto.
 *
 * PISO DE RESOLUÇÃO: o lado maior do recorte não pode ficar abaixo de 1080px,
 * senão o Instagram estica e a foto sai mole. O zoom trava nesse limite. Quando
 * a foto ORIGINAL já é menor que isso, travar não resolveria nada (não existe
 * enquadramento válido), então o aviso aparece e o botão continua liberado.
 */

const MIN_PIXELS = 1080
/** Diferença de proporção que ainda conta como "já está no formato" */
const RATIO_TOLERANCE = 0.01

export interface CropDialogProps {
  open: boolean
  /** URL da imagem (objectURL ou remota) */
  src: string
  /** Dimensões naturais da imagem original */
  naturalSize: { width: number; height: number }
  postType: CropPostType
  /** Rótulo da fila: "Imagem 2 de 5" */
  stepLabel?: string
  /** Oferece "usar centro no resto" quando ainda há imagens na fila */
  onSkipRemaining?: () => void
  /** Recorte em andamento no servidor — trava o botão e avisa */
  busy?: boolean
  onCancel: () => void
  onConfirm: (crop: CropRegion) => void
}

interface Frame {
  x: number
  y: number
  width: number
  height: number
}

/** A imagem já está na proporção do formato? Então não há o que enquadrar. */
export function matchesPostRatio(
  size: { width: number; height: number },
  postType: CropPostType,
): boolean {
  if (!size.width || !size.height) return false
  const target = POST_TYPE_DIMENSIONS[postType]
  const alvo = target.width / target.height
  const atual = size.width / size.height
  return Math.abs(atual - alvo) / alvo < RATIO_TOLERANCE
}

/** Maior retângulo na proporção do formato, centralizado na imagem */
export function centeredCrop(
  size: { width: number; height: number },
  postType: CropPostType,
): CropRegion {
  const target = POST_TYPE_DIMENSIONS[postType]
  const ratio = target.width / target.height
  let width = size.width
  let height = width / ratio
  if (height > size.height) {
    height = size.height
    width = height * ratio
  }
  return {
    left: Math.round((size.width - width) / 2),
    top: Math.round((size.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  }
}

type Handle = 'nw' | 'ne' | 'sw' | 'se'

export function CropDialog({
  open,
  src,
  naturalSize,
  postType,
  stepLabel,
  onSkipRemaining,
  busy = false,
  onCancel,
  onConfirm,
}: CropDialogProps) {
  const target = POST_TYPE_DIMENSIONS[postType]
  const ratio = target.width / target.height

  const areaRef = React.useRef<HTMLDivElement>(null)
  // Tamanho da imagem NA TELA (a moldura vive nesse espaço)
  const [display, setDisplay] = React.useState({ width: 0, height: 0 })
  const [frame, setFrame] = React.useState<Frame | null>(null)

  /** px da imagem original por px de tela */
  const escala = display.width > 0 ? naturalSize.width / display.width : 1

  // A foto inteira cabe no piso? Se não cabe, o piso vira só aviso.
  const ladoMaiorOriginal = Math.max(naturalSize.width, naturalSize.height)
  const pisoAplicavel = ladoMaiorOriginal >= MIN_PIXELS

  /** Menor moldura permitida, em px de tela */
  const minTela = React.useMemo(() => {
    if (!pisoAplicavel || escala <= 0) return { width: 24, height: 24 }
    const minReal =
      ratio >= 1
        ? { width: MIN_PIXELS, height: MIN_PIXELS / ratio }
        : { width: MIN_PIXELS * ratio, height: MIN_PIXELS }
    return { width: minReal.width / escala, height: minReal.height / escala }
  }, [pisoAplicavel, escala, ratio])

  const enquadrarCentro = React.useCallback(
    (largura: number, altura: number): Frame => {
      let width = largura
      let height = width / ratio
      if (height > altura) {
        height = altura
        width = height * ratio
      }
      return { x: (largura - width) / 2, y: (altura - height) / 2, width, height }
    },
    [ratio],
  )

  // Mede o espaço disponível e (re)centraliza a moldura. Roda no abrir, na
  // troca de imagem e quando a janela muda de tamanho.
  const medir = React.useCallback(() => {
    const area = areaRef.current
    if (!area || !naturalSize.width || !naturalSize.height) return
    const disponivelW = area.clientWidth
    const disponivelH = area.clientHeight
    if (disponivelW <= 0 || disponivelH <= 0) return

    const fator = Math.min(disponivelW / naturalSize.width, disponivelH / naturalSize.height)
    const width = naturalSize.width * fator
    const height = naturalSize.height * fator
    setDisplay({ width, height })
    setFrame(enquadrarCentro(width, height))
  }, [naturalSize.width, naturalSize.height, enquadrarCentro])

  React.useEffect(() => {
    if (!open) return
    // O conteúdo do Dialog entra com animação: medir no frame seguinte, senão
    // a área ainda tem tamanho zero
    const id = requestAnimationFrame(medir)
    window.addEventListener('resize', medir)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', medir)
    }
  }, [open, src, medir])

  // ---- Gestos (pointer events: mouse e toque no mesmo caminho) ----
  const gestoRef = React.useRef<
    | { tipo: 'mover'; offsetX: number; offsetY: number }
    | { tipo: 'redimensionar'; handle: Handle; ancora: { x: number; y: number } }
    | null
  >(null)

  const pontoNaImagem = (event: React.PointerEvent) => {
    const area = areaRef.current
    if (!area) return { x: 0, y: 0 }
    const caixa = area.getBoundingClientRect()
    // A imagem é centralizada dentro da área
    const origemX = caixa.left + (caixa.width - display.width) / 2
    const origemY = caixa.top + (caixa.height - display.height) / 2
    return { x: event.clientX - origemX, y: event.clientY - origemY }
  }

  /** Captura o ponteiro para o gesto sobreviver ao sair do elemento */
  const capturar = (event: React.PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Ponteiro já liberado (ou evento sintético): o gesto segue pelo
      // listener do contêiner, só não acompanha fora da janela
    }
  }

  const iniciarMover = (event: React.PointerEvent) => {
    if (!frame) return
    event.preventDefault()
    capturar(event)
    const p = pontoNaImagem(event)
    gestoRef.current = { tipo: 'mover', offsetX: p.x - frame.x, offsetY: p.y - frame.y }
  }

  const iniciarRedimensionar = (event: React.PointerEvent, handle: Handle) => {
    if (!frame) return
    event.preventDefault()
    event.stopPropagation()
    capturar(event)
    // A âncora é o canto OPOSTO — é ele que fica parado durante o gesto
    const ancora = {
      x: handle === 'nw' || handle === 'sw' ? frame.x + frame.width : frame.x,
      y: handle === 'nw' || handle === 'ne' ? frame.y + frame.height : frame.y,
    }
    gestoRef.current = { tipo: 'redimensionar', handle, ancora }
  }

  const aoMover = (event: React.PointerEvent) => {
    const gesto = gestoRef.current
    if (!gesto || !frame) return
    const p = pontoNaImagem(event)

    if (gesto.tipo === 'mover') {
      setFrame((atual) => {
        if (!atual) return atual
        return {
          ...atual,
          x: Math.max(0, Math.min(p.x - gesto.offsetX, display.width - atual.width)),
          y: Math.max(0, Math.min(p.y - gesto.offsetY, display.height - atual.height)),
        }
      })
      return
    }

    // Redimensionar: a proporção manda, o canto oposto fica parado
    const { handle, ancora } = gesto
    const paraEsquerda = handle === 'nw' || handle === 'sw'
    const paraCima = handle === 'nw' || handle === 'ne'

    const distX = Math.abs(p.x - ancora.x)
    const distY = Math.abs(p.y - ancora.y)
    // O eixo que o ponteiro puxou mais é quem manda; o outro acompanha
    let width = Math.max(distX, distY * ratio)

    // Não passar da imagem, a partir da âncora
    const espacoX = paraEsquerda ? ancora.x : display.width - ancora.x
    const espacoY = paraCima ? ancora.y : display.height - ancora.y
    width = Math.min(width, espacoX, espacoY * ratio)
    width = Math.max(width, minTela.width)
    // Piso e teto podem se cruzar em imagem pequena: o teto vence, senão a
    // moldura sai da foto
    width = Math.min(width, espacoX, espacoY * ratio)
    const height = width / ratio

    setFrame({
      x: paraEsquerda ? ancora.x - width : ancora.x,
      y: paraCima ? ancora.y - height : ancora.y,
      width,
      height,
    })
  }

  const encerrarGesto = () => {
    gestoRef.current = null
  }

  // ---- Números mostrados e resultado ----
  const pixels = frame
    ? { width: Math.round(frame.width * escala), height: Math.round(frame.height * escala) }
    : { width: 0, height: 0 }
  const ladoMaior = Math.max(pixels.width, pixels.height)
  const abaixoDoPiso = ladoMaior > 0 && ladoMaior < MIN_PIXELS

  const aplicar = () => {
    if (!frame || !display.width) return
    const left = Math.max(0, Math.round(frame.x * escala))
    const top = Math.max(0, Math.round(frame.y * escala))
    onConfirm({
      left,
      top,
      width: Math.min(Math.round(frame.width * escala), naturalSize.width - left),
      height: Math.min(Math.round(frame.height * escala), naturalSize.height - top),
    })
  }

  const proporcaoLabel = postType === 'STORY' || postType === 'REEL' ? '9:16' : '4:5'

  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && onCancel()}>
      {/*
        `sm:max-w-4xl`, não `max-w-4xl`: o DialogContent base declara
        `sm:max-w-lg`, e regra com media query vence regra sem — em qualquer
        tela ≥640px um `max-w-*` cru é ignorado e o modal sai com 512px.
      */}
      <DialogContent
        className="flex w-[95vw] flex-col gap-3 sm:max-w-4xl"
        /*
          Altura em style, não em classe: `h-[86dvh]` não gera CSS nesta build
          (o computed fica em `auto`) e, pior, o tailwind-merge DESCARTA o
          `max-h` do DialogContent base ao ver o meu — o modal ficava sem teto
          nenhum e crescia 2500px com foto em pé.
        */
        style={{ height: '86vh', maxHeight: '86vh' }}
      >
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex flex-wrap items-center gap-3 text-base">
            <span className="flex items-center gap-2">
              <CropIcon className="h-4 w-4 text-primary" />
              Enquadrar imagem
            </span>
            {stepLabel && (
              <span className="text-xs font-normal text-muted-foreground">{stepLabel}</span>
            )}
            <span
              className={cn(
                'ml-auto rounded-md border px-2 py-1 font-mono text-xs font-semibold',
                abaixoDoPiso
                  ? 'border-destructive/50 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {pixels.width} × {pixels.height} px
              {abaixoDoPiso && <span className="ml-1">— abaixo de {MIN_PIXELS}px</span>}
            </span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Arraste para escolher a parte da foto • Proporção {proporcaoLabel} (
            {target.width}×{target.height})
          </p>
        </DialogHeader>

        <div
          ref={areaRef}
          /*
            `min-h-0` é obrigatório: item de flex tem `min-height: auto`, então
            a área CRESCIA para caber a imagem — e como a medição usa a altura
            da área, cada medida gerava uma imagem maior que a anterior. Com
            foto em pé (story 9:16) a moldura saía pela borda do modal.
          */
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40"
          onPointerMove={aoMover}
          onPointerUp={encerrarGesto}
          onPointerCancel={encerrarGesto}
        >
          <div
            className="relative select-none"
            style={{ width: display.width || undefined, height: display.height || undefined }}
          >
            {/* `img` cru de propósito: a fonte é um objectURL local e o
                next/image não otimiza blob: */}
            <img
              src={src}
              alt=""
              onLoad={medir}
              draggable={false}
              className="h-full w-full select-none object-contain"
            />

            {frame && display.width > 0 && (
              <>
                {/* Fora da moldura: escurecido, sem capturar o ponteiro */}
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute bg-black/55"
                    style={{ left: 0, top: 0, width: '100%', height: frame.y }}
                  />
                  <div
                    className="absolute bg-black/55"
                    style={{
                      left: 0,
                      top: frame.y + frame.height,
                      width: '100%',
                      height: Math.max(0, display.height - frame.y - frame.height),
                    }}
                  />
                  <div
                    className="absolute bg-black/55"
                    style={{ left: 0, top: frame.y, width: frame.x, height: frame.height }}
                  />
                  <div
                    className="absolute bg-black/55"
                    style={{
                      left: frame.x + frame.width,
                      top: frame.y,
                      width: Math.max(0, display.width - frame.x - frame.width),
                      height: frame.height,
                    }}
                  />
                </div>

                {/* Moldura */}
                <div
                  className="absolute cursor-move touch-none border-2 border-primary"
                  style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
                  onPointerDown={iniciarMover}
                >
                  {/* Terços, para ajudar a compor. Posição em style pelo mesmo
                      motivo das alças: `left-1/3` também não gera CSS aqui. */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute h-full w-px bg-white/30" style={{ left: '33.333%' }} />
                    <div className="absolute h-full w-px bg-white/30" style={{ left: '66.666%' }} />
                    <div className="absolute h-px w-full bg-white/30" style={{ top: '33.333%' }} />
                    <div className="absolute h-px w-full bg-white/30" style={{ top: '66.666%' }} />
                  </div>

                  {/*
                    Deslocamento em style, não em classe: `-left-2.5` e companhia
                    não geram CSS nesta build do Tailwind (a classe aparece no
                    atributo e o computed style fica em 0), e as quatro alças
                    ficavam empilhadas no canto superior esquerdo.
                  */}
                  {(['nw', 'ne', 'sw', 'se'] as Handle[]).map((handle) => (
                    <div
                      key={handle}
                      onPointerDown={(event) => iniciarRedimensionar(event, handle)}
                      style={{
                        left: handle === 'nw' || handle === 'sw' ? -10 : undefined,
                        right: handle === 'ne' || handle === 'se' ? -10 : undefined,
                        top: handle === 'nw' || handle === 'ne' ? -10 : undefined,
                        bottom: handle === 'sw' || handle === 'se' ? -10 : undefined,
                        cursor: `${handle}-resize`,
                      }}
                      className="absolute h-5 w-5 touch-none rounded-sm border-2 border-white bg-primary shadow"
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {abaixoDoPiso && (
          <p className="text-xs text-destructive">
            {pisoAplicavel
              ? `Esse recorte tem menos de ${MIN_PIXELS}px no lado maior — afaste um pouco para a foto não sair mole.`
              : `A foto original tem menos de ${MIN_PIXELS}px no lado maior: o Instagram vai esticá-la. Dá para publicar assim mesmo.`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFrame(enquadrarCentro(display.width, display.height))}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Centralizar
          </Button>
          {onSkipRemaining && (
            <Button variant="ghost" size="sm" onClick={onSkipRemaining}>
              Usar o centro nas demais
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={!frame || busy}>
              {busy ? 'Enquadrando…' : 'Aplicar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
