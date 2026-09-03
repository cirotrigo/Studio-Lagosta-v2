/**
 * A ASSINATURA da marca — o kit que o compositor lê antes de compor.
 *
 * Duas casas, de propósito (§8 do plano):
 *  - o ESTILO por papel (fonte, tamanho, cor, caixa, tracking, entrelinha)
 *    mora numa PÁGINA do projeto (`Page.isTemplate` com a tag `assinatura`),
 *    cujas camadas de texto se chamam pelo papel. A equipe edita página no
 *    editor, não JSON — trocar a fonte da headline é abrir a página e mudar;
 *  - os NÚMEROS (margens, safe area, faixa de tinta e raio do halo, largura
 *    da logo) moram em `Project.assinatura` (Json), com defaults da casa.
 *
 * Módulo PURO: lê camadas e JSON que quem chama já carregou.
 */

import type { Layer } from '@/types/template'
import type { Formato, Papel } from './spec'

export const TAG_DA_ASSINATURA = 'assinatura'
export const NOME_DO_TEMPLATE_DE_ASSINATURA = 'Assinatura'

export interface EstiloDePapel {
  fontFamily: string
  fontWeight?: number
  /** px no canvas da página de assinatura (largura 1080). */
  fontSize: number
  lineHeight: number
  /** px. */
  letterSpacing: number
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
  color: string
  /** Prefixo desenhado antes da primeira linha (o "→ " do CTA). */
  prefixo?: string
  /** Largura máxima do bloco como fração da coluna útil (0..1). */
  larguraMaxima?: number
  /**
   * Sombra presa ao glifo — o que segura a cor onde a mancha já caiu.
   * `null` = a página de assinatura NÃO tem sombra nessa camada, e a peça
   * nasce sem (a página é a verdade; o default só vale quando ela não diz).
   */
  sombra?: { color: string; blur: number; offsetY: number; opacity: number } | null
  /**
   * O FUNDO DE TEXTO que a equipe deixou ligado nessa camada da página de
   * assinatura — a configuração literal do editor (cor, ajuste caixa/texto,
   * margem, desfoque, cantos, opacidade). Quando algum papel da página tem
   * fundo, a página é a verdade: cada papel recebe o SEU; papel sem fundo sai
   * sem mancha. Só quando nenhum papel tem é que o compositor calibra o halo
   * sozinho pela foto. A opacidade da página é o TETO: em mancha escura e
   * ajuste `texto` a foto modula dentro dela; caixa sólida ou mancha clara
   * saem como a equipe desenhou.
   */
  fundo?: FundoDePapel | null
}

export interface FundoDePapel {
  backgroundColor: string
  fit: 'caixa' | 'texto'
  opacity: number
  padding: number
  paddingX?: number
  paddingY?: number
  blur: number
  borderRadius: number
  offsetX: number
  offsetY: number
}

export interface LogoDaAssinatura {
  url: string
  /** Largura em px no canvas de 1080. */
  largura: number
  /** altura / largura. */
  razao: number
}

export interface GeometriaDoFormato {
  margemH: number
  safeTopo: number
  safeRodape: number
  /** Vão vertical entre blocos (px). */
  gapEntreBlocos: number
  /** Multiplicador dos tamanhos de fonte da página de assinatura de STORY, quando o formato não tem página própria. */
  escalaDeFonte: number
}

export interface NumerosDaAssinatura {
  /** A cor da mancha do halo (o dark da marca). */
  mancha: string
  /** Fundo liso, quando a peça não tem foto. */
  fundo: string
  halo: {
    /** A tinta anda numa FAIXA, nunca persegue um alvo (PADRAO.md §5.0 da Lagosta). */
    faixaTexto: [number, number]
    faixaMarca: [number, number]
    raioTexto: number
    raioMarca: number
  }
  logo: { largura: number }
  geometria: Record<Formato, GeometriaDoFormato>
}

