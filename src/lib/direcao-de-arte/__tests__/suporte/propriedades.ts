/**
 * Os ORÁCULOS das propriedades P1–P12 (CP0 da direção de arte, 13/10/2026).
 *
 * Cada oráculo mede a peça RENDERIZADA com o renderizador de produção
 * (`CanvasRenderer`) e responde uma pergunta da Constituição. Eles não chamam
 * a lógica que está sob teste (escolha de véu, régua, revisor): medem o
 * resultado por fora, com o mesmo instrumento que reproduziu os números de
 * produção (ver `piloto-fixture.test.ts`).
 *
 * Limiares: só os que já têm dono. Cada constante diz de onde vem.
 */
import sharp from 'sharp'

import type { Layer } from '@/types/template'
import { alvoPorContraste, luzDaCor, type Rect } from '@/lib/creatives/halo/halo'
import { alvoClaroPorContraste, textoEscuro, TOLERANCIA_DO_ALVO } from '@/lib/compositor/regua'
import { TETO_DE_COBERTURA_DO_ASSUNTO } from '@/lib/compositor/mapa-de-calma'

// ─── Contratos (limiares e perfis) ──────────────────────────────────────────

/**
 * SAFE INTERFACE do story no perfil autônomo: o piso que protege contra a UI
 * do Instagram (decisão do owner, 13/10/2026: topo 188, rodapé 224 — o padrão
 * da casa em `NUMEROS_PADRAO.geometria.story`). É o ÚNICO lugar destes testes
 * com esses números. Não é margem de composição: os 100/90 do registro do
 * owner (15/09) e os 250/350 do DNA textual ficam fora do gate.
 */
export const PISO_DE_INTERFACE_DO_STORY = { topo: 188, rodape: 224 } as const

/** A configuração estruturada do cliente pode ser MAIS restritiva, nunca menos. */
export function interfaceDoStory(doCliente?: { topo?: number; rodape?: number }) {
  return {
    topo: Math.max(PISO_DE_INTERFACE_DO_STORY.topo, doCliente?.topo ?? 0),
    rodape: Math.max(PISO_DE_INTERFACE_DO_STORY.rodape, doCliente?.rodape ?? 0),
  }
}

/**
 * Contraste mínimo logo × fundo (0–255): o `CONTRASTE_MINIMO` de
 * `src/lib/ai/logo-compositor.ts` (não exportado; um teste confere que o valor
 * de lá continua 45). Ressalva: lá ele compara a logo com a média do CANTO
 * (caixa + 50% de folga); aqui, com o fundo sob os pixels OPACOS da logo —
 * mais estrito. O critério por região (uma parte da logo some e a média
 * esconde) é decisão pendente do owner.
 */
export const LIMIAR_DE_CONTRASTE_DA_LOGO = 45

/**
 * Razão de escala H1 / maior secundário (R80–R82). SEM DONO: decisão pendente
 * do owner. Enquanto for null, a razão não é testada (pending-owner-decision).
 */
export const K_DA_HIERARQUIA: number | null = null

/**
 * Ruído de render tolerado ao comparar duas medidas da MESMA caixa (com e sem
 * tratamento; antes e depois de um ajuste), em níveis de 0–255. Parâmetro de
 * medição, não limiar de qualidade: o limiar de leitura é o alvo da régua.
 */
export const TOLERANCIA_DE_PIORA = 2

/** Os códigos estruturados que os checkpoints vão produzir (decisões do owner, 13/10/2026). */
export const CODIGOS = {
  logoSemVariante: 'LOGO_SEM_VARIANTE_LEGIVEL',
  preferenciaInviavel: 'PREFERENCIA_INVIAVEL',
  revisaoHumana: 'REVISAO_HUMANA_NECESSARIA',
  /** Já existe em produção: a seleção de combinações recusa quando nenhuma é utilizável. */
  semCombinacao: 'SEM_COMBINACAO',
} as const

// ─── Render e medida ────────────────────────────────────────────────────────

export interface Canvas {
  width: number
  height: number
}

const ehTexto = (l: Layer) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false
const rectDe = (l: Layer): Rect => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })

async function renderizar(layers: Layer[], canvas: Canvas, background = '#FFFFFF'): Promise<Buffer> {
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  return new CanvasRenderer(canvas.width, canvas.height).renderDesign({ canvas: { ...canvas, backgroundColor: background }, layers }, {})
}

const TRANSPARENTE = 'rgba(0,0,0,0)'
const SEM_SOMBRA = { enabled: false, shadowColor: '#000', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0 }

/** O fundo sob a letra: a tinta dos textos some (ela mentiria no percentil). */
function semTinta(layers: Layer[]): Layer[] {
  return layers.map((l) =>
    ehTexto(l)
      ? {
          ...l,
          style: { ...(l.style ?? {}), color: TRANSPARENTE },
          effects: { ...(l.effects ?? {}), shadow: SEM_SOMBRA, stroke: undefined },
          ...(l.type === 'rich-text' && Array.isArray(l.richTextStyles) ? { richTextStyles: l.richTextStyles.map((s) => ({ ...s, fill: TRANSPARENTE })) } : {}),
        }
      : l,
  )
}

