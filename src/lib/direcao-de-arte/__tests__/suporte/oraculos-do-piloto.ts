/**
 * Piloto sintético (§ 2.1 do contrato) — os JUÍZES: uma segunda opinião sobre a peça FINAL, com implementação própria onde o
 * gate/revisor não pode ser repetido. A matriz diz, regra a regra, o que o juiz cobre:
 *  - `coberta` / `coberta-parcial`: "falso APTO = 0" se afirma aqui (o parcial diz o limite);
 *  - `mesma-medida`: só existe o medidor do revisor (`checkTextGeometry`) — repetir não é juiz → inspeção humana;
 *  - `nao-coberta`: sem juiz externo → inspeção humana; dito ao lado do veredito.
 * Os juízes de PIXEL vêm do CP0 (`propriedades.ts`: leituras com o renderer de produção, limites da régua importados —
 * parcial, dito); os de GEOMETRIA são puros e reimplementados aqui (piso 188/224 com a folga de 1 px do CP5a, área segura
 * pelas margens do projeto, logo sobre texto por interseção de caixas) — NÃO chamam `pisoDeInterface`/`foraDaInterface`.
 */
import type { Layer } from '@/types/template'
import type { Rect } from '@/lib/creatives/halo/halo'
import { leiturasDosTextos, leituraDentroDoAlvo, tratamentosQuePioram, leituraDaLogo, textosQueInvadem, type Canvas } from './propriedades'

export type EstadoDoJuiz = 'coberta' | 'coberta-parcial' | 'mesma-medida' | 'nao-coberta'
export const REGRAS_JULGADAS = [
  'texto-sem-leitura',
  'tratamento-piorou-leitura',
  'logo-sem-leitura',
  'texto-sobre-assunto',
  'piso-de-interface',
  'fora-da-area-segura',
  'logo-sobre-texto',
  'colisao',
  'texto-cortado',
  'tinta-fora-da-caixa',
  'texto-pequeno',
  'copy-completa',
  'identidade',
  'oclusao',
  'fonte-nao-carregada',
] as const
export type RegraJulgada = (typeof REGRAS_JULGADAS)[number]

/** A matriz do contrato (§ 2.1). */
export const MATRIZ: Record<RegraJulgada, { estado: EstadoDoJuiz; limite: string }> = {
  'texto-sem-leitura': { estado: 'coberta-parcial', limite: 'leitura de pixels própria (CP0) sobre o PNG final; limites da régua importados' },
  'tratamento-piorou-leitura': { estado: 'coberta-parcial', limite: 'idem; compara sem × com tratamento' },
  'logo-sem-leitura': { estado: 'coberta-parcial', limite: 'p10 da diferença pixel a pixel (CP0); limiar importado' },
  'texto-sobre-assunto': { estado: 'coberta', limite: 'verdade por construção (fotos sintéticas) / região anotada (fixture)' },
  'piso-de-interface': { estado: 'coberta-parcial', limite: 'caixas × 188/224 com folga de 1 px; sem glifos, rotação ou efeitos' },
  'fora-da-area-segura': { estado: 'coberta', limite: 'caixas × margens do projeto' },
  'logo-sobre-texto': { estado: 'coberta-parcial', limite: 'interseção de caixas (não tinta)' },
  colisao: { estado: 'mesma-medida', limite: 'só checkTextGeometry mede — repetir não é juiz' },
  'texto-cortado': { estado: 'mesma-medida', limite: 'idem' },
  'tinta-fora-da-caixa': { estado: 'mesma-medida', limite: 'idem' },
  'texto-pequeno': { estado: 'nao-coberta', limite: 'sem juiz externo' },
  'copy-completa': { estado: 'nao-coberta', limite: 'sem juiz externo' },
  identidade: { estado: 'nao-coberta', limite: 'sem juiz externo' },
  oclusao: { estado: 'nao-coberta', limite: 'só nos cenários injetados' },
  'fonte-nao-carregada': { estado: 'nao-coberta', limite: 'fontes declaradas presentes; fora do lote' },
}

