/**
 * O QUADRO DA FOTO: o que a melhoria de foto precisa saber da página
 * (17/11/2026, `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`, seção 6).
 *
 * A IA edita a foto JÁ no enquadramento da peça, não a foto inteira do acervo:
 * "abrir espaço" e a composição dependem do quadro. A foto nova volta para a
 * mesma camada com o recorte inteiro, e por isso cai no mesmo lugar.
 *
 * Sem banco (`@/lib/db` lança no import sem `DATABASE_URL`): a rota e a
 * geometria são testadas sozinhas.
 */

import sharp from 'sharp'
import { currentSourceRect } from '@/lib/image-fit'
import { vinculadaAGrade } from '@/lib/grades/presenca'
import { parsePageLayers, type PageLayer } from '@/lib/posts/page-layers'
import type { CaixaEmFracoes } from './receitas-de-foto'

export type MotivoDaReserva = 'sem-pagina' | 'pagina-modelo' | 'ja-e-melhoria' | 'sem-foto-na-pagina'

type Recorte = { x: number; y: number; width: number; height: number }

export interface FotoDaPagina {
  camadaId: string
  url: string
  /** A caixa da camada na página, em pixels. */
  caixa: { width: number; height: number }
  estilo: { objectFit?: string; cropPosition?: string; crop?: Recorte }
}

export type RotaDaFoto = { via: 'pagina'; foto: FotoDaPagina } | { via: 'reserva'; motivo: MotivoDaReserva }

/** Recorte "a imagem inteira": é como a foto nova, que já vem no quadro, entra na camada. */
export const RECORTE_INTEIRO: Recorte = { x: 0, y: 0, width: 1, height: 1 }

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** A página da arte: `pageId` (compositor, modelo) ou `sourcePageId` (ajuste). */
export function pageIdDaArte(fieldValues: unknown): string | null {
  const fv = (fieldValues ?? {}) as Record<string, unknown>
  return texto(fv.pageId) ?? texto(fv.sourcePageId)
}

/**
 * A foto da página: a primeira camada de imagem visível, com arquivo. Célula
 * de grade fica de fora (grade é composição manual, não "a" foto da arte) e
 * logo e elemento são outros tipos de camada.
 */
export function acharFotoDaPagina(layers: unknown): FotoDaPagina | null {
  for (const camada of parsePageLayers(layers)) {
    if (camada?.type !== 'image' || camada.visible === false || vinculadaAGrade(camada)) continue
    const url = texto(camada.fileUrl)
    const camadaId = texto(camada.id)
    const tamanho = (camada.size ?? {}) as { width?: unknown; height?: unknown }
    const caixa = { width: numero(tamanho.width), height: numero(tamanho.height) }
    if (!url || !camadaId || caixa.width <= 0 || caixa.height <= 0) continue
    const estilo = (camada.style ?? {}) as FotoDaPagina['estilo']
    return {
      camadaId,
      url,
      caixa,
      estilo: {
        ...(estilo.objectFit ? { objectFit: estilo.objectFit } : {}),
        ...(estilo.cropPosition ? { cropPosition: estilo.cropPosition } : {}),
        ...(estilo.crop ? { crop: { ...estilo.crop } } : {}),
      },
    }
  }
  return null
}

/**
 * Por onde a melhoria de foto vai. Pela página quando a arte tem página
 * própria com foto; pela reserva (IA na arte chapada) no resto. Arte que já é
 * melhoria chapada vai pela reserva mesmo com página: a página existe, mas não
 * é o que o post mostra, e trocar a foto nela jogaria fora a diagramação
 * aprovada (seção 6, item 1, e decisão 6 do plano).
 */
