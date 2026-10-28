/**
 * G1 · inserir grade no design aberto (puro: sem React, DOM, banco, rede ou env). Monta só com o motor do G0
 * (`criarGrade`, `preencherCelula`, `refazerGrade`): nenhuma regra de geometria ou de recorte é refeita aqui.
 *
 * FUNDO da página = imagem VISÍVEL com id reservado (`bg-foto`/`bg-img`) ou cuja caixa SEM rotação cobre ≥ 90% da
 * página (a mesma régua da aba Layouts, `COBERTURA_MINIMA_DA_FOTO`). Vira a célula 1 só se for o ÚNICO fundo e for
 * imagem comum: sem identidade especial, sem máscara, reta, destravada, sem borda/cantos/sombra/efeito, estilo só com
 * chaves conhecidas, foto do Blob próprio, cobrindo a página E com a dimensão natural conferida pela URL exata. Na
 * dúvida o fundo fica intacto, a grade entra vazia e o motivo volta no aviso — nunca normaliza em silêncio.
 *
 * Pilha: o bloco das células entra logo abaixo da primeira camada que não é fundo, visível ou oculta (texto, logo,
 * elementos e o resto continuam por cima, e o oculto reaparece por cima). Convertido, o fundo sai antes dessa conta (nunca deixa o bloco no índice antigo dele);
 * intacto, fica por baixo. Ordem das antigas, igual.
 */
import type { DesignData, Layer, LayerStyle } from '@/types/template'
import { currentSourceRect } from '@/lib/image-fit'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { layoutDoCatalogo, VERSAO_DO_CATALOGO } from './catalogo'
import { IDS_RESERVADOS, urlAceita } from './conferir'
import { espacamentoInicial } from './geometria'
import { criarGrade, preencherCelula, refazerGrade } from './operacoes'
import { deu, falhou, type Resultado } from './tipos'

/** Mesmo valor de `COBERTURA_MINIMA_DA_FOTO` (da-pagina.ts, importar puxaria a copy autoral para o editor); teste trava. */
export const COBERTURA_MINIMA_DO_FUNDO = 0.9

export type MotivoDoFundo =
  | 'AMBIGUO'
  | 'ESPECIAL'
  | 'MASCARA'
  | 'GIRADO'
  | 'TRAVADO'
  | 'ESTILO'
  | 'URL'
  | 'NAO_COBRE'
  | 'SEM_MEDIDA'
  | 'RECORTE'

const AVISO: Record<MotivoDoFundo, string> = {
  AMBIGUO: 'a página tem mais de uma imagem de fundo',
  ESPECIAL: 'a imagem de fundo é logo, elemento, ícone, sombra ou tem vínculo (modelo, grupo, clipe, grade)',
  MASCARA: 'a foto de fundo tem máscara',
  GIRADO: 'a foto de fundo está girada',
  TRAVADO: 'a foto de fundo está travada',
  ESTILO: 'a foto de fundo tem borda, cantos, sombra, efeito ou ajuste que a célula não leva',
  URL: 'a foto de fundo não está no armazenamento do Studio',
  NAO_COBRE: 'a foto de fundo não cobre a página',
  SEM_MEDIDA: 'não foi possível medir a foto de fundo',
  RECORTE: 'o enquadramento da foto de fundo não cabe na célula sem deformar (ou ela já aparece esticada)',
}
const aviso = (motivo: MotivoDoFundo) => ({ motivo, mensagem: `Grade inserida vazia: ${AVISO[motivo]}. Ela ficou como estava.` })

export interface PedidoDeGrade {
  layout: string
  idDaGrade: string
  idsDasCelulas: string[]
}

/** O que o editor mediu, preso ao fundo e ao canvas daquele instante (`impressao`) */
export interface MedidaDoFundo {
  camadaId: string
  impressao: string
  natural?: { width: number; height: number }
}

