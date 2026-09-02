/**
 * Aplica o HALO nas camadas de uma arte montada em modelo.
 *
 * O véu dos modelos gerados (`veu topo`/`veu rodape`, gradientes sobre a
 * faixa inteira) escurece centenas de pixels de foto para dar contraste onde
 * a letra cai. O halo é UMA camada `shape` desfocada por BLOCO de texto — a
 * caixa do bloco crescida pela margem, com a tinta calibrada pela luz da foto
 * naquele retângulo (`calibrarHalo`). Foto já escura ali → tinta 0 → sem
 * halo nenhum.
 *
 * Contrato (as três partes):
 *  - `gruposDeTexto`/`inserirHalos` são PUROS (agrupamento, ordem das
 *    camadas, remoção do véu) e testáveis sem sharp;
 *  - `aplicarHalo` mede a foto (`halo-medicao.ts`) e monta as camadas;
 *  - a cor da mancha vem de quem chama — é a cor do véu que o cliente já
 *    usava (o dark da marca), nunca preto puro por default.
 *
 * O que sai é o que o render (`renderShapeBlurred`) e o editor (`ShapeNode`)
 * leem igual: `style.fill` + `style.fillOpacity` + `border.radius` +
 * `effects.blur`.
 */

import type { Layer } from '@/types/template'

import {
  agruparEmBlocos,
  calibrarHalo,
  uniao,
  type HaloCalibrado,
  type Rect,
} from './halo'
import { lerFotoComoCover, luzNoRect, type CanvasSize, type FotoCinza } from './halo-medicao'

export interface AplicarHaloInput {
  layers: Layer[]
  canvas: CanvasSize
  /** A foto de fundo: bytes crus ou já decodificada como cover. */
  foto: Buffer | FotoCinza
  /** Cor da mancha (hex) — o dark da marca. */
  corDaMancha: string
  raioBase?: number
  /** Vão vertical máximo para duas caixas pertencerem ao mesmo bloco. */
  folgaDeGrupo?: number
}

export interface HaloDeBloco extends HaloCalibrado {
  /** id da camada shape criada (vazio quando tinta 0 — não há camada). */
  camadaId: string | null
  /** ids das camadas de texto do bloco. */
  camadas: string[]
  /** Primeira linha do texto mais alto do bloco, para o aviso ser legível. */
  primeiraLinha: string
}

export interface AplicarHaloResult {
  layers: Layer[]
  halos: HaloDeBloco[]
  avisos: string[]
}

export interface GrupoDeTexto {
  camadas: Layer[]
  rect: Rect
}

const PREFIXO_HALO = 'halo-'

/** Véu de leitura dos modelos gerados: gradiente cujo id/nome diz "veu". */
export function ehCamadaDeVeu(layer: Layer): boolean {
  if (layer.type !== 'gradient' && layer.type !== 'gradient2') return false
  const id = String(layer.id ?? '').toLowerCase()
  const nome = String(layer.name ?? '')
  return id.startsWith('veu') || /v[eé]u/i.test(nome)
}

/** Halo criado por este módulo (para a aplicação ser idempotente). */
export function ehCamadaDeHalo(layer: Layer): boolean {
  return layer.type === 'shape' && String(layer.id ?? '').startsWith(PREFIXO_HALO)
}

/** A foto de fundo: imagem que cobre o quadro (≥ 80% da área) ou o id da casa. */
export function ehFotoDeFundo(layer: Layer, canvas: CanvasSize): boolean {
  if (layer.type !== 'image') return false
  if (layer.id === 'bg-foto' || layer.id === 'bg-img') return true
  const area = (layer.size?.width ?? 0) * (layer.size?.height ?? 0)
  return area >= 0.8 * canvas.width * canvas.height
}

function rectDaCamada(layer: Layer): Rect | null {
  const x = layer.position?.x
  const y = layer.position?.y
  const w = layer.size?.width
  const h = layer.size?.height
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if ((w as number) <= 0 || (h as number) <= 0) return null
  return { x: x as number, y: y as number, width: w as number, height: h as number }
}

/**
 * Camadas de texto visíveis, agrupadas em blocos pela geometria: caixas cujo
 * vão vertical é menor que `folga` ficam juntas (manchete + apoio), o resto é
 * outro bloco (o serviço no rodapé).
 */
export function gruposDeTexto(layers: Layer[], folga = 120): GrupoDeTexto[] {
  const itens: Array<{ layer: Layer; rect: Rect }> = []
  for (const layer of layers) {
    if (layer.type !== 'text' || layer.visible === false) continue
    const rect = rectDaCamada(layer)
    if (!rect) continue
    itens.push({ layer, rect })
  }
  return agruparEmBlocos(itens, folga)
    .map((grupo) => ({
      camadas: grupo.map((g) => g.layer),
      rect: uniao(grupo.map((g) => g.rect)) as Rect,
    }))
    .filter((g) => g.rect !== null)
}

