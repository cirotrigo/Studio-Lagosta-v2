/**
 * CP5a — o VEREDITO PURO (gate de autonomia), conforme `docs/PLANO-2026-10-15-CP5A-CONTRATO.md` (PR #236,
 * aprovado no HEAD 08a44af5). Recebe a MEDIDA completa de uma peça (`MedidaDaPeca`), calcula o relatório
 * (`avaliarPeca`, puro) e decide `APTO` ou `REVISAO_HUMANA_NECESSARIA` com cobertura, motivos, achados e o que
 * NÃO viu. Sem banco, sem render, sem chamador de produção (o gate em `agendar-leva` é o CP5c).
 *
 * Princípios: "não há" não é "não medimos"; "não medimos" nunca vira APTO; "não contamos" é "não medimos".
 * Oclusão por detecção do cenário (estratégia B): só mede pela caixa o conjunto fechado que a paridade com o
 * render REAL prova contido (`gate.test.ts` G21c/G21e); todo o resto acima de um texto é `NAO_MEDIDO`.
 */
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import { encaixeEntre, toleranciaDeColisao } from '@/lib/creatives/text-geometry'
import type { Rect } from '@/lib/creatives/halo/halo'
import { folgaDoBlur } from '@/lib/creatives/halo/fundo-de-texto'
import type { RevisaoDaPagina } from '@/lib/copy-autoral/revisar-pagina'
import { REGRAS_DA_REVISAO, type AchadoDaRevisao, type RegraDaRevisao, type RelatorioDaRevisao, type Severidade } from './contrato'
import { avaliarPeca, ehTextoVisivel, fotoDeFundo, logosDaPeca, type EntradaDaRevisao } from './regras'

/** A medida que `medirCamadasDaPeca` devolve (a entrada do revisor sem a visão). Tipo repetido aqui para o gate não importar `revisar-arte` (que importa o banco). */
export type MedidaDaPeca = Omit<EntradaDaRevisao, 'vistos' | 'motivoSemVisao' | 'marcas'>

// ─────────────────────────────────────────────────────────────────────────
// Regras críticas (seção 3 do contrato) — conjunto fechado, fixado por teste contra REGRAS_DA_REVISAO
// ─────────────────────────────────────────────────────────────────────────

export const REGRAS_CRITICAS = [
  'fonte-nao-carregada',
  'texto-cortado',
  'tinta-fora-da-caixa',
  'colisao',
  'fora-da-area-segura',
  'texto-sem-leitura',
  'tratamento-piorou-leitura',
  'texto-sobre-assunto',
  'logo-sem-leitura',
  'logo-sobre-texto',
  'texto-pequeno',
] as const satisfies readonly RegraDaRevisao[]
export type RegraCritica = (typeof REGRAS_CRITICAS)[number]

/** Nunca decidem (gosto/sugestão) — e a visão nunca entra. */
export const NAO_CRITICAS = ['gradiente-forte-demais', 'titulo-grande', 'entrelinha-grande', 'palavra-orfa', 'visao'] as const satisfies readonly RegraDaRevisao[]

/** As regras de TEXTO: sem texto visível, não se aplicam. */
const REGRAS_DE_TEXTO = new Set<RegraCritica>(['texto-cortado', 'tinta-fora-da-caixa', 'colisao', 'fora-da-area-segura', 'logo-sobre-texto', 'texto-pequeno', 'texto-sem-leitura', 'tratamento-piorou-leitura'])

/** As conferências do gate que NÃO são regra do revisor; cada uma tem de estar comprovada (ou não se aplicar) para APTO. */
export type ConferenciaDoGate = 'copy-completa' | 'piso-de-interface' | 'oclusao' | 'identidade'
export const CONFERENCIAS_DO_GATE = ['oclusao', 'copy-completa', 'piso-de-interface', 'identidade'] as const satisfies readonly ConferenciaDoGate[]

export type CoberturaDoGate =
  | { estado: 'comprovada' }
  | { estado: 'nao-se-aplica'; motivo: string }
  | { estado: 'nao-comprovada'; motivo: string }
  | { estado: 'reprovada'; achados: string[] }

export type ResultadoDoGate = 'APTO' | 'REVISAO_HUMANA_NECESSARIA'

export interface MotivoDoGate {
  regra: RegraCritica | ConferenciaDoGate
  codigo: 'ACHADO_CRITICO' | 'NAO_COMPROVADA' | 'NAO_MEDIDO' | 'IDENTIDADE_ILEGIVEL'
  motivo: string
  camadas: string[]
}

export interface GateDaArte {
  versao: 'gate-v1'
  resultado: ResultadoDoGate
  /** `relatorio.versaoDasRegras` copiado; a política de bump é do CP5b. */
  rulesVersion: string
  pageVersion: string | null
  copyVersion: string
  /** Por regra crítica e por conferência: a prova. Nunca omite uma entrada. */
  cobertura: Record<RegraCritica | ConferenciaDoGate, CoberturaDoGate>
  /** Só o que DECIDIU contra a peça (vazio quando APTO), em ordem determinística. */
  motivos: MotivoDoGate[]
  /** Os achados que reprovaram: críticos `medida` e, só com `estimado: 'comprova'`, o estimado do assunto. */
  achados: Array<{ regra: RegraCritica; camadas: string[]; id: string; severidade: Severidade; certeza: 'medida' | 'estimada' }>
  /** O que o gate NÃO viu e diz. */
  naoMedidos: Array<{ regra: RegraCritica | 'oclusao' | 'geometria' | 'piso-de-interface'; motivo: string; camadas: string[] }>
  /** Nunca bloqueiam, nunca somem. */
  avisos: string[]
}