export type DesfechoDaInsercao =
  | { ok: true; layers: Layer[]; celulas: string[]; convertida?: string; aviso?: { motivo: MotivoDoFundo; mensagem: string }; codigo?: undefined; mensagem?: undefined }
  | {
      ok: false
      codigo: 'PAGINA_DE_VIDEO' | 'GRADE_DESCONHECIDA' | 'IDS_INVALIDOS' | 'GRADE_PEQUENA_DEMAIS' | 'ALVO_MUDOU'
      mensagem: string
      layers?: undefined
      celulas?: undefined
      convertida?: undefined
      aviso?: undefined
    }

export const MENSAGEM_ALVO_MUDOU = 'A página mudou enquanto a foto de fundo era medida; a grade não foi inserida. Tente de novo.'
const recusa = (codigo: Extract<DesfechoDaInsercao, { ok: false }>['codigo'], mensagem: string): DesfechoDaInsercao => ({ ok: false, codigo, mensagem })

const temValor = (v: unknown) => v !== undefined && v !== null
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const NOME_ESPECIAL = /logo|elemento|sombra|icone/

/**
 * Raiz que a célula representa. Qualquer outra chave com valor — `logoId`, `elementId`, `parentId`, `clipe`,
 * `movimento` (foto única com movimento não é página-vídeo), o `__quadroDoMovimento` transitório, campos de texto ou
 * vídeo — é identidade que a conversão perderia: ESPECIAL.
 */
const RAIZ_DA_CELULA = new Set(['id', 'type', 'name', 'visible', 'locked', 'order', 'position', 'size', 'rotation', 'fileUrl', 'style', 'effects', 'isDynamic', 'metadata'])

/** Estilo que a célula consome (enquadramento) ou leva igual (ajustes desenhados por qualquer imagem) */
const CONSUMIDAS = new Set(['objectFit', 'cropPosition', 'crop'])
const LEVADAS = ['opacity', 'filter', 'flipH', 'flipV', 'blur', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'saturation', 'vignette', 'brightness', 'grayscale', 'sepia', 'invert'] as const

