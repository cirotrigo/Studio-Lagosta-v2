"use client"

import * as React from 'react'
import useImage from 'use-image'
import type { Layer } from '@/types/template'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FlipHorizontal2, FlipVertical2, Expand, Shapes, Ban, Crop, Unlink } from 'lucide-react'
import { MASCARAS_DE_IMAGEM } from '@/lib/assets/shapes-library'
import { MASCARA_QUADRADA, aplicarMascaraQuadrada, dimensoesDaFotoCarregada } from '@/lib/image-fit'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { avisarDesfecho } from '@/hooks/use-ajustar-grade'
import { metadadoDeGrade } from '@/lib/grades/conferir'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { MovimentoDaFoto } from './movimento-da-foto'

/**
 * ImageToolbar - Toolbar contextual de imagem (estilo Polotno)
 *
 * [Flip H] [Flip V] [Ajustar à página] | [Máscara ▾] | [Movimento ▾] | Opacidade
 * (Movimento só em foto de página-vídeo; a barra é a mesma no celular)
 * (o botão Recortar chega junto do crop in-canvas)
 */

interface ImageToolbarProps {
  selectedLayer: Layer
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void
}

/** Formas disponíveis como máscara: a lista explícita dos 26 legados (o path fica CONGELADO na camada) */
const MASK_SHAPES = MASCARAS_DE_IMAGEM