export interface VereditoDoJuiz {
  regra: RegraJulgada
  estado: EstadoDoJuiz
  /** `true` viola, `false` não viola, `null` = não julgado (sem juiz, ou a regra não se aplica a esta peça). */
  viola: boolean | null
  camadas: string[]
  detalhe: string
}

/** O piso de interface do story no canvas canônico (CP5a), com a folga de 1 px: caixa que TOCA 188/224 reprova. */
export const PISO = { topo: 188, rodape: 224, folga: 1 } as const
const CANVAS_CANONICO = { width: 1080, height: 1920 }

const visivel = (l: Layer) => l.visible !== false
const ehTexto = (l: Layer) => (l.type === 'text' || l.type === 'rich-text') && visivel(l) && String(l.content ?? '').trim() !== ''
const ehLogo = (l: Layer) => l.type === 'logo' && visivel(l)
const caixa = (l: Layer): Rect => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })
const intersecao = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** Juiz PURO do piso (story, canvas canônico): texto e logo fora da faixa [188+1, 1920−224−1]. */
export function foraDoPiso(layers: Layer[], canvas: Canvas): string[] {
  if (canvas.width !== CANVAS_CANONICO.width || canvas.height !== CANVAS_CANONICO.height) return []
  const topo = PISO.topo + PISO.folga
  const base = canvas.height - PISO.rodape - PISO.folga
  return layers.filter((l) => ehTexto(l) || ehLogo(l)).filter((l) => l.position.y < topo || l.position.y + l.size.height > base).map((l) => l.id)
}

/** Juiz PURO da área segura: caixas de texto fora das margens do projeto. */
export function foraDaAreaSegura(layers: Layer[], canvas: Canvas, margens: { topo: number; rodape: number; lateral: number }): string[] {
  return layers
    .filter(ehTexto)
    .filter((l) => l.position.x < margens.lateral || l.position.x + l.size.width > canvas.width - margens.lateral || l.position.y < margens.topo || l.position.y + l.size.height > canvas.height - margens.rodape)
    .map((l) => l.id)
}

/** Juiz PURO da logo sobre texto: interseção de caixas > 0. */
export function logoSobreTexto(layers: Layer[]): string[] {
  const logos = layers.filter(ehLogo)
  const textos = layers.filter(ehTexto)
  return textos.filter((t) => logos.some((g) => intersecao(caixa(t), caixa(g)) > 0)).map((t) => t.id)
}

/** Quantas camadas NÃO-texto (shape, image que não é fundo, gradient…) estão ACIMA de algum texto na ordem de desenho — para a decisão 2. */
export function camadasNaoTextoAcimaDeTexto(layers: Layer[], canvas: Canvas): string[] {
  const ordenadas = [...layers].filter(visivel).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
  const fundo = (l: Layer) => l.type === 'image' && l.position.x <= 0 && l.position.y <= 0 && l.size.width >= canvas.width && l.size.height >= canvas.height
  const resultado: string[] = []
  ordenadas.forEach((l, i) => {
    if (ehTexto(l) || ehLogo(l) || fundo(l)) return
    const abaixo = ordenadas.slice(0, i).filter(ehTexto)
    if (abaixo.some((t) => intersecao(caixa(t), caixa(l)) > 0)) resultado.push(l.id)
  })
  return resultado
}

export interface EntradaDosJuizes {
  layers: Layer[]
  canvas: Canvas
  background: string
  formato: 'story' | 'feed' | 'quadrado'
  /** A verdade do assunto (fotos sintéticas) ou a região protegida anotada (fixture); `null` = não se aplica. */
  assuntoVerdade: Rect | null
  margens: { topo: number; rodape: number; lateral: number }
}

