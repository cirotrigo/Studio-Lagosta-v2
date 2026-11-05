/**
 * A REFERÊNCIA DE LAYOUT (F1 da direção por referência, 01/11/2026): a PÁGINA que o Ciro ajustou no editor vira
 * uma definição de arquétipo do CLIENTE — a geometria que o compositor lê é a dele, não a do catálogo.
 *
 * O que a referência FIXA (lido da página): os papéis presentes e a ordem de leitura; a CAIXA de cada papel de
 * texto (referência = zona: a busca espacial não move nada — a adaptação é limitada de propósito); o alinhamento
 * da manchete e o próprio de cada papel; a âncora; a caixa e o canto da logo; `linhasMax` = as linhas que a página
 * tem. O que CONTINUA com as outras autoridades: fonte, corpo e cor (a assinatura — o corpo do Ciro NÃO entra: a
 * escada desce do corpo da assinatura até caber na caixa); o piso do projeto (recorta a zona); o tratamento de
 * leitura (o compositor); a foto (a do pedido, em cover na peça inteira). Margem da marca e pilha da faixa ficam
 * DESLIGADAS na peça composta por referência (`compor.ts`): a caixa aprovada é a margem e o espaçamento.
 *
 * O que a página tem e a referência IGNORA volta DITO em `ignoradas`: formas (fios), gradientes, imagens além da
 * foto de fundo, textos sem papel, logos além da primeira. A F2 trata o corte explícito da foto; os acentos e o
 * gradiente da página ficam para depois.
 *
 * Módulo PURO: sem banco, sem render. A revisão aprovada (imutável) é gravada pela camada de serviço
 * (`../referencias.ts`); a `impressao` é a mesma dos arquétipos do catálogo.
 */
import type { Layer } from '@/types/template'
import { papelDoTexto } from '@/lib/font-combinations-capture'
import { assuntoEmPixels, type AssuntoNormalizado } from '../assunto-da-foto'
import { enquadramentoDaPagina } from '../defasagem'
import { formatoDaPaginaGravada } from '../formato'
import { DIMENSOES, type Alinhamento, type Papel } from '../spec'
import { camadaDaFotoDaPagina } from './da-pagina'
import { faixasDoArquetipo } from './faixas'
import { COR_HEX, CORPO_MINIMO_DA_REFERENCIA, FORMATOS_DO_ARQUETIPO, TRANSFORMACOES_DO_ESTILO, type ArquetipoDeLayout, type AssuntoNoQuadro, type EstiloDaReferencia, type Caixa, type CantoDaLogo, type FormatoDoArquetipo, type PapelDeTexto, type PapelNoArquetipo, type PosicaoDoPapel, type Zona } from './tipos'

/** O id da definição de uma página: `ref-<pageId>` (o cuid é a-z0-9, kebab-case válido). */
export const idDaReferencia = (pageId: string) => `ref-${pageId.toLowerCase()}`
export const ehIdDeReferencia = (id: string) => id.startsWith('ref-')

export const CODIGOS_DA_COMPILACAO = [
  'REFERENCIA_FORMATO_NAO_SUPORTADO',
  'REFERENCIA_SEM_FOTO',
  'REFERENCIA_SEM_HEADLINE',
  'REFERENCIA_SEM_LOGO',
  'REFERENCIA_ANCORA_INDEFINIDA',
  'REFERENCIA_ALINHAMENTO_INCOERENTE',
  'REFERENCIA_PAGINA_ILEGIVEL',
  'REFERENCIA_PAPEL_REPETIDO',
  'REFERENCIA_CAMADA_GIRADA',
  'REFERENCIA_FORA_DO_PISO',
  'REFERENCIA_CORPO_INVALIDO',
  'REFERENCIA_DIMENSOES_INCOMPATIVEIS',
  'REFERENCIA_ESTILO_INVALIDO',
  'REFERENCIA_ESTILO_NAO_SUPORTADO',
  'REFERENCIA_FAIXAS_DEMAIS',
] as const
export type CodigoDaCompilacao = (typeof CODIGOS_DA_COMPILACAO)[number]

export interface CamadaIgnorada {
  camada: string
  nome: string
  tipo: string
  motivo: 'forma' | 'gradiente' | 'foto-extra' | 'sem-papel' | 'logo-extra' | 'elemento' | 'invisivel-ou-vazia' | 'video-ou-outro'
}