export function ImageToolbar({ selectedLayer, onUpdateLayer }: ImageToolbarProps) {
  const { design, setCroppingLayerId, desvincularGrade } = useTemplateEditor()
  // G3: célula de grade — a caixa e a forma são da grade (sem Quadrado 1:1, Ajustar à página nem máscara)
  const grade = metadadoDeGrade(selectedLayer)
  const opacity = selectedLayer.style?.opacity ?? 1
  const flipH = selectedLayer.style?.flipH === true
  const flipV = selectedLayer.style?.flipV === true
  const maskId = selectedLayer.style?.mask?.shapeId
  const hasManualCrop = Boolean(selectedLayer.style?.crop)
  const isRotated = Boolean(selectedLayer.rotation)
  // Dimensões naturais para refazer o recorte do Quadrado 1:1 (mesma leitura do recorte in-canvas)
  const fileUrl = selectedLayer.type === 'image' ? selectedLayer.fileUrl ?? '' : ''
  const [imagem] = useImage(fileUrl, fileUrl.startsWith('http') ? 'anonymous' : undefined)
  // Só a foto DESTA camada: o use-image pode entregar a anterior atrasada depois de trocar de seleção
  const natural = dimensoesDaFotoCarregada(imagem, fileUrl, typeof document === 'undefined' ? undefined : document.baseURI)

  // Uma atualização só: caixa, recorte e máscara voltam juntos no desfazer
  const handleMascaraQuadrada = () => {
    // `natural` já é o da foto DESTA camada (mesmo render do selectedLayer); sem ela, não aplica
    if (!natural) return
    const updates = aplicarMascaraQuadrada(selectedLayer, natural)
    if (updates) onUpdateLayer(selectedLayer.id, updates)
  }

  const patchStyle = (patch: Partial<NonNullable<Layer['style']>>) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, ...patch },
    })
  }

  const handleOpacityChange = (values: number[]) => {
    patchStyle({ opacity: values[0] ?? 1 })
  }

  const handleFitToPage = () => {
    // Ocupa a página inteira mantendo cover; crop manual é limpo (o
    // enquadramento anterior deixa de fazer sentido na caixa nova)
    onUpdateLayer(selectedLayer.id, {
      position: { x: 0, y: 0 },
      size: { width: design.canvas.width, height: design.canvas.height },
      style: { ...selectedLayer.style, objectFit: 'cover', crop: undefined },
    })
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-border/40 bg-card/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Recorte in-canvas */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
          <Button
            size="sm"
            variant={hasManualCrop ? 'default' : 'ghost'}
            className="h-8 gap-1.5 px-2"
            title={isRotated ? 'Zere a rotação para reenquadrar' : 'Reenquadrar a imagem sem mexer no layout (duplo clique também entra)'}
            disabled={isRotated}
            onClick={() => setCroppingLayerId(selectedLayer.id)}
          >
            <Crop className="h-4 w-4" />
            <span className="text-xs">Recortar</span>
          </Button>
          {hasManualCrop && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground"
              title="Voltar ao enquadramento automático"
              onClick={() => patchStyle({ crop: undefined })}
            >
              Remover
            </Button>
          )}
        </div>

        {/* Flip + fit */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
          <Button
            size="sm"
            variant={flipH ? 'default' : 'ghost'}
            className="h-8 w-8 p-0"
            title="Espelhar horizontalmente"
            onClick={() => patchStyle({ flipH: !flipH })}
          >
            <FlipHorizontal2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={flipV ? 'default' : 'ghost'}
            className="h-8 w-8 p-0"
            title="Espelhar verticalmente"
            onClick={() => patchStyle({ flipV: !flipV })}
          >
            <FlipVertical2 className="h-4 w-4" />
          </Button>
          {!grade && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Ajustar à página (cobre o canvas inteiro)"
              onClick={handleFitToPage}
            >
              <Expand className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Máscara de forma; na célula de grade, no lugar dela, o motivo e o "Desvincular da grade" */}
        {grade ? (
          <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
            <span
              data-motivo="celula-da-grade"
              className="whitespace-nowrap px-1 text-xs text-muted-foreground"
              title="Na grade, a foto não leva máscara, Quadrado 1:1 nem Ajustar à página: o tamanho e a forma são da grade. Desvincule para usar."
            >
              Célula da grade
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2"
              aria-label="Desvincular da grade"
              title="Desvincular: as fotos ficam soltas, com recorte e cantos"
              onClick={() => void desvincularGrade(grade.id).then(avisarDesfecho)}
            >
              <Unlink className="h-4 w-4" />
              <span className="text-xs">Desvincular</span>
            </Button>
          </div>
        ) : (
        <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={maskId ? 'default' : 'ghost'}
                className="h-8 gap-1.5 px-2"
                title="Máscara de forma"
              >
                <Shapes className="h-4 w-4" />
                <span className="text-xs">Máscara</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Recortar imagem na forma</p>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  title="Sem máscara"
                  onClick={() => patchStyle({ mask: undefined })}
                  className={`flex aspect-square items-center justify-center rounded border p-1.5 transition hover:border-primary ${!maskId ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                >
                  <Ban className="h-4 w-4 text-muted-foreground" />
                </button>
                {selectedLayer.type === 'image' && (
                  <button
                    type="button"
                    title="Quadrado 1:1"
                    aria-label="Quadrado 1:1"
                    aria-pressed={maskId === MASCARA_QUADRADA.shapeId}
                    disabled={!natural}
                    onClick={handleMascaraQuadrada}
                    className={`flex aspect-square items-center justify-center rounded border p-1.5 transition hover:border-primary disabled:opacity-50 ${maskId === MASCARA_QUADRADA.shapeId ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                  >
                    <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
                      <path d={MASCARA_QUADRADA.path} fill="currentColor" />
                    </svg>
                  </button>
                )}
                {MASK_SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    type="button"
                    title={shape.label}
                    onClick={() => patchStyle({ mask: { shapeId: shape.id, path: shape.pathData! } })}
                    className={`flex aspect-square items-center justify-center rounded border p-1.5 transition hover:border-primary ${maskId === shape.id ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                  >
                    <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
                      <path d={shape.pathData} fill="currentColor" fillRule={shape.pathFillRule ?? 'nonzero'} />
                    </svg>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        )}

        {/* Movimento (só foto, só em página-vídeo) */}
        {selectedLayer.type === 'image' && paginaEVideo(design.layers, design.audio) && (
          <div className="flex items-center gap-1 pr-2 border-r border-border/40 flex-shrink-0">
            <MovimentoDaFoto camada={selectedLayer} />
          </div>
        )}

        {/* Opacidade */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Opacidade:</Label>
          <Slider
            value={[opacity]}
            onValueChange={handleOpacityChange}
            min={0}
            max={1}
            step={0.1}
            className="w-24"
            title="Opacidade"
          />
          <span className="text-xs text-muted-foreground w-8">{Math.round(opacity * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
