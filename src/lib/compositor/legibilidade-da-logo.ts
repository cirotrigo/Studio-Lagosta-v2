/**
 * A LEGIBILIDADE DA LOGO contra o fundo efetivo (CP3, 15/10/2026).
 *
 * As provas do CP2B mostraram a fragilidade seguinte: texto e fotografia
 * certos, e a logo ainda sem leitura — cinza sobre cinza. A escolha de canto
 * considerava calma, luminância da foto, colisão e preferência; nada disso
 * PROVA que a logo lê. Aqui a prova é mecânica e REGIONAL (decisão do owner,
 * 13/10/2026): para os pixels VISÍVEIS da logo (alfa ≥ `ALFA_VISIVEL_DA_LOGO`),
 * a diferença |luz da logo − luz do fundo| pixel a pixel, no MESMO pixel, tem
 * de atingir `LIMIAR_DE_CONTRASTE_DA_LOGO` no percentil `PERCENTIL_DA_LOGO`
 * (p10): ~90% da logo lê. A média, a proporção de pixels no limiar e a
 * quantidade avaliada são DIAGNÓSTICO — a média não salva uma logo cujo p10
 * falha (o monograma da piloto passava na média, ≈46, e sumia no véu creme).
 *
 * O fundo medido é o EFETIVO: a peça renderizada pelo renderer de produção
 * (foto no corte, fundo, gradientes e tratamentos, tudo o que fica sob a
 * logo), SEM a própria logo e sem a tinta dos textos (`fundoSemALogo`). Nunca
 * a média da foto, a média do canto, um pixel ou uma cor teórica.
 *
 * A luz é a Rec.709 sobre o sRGB (`luz709`), a mesma do oráculo do CP0 e de
 * `luminanciaDaLogo` em `src/lib/ai/logo-compositor.ts`, de onde o limiar 45
 * e o alfa 128 vêm — ali os dois eram literais; aqui viram constantes com
 * nome e teste.
 *
 * Variantes: NENHUMA é fabricada. Nada de inverter, tingir, recolorir ou
 * sintetizar negativa. Entram só as variantes REALMENTE autorizadas
 * (`variantesAutorizadasDaLogo`): a logo que a página de assinatura desenha
 * (a explícita) e as linhas `Logo` com `isProjectLogo = true`. As demais
 * linhas da tabela misturam parceiro, campanha, co-branding e asset antigo
 * (auditoria de 15/10/2026) e NÃO entram. Sem variante legível, a composição
 * com arquétipo recusa com `LOGO_SEM_VARIANTE_LEGIVEL`; asset que não carregou
 * é outro código, `LOGO_INDISPONIVEL` (falha de download ou decodificação
 * nunca vira "sem contraste").
 *
 * `medirLegibilidadeDaLogo` e `escolherLogoLegivel` são PURAS (rasters em
 * memória). As funções de E/S (`bytesDaLogo`, `rasterDaLogo`, `fundoSemALogo`)
 * ficam separadas e importam o renderer e o download só quando chamadas.
 * Este módulo não importa `@/lib/db`.
 */

import type { Layer } from '@/types/template'
import type { Rect } from '@/lib/creatives/halo/halo'
import { CreativeError } from '@/lib/creatives/errors'
import type { Canto } from './spec'

// ─── Contrato ───────────────────────────────────────────────────────────────

/** Pixel da logo que CONTA: alfa (0..255) a partir deste valor. A regra de `luminanciaDaLogo` (logo-compositor). */
export const ALFA_VISIVEL_DA_LOGO = 128
/** Contraste mínimo |luz da logo − luz do fundo| (0..255) que o percentil tem de atingir. */
export const LIMIAR_DE_CONTRASTE_DA_LOGO = 45
/** O percentil que decide: p10 — ~90% dos pixels visíveis da logo têm de ler. */
export const PERCENTIL_DA_LOGO = 0.1

/** Nenhuma variante autorizada lê em nenhuma posição autorizada. Determinístico. */
export const LOGO_SEM_VARIANTE_LEGIVEL = 'LOGO_SEM_VARIANTE_LEGIVEL'
/** O arquivo da logo não carregou ou não decodificou: a leitura não foi medida. Transitório. */
export const LOGO_INDISPONIVEL = 'LOGO_INDISPONIVEL'

export type OrigemDaVariante = 'pagina' | 'projeto'