export function rotaDaMelhoriaDeFoto(
  origem: { fieldValues: unknown },
  pagina: { isTemplate: boolean; layers: unknown } | null,
): RotaDaFoto {
  const fv = (origem.fieldValues ?? {}) as Record<string, unknown>
  if (fv.source === 'ai_improvement') return { via: 'reserva', motivo: 'ja-e-melhoria' }
  if (!pagina) return { via: 'reserva', motivo: 'sem-pagina' }
  if (pagina.isTemplate) return { via: 'reserva', motivo: 'pagina-modelo' }
  const foto = acharFotoDaPagina(pagina.layers)
  return foto ? { via: 'pagina', foto } : { via: 'reserva', motivo: 'sem-foto-na-pagina' }
}

/** O pedaço do arquivo que a camada desenha, em pixels do arquivo (`image-fit.ts`, a regra do editor e do render). */
export function retanguloDoQuadro(
  natural: { width: number; height: number },
  foto: FotoDaPagina,
): { left: number; top: number; width: number; height: number } {
  const r = currentSourceRect(natural, foto.caixa, foto.estilo as never)
  const left = Math.min(Math.max(0, Math.round(r.cropX)), natural.width - 1)
  const top = Math.min(Math.max(0, Math.round(r.cropY)), natural.height - 1)
  return {
    left,
    top,
    width: Math.max(1, Math.min(Math.round(r.cropWidth), natural.width - left)),
    height: Math.max(1, Math.min(Math.round(r.cropHeight), natural.height - top)),
  }
}

/**
 * A foto limpa no enquadramento da peça.
 * ponytail: lê o arquivo como está, sem girar pelo EXIF, que é como o render
 * do servidor o lê. Se o render passar a honrar a orientação, gire aqui também.
 */
export async function recortarQuadro(arquivo: Buffer, foto: FotoDaPagina): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(arquivo).metadata()
  if (!meta.width || !meta.height) throw new Error('A foto da página não tem dimensões')
  const r = retanguloDoQuadro({ width: meta.width, height: meta.height }, foto)
  // `toBuffer` antes de qualquer medida: `extract().stats()` ignora o recorte.
  const buffer = await sharp(arquivo).extract(r).jpeg({ quality: 95 }).toBuffer()
  return { buffer, width: r.width, height: r.height }
}

/**
 * A caixa do assunto (frações da FOTO inteira, como `marcar-assunto` grava) em
 * frações do QUADRO. Null quando o assunto ficou fora do quadro.
 */
export function caixaDoAssuntoNoQuadro(
  caixa: { x0: number; y0: number; x1: number; y1: number },
  natural: { width: number; height: number },
  quadro: { left: number; top: number; width: number; height: number },
): CaixaEmFracoes | null {
  const x0 = Math.max(0, (caixa.x0 * natural.width - quadro.left) / quadro.width)
  const y0 = Math.max(0, (caixa.y0 * natural.height - quadro.top) / quadro.height)
  const x1 = Math.min(1, (caixa.x1 * natural.width - quadro.left) / quadro.width)
  const y1 = Math.min(1, (caixa.y1 * natural.height - quadro.top) / quadro.height)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 } : null
}

/** As proporções que o Nano Banana aceita em `imageConfig.aspectRatio`. */
const PROPORCOES = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const

/** A proporção aceita mais próxima do quadro (distância em escala logarítmica: 2:1 erra tanto quanto 1:2). */
export function proporcaoMaisProxima(largura: number, altura: number): string {
  const alvo = Math.log(largura / altura)
  let melhor: string = PROPORCOES[0]
  let menor = Infinity
  for (const p of PROPORCOES) {
    const [w, h] = p.split(':').map(Number)
    const d = Math.abs(Math.log(w / h) - alvo)
    if (d < menor) {
      menor = d
      melhor = p
    }
  }
  return melhor
}

/**
 * A foto gerada, na proporção EXATA do quadro (corte central), no tamanho que
 * o gerador entregou: é o que deixa a foto nova entrar na camada com o recorte
 * inteiro sem esticar.
 */