export interface LeituraDaReferencia {
  formato: FormatoDoArquetipo
  foto: string
  logo: string
  /** F2c: `corpo` = o tamanho da fonte desenhado na camada (px), o teto da escada da peça por esta referência. F2d: `estilo`. */
  papeis: Array<{ papel: PapelDeTexto; camadas: string[]; linhas: number; caixa: Caixa; alinha: Alinhamento; corpo: number; estilo: EstiloDaReferencia }>
  ignoradas: CamadaIgnorada[]
  /** F2b: o assunto no quadro, ou por que a revisão ficou sem ele. Ausente quando quem compilou não trouxe o insumo. */
  assunto?: AssuntoNoQuadro | { ausente: MotivoDaAusencia }
}

/** Por que uma referência válida fica sem o assunto (e a peça por ela, sem assistência). */
export type MotivoDaAusencia = 'catalogo-indisponivel' | 'foto-sem-id' | 'fonte-nao-coerente' | 'nao-analisada' | 'sem-assunto' | 'sem-dimensoes' | 'transformacao-nao-representada' | 'fora-do-quadro'

/** O que a camada de serviço leu: a caixa na foto + as dimensões RENDERIZADAS pelo Drive, ou o motivo de não ter. */
export type InsumoDoAssunto = { caixa: AssuntoNormalizado; dimensoes: { width: number; height: number } } | { ausente: MotivoDaAusencia }

export type CompilacaoDaReferencia =
  | { ok: true; definicao: ArquetipoDeLayout; leitura: LeituraDaReferencia }
  | { ok: false; codigo: CodigoDaCompilacao; mensagem: string; detalhes?: Record<string, unknown> }

/** O piso do PROJETO (px) em que toda caixa da referência tem de caber: o que o compositor vai recortar. */
export interface PisoDaReferencia {
  margemH: number
  safeTopo: number
  safeRodape: number
}

export interface PaginaParaReferencia {
  id: string
  name?: string | null
  width: number
  height: number
  tags?: string[] | null
  layers: Layer[]
}

/** Quanto o centro de um texto centralizado pode fugir do eixo da peça e ainda ser simetrizado (px). */
export const TOLERANCIA_DO_EIXO_PX = 8
/** As frações saem com 4 casas (0,2 px no story): a definição é legível e a impressão, estável. */
const arredondar = (v: number) => Math.round(v * 1e4) / 1e4
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const FAIXA_DA_ANCORA = { topo: [0, 0.4], meio: [1 / 3, 2 / 3], rodape: [0.5, 1] } as const
const EPS = 1e-9

type Ret = { x: number; y: number; w: number; h: number }

function retangulo(c: Layer): Ret {
  return { x: c.position?.x ?? 0, y: c.position?.y ?? 0, w: c.size?.width ?? 0, h: c.size?.height ?? 0 }
}
/** Em frações da peça, recortado a 0..1 (o que passa da borda não é geometria da peça). */
function emFracoes(r: Ret, pagina: { width: number; height: number }): Caixa {
  const x0 = clamp01(r.x / pagina.width), y0 = clamp01(r.y / pagina.height)
  const x1 = clamp01((r.x + r.w) / pagina.width), y1 = clamp01((r.y + r.h) / pagina.height)
  return { x: arredondar(x0), y: arredondar(y0), w: arredondar(x1 - x0), h: arredondar(y1 - y0) }
}
const zonaDaCaixa = (c: Caixa): Zona => ({ xMin: c.x, xMax: arredondar(c.x + c.w), yMin: c.y, yMax: arredondar(c.y + c.h) })

function alinhamentoDe(c: Layer): Alinhamento {
  const a = (c.style as { textAlign?: string } | undefined)?.textAlign
  return a === 'center' ? 'centro' : a === 'right' ? 'direita' : 'esquerda'
}
const linhasDe = (c: Layer) => (typeof c.content === 'string' ? c.content.split('\n').filter((l) => l.trim() !== '').length : 0)

/**
 * F2d: o ESTILO desenhado numa camada de texto da referência — leitor PRÓPRIO (o da assinatura, `estiloDaCamada`, troca
 * cor ausente por branco e omite o peso: aqui a cor é validada antes de qualquer fallback e as ausências são explícitas).
 * O que a F2d não representa é RECUSADO, nunca descartado em silêncio: rich-text com runs (corpo, espaçamento, itálico,
 * decoração, stroke e sombra por trecho), `fontStyle` itálico, stroke e decoração, sombra com deslocamento horizontal.
 */