/** A foto de fundo: imagem que cobre o canvas inteiro. */
const ehFotoDeFundo = (l: Layer, canvas: Canvas) => l.type === 'image' && l.position.x <= 0 && l.position.y <= 0 && l.size.width >= canvas.width && l.size.height >= canvas.height

/**
 * A peça SEM TRATAMENTO, por exclusão: só a foto de fundo e os textos (sem
 * tinta e sem halo). Tudo o mais — gradiente de leitura, placa, forma, halo
 * por grupo que volte como recurso — conta como tratamento: se piorar a
 * leitura, P1 acusa.
 */
function semTratamento(layers: Layer[], canvas: Canvas): Layer[] {
  return semTinta(layers)
    .filter((l) => ehTexto(l) || ehFotoDeFundo(l, canvas))
    .map((l) => (ehTexto(l) ? { ...l, effects: { ...(l.effects ?? {}), background: undefined } } : l))
}

/** p02 e p98 da luminância sob cada retângulo, no render reduzido a 540 px (a mesma escala da régua). */
async function percentis(png: Buffer, canvas: Canvas, rects: Rect[]) {
  const largura = Math.min(540, canvas.width)
  const escala = largura / canvas.width
  const altura = Math.max(1, Math.round(canvas.height * escala))
  const { data, info } = await sharp(png).resize(largura, altura, { fit: 'fill' }).grayscale().toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
  return rects.map((r) => {
    const x0 = Math.max(0, Math.round(r.x * escala))
    const y0 = Math.max(0, Math.round(r.y * escala))
    const x1 = Math.min(info.width, Math.round((r.x + r.width) * escala))
    const y1 = Math.min(info.height, Math.round((r.y + r.height) * escala))
    const valores: number[] = []
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) valores.push(data[(y * info.width + x) * info.channels])
    valores.sort((a, b) => a - b)
    const q = (p: number) => (valores.length ? valores[Math.min(valores.length - 1, Math.ceil(p * valores.length) - 1)] : 255)
    return { p02: q(0.02), p98: q(0.98) }
  })
}

export interface LeituraDoTexto {
  camada: string
  cor: string
  polaridade: 'clara' | 'escura'
  /** O alvo de 3:1 da própria cor (o mesmo da régua). */
  alvo: number
  /** A luz que limita a leitura: p98 para texto claro, p02 para texto escuro. */
  sem: number
  com: number
}

/**
 * A leitura de CADA texto, com e sem o tratamento de leitura. A polaridade sai
 * da COR DO TEXTO (o que está sob teste é justamente a escolha do véu).
 */
export async function leiturasDosTextos(layers: Layer[], canvas: Canvas, background?: string): Promise<LeituraDoTexto[]> {
  const textos = layers.filter(ehTexto)
  const rects = textos.map(rectDe)
  const [semPng, comPng] = await Promise.all([renderizar(semTratamento(layers, canvas), canvas, background), renderizar(semTinta(layers), canvas, background)])
  const [sem, com] = await Promise.all([percentis(semPng, canvas, rects), percentis(comPng, canvas, rects)])
  return textos.map((t, i) => {
    const cor = String(t.style?.color ?? '#FFFFFF')
    const escura = textoEscuro(cor)
    return {
      camada: t.id,
      cor,
      polaridade: escura ? 'escura' : 'clara',
      alvo: escura ? alvoClaroPorContraste(cor, 3) : alvoPorContraste(cor, 3),
      sem: escura ? sem[i].p02 : sem[i].p98,
      com: escura ? com[i].p02 : com[i].p98,
    }
  })
}

/** P1 — o tratamento de leitura não pode piorar a leitura de nenhum texto. */
export function tratamentosQuePioram(leituras: LeituraDoTexto[], tolerancia = TOLERANCIA_DE_PIORA) {
  return leituras.filter((l) => (l.polaridade === 'clara' ? l.com > l.sem + tolerancia : l.com < l.sem - tolerancia))
}

/** P2/P3 — dentro do alvo de 3:1 com a tolerância da régua (`TOLERANCIA_DO_ALVO`). */
export function leituraDentroDoAlvo(l: LeituraDoTexto): boolean {
  return l.polaridade === 'clara' ? l.com <= l.alvo + TOLERANCIA_DO_ALVO : l.com >= l.alvo - TOLERANCIA_DO_ALVO
}

// ─── Logo ───────────────────────────────────────────────────────────────────

const luz709 = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export interface LeituraDaLogo {
  luzDaLogo: number
  luzDoFundo: number
  contraste: number
  pixelsOpacos: number
}

/**
 * P4 — contraste da logo contra o FUNDO EFETIVO (foto + véus, sem a logo e sem
 * a tinta dos textos), lido só sob os pixels OPACOS da logo (alfa ≥ 128, a
 * mesma regra da `luminanciaDaLogo` do logo-compositor). Supõe a logo
 * desenhada com `objectFit: contain` na caixa da camada.
 */