export const NUMEROS_PADRAO: NumerosDaAssinatura = {
  mancha: '#0B0B0B',
  fundo: '#0B0B0B',
  halo: {
    faixaTexto: [0.26, 0.58],
    faixaMarca: [0.12, 0.3],
    raioTexto: 190,
    raioMarca: 96,
  },
  logo: { largura: 236 },
  geometria: {
    // Safe area do story: onde o Instagram desenha avatar e barra de resposta.
    story: { margemH: 92, safeTopo: 188, safeRodape: 224, gapEntreBlocos: 14, escalaDeFonte: 1 },
    // Feed e quadrado não têm faixa do Instagram, mas o autofix confere a
    // margem de segurança do editor (CANVAS_MARGIN: 120 no topo, 100 na
    // base) — o compositor não pode pousar texto onde o editor o acusa.
    feed: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 14, escalaDeFonte: 0.875 },
    quadrado: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
  },
}

export interface AssinaturaDaMarca {
  papeis: Partial<Record<Papel, EstiloDePapel>>
  logo: LogoDaAssinatura | null
  numeros: NumerosDaAssinatura
  /** O alinhamento da headline na página — vira preferência do rodízio (a foto ainda manda). */
  alinhamento: 'esquerda' | 'centro' | 'direita' | null
  /** De onde veio — para o registro atômico da geração. */
  origem: { pageId: string | null; formatoDaPagina: Formato | null; variante: string | null; versao: string }
}

/** Nome de camada → papel. Aceita o que a equipe tende a escrever. */
export function papelDoNome(nome: string | null | undefined): Papel | null {
  const n = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  if (!n) return null
  if (/^(pre|pre-?titulo|pretitulo|kicker|sobretitulo)$/.test(n)) return 'pre'
  if (/^(headline|titulo|manchete|title)$/.test(n)) return 'headline'
  if (/^(apoio|descricao|subtitulo|corpo|body)$/.test(n)) return 'apoio'
  if (/^(cta|chamada)$/.test(n)) return 'cta'
  if (/^(servico|info|rodape|footer)$/.test(n)) return 'servico'
  return null
}

const PREFIXO = /^([^\p{L}\p{N}\s]{1,3})\s+/u

/** O fundo de texto da camada, como o editor o gravou (null quando desligado). */
export function fundoDaCamada(camada: Layer): FundoDePapel | null {
  const b = camada.effects?.background
  if (!b?.enabled) return null
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao)
  return {
    backgroundColor: typeof b.backgroundColor === 'string' ? b.backgroundColor : '#111111',
    fit: b.fit === 'texto' ? 'texto' : 'caixa',
    opacity: Math.max(0, Math.min(1, n(b.opacity, 1))),
    padding: n(b.padding, 10),
    ...(typeof b.paddingX === 'number' ? { paddingX: b.paddingX } : {}),
    ...(typeof b.paddingY === 'number' ? { paddingY: b.paddingY } : {}),
    blur: n(b.blur, 0),
    borderRadius: n(b.borderRadius, 0),
    offsetX: n(b.offsetX, 0),
    offsetY: n(b.offsetY, 0),
  }
}

/** Lê o estilo de um papel a partir da camada de texto da página de assinatura. */
export function estiloDaCamada(camada: Layer): EstiloDePapel | null {
  const s = (camada.style ?? {}) as Record<string, unknown>
  const fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily : null
  const fontSize = typeof s.fontSize === 'number' && s.fontSize > 0 ? s.fontSize : null
  if (!fontFamily || !fontSize) return null
  const autoWrap = (camada.textboxConfig as { autoWrap?: { lineHeight?: number } } | undefined)?.autoWrap
  const lineHeight =
    (typeof autoWrap?.lineHeight === 'number' && autoWrap.lineHeight) ||
    (typeof s.lineHeight === 'number' && s.lineHeight) ||
    1.1
  const conteudo = camada.content ?? ''
  const prefixo = PREFIXO.exec(conteudo)?.[1]
  const shadow = camada.effects?.shadow
  return {
    fontFamily,
    ...(typeof s.fontWeight === 'number' ? { fontWeight: s.fontWeight } : {}),
    fontSize,
    lineHeight,
    letterSpacing: typeof s.letterSpacing === 'number' ? s.letterSpacing : 0,
    ...(typeof s.textTransform === 'string' && s.textTransform !== 'none'
      ? { textTransform: s.textTransform as EstiloDePapel['textTransform'] }
      : {}),
    color: typeof s.color === 'string' ? s.color : '#FFFFFF',
    ...(prefixo ? { prefixo: `${prefixo} ` } : {}),
    fundo: fundoDaCamada(camada),
    sombra: shadow?.enabled
      ? {
          color: shadow.shadowColor,
          blur: shadow.shadowBlur,
          offsetY: shadow.shadowOffsetY,
          opacity: shadow.shadowOpacity,
        }
      : null,
  }
}

