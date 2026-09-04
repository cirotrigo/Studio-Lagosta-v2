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
import { grupoDaCamada, membrosDoBloco, papelNoBloco } from '@/lib/creatives/halo/bloco-de-fundo'
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
  /** O grupo da camada na página (Cmd+G do editor) — papéis no mesmo grupo formam UM bloco na peça. */
  grupo?: string | null
  /** A caixa da camada na página — de onde sai a âncora (topo/rodapé) dos blocos secundários. */
  caixa?: { x: number; y: number; width: number; height: number }
  alinhamento?: 'esquerda' | 'centro' | 'direita' | null
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
  origem: { pageId: string | null; formatoDaPagina: Formato | null; variante: string | null; motivoDaVariante?: string; versao: string }
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
  if (/^(headline|titulo|manchete|title)[\s-]*(copy|2|b|dois|segunda)$/.test(n)) return 'headline2'
  if (/^(headline|titulo|manchete|title)$/.test(n)) return 'headline'
  if (/^(apoio|descricao|subtitulo|corpo|body)$/.test(n)) return 'apoio'
  if (/^(cta|chamada)$/.test(n)) return 'cta'
  if (/^(servico|info|rodape|footer)$/.test(n)) return 'servico'
  return null
}

const PREFIXO = /^([^\p{L}\p{N}\s]{1,3})\s+/u

/**
 * O fundo de texto da camada, como o editor o DESENHA (null quando desligado).
 *
 * 🔴 Camada em GRUPO (`metadata.groupId`, Cmd+G no editor) divide UMA mancha,
 * desenhada pelo LÍDER (menor `order`) com a configuração DELE; os membros
 * não desenham a própria. Ler o fundo de cada camada isoladamente mostrava
 * a caixa branca default que a headline da Real carregava por baixo — e que
 * no editor nunca aparece. Com `todas`, a leitura segue a regra do editor.
 */