// ─────────────────────────────────────────────────────────────────────────
// Política do assunto (seção 5) — parâmetro OBRIGATÓRIO; a recomendada é uma proposta nomeada
// ─────────────────────────────────────────────────────────────────────────

export interface PoliticaDoAssunto {
  /** Caso B: o assunto só ESTIMADO comprova (com o teto 0,40 do revisor) ou manda ao humano. */
  estimado: 'comprova' | 'humano'
  /** Caso C: foto LIDA sem assunto localizável (`naoSeAplica`) não bloqueia, ou manda ao humano. */
  semAssuntoLocalizavel: 'nao-se-aplica' | 'humano'
}
/** PROPOSTA (decisão 9.1 do contrato, adotada pelo owner em 16/10/2026): não é padrão de nada — `gateDaMedida` exige a política explicitamente. */
export const POLITICA_DO_ASSUNTO_RECOMENDADA: PoliticaDoAssunto = { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }

export interface EntradaDoGate {
  /** A FONTE ÚNICA: camadas, canvas e formato saem dela; o relatório é calculado aqui por `avaliarPeca`. */
  medida: MedidaDaPeca
  /** Identidade da página medida — copiada para a saída; o gate não a valida (o CP5c compara sob trava). */
  identidade: { pageVersion: string | null; copyVersion: string }
  /** `revisaoDaPaginaComCamadas(...)` calculado por quem chama sobre a MESMA leitura. `undefined` = não conferiu → não comprovada. */
  copy?: { estado: RevisaoDaPagina['estado']; lacunas: string[] }
  politicaDoAssunto: PoliticaDoAssunto
}

// ─────────────────────────────────────────────────────────────────────────
// Piso de interface do story (seção 4.3) — único lugar com 188/224
// ─────────────────────────────────────────────────────────────────────────

export const PISO_DE_INTERFACE_DO_STORY = { topo: 188, rodape: 224 } as const

/** Uma configuração do cliente pode ser MAIS restritiva, nunca menos. */
export function interfaceDoStory(doCliente?: { topo?: number; rodape?: number }): { topo: number; rodape: number } {
  return {
    topo: Math.max(PISO_DE_INTERFACE_DO_STORY.topo, doCliente?.topo ?? 0),
    rodape: Math.max(PISO_DE_INTERFACE_DO_STORY.rodape, doCliente?.rodape ?? 0),
  }
}

/**
 * Texto visível e logo solta fora da faixa livre da interface, pelos LIMITES conservadores (girados). Camada cuja
 * geometria não é comprovável sai em `naoMedidos`. Sem `metricas`, os limites do texto são os da caixa girada.
 */
export function foraDaInterface(
  camadas: Layer[],
  canvas: { width: number; height: number },
  interface_: { topo: number; rodape: number },
  metricas: TextLayerMetrics[] = [],
): Array<{ camada: string; topo: number; base: number }> {
  // Para o ORÁCULO (sem medidor): texto sem métrica usa a própria caixa como métrica sintética. O gate (`pisoDeInterface`
  // em `gateDaMedida`) recebe as métricas reais e não tem este atalho.
  const porId = new Map(metricas.map((m) => [m.layerId, m]))
  const sinteticas = camadas.filter((l) => ehTextoVisivel(l) && !porId.has(l.id)).map((l): TextLayerMetrics => ({ layerId: l.id, name: l.name, box: { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }, realHeight: l.size.height, maxLineWidth: l.size.width, lineCount: 1, glyphTop: l.position.y, glyphBottom: l.position.y + l.size.height, fontSize: Number(l.style?.fontSize ?? 16), lineBox: Number(l.style?.fontSize ?? 16), autoExpand: false }))
  return pisoDeInterface(camadas, canvas, interface_, [...metricas, ...sinteticas]).fora
}

export function pisoDeInterface(
  camadas: Layer[],
  canvas: { width: number; height: number },
  interface_: { topo: number; rodape: number },
  metricas: TextLayerMetrics[] = [],
): { fora: Array<{ camada: string; topo: number; base: number }>; naoMedidos: Array<{ camada: string; motivo: string }> } {
  const porId = new Map(metricas.map((m) => [m.layerId, m]))
  const logos = new Set(logosDaPeca(camadas).map((l) => l.id))
  const fora: Array<{ camada: string; topo: number; base: number }> = []
  const naoMedidos: Array<{ camada: string; motivo: string }> = []
  for (const l of camadas) {
    const ehTexto = ehTextoVisivel(l)
    if (!ehTexto && !logos.has(l.id)) continue
    const lim = ehTexto ? limitesDoTexto(l, porId.get(l.id)) : limitesDe(l)
    if (lim.contido === false) {
      naoMedidos.push({ camada: l.id, motivo: lim.motivo })
      continue
    }
    const topo = lim.rect.y
    const base = lim.rect.y + lim.rect.height
    if (topo < interface_.topo || base > canvas.height - interface_.rodape) fora.push({ camada: l.id, topo, base })
  }
  return { fora, naoMedidos }
}

// ─────────────────────────────────────────────────────────────────────────
// Chaves classificadas (seção 6.4) — o que o gate sabe sobre cada campo de uma camada
// ─────────────────────────────────────────────────────────────────────────

export type ClasseDaChave = 'inerte' | 'suportada' | 'expansora' | 'nao-suportada'
export interface ChaveClassificada {
  classe: ClasseDaChave
  /** Valor extremo com que a paridade com o render (G21c/G21e) prova a contenção — obrigatório fora de `nao-suportada`. */
  valorDeProva?: unknown
}

const inerte = (valorDeProva: unknown): ChaveClassificada => ({ classe: 'inerte', valorDeProva })
const suportada = (valorDeProva: unknown): ChaveClassificada => ({ classe: 'suportada', valorDeProva })
const expansora = (valorDeProva: unknown): ChaveClassificada => ({ classe: 'expansora', valorDeProva })
const naoSuportada: ChaveClassificada = { classe: 'nao-suportada' }

