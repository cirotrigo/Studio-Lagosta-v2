// Página da validação: monta o componente REAL de camada (KonvaLayerFactory, com
// o VideoNode de verdade) num Stage do react-konva e expõe controles em
// window.validacao. O contexto do editor é um estado local (stub-contexto.tsx);
// a seleção é de verdade — clicar seleciona, o Transformer real segura a
// camada (como no konva-editor-stage), e o export a limpa e devolve.
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import { Stage, Layer as KonvaLayer } from 'react-konva'
import type { Layer, DesignData } from '../../src/types/template'
import { KonvaLayerFactory } from '../../src/components/templates/konva-layer-factory'
import { KonvaSelectionTransformer } from '../../src/components/templates/konva-transformer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { exportVideoWithLayers } from '../../src/lib/konva/konva-video-export'
import { videoPrincipal } from '../../src/lib/video/camadas-de-video'
import { normalizarClipes } from '../../src/lib/video/linha-do-tempo'
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
  const [selecionadas, setSelecionadas] = React.useState<string[]>([])
  const stageRef = React.useRef<Konva.Stage | null>(null)
  const layersRef = React.useRef(layers)
  layersRef.current = layers
  const selecionadasRef = React.useRef(selecionadas)
  selecionadasRef.current = selecionadas
  const design = React.useMemo(() => ({ canvas: { width: W, height: H, backgroundColor: '#000000' }, layers }), [layers])

  React.useEffect(() => {
    const elemento = (id: string): HTMLVideoElement | null => {
      const node = stageRef.current?.findOne(`#${id}`)
      const img = node instanceof Konva.Image ? node.image() : null
      return img instanceof HTMLVideoElement ? img : null
    }
    // O que o editor passa ao export: a seleção de verdade (ele a limpa para
    // gravar sem as alças e a devolve no fim)
    const doEditor = { setSelectedLayerIds: setSelecionadas, selectedLayerIdsRef: selecionadasRef, zoom: 1, setZoomState: () => {} }
    const transformer = () => stageRef.current?.findOne('Transformer') as Konva.Transformer | undefined
    const controles = {
      set: (novas: Layer[]) => setLayers(novas),
      selecionar: (ids: string[]) => setSelecionadas(ids),
      // Os nós que o Transformer segura agora
      selecao: () => (transformer()?.nodes() ?? []).map((n) => n.id()),
      // Onde está a alça `nome` do Transformer, na tela
      alca: (nome: string) => {
        const tr = transformer()
        if (!tr || tr.nodes().length === 0) return null
        tr.forceUpdate()
        const p = tr.findOne('.' + nome)?.getAbsolutePosition()
        return p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2) } : null
      },
      mudar: (id: string, videoMetadata: Layer['videoMetadata']) =>
        setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, videoMetadata: { ...l.videoMetadata, ...videoMetadata } } : l))),
      camadas: () => layersRef.current,
      estado: () => ({
        ...Object.fromEntries(
          layersRef.current
            .filter((l) => l.type === 'video')
            .map((l) => {
              const v = elemento(l.id)
              return [l.id, v ? { t: +v.currentTime.toFixed(3), pausado: v.paused, fim: v.ended, pronto: v.readyState, mudo: v.muted } : null]
            }),
        ),
        // Lido no MESMO instante que os currentTime acima: é contra isto que a
        // sincronia da prévia é medida
        relogio: { t: +relogio.agora().toFixed(3), tocando: relogio.estado().tocando, modo: relogio.estado().modo },
      }),
      // O que o aplicador do quadro escreveu na camada: no grupo de efeito (as
      // transições) e no grupo de movimento da foto (que mora dentro da caixa,
      // sob o recorte). `t` é o relógio lido no MESMO instante.
      efeito: (id: string) => {
        const grupo = stageRef.current?.find('.efeito-de-tempo').find((g) => g.getAttr('camadaId') === id) as Konva.Group | undefined
        const no = grupo?.getChildren()[0]
        if (!grupo || !no) return null
        const mov = grupo.findOne('.efeito-movimento') as Konva.Group | undefined
        return {
          escala: mov ? +mov.scaleX().toFixed(4) : 1,
          x: mov ? +mov.x().toFixed(2) : null,
          recortado: Boolean((mov?.getParent() as Konva.Group | null)?.clipFunc()),
          no: { x: +no.x().toFixed(2), y: +no.y().toFixed(2) },
          visivel: grupo.visible(),
          opacidade: +grupo.opacity().toFixed(3),
          deslocamento: +grupo.x().toFixed(2),
          t: +relogio.agora().toFixed(3),
        }
      },
      // Uma linha de pixels (RGB) do stage como ele está agora: o que a prévia mostra
      linha: (y: number) => {
        const c = stageRef.current?.toCanvas({ x: 0, y, width: W, height: 1, pixelRatio: 1 })
        const rgba = c?.getContext('2d')?.getImageData(0, 0, W, 1).data
        return rgba ? Array.from(rgba).filter((_, i) => i % 4 !== 3) : null
      },
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
          doEditor,
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
          doEditor,
          { fps: 30, quality: 0.8, ...extra },
        )
        return { duracao, tamanho: webm.size }
      },
      // Linha do tempo (Fase 3): sequência de clipes — a duração é a soma dos
      // clipes e o export mostra um clipe por vez. O principal é o que o botão
      // de export passa (`videoPrincipal`): o 1º vídeo, ou nenhum só com fotos
      exportarLinha: async () => {
        const d = { canvas: { width: W, height: H, backgroundColor: '#000000' }, layers: layersRef.current }
        if (!stageRef.current) throw new Error('sem stage')
        const { webm, duracao } = await exportVideoWithLayers(
          stageRef.current,
          videoPrincipal(d.layers),
          d as unknown as DesignData,
          doEditor,
          { fps: 30, quality: 0.8 },
        )
        const bytes = new Uint8Array(await webm.arrayBuffer())
        let binario = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return { duracao, base64: btoa(binario) }
      },
      // Reordena os clipes como a linha do tempo faz (dnd-kit → normalizarClipes)
      normalizar: (ids: string[]) => {
        const novas = normalizarClipes(layersRef.current, ids) as Layer[]
        setLayers(novas)
        return novas.filter((l) => (l as { clipe?: unknown }).clipe).map((l) => [l.id, l.order])
      },
      // Página SEM vídeo (foto + música): o stage parado é gravado pela fatia da música
      exportarSemVideo: async (fatia: number) => {
        const d = { canvas: { width: W, height: H, backgroundColor: '#000000' }, layers: layersRef.current }
        if (videoPrincipal(d.layers) || !stageRef.current) throw new Error('página com vídeo')
        const { webm, duracao } = await exportVideoWithLayers(
          stageRef.current,
          null,
          d as unknown as DesignData,
          doEditor,
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
    <ContextoDaValidacao.Provider value={{ design, setCroppingLayerId: () => {}, getStageInstance: () => stageRef.current }}>
      <QueryClientProvider client={queryClient}>
        <MotorDaPagina />
      </QueryClientProvider>
      <Stage ref={stageRef} width={W} height={H}>
        <KonvaLayer name="content-layer">
          {layers.map((layer) => (
            <KonvaLayerFactory
              key={layer.id}
              layer={layer}
              onSelect={(_e, l) => setSelecionadas([l.id])}
              onChange={(updates) => setLayers((ls) => ls.map((l) => (l.id === layer.id ? { ...l, ...updates } : l)))}
              stageRef={stageRef}
              projectId={0}
            />
          ))}
          <KonvaSelectionTransformer selectedLayerIds={selecionadas} stageRef={stageRef} snapEnabled={false} snapToMargins={false} />
        </KonvaLayer>
      </Stage>
    </ContextoDaValidacao.Provider>
  )
}

createRoot(document.getElementById('palco') as HTMLElement).render(<Pagina />)