/** Todos os juízes sobre a peça final; os de pixel renderizam (2 renders para os textos + 1 para a logo). */
export async function julgar(e: EntradaDosJuizes): Promise<{ vereditos: VereditoDoJuiz[]; renders: number }> {
  const v: VereditoDoJuiz[] = []
  const temTexto = e.layers.some(ehTexto)
  let renders = 0
  const leituras = temTexto ? await leiturasDosTextos(e.layers, e.canvas, e.background) : []
  if (temTexto) renders += 2
  const semLeitura = leituras.filter((l) => !leituraDentroDoAlvo(l))
  v.push({ regra: 'texto-sem-leitura', estado: MATRIZ['texto-sem-leitura'].estado, viola: temTexto ? semLeitura.length > 0 : null, camadas: semLeitura.map((l) => l.camada), detalhe: semLeitura.map((l) => `${l.camada}: ${l.com} (alvo ${Math.round(l.alvo)})`).join('; ') })
  const pioram = tratamentosQuePioram(leituras)
  v.push({ regra: 'tratamento-piorou-leitura', estado: MATRIZ['tratamento-piorou-leitura'].estado, viola: temTexto ? pioram.length > 0 : null, camadas: pioram.map((l) => l.camada), detalhe: pioram.map((l) => `${l.camada}: ${l.sem} → ${l.com}`).join('; ') })
  const logo = e.layers.find(ehLogo)
  const leituraLogo = logo ? await leituraDaLogo(e.layers, e.canvas, e.background) : null
  if (logo) renders += 1
  v.push({ regra: 'logo-sem-leitura', estado: MATRIZ['logo-sem-leitura'].estado, viola: logo ? (leituraLogo ? !leituraLogo.legivel : true) : null, camadas: logo && leituraLogo && !leituraLogo.legivel ? [logo.id] : [], detalhe: leituraLogo ? `p10 ${leituraLogo.p10.toFixed(1)}` : logo ? 'logo sem leitura possível' : '' })
  const invadem = e.assuntoVerdade ? textosQueInvadem(e.layers, e.assuntoVerdade) : null
  v.push({ regra: 'texto-sobre-assunto', estado: MATRIZ['texto-sobre-assunto'].estado, viola: invadem ? invadem.length > 0 : null, camadas: (invadem ?? []).map((c) => c.camada), detalhe: (invadem ?? []).map((c) => `${c.camada}: ${(100 * c.cobertura).toFixed(0)} %`).join('; ') })
  const piso = e.formato === 'story' ? foraDoPiso(e.layers, e.canvas) : null
  v.push({ regra: 'piso-de-interface', estado: MATRIZ['piso-de-interface'].estado, viola: piso ? piso.length > 0 : null, camadas: piso ?? [], detalhe: piso?.join(', ') ?? 'não é story' })
  const segura = foraDaAreaSegura(e.layers, e.canvas, e.margens)
  v.push({ regra: 'fora-da-area-segura', estado: MATRIZ['fora-da-area-segura'].estado, viola: segura.length > 0, camadas: segura, detalhe: segura.join(', ') })
  const sobre = logoSobreTexto(e.layers)
  v.push({ regra: 'logo-sobre-texto', estado: MATRIZ['logo-sobre-texto'].estado, viola: sobre.length > 0, camadas: sobre, detalhe: sobre.join(', ') })
  for (const regra of ['colisao', 'texto-cortado', 'tinta-fora-da-caixa', 'texto-pequeno', 'copy-completa', 'identidade', 'oclusao', 'fonte-nao-carregada'] as const) {
    v.push({ regra, estado: MATRIZ[regra].estado, viola: null, camadas: [], detalhe: MATRIZ[regra].limite })
  }
  return { vereditos: v, renders }
}

/** As regras em que "falso APTO = 0" se afirma. */
export const regrasCobertas = () => REGRAS_JULGADAS.filter((r) => MATRIZ[r].estado === 'coberta' || MATRIZ[r].estado === 'coberta-parcial')