/**
 * A ÁRVORE de caminhos (`a.b.c`), uma folha por campo declarado em `Layer`, `LayerStyle`, `effects`, `textboxConfig`,
 * `BorderStyle` e `ShadowStyle` (`src/types/template.ts`). `*` é curinga de um nível (sub-árvores só de dados). Caminho
 * FORA da árvore numa camada acima de um texto é `transformacao-nao-suportada` (fail-closed). `inerte` leva a
 * linha do render que a lê — ou o motivo de não mudar geometria.
 */
export const CHAVES_CLASSIFICADAS: Record<string, ChaveClassificada> = {
  // Layer
  id: inerte('x'),
  type: suportada('shape'),
  name: inerte('x'),
  visible: suportada(true),
  locked: inerte(true),
  order: suportada(5),
  'position.x': suportada(400),
  'position.y': suportada(500),
  'size.width': suportada(600),
  'size.height': suportada(40),
  rotation: suportada(90), // render-engine.ts:199-205, em torno da origem
  content: inerte('Texto de prova'),
  isDynamic: inerte(true),
  logoId: inerte(1),
  elementId: inerte(1),
  fileUrl: inerte('data:,'),
  parentId: inerte(null),
  'metadata.*': inerte({}),
  'videoMetadata.*': inerte({}),
  'clipe.*': inerte({}),
  'richTextStyles.*': inerte([]),
  movimento: inerte('aproximar'),
  // textboxConfig (só layout dentro da caixa; com métrica, o texto é medido como desenhado)
  'textboxConfig.spacing': inerte(10),
  'textboxConfig.anchor': inerte('bottom'),
  'textboxConfig.textMode': inerte('auto-wrap-fixed'),
  'textboxConfig.autoResize.minFontSize': inerte(8),
  'textboxConfig.autoResize.maxFontSize': inerte(200),
  'textboxConfig.autoWrap.lineHeight': inerte(3),
  'textboxConfig.autoWrap.breakMode': inerte('char'),
  'textboxConfig.autoWrap.autoExpand': suportada(true),
  'textboxConfig.wordBreak': inerte(true),
  // effects
  'effects.blur.enabled': expansora(true), // render-engine.ts:1978-1994, folgaDoBlur
  'effects.blur.blurRadius': expansora(20),
  'effects.stroke.enabled': expansora(true), // :450-576
  'effects.stroke.strokeColor': inerte('#ff0000'),
  'effects.stroke.strokeWidth': expansora(12),
  'effects.shadow.enabled': expansora(true), // applyShadow, :341-369
  'effects.shadow.shadowColor': inerte('#000000'),
  'effects.shadow.shadowBlur': expansora(10),
  'effects.shadow.shadowOffsetX': expansora(30),
  'effects.shadow.shadowOffsetY': expansora(30),
  'effects.shadow.shadowOpacity': inerte(1),
  'effects.background.*': naoSuportada, // mancha com padding/offset/blur além da caixa (:1086-1116) — como OCLUIDORA
  'effects.curved.*': naoSuportada, // texto curvo: os glifos saem da caixa (:376-377, :537)
  // style — texto (fontes/alinhamento mudam o layout DENTRO da caixa; a métrica os incorpora)
  'style.fontSize': inerte(60),
  'style.fontFamily': inerte('serif'),
  'style.fontWeight': inerte(900),
  'style.fontStyle': inerte('italic'),
  'style.color': inerte('#000000'),
  'style.textAlign': inerte('right'),
  'style.textTransform': inerte('uppercase'),
  'style.letterSpacing': inerte(60),
  'style.lineHeight': inerte(3),
  // style — gradiente (preenche a caixa)
  'style.gradientType': inerte('radial'),
  'style.gradientAngle': inerte(45),
  'style.gradientStops.*': inerte([]),
  'style.gradientStartX': inerte(0),
  'style.gradientStartY': inerte(0),
  'style.gradientEndX': inerte(1),
  'style.gradientEndY': inerte(1),
  'style.gradientCenterX': inerte(0.5),
  'style.gradientCenterY': inerte(0.5),
  'style.gradientRadiusScale': inerte(2),
  // style — imagem (o destino do drawImage é sempre (0,0,w,h): :1701-1708)
  'style.objectFit': inerte('cover'),
  'style.cropPosition': inerte('right-bottom'),
  'style.crop.x': inerte(0.5),
  'style.crop.y': inerte(0.5),
  'style.crop.width': inerte(0.9),
  'style.crop.height': inerte(0.9),
  'style.flipH': suportada(true), // espelha DENTRO da caixa, :1692-1693
  'style.flipV': suportada(true),
  'style.mask.shapeId': suportada('circle'), // clip só retira, :1664-1668
  'style.mask.path': suportada('M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z'),
  'style.opacity': inerte(1),
  'style.filter': naoSuportada, // ctx.filter, :1530-1532
  'style.shadow.offsetX': expansora(30),
  'style.shadow.offsetY': expansora(30),
  'style.shadow.blur': expansora(10),
  'style.shadow.color': inerte('#000000'),
  'style.border.width': expansora(12), // forma :1822-1826; imagem :1711
  'style.border.color': inerte('#000000'),
  'style.border.radius': suportada(500),
  'style.fill': inerte('#ff0000'),
  'style.fillOpacity': inerte(1),
  'style.strokeColor': inerte('#000000'),
  'style.strokeOpacity': inerte(1),
  'style.strokeWidth': expansora(12),
  'style.shapeType': suportada('circle'), // rectangle/rounded-rectangle/circle/triangle/star; o resto é não suportado em limitesDe
  'style.pathData': naoSuportada, // svg-path: não recortado ao viewBox, :1843-1850
  'style.pathViewBox': naoSuportada,
  'style.pathFillRule': naoSuportada,
  'style.lineStyle': naoSuportada, // line/arrow, :1870-1908
  'style.lineStartCap': naoSuportada,
  'style.lineEndCap': naoSuportada,
  'style.iconId': naoSuportada, // :2053-2063, coordenadas cruas
  // style — ajustes de imagem (filtros de pixel dentro da caixa; `blur` de estilo é o do editor de imagem e vai para o filtro do render)
  'style.blur': naoSuportada,
  'style.exposure': inerte(1),
  'style.contrast': inerte(2),
  'style.highlights': inerte(100),
  'style.shadows': inerte(100),
  'style.whites': inerte(100),
  'style.blacks': inerte(100),
  'style.saturation': inerte(2),
  'style.vignette': inerte(1),
  'style.brightness': inerte(2),
  'style.grayscale': inerte(true),
  'style.sepia': inerte(true),
  'style.invert': inerte(true),
}