function estiloDaReferencia(c: Layer): { ok: true; estilo: EstiloDaReferencia } | { ok: false; codigo: 'REFERENCIA_ESTILO_INVALIDO' | 'REFERENCIA_ESTILO_NAO_SUPORTADO'; motivo: string } {
  const s = (c.style ?? {}) as Record<string, unknown>
  const naoSuportado = (motivo: string) => ({ ok: false as const, codigo: 'REFERENCIA_ESTILO_NAO_SUPORTADO' as const, motivo })
  const invalido = (motivo: string) => ({ ok: false as const, codigo: 'REFERENCIA_ESTILO_INVALIDO' as const, motivo })
  const runs = (c as { richTextStyles?: unknown }).richTextStyles
  if (c.type === 'rich-text' || (Array.isArray(runs) && runs.length > 0)) return naoSuportado('a camada é rich-text (trechos com estilo próprio): a F2d só representa o estilo da camada inteira')
  if (typeof s.fontStyle === 'string' && /italic/i.test(s.fontStyle)) return naoSuportado('itálico')
  if (typeof s.textDecoration === 'string' && s.textDecoration !== 'none') return naoSuportado(`decoração de texto "${s.textDecoration}"`)
  if (c.effects?.stroke?.enabled) return naoSuportado('contorno (stroke)')
  const shadow = c.effects?.shadow
  if (shadow?.enabled && shadow.shadowOffsetX) return naoSuportado(`sombra com deslocamento horizontal (${shadow.shadowOffsetX})`)
  const fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily.trim() : ''
  if (!fontFamily) return invalido('sem família de fonte')
  const color = typeof s.color === 'string' ? s.color.trim() : ''
  if (!COR_HEX.test(color)) return invalido(`cor "${String(s.color)}" não é #rrggbb`)
  const autoWrap = (c.textboxConfig as { autoWrap?: { lineHeight?: number } } | undefined)?.autoWrap
  const lineHeight = typeof autoWrap?.lineHeight === 'number' && autoWrap.lineHeight > 0 ? autoWrap.lineHeight : typeof s.lineHeight === 'number' && s.lineHeight > 0 ? s.lineHeight : null
  if (lineHeight === null) return invalido('sem entrelinha')
  const letterSpacing = s.letterSpacing === undefined ? 0 : typeof s.letterSpacing === 'number' && Number.isFinite(s.letterSpacing) ? s.letterSpacing : null
  if (letterSpacing === null) return invalido(`espaçamento "${String(s.letterSpacing)}" não é número`)
  const fontWeight =
    typeof s.fontWeight === 'number' && Number.isFinite(s.fontWeight) ? s.fontWeight : typeof s.fontWeight === 'string' && /^\d{3}$/.test(s.fontWeight.trim()) ? Number(s.fontWeight.trim()) : s.fontWeight === 'bold' ? 700 : s.fontWeight === undefined || s.fontWeight === 'normal' ? null : NaN
  if (Number.isNaN(fontWeight) || (fontWeight !== null && (!Number.isInteger(fontWeight) || fontWeight < 100 || fontWeight > 900))) return invalido(`peso "${String(s.fontWeight)}" não é 100–900`)
  const textTransform = s.textTransform === undefined ? 'none' : (TRANSFORMACOES_DO_ESTILO as readonly unknown[]).includes(s.textTransform) ? (s.textTransform as EstiloDaReferencia['textTransform']) : null
  if (textTransform === null) return invalido(`caixa "${String(s.textTransform)}" desconhecida`)
  const sombra = shadow?.enabled
    ? { color: shadow.shadowColor, blur: shadow.shadowBlur, offsetY: shadow.shadowOffsetY, opacity: shadow.shadowOpacity }
    : undefined
  if (sombra && (!COR_HEX.test(String(sombra.color)) || !(sombra.blur >= 0) || !Number.isFinite(sombra.offsetY) || !(sombra.opacity >= 0 && sombra.opacity <= 1))) return invalido('sombra fora do contrato (cor #rrggbb, blur ≥ 0, opacidade 0..1)')
  return { ok: true, estilo: { fontFamily, fontWeight, lineHeight, letterSpacing, textTransform, color, ...(sombra ? { sombra } : {}) } }
}

