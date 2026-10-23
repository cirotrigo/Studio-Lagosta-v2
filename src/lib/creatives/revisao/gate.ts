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
import { DIMENSOES } from '@/lib/compositor/spec'

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

/** A versão da DECISÃO do gate (CP5b § 5): bump obrigatório cobrado pela impressão digital `gate-<versao>.json`. */
export const VERSAO_DO_GATE = 'gate-v4' as const

export interface GateDaArte {
  versao: typeof VERSAO_DO_GATE
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
/** PROPOSTA nomeada do CP5a (decisão 9.1): não é padrão de nada — `gateDaMedida` exige a política explicitamente. A EFETIVA é `POLITICA_DO_ASSUNTO_DO_GATE` (`lotes/agendamento.ts`): o caso C foi DECIDIDO pelo owner em 17/10/2026 como `'humano'` (fora desta proposta); o caso B continua esta proposta. */
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
    // Configuração do cliente NUNCA afrouxa: só número finito acima do piso aperta (`NaN` em `Math.max` dava `NaN` — Codex R9).
    topo: Number.isFinite(doCliente?.topo) ? Math.max(PISO_DE_INTERFACE_DO_STORY.topo, doCliente!.topo!) : PISO_DE_INTERFACE_DO_STORY.topo,
    rodape: Number.isFinite(doCliente?.rodape) ? Math.max(PISO_DE_INTERFACE_DO_STORY.rodape, doCliente!.rodape!) : PISO_DE_INTERFACE_DO_STORY.rodape,
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
  'style.gradientStops.*': inerte([{ id: 'a', color: '#000000', position: 0, opacity: 1 }, { id: 'b', color: '#ff0000', position: 1, opacity: 1 }]),
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
  'style.manterProporcao': inerte(true), // CP-V1: só a trava do gesto de redimensionar no editor; o render não a lê
  'style.vetor.*': inerte({ asset: { id: 'moldura-fina', versao: 1 }, papeis: { contorno: 'texto' } }), // CP-V2c: proveniência do catálogo (item, versão, papel por canal); nenhum renderer a lê
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
  'style.tracoPontas': naoSuportada, // pontas do contorno do svg-path (src/lib/vetor), CP-V0
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
  // A VERDADE JS do render (`if (style.flipH)`, `if (efeito?.enabled)`): `' '`, `[]` e `{}` LIGAM o desenho (Codex R7/R8).
  // Só NaN diverge, para o lado conservador: é falso em JS, mas aqui conta como efetivo.
  if (typeof v === 'number') return v !== 0
  return Boolean(v)
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
        // Chave fora da árvore COM valor efetivo: não suportada. Sem valor (0, '', null, {}): inerte por construção —
        // e a varredura CONTINUA (Codex R1: parar aqui deixava passar `{ escala: 0, filter: 'blur(20px)' }`).
        if (valorEfetivo(v)) return caminho
        continue
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

/** O retângulo CALCULADO tem de ser finito (Codex, revisão final R2: `rotation: 1e308` → radianos Infinity → sin/cos NaN). */
function limitesFinitos(rect: Rect): Limites {
  return [rect.x, rect.y, rect.width, rect.height].every((v) => Number.isFinite(v)) ? { contido: true, rect } : { contido: false, motivo: 'limites não finitos (rotação ou geometria fora de escala)' }
}

/** Folga de 1 px para o antialias do render: os limites CONTÊM o desenho, nunca faltam. */
export const FOLGA_DE_ANTIALIAS = 1

const FORMAS_NA_CAIXA = new Set(['rectangle', 'rounded-rectangle'])
const FORMAS_CENTRADAS = new Set(['circle', 'triangle', 'star'])
const FORMAS_AGUDAS = new Set(['triangle', 'star'])

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A geometria básica tem de ser NÚMERO finito (revisão final do owner: `position.x: 'abc'`, `size.width: NaN` ou
 * `shadowOffsetX: 'muito'` viravam NaN, a interseção falhava e a camada passava como se estivesse abaixo — falso APTO).
 */
function geometriaInvalida(l: Layer): string | null {
  const p = l.position as { x?: unknown; y?: unknown } | undefined
  const sz = l.size as { width?: unknown; height?: unknown } | undefined
  if (!p || !finito(p.x) || !finito(p.y)) return 'position não numérica'
  if (!sz || !finito(sz.width) || !finito(sz.height) || sz.width < 0 || sz.height < 0) return 'size não numérica ou negativa'
  return null
}

/** `order` ausente/`null` é 0 (como o render, `a.order ?? 0`); qualquer outro valor não finito é inválido. */
function ordemDe(l: Layer): number | 'invalida' {
  const o = (l as { order?: unknown }).order
  if (o === undefined || o === null) return 0
  return finito(o) ? o : 'invalida'
}

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
  const total = Math.max(0, traco) + Math.max(0, desfoque) + Math.max(0, sombra)
  // Valor não numérico num efeito (ex.: `shadowOffsetX: 'muito'`) → NaN: não é "sem expansão", é expansão desconhecida.
  return Number.isFinite(total) ? total : Number.POSITIVE_INFINITY
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
  const geo = geometriaInvalida(l)
  if (geo) return { contido: false, motivo: geo }
  const graus = rotacaoDe(l)
  if (graus === 'invalida') return { contido: false, motivo: 'rotation de tipo inesperado' }
  const expansao = expansaoDe(l)
  if (!Number.isFinite(expansao)) return { contido: false, motivo: 'efeito com valor não numérico' }
  const w = l.size.width
  const h = l.size.height
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
  const expandida = expandir(local, expansao + FOLGA_DE_ANTIALIAS)
  return limitesFinitos(graus === 0 ? { x: l.position.x + expandida.x, y: l.position.y + expandida.y, width: expandida.width, height: expandida.height } : envolventeGirada(l, expandida, graus))
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
  const geo = geometriaInvalida(l)
  if (geo) return { contido: false, motivo: geo }
  const graus = rotacaoDe(l)
  if (graus === 'invalida') return { contido: false, motivo: 'rotation de tipo inesperado' }
  const expansao = expansaoDe(l)
  if (!Number.isFinite(expansao)) return { contido: false, motivo: 'efeito com valor não numérico' }
  if (![metrica.glyphTop, metrica.glyphBottom, metrica.maxLineWidth].every(finito)) return { contido: false, motivo: 'métrica não numérica' }
  const w = l.size.width
  const h = l.size.height
  // União da caixa com os glifos, em coordenadas LOCAIS (a métrica é medida no referencial sem rotação).
  const gTop = metrica.glyphTop - l.position.y
  const gBottom = metrica.glyphBottom - l.position.y
  const x0 = 0
  const y0 = Math.min(0, gTop)
  const x1 = Math.max(w, metrica.maxLineWidth)
  const y1 = Math.max(h, gBottom)
  const expandida = expandir({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, expansao + FOLGA_DE_ANTIALIAS)
  return limitesFinitos(graus === 0 ? { x: l.position.x + expandida.x, y: l.position.y + expandida.y, width: expandida.width, height: expandida.height } : envolventeGirada(l, expandida, graus))
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
  // A métrica só vale para a camada quando é ÚNICA por id e descreve a MESMA caixa (Codex, revisão final: métrica
  // duplicada ou de outra caixa não prova que a regra examinou este par).
  const contagem = new Map<string, number>()
  for (const m of medida.metricas) contagem.set(m.layerId, (contagem.get(m.layerId) ?? 0) + 1)
  const porId = new Map<string, TextLayerMetrics>()
  for (const m of medida.metricas) {
    const l = medida.camadas.find((c) => c.id === m.layerId)
    const coerente = !!l && contagem.get(m.layerId) === 1 && m.box.x === l.position?.x && m.box.y === l.position?.y && m.box.width === l.size?.width && m.box.height === l.size?.height
    if (coerente) porId.set(m.layerId, m)
  }
  const semMetrica = new Set(medida.textosSemMetrica ?? [])
  const comMetrica = (l: Layer) => !medida.motivoSemMedida && porId.has(l.id) && !semMetrica.has(l.id)
  const logosSoltas = new Set(logosDaPeca(medida.camadas).map((l) => l.id))
  const visiveis = medida.camadas.filter((l) => l.visible !== false)
  const naoSuportadas = new Set<string>()
  const limpo = (l: Layer) => rotacaoDe(l) === 0 && !temFolhaExpansora(l) && !valorEfetivo(l.style?.filter)

  for (const t of visiveis.filter(ehTextoVisivel)) {
    const lt = limitesDoTexto(t, porId.get(t.id), 'protegido')
    const ordemT = ordemDe(t)
    if (ordemT === 'invalida') {
      // Sem ordem numérica não há como saber o que está acima: tudo o que é visível pode estar (fail-closed).
      saida.push({ tipo: 'transformacao-nao-suportada', camadas: [t.id, ...visiveis.filter((c) => c.id !== t.id).map((c) => c.id)], motivo: `texto ${t.id}: order não numérica` })
      continue
    }
    // Camada com `order` não numérica: o render não sabe ordená-la — conta como ACIMA de todo texto (fail-closed).
    const acima = visiveis.filter((c) => c.id !== t.id && (ordemDe(c) === 'invalida' || (ordemDe(c) as number) >= ordemT))
    if (lt.contido === false) {
      saida.push({ tipo: 'transformacao-nao-suportada', camadas: [t.id, ...acima.map((c) => c.id)], motivo: `texto ${t.id}: ${lt.motivo}` })
      continue
    }
    const ocluidoras: string[] = []
    for (const c of acima) {
      const lc = ordemDe(c) === 'invalida' ? ({ contido: false, motivo: 'order não numérica' } as const) : limitesDe(c, porId.get(c.id))
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
      // Exceção 2 — logo solta sobre texto é `logo-sobre-texto` (AMBOS limpos, texto com métrica, regra avaliada). Só para
      // `logo`/`image`: a regra compara a caixa de CANTO (`rectDaCamada`), e uma `shape` com id "logo" (círculo, centrado
      // em `position`) entra em `logosDaPeca` sem que a caixa da regra represente o desenho (Codex, revisão final R4).
      if (logosSoltas.has(c.id) && (c.type === 'logo' || c.type === 'image') && limpo(c) && limpo(t) && comMetrica(t) && cobertura['logo-sobre-texto']?.estado === 'avaliada') continue
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

/**
 * Chaves que mudam os PIXELS ou o recorte da logo no render e que a medição do CP3 (`medirLogosDaPeca`, que lê o
 * ARQUIVO) não reproduz — o guard do CP3 só vê rotação, opacidade, `crop`, `cover` e `flipX/flipY`. Logo solta com
 * qualquer uma delas efetiva: a leitura medida não representa o que será publicado → não comprovada (Codex, revisão
 * final R4: `invert`, `flipH`, `mask`).
 */
const CHAVES_QUE_A_LEITURA_DA_LOGO_NAO_VE = ['flipH', 'flipV', 'mask', 'filter', 'blur', 'exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'saturation', 'vignette', 'grayscale', 'sepia', 'invert'] as const

/** A logo cuja leitura (CP3) pode representar o render: tipo `logo`/`image` com arquivo e sem chave que a medição não vê. */
/**
 * O que o render faz com a IMAGEM de uma camada e que nenhuma leitura de ARQUIVO reproduz — vale para a logo (CP3) e
 * para a foto de fundo (assunto): estilo de pixel/recorte, borda, sombra, efeitos ligados, opacidade e rotação.
 */
function chavesQueALeituraDoArquivoNaoVe(l: Layer): string[] {
  const style = (l.style ?? {}) as Record<string, unknown>
  const ruins: string[] = CHAVES_QUE_A_LEITURA_DA_LOGO_NAO_VE.filter((k) => valorEfetivo(style[k]))
  // Codex R5: `border.radius` RECORTA os cantos da imagem no render (:1681-1683); `border.width` pinta tinta sobre ela;
  // sombra, desfoque e traço (qualquer folha expansora) mudam a composição — nada disso entra na leitura do arquivo.
  const border = style.border as { radius?: unknown; width?: unknown } | undefined
  if (valorEfetivo(border?.radius)) ruins.push('border.radius')
  if (valorEfetivo(border?.width)) ruins.push('border.width')
  if (valorEfetivo(style.shadow)) ruins.push('style.shadow')
  const fx = (l.effects ?? {}) as Record<string, { enabled?: unknown } | undefined>
  // O render liga o efeito por VERDADE JS (`if (efeito?.enabled)`), não por `=== true` (Codex R6: `enabled: 1`).
  for (const k of ['shadow', 'blur', 'stroke', 'background', 'curved'] as const) if (valorEfetivo(fx[k]?.enabled)) ruins.push(`effects.${k}`)
  // Opacidade: o render coage ("0.5" → 0,5) e o CP3 só recusa NÚMERO abaixo de 1 — aqui só passa número finito igual a 1.
  // `null` conta: o render aplica a opacidade sempre que a chave EXISTE (`!== undefined`), e `Math.min(1, null)` é 0 —
  // a logo some da arte (Codex R7).
  const opacidade = style.opacity
  if (opacidade !== undefined && (typeof opacidade !== 'number' || !Number.isFinite(opacidade) || opacidade < 1)) ruins.push('opacity')
  // Rotação: o render coage (`rotation: '90'` gira) e o CP3 só recusa NÚMERO; abaixo dos textos, nem a oclusão olha a logo (Codex R8).
  if (valorEfetivo((l as { rotation?: unknown }).rotation)) ruins.push('rotation')
  return ruins
}

function leituraDaLogoRepresentaORender(l: Layer): string | null {
  if (l.type !== 'logo' && l.type !== 'image') return `camada ${l.id} é ${String(l.type)}, não logo/imagem`
  if (typeof l.fileUrl !== 'string' || l.fileUrl.trim() === '') return `camada ${l.id} sem arquivo`
  const ruins = chavesQueALeituraDoArquivoNaoVe(l)
  return ruins.length > 0 ? `logo ${l.id} desenhada com ${ruins.join(', ')}: a leitura medida no arquivo não representa o render` : null
}

/**
 * Chaves da FOTO DE FUNDO que mudam o que o render mostra e que `assuntoDaPeca` (revisar-arte.ts) não considera: o
 * assunto gravado é reaproveitado por arquivo + formato + `cropPosition`, e a estimativa também lê só `cropPosition` —
 * o recorte manual (`style.crop`, que o render prioriza), espelho, máscara, filtro e desfoque deslocam ou alteram o
 * assunto sem a medida saber (Codex R5). Fail-closed: `texto-sobre-assunto` não comprovada.
 */
const CHAVES_DO_FUNDO_QUE_O_ASSUNTO_NAO_VE = ['crop', 'flipX', 'flipY'] as const
/**
 * Codex R6: o assunto é medido como se a foto fosse UM cover do canvas inteiro (`lerFotoComoCover(bytes, canvas, …)`,
 * e o retângulo gravado é da peça composta). Qualquer outra composição desloca o que aparece sem a medida saber:
 * `objectFit` que não seja `cover` (o render estica a imagem inteira, image-fit.ts), caixa fora de (0,0,canvas),
 * rotação, filtros de pixel, e uma SEGUNDA foto visível (o revisor só olha `bg-foto`, regras.ts `fotoDeFundo`).
 */
function assuntoRepresentaORender(fundo: Layer, canvas: { width: number; height: number }, camadas: Layer[]): { motivo: string; camadas: string[] } | null {
  const style = (fundo.style ?? {}) as Record<string, unknown>
  // Codex R10: sombra, borda, opacidade e efeitos do FUNDO também mudam a composição (um PNG com sujeito e sombra deslocada
  // publica uma segunda silhueta) — a mesma lista da logo, mais o recorte manual e o espelho do contrato do CP3.
  const ruins: string[] = [...chavesQueALeituraDoArquivoNaoVe(fundo), ...CHAVES_DO_FUNDO_QUE_O_ASSUNTO_NAO_VE.filter((k) => valorEfetivo(style[k]))]
  if (style.objectFit !== 'cover') ruins.push(`objectFit ${JSON.stringify(style.objectFit ?? null)} (a medida lê a foto como cover)`)
  const { x, y } = fundo.position ?? ({} as { x?: unknown; y?: unknown })
  const { width, height } = fundo.size ?? ({} as { width?: unknown; height?: unknown })
  if (x !== 0 || y !== 0 || width !== canvas.width || height !== canvas.height) ruins.push('caixa diferente do canvas (a medida lê a foto cobrindo o canvas inteiro)')
  // `cropPosition`: o medidor omite `''` (cai no centro) e o render passa `''` ao recorte (cai em esquerda/topo) — só os
  // nove valores que os dois leem igual passam (Codex R8).
  const corte = style.cropPosition
  if (corte !== undefined && corte !== null && !/^(left|center|right)-(top|middle|bottom)$/.test(String(corte))) ruins.push(`cropPosition ${JSON.stringify(corte)}`)
  const logos = new Set(logosDaPeca(camadas).map((l) => l.id))
  // `element` é desenhado pelo MESMO `renderImage` que `image` (render-engine.ts, `case 'logo': case 'element':`); só o
  // tipo `logo` fica de fora — é logo por definição, e a solta já passa por `logo-sobre-texto` (Codex R7).
  const outrasFotos = camadas.filter((l) => l !== fundo && l.visible !== false && (l.type === 'image' || l.type === 'element') && !logos.has(l.id))
  if (outrasFotos.length > 0) ruins.push(`segunda foto visível (${outrasFotos.map((l) => l.id).join(', ')}): o revisor só mede o assunto de ${fundo.id}`)
  return ruins.length > 0 ? { motivo: `foto de fundo desenhada com ${ruins.join('; ')}: o assunto medido não representa o render`, camadas: [fundo.id, ...outrasFotos.map((l) => l.id)] } : null
}

export interface DecisaoDaCritica {
  cobertura: CoberturaDoGate
  /** Os achados que reprovaram (só quando `cobertura.estado === 'reprovada'`). */
  reprovam: AchadoDaRevisao[]
  naoMedidos: GateDaArte['naoMedidos']
  avisos: string[]
  /** Camadas citadas no motivo de uma não comprovação. */
  camadas: string[]
}

/**
 * A decisão de UMA regra crítica, lida da MEDIDA e da cobertura do relatório (4.2 e 5 do contrato). Exportada para o
 * teste forjar coberturas que o revisor de hoje não produz (G18: `naoSeAplica` fora de `texto-sobre-assunto`).
 */
/** Regras cuja medida lê PIXELS do render parado (régua, pioras, leitura da logo, assunto): não valem com camada em movimento. */
const REGRAS_QUE_LEEM_O_QUADRO: ReadonlySet<RegraCritica> = new Set<RegraCritica>(['texto-sem-leitura', 'tratamento-piorou-leitura', 'logo-sem-leitura', 'texto-sobre-assunto'])

export function decidirCritica(args: {
  regra: RegraCritica
  medida: MedidaDaPeca
  cob: RelatorioDaRevisao['cobertura'][RegraCritica] | undefined
  achados: AchadoDaRevisao[]
  politica: PoliticaDoAssunto
}): DecisaoDaCritica {
  const { regra, medida, cob, politica } = args
  const daRegra = args.achados.filter((a) => a.regra === regra)
  const criticos = daRegra.filter((a) => achadoCritico(a, politica))
  const estimados = daRegra.filter((a) => a.certeza === 'estimada' && !achadoCritico(a, politica))
  const textosVisiveis = medida.camadas.filter(ehTextoVisivel)
  const nc = (motivo: string, camadas: string[] = []): DecisaoDaCritica => ({ cobertura: { estado: 'nao-comprovada', motivo }, reprovam: [], naoMedidos: [], avisos: [], camadas })
  // Qualquer camada em MOVIMENTO (Codex R8/R9): a página com áudio publica o quadro do movimento (`camadasNoInstante` anima
  // qualquer `image`; `afastar` começa em 1,15×), e TODA medida que lê pixels — régua dos textos, pioras, leitura da logo
  // (medida contra um render parado), assunto — é do quadro parado. Fail-closed nessas regras até o owner decidir a
  // política (excluir páginas com movimento do gate autônomo, ou medir o quadro publicado).
  // Vídeo idem (Codex R10): o render parado NÃO desenha `video` (render-engine.ts, `default`), mas a página com vídeo é
  // publicada como MP4 com ele — abaixo do texto a oclusão não o examina, e a régua foi medida sem ele. O contrato só
  // previa vídeo ACIMA do texto como não medido; este é um desvio conservador, declarado para o owner.
  const emMovimento = medida.camadas.filter((l) => l.visible !== false && (l.type === 'video' || valorEfetivo((l as { movimento?: unknown }).movimento))).map((l) => l.id)
  if (emMovimento.length > 0 && REGRAS_QUE_LEEM_O_QUADRO.has(regra)) return nc(`camada em movimento ou vídeo (${emMovimento.join(', ')}): a medida é do quadro parado e a página com áudio/vídeo publica outro quadro`, emMovimento)
  const ok = (avisos: string[] = []): DecisaoDaCritica => ({ cobertura: { estado: 'comprovada' }, reprovam: [], naoMedidos: [], avisos, camadas: [] })
  const nsa = (motivo: string, avisos: string[] = []): DecisaoDaCritica => ({ cobertura: { estado: 'nao-se-aplica', motivo }, reprovam: [], naoMedidos: [], avisos, camadas: [] })
  const rep = (lista: AchadoDaRevisao[]): DecisaoDaCritica => ({ cobertura: { estado: 'reprovada', achados: lista.map((a) => a.id) }, reprovam: lista, naoMedidos: [], avisos: [], camadas: [] })
  const soEstimado = () => nc(`achado só estimado: ${estimados.map((a) => a.id).join(', ')}`, estimados.flatMap((a) => a.camadas))

  if (regra === 'texto-sobre-assunto') return decidirAssunto({ medida, cob, criticos, estimados, politica, nc, ok, nsa, rep })
  if (criticos.length > 0) return rep(criticos)
  if (regra === 'fonte-nao-carregada') {
    if (medida.motivoSemFontes) return nc(medida.motivoSemFontes)
    if (cob?.estado !== 'avaliada') return nc(cob?.motivo ?? 'regra sem cobertura')
    if (estimados.length > 0) return soEstimado()
    return ok()
  }
  if (regra === 'logo-sem-leitura') {
    const leitura = medida.leituraDaLogo
    if (leitura === null || leitura === undefined) return nc(medida.motivoSemLeituraDaLogo ?? 'a leitura da logo não rodou')
    // Codex (revisão final): a lista tem de cobrir TODA logo solta da peça — logo sem entrada não foi medida.
    const camadasSoltas = logosDaPeca(medida.camadas)
    const soltas = camadasSoltas.map((l) => l.id)
    const naoRepresentam = camadasSoltas.map(leituraDaLogoRepresentaORender).filter((m): m is string => m !== null)
    if (naoRepresentam.length > 0) {
      const ruins = camadasSoltas.filter((l) => leituraDaLogoRepresentaORender(l) !== null)
      const d = nc(naoRepresentam.join('; '), ruins.map((l) => l.id))
      d.naoMedidos = ruins.map((l) => ({ regra, motivo: leituraDaLogoRepresentaORender(l)!, camadas: [l.id] }))
      return d
    }
    const lidas = new Set(leitura.map((x) => x.camada))
    const semLeitura = soltas.filter((id) => !lidas.has(id))
    if (semLeitura.length > 0) {
      const d = nc(`logo solta sem leitura: ${semLeitura.join(', ')}`, semLeitura)
      d.naoMedidos = semLeitura.map((id) => ({ regra, motivo: `logo ${id}: sem entrada em leituraDaLogo`, camadas: [id] }))
      return d
    }
    const ruins = leitura.filter((x) => x.estado !== 'medida')
    if (ruins.length > 0) {
      const d = nc(`logo não medida: ${ruins.map((x) => `${x.camada} (${x.estado})`).join(', ')}`, ruins.map((x) => x.camada))
      d.naoMedidos = ruins.map((x) => ({ regra, motivo: `logo ${x.camada}: ${x.estado}${x.motivo ? ` (${x.motivo})` : ''}`, camadas: [x.camada] }))
      return d
    }
    if (cob?.estado !== 'avaliada') return nc(cob?.motivo ?? 'regra sem cobertura')
    if (estimados.length > 0) return soEstimado()
    return ok(soltas.length === 0 ? ['peça sem logo solta: a ausência de logo é decisão de composição, não defeito medido'] : [])
  }
  // Regras de texto
  if (textosVisiveis.length === 0) return nsa('a peça não tem texto visível')
  if (medida.motivoSemMedida) return nc(medida.motivoSemMedida)
  if (medida.textosSemMetrica && medida.textosSemMetrica.length > 0) return nc(`texto sem métrica: ${medida.textosSemMetrica.join(', ')}`, medida.textosSemMetrica)
  if (regra === 'texto-sem-leitura' || regra === 'tratamento-piorou-leitura') {
    if (medida.contraste === null) return nc('a régua de contraste não mediu')
    // Codex (revisão final): `contraste: []` com textos visíveis NÃO é régua que mediu — cada texto medido precisa da sua
    // leitura (`textos[].camada` ou `camadas` do grupo), senão a leitura é não comprovada.
    // Só `textos[].camada` conta: a medida antiga sem `textos` é a leitura de UM representante do grupo (`regras.ts`),
    // e `camadas` do grupo não prova a leitura de cada texto (Codex, revisão final R2).
    const lidos = new Set(medida.contraste.flatMap((m) => (m.textos ?? []).map((t) => t.camada)))
    const semLeitura = textosVisiveis.filter((l) => !lidos.has(l.id)).map((l) => l.id)
    if (semLeitura.length > 0) return nc(`texto sem leitura da régua: ${semLeitura.join(', ')}`, semLeitura)
    if (regra === 'tratamento-piorou-leitura' && medida.pioras === null) return nc('as pioras de tratamento não foram medidas')
  }
  // `naoSeAplica` só é honrada em texto-sobre-assunto (acima): numa crítica fora do mapa é "não medimos".
  if (cob?.estado !== 'avaliada') return nc(cob?.motivo ?? 'regra sem cobertura')
  if (estimados.length > 0) return soEstimado()
  return ok()
}

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

  const naoComprovada = (regra: RegraCritica | ConferenciaDoGate, motivo: string, ids: string[] = []) => {
    cobertura[regra] = { estado: 'nao-comprovada', motivo }
    motivos.push({ regra, codigo: 'NAO_COMPROVADA', motivo, camadas: ids })
  }

  for (const regra of REGRAS_CRITICAS) {
    const d = decidirCritica({ regra, medida, cob: relatorio.cobertura[regra], achados: relatorio.achados, politica })
    cobertura[regra] = d.cobertura
    naoMedidos.push(...d.naoMedidos)
    avisos.push(...d.avisos)
    if (d.cobertura.estado === 'reprovada') {
      for (const a of d.reprovam) {
        achados.push({ regra, camadas: a.camadas, id: a.id, severidade: a.severidade, certeza: a.certeza === 'estimada' ? 'estimada' : 'medida' })
        motivos.push({ regra, codigo: 'ACHADO_CRITICO', motivo: a.mensagem, camadas: a.camadas })
      }
    } else if (d.cobertura.estado === 'nao-comprovada') motivos.push({ regra, codigo: 'NAO_COMPROVADA', motivo: d.cobertura.motivo, camadas: d.camadas })
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
  // Codex R11: 188/224 são px do canvas canônico (1080×1920); um story 2160×3840 passa com texto em y=250 que, exibido
  // em 1080, cai em y=125 — dentro da interface. Fora do canônico, o piso não está provado.
  else if (medida.canvas.width !== DIMENSOES.story.width || medida.canvas.height !== DIMENSOES.story.height) naoComprovada('piso-de-interface', `canvas ${medida.canvas.width}×${medida.canvas.height} fora do canônico do story (${DIMENSOES.story.width}×${DIMENSOES.story.height}): o piso é em px do canônico`)
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

  // Invariante 2.3 do contrato: APTO só com `naoMedidos` vazio. O que entrou em `naoMedidos` sem gerar motivo (ex.:
  // `textosSemMetrica` com id residual numa peça sem texto visível — Codex R6) vira NAO_MEDIDO aqui.
  if (motivos.length === 0 && naoMedidos.length > 0) {
    for (const n of naoMedidos) {
      const regra = n.regra === 'geometria' ? 'oclusao' : n.regra
      cobertura[regra] = { estado: 'nao-comprovada', motivo: n.motivo }
      motivos.push({ regra, codigo: 'NAO_MEDIDO', motivo: `não medido: ${n.motivo}`, camadas: n.camadas })
    }
  }

  // Ordem determinística dos motivos: críticas na ordem de REGRAS_CRITICAS, depois as conferências.
  const ordem = [...REGRAS_CRITICAS, ...CONFERENCIAS_DO_GATE] as string[]
  motivos.sort((a, b) => ordem.indexOf(a.regra) - ordem.indexOf(b.regra))

  const gate: GateDaArte = {
    versao: VERSAO_DO_GATE,
    resultado: motivos.length === 0 && naoMedidos.length === 0 ? 'APTO' : 'REVISAO_HUMANA_NECESSARIA',
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
  nc: (motivo: string, camadas?: string[]) => DecisaoDaCritica
  ok: (avisos?: string[]) => DecisaoDaCritica
  nsa: (motivo: string, avisos?: string[]) => DecisaoDaCritica
  rep: (lista: AchadoDaRevisao[]) => DecisaoDaCritica
}): DecisaoDaCritica {
  const { medida, cob, criticos, estimados, politica, nc, ok, nsa, rep } = args
  const fundo = fotoDeFundo(medida.camadas, medida.canvas)
  // E — sem foto de fundo: não se aplica, sempre.
  if (!fundo) {
    // Codex R11: `fotoDeFundo` só reconhece `bg-foto` ou `image` ≥ 90% do canvas; uma foto em `element`, ou `image`
    // menor, abaixo dos textos é desenhada pelo mesmo renderImage e tem assunto que ninguém mediu → não comprovada.
    const logos = new Set(logosDaPeca(medida.camadas).map((l) => l.id))
    const fotos = medida.camadas.filter((l) => l.visible !== false && (l.type === 'image' || l.type === 'element') && !logos.has(l.id)).map((l) => l.id)
    if (fotos.length > 0) return nc(`foto visível sem foto de fundo reconhecida (${fotos.join(', ')}): o revisor só mede o assunto de bg-foto ou de imagem ≥ 90% do canvas`, fotos)
    return nsa('a peça não tem foto de fundo')
  }
  // C' — camada de foto visível SEM arquivo: nada foi lido (fail-closed, sempre).
  if (typeof fundo.fileUrl !== 'string' || fundo.fileUrl.trim() === '') return nc('foto de fundo sem arquivo: nada foi lido', [fundo.id])
  const naoRepresenta = assuntoRepresentaORender(fundo, medida.canvas, medida.camadas)
  if (naoRepresenta) return nc(naoRepresenta.motivo, naoRepresenta.camadas)
  // Codex R10/R11: o assunto do revisor (`assuntoDaPeca`) reaproveita o cache da composição — catálogo, ESTIMADO e
  // "nenhum" — por arquivo + formato + `cropPosition`, sem comparar largura/altura; e a página pode ser redimensionada.
  // Fora do canvas canônico do formato (`DIMENSOES`), nenhuma dessas saídas vale.
  const dim = medida.formato ? DIMENSOES[medida.formato] : null
  if (!dim || medida.canvas.width !== dim.width || medida.canvas.height !== dim.height) return nc(`canvas ${medida.canvas.width}×${medida.canvas.height} fora do canônico do formato ${medida.formato ?? 'desconhecido'}${dim ? ` (${dim.width}×${dim.height})` : ''}: o assunto (gravado, estimado ou "nenhum") pode ser de outro tamanho`, [fundo.id])
  if (medida.assunto) {
    if (medida.assunto.origem === 'catalogo') {
      if (criticos.length > 0) return rep(criticos)
      if (cob?.estado !== 'avaliada') return nc(cob?.motivo ?? 'regra sem cobertura')
      return ok()
    }
    // B — estimado
    if (politica.estimado === 'humano') {
      const alvo = estimados.length > 0 ? ` (achado estimado: ${estimados.map((a) => a.id).join(', ')})` : ''
      return nc(`assunto só estimado pela textura da foto${alvo}`, estimados.flatMap((a) => a.camadas))
    }
    if (criticos.length > 0) return rep(criticos)
    if (cob?.estado !== 'avaliada') return nc(cob?.motivo ?? 'regra sem cobertura')
    return ok()
  }
  // C — foto LIDA sem assunto localizável
  if (medida.assuntoNaoSeAplica) {
    if (politica.semAssuntoLocalizavel === 'nao-se-aplica') return nsa(medida.motivoSemAssunto ?? 'foto lida sem assunto localizável', ['foto sem assunto localizável: a regra texto-sobre-assunto não se aplica (política do assunto)'])
    return nc(medida.motivoSemAssunto ?? 'foto lida sem assunto localizável (política: humano)')
  }
  // D — falha ao analisar a foto: fail-closed, sempre.
  return nc(medida.motivoSemAssunto ?? 'o assunto da foto não foi estimado')
}
