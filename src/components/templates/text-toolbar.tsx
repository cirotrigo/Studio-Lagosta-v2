"use client"

import * as React from 'react'
import type { Layer } from '@/types/template'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
} from 'lucide-react'
import { FONT_CONFIG } from '@/lib/font-config'

/**
 * TextToolbar - Toolbar de propriedades de texto para Konva.js
 *
 * Funcionalidades:
 * - Seleção de fonte (font family)
 * - Tamanho da fonte
 * - Estilo (bold, italic, underline)
 * - Alinhamento (left, center, right, justify)
 * - Cor do texto
 * - Cor do contorno (stroke)
 * - Espessura do contorno
 * - Altura da linha (line height)
 * - Espaçamento entre letras (letter spacing)
 * - Opacidade
 *
 * @component
 */

interface TextToolbarProps {
  selectedLayer: Layer
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void
}

const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'PT Serif',
  'Source Sans Pro',
  'Ubuntu',
  'Work Sans',
  'Rubik',
]

export function TextToolbar({ selectedLayer, onUpdateLayer }: TextToolbarProps) {
  // Estado local para inputs controlados
  const [fontSize, setFontSize] = React.useState(selectedLayer.style?.fontSize ?? 16)
  const [letterSpacing, setLetterSpacing] = React.useState(selectedLayer.style?.letterSpacing ?? 0)
  const [lineHeight, setLineHeight] = React.useState(selectedLayer.style?.lineHeight ?? 1.2)
  const [strokeWidth, setStrokeWidth] = React.useState(selectedLayer.style?.border?.width ?? 0)

  // Sincronizar estado local quando layer mudar
  React.useEffect(() => {
    setFontSize(selectedLayer.style?.fontSize ?? 16)
    setLetterSpacing(selectedLayer.style?.letterSpacing ?? 0)
    setLineHeight(selectedLayer.style?.lineHeight ?? 1.2)
    setStrokeWidth(selectedLayer.style?.border?.width ?? 0)
  }, [selectedLayer.id, selectedLayer.style?.fontSize, selectedLayer.style?.letterSpacing, selectedLayer.style?.lineHeight, selectedLayer.style?.border?.width])

  const fontFamily = selectedLayer.style?.fontFamily ?? FONT_CONFIG.DEFAULT_FONT
  const fontStyle = selectedLayer.style?.fontStyle ?? 'normal'
  const fontWeight = selectedLayer.style?.fontWeight
  const textAlign = selectedLayer.style?.textAlign ?? 'left'
  const color = selectedLayer.style?.color ?? '#000000'
  const strokeColor = selectedLayer.style?.border?.color ?? '#000000'
  const opacity = selectedLayer.style?.opacity ?? 1

  // Verificar se está bold ou italic
  const isBold = fontWeight === 'bold' || fontWeight === 700 || fontWeight === '700'
  const isItalic = fontStyle === 'italic'

  const handleFontFamilyChange = (value: string) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, fontFamily: value },
    })
  }

  const handleFontSizeChange = (value: number) => {
    setFontSize(value)
  }

  const handleFontSizeCommit = (value: number) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, fontSize: value },
    })
  }

  const toggleBold = () => {
    const newStyle: 'normal' | 'italic' = isItalic ? 'italic' : 'normal'

    onUpdateLayer(selectedLayer.id, {
      style: {
        ...selectedLayer.style,
        fontStyle: newStyle,
        fontWeight: isBold ? 'normal' : 'bold',
      },
    })
  }

  const toggleItalic = () => {
    const newStyle: 'normal' | 'italic' = isItalic ? 'normal' : 'italic'

    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, fontStyle: newStyle },
    })
  }

  const handleAlignChange = (align: 'left' | 'center' | 'right') => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, textAlign: align },
    })
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, color: e.target.value },
    })
  }

  const handleStrokeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateLayer(selectedLayer.id, {
      style: {
        ...selectedLayer.style,
        border: {
          ...selectedLayer.style?.border,
          color: e.target.value,
          width: selectedLayer.style?.border?.width ?? 0,
          radius: selectedLayer.style?.border?.radius ?? 0,
        },
      },
    })
  }

  const handleStrokeWidthChange = (value: number) => {
    setStrokeWidth(value)
  }

  const handleStrokeWidthCommit = (value: number) => {
    onUpdateLayer(selectedLayer.id, {
      style: {
        ...selectedLayer.style,
        border: {
          ...selectedLayer.style?.border,
          width: value,
          color: selectedLayer.style?.border?.color ?? '#000000',
          radius: selectedLayer.style?.border?.radius ?? 0,
        },
      },
    })
  }

  const handleLineHeightChange = (value: number) => {
    setLineHeight(value)
  }

  const handleLineHeightCommit = (value: number) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, lineHeight: value },
    })
  }

  const handleLetterSpacingChange = (value: number) => {
    setLetterSpacing(value)
  }

  const handleLetterSpacingCommit = (value: number) => {
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, letterSpacing: value },
    })
  }

  const handleOpacityChange = (values: number[]) => {
    const value = values[0] ?? 1
    onUpdateLayer(selectedLayer.id, {
      style: { ...selectedLayer.style, opacity: value },
    })
  }

  return (
    <div className="flex-shrink-0 border-b border-border/40 bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        {/* Fonte e Tamanho */}
        <div className="flex items-center gap-2 pr-2 border-r border-border/40">
          <Select value={fontFamily} onValueChange={handleFontFamilyChange}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem key={font} value={font} className="text-xs">
                  <span style={{ fontFamily: font }}>{font}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Type className="h-3 w-3 text-muted-foreground" />
            <Input
              type="number"
              min={8}
              max={200}
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              onBlur={(e) => handleFontSizeCommit(Number(e.target.value))}
              className="h-8 w-16 text-xs"
            />
          </div>
        </div>

        {/* Estilo */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40">
          <Button
            variant={isBold ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleBold}
            title="Negrito"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant={isItalic ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleItalic}
            title="Itálico"
          >
            <Italic className="h-4 w-4" />
          </Button>
        </div>

        {/* Alinhamento */}
        <div className="flex items-center gap-1 pr-2 border-r border-border/40">
          <Button
            variant={textAlign === 'left' ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleAlignChange('left')}
            title="Alinhar à esquerda"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={textAlign === 'center' ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleAlignChange('center')}
            title="Centralizar"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant={textAlign === 'right' ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleAlignChange('right')}
            title="Alinhar à direita"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Cores */}
        <div className="flex items-center gap-2 pr-2 border-r border-border/40">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Cor:</Label>
            <Input
              type="color"
              value={color}
              onChange={handleColorChange}
              className="h-8 w-12 p-1 cursor-pointer"
              title="Cor do texto"
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Contorno:</Label>
            <Input
              type="color"
              value={strokeColor}
              onChange={handleStrokeColorChange}
              className="h-8 w-12 p-1 cursor-pointer"
              title="Cor do contorno"
            />
            <Input
              type="number"
              min={0}
              max={20}
              value={strokeWidth}
              onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
              onBlur={(e) => handleStrokeWidthCommit(Number(e.target.value))}
              className="h-8 w-14 text-xs"
              title="Espessura do contorno"
            />
          </div>
        </div>

        {/* Espaçamento */}
        <div className="flex items-center gap-2 pr-2 border-r border-border/40">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Altura:</Label>
            <Input
              type="number"
              min={0.5}
              max={3}
              step={0.1}
              value={lineHeight}
              onChange={(e) => handleLineHeightChange(Number(e.target.value))}
              onBlur={(e) => handleLineHeightCommit(Number(e.target.value))}
              className="h-8 w-16 text-xs"
              title="Altura da linha"
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Espaço:</Label>
            <Input
              type="number"
              min={-10}
              max={50}
              value={letterSpacing}
              onChange={(e) => handleLetterSpacingChange(Number(e.target.value))}
              onBlur={(e) => handleLetterSpacingCommit(Number(e.target.value))}
              className="h-8 w-16 text-xs"
              title="Espaçamento entre letras"
            />
          </div>
        </div>

        {/* Opacidade */}
        <div className="flex items-center gap-2">
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