function classeDe(caminho: string): ChaveClassificada | null {
  const direta = CHAVES_CLASSIFICADAS[caminho] ?? CHAVES_CLASSIFICADAS[`${caminho}.*`]
  if (direta) return direta
  const partes = caminho.split('.')
  for (let n = partes.length - 1; n >= 1; n--) {
    const curinga = CHAVES_CLASSIFICADAS[`${partes.slice(0, n).join('.')}.*`]
    if (curinga) return curinga
  }
  return null
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function valorEfetivo(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (ehObjeto(v)) return Object.keys(v).length > 0
  return true
}

/** Percorre a camada e devolve o primeiro caminho que o gate não sabe medir (fora da árvore, ou `nao-suportada` com valor efetivo). */
function caminhoNaoSuportado(camada: Layer, papel: 'acima' | 'protegido'): string | null {
  const visitar = (valor: unknown, prefixo: string): string | null => {
    if (!ehObjeto(valor)) return null
    for (const [chave, v] of Object.entries(valor)) {
      if (v === undefined) continue
      const caminho = prefixo ? `${prefixo}.${chave}` : chave
      // O texto PROTEGIDO pode ter mancha: ela não entra nos limites (é mancha, não glifo).
      if (papel === 'protegido' && caminho.startsWith('effects.background')) continue
      const classe = classeDe(caminho)
      if (!classe) {
        // Objeto conhecido com filhos classificados (ex.: `effects`, `style.border`): desce.
        if (ehObjeto(v) && Object.keys(CHAVES_CLASSIFICADAS).some((k) => k.startsWith(`${caminho}.`))) {
          const dentro = visitar(v, caminho)
          if (dentro) return dentro
          continue
        }
        return valorEfetivo(v) ? caminho : null
      }
      if (classe.classe === 'nao-suportada' && valorEfetivo(v)) return caminho
    }
    return null
  }
  return visitar(camada as unknown as Record<string, unknown>, '')
}

// ─────────────────────────────────────────────────────────────────────────
// Limites conservadores (seção 6.1–6.3)
// ─────────────────────────────────────────────────────────────────────────

export type Limites = { contido: true; rect: Rect } | { contido: false; motivo: string }

/** Folga de 1 px para o antialias do render: os limites CONTÊM o desenho, nunca faltam. */
export const FOLGA_DE_ANTIALIAS = 1

const FORMAS_NA_CAIXA = new Set(['rectangle', 'rounded-rectangle'])
const FORMAS_CENTRADAS = new Set(['circle', 'triangle', 'star'])
const FORMAS_AGUDAS = new Set(['triangle', 'star'])

function rotacaoDe(l: Layer): number | 'invalida' {
  const r = (l as { rotation?: unknown }).rotation
  if (r === undefined || r === null) return 0
  if (typeof r !== 'number' || !Number.isFinite(r)) return 'invalida'
  return r
}

/** Quanto a camada pinta ALÉM da caixa (traço, desfoque, sombra), lido como o render lê. */
function expansaoDe(l: Layer): number {
  const style = l.style ?? {}
  const fx = l.effects ?? {}
  let traco = 0
  if (l.type === 'text' || l.type === 'rich-text') {
    traco = Math.max(fx.stroke?.enabled ? Number(fx.stroke.strokeWidth ?? 0) : 0, Number(style.border?.width ?? 0))
  } else if (l.type === 'shape') {
    traco = Number(style.strokeWidth ?? style.border?.width ?? 0)
    // Triângulo e estrela têm vértices agudos: a junção em MITRA estende o traço até `miterLimit × lineWidth / 2`
    // (o padrão do canvas é 10) além do vértice — 5 × a largura cobre o pior caso (G21c pegou a estrela: tip a 19 px).
    if (FORMAS_AGUDAS.has(String(style.shapeType))) traco *= 5
  } else {
    traco = Number(style.border?.width ?? 0)
  }
  const desfoque = fx.blur?.enabled ? folgaDoBlur(Number(fx.blur.blurRadius ?? 0)) : 0
  let sombra = 0
  if (fx.shadow?.enabled) sombra = Math.abs(Number(fx.shadow.shadowOffsetX ?? 0)) + Math.abs(Number(fx.shadow.shadowOffsetY ?? 0)) + 3 * Number(fx.shadow.shadowBlur ?? 0)
  else if (style.shadow) sombra = Math.abs(Number(style.shadow.offsetX ?? 0)) + Math.abs(Number(style.shadow.offsetY ?? 0)) + 3 * Number(style.shadow.blur ?? 0)
  return Math.max(0, traco) + Math.max(0, desfoque) + Math.max(0, sombra)
}

/** Tem alguma folha EXPANSORA com valor efetivo (contorno, sombra, desfoque)? As exceções exigem que não. */
export function temFolhaExpansora(l: Layer): boolean {
  return expansaoDe(l) > 0
}

/** A envolvente dos quatro cantos de uma caixa LOCAL (relativa a `position`) girada em torno da ORIGEM — o pivô do render. */
function envolventeGirada(l: Layer, local: Rect, graus: number): Rect {
  const r = (graus * Math.PI) / 180
  const cos = Math.cos(r)
  const sen = Math.sin(r)
  const cantos = [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x, local.y + local.height],
    [local.x + local.width, local.y + local.height],
  ].map(([x, y]) => [l.position.x + x * cos - y * sen, l.position.y + x * sen + y * cos])
  const xs = cantos.map((c) => c[0])
  const ys = cantos.map((c) => c[1])
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 }
}