export function fundoDaCamada(camada: Layer, todas: Layer[] = []): FundoDePapel | null {
  let fonte = camada
  if (todas.length > 0 && grupoDaCamada(camada)) {
    const papel = papelNoBloco(todas, camada)
    if (papel.papel === 'membro') {
      const lider = membrosDoBloco(todas, camada).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
      if (lider) fonte = lider
    }
  }
  const b = fonte.effects?.background
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
export function estiloDaCamada(camada: Layer, todas: Layer[] = []): EstiloDePapel | null {
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
    fundo: fundoDaCamada(camada, todas),
    grupo: grupoDaCamada(camada),
    caixa: { x: camada.position.x, y: camada.position.y, width: camada.size.width, height: camada.size.height },
    alinhamento: s.textAlign === 'center' ? 'centro' : s.textAlign === 'right' ? 'direita' : s.textAlign === 'left' ? 'esquerda' : null,
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
        const estilo = estiloDaCamada(camada, args.pagina.layers)
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

  // As MARGENS vêm da página, não dos números do projeto (Ciro, 03/09/2026:
  // "compare com a margem superior e inferior do template, está dando muito
  // espaço"). Onde o primeiro texto começa é o topo útil; onde o último
  // texto ou a logo termina é o rodapé útil; a menor distância à lateral é a
  // margem horizontal. Só vale para o formato da própria página.
  if (args.pagina && args.formatoDaPagina) {
    const uteis = args.pagina.layers.filter((c) => c.visible !== false && (c.type === 'text' || c.type === 'logo'))
    const textos = uteis.filter((c) => c.type === 'text')
    if (textos.length >= 2) {
      const H = args.pagina.height
      const W = args.pagina.width
      const topo = Math.min(...uteis.map((c) => c.position.y))
      const rodape = H - Math.max(...uteis.map((c) => c.position.y + c.size.height))
      const lateral = Math.min(...textos.map((c) => Math.min(c.position.x, W - (c.position.x + c.size.width))))
      const base = numeros.geometria[args.formatoDaPagina]
      numeros.geometria[args.formatoDaPagina] = {
        ...base,
        safeTopo: Math.max(60, Math.round(topo)),
        safeRodape: Math.max(60, Math.round(rodape)),
        margemH: Math.max(40, Math.min(200, Math.round(lateral))),
      }
    }
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
export interface CandidataAVariante {
  id?: string
  name?: string
  tags?: string[]
  width: number
  height: number
  /** Os papéis que a página tem (calculados por quem carrega as camadas). */
  papeis?: Papel[]
}

export interface CriteriosDeVariante {
  formato: Formato
  /** Variante pedida pelo nome, tag ou id — vence tudo. */
  variante?: string | null
  /** Os papéis que a PEÇA pede. Variante que os tem vence a que não os tem. */
  papeis?: Papel[]
  /** O assunto da peça: casa com o nome e as tags da página ("funcionamento", "cafés"). */
  tema?: string | null
  /** Luz média da foto (0..255) — escolhe entre variantes `clara`/`escura`. */
  luzDaFoto?: number | null
  /** Chave da peça para o rodízio entre empatadas. */
  chave?: string
}

function tokens(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
}

export interface VarianteAvaliada<T> {
  pagina: T
  pontos: number
  motivo: string
}

/**
 * Pontua cada variante do formato para a PEÇA (Ciro, 03/09/2026: "o correto
 * seria escolher o template de acordo com a mensagem que quer passar, e
 * saber quais aceitam o horário de funcionamento"):
 *
 *  +10 por ter TODOS os papéis que a peça pede (a story sem serviço não
 *      serve para a peça de funcionamento) — e −4 por cada papel que falta;
 *  −1  por papel que a página tem e a peça não usa (slot vazio);
 *  +3  por palavra do tema que casa com o nome ou as tags da página
 *      ("funcionamento", "cafés", "vitrine");
 *  +2  quando a tag `clara`/`escura` casa com a luz da foto, −2 quando bate
 *      de frente;
 *  empate → rodízio determinístico pela chave da peça.
 */
export function avaliarVariantes<T extends CandidataAVariante>(paginas: T[], c: CriteriosDeVariante): VarianteAvaliada<T>[] {
  const pedidos = (c.papeis ?? []).filter((p) => p !== 'headline2')
  const temaTokens = tokens(c.tema ?? '')
  const clara = typeof c.luzDaFoto === 'number' ? c.luzDaFoto > LUZ_DE_FOTO_CLARA : null
  return paginas
    .map((p) => {
      const motivos: string[] = []
      let pontos = 0
      const tem = new Set(p.papeis ?? [])
      if (p.papeis) {
        const faltam = pedidos.filter((x) => !tem.has(x))
        if (faltam.length === 0 && pedidos.length > 0) {
          pontos += 10
          motivos.push('tem todos os papéis')
        } else if (faltam.length > 0) {
          pontos -= 4 * faltam.length
          motivos.push(`falta ${faltam.join(', ')}`)
        }
        const sobram = [...tem].filter((x) => x !== 'headline2' && !pedidos.includes(x))
        if (sobram.length > 0 && pedidos.length > 0) {
          pontos -= sobram.length
          motivos.push(`sobra ${sobram.join(', ')}`)
        }
      }
      const textoDaPagina = tokens(`${p.name ?? ''} ${(p.tags ?? []).join(' ')}`)
      const casam = temaTokens.filter((t) => textoDaPagina.some((x) => x.startsWith(t) || t.startsWith(x)))
      if (casam.length > 0) {
        pontos += 3 * casam.length
        motivos.push(`tema "${casam.join(' ')}"`)
      }
      const tagsMin = (p.tags ?? []).map((t) => t.toLowerCase())
      if (clara !== null) {
        if (tagsMin.includes(clara ? 'clara' : 'escura')) {
          pontos += 2
          motivos.push(clara ? 'foto clara' : 'foto escura')
        } else if (tagsMin.includes(clara ? 'escura' : 'clara')) {
          pontos -= 2
          motivos.push('luz oposta')
        }
      }
      return { pagina: p, pontos, motivo: motivos.join(', ') || 'neutra' }
    })
    .sort((a, b) => b.pontos - a.pontos || `${a.pagina.name}`.localeCompare(`${b.pagina.name}`))
}

/**
 * Escolhe a página de assinatura entre as VARIANTES do formato:
 * 1. `variante` pedida (nome, tag ou id) vence;
 * 2. senão, a melhor pontuação de `avaliarVariantes`; entre empatadas, o
 *    RODÍZIO determinístico pela chave da peça — uma leva varia sem repetir.
 * Sem página do formato cai na de story (escala de fonte), e sem nenhuma, null.
 */
export function escolherVariante<T extends CandidataAVariante>(
  paginas: T[],
  args: CriteriosDeVariante,
): { pagina: T | null; formatoDaPagina: Formato | null; motivo: string } {
  const doFormato = paginas.filter((p) => formatoDaPagina(p) === args.formato)
  const candidatas = doFormato.length > 0 ? doFormato : paginas.filter((p) => formatoDaPagina(p) === 'story')
  const base = candidatas.length > 0 ? candidatas : paginas
  if (base.length === 0) return { pagina: null, formatoDaPagina: null, motivo: 'sem página' }
  const fmt = (p: T) => formatoDaPagina(p)

  if (args.variante) {
    const alvo = args.variante.toLowerCase().trim()
    const achada = base.find(
      (p) =>
        `${p.name ?? ''}`.toLowerCase().includes(alvo) ||
        (p.tags ?? []).some((t) => t.toLowerCase() === alvo) ||
        `${p.id ?? ''}`.toLowerCase() === alvo,
    )
    if (achada) return { pagina: achada, formatoDaPagina: fmt(achada), motivo: 'pedida' }
  }

  const avaliadas = avaliarVariantes(base, args)
  const melhor = avaliadas[0].pontos
  const empatadas = avaliadas.filter((a) => a.pontos === melhor)
  const escolhida = empatadas[hashDe(args.chave ?? '') % empatadas.length]
  return { pagina: escolhida.pagina, formatoDaPagina: fmt(escolhida.pagina), motivo: `${escolhida.motivo}${empatadas.length > 1 ? ` (rodízio entre ${empatadas.length})` : ''}` }
}
