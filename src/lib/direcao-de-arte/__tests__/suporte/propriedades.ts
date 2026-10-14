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
 * SAFE INTERFACE do story no perfil autônomo: o piso HARD que protege contra a
 * UI do Instagram (decisão do owner, 13/10/2026: topo 188, rodapé 224 — o
 * padrão da casa em `NUMEROS_PADRAO.geometria.story`). É o ÚNICO lugar destes
 * testes com esses números.
 *
 * Safe interface NÃO é geometria de composição (decisão do owner, 13/10/2026):
 * - a margem estética/compositiva continua vindo da assinatura/página, como hoje;
 * - os 100/90 do registro do owner (15/09) são margem de composição;
 * - `Project.assinatura.geometria.story` (250/350 na peça piloto) é GEOMETRIA DE
 *   COMPOSIÇÃO / CONFIGURAÇÃO LEGADA: não é safe interface, não vira gate nesta
 *   frente e deve ser reconciliada/migrada — nunca vencer em silêncio;
 * - os 250/350 do DNA textual também ficam fora do gate.
 */
export const PISO_DE_INTERFACE_DO_STORY = { topo: 188, rodape: 224 } as const

/**
 * Uma configuração estruturada de INTERFACE do cliente (futura) pode ser MAIS
 * restritiva, nunca menos. A geometria de composição do projeto não entra aqui.
 */
export function interfaceDoStory(doCliente?: { topo?: number; rodape?: number }) {
  return {
    topo: Math.max(PISO_DE_INTERFACE_DO_STORY.topo, doCliente?.topo ?? 0),
    rodape: Math.max(PISO_DE_INTERFACE_DO_STORY.rodape, doCliente?.rodape ?? 0),
  }
}

/**
 * Contraste mínimo logo × fundo (0–255): o `CONTRASTE_MINIMO` de
 * `src/lib/ai/logo-compositor.ts` (não exportado; um teste confere que o valor
 * de lá continua 45). Mantido em 45 no CP0/CP3 inicial (decisão do owner,
 * 13/10/2026) — pode ser recalibrado depois do benchmark REA e do CP3, SEM
 * mudar a semântica regional (`P10_DA_LOGO`).
 */
export const LIMIAR_DE_CONTRASTE_DA_LOGO = 45

/**
 * Critério REGIONAL da logo (decisão do owner, 13/10/2026): o p10 da diferença
 * |luz da logo − luz do fundo|, pixel a pixel, sob os pixels opacos — ou seja,
 * ~90% da logo tem de atingir o limiar. A média sozinha não decide: ela deixa
 * uma parte da logo sumir enquanto parece aceitável.
 */
export const P10_DA_LOGO = 0.1

/**
 * K de hierarquia (decisão do owner, 13/10/2026): NÃO existe K universal como
 * hard gate. A Constituição admite hierarquia por escala, peso, contraste,
 * posição, cor e espaçamento; uma razão fixa de tamanho nunca reprova uma
 * peça. Este valor é só REFERÊNCIA de telemetria/aviso experimental.
 */
export const K_REFERENCIA_HIERARQUIA = 1.25

/**
 * Ruído de render tolerado ao comparar duas medidas da MESMA caixa (com e sem
 * tratamento; antes e depois de um ajuste), em níveis de 0–255. Parâmetro de
 * medição, não limiar de qualidade: o limiar de leitura é o alvo da régua.
 */
export const TOLERANCIA_DE_PIORA = 2

/**
 * Os códigos estruturados que os checkpoints vão produzir (decisões do owner, 13/10/2026).
 * - SEM_COMBINACAO = não há solução viável entre as combinações permitidas
 *   (já existe em produção, na seleção de combinações);
 * - PREFERENCIA_INVIAVEL = há solução, mas a preferência pedida impede usá-la.
 */
export const CODIGOS = {
  logoSemVariante: 'LOGO_SEM_VARIANTE_LEGIVEL',
  preferenciaInviavel: 'PREFERENCIA_INVIAVEL',
  revisaoHumana: 'REVISAO_HUMANA_NECESSARIA',
  semCombinacao: 'SEM_COMBINACAO',
} as const

/** O detalhe estruturado de SEM_COMBINACAO quando a borda junta polaridades que nenhuma estratégia aprovada resolve. */
export const MOTIVOS = {
  polaridadeIncompativel: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA',
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
  /** Diagnóstico: luz média da logo e do fundo sob os pixels opacos. */
  luzDaLogo: number
  luzDoFundo: number
  /** Diagnóstico: média da diferença pixel a pixel. NÃO decide. */
  media: number
  /** O critério: p10 da diferença pixel a pixel. */
  p10: number
  /** Diagnóstico: fração dos pixels opacos com diferença ≥ o limiar. */
  fracaoNoLimiar: number
  pixelsOpacos: number
  /** p10 ≥ limiar (o critério regional do owner). */
  legivel: boolean
}