/**
 * F2b: o assunto da foto projetado no quadro pelo retângulo-fonte DESENHADO (a janela de `style.crop`, ou a âncora, sem
 * virar janela: o cover não tem o mínimo de 1% do crop manual): sem `janelaNaProporcao` — se a janela deforma a imagem, a
 * projeção deforma igual. Recorta à camada, translada por `position`, recorta à página. O que `resolveImageSourceRect` e
 * o retângulo da camada não representam (espelho, giro, máscara, canto arredondado) não é projetado.
 */
function assuntoNoQuadro(insumo: InsumoDoAssunto, camada: Layer, pagina: { width: number; height: number }): AssuntoNoQuadro | { ausente: MotivoDaAusencia } {
  if ('ausente' in insumo) return insumo
  const estilo = (camada.style ?? {}) as { objectFit?: unknown; flipH?: unknown; flipV?: unknown; mask?: { path?: unknown }; border?: { radius?: number } }
  const caixaDaCamada = { width: camada.size?.width ?? 0, height: camada.size?.height ?? 0 }
  const enquadramento = enquadramentoDaPagina([camada])
  if (estilo.objectFit !== 'cover' || estilo.flipH || estilo.flipV || estilo.mask?.path || estilo.border?.radius || (camada.rotation && Math.abs(camada.rotation) > EPS) || !enquadramento || !(caixaDaCamada.width > 0 && caixaDaCamada.height > 0)) {
    return { ausente: 'transformacao-nao-representada' }
  }
  const p = assuntoEmPixels(insumo.caixa, insumo.dimensoes, caixaDaCamada, 'janela' in enquadramento ? enquadramento.janela : enquadramento.corte)
  const noRetangulo = (r: Ret, x0: number, y0: number, x1: number, y1: number): Ret => {
    const ex = Math.max(r.x, x0), ey = Math.max(r.y, y0)
    return { x: ex, y: ey, w: Math.min(r.x + r.w, x1) - ex, h: Math.min(r.y + r.h, y1) - ey }
  }
  const naCamada = noRetangulo({ x: p.x, y: p.y, w: p.width, h: p.height }, 0, 0, caixaDaCamada.width, caixaDaCamada.height)
  const naPagina = noRetangulo({ ...naCamada, x: naCamada.x + (camada.position?.x ?? 0), y: naCamada.y + (camada.position?.y ?? 0) }, 0, 0, pagina.width, pagina.height)
  const areaProjetada = p.width * p.height
  const visivel = naCamada.w > 0 && naCamada.h > 0 && naPagina.w > 0 && naPagina.h > 0 && areaProjetada > 0 ? arredondar((naPagina.w * naPagina.h) / areaProjetada) : 0
  const caixa = emFracoes(naPagina, pagina)
  return caixa.w > 0 && caixa.h > 0 && visivel > 0 ? { caixa, visivel } : { ausente: 'fora-do-quadro' }
}

/** A caixa de um texto CENTRALIZADO simetrizada no eixo da peça (o validador exige o centro exato em 0,5). */
function simetrizar(c: Caixa): Caixa {
  const meia = Math.max(c.x + c.w - 0.5, 0.5 - c.x)
  return { x: arredondar(0.5 - meia), y: c.y, w: arredondar(2 * meia), h: c.h }
}