function expandir(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d }
}

/**
 * Os limites de uma camada ACIMA de um texto (6.1/6.2): caixa base por tipo de forma, expansão por efeitos, rotação em
 * torno da origem. `contido: false` para tudo o que a caixa não descreve (svg-path, icon, line/arrow, video, filter,
 * rich-text, mancha de fundo, texto sem métrica, chave fora da árvore).
 */
export function limitesDe(l: Layer, metrica?: TextLayerMetrics): Limites {
  if (l.type === 'text') return limitesDoTexto(l, metrica, 'acima')
  if (l.type === 'rich-text') return { contido: false, motivo: 'rich-text acima de texto: sombra e traço por segmento' }
  if (l.type === 'icon') return { contido: false, motivo: 'icon desenha o path em coordenadas cruas' }
  if (l.type === 'video') return { contido: false, motivo: 'video não é desenhado pelo render de imagem' }
  const nao = caminhoNaoSuportado(l, 'acima')
  if (nao) return { contido: false, motivo: `campo não suportado ou desconhecido: ${nao}` }
  const graus = rotacaoDe(l)
  if (graus === 'invalida') return { contido: false, motivo: 'rotation de tipo inesperado' }
  const w = Number(l.size?.width ?? 0)
  const h = Number(l.size?.height ?? 0)
  let local: Rect
  if (l.type === 'shape') {
    const forma = String(l.style?.shapeType ?? 'rectangle')
    if (FORMAS_NA_CAIXA.has(forma)) local = { x: 0, y: 0, width: w, height: h }
    else if (FORMAS_CENTRADAS.has(forma)) {
      const r = Math.min(w, h) / 2
      local = { x: -r, y: -r, width: 2 * r, height: 2 * r }
    } else return { contido: false, motivo: `shapeType ${forma} não é descrito pela caixa` }
  } else if (l.type === 'image' || l.type === 'logo' || l.type === 'element' || l.type === 'gradient' || l.type === 'gradient2') {
    local = { x: 0, y: 0, width: w, height: h }
  } else {
    return { contido: false, motivo: `tipo de camada ${String(l.type)} sem paridade com o render` }
  }
  const expandida = expandir(local, expansaoDe(l) + FOLGA_DE_ANTIALIAS)
  return { contido: true, rect: graus === 0 ? { x: l.position.x + expandida.x, y: l.position.y + expandida.y, width: expandida.width, height: expandida.height } : envolventeGirada(l, expandida, graus) }
}

/**
 * Os limites de um TEXTO (6.3): caixa local ∪ caixa dos glifos da métrica (medida sem rotação), as mesmas expansões,
 * os cantos girados em torno da origem. Sem métrica é `contido: false` (o texto pode desenhar além da caixa e o gate
 * não sabe quanto). Como ocluidora (`papel: 'acima'`), a mancha de fundo é não suportada; como PROTEGIDO, a mancha
 * fica fora dos limites (é mancha, não glifo — a leitura já é medida pela régua).
 */
