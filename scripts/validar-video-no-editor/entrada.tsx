// Página da validação: monta o componente REAL de camada (KonvaLayerFactory, com
// o VideoNode de verdade) num Stage do react-konva e expõe controles em
// window.validacao. O contexto do editor é um estado local (stub-contexto.tsx).
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer } from 'react-konva'
import type { Layer, DesignData } from '../../src/types/template'
import { KonvaLayerFactory } from '../../src/components/templates/konva-layer-factory'
import { exportVideoWithLayers } from '../../src/lib/konva/konva-video-export'
import { videoPrincipal } from '../../src/lib/video/camadas-de-video'
import { ContextoDaValidacao } from './stub-contexto'

const W = 1080
const H = 1920

function Pagina() {
  const [layers, setLayers] = React.useState<Layer[]>([])
  const stageRef = React.useRef<Konva.Stage | null>(null)
  const layersRef = React.useRef(layers)
  layersRef.current = layers
  const design = React.useMemo(() => ({ canvas: { width: W, height: H, backgroundColor: '#000000' }, layers }), [layers])

  React.useEffect(() => {
    const elemento = (id: string): HTMLVideoElement | null => {
      const node = stageRef.current?.findOne(`#${id}`)
      const img = node instanceof Konva.Image ? node.image() : null
      return img instanceof HTMLVideoElement ? img : null
    }
    const controles = {
      set: (novas: Layer[]) => setLayers(novas),
      mudar: (id: string, videoMetadata: Layer['videoMetadata']) =>
        setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, videoMetadata: { ...l.videoMetadata, ...videoMetadata } } : l))),
      camadas: () => layersRef.current,
      estado: () =>
        Object.fromEntries(
          layersRef.current
            .filter((l) => l.type === 'video')
            .map((l) => {
              const v = elemento(l.id)
              return [l.id, v ? { t: +v.currentTime.toFixed(3), pausado: v.paused, fim: v.ended, pronto: v.readyState } : null]
            }),
        ),
      controle: (layerId: string, action: string, value?: unknown) =>
        window.dispatchEvent(new CustomEvent('video-control', { detail: { layerId, action, value } })),
      exportar: async () => {
        const d = { canvas: { width: W, height: H, backgroundColor: '#000000' }, layers: layersRef.current }
        const principal = videoPrincipal(d.layers)
        if (!principal || !stageRef.current) throw new Error('página sem vídeo')
        const { webm, duracao } = await exportVideoWithLayers(
          stageRef.current,
          principal,
          d as unknown as DesignData,
          { setSelectedLayerIds: () => {}, selectedLayerIdsRef: { current: [] }, zoom: 1, setZoomState: () => {} },
          { fps: 30, quality: 0.8 },
        )
        const bytes = new Uint8Array(await webm.arrayBuffer())
        let binario = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { duracao, principal: principal.id, base64: btoa(binario) }
      },
    }
    ;(window as unknown as { validacao: typeof controles }).validacao = controles
  }, [])

  return (
    <ContextoDaValidacao.Provider value={{ design, setCroppingLayerId: () => {} }}>
      <Stage ref={stageRef} width={W} height={H}>
        <KonvaLayer name="content-layer">
          {layers.map((layer) => (
            <KonvaLayerFactory
              key={layer.id}
              layer={layer}
              onSelect={() => {}}
              onChange={(updates) => setLayers((ls) => ls.map((l) => (l.id === layer.id ? { ...l, ...updates } : l)))}
              stageRef={stageRef}
              projectId={0}
            />
          ))}
        </KonvaLayer>
      </Stage>
    </ContextoDaValidacao.Provider>
  )
}

createRoot(document.getElementById('palco') as HTMLElement).render(<Pagina />)