export function compilarReferencia(pagina: PaginaParaReferencia, args: { pageVersion: string; versao: number; piso?: PisoDaReferencia; assunto?: InsumoDoAssunto }): CompilacaoDaReferencia {
  const recusa = (codigo: CodigoDaCompilacao, mensagem: string, detalhes?: Record<string, unknown>): CompilacaoDaReferencia => ({ ok: false, codigo, mensagem, ...(detalhes ? { detalhes } : {}) })
  if (!Array.isArray(pagina.layers) || !(pagina.width > 0) || !(pagina.height > 0)) return recusa('REFERENCIA_PAGINA_ILEGIVEL', 'A página não tem camadas legíveis ou tamanho.')
  const formatoLido = formatoDaPaginaGravada(pagina)
  if (!FORMATOS_DO_ARQUETIPO.includes(formatoLido as FormatoDoArquetipo)) {
    return recusa('REFERENCIA_FORMATO_NAO_SUPORTADO', `A página é ${formatoLido}; a referência só compila story e feed.`, { formato: formatoLido })
  }
  const formato = formatoLido as FormatoDoArquetipo
  // F2c: a referência lê o CORPO da fonte em px — pixels literais só valem no canvas canônico do formato (uma página
  // 2160×3840 ou com tag trocada é recusada aqui, na compilação; a reprodução pela revisão persistida não revalida).
  const canonico = DIMENSOES[formato]
  if (pagina.width !== canonico.width || pagina.height !== canonico.height) {
    return recusa('REFERENCIA_DIMENSOES_INCOMPATIVEIS', `A página tem ${pagina.width}×${pagina.height} e o ${formato} é ${canonico.width}×${canonico.height}: a referência lê o corpo da fonte em px, então a página precisa estar no tamanho canônico do formato.`, { pagina: { width: pagina.width, height: pagina.height }, formato, canonico })
  }
  const ignoradas: CamadaIgnorada[] = []
  const ignorar = (c: Layer, motivo: CamadaIgnorada['motivo']) => ignoradas.push({ camada: c.id, nome: c.name ?? c.id, tipo: c.type, motivo })

  const camadaDaFoto = camadaDaFotoDaPagina(pagina.layers, pagina)
  const foto = camadaDaFoto?.fileUrl
  if (!foto) {
    return recusa('REFERENCIA_SEM_FOTO', 'A página não tem foto de fundo (camada bg-foto ou imagem cobrindo ≥ 90% da peça): a F1 só compila referência de foto inteira. Páginas de várias fotos ou de fundo liso ficam para a F2.', {
      imagens: pagina.layers.filter((c) => c.type === 'image' && c.visible !== false).map((c) => ({ camada: c.id, nome: c.name })),
    })
  }

  const porPapel = new Map<PapelDeTexto, { camadas: Layer[]; caixa: Ret; linhas: number; corpo: number; estilo: EstiloDaReferencia }>()
  let logo: Layer | null = null
  for (const c of pagina.layers) {
    if (c.visible === false) continue
    if (c.type === 'text' || c.type === 'rich-text') {
      if (typeof c.content !== 'string' || c.content.trim() === '') {
        ignorar(c, 'invisivel-ou-vazia')
        continue
      }
      const lido = papelDoTexto(c) as Papel | null
      const papel = (lido === 'headline2' ? 'headline' : lido) as PapelDeTexto | null
      if (!papel) {
        ignorar(c, 'sem-papel')
        continue
      }
      // Camada girada não é descrita pela caixa: a referência perderia a geometria que o Ciro desenhou. Recusa, não aproximação.
      if (c.rotation && Math.abs(c.rotation) > EPS) return recusa('REFERENCIA_CAMADA_GIRADA', `A camada "${c.name ?? c.id}" (${papel}) está girada (${c.rotation}°): a F1 só compila texto e logo sem rotação. Zere a rotação ou tire a camada.`, { camada: c.id, rotacao: c.rotation })
      const r = retangulo(c)
      const atual = porPapel.get(papel)
      // Uma camada por papel (F1 reduzida): duas manchetes (ou manchete + segunda voz), dois serviços etc. teriam
      // colunas, alinhamentos e vãos próprios que uma caixa envolvente apaga — recusa dita, não uma união.
      if (atual) {
        return recusa('REFERENCIA_PAPEL_REPETIDO', `O papel ${papel} aparece em mais de uma camada ("${atual.camadas[0].name ?? atual.camadas[0].id}" e "${c.name ?? c.id}"${lido === 'headline2' ? ', a segunda voz conta como manchete' : ''}): a F1 compila UMA camada por papel. Junte o texto numa camada só ou tire a repetida.`, { papel, camadas: [...atual.camadas.map((x) => x.id), c.id] })
      }
      // F2c: o corpo desenhado — inteiro, do mínimo que a materialização desenha até a altura da página. Fora disso recusa
      // (nunca arredonda nem aproxima): é o teto da escada da peça, e tem de ser o que a página mostra.
      const corpo = (c.style as { fontSize?: unknown } | undefined)?.fontSize
      if (!Number.isInteger(corpo) || (corpo as number) < CORPO_MINIMO_DA_REFERENCIA || (corpo as number) > pagina.height) {
        return recusa('REFERENCIA_CORPO_INVALIDO', `A camada "${c.name ?? c.id}" (${papel}) tem corpo ${String(corpo)} px: a referência lê o corpo em px inteiros, de ${CORPO_MINIMO_DA_REFERENCIA} até a altura da página (${pagina.height}). Ajuste o tamanho da fonte no editor.`, { camada: c.id, papel, corpo })
      }
      // F2d: o estilo desenhado — o que a F2d não representa recusa, dito.
      const e = estiloDaReferencia(c)
      if (e.ok === false) return recusa(e.codigo, `A camada "${c.name ?? c.id}" (${papel}): ${e.motivo}. ${e.codigo === 'REFERENCIA_ESTILO_NAO_SUPORTADO' ? 'A referência representa a camada de texto inteira (família, peso, entrelinha, espaçamento, caixa, cor e sombra vertical); simplifique a camada ou tire-a.' : 'Ajuste o estilo no editor.'}`, { camada: c.id, papel, motivo: e.motivo })
      porPapel.set(papel, { camadas: [c], caixa: r, linhas: linhasDe(c), corpo: corpo as number, estilo: e.estilo })
      continue
    }
    if (c.type === 'logo') {
      if (logo) ignorar(c, 'logo-extra')
      else {
        if (c.rotation && Math.abs(c.rotation) > EPS) return recusa('REFERENCIA_CAMADA_GIRADA', `A logo "${c.name ?? c.id}" está girada (${c.rotation}°): a F1 só compila a logo sem rotação.`, { camada: c.id, rotacao: c.rotation })
        logo = c
      }
      continue
    }
    if (c.type === 'image') {
      if (c !== camadaDaFoto) ignorar(c, 'foto-extra')
      continue
    }
    if (c.type === 'shape') ignorar(c, 'forma')
    else if (c.type === 'gradient' || c.type === 'gradient2') ignorar(c, 'gradiente')
    else if (c.type === 'element' || c.type === 'icon') ignorar(c, 'elemento')
    else ignorar(c, 'video-ou-outro')
  }
  const manchete = porPapel.get('headline')
  if (!manchete) return recusa('REFERENCIA_SEM_HEADLINE', 'A página não tem manchete: nomeie a camada do título "Título" (ou "headline") ou dê o papel no painel do compositor.', { ignoradas })
  if (!logo) return recusa('REFERENCIA_SEM_LOGO', 'A página não tem a logo (camada do tipo logo): toda referência carrega a logo da marca.', { ignoradas })

  // As caixas em frações; a centralizada no eixo da peça é simetrizada (até 8 px de fuga), senão é incoerente.
  const caixas = new Map<PapelDeTexto, { caixa: Caixa; alinha: Alinhamento; linhas: number; camadas: string[]; corpo: number; estilo: EstiloDaReferencia }>()
  for (const [papel, p] of porPapel) {
    const ordenadas = [...p.camadas].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
    const alinha = alinhamentoDe(ordenadas[0])
    let caixa = emFracoes(p.caixa, pagina)
    if (alinha === 'centro') {
      const fuga = Math.abs(caixa.x + caixa.w / 2 - 0.5) * pagina.width
      if (fuga > TOLERANCIA_DO_EIXO_PX) {
        return recusa('REFERENCIA_ALINHAMENTO_INCOERENTE', `O ${papel} é centralizado mas a caixa dele foge ${Math.round(fuga)} px do eixo da peça (tolerância ${TOLERANCIA_DO_EIXO_PX} px): centre a caixa ou alinhe o texto à esquerda/direita.`, { papel, caixa })
      }
      caixa = simetrizar(caixa)
    }
    caixas.set(papel, { caixa, alinha, linhas: Math.max(1, p.linhas), camadas: ordenadas.map((c) => c.id), corpo: p.corpo, estilo: p.estilo })
  }
  // A âncora é a faixa em que a manchete INTEIRA cai (as mesmas do validador); rodapé e topo antes do meio, que as
  // sobrepõe.
  const caixaDaManchete = caixas.get('headline')!.caixa
  const faixa = (['rodape', 'topo', 'meio'] as const).find((a) => caixaDaManchete.y >= FAIXA_DA_ANCORA[a][0] - EPS && caixaDaManchete.y + caixaDaManchete.h <= FAIXA_DA_ANCORA[a][1] + EPS)
  if (!faixa) {
    return recusa('REFERENCIA_ANCORA_INDEFINIDA', `A manchete (y ${caixaDaManchete.y.toFixed(3)}–${(caixaDaManchete.y + caixaDaManchete.h).toFixed(3)} da altura) não cai numa faixa de âncora: topo até 0,40, meio entre 0,33 e 0,67, rodapé a partir de 0,50.`, { caixa: caixaDaManchete })
  }

  // A ZONA de cada papel de texto é a união das caixas da FAIXA dele: os textos formam UMA faixa (com a logo, duas — o
  // teto da busca sobre foto) e o intervalo de deslocamento é zero — a posição aprovada é a única.
  // DUAS FAIXAS (05/11/2026, Ref 03 do Empório): quando a união dos textos não cabe na faixa da âncora (manchete no topo,
  // serviço e CTA no rodapé), os textos se partem no MAIOR vão vertical entre eles — duas faixas de texto. A união que
  // cabe fica como era: a referência já aprovada compila igual (mesma impressão).
  const uniao = (cs: Caixa[]) => cs.reduce((u, c) => ({ x: Math.min(u.x, c.x), y: Math.min(u.y, c.y), w: Math.max(u.x + u.w, c.x + c.w) - Math.min(u.x, c.x), h: Math.max(u.y + u.h, c.y + c.h) - Math.min(u.y, c.y) }))
  const porY = [...caixas.entries()].sort((a, b) => a[1].caixa.y - b[1].caixa.y)
  const uniaoDosTextos = uniao(porY.map(([, c]) => c.caixa))
  const [deAncora, ateAncora] = FAIXA_DA_ANCORA[faixa]
  let corte = porY.length // índice do primeiro papel da segunda faixa (= porY.length: uma faixa só)
  if (uniaoDosTextos.y < deAncora - EPS || uniaoDosTextos.y + uniaoDosTextos.h > ateAncora + EPS) {
    let base = -Infinity, maiorVao = 0
    porY.forEach(([, c], i) => {
      if (i > 0 && c.caixa.y - base > maiorVao) [maiorVao, corte] = [c.caixa.y - base, i]
      base = Math.max(base, c.caixa.y + c.caixa.h)
    })
  }
  const faixaDoPapel = new Map<PapelDeTexto, { yMin: number; yMax: number }>()
  for (const grupo of [porY.slice(0, corte), porY.slice(corte)].filter((g) => g.length > 0)) {
    const u = uniao(grupo.map(([, c]) => c.caixa))
    for (const [papel] of grupo) faixaDoPapel.set(papel, { yMin: arredondar(u.y), yMax: arredondar(u.y + u.h) })
  }

  const logoLida = emFracoes(retangulo(logo), pagina)
  // A logo no eixo da peça e na metade de cima é "superior-centro" (#16), não o canto que a fórmula sorteia em 0,5
  // (Ref 04 do Empório, 05/11). Simetrizada, porque o validador exige o centro exato.
  const logoNoEixo = Math.abs(logoLida.x + logoLida.w / 2 - 0.5) * pagina.width <= TOLERANCIA_DO_EIXO_PX && logoLida.y + logoLida.h / 2 < 0.5
  const caixaDaLogo = logoNoEixo ? simetrizar(logoLida) : logoLida
  // Toda caixa aprovada tem de estar DENTRO do piso do projeto: é o piso que recorta a zona na composição, e uma caixa
  // fora dele não tem posição válida (nem resgate, já que a zona é a própria caixa). Medido em px, ½ px de tolerância.
  if (args.piso) {
    const { margemH, safeTopo, safeRodape } = args.piso
    const W = pagina.width, H = pagina.height, TOL = 0.5
    const fora = (papel: string, c: Caixa) => {
      const x0 = c.x * W, x1 = (c.x + c.w) * W, y0 = c.y * H, y1 = (c.y + c.h) * H
      const lados = [
        ...(x0 < margemH - TOL ? [`esquerda ${Math.round(margemH - x0)} px`] : []),
        ...(x1 > W - margemH + TOL ? [`direita ${Math.round(x1 - (W - margemH))} px`] : []),
        ...(y0 < safeTopo - TOL ? [`topo ${Math.round(safeTopo - y0)} px`] : []),
        ...(y1 > H - safeRodape + TOL ? [`base ${Math.round(y1 - (H - safeRodape))} px`] : []),
      ]
      return lados.length ? { papel, caixa: c, lados } : null
    }
    const invasoes = [...[...caixas.entries()].map(([papel, c]) => fora(papel, c.caixa)), fora('logo', caixaDaLogo)].filter((x): x is NonNullable<typeof x> => !!x)
    if (invasoes.length > 0) {
      return recusa('REFERENCIA_FORA_DO_PISO', `A referência invade o piso do projeto (margem ${margemH}, topo ${safeTopo}, base ${safeRodape}): ${invasoes.map((i) => `${i.papel} passa ${i.lados.join(' e ')}`).join('; ')}. Afaste a caixa ou ajuste o piso do projeto e aprove de novo.`, { invasoes, piso: args.piso })
    }
  }
  const cx = caixaDaLogo.x + caixaDaLogo.w / 2, cy = caixaDaLogo.y + caixaDaLogo.h / 2
  const cantoDaMarca: CantoDaLogo = logoNoEixo ? 'superior-centro' : `${cy < 0.5 ? 'superior' : 'inferior'}-${cx < 0.5 ? 'esquerdo' : 'direito'}`
  const alinhaDaManchete = caixas.get('headline')!.alinha

  const ordem = [...caixas.entries()].sort((a, b) => a[1].caixa.y - b[1].caixa.y || a[1].caixa.x - b[1].caixa.x)
  const papeis: PapelNoArquetipo[] = ordem.map(([papel, c], i) => ({
    papel,
    obrigatorio: papel === 'headline',
    ordemDeLeitura: i,
    ...(papel !== 'headline' && c.alinha !== alinhaDaManchete ? { alinha: c.alinha } : {}),
  }))
  papeis.push({ papel: 'logo', obrigatorio: true, ordemDeLeitura: ordem.length })

  const posicoes: Partial<Record<PapelDeTexto | 'logo', PosicaoDoPapel>> = {}
  const limitesDeTexto: Partial<Record<PapelDeTexto, { linhasMax: number }>> = {}
  const corpos: Partial<Record<PapelDeTexto, number>> = {}
  const estilos: Partial<Record<PapelDeTexto, EstiloDaReferencia>> = {}
  for (const [papel, c] of caixas) {
    posicoes[papel] = { referencia: c.caixa, zona: { ...zonaDaCaixa(c.caixa), ...faixaDoPapel.get(papel)! } }
    limitesDeTexto[papel] = { linhasMax: c.linhas }
    corpos[papel] = c.corpo
    estilos[papel] = c.estilo
  }
  posicoes.logo = { referencia: caixaDaLogo, zona: zonaDaCaixa(caixaDaLogo) }

  const assunto = args.assunto ? assuntoNoQuadro(args.assunto, camadaDaFoto!, pagina) : undefined
  const definicao: ArquetipoDeLayout = {
    id: idDaReferencia(pagina.id),
    versao: args.versao,
    codigoTaxonomico: 'REF-01',
    nome: `Referência · ${(pagina.name ?? pagina.id).trim() || pagina.id}`,
    papeis,
    preferencias: { ancora: faixa, alinha: alinhaDaManchete, cantoDaMarca },
    formatos: { [formato]: { papeis: posicoes, limitesDeTexto, corpos, estilos, ...(assunto && 'caixa' in assunto ? { assunto } : {}) } } as unknown as ArquetipoDeLayout['formatos'],
    referencia: { pageId: pagina.id, pageVersion: args.pageVersion, formato },
  }
  // Duas faixas de texto e a logo longe das duas são TRÊS faixas: a busca sobre foto só avalia duas (LIMITES_DA_BUSCA),
  // e a peça seria recusada na composição. Recusa aqui, dita.
  const faixasDaPeca = faixasDoArquetipo(definicao, formato)
  if (faixasDaPeca.length > 2) {
    return recusa('REFERENCIA_FAIXAS_DEMAIS', `A referência tem ${faixasDaPeca.length} faixas (${faixasDaPeca.map((f) => f.join(' + ')).join('; ')}): a composição sobre foto aceita duas. Encoste a logo numa das faixas de texto ou junte os textos.`, { faixas: faixasDaPeca })
  }
  return {
    ok: true,
    definicao,
    leitura: {
      formato,
      foto,
      logo: logo.id,
      papeis: ordem.map(([papel, c]) => ({ papel, camadas: c.camadas, linhas: c.linhas, caixa: c.caixa, alinha: c.alinha, corpo: c.corpo, estilo: c.estilo })),
      ignoradas,
      ...(assunto ? { assunto } : {}),
    },
  }
}
