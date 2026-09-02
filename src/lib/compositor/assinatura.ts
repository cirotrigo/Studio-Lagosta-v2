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
  /** Sombra presa ao glifo — o que segura a cor onde a mancha já caiu. */
  sombra?: { color: string; blur: number; offsetY: number; opacity: number }
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
    feed: { margemH: 92, safeTopo: 96, safeRodape: 104, gapEntreBlocos: 14, escalaDeFonte: 0.875 },
    quadrado: { margemH: 92, safeTopo: 96, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
  },
}

export interface AssinaturaDaMarca {
  papeis: Partial<Record<Papel, EstiloDePapel>>
  logo: LogoDaAssinatura | null
  numeros: NumerosDaAssinatura
  /** De onde veio — para o registro atômico da geração. */
  origem: { pageId: string | null; formatoDaPagina: Formato | null; versao: string }
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
    ...(shadow?.enabled
      ? {
          sombra: {
            color: shadow.shadowColor,
            blur: shadow.shadowBlur,
            offsetY: shadow.shadowOffsetY,
            opacity: shadow.shadowOpacity,
          },
        }
      : {}),
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

  if (args.pagina) {
    for (const camada of args.pagina.layers) {
      if (camada.visible === false) continue
      if (camada.type === 'text') {
        const papel = papelDoNome(camada.name) ?? papelDoNome(camada.id)
        if (!papel || papeis[papel]) continue
        const estilo = estiloDaCamada(camada)
        if (estilo) papeis[papel] = estilo
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
    if (typeof args.pagina.background === 'string' && /^#/.test(args.pagina.background)) {
      numeros.fundo = args.pagina.background
    }
  }

  if (!logo && args.logoDoProjeto?.url) {
    logo = { url: args.logoDoProjeto.url, largura: numeros.logo.largura, razao: args.logoDoProjeto.razao ?? 0.41 }
  }

  return {
    papeis,
    logo,
    numeros,
    origem: { pageId: args.pagina?.id ?? null, formatoDaPagina: args.formatoDaPagina, versao: 'assinatura-v1' },
  }
}

/** Os papéis que a spec pede e a assinatura não tem — a recusa é explícita. */
export function papeisQueFaltam(assinatura: AssinaturaDaMarca, pedidos: Papel[]): Papel[] {
  return pedidos.filter((p) => !assinatura.papeis[p])
}