/**
 * Uma logo que PODE ser desenhada: de onde veio e o arquivo. A URL do Blob não é identidade estável (o store já
 * mudou uma vez e um re-upload muda a URL): a linha `Logo` leva o `logoId`, a camada da página leva `camada` (o id
 * da camada na página de assinatura). A recomposição casa primeiro pelo identificador, depois pela URL.
 */
export interface VarianteDaLogo {
  origem: OrigemDaVariante
  url: string
  /** `Logo.id`, quando a variante é uma linha do projeto. */
  logoId?: number
  /** O id da camada na página de assinatura, quando a variante é a explícita. */
  camada?: string
}

/** A mesma variante: pelo identificador estável quando os dois têm, senão pela URL. */
export function mesmaVariante(a: VarianteDaLogo, b: VarianteDaLogo): boolean {
  if (a.logoId !== undefined && b.logoId !== undefined) return a.logoId === b.logoId
  if (a.camada !== undefined && b.camada !== undefined && a.origem === 'pagina' && b.origem === 'pagina') return a.camada === b.camada || a.url === b.url
  return a.url === b.url
}

/** Raster RGBA em resolução da peça (a logo já no tamanho em que é desenhada). */
export interface RasterRGBA {
  data: Buffer
  width: number
  height: number
  channels: 4
}

/** Raster RGB da peça inteira, em resolução cheia, sem alfa. */
export interface RasterRGB {
  data: Buffer
  width: number
  height: number
  channels: 3
}

export interface MedidaDaLogo {
  /** Pixels visíveis da logo que caíram dentro do fundo. */
  pixelsAvaliados: number
  /** O CRITÉRIO: p10 da diferença pixel a pixel. */
  contrasteP10: number
  /** Diagnóstico: média da diferença. Não decide. */
  contrasteMedio: number
  /** Diagnóstico: fração dos pixels avaliados com diferença ≥ limiar. */
  proporcaoAcima45: number
  /** Diagnóstico: luz média da logo e do fundo sob ela. */
  luzDaLogo: number
  luzDoFundo: number
  /** `contrasteP10 >= LIMIAR_DE_CONTRASTE_DA_LOGO`. */
  legivel: boolean
}

export const luz709 = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * A medida pura: a logo (RGBA, no tamanho desenhado) pousada em `posicao`
 * sobre o fundo (RGB da peça). `null` quando nenhum pixel visível da logo cai
 * no fundo — logo toda transparente, ou fora do canvas — que não é "legível"
 * nem "ilegível": é "sem o que medir".
 */
export function medirLegibilidadeDaLogo(args: { logo: RasterRGBA; posicao: { x: number; y: number }; fundo: RasterRGB }): MedidaDaLogo | null {
  const { logo, fundo } = args
  const x0 = Math.round(args.posicao.x)
  const y0 = Math.round(args.posicao.y)
  const diferencas: number[] = []
  let somaLogo = 0
  let somaFundo = 0
  for (let y = 0; y < logo.height; y++) {
    const Y = y0 + y
    if (Y < 0 || Y >= fundo.height) continue
    for (let x = 0; x < logo.width; x++) {
      const X = x0 + x
      if (X < 0 || X >= fundo.width) continue
      const p = (y * logo.width + x) * 4
      if (logo.data[p + 3] < ALFA_VISIVEL_DA_LOGO) continue
      const q = (Y * fundo.width + X) * 3
      const lLogo = luz709(logo.data[p], logo.data[p + 1], logo.data[p + 2])
      const lFundo = luz709(fundo.data[q], fundo.data[q + 1], fundo.data[q + 2])
      somaLogo += lLogo
      somaFundo += lFundo
      diferencas.push(Math.abs(lLogo - lFundo))
    }
  }
  const n = diferencas.length
  if (n === 0) return null
  diferencas.sort((a, b) => a - b)
  const p10 = diferencas[Math.max(0, Math.ceil(PERCENTIL_DA_LOGO * n) - 1)]
  const arred = (v: number) => Number(v.toFixed(2))
  // O p10 que DECIDE é o que se exibe (2 casas): 44,9974 não pode sair "45.00, ilegível".
  const contrasteP10 = arred(p10)
  return {
    pixelsAvaliados: n,
    contrasteP10,
    contrasteMedio: arred(diferencas.reduce((s, d) => s + d, 0) / n),
    // A mesma régua do p10: a diferença arredondada a 2 casas (44,9974 conta como 45, como na decisão).
    proporcaoAcima45: arred(diferencas.filter((d) => arred(d) >= LIMIAR_DE_CONTRASTE_DA_LOGO).length / n),
    luzDaLogo: arred(somaLogo / n),
    luzDoFundo: arred(somaFundo / n),
    legivel: contrasteP10 >= LIMIAR_DE_CONTRASTE_DA_LOGO,
  }
}