/** Cores hex do texto do grupo (`style.color`); o que não é hex não vota. */
export function coresDoGrupo(camadas: Layer[]): string[] {
  const cores = new Set<string>()
  for (const c of camadas) {
    const cor = c.style?.color
    if (typeof cor === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cor.trim())) {
      cores.add(cor.trim())
    }
  }
  return [...cores]
}

function primeiraLinha(camadas: Layer[]): string {
  const topo = [...camadas].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))[0]
  const conteudo = typeof topo?.content === 'string' ? topo.content : ''
  const linha = conteudo.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return linha.length > 48 ? `${linha.slice(0, 45)}…` : linha
}

/** A camada `shape` do halo — o que render e editor desenham. */
export function montarCamadaDeHalo(
  halo: HaloCalibrado,
  indice: number,
  corDaMancha: string,
): Layer {
  const { rect, raio, tinta } = halo
  const raioDoCanto = Math.min(raio + 60, Math.floor(Math.min(rect.width, rect.height) / 2))
  return {
    id: `${PREFIXO_HALO}${indice}`,
    name: 'Halo',
    type: 'shape',
    visible: true,
    locked: false,
    order: 0,
    isDynamic: false,
    position: { x: Math.round(rect.x), y: Math.round(rect.y) },
    size: { width: Math.round(rect.width), height: Math.round(rect.height) },
    rotation: 0,
    style: {
      shapeType: 'rectangle',
      fill: corDaMancha,
      fillOpacity: Number(tinta.toFixed(3)),
      strokeWidth: 0,
      border: { width: 0, color: corDaMancha, radius: raioDoCanto },
    },
    // Blur na PRÓPRIA forma — o render borra os pixels do retângulo e o
    // editor cacheia o node com folga; a foto atrás fica intacta.
    effects: { blur: { enabled: true, blurRadius: raio } },
    metadata: {
      halo: { tinta, raio, alvo: halo.alvo, luzMedida: halo.luzMedida, noTeto: halo.noTeto },
    },
  }
}

/**
 * Tira o véu (e halos anteriores), põe os halos logo ACIMA da foto de fundo e
 * ABAIXO de todo texto, e renumera `order` — o render server-side ordena por
 * ele. Só o véu sai: qualquer outro gradiente é da marca e fica.
 */
export function inserirHalos(layers: Layer[], halos: Layer[], canvas: CanvasSize): Layer[] {
  const ordenadas = [...layers]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((l) => !ehCamadaDeVeu(l) && !ehCamadaDeHalo(l))

  const fundo = ordenadas.findIndex((l) => ehFotoDeFundo(l, canvas))
  const imagem = fundo >= 0 ? fundo : ordenadas.findIndex((l) => l.type === 'image')
  let posicao = imagem + 1 // -1 + 1 = 0: sem imagem, o halo vai para o chão
  const primeiroTexto = ordenadas.findIndex((l) => l.type === 'text')
  if (primeiroTexto >= 0) posicao = Math.min(posicao, primeiroTexto)

  ordenadas.splice(posicao, 0, ...halos)
  return ordenadas.map((l, i) => ({ ...l, order: i }))
}

/**
 * Mede a foto em cada bloco de texto, calibra o halo e reescreve as camadas.
 * Lança quando a foto não é legível — quem chama decide cair no véu.
 */
export async function aplicarHalo(input: AplicarHaloInput): Promise<AplicarHaloResult> {
  const raster = Buffer.isBuffer(input.foto)
    ? await lerFotoComoCover(input.foto, input.canvas)
    : input.foto

  const grupos = gruposDeTexto(input.layers, input.folgaDeGrupo)
  const halos: HaloDeBloco[] = []
  const camadasDeHalo: Layer[] = []
  const avisos: string[] = []

  for (const grupo of grupos) {
    const luz = luzNoRect(raster, grupo.rect)
    const linha = primeiraLinha(grupo.camadas)
    if (!luz) {
      avisos.push(`não deu para medir a foto atrás de "${linha}" — o bloco está fora do quadro`)
      continue
    }
    const calibrado = calibrarHalo({
      texto: grupo.rect,
      luz,
      coresDoTexto: coresDoGrupo(grupo.camadas),
      corDaMancha: input.corDaMancha,
      raioBase: input.raioBase,
    })
    const ids = grupo.camadas.map((c) => c.id)
    if (calibrado.tinta <= 0) {
      halos.push({ ...calibrado, camadaId: null, camadas: ids, primeiraLinha: linha })
      continue
    }
    const indice = camadasDeHalo.length + 1
    const camada = montarCamadaDeHalo(calibrado, indice, input.corDaMancha)
    camadasDeHalo.push(camada)
    halos.push({ ...calibrado, camadaId: camada.id, camadas: ids, primeiraLinha: linha })
    if (calibrado.noTeto) {
      avisos.push(
        `a foto não carrega a linha "${linha}" nessa posição — a mancha bateu no teto ` +
          `(luz ${Math.round(calibrado.luzMedida)}, alvo ${Math.round(calibrado.alvo)}); ` +
          'vale escolher outra foto ou mover o texto',
      )
    }
  }

  return {
    layers: inserirHalos(input.layers, camadasDeHalo, input.canvas),
    halos,
    avisos,
  }
}