export async function leituraDaLogo(layers: Layer[], canvas: Canvas, background?: string): Promise<LeituraDaLogo | null> {
  const logo = layers.find((l) => l.type === 'logo' && l.visible !== false)
  if (!logo || typeof logo.fileUrl !== 'string') return null
  const fundo = await renderizar(semTinta(layers.filter((l) => l !== logo)), canvas, background)
  const { data: bg, info: bi } = await sharp(fundo).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const arquivo = Buffer.from(logo.fileUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  const w = Math.round(logo.size.width)
  const h = Math.round(logo.size.height)
  const { data: lg, info: li } = await sharp(arquivo).ensureAlpha().resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true })
  let somaLogo = 0
  let somaFundo = 0
  let n = 0
  for (let y = 0; y < li.height; y++) {
    for (let x = 0; x < li.width; x++) {
      const p = (y * li.width + x) * li.channels
      if (lg[p + 3] < 128) continue
      const X = Math.round(logo.position.x) + x
      const Y = Math.round(logo.position.y) + y
      if (X < 0 || Y < 0 || X >= bi.width || Y >= bi.height) continue
      const q = (Y * bi.width + X) * bi.channels
      somaLogo += luz709(lg[p], lg[p + 1], lg[p + 2])
      somaFundo += luz709(bg[q], bg[q + 1], bg[q + 2])
      n++
    }
  }
  if (n === 0) return null
  const luzDaLogo = somaLogo / n
  const luzDoFundo = somaFundo / n
  return { luzDaLogo, luzDoFundo, contraste: Math.abs(luzDaLogo - luzDoFundo), pixelsOpacos: n }
}

// ─── Geometria ──────────────────────────────────────────────────────────────

function intersecao(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return w * h
}

/**
 * P5 — quanto cada texto cobre o assunto, na conta do compositor
 * (`pontuarCandidatos`): vence a maior entre "fração do assunto coberta" e
 * "fração do bloco sobre o assunto"; acima de `TETO_DE_COBERTURA_DO_ASSUNTO` invade.
 */
export function textosQueInvademOAssunto(layers: Layer[], assunto: Rect) {
  const areaAssunto = assunto.width * assunto.height
  return layers
    .filter(ehTexto)
    .map((l) => {
      const r = rectDe(l)
      const inter = intersecao(r, assunto)
      return { camada: l.id, cobertura: Math.max(inter / areaAssunto, inter / (r.width * r.height)) }
    })
    .filter((c) => c.cobertura > TETO_DE_COBERTURA_DO_ASSUNTO)
}

/** P6 — texto e logo dentro da faixa livre da interface (topo e rodapé). */
export function foraDaInterface(layers: Layer[], canvas: Canvas, interface_: { topo: number; rodape: number }) {
  return layers
    .filter((l) => (ehTexto(l) || l.type === 'logo') && l.visible !== false)
    .filter((l) => l.position.y < interface_.topo || l.position.y + l.size.height > canvas.height - interface_.rodape)
    .map((l) => ({ camada: l.id, topo: l.position.y, base: l.position.y + l.size.height }))
}

/**
 * P7 — ordem de leitura: o bloco que a copy manda ler antes fica ACIMA (o topo
 * da caixa) do bloco seguinte. Blocos pela `ordem` da spec; a camada do
 * compositor tem o id do papel.
 */
export function ordemDeLeituraInvertida(layers: Layer[], blocos: Array<{ ordem?: number; papel: string }>) {
  const ordenados = [...blocos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const y = (papel: string) => layers.find((l) => l.id === papel)?.position.y
  const inversoes: Array<{ antes: string; depois: string }> = []
  for (let i = 1; i < ordenados.length; i++) {
    const a = y(ordenados[i - 1].papel)
    const b = y(ordenados[i].papel)
    if (a != null && b != null && b < a) inversoes.push({ antes: ordenados[i - 1].papel, depois: ordenados[i].papel })
  }
  return inversoes
}

/**
 * P8 — o serviço é secundário: corpo menor que o do H1 e caixa inteira abaixo
 * do H1, sem tocar a caixa dele (o ponto de entrada é o H1). Sem razão
 * mínima — isso é o `K_DA_HIERARQUIA`, pendente.
 */
export function servicoDisputaEntrada(layers: Layer[]): string[] {
  const h1 = layers.find((l) => l.id === 'headline')
  const servico = layers.find((l) => l.id === 'servico')
  if (!h1 || !servico) return []
  const problemas: string[] = []
  if (Number(servico.style?.fontSize) >= Number(h1.style?.fontSize)) problemas.push('serviço com corpo ≥ H1')
  if (servico.position.y < h1.position.y + h1.size.height) problemas.push('serviço acima ou dentro da faixa do H1')
  if (intersecao(rectDe(servico), rectDe(h1)) > 0) problemas.push('serviço sobre o H1')
  return problemas
}

export { luzDaCor }