export function limitesDoTexto(l: Layer, metrica: TextLayerMetrics | undefined, papel: 'acima' | 'protegido' = 'protegido'): Limites {
  if (l.type === 'rich-text' && papel === 'acima') return { contido: false, motivo: 'rich-text acima de texto: sombra e traço por segmento' }
  const nao = caminhoNaoSuportado(l, papel)
  if (nao) return { contido: false, motivo: `campo não suportado ou desconhecido: ${nao}` }
  if (!metrica) return { contido: false, motivo: 'texto sem métrica: pode desenhar além da caixa' }
  const graus = rotacaoDe(l)
  if (graus === 'invalida') return { contido: false, motivo: 'rotation de tipo inesperado' }
  const w = Number(l.size?.width ?? 0)
  const h = Number(l.size?.height ?? 0)
  // União da caixa com os glifos, em coordenadas LOCAIS (a métrica é medida no referencial sem rotação).
  const gTop = metrica.glyphTop - l.position.y
  const gBottom = metrica.glyphBottom - l.position.y
  const x0 = 0
  const y0 = Math.min(0, gTop)
  const x1 = Math.max(w, metrica.maxLineWidth)
  const y1 = Math.max(h, gBottom)
  const expandida = expandir({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, expansaoDe(l) + FOLGA_DE_ANTIALIAS)
  return { contido: true, rect: graus === 0 ? { x: l.position.x + expandida.x, y: l.position.y + expandida.y, width: expandida.width, height: expandida.height } : envolventeGirada(l, expandida, graus) }
}

function intersecao(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export type CenarioNaoMedido =
  | { tipo: 'oclusao'; texto: string; acima: string[] }
  | { tipo: 'transformacao-nao-suportada'; camadas: string[]; motivo: string }

/**
 * Detecção do cenário não comprovável (estratégia B, seção 6): toda camada visível com `order >=` ao de um texto
 * visível cujos limites intersectam os dele — salvo as duas exceções com prova positiva (texto × texto limpo medido por
 * `colisao`, dentro da tolerância dela; logo solta × texto limpo medido por `logo-sobre-texto`).
 */
export function cenariosNaoMedidos(
  medida: Pick<MedidaDaPeca, 'camadas' | 'canvas' | 'metricas' | 'textosSemMetrica' | 'motivoSemMedida'>,
  cobertura: RelatorioDaRevisao['cobertura'],
): CenarioNaoMedido[] {
  const saida: CenarioNaoMedido[] = []
  const porId = new Map(medida.metricas.map((m) => [m.layerId, m]))
  const semMetrica = new Set(medida.textosSemMetrica ?? [])
  const comMetrica = (l: Layer) => !medida.motivoSemMedida && porId.has(l.id) && !semMetrica.has(l.id)
  const logosSoltas = new Set(logosDaPeca(medida.camadas).map((l) => l.id))
  const visiveis = medida.camadas.filter((l) => l.visible !== false)
  const naoSuportadas = new Set<string>()
  const limpo = (l: Layer) => rotacaoDe(l) === 0 && !temFolhaExpansora(l) && !valorEfetivo(l.style?.filter)

  for (const t of visiveis.filter(ehTextoVisivel)) {
    const lt = limitesDoTexto(t, porId.get(t.id), 'protegido')
    const acima = visiveis.filter((c) => c.id !== t.id && Number(c.order ?? 0) >= Number(t.order ?? 0))
    if (lt.contido === false) {
      saida.push({ tipo: 'transformacao-nao-suportada', camadas: [t.id, ...acima.map((c) => c.id)], motivo: `texto ${t.id}: ${lt.motivo}` })
      continue
    }
    const ocluidoras: string[] = []
    for (const c of acima) {
      const lc = limitesDe(c, porId.get(c.id))
      if (lc.contido === false) {
        if (!naoSuportadas.has(c.id)) {
          naoSuportadas.add(c.id)
          saida.push({ tipo: 'transformacao-nao-suportada', camadas: [c.id], motivo: `${c.id}: ${lc.motivo}` })
        }
        continue
      }
      if (intersecao(lc.rect, lt.rect) <= 0) continue
      // Exceção 1 — texto sobre texto é `colisao` (ambos simples, sem rotação, com métrica, sem folha expansora, regra avaliada),
      // e a interseção dos glifos fica DENTRO da tolerância de `colisao` (política 9.7); acima dela, `colisao` acusa.
      if (c.type === 'text' && t.type === 'text' && limpo(c) && limpo(t) && comMetrica(c) && comMetrica(t) && cobertura.colisao?.estado === 'avaliada') {
        const a = porId.get(c.id)!
        const b = porId.get(t.id)!
        const overlapV = Math.min(a.glyphBottom, b.glyphBottom) - Math.max(a.glyphTop, b.glyphTop)
        const overlapH = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x)
        const tol = toleranciaDeColisao(a, b, encaixeEntre(c, t))
        if (!(overlapV > tol.vertical && overlapH > tol.horizontal)) continue
        // Acima da tolerância: `colisao` acusa (reprova por achado); aqui também é oclusão — fail-closed, nunca aprova.
      }
      // Exceção 2 — logo solta sobre texto é `logo-sobre-texto` (AMBOS limpos, texto com métrica, regra avaliada).
      if (logosSoltas.has(c.id) && limpo(c) && limpo(t) && comMetrica(t) && cobertura['logo-sobre-texto']?.estado === 'avaliada') continue
      ocluidoras.push(c.id)
    }
    if (ocluidoras.length > 0) saida.push({ tipo: 'oclusao', texto: t.id, acima: ocluidoras })
  }
  return saida
}

// ─────────────────────────────────────────────────────────────────────────
// O veredito
// ─────────────────────────────────────────────────────────────────────────

const ehCritica = (r: string): r is RegraCritica => (REGRAS_CRITICAS as readonly string[]).includes(r)

/** Achado crítico — predicado executável (4.1), com a ÚNICA exceção declarada (assunto estimado com `estimado: 'comprova'`). */
export function achadoCritico(a: AchadoDaRevisao, politica: PoliticaDoAssunto): boolean {
  if (!ehCritica(a.regra)) return false
  if (a.certeza === 'medida') return true
  return a.regra === 'texto-sobre-assunto' && a.certeza === 'estimada' && politica.estimado === 'comprova'
}

export function gateDaMedida(entrada: EntradaDoGate): { gate: GateDaArte; relatorio: RelatorioDaRevisao } {
  const { medida, identidade, politicaDoAssunto: politica } = entrada
  const relatorio = avaliarPeca(medida as EntradaDaRevisao)
  const cobertura = {} as Record<RegraCritica | ConferenciaDoGate, CoberturaDoGate>
  const motivos: MotivoDoGate[] = []
  const achados: GateDaArte['achados'] = []
  const naoMedidos: GateDaArte['naoMedidos'] = []
  const avisos: string[] = []
  const camadas = medida.camadas
  const textosVisiveis = camadas.filter(ehTextoVisivel)

  const naoComprovada = (regra: RegraCritica | ConferenciaDoGate, motivo: string, ids: string[] = []) => {
    cobertura[regra] = { estado: 'nao-comprovada', motivo }
    motivos.push({ regra, codigo: 'NAO_COMPROVADA', motivo, camadas: ids })
  }
  const reprovada = (regra: RegraCritica, lista: AchadoDaRevisao[]) => {
    cobertura[regra] = { estado: 'reprovada', achados: lista.map((a) => a.id) }
    for (const a of lista) {
      achados.push({ regra, camadas: a.camadas, id: a.id, severidade: a.severidade, certeza: a.certeza === 'estimada' ? 'estimada' : 'medida' })
      motivos.push({ regra, codigo: 'ACHADO_CRITICO', motivo: a.mensagem, camadas: a.camadas })
    }
  }

  for (const regra of REGRAS_CRITICAS) {
    const cob = relatorio.cobertura[regra]
    const daRegra = relatorio.achados.filter((a) => a.regra === regra)
    const criticos = daRegra.filter((a) => achadoCritico(a, politica))
    const estimados = daRegra.filter((a) => a.certeza === 'estimada' && !achadoCritico(a, politica))

    if (regra === 'texto-sobre-assunto') {
      decidirAssunto({ medida, cob, criticos, estimados, politica, reprovada, naoComprovada, avisos, cobertura })
      continue
    }
    if (criticos.length > 0) {
      reprovada(regra, criticos)
      continue
    }
    if (regra === 'fonte-nao-carregada') {
      if (medida.motivoSemFontes) naoComprovada(regra, medida.motivoSemFontes)
      else if (cob?.estado !== 'avaliada') naoComprovada(regra, cob?.motivo ?? 'regra sem cobertura')
      else if (estimados.length > 0) naoComprovada(regra, `achado só estimado: ${estimados.map((a) => a.id).join(', ')}`, estimados.flatMap((a) => a.camadas))
      else cobertura[regra] = { estado: 'comprovada' }
      continue
    }
    if (regra === 'logo-sem-leitura') {
      const leitura = medida.leituraDaLogo
      if (leitura === null || leitura === undefined) naoComprovada(regra, medida.motivoSemLeituraDaLogo ?? 'a leitura da logo não rodou')
      else if (leitura.some((x) => x.estado !== 'medida')) {
        const ruins = leitura.filter((x) => x.estado !== 'medida')
        for (const x of ruins) naoMedidos.push({ regra, motivo: `logo ${x.camada}: ${x.estado}${x.motivo ? ` (${x.motivo})` : ''}`, camadas: [x.camada] })
        naoComprovada(regra, `logo não medida: ${ruins.map((x) => `${x.camada} (${x.estado})`).join(', ')}`, ruins.map((x) => x.camada))
      } else if (cob?.estado !== 'avaliada') naoComprovada(regra, cob?.motivo ?? 'regra sem cobertura')
      else if (estimados.length > 0) naoComprovada(regra, `achado só estimado: ${estimados.map((a) => a.id).join(', ')}`)
      else {
        cobertura[regra] = { estado: 'comprovada' }
        if (leitura.length === 0) avisos.push('peça sem logo solta: a ausência de logo é decisão de composição, não defeito medido')
      }
      continue
    }
    // Regras de texto
    if (textosVisiveis.length === 0) {
      cobertura[regra] = { estado: 'nao-se-aplica', motivo: 'a peça não tem texto visível' }
      continue
    }
    if (medida.motivoSemMedida) {
      naoComprovada(regra, medida.motivoSemMedida)
      continue
    }
    if (medida.textosSemMetrica && medida.textosSemMetrica.length > 0) {
      naoComprovada(regra, `texto sem métrica: ${medida.textosSemMetrica.join(', ')}`, medida.textosSemMetrica)
      continue
    }
    if (regra === 'texto-sem-leitura' || regra === 'tratamento-piorou-leitura') {
      if (medida.contraste === null) {
        naoComprovada(regra, 'a régua de contraste não mediu')
        continue
      }
      if (regra === 'tratamento-piorou-leitura' && medida.pioras === null) {
        naoComprovada(regra, 'as pioras de tratamento não foram medidas')
        continue
      }
    }
    if (cob?.estado !== 'avaliada') {
      naoComprovada(regra, cob?.motivo ?? 'regra sem cobertura')
      continue
    }
    if (estimados.length > 0) {
      naoComprovada(regra, `achado só estimado: ${estimados.map((a) => a.id).join(', ')}`, estimados.flatMap((a) => a.camadas))
      continue
    }
    cobertura[regra] = { estado: 'comprovada' }
  }
  // Geometria não medida também vai para `naoMedidos` (uma vez), para o leitor.
  if (medida.textosSemMetrica && medida.textosSemMetrica.length > 0) naoMedidos.push({ regra: 'geometria', motivo: 'textos visíveis que o medidor não mediu', camadas: medida.textosSemMetrica })

  // Oclusão (seção 6)
  const cenarios = cenariosNaoMedidos(medida, relatorio.cobertura)
  if (cenarios.length === 0) cobertura.oclusao = { estado: 'comprovada' }
  else {
    const descricoes = cenarios.map((c) => (c.tipo === 'oclusao' ? `${c.texto} sob ${c.acima.join(', ')}` : c.motivo))
    cobertura.oclusao = { estado: 'nao-comprovada', motivo: descricoes.join('; ') }
    for (const c of cenarios) {
      const ids = c.tipo === 'oclusao' ? [c.texto, ...c.acima] : c.camadas
      const motivo = c.tipo === 'oclusao' ? `camada acima do texto ${c.texto} que intersecta os seus limites: ${c.acima.join(', ')}` : `transformação não suportada: ${c.motivo}`
      naoMedidos.push({ regra: 'oclusao', motivo, camadas: ids })
      motivos.push({ regra: 'oclusao', codigo: 'NAO_MEDIDO', motivo, camadas: ids })
    }
  }

  // Copy completa (4.4)
  const copy = entrada.copy
  if (!copy) naoComprovada('copy-completa', 'quem chamou não conferiu a copy')
  else if (copy.estado === 'sem-mudanca' && copy.lacunas.length === 0) cobertura['copy-completa'] = { estado: 'comprovada' }
  else if (copy.estado === 'sem-mudanca') naoComprovada('copy-completa', `lacunas: ${copy.lacunas.join('; ')}`)
  else naoComprovada('copy-completa', `copy ${copy.estado}`)

  // Piso de interface (4.3)
  if (medida.formato !== 'story') cobertura['piso-de-interface'] = { estado: 'nao-se-aplica', motivo: 'piso de interface só no story' }
  else {
    const piso = pisoDeInterface(camadas, medida.canvas, interfaceDoStory(), medida.metricas)
    for (const n of piso.naoMedidos) naoMedidos.push({ regra: 'piso-de-interface', motivo: n.motivo, camadas: [n.camada] })
    if (piso.fora.length > 0) {
      cobertura['piso-de-interface'] = { estado: 'reprovada', achados: piso.fora.map((f) => `piso-de-interface:${f.camada}`) }
      motivos.push({ regra: 'piso-de-interface', codigo: 'ACHADO_CRITICO', motivo: `fora da faixa livre da interface (topo ${PISO_DE_INTERFACE_DO_STORY.topo}, rodapé ${PISO_DE_INTERFACE_DO_STORY.rodape}): ${piso.fora.map((f) => f.camada).join(', ')}`, camadas: piso.fora.map((f) => f.camada) })
    } else if (piso.naoMedidos.length > 0) naoComprovada('piso-de-interface', `geometria não comprovável: ${piso.naoMedidos.map((n) => n.camada).join(', ')}`, piso.naoMedidos.map((n) => n.camada))
    else cobertura['piso-de-interface'] = { estado: 'comprovada' }
  }

  // Identidade (2.2)
  if (identidade.pageVersion === null) {
    cobertura.identidade = { estado: 'nao-comprovada', motivo: 'camadas ilegíveis' }
    motivos.push({ regra: 'identidade', codigo: 'IDENTIDADE_ILEGIVEL', motivo: 'identidade: camadas ilegíveis', camadas: [] })
  } else cobertura.identidade = { estado: 'comprovada' }

  // Ordem determinística dos motivos: críticas na ordem de REGRAS_CRITICAS, depois as conferências.
  const ordem = [...REGRAS_CRITICAS, ...CONFERENCIAS_DO_GATE] as string[]
  motivos.sort((a, b) => ordem.indexOf(a.regra) - ordem.indexOf(b.regra))

  const gate: GateDaArte = {
    versao: 'gate-v1',
    resultado: motivos.length === 0 ? 'APTO' : 'REVISAO_HUMANA_NECESSARIA',
    rulesVersion: relatorio.versaoDasRegras,
    pageVersion: identidade.pageVersion,
    copyVersion: identidade.copyVersion,
    cobertura,
    motivos,
    achados,
    naoMedidos,
    avisos,
  }
  return { gate, relatorio }
}

function decidirAssunto(args: {
  medida: MedidaDaPeca
  cob: RelatorioDaRevisao['cobertura']['texto-sobre-assunto']
  criticos: AchadoDaRevisao[]
  estimados: AchadoDaRevisao[]
  politica: PoliticaDoAssunto
  reprovada: (regra: RegraCritica, lista: AchadoDaRevisao[]) => void
  naoComprovada: (regra: RegraCritica, motivo: string, ids?: string[]) => void
  avisos: string[]
  cobertura: Record<RegraCritica | ConferenciaDoGate, CoberturaDoGate>
}): void {
  const regra = 'texto-sobre-assunto'
  const { medida, cob, criticos, estimados, politica, reprovada, naoComprovada, avisos, cobertura } = args
  const fundo = fotoDeFundo(medida.camadas, medida.canvas)
  // E — sem foto de fundo: não se aplica, sempre.
  if (!fundo) {
    cobertura[regra] = { estado: 'nao-se-aplica', motivo: 'a peça não tem foto de fundo' }
    return
  }
  // C' — camada de foto visível SEM arquivo: nada foi lido (fail-closed, sempre).
  if (typeof fundo.fileUrl !== 'string' || fundo.fileUrl.trim() === '') {
    naoComprovada(regra, 'foto de fundo sem arquivo: nada foi lido', [fundo.id])
    return
  }
  if (medida.assunto) {
    if (medida.assunto.origem === 'catalogo') {
      if (criticos.length > 0) reprovada(regra, criticos)
      else if (cob?.estado !== 'avaliada') naoComprovada(regra, cob?.motivo ?? 'regra sem cobertura')
      else cobertura[regra] = { estado: 'comprovada' }
      return
    }
    // B — estimado
    if (politica.estimado === 'humano') {
      const alvo = estimados.length > 0 ? ` (achado estimado: ${estimados.map((a) => a.id).join(', ')})` : ''
      naoComprovada(regra, `assunto só estimado pela textura da foto${alvo}`, estimados.flatMap((a) => a.camadas))
      return
    }
    if (criticos.length > 0) reprovada(regra, criticos)
    else if (cob?.estado !== 'avaliada') naoComprovada(regra, cob?.motivo ?? 'regra sem cobertura')
    else cobertura[regra] = { estado: 'comprovada' }
    return
  }
  // C — foto LIDA sem assunto localizável
  if (medida.assuntoNaoSeAplica) {
    if (politica.semAssuntoLocalizavel === 'nao-se-aplica') {
      cobertura[regra] = { estado: 'nao-se-aplica', motivo: medida.motivoSemAssunto ?? 'foto lida sem assunto localizável' }
      avisos.push('foto sem assunto localizável: a regra texto-sobre-assunto não se aplica (política do assunto)')
    } else naoComprovada(regra, medida.motivoSemAssunto ?? 'foto lida sem assunto localizável (política: humano)')
    return
  }
  // D — falha ao analisar a foto: fail-closed, sempre.
  naoComprovada(regra, medida.motivoSemAssunto ?? 'o assunto da foto não foi estimado')
}
