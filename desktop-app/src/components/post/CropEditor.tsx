import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Crop, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PostType, POST_TYPE_DIMENSIONS } from '@/lib/constants'

interface CropEditorProps {
  imageUrl: string
  originalWidth?: number
  originalHeight?: number
  postType: PostType
  onConfirm: (cropRegion: { left: number; top: number; width: number; height: number }) => void
  onCancel: () => void
  isOpen: boolean
}

export default function CropEditor({ imageUrl, originalWidth, originalHeight, postType, onConfirm, onCancel, isOpen }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Crop dimensions state (for resizing)
  const [cropSize, setCropSize] = useState({ width: 0, height: 0 })
  
  // Target dimensions based on post type
  const targetDims = POST_TYPE_DIMENSIONS[postType]
  const aspectRatio = targetDims.width / targetDims.height

  // Minimum pixels for the larger side
  const MIN_PIXELS = 1080

  // Calculate the minimum crop display size based on MIN_PIXELS constraint
  const getMinCropDisplaySize = useCallback(() => {
    if (!imageSize.width || !displaySize.width) return { width: 100, height: 100 }
    const scale = displaySize.width / imageSize.width
    // The larger side of the crop in real pixels must be >= MIN_PIXELS
    // For 4:5 (portrait): height is larger → minHeight = MIN_PIXELS → minWidth = MIN_PIXELS * aspectRatio
    // For 9:16 (portrait): height is larger → same logic
    // aspectRatio = width/height, so height is larger when aspectRatio < 1
    const minRealWidth = aspectRatio >= 1 ? MIN_PIXELS : MIN_PIXELS * aspectRatio
    const minRealHeight = aspectRatio < 1 ? MIN_PIXELS : MIN_PIXELS / aspectRatio
    return {
      width: Math.max(50, minRealWidth * scale),
      height: Math.max(50, minRealHeight * scale),
    }
  }, [imageSize, displaySize, aspectRatio])

  // Calculate crop dimensions in original image pixels
  const getCropDimensions = useCallback(() => {
    const scale = imageSize.width / displaySize.width
    
    // Calculate raw values
    let left = Math.round(cropOffset.x * scale)
    let top = Math.round(cropOffset.y * scale)
    let width = Math.round(cropSize.width * scale)
    let height = Math.round(cropSize.height * scale)
    
    // Constrain to image bounds
    left = Math.max(0, Math.min(left, imageSize.width - 1))
    top = Math.max(0, Math.min(top, imageSize.height - 1))
    width = Math.min(width, imageSize.width - left)
    height = Math.min(height, imageSize.height - top)
    
    // Ensure minimum size
    width = Math.max(100, width)
    height = Math.max(100, height)
    
    return { left, top, width, height }
  }, [imageSize, displaySize, cropOffset, cropSize])

  // Real pixel dimensions shown in the counter
  const realCropPixels = useCallback(() => {
    if (!imageSize.width || !displaySize.width) return { width: 0, height: 0 }
    const scale = imageSize.width / displaySize.width
    return {
      width: Math.round(cropSize.width * scale),
      height: Math.round(cropSize.height * scale),
    }
  }, [imageSize, displaySize, cropSize])

  const currentPixels = realCropPixels()
  const largerSide = Math.max(currentPixels.width, currentPixels.height)
  const isBelowMinPixels = largerSide > 0 && largerSide < MIN_PIXELS

  // Initialize when image loads
  const handleImageLoad = () => {
    const img = imageRef.current
    const container = containerRef.current
    if (!img || !container || isInitialized) {
      console.log('[CropEditor] handleImageLoad skipped:', { 
        hasImg: !!img, 
        hasContainer: !!container, 
        isInitialized 
      })
      return
    }

    // Use provided original dimensions if available, otherwise use loaded image dimensions
    const naturalWidth = originalWidth || img.naturalWidth
    const naturalHeight = originalHeight || img.naturalHeight
    
    console.log('[CropEditor] Image loaded:', { 
      naturalWidth, 
      naturalHeight,
      imgNaturalWidth: img.naturalWidth,
      imgNaturalHeight: img.naturalHeight,
      originalWidth,
      originalHeight,
      aspectRatio 
    })
    
    setImageSize({ width: naturalWidth, height: naturalHeight })

    // Calculate display size to fit container while maintaining aspect ratio
    const containerWidth = container.clientWidth - 32 // padding
    const containerHeight = container.clientHeight - 32 // padding
    
    const scale = Math.min(
      containerWidth / naturalWidth,
      containerHeight / naturalHeight,
      1 // Don't upscale beyond original size
    )
    
    const displayW = naturalWidth * scale
    const displayH = naturalHeight * scale
    setDisplaySize({ width: displayW, height: displayH })

    // Calculate image position (centered in container)
    const imgPosX = (container.clientWidth - displayW) / 2
    const imgPosY = (container.clientHeight - displayH) / 2
    setImagePosition({ x: imgPosX, y: imgPosY })

    // Center the crop initially (relative to image)
    // Ensure crop fits within the image dimensions
    let cropHeight = displayH
    let cropWidth = cropHeight * aspectRatio
    
    // If crop is wider than image, scale down to fit
    if (cropWidth > displayW) {
      cropWidth = displayW
      cropHeight = cropWidth / aspectRatio
    }
    
    const finalCropOffsetX = (displayW - cropWidth) / 2
    const finalCropOffsetY = (displayH - cropHeight) / 2
    
    setCropOffset({
      x: finalCropOffsetX,
      y: finalCropOffsetY
    })
    setCropSize({ width: cropWidth, height: cropHeight })
    setIsInitialized(true)
    
    console.log('[CropEditor] Initialization complete:', {
      displaySize: { width: displayW, height: displayH },
      cropSize: { width: cropWidth, height: cropHeight },
      cropOffset: { x: finalCropOffsetX, y: finalCropOffsetY },
      scale: naturalWidth / displayW,
      wasAdjusted: cropWidth !== displayH * aspectRatio
    })
  }

  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y })
  }, [cropOffset])

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeHandle(handle)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle dragging
    if (isDragging) {
      let newX = e.clientX - dragStart.x
      let newY = e.clientY - dragStart.y
      
      // Constrain to image bounds
      newX = Math.max(0, Math.min(newX, displaySize.width - cropSize.width))
      newY = Math.max(0, Math.min(newY, displaySize.height - cropSize.height))
      
      setCropOffset({ x: newX, y: newY })
      return
    }
    
    // Handle resizing
    if (isResizing && resizeHandle) {
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y
      
      let newWidth = cropSize.width
      let newHeight = cropSize.height
      let newX = cropOffset.x
      let newY = cropOffset.y
      
      // Calculate new size maintaining aspect ratio
      const sizeDelta = Math.max(deltaX, deltaY * aspectRatio)
      
      switch (resizeHandle) {
        case 'se': // Southeast - expand down and right
          newWidth = Math.min(
            Math.max(100, cropSize.width + sizeDelta),
            displaySize.width - cropOffset.x,
            displaySize.height * aspectRatio
          )
          newHeight = newWidth / aspectRatio
          break
        case 'sw': // Southwest - expand down and left
          newWidth = Math.min(
            Math.max(100, cropSize.width + sizeDelta),
            cropOffset.x + cropSize.width,
            displaySize.height * aspectRatio
          )
          newHeight = newWidth / aspectRatio
          newX = cropOffset.x + cropSize.width - newWidth
          break
        case 'ne': // Northeast - expand up and right
          newHeight = Math.min(
            Math.max(100 / aspectRatio, cropSize.height - deltaY),
            cropOffset.y + cropSize.height,
            displaySize.width / aspectRatio
          )
          newWidth = newHeight * aspectRatio
          newY = cropOffset.y + cropSize.height - newHeight
          break
        case 'nw': // Northwest - expand up and left
          newHeight = Math.min(
            Math.max(100 / aspectRatio, cropSize.height - deltaY),
            cropOffset.y + cropSize.height,
            cropOffset.x + cropSize.width / aspectRatio
          )
          newWidth = newHeight * aspectRatio
          newX = cropOffset.x + cropSize.width - newWidth
          newY = cropOffset.y + cropSize.height - newHeight
          break
      }
      
      // Enforce minimum pixel size: the larger side must be >= MIN_PIXELS in real pixels
      const minDisplay = getMinCropDisplaySize()
      if (newWidth >= minDisplay.width && newHeight >= minDisplay.height) {
        setCropSize({ width: newWidth, height: newHeight })
        setCropOffset({ x: newX, y: newY })
        setDragStart({ x: e.clientX, y: e.clientY })
      }
    }
  }, [isDragging, isResizing, resizeHandle, dragStart, displaySize, cropSize, cropOffset, aspectRatio, getMinCropDisplaySize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
    setResizeHandle(null)
  }, [])

  // Touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    setIsDragging(true)
    setDragStart({ x: touch.clientX - cropOffset.x, y: touch.clientY - cropOffset.y })
  }, [cropOffset])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const touch = e.touches[0]
    
    const cropWidth = displaySize.height * aspectRatio
    const cropHeight = displaySize.height
    
    let newX = touch.clientX - dragStart.x
    let newY = touch.clientY - dragStart.y
    
    newX = Math.max(0, Math.min(newX, displaySize.width - cropWidth))
    newY = Math.max(0, Math.min(newY, displaySize.height - cropHeight))
    
    setCropOffset({ x: newX, y: newY })
  }, [isDragging, dragStart, displaySize, aspectRatio])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleConfirm = () => {
    // Ensure we have valid sizes before calculating
    if (!imageSize.width || !displaySize.width || !isInitialized) {
      console.error('[CropEditor] Invalid state:', { imageSize, displaySize, isInitialized })
      toast.error('Erro: Imagem não carregada completamente')
      return
    }
    
    const scale = imageSize.width / displaySize.width
    const cropDimensions = getCropDimensions()
    
    console.log('[CropEditor] Applying crop:', {
      display: { 
        offset: cropOffset, 
        size: cropSize,
        displaySize 
      },
      original: cropDimensions,
      imageSize,
      scale,
      calculation: {
        left: `${cropOffset.x} * ${scale} = ${cropDimensions.left}`,
        top: `${cropOffset.y} * ${scale} = ${cropDimensions.top}`,
        width: `${cropSize.width} * ${scale} = ${cropDimensions.width}`,
        height: `${cropSize.height} * ${scale} = ${cropDimensions.height}`
      }
    })
    onConfirm(cropDimensions)
  }

  const handleReset = () => {
    let cropHeight = displaySize.height
    let cropWidth = cropHeight * aspectRatio
    
    // If crop is wider than image, scale down to fit
    if (cropWidth > displaySize.width) {
      cropWidth = displaySize.width
      cropHeight = cropWidth / aspectRatio
    }
    
    setCropOffset({
      x: (displaySize.width - cropWidth) / 2,
      y: (displaySize.height - cropHeight) / 2
    })
    setCropSize({ width: cropWidth, height: cropHeight })
  }

  // Reset when modal opens/closes or imageUrl changes
  useEffect(() => {
    if (isOpen) {
      console.log('[CropEditor] Opening crop for image:', imageUrl.substring(0, 50))
      // Reset all state for new image
      setIsInitialized(false)
      setIsDragging(false)
      setIsResizing(false)
      setResizeHandle(null)
      setImageSize({ width: 0, height: 0 })
      setDisplaySize({ width: 0, height: 0 })
      setImagePosition({ x: 0, y: 0 })
      setCropOffset({ x: 0, y: 0 })
      setCropSize({ width: 0, height: 0 })
    }
  }, [isOpen, imageUrl])

  if (!isOpen) return null

  const cropWidth = cropSize.width || displaySize.height * aspectRatio
  const cropHeight = cropSize.height || displaySize.height

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Crop size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text">Ajustar Crop</h3>
              <p className="text-sm text-text-muted">
                Arraste para posicionar • Proporção: {postType === 'STORY' || postType === 'REEL' ? '9:16' : '4:5'}
              </p>
            </div>
            {/* Pixel counter */}
            {isInitialized && currentPixels.width > 0 && (
              <div className={cn(
                'ml-4 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-mono font-semibold border',
                isBelowMinPixels
                  ? 'border-red-500/50 bg-red-500/10 text-red-400'
                  : 'border-border bg-input text-text-muted'
              )}>
                <span>{currentPixels.width}</span>
                <span className="opacity-50">×</span>
                <span>{currentPixels.height}</span>
                <span className="ml-1 opacity-70">px</span>
                {isBelowMinPixels && (
                  <span className="ml-1 text-red-400">— mínimo {MIN_PIXELS}px</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        {/* Image Container */}
        <div className="flex-1 overflow-auto p-4">
          <div 
            ref={containerRef}
            className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-lg bg-input"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Image wrapper for positioning */}
            <div
              className="relative"
              style={{
                width: displaySize.width || 'auto',
                height: displaySize.height || 'auto',
              }}
            >
              {/* Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                onLoad={handleImageLoad}
                className="w-full h-full object-contain select-none"
                draggable={false}
              />
              
              {/* Crop Overlay - positioned relative to image wrapper */}
              {isInitialized && displaySize.width > 0 && (
                <>
                  {/* Dark overlay - Top */}
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: 0,
                      left: cropOffset.x,
                      width: cropWidth,
                      height: cropOffset.y,
                    }}
                  />
                  {/* Dark overlay - Bottom */}
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: cropOffset.y + cropHeight,
                      left: cropOffset.x,
                      width: cropWidth,
                      height: displaySize.height - cropOffset.y - cropHeight,
                    }}
                  />
                  {/* Dark overlay - Left */}
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: 0,
                      left: 0,
                      width: cropOffset.x,
                      height: displaySize.height,
                    }}
                  />
                  {/* Dark overlay - Right */}
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: 0,
                      left: cropOffset.x + cropWidth,
                      width: displaySize.width - cropOffset.x - cropWidth,
                      height: displaySize.height,
                    }}
                  />
                  
                  {/* Crop Frame */}
                  <div
                    className={cn(
                      'absolute border-2 border-primary cursor-move touch-none',
                      isDragging && 'cursor-grabbing'
                    )}
                    style={{
                      left: cropOffset.x,
                      top: cropOffset.y,
                      width: cropWidth,
                      height: cropHeight,
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* Corner handles - resize */}
                    <div 
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-primary rounded-sm cursor-nw-resize hover:bg-primary-hover z-10"
                      onMouseDown={(e) => handleResizeStart(e, 'nw')}
                    />
                    <div 
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-sm cursor-ne-resize hover:bg-primary-hover z-10"
                      onMouseDown={(e) => handleResizeStart(e, 'ne')}
                    />
                    <div 
                      className="absolute -bottom-1.5 -left-1.5 w-5 h-5 bg-primary rounded-sm cursor-sw-resize hover:bg-primary-hover z-10"
                      onMouseDown={(e) => handleResizeStart(e, 'sw')}
                    />
                    <div 
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-primary rounded-sm cursor-se-resize hover:bg-primary-hover z-10"
                      onMouseDown={(e) => handleResizeStart(e, 'se')}
                    />
                    
                    {/* Center crosshair */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-primary/50" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/50" />
                    
                    {/* Drag hint */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                        Arraste para mover
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-input"
          >
            <RotateCcw size={16} />
            Centralizar
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-input"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isInitialized || displaySize.width === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              Aplicar Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
