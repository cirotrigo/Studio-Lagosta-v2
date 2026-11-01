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
import { formatoDaPaginaGravada } from '../formato'
import type { Alinhamento, Papel } from '../spec'
import { fotoDaPaginaParaLayout } from './da-pagina'
import { FORMATOS_DO_ARQUETIPO, type ArquetipoDeLayout, type Caixa, type CantoDaLogo, type FormatoDoArquetipo, type PapelDeTexto, type PapelNoArquetipo, type PosicaoDoPapel, type Zona } from './tipos'

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
  papeis: Array<{ papel: PapelDeTexto; camadas: string[]; linhas: number; caixa: Caixa; alinha: Alinhamento }>
  ignoradas: CamadaIgnorada[]
}

export type CompilacaoDaReferencia =
  | { ok: true; definicao: ArquetipoDeLayout; leitura: LeituraDaReferencia }
  | { ok: false; codigo: CodigoDaCompilacao; mensagem: string; detalhes?: Record<string, unknown> }

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
function uniao(a: Ret, b: Ret): Ret {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
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

/** A caixa de um texto CENTRALIZADO simetrizada no eixo da peça (o validador exige o centro exato em 0,5). */
function simetrizar(c: Caixa): Caixa {
  const meia = Math.max(c.x + c.w - 0.5, 0.5 - c.x)
  return { x: arredondar(0.5 - meia), y: c.y, w: arredondar(2 * meia), h: c.h }
}

export function compilarReferencia(pagina: PaginaParaReferencia, args: { pageVersion: string; versao: number }): CompilacaoDaReferencia {
  const recusa = (codigo: CodigoDaCompilacao, mensagem: string, detalhes?: Record<string, unknown>): CompilacaoDaReferencia => ({ ok: false, codigo, mensagem, ...(detalhes ? { detalhes } : {}) })
  if (!Array.isArray(pagina.layers) || !(pagina.width > 0) || !(pagina.height > 0)) return recusa('REFERENCIA_PAGINA_ILEGIVEL', 'A página não tem camadas legíveis ou tamanho.')
  const formatoLido = formatoDaPaginaGravada(pagina)
  if (!FORMATOS_DO_ARQUETIPO.includes(formatoLido as FormatoDoArquetipo)) {
    return recusa('REFERENCIA_FORMATO_NAO_SUPORTADO', `A página é ${formatoLido}; a referência só compila story e feed.`, { formato: formatoLido })
  }
  const formato = formatoLido as FormatoDoArquetipo
  const ignoradas: CamadaIgnorada[] = []
  const ignorar = (c: Layer, motivo: CamadaIgnorada['motivo']) => ignoradas.push({ camada: c.id, nome: c.name ?? c.id, tipo: c.type, motivo })

  const foto = fotoDaPaginaParaLayout(pagina.layers, pagina)
  if (!foto) {
    return recusa('REFERENCIA_SEM_FOTO', 'A página não tem foto de fundo (camada bg-foto ou imagem cobrindo ≥ 90% da peça): a F1 só compila referência de foto inteira. Páginas de várias fotos ou de fundo liso ficam para a F2.', {
      imagens: pagina.layers.filter((c) => c.type === 'image' && c.visible !== false).map((c) => ({ camada: c.id, nome: c.name })),
    })
  }

  const porPapel = new Map<PapelDeTexto, { camadas: Layer[]; caixa: Ret; linhas: number }>()
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
      const r = retangulo(c)
      const atual = porPapel.get(papel)
      porPapel.set(papel, atual ? { camadas: [...atual.camadas, c], caixa: uniao(atual.caixa, r), linhas: atual.linhas + linhasDe(c) } : { camadas: [c], caixa: r, linhas: linhasDe(c) })
      continue
    }
    if (c.type === 'logo') {
      if (logo) ignorar(c, 'logo-extra')
      else logo = c
      continue
    }
    if (c.type === 'image') {
      if (c.fileUrl !== foto) ignorar(c, 'foto-extra')
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
  const caixas = new Map<PapelDeTexto, { caixa: Caixa; alinha: Alinhamento; linhas: number; camadas: string[] }>()
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
    caixas.set(papel, { caixa, alinha, linhas: Math.max(1, p.linhas), camadas: ordenadas.map((c) => c.id) })
  }
  // A âncora é a faixa em que a manchete INTEIRA cai (as mesmas do validador); rodapé e topo antes do meio, que as
  // sobrepõe.
  const caixaDaManchete = caixas.get('headline')!.caixa
  const faixa = (['rodape', 'topo', 'meio'] as const).find((a) => caixaDaManchete.y >= FAIXA_DA_ANCORA[a][0] - EPS && caixaDaManchete.y + caixaDaManchete.h <= FAIXA_DA_ANCORA[a][1] + EPS)
  if (!faixa) {
    return recusa('REFERENCIA_ANCORA_INDEFINIDA', `A manchete (y ${caixaDaManchete.y.toFixed(3)}–${(caixaDaManchete.y + caixaDaManchete.h).toFixed(3)} da altura) não cai numa faixa de âncora: topo até 0,40, meio entre 0,33 e 0,67, rodapé a partir de 0,50.`, { caixa: caixaDaManchete })
  }

  // A ZONA de cada papel de texto é a união das caixas de texto: os textos formam UMA faixa (com a logo, duas — o
  // teto da busca sobre foto) e o intervalo de deslocamento é zero — a posição aprovada é a única.
  const uniaoDosTextos = [...caixas.values()].map((c) => c.caixa).reduce((u, c) => ({ x: Math.min(u.x, c.x), y: Math.min(u.y, c.y), w: Math.max(u.x + u.w, c.x + c.w) - Math.min(u.x, c.x), h: Math.max(u.y + u.h, c.y + c.h) - Math.min(u.y, c.y) }))
  // Na horizontal a zona é a própria caixa (o alinhamento próprio prende a referência à borda ou ao eixo da zona).
  const zonaDosTextos: Zona = { xMin: arredondar(uniaoDosTextos.x), xMax: arredondar(uniaoDosTextos.x + uniaoDosTextos.w), yMin: arredondar(uniaoDosTextos.y), yMax: arredondar(uniaoDosTextos.y + uniaoDosTextos.h) }

  const caixaDaLogo = emFracoes(retangulo(logo), pagina)
  const cx = caixaDaLogo.x + caixaDaLogo.w / 2, cy = caixaDaLogo.y + caixaDaLogo.h / 2
  const cantoDaMarca: CantoDaLogo = `${cy < 0.5 ? 'superior' : 'inferior'}-${cx < 0.5 ? 'esquerdo' : 'direito'}`
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
  for (const [papel, c] of caixas) {
    posicoes[papel] = { referencia: c.caixa, zona: { ...zonaDaCaixa(c.caixa), yMin: zonaDosTextos.yMin, yMax: zonaDosTextos.yMax } }
    limitesDeTexto[papel] = { linhasMax: c.linhas }
  }
  posicoes.logo = { referencia: caixaDaLogo, zona: zonaDaCaixa(caixaDaLogo) }

  const definicao: ArquetipoDeLayout = {
    id: idDaReferencia(pagina.id),
    versao: args.versao,
    codigoTaxonomico: 'REF-01',
    nome: `Referência · ${(pagina.name ?? pagina.id).trim() || pagina.id}`,
    papeis,
    preferencias: { ancora: faixa, alinha: alinhaDaManchete, cantoDaMarca },
    formatos: { [formato]: { papeis: posicoes, limitesDeTexto } } as unknown as ArquetipoDeLayout['formatos'],
    referencia: { pageId: pagina.id, pageVersion: args.pageVersion, formato },
  }
  return {
    ok: true,
    definicao,
    leitura: {
      formato,
      foto,
      logo: logo.id,
      papeis: ordem.map(([papel, c]) => ({ papel, camadas: c.camadas, linhas: c.linhas, caixa: c.caixa, alinha: c.alinha })),
      ignoradas,
    },
  }
}
