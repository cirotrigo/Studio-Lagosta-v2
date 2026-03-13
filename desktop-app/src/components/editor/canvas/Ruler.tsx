import { useMemo } from 'react'

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  size: number
  pageSize: number
  pageOffset: number
  zoom: number
  rulerSize?: number
}

function getTickInterval(zoom: number): number {
  // Ajusta o intervalo das marcações baseado no zoom
  if (zoom >= 2) return 10
  if (zoom >= 1) return 25
  if (zoom >= 0.5) return 50
  if (zoom >= 0.25) return 100
  return 200
}

export function Ruler({
  orientation,
  size,
  pageSize,
  pageOffset,
  zoom,
  rulerSize = 20,
}: RulerProps) {
  const ticks = useMemo(() => {
    const interval = getTickInterval(zoom)
    const result: { position: number; label: string; isMajor: boolean }[] = []

    // Calcula o range visível na página
    const startPage = Math.floor(-pageOffset / zoom / interval) * interval
    const endPage = Math.ceil((size - pageOffset) / zoom / interval) * interval

    for (let i = startPage; i <= endPage; i += interval) {
      const screenPos = pageOffset + i * zoom
      if (screenPos >= 0 && screenPos <= size) {
        const isMajor = i % (interval * 2) === 0 || interval >= 100
        result.push({
          position: screenPos,
          label: i.toString(),
          isMajor,
        })
      }
    }

    return result
  }, [size, pageOffset, zoom, pageSize])

  if (orientation === 'horizontal') {
    return (
      <div
        className="absolute left-0 top-0 z-20 select-none overflow-hidden border-b border-border bg-card/90 backdrop-blur-sm"
        style={{ height: rulerSize, width: size, marginLeft: rulerSize }}
      >
        <svg width={size} height={rulerSize} className="text-text-muted">
          {ticks.map((tick) => (
            <g key={tick.position}>
              <line
                x1={tick.position}
                y1={tick.isMajor ? 0 : rulerSize / 2}
                x2={tick.position}
                y2={rulerSize}
                stroke="currentColor"
                strokeWidth={tick.isMajor ? 1 : 0.5}
                opacity={tick.isMajor ? 0.6 : 0.3}
              />
              {tick.isMajor && (
                <text
                  x={tick.position + 3}
                  y={10}
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.7}
                >
                  {tick.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    )
  }

  return (
    <div
      className="absolute left-0 top-0 z-20 select-none overflow-hidden border-r border-border bg-card/90 backdrop-blur-sm"
      style={{ width: rulerSize, height: size, marginTop: rulerSize }}
    >
      <svg width={rulerSize} height={size} className="text-text-muted">
        {ticks.map((tick) => (
          <g key={tick.position}>
            <line
              x1={tick.isMajor ? 0 : rulerSize / 2}
              y1={tick.position}
              x2={rulerSize}
              y2={tick.position}
              stroke="currentColor"
              strokeWidth={tick.isMajor ? 1 : 0.5}
              opacity={tick.isMajor ? 0.6 : 0.3}
            />
            {tick.isMajor && (
              <text
                x={2}
                y={tick.position + 12}
                fontSize={9}
                fill="currentColor"
                opacity={0.7}
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function RulerCorner({ size = 20 }: { size?: number }) {
  return (
    <div
      className="absolute left-0 top-0 z-30 border-b border-r border-border bg-card/90 backdrop-blur-sm"
      style={{ width: size, height: size }}
    />
  )
}