function mesclarNumeros(base: NumerosDaAssinatura, extra: unknown): NumerosDaAssinatura {
  if (!extra || typeof extra !== 'object') return base
  const e = extra as Partial<NumerosDaAssinatura> & { geometria?: Partial<Record<Formato, Partial<GeometriaDoFormato>>> }
  const geometria = { ...base.geometria }
  for (const f of Object.keys(base.geometria) as Formato[]) {
    geometria[f] = { ...base.geometria[f], ...(e.geometria?.[f] ?? {}) }
  }
  return {
    mancha: typeof e.mancha === 'string' ? e.mancha : base.mancha,
    fundo: typeof e.fundo === 'string' ? e.fundo : base.fundo,
    halo: { ...base.halo, ...(e.halo ?? {}) },
    logo: { ...base.logo, ...(e.logo ?? {}) },
    geometria,
  }
}

/**
 * Papéis que a página do formato NÃO tem caem na página de story, com a
 * escala de fonte do formato — a equipe monta o feed só com o que muda.
 */
export function completarComStory(assinatura: AssinaturaDaMarca, story: AssinaturaDaMarca | null, escala: number): AssinaturaDaMarca {
  if (!story) return assinatura
  const papeis = { ...assinatura.papeis }
  for (const papel of Object.keys(story.papeis) as Papel[]) {
    if (papeis[papel]) continue
    const e = story.papeis[papel]!
    papeis[papel] = { ...e, fontSize: Math.round(e.fontSize * escala), letterSpacing: Math.round(e.letterSpacing * escala * 100) / 100 }
    // Sem fundo próprio no formato: o do story serve, escalado.
    if (papeis[papel]!.fundo) {
      const f = papeis[papel]!.fundo!
      papeis[papel] = { ...papeis[papel]!, fundo: { ...f, padding: Math.round(f.padding * escala), blur: Math.round(f.blur * escala) } }
    }
  }
  return { ...assinatura, papeis, logo: assinatura.logo ?? story.logo }
}

export interface PaginaDeAssinatura {
  id: string
  name?: string
  tags?: string[]
  width: number
  height: number
  layers: Layer[]
  background?: string | null
}

/**
 * Monta a assinatura a partir da página (do formato pedido, ou a de story
 * como fallback) e do JSON de números do projeto. Sem página nenhuma devolve
 * `papeis` vazio — e o compositor recusa, porque compor sem assinatura seria
 * inventar a marca.
 */
export function montarAssinatura(args: {
  pagina: PaginaDeAssinatura | null
  formatoDaPagina: Formato | null
  numerosDoProjeto: unknown
  logoDoProjeto?: { url: string; razao?: number } | null
}): AssinaturaDaMarca {
  const numeros = mesclarNumeros(NUMEROS_PADRAO, args.numerosDoProjeto)
  const papeis: AssinaturaDaMarca['papeis'] = {}
  let logo: LogoDaAssinatura | null = null
  let alinhamento: AssinaturaDaMarca['alinhamento'] = null

  if (args.pagina) {
    for (const camada of args.pagina.layers) {
      if (camada.visible === false) continue
      if (camada.type === 'text') {
        const papel = papelDoNome(camada.name) ?? papelDoNome(camada.id)
        if (!papel || papeis[papel]) continue
        const estilo = estiloDaCamada(camada)
        if (estilo) papeis[papel] = estilo
        if (papel === 'headline') {
          const a = camada.style?.textAlign
          alinhamento = a === 'center' ? 'centro' : a === 'right' ? 'direita' : a === 'left' ? 'esquerda' : null
        }
        continue
      }
      if ((camada.type === 'logo' || camada.type === 'image') && /logo|marca/i.test(`${camada.name} ${camada.id}`)) {
        const url = typeof camada.fileUrl === 'string' ? camada.fileUrl : null
        if (url && !logo) {
          logo = {
            url,
            largura: Math.round(camada.size.width),
            razao: camada.size.height / camada.size.width,
          }
        }
      }
    }
    // O fundo liso e a mancha da logo vêm só de Project.assinatura: o editor
    // grava `#ffffff` na página assim que a equipe põe uma foto de referência
    // nela, e o fundo da marca não pode virar branco por isso. O halo do TEXTO
    // a equipe define por camada (`EstiloDePapel.fundo`).
  }

  if (!logo && args.logoDoProjeto?.url) {
    logo = { url: args.logoDoProjeto.url, largura: numeros.logo.largura, razao: args.logoDoProjeto.razao ?? 0.41 }
  }

  return {
    papeis,
    logo,
    numeros,
    alinhamento,
    origem: { pageId: args.pagina?.id ?? null, formatoDaPagina: args.formatoDaPagina, variante: args.pagina?.name ?? null, versao: 'assinatura-v2' },
  }
}