export async function ajustarAoQuadro(gerada: Buffer, quadro: { width: number; height: number }): Promise<Buffer> {
  const meta = await sharp(gerada).metadata()
  const W = meta.width ?? quadro.width
  const H = meta.height ?? quadro.height
  const escala = Math.min(W / quadro.width, H / quadro.height)
  const largura = Math.max(1, Math.round(quadro.width * escala))
  const altura = Math.max(1, Math.round(quadro.height * escala))
  return sharp(gerada).resize(largura, altura, { fit: 'cover', position: 'center' }).jpeg({ quality: 92 }).toBuffer()
}

/** A caixa de cada camada que passa no filtro, só no que cai sobre a foto, em frações da caixa da foto. */
function caixasSobreAFoto(layers: unknown, camadaId: string, entra: (c: PageLayer) => boolean): CaixaEmFracoes[] {
  const camadas = parsePageLayers(layers)
  const foto = camadas.find((c) => c?.id === camadaId)
  if (!foto) return []
  const caixaDe = (c: PageLayer) => {
    const p = (c.position ?? {}) as { x?: unknown; y?: unknown }
    const s = (c.size ?? {}) as { width?: unknown; height?: unknown }
    return { x0: numero(p.x), y0: numero(p.y), x1: numero(p.x) + numero(s.width), y1: numero(p.y) + numero(s.height) }
  }
  const f = caixaDe(foto)
  const w = f.x1 - f.x0
  const h = f.y1 - f.y0
  if (w <= 0 || h <= 0) return []
  const caixas: CaixaEmFracoes[] = []
  for (const c of camadas) {
    if (!c || c.id === camadaId || c.visible === false || !entra(c)) continue
    const t = caixaDe(c)
    const x0 = Math.max(t.x0, f.x0)
    const y0 = Math.max(t.y0, f.y0)
    const x1 = Math.min(t.x1, f.x1)
    const y1 = Math.min(t.y1, f.y1)
    if (x1 <= x0 || y1 <= y0) continue
    caixas.push({ x: (x0 - f.x0) / w, y: (y0 - f.y0) / h, largura: (x1 - x0) / w, altura: (y1 - y0) / h })
  }
  return caixas
}

/**
 * Onde o texto da arte está, em frações da caixa da foto: a união das camadas
 * de texto visíveis e com conteúdo, só no que cai sobre a foto. É o que
 * "Abrir espaço para o texto" recebe quando ninguém informa a área.
 */
export function caixaDoTextoNoQuadro(layers: unknown, camadaId: string): CaixaEmFracoes | null {
  const caixas = caixasSobreAFoto(layers, camadaId, (c) => (c.type === 'text' || c.type === 'rich-text') && typeof c.content === 'string' && !!c.content.trim())
  if (caixas.length === 0) return null
  const x0 = Math.min(...caixas.map((c) => c.x))
  const y0 = Math.min(...caixas.map((c) => c.y))
  const x1 = Math.max(...caixas.map((c) => c.x + c.largura))
  const y1 = Math.max(...caixas.map((c) => c.y + c.altura))
  return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }
}

/**
 * Onde a logo e os elementos da arte ficam sobre a foto. Eles são renderizados
 * POR CIMA dela: gesto ou assunto posto ali fica escondido (medido na bancada
 * de 17/11/2026: a mão do Humanizar saiu embaixo da logo do Espeto).
 */
export function caixasDaMarcaNoQuadro(layers: unknown, camadaId: string): CaixaEmFracoes[] {
  return caixasSobreAFoto(layers, camadaId, (c) => c.type === 'logo' || c.type === 'element')
}

/**
 * As camadas com a foto trocada, SEM tocar no que veio: é a página da prévia
 * (renderizada em memória, nunca gravada). O recorte fica inteiro porque a
 * foto nova já vem no quadro; o resto do estilo (filtros, opacidade) continua.
 */
