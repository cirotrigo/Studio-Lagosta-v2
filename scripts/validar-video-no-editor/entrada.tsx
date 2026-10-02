// Página da validação: monta o componente REAL de camada (KonvaLayerFactory, com
// o VideoNode de verdade) num Stage do react-konva e expõe controles em
// window.validacao. O contexto do editor é um estado local (stub-contexto.tsx).
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer } from 'react-konva'
import type { Layer, DesignData } from '../../src/types/template'
import { KonvaLayerFactory } from '../../src/components/templates/konva-layer-factory'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { exportVideoWithLayers } from '../../src/lib/konva/konva-video-export'
import { videoPrincipal } from '../../src/lib/video/camadas-de-video'
import { relogioDaPagina } from '../../src/lib/video/relogio-da-pagina'
import { MotorDaPagina } from '../../src/components/templates/motor-da-pagina'
import { ContextoDaValidacao } from './stub-contexto'

// O relógio da página única — a mesma chave que o VideoNode, o motor e o
// export usam quando não há editor multipágina (useMultiPageOpcional → null)
const relogio = relogioDaPagina(undefined)
// O motor usa os hooks de música (inertes sem musicId); só precisam do provider
const queryClient = new QueryClient()

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
      estado: () => ({
        ...Object.fromEntries(
          layersRef.current
            .filter((l) => l.type === 'video')
            .map((l) => {
              const v = elemento(l.id)
              return [l.id, v ? { t: +v.currentTime.toFixed(3), pausado: v.paused, fim: v.ended, pronto: v.readyState } : null]
            }),
        ),
        // Lido no MESMO instante que os currentTime acima: é contra isto que a
        // sincronia da prévia é medida
        relogio: { t: +relogio.agora().toFixed(3), tocando: relogio.estado().tocando, modo: relogio.estado().modo },
      }),
      // Os mesmos comandos do botão ▶︎/⏸, do painel e da tecla de espaço
      tocar: () => relogio.tocar(),
      pausar: () => relogio.pausar(),
      alternar: () => relogio.alternar(),
      ir: (t: number) => relogio.ir(t),
      zerar: () => relogio.zerar(),
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
      // Export com opções extras (o cancelamento de quem chama)
      exportarCom: async (d: { canvas: DesignData['canvas']; layers: Layer[] }, extra: { cancelado?: () => string | null }) => {
        const principal = videoPrincipal(d.layers)
        if (!principal || !stageRef.current) throw new Error('página sem vídeo')
        const { webm, duracao } = await exportVideoWithLayers(
          stageRef.current,
          principal,
          d as unknown as DesignData,
          { setSelectedLayerIds: () => {}, selectedLayerIdsRef: { current: [] }, zoom: 1, setZoomState: () => {} },
          { fps: 30, quality: 0.8, ...extra },
        )
        return { duracao, tamanho: webm.size }
      },
      // Página SEM vídeo (foto + música): o stage parado é gravado pela fatia da música
      exportarSemVideo: async (fatia: number) => {
        const d = { canvas: { width: W, height: H, backgroundColor: '#000000' }, layers: layersRef.current }
        if (videoPrincipal(d.layers) || !stageRef.current) throw new Error('página com vídeo')
        const { webm, duracao } = await exportVideoWithLayers(
          stageRef.current,
          null,
          d as unknown as DesignData,
          { setSelectedLayerIds: () => {}, selectedLayerIdsRef: { current: [] }, zoom: 1, setZoomState: () => {} },
          { fps: 30, quality: 0.8, audioConfig: { source: 'library', musicId: 1, startTime: 0, endTime: fatia } as never },
        )
        const bytes = new Uint8Array(await webm.arrayBuffer())
        let binario = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { duracao, base64: btoa(binario) }
      },
    }
    ;(window as unknown as { validacao: typeof controles }).validacao = controles
  }, [])

  return (
    <ContextoDaValidacao.Provider value={{ design, setCroppingLayerId: () => {} }}>
      <QueryClientProvider client={queryClient}>
        <MotorDaPagina />
      </QueryClientProvider>
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