/**
 * P4 — contraste REGIONAL da logo contra o FUNDO EFETIVO no mesmo pixel: foto
 * + tratamentos + véus, sem a logo e sem a tinta dos textos. Só os pixels
 * OPACOS da logo contam (alfa ≥ 128, a regra da `luminanciaDaLogo` do
 * logo-compositor). Supõe a logo desenhada com `objectFit: contain` na caixa.
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
  const diferencas: number[] = []
  for (let y = 0; y < li.height; y++) {
    for (let x = 0; x < li.width; x++) {
      const p = (y * li.width + x) * li.channels
      if (lg[p + 3] < 128) continue
      const X = Math.round(logo.position.x) + x
      const Y = Math.round(logo.position.y) + y
      if (X < 0 || Y < 0 || X >= bi.width || Y >= bi.height) continue
      const q = (Y * bi.width + X) * bi.channels
      const luzLogo = luz709(lg[p], lg[p + 1], lg[p + 2])
      const luzFundo = luz709(bg[q], bg[q + 1], bg[q + 2])
      somaLogo += luzLogo
      somaFundo += luzFundo
      diferencas.push(Math.abs(luzLogo - luzFundo))
    }
  }
  const n = diferencas.length
  if (n === 0) return null
  diferencas.sort((a, b) => a - b)
  const p10 = diferencas[Math.max(0, Math.ceil(P10_DA_LOGO * n) - 1)]
  return {
    luzDaLogo: somaLogo / n,
    luzDoFundo: somaFundo / n,
    media: diferencas.reduce((s, d) => s + d, 0) / n,
    p10,
    fracaoNoLimiar: diferencas.filter((d) => d >= LIMIAR_DE_CONTRASTE_DA_LOGO).length / n,
    pixelsOpacos: n,
    legivel: p10 >= LIMIAR_DE_CONTRASTE_DA_LOGO,
  }
}

/** Resumo para mensagens: o critério e o diagnóstico juntos. */
export const resumoDaLogo = (l: LeituraDaLogo) => `p10 ${l.p10.toFixed(1)} (critério), média ${l.media.toFixed(1)}, ${(100 * l.fracaoNoLimiar).toFixed(0)}% dos pixels ≥ ${LIMIAR_DE_CONTRASTE_DA_LOGO}`

// ─── Geometria ──────────────────────────────────────────────────────────────

function intersecao(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return w * h
}

/**
 * P5 — quanto cada texto cobre uma REGIÃO PROTEGIDA (narrativamente relevante:
 * o produto, um rosto…), na conta de cobertura do compositor
 * (`pontuarCandidatos`): vence a maior entre "fração da região coberta" e
 * "fração do bloco sobre a região"; acima de `TETO_DE_COBERTURA_DO_ASSUNTO`
 * invade. Não presume que a região seja "o assunto principal" da foto.
 */
export function textosQueInvadem(layers: Layer[], regiaoProtegida: Rect) {
  const areaDaRegiao = regiaoProtegida.width * regiaoProtegida.height
  return layers
    .filter(ehTexto)
    .map((l) => {
      const r = rectDe(l)
      const inter = intersecao(r, regiaoProtegida)
      return { camada: l.id, cobertura: Math.max(inter / areaDaRegiao, inter / (r.width * r.height)) }
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
  const pos = (papel: string) => layers.find((l) => l.id === papel)?.position
  const inversoes: Array<{ antes: string; depois: string }> = []
  for (let i = 1; i < ordenados.length; i++) {
    const a = pos(ordenados[i - 1].papel)
    const b = pos(ordenados[i].papel)
    // Na mesma altura, lê-se da esquerda para a direita.
    if (a && b && (b.y < a.y || (b.y === a.y && b.x < a.x))) inversoes.push({ antes: ordenados[i - 1].papel, depois: ordenados[i].papel })
  }
  return inversoes
}

/**
 * P7/P8 — hierarquia DURA, só estrutural e geométrica (decisão do owner,
 * 13/10/2026): o serviço não assume a entrada do H1 (não fica acima nem
 * dentro da faixa dele) e não se sobrepõe a ele. Tamanho NÃO entra aqui —
 * escala é só telemetria (`telemetriaDeEscala`).
 */
export function servicoDisputaEntrada(layers: Layer[]): string[] {
  const h1 = layers.find((l) => l.id === 'headline')
  const servico = layers.find((l) => l.id === 'servico')
  if (!h1 || !servico) return []
  const problemas: string[] = []
  if (servico.position.y < h1.position.y + h1.size.height) problemas.push('serviço acima ou dentro da faixa do H1')
  if (intersecao(rectDe(servico), rectDe(h1)) > 0) problemas.push('serviço sobre o H1')
  return problemas
}

/**
 * Telemetria de escala: corpo do H1 / maior corpo entre os secundários, e se
 * fica abaixo da `K_REFERENCIA_HIERARQUIA`. NUNCA reprova (o owner decidiu que
 * não há K como hard gate): serve para aviso experimental e para calibrar.
 */
export function telemetriaDeEscala(layers: Layer[]): { razao: number; referencia: number; abaixoDaReferencia: boolean } | null {
  const h1 = layers.find((l) => l.id === 'headline')
  const secundarios = layers.filter((l) => ehTexto(l) && l.id !== 'headline')
  if (!h1 || secundarios.length === 0) return null
  const razao = Number(h1.style?.fontSize) / Math.max(...secundarios.map((l) => Number(l.style?.fontSize)))
  return { razao, referencia: K_REFERENCIA_HIERARQUIA, abaixoDaReferencia: razao < K_REFERENCIA_HIERARQUIA }
}

export { luzDaCor }