export function camadasComFotoTrocada(layers: unknown, camadaId: string, url: string): PageLayer[] {
  return parsePageLayers(layers).map((c) =>
    c?.id === camadaId ? { ...c, fileUrl: url, style: { ...((c.style ?? {}) as Record<string, unknown>), crop: { ...RECORTE_INTEIRO } } } : c,
  )
}

/**
 * Diferença média de TOM entre duas fotos (0 a 255), medida em 48x48 e
 * borrada: enxerga o tratamento GLOBAL (balanço de branco, exposição), que não
 * vira zona no mapa de `recompor-por-zona.ts`. Aquele mapa compara cada pixel
 * com a faixa dos vizinhos e foi feito para elemento novo (mão, texto); medido
 * em 17/11/2026, a receita Foto profissional saía como "0% de mudança" e era
 * descartada como se a foto tivesse voltado igual.
 */
export async function diferencaDeTom(origem: Buffer, nova: Buffer): Promise<number> {
  const mini = (b: Buffer) => sharp(b).resize(48, 48, { fit: 'fill' }).blur(1.5).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const [a, c] = await Promise.all([mini(origem), mini(nova)])
  let soma = 0
  for (let i = 0; i < a.length; i++) soma += Math.abs(a[i] - c[i])
  return soma / a.length
}


const dentroDe = (c: CaixaEmFracoes, W: number, H: number) => {
  const x0 = Math.max(0, Math.min(W - 1, Math.round(c.x * W)))
  const y0 = Math.max(0, Math.min(H - 1, Math.round(c.y * H)))
  return { x0, y0, x1: Math.max(x0 + 1, Math.min(W, Math.round((c.x + c.largura) * W))), y1: Math.max(y0 + 1, Math.min(H, Math.round((c.y + c.altura) * H))) }
}

/**
 * O que a receita Foto profissional PROMETE, medido: o assunto mais nítido e
 * o fundo mais desfocado. Nitidez = média do módulo do laplaciano, com as duas
 * fotos na mesma largura. Devolve a razão nova/origem dentro e fora da caixa
 * do assunto: `dentro` acima de 1 é assunto mais nítido; `fora` abaixo de 1 é
 * fundo mais desfocado. Sem caixa, `dentro` é null e `fora` é a foto inteira.
 */
export async function nitidezDentroEFora(origem: Buffer, nova: Buffer, assunto: CaixaEmFracoes | null): Promise<{ dentro: number | null; fora: number }> {
  const W = 512
  const meta = await sharp(origem).metadata()
  const H = Math.max(8, Math.round((W * (meta.height ?? 1)) / (meta.width ?? 1)))
  const cinza = (b: Buffer) => sharp(b).resize(W, H, { fit: 'fill' }).grayscale().raw().toBuffer()
  const [a, c] = await Promise.all([cinza(origem), cinza(nova)])
  const caixa = assunto ? dentroDe(assunto, W, H) : null
  const somas = { aDentro: 0, cDentro: 0, nDentro: 0, aFora: 0, cFora: 0, nFora: 0 }
  const lap = (g: Buffer, i: number) => Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W])
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (caixa && x >= caixa.x0 && x < caixa.x1 && y >= caixa.y0 && y < caixa.y1) {
        somas.aDentro += lap(a, i)
        somas.cDentro += lap(c, i)
        somas.nDentro++
      } else {
        somas.aFora += lap(a, i)
        somas.cFora += lap(c, i)
        somas.nFora++
      }
    }
  }
  const razao = (n: number, d: number) => (d > 0 ? n / d : 1)
  return { dentro: caixa && somas.nDentro > 0 ? razao(somas.cDentro, somas.aDentro) : null, fora: somas.nFora > 0 ? razao(somas.cFora, somas.aFora) : 1 }
}