// ─── Variantes autorizadas ──────────────────────────────────────────────────

/**
 * As variantes que PODEM entrar, em ordem de prioridade e sem repetição de
 * arquivo: a explícita (a logo que a página de assinatura desenha — a escolha
 * humana da peça) primeiro; depois as linhas `Logo` marcadas `isProjectLogo`
 * (a escolha humana do projeto), na ordem dada (id crescente). Linhas sem a
 * marca NÃO são variantes: podem ser parceiro, campanha, co-branding, asset
 * antigo — e nenhuma semântica no banco diz o contrário.
 */
export function variantesAutorizadasDaLogo(args: { explicita: VarianteDaLogo | null; doProjeto: ReadonlyArray<{ id?: number; fileUrl: string; isProjectLogo: boolean }> }): VarianteDaLogo[] {
  const lista: VarianteDaLogo[] = []
  const vistas = new Set<string>()
  const entra = (v: VarianteDaLogo) => {
    if (!v.url || vistas.has(v.url)) return
    vistas.add(v.url)
    lista.push(v)
  }
  if (args.explicita) entra(args.explicita)
  // A marca tem de ser POSITIVA: linha sem ela (ou sem o campo) nunca é variante — quem monta a lista passa o flag.
  for (const l of args.doProjeto) if (l.isProjectLogo === true) entra({ origem: 'projeto', url: l.fileUrl, ...(l.id !== undefined ? { logoId: l.id } : {}) })
  return lista
}

// ─── Escolha ────────────────────────────────────────────────────────────────

export interface PosicaoDaLogo {
  canto: Canto
  rect: Rect
}

export interface VarianteCarregada {
  variante: VarianteDaLogo
  /** O arquivo decodificado, ou o motivo de não ter carregado (a avaliação diz `indisponivel`). */
  bytes: Buffer | null
  indisponivel?: string
  /** altura / largura do arquivo. */
  razao: number | null
}

export interface AvaliacaoDaLogo {
  variante: VarianteDaLogo
  canto: Canto
  posicao: Rect
  medida: MedidaDaLogo | null
  estado: 'legivel' | 'ilegivel' | 'sem-pixels' | 'indisponivel' | 'fora-da-area'
  motivo?: string
}

export interface EscolhaDaLogo {
  escolha: AvaliacaoDaLogo | null
  avaliacoes: AvaliacaoDaLogo[]
  /** Alguma variante não carregou: "nenhuma lê" não pode ser afirmado. */
  indisponiveis: VarianteDaLogo[]
}

/**
 * A escolha DETERMINÍSTICA entre variantes autorizadas × posições
 * autorizadas, já medidas: primeiro ELIMINA o que não lê (p10 < limiar), o
 * que não tem pixel no fundo e o que não carregou; só depois a preferência —
 * a ordem das variantes (a explícita primeiro) manda, e dentro da mesma
 * variante a ordem das posições (a atual ou congelada primeiro, depois as
 * mais calmas). A variante explícita que PASSA é mantida mesmo que outra
 * tenha p10 maior.
 */
export function escolherLogoLegivel(avaliacoes: AvaliacaoDaLogo[]): EscolhaDaLogo {
  const escolha = avaliacoes.find((a) => a.estado === 'legivel') ?? null
  const indisponiveis = [...new Map(avaliacoes.filter((a) => a.estado === 'indisponivel').map((a) => [a.variante.url, a.variante])).values()]
  return { escolha, avaliacoes, indisponiveis }
}

// ─── E/S: bytes, raster e fundo ─────────────────────────────────────────────

/**
 * Os bytes do arquivo da logo: data URL decodificada aqui; URL http(s) pelo
 * mesmo download das fontes. Falha → `LOGO_INDISPONIVEL` (503, transitório).
 */