function cobertura(c: Layer, canvas: { width: number; height: number }) {
  const area = canvas.width * canvas.height
  if (!(area > 0)) return 0
  const x0 = Math.max(0, c.position?.x ?? 0)
  const y0 = Math.max(0, c.position?.y ?? 0)
  const x1 = Math.min(canvas.width, (c.position?.x ?? 0) + (c.size?.width ?? 0))
  const y1 = Math.min(canvas.height, (c.position?.y ?? 0) + (c.size?.height ?? 0))
  return (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / area
}

const ehFundo = (c: Layer, canvas: DesignData['canvas']) =>
  c.type === 'image' && c.visible !== false && (IDS_RESERVADOS.has(c.id) || cobertura(c, canvas) >= COBERTURA_MINIMA_DO_FUNDO)

/** Por que este fundo (único) não vira célula; `undefined` = pode converter, falta só a medida */
function impedimento(c: Layer, canvas: DesignData['canvas']): MotivoDoFundo | undefined {
  const meta = c.metadata && typeof c.metadata === 'object' ? Object.values(c.metadata) : []
  const style = (c.style ?? {}) as LayerStyle
  if (
    Object.entries(c).some(([k, v]) => !RAIZ_DA_CELULA.has(k) && temValor(v)) ||
    meta.some(temValor) ||
    temValor(style.vetor) ||
    NOME_ESPECIAL.test(semAcento(c.name ?? ''))
  ) {
    return 'ESPECIAL'
  }
  if (temValor(style.mask)) return 'MASCARA'
  if (c.rotation !== undefined && c.rotation !== 0) return 'GIRADO'
  if (c.locked === true) return 'TRAVADO'
  const borda = style.border as { width?: unknown; radius?: unknown } | undefined
  const bordaNeutra = !borda || ([borda.width, borda.radius].every((v) => v === undefined || v === 0))
  const efeitoLigado = Object.values(c.effects ?? {}).some((e) => (e as { enabled?: unknown } | undefined)?.enabled === true)
  const chaveEstranha = Object.keys(style).some(
    (k) => temValor(style[k]) && !CONSUMIDAS.has(k) && k !== 'border' && !(LEVADAS as readonly string[]).includes(k),
  )
  if (!bordaNeutra || temValor(style.shadow) || efeitoLigado || chaveEstranha) return 'ESTILO'
  if (cobertura(c, canvas) < COBERTURA_MINIMA_DO_FUNDO) return 'NAO_COBRE'
  if (!urlAceita(c.fileUrl)) return 'URL'
  return undefined
}

function analisarFundo(design: DesignData) {
  const fundos = design.layers.filter((c) => ehFundo(c, design.canvas))
  if (fundos.length === 0) return { fundos }
  if (fundos.length > 1) return { fundos, motivo: 'AMBIGUO' as MotivoDoFundo }
  const motivo = impedimento(fundos[0], design.canvas)
  return motivo ? { fundos, motivo } : { fundos, convertivel: fundos[0] }
}

/** Fundo + canvas inteiros, sem a `order` (que muda quando OUTRA camada entra ou sai) */
export function impressaoDoFundo(design: DesignData, camada: Layer): string {
  return JSON.stringify({ canvas: design.canvas, camada: { ...camada, order: undefined } })
}

/** O fundo que o editor precisa medir antes de inserir; `null` = nada a medir (inclusive página de vídeo) */
export function fundoParaMedir(design: DesignData): { camadaId: string; fileUrl: string; impressao: string } | null {
  if (paginaEVideo(design.layers, design.audio)) return null
  const c = analisarFundo(design).convertivel
  return c ? { camadaId: c.id, fileUrl: c.fileUrl as string, impressao: impressaoDoFundo(design, c) } : null
}

/** Célula 1 com a foto do fundo e o MESMO enquadramento, pelo G0: grade de 1 célula na caixa do fundo → layout pedido */
function converter(fundo: Layer, natural: { width: number; height: number }, pedido: PedidoDeGrade, pagina: { x: number; y: number; w: number; h: number }, espacamento: number): Resultado<Layer[]> {
  const caixa = { x: fundo.position.x, y: fundo.position.y, w: fundo.size.width, h: fundo.size.height }
  const uma = criarGrade({ layout: '1-celula', caixa, raio: 0, idDaGrade: pedido.idDaGrade, idsDasCelulas: pedido.idsDasCelulas.slice(0, 1) })
  if (!uma.ok) return uma
  const cheia = preencherCelula(uma.valor[0], fundo.fileUrl as string)
  if (!cheia.ok) return falhou(cheia.diagnosticos)
  // o que o fundo DESENHA hoje (cover/cropPosition/crop/esticada) vira recorte manual; esticada o G0 recusa
  const fonte = currentSourceRect(natural, { width: caixa.w, height: caixa.h }, fundo.style)
  const levadas = Object.fromEntries(LEVADAS.filter((k) => temValor(fundo.style?.[k])).map((k) => [k, fundo.style![k]]))
  const celula: Layer = {
    ...cheia.valor,
    style: {
      ...levadas,
      ...cheia.valor.style,
      crop: { x: fonte.cropX / natural.width, y: fonte.cropY / natural.height, width: fonte.cropWidth / natural.width, height: fonte.cropHeight / natural.height },
    },
  }
  const r = refazerGrade([celula], { layout: pedido.layout, caixa: pagina, espacamento, raio: 0 }, new Map([[fundo.fileUrl as string, natural]]), {
    idsNovos: pedido.idsDasCelulas.slice(1),
  })
  return r.ok ? deu(r.valor.celulas) : falhou(r.diagnosticos)
}

/** O bloco logo abaixo da primeira camada que não é fundo, visível OU oculta (oculta reaparece por cima); senão no topo */
function comBloco(antigas: Layer[], bloco: Layer[], fundos: ReadonlySet<Layer>): Layer[] {
  const p = antigas.findIndex((l) => !fundos.has(l))
  const em = p === -1 ? antigas.length : p
  return [...antigas.slice(0, em), ...bloco, ...antigas.slice(em)]
}

function idsLivres(design: DesignData, pedido: PedidoDeGrade, n: number): boolean {
  const ocupados = new Set<unknown>()
  for (const c of design.layers) {
    ocupados.add(c.id)
    ocupados.add(c.metadata?.groupId)
    ocupados.add((c.metadata?.grade as { id?: unknown } | undefined)?.id)
  }
  const novos = [pedido.idDaGrade, ...(Array.isArray(pedido.idsDasCelulas) ? pedido.idsDasCelulas : [])]
  return (
    Array.isArray(pedido.idsDasCelulas) &&
    pedido.idsDasCelulas.length === n &&
    novos.every((id) => typeof id === 'string' && id !== '' && !IDS_RESERVADOS.has(id) && !ocupados.has(id)) &&
    new Set(novos).size === novos.length
  )
}

/**
 * A pilha final com a grade inserida, decidida sobre ESTE `design` (o estado atual, dentro do updater do editor).
 * `medida` é o que o editor mediu antes (ou `null`, se não viu fundo a medir): se o fundo convertível de agora não é o
 * mesmo — outra camada, recorte/foto/geometria/canvas diferentes, ou um fundo que surgiu sem medida — a resposta é
 * ALVO_MUDOU e nada se aplica. Entrada nunca mutada; a `order` final é do chamador (normaliza uma vez).
 */
export function inserirGradeNoDesign(design: DesignData, pedido: PedidoDeGrade, medida: MedidaDoFundo | null): DesfechoDaInsercao {
  if (paginaEVideo(design.layers, design.audio)) {
    return recusa('PAGINA_DE_VIDEO', 'Página de vídeo: a grade só entra em página de imagem.')
  }
  const layout = layoutDoCatalogo(pedido.layout, VERSAO_DO_CATALOGO)
  if (!layout) return recusa('GRADE_DESCONHECIDA', `Layout "${String(pedido.layout)}" fora do catálogo.`)
  if (!idsLivres(design, pedido, layout.celulas.length)) return recusa('IDS_INVALIDOS', 'Ids novos da grade vazios, repetidos, reservados ou já usados na página.')

  const analise = analisarFundo(design)
  const c = analise.convertivel
  const mesmoAlvo = c ? !!medida && medida.camadaId === c.id && medida.impressao === impressaoDoFundo(design, c) : medida === null
  if (!mesmoAlvo) return recusa('ALVO_MUDOU', MENSAGEM_ALVO_MUDOU)

  const pagina = { x: 0, y: 0, w: design.canvas.width, h: design.canvas.height }
  let motivo = analise.motivo
  if (c) {
    const n = medida!.natural
    if (!n || !(n.width > 0) || !(n.height > 0)) {
      motivo = 'SEM_MEDIDA'
    } else {
      const r = converter(c, n, pedido, pagina, espacamentoInicial(layout))
      if (r.ok) {
        const resto = design.layers.filter((l) => l !== c)
        return { ok: true, layers: comBloco(resto, r.valor, new Set()), celulas: r.valor.map((l) => l.id), convertida: c.id }
      }
      motivo = r.diagnosticos.some((d) => d.codigo === 'FOTO_SEM_MEDIDA') ? 'SEM_MEDIDA' : 'RECORTE'
    }
  }

  const vazia = criarGrade({ layout: layout.id, caixa: pagina, espacamento: espacamentoInicial(layout), raio: 0, idDaGrade: pedido.idDaGrade, idsDasCelulas: pedido.idsDasCelulas })
  if (!vazia.ok) {
    return recusa('GRADE_PEQUENA_DEMAIS', vazia.diagnosticos[0]?.mensagem ?? 'A página não comporta este layout.')
  }
  return {
    ok: true,
    layers: comBloco(design.layers, vazia.valor, new Set(analise.fundos)),
    celulas: vazia.valor.map((l) => l.id),
    ...(motivo ? { aviso: aviso(motivo) } : {}),
  }
}