/** Os papéis que a spec pede e a assinatura não tem — a recusa é explícita. */
export function papeisQueFaltam(assinatura: AssinaturaDaMarca, pedidos: Papel[]): Papel[] {
  return pedidos.filter((p) => !assinatura.papeis[p])
}

// ─── Variantes ─────────────────────────────────────────────────────────────

/** Formato que uma página de assinatura declara (pelo nome, pelas tags ou pelo tamanho). */
export function formatoDaPagina(p: { name?: string; tags?: string[]; width: number; height: number }): Formato | null {
  const texto = `${p.name ?? ''} ${(p.tags ?? []).join(' ')}`.toLowerCase()
  if (/quadrad/.test(texto) || (p.width === p.height && p.width > 0)) return 'quadrado'
  if (/feed/.test(texto) || (p.height < p.width * 1.4 && p.height > p.width)) return 'feed'
  if (/story|stories/.test(texto) || p.height >= p.width * 1.6) return 'story'
  return null
}

function hashDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** Acima disto a foto é "clara" para a escolha de variante (luz média 0..255). */
export const LUZ_DE_FOTO_CLARA = 128

/**
 * Escolhe a página de assinatura entre as VARIANTES do formato (§8 do plano,
 * pedido do Ciro em 03/09/2026: "posso criar mais variações?").
 *
 * 1. `variante` pedida na spec: casa pelo nome ou pela tag da página;
 * 2. tags `clara`/`escura`: a luz média da foto escolhe (página sem tag
 *    continua candidata — é a neutra);
 * 3. RODÍZIO determinístico pela chave da peça entre as que sobraram — é o
 *    que faz uma leva variar sem repetir a mesma variante em peças seguidas.
 * Sem página do formato cai na de story (escala de fonte), e sem nenhuma, null.
 */
export function escolherVariante<T extends { name?: string; tags?: string[]; width: number; height: number }>(
  paginas: T[],
  args: { formato: Formato; variante?: string | null; luzDaFoto?: number | null; chave?: string },
): { pagina: T | null; formatoDaPagina: Formato | null } {
  const doFormato = paginas.filter((p) => formatoDaPagina(p) === args.formato)
  const candidatas = doFormato.length > 0 ? doFormato : paginas.filter((p) => formatoDaPagina(p) === 'story')
  const base = candidatas.length > 0 ? candidatas : paginas
  if (base.length === 0) return { pagina: null, formatoDaPagina: null }
  const fmt = (p: T) => formatoDaPagina(p)

  if (args.variante) {
    const alvo = args.variante.toLowerCase().trim()
    const achada = base.find((p) => `${p.name ?? ''}`.toLowerCase().includes(alvo) || (p.tags ?? []).some((t) => t.toLowerCase() === alvo))
    if (achada) return { pagina: achada, formatoDaPagina: fmt(achada) }
  }

  let filtradas = base
  if (typeof args.luzDaFoto === 'number') {
    const clara = args.luzDaFoto > LUZ_DE_FOTO_CLARA
    const tem = (p: T, tag: string) => (p.tags ?? []).some((t) => t.toLowerCase() === tag)
    const compativeis = base.filter((p) => (clara ? !tem(p, 'escura') : !tem(p, 'clara')))
    if (compativeis.length > 0) filtradas = compativeis
    const especificas = filtradas.filter((p) => tem(p, clara ? 'clara' : 'escura'))
    if (especificas.length > 0) filtradas = especificas
  }

  const ordenadas = [...filtradas].sort((a, b) => `${a.name}`.localeCompare(`${b.name}`))
  const escolhida = ordenadas[hashDe(args.chave ?? '') % ordenadas.length]
  return { pagina: escolhida, formatoDaPagina: fmt(escolhida) }
}