export async function bytesDaLogo(url: string): Promise<Buffer> {
  try {
    if (url.startsWith('data:')) {
      const virgula = url.indexOf(',')
      if (virgula < 0) throw new Error('data URL sem conteúdo')
      return Buffer.from(url.slice(virgula + 1), /;base64/i.test(url.slice(0, virgula)) ? 'base64' : 'utf8')
    }
    const { fetchBuffer } = await import('@/lib/posts/register-project-fonts')
    return await fetchBuffer(url)
  } catch (erro) {
    throw new CreativeError(LOGO_INDISPONIVEL, `A logo não pôde ser baixada (${(erro as Error).message}): a leitura dela não foi medida.`, 503, { url, etapa: 'download' })
  }
}

/** A proporção (altura / largura) do arquivo. Falha de decodificação → `LOGO_INDISPONIVEL`. */
export async function razaoDoArquivo(bytes: Buffer, url?: string): Promise<number> {
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(bytes).metadata()
    if (!meta.width || !meta.height) throw new Error('imagem sem dimensões')
    return meta.height / meta.width
  } catch (erro) {
    throw new CreativeError(LOGO_INDISPONIVEL, `A logo não pôde ser decodificada (${(erro as Error).message}): a leitura dela não foi medida.`, 503, { ...(url ? { url } : {}), etapa: 'decodificacao' })
  }
}

/**
 * A logo COMO O RENDER A DESENHA na caixa: esticada para `tamanho` (o
 * `objectFit: contain` do editor e do render não faz letterbox —
 * `image-fit.ts`), com o alfa preservado. Falha → `LOGO_INDISPONIVEL`.
 */
export async function rasterDaLogo(bytes: Buffer, tamanho: { width: number; height: number }, url?: string): Promise<RasterRGBA> {
  const w = Math.max(1, Math.round(tamanho.width))
  const h = Math.max(1, Math.round(tamanho.height))
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(bytes).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    if (info.channels !== 4) throw new Error(`raster com ${info.channels} canais`)
    return { data, width: info.width, height: info.height, channels: 4 }
  } catch (erro) {
    throw new CreativeError(LOGO_INDISPONIVEL, `A logo não pôde ser decodificada (${(erro as Error).message}): a leitura dela não foi medida.`, 503, { ...(url ? { url } : {}), etapa: 'decodificacao' })
  }
}

/**
 * O fundo EFETIVO: a peça renderizada pelo renderer de produção sem as
 * camadas de logo indicadas (por padrão, toda camada `type: 'logo'`) e sem a
 * tinta dos textos — foto no corte, fundo, gradientes e tratamentos ficam.
 * Resolução cheia da peça. Lança o erro do render (quem chama diz "não
 * medida", nunca "sem contraste").
 */
export async function fundoSemALogo(args: { layers: Layer[]; canvas: { width: number; height: number }; background: string; semAsCamadas?: ReadonlySet<string> }): Promise<RasterRGB> {
  // Fundo transparente (ou com alfa) não é um fundo: o render não pinta o canvas e `removeAlpha` daria PRETO — a
  // medida mentiria. A peça publicada é achatada por quem a exibe; não há como medir honestamente.
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(args.background.trim())) throw new Error(`fundo da peça não é uma cor sólida (${args.background}): a leitura da logo não pode ser medida`)
  const { semTinta } = await import('./regua')
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const fora = args.semAsCamadas
  const camadas = args.layers.filter((l) => (fora ? !fora.has(l.id) : l.type !== 'logo'))
  const png = await new CanvasRenderer(args.canvas.width, args.canvas.height).renderDesign({ canvas: { ...args.canvas, backgroundColor: args.background }, layers: semTinta(camadas) }, {})
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 3) throw new Error(`fundo com ${info.channels} canais`)
  return { data, width: info.width, height: info.height, channels: 3 }
}

/** A mesma medida, a partir dos bytes do arquivo (E/S + a medida pura). */
export async function medirLogoNoFundo(args: { bytes: Buffer; rect: Rect; fundo: RasterRGB; url?: string }): Promise<MedidaDaLogo | null> {
  const logo = await rasterDaLogo(args.bytes, { width: args.rect.width, height: args.rect.height }, args.url)
  return medirLegibilidadeDaLogo({ logo, posicao: { x: args.rect.x, y: args.rect.y }, fundo: args.fundo })
}