/**
 * Onde o assunto foi parar na foto nova, e de que tamanho: o recorte do
 * assunto na origem é procurado na foto nova em várias escalas (correlação
 * normalizada, em 128 px de largura). É o que deixa avisar quando "Abrir
 * espaço para o texto" encolheu ou moveu o prato em vez de acalmar o fundo.
 *
 * `escala` 0,8 = o assunto ficou com 80% do tamanho; `dx`/`dy` = quanto o
 * centro dele andou, em fração do quadro; `correlacao` baixa (abaixo de ~0,5)
 * quer dizer que o assunto não foi achado como era, e aí escala e posição não
 * valem.
 */
export async function assuntoNaFotoNova(
  origem: Buffer,
  nova: Buffer,
  assunto: CaixaEmFracoes,
): Promise<{ escala: number; dx: number; dy: number; correlacao: number }> {
  const W = 128
  const meta = await sharp(origem).metadata()
  const H = Math.max(8, Math.round((W * (meta.height ?? 1)) / (meta.width ?? 1)))
  const [a, b] = await Promise.all([origem, nova].map((buf) => sharp(buf).resize(W, H, { fit: 'fill' }).grayscale().raw().toBuffer()))
  const c = dentroDe(assunto, W, H)
  const pw = c.x1 - c.x0
  const ph = c.y1 - c.y0
  const recorte = Buffer.alloc(pw * ph)
  for (let y = 0; y < ph; y++) a.copy(recorte, y * pw, (c.y0 + y) * W + c.x0, (c.y0 + y) * W + c.x1)

  let melhor = { escala: 1, dx: 0, dy: 0, correlacao: -1 }
  for (let s = 0.5; s <= 1.3001; s += 0.05) {
    const w = Math.round(pw * s)
    const h = Math.round(ph * s)
    if (w < 6 || h < 6 || w > W || h > H) continue
    // `toColourspace('b-w')`: sem ele o sharp devolve o recorte cinza em 3 canais e o molde sai embaralhado.
    const molde = await sharp(recorte, { raw: { width: pw, height: ph, channels: 1 } }).resize(w, h, { fit: 'fill' }).toColourspace('b-w').raw().toBuffer()
    let mediaM = 0
    for (let i = 0; i < molde.length; i++) mediaM += molde[i]
    mediaM /= molde.length
    let varM = 0
    for (let i = 0; i < molde.length; i++) varM += (molde[i] - mediaM) ** 2
    if (varM === 0) continue
    const casar = (x0: number, y0: number) => {
      let soma = 0
      let somaB = 0
      let somaB2 = 0
      for (let y = 0; y < h; y++) {
        const linha = (y0 + y) * W + x0
        for (let x = 0; x < w; x++) {
          const v = b[linha + x]
          soma += (molde[y * w + x] - mediaM) * v
          somaB += v
          somaB2 += v * v
        }
      }
      const varB = somaB2 - (somaB * somaB) / (w * h)
      return varB > 0 ? soma / Math.sqrt(varM * varB) : -1
    }
    // Varredura de 2 em 2 e refino de 1 em 1 em volta do melhor ponto.
    let local = { x: 0, y: 0, r: -1 }
    for (let y0 = 0; y0 + h <= H; y0 += 2) for (let x0 = 0; x0 + w <= W; x0 += 2) {
      const r = casar(x0, y0)
      if (r > local.r) local = { x: x0, y: y0, r }
    }
    for (let y0 = Math.max(0, local.y - 1); y0 <= Math.min(H - h, local.y + 1); y0++) for (let x0 = Math.max(0, local.x - 1); x0 <= Math.min(W - w, local.x + 1); x0++) {
      const r = casar(x0, y0)
      if (r > local.r) local = { x: x0, y: y0, r }
    }
    if (local.r > melhor.correlacao) {
      melhor = { escala: Number(s.toFixed(2)), dx: (local.x + w / 2 - (c.x0 + pw / 2)) / W, dy: (local.y + h / 2 - (c.y0 + ph / 2)) / H, correlacao: local.r }
    }
  }
  return melhor
}