/**
 * A leitura de cada logo SOLTA de uma peça já desenhada (o revisor): cada uma medida contra o fundo efetivo sem ela.
 * Arquivo que não carrega vira `indisponivel` (dito), nunca "sem contraste"; o render que falha lança, e quem chama
 * marca a regra como não avaliada.
 */
export async function medirLogosDaPeca(args: {
  layers: Layer[]
  canvas: { width: number; height: number }
  background: string
  logos: Layer[]
  /** A origem da variante desenhada, quando a composição a gravou (url → origem). */
  origens?: ReadonlyMap<string, OrigemDaVariante>
}): Promise<Array<{ camada: string; variante: { url: string; origem?: OrigemDaVariante }; posicao: Rect; medida: MedidaDaLogo | null; estado: 'medida' | 'indisponivel' | 'sem-pixels' | 'fora-do-contrato'; motivo?: string }>> {
  const saida: Awaited<ReturnType<typeof medirLogosDaPeca>> = []
  for (const logo of args.logos) {
    const url = typeof logo.fileUrl === 'string' ? logo.fileUrl : ''
    const posicao: Rect = { x: logo.position.x, y: logo.position.y, width: logo.size.width, height: logo.size.height }
    const origem = args.origens?.get(url)
    const variante = { url, ...(origem ? { origem } : {}) }
    if (!url) {
      saida.push({ camada: logo.id, variante, posicao, medida: null, estado: 'indisponivel', motivo: 'a camada não tem arquivo' })
      continue
    }
    // A medida supõe a logo desenhada inteira, opaca e esticada na caixa (o que o compositor produz). Camada editada à
    // mão com rotação, opacidade, recorte ou `cover` é desenhada de outro jeito: medir a caixa mentiria — dito.
    const foraDoContrato = foraDoContratoDoDesenho(logo)
    if (foraDoContrato) {
      saida.push({ camada: logo.id, variante, posicao, medida: null, estado: 'fora-do-contrato', motivo: foraDoContrato })
      continue
    }
    const fundo = await fundoSemALogo({ layers: args.layers, canvas: args.canvas, background: args.background, semAsCamadas: new Set([logo.id]) })
    try {
      const bytes = await bytesDaLogo(url)
      const medida = await medirLogoNoFundo({ bytes, rect: posicao, fundo, url })
      saida.push(medida ? { camada: logo.id, variante, posicao, medida, estado: 'medida' } : { camada: logo.id, variante, posicao, medida: null, estado: 'sem-pixels', motivo: 'nenhum pixel visível da logo sobre o fundo' })
    } catch (erro) {
      saida.push({ camada: logo.id, variante, posicao, medida: null, estado: 'indisponivel', motivo: erro instanceof Error ? erro.message : String(erro) })
    }
  }
  return saida
}

/** O motivo de a caixa da camada não representar o desenho (rotação, opacidade, recorte, `cover`, espelho), ou `null`. */
export function foraDoContratoDoDesenho(logo: Layer): string | null {
  const estilo = (logo.style ?? {}) as { opacity?: unknown; objectFit?: unknown; crop?: unknown; flipX?: unknown; flipY?: unknown }
  const motivos: string[] = []
  if (typeof logo.rotation === 'number' && logo.rotation % 360 !== 0) motivos.push(`rotação ${logo.rotation}°`)
  if (typeof estilo.opacity === 'number' && estilo.opacity < 1) motivos.push(`opacidade ${estilo.opacity}`)
  if (estilo.objectFit === 'cover') motivos.push('objectFit cover (recorte)')
  if (estilo.crop && typeof estilo.crop === 'object') motivos.push('recorte manual')
  if (estilo.flipX === true || estilo.flipY === true) motivos.push('espelhada')
  return motivos.length > 0 ? `a camada é desenhada com ${motivos.join(', ')}: a medida da caixa não representa o desenho` : null
}

/** Resumo para avisos e mensagens de erro. */
export function resumoDaMedida(m: MedidaDaLogo | null): string {
  if (!m) return 'sem pixel visível sobre o fundo'
  return `p10 ${m.contrasteP10} (critério ≥ ${LIMIAR_DE_CONTRASTE_DA_LOGO}), média ${m.contrasteMedio}, ${Math.round(100 * m.proporcaoAcima45)}% dos ${m.pixelsAvaliados} pixels no limiar`
}
