/**
 * O COMPOSITOR REAL (`comporPeca`) rodando sobre um cenário local: os módulos
 * que falam com banco, Blob, Drive e fontes são trocados por estes
 * substitutos, e o resto — assinatura, blocos, mapa de calma, escolha do
 * véu, logo, régua e o renderizador — é o código de produção.
 *
 * Como usar (no arquivo de teste, antes de importar o compositor):
 *
 *   vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
 *   …os demais `vi.mock` de `MOCKS_DO_COMPOSITOR`…
 *
 * e `cenario.atual = …` antes de cada `comporPeca`.
 */
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'

export interface PaginaDeAssinatura {
  id: string
  name: string
  width: number
  height: number
  tags: string[]
  background: string
  layers: Layer[]
}

export interface CenarioDoCompositor {
  projeto: {
    id: number
    assinatura: unknown
    logoDoProjeto: string | null
    /** CP3: as linhas `Logo` do projeto (url + marca de principal). Sem isto, só `logoDoProjeto` (principal). */
    logosDoProjeto?: Array<{ fileUrl: string; isProjectLogo: boolean }>
  }
  paginasDeAssinatura: PaginaDeAssinatura[]
  foto: { url: string; bytes: Buffer } | null
  /** As candidatas de cor do véu que a biblioteca de gradientes da marca devolveria. */
  candidatasDoVeu: string[]
  /** A entrada do catálogo da foto (o assunto em frações), ou null = sem caixa. */
  catalogo: { driveFileId: string; assunto?: { x0: number; y0: number; x1: number; y1: number } } | null
  medidor: MeasureTextBox
}

export const cenario: { atual: CenarioDoCompositor | null } = { atual: null }

function atual(): CenarioDoCompositor {
  if (!cenario.atual) throw new Error('cenário do compositor não montado (cenario.atual)')
  return cenario.atual
}

export function mockDoBanco() {
  return {
    db: {
      project: {
        findUnique: async (args?: { select?: { Logo?: { where?: { isProjectLogo?: boolean } } } }) => {
          const p = atual().projeto
          const linhas = p.logosDoProjeto ?? (p.logoDoProjeto ? [{ fileUrl: p.logoDoProjeto, isProjectLogo: true }] : [])
          // Como o Prisma: `where: { isProjectLogo: true }` filtra; a ordem é a de id (a de entrada).
          const filtro = args?.select?.Logo?.where?.isProjectLogo
          const Logo = (filtro === undefined ? linhas : linhas.filter((l) => l.isProjectLogo === filtro)).map((l) => ({ fileUrl: l.fileUrl, isProjectLogo: l.isProjectLogo }))
          return { id: p.id, name: 'Projeto da fixture', userId: 'usuario-da-fixture', assinatura: p.assinatura, Logo }
        },
      },
      template: { findFirst: async () => ({ id: 1 }) },
      page: {
        findMany: async () => atual().paginasDeAssinatura,
        count: async () => atual().paginasDeAssinatura.length,
      },
    },
  }
}

export function mockDaPersistencia() {
  return {
    persistAndRenderCreative: async () => {
      throw new Error('o CP0 não persiste: use somenteAvaliar')
    },
    resolveImageUrl: async () => ({ url: atual().foto?.url ?? null, warning: atual().foto ? undefined : 'sem foto no cenário' }),
  }
}

export function mockDasFontes() {
  return {
    registerProjectFonts: async () => undefined,
    fetchBuffer: async () => {
      const foto = atual().foto
      if (!foto) throw new Error('sem foto no cenário')
      return foto.bytes
    },
    familiasNaoCarregadas: async () => new Set<string>(),
  }
}

export function mockDoMedidor() {
  return { createServerTextBoxMeasurer: async () => atual().medidor }
}

/** O autofix geométrico fica de fora (como no harness de `compor-avaliacao.test.ts`): a peça sai como o compositor a montou. */
export function mockDoAutofix() {
  return { aplicarAutofixOuFalhar: async (args: { layers: Layer[] }) => ({ layers: args.layers, avisos: [] as string[] }) }
}

export function mockDoUsoDeFoto() {
  return { registrarUsoDeFoto: async () => undefined }
}

export function mockDoAcervo() {
  return { lerCatalogoDoProjeto: async () => ({ catalogo: null, todas: atual().catalogo ? [atual().catalogo] : [] }) }
}

export function gradientesDoCenario() {
  return {
    daMarca: atual().candidatasDoVeu.map((cor, i) => ({
      id: `fixture-veu-${i}`,
      label: `fixture ${cor}`,
      gradientType: 'linear' as const,
      gradientAngle: 0,
      gradientStops: [{ id: `p-${i}`, color: cor, opacity: 1, position: 0 }],
    })),
    gerais: [],
  }
}

// ─── Medidor determinístico ─────────────────────────────────────────────────

export interface Calibragem {
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  /** A linha mais longa do bloco medido (em caracteres). */
  linhaMaisLonga: string
  /** A caixa que o compositor gravou para o bloco. */
  width: number
  height: number
  linhas: number
}

/**
 * Um medidor que devolve as MESMAS caixas que o medidor do servidor deu na
 * peça real: largura por caractere e folga vertical calibradas por família a
 * partir das medidas finais gravadas. Família sem calibragem usa 0,5 do corpo
 * por caractere (casos sintéticos).
 */
export function medidorCalibrado(calibragens: Calibragem[] = []): MeasureTextBox {
  const porFamilia = new Map(
    calibragens.map((c) => {
      const n = c.linhaMaisLonga.length
      const fator = ((c.width - 2 * PADDING_DE_DESENHO - 2) / n - c.letterSpacing) / c.fontSize
      const folga = c.height - c.linhas * c.fontSize * c.lineHeight
      return [c.fontFamily, { fator, folga }] as const
    }),
  )
  return (layer: Layer) => {
    const fs = Number(layer.style?.fontSize ?? 48)
    const familia = String(layer.style?.fontFamily ?? '')
    const ls = Number(layer.style?.letterSpacing ?? 0)
    const lh = Number(layer.style?.lineHeight ?? layer.textboxConfig?.autoWrap?.lineHeight ?? 1.2)
    const cal = porFamilia.get(familia) ?? { fator: 0.5, folga: Math.round(fs * 0.15) }
    const util = Math.max(1, layer.size.width - 2 * PADDING_DE_DESENHO)
    const linhas = String(layer.content ?? '').split('\n')
    let total = 0
    let maior = 0
    const desenhadas: Array<{ texto: string; largura: number }> = []
    for (const texto of linhas) {
      const largura = texto.length * (fs * cal.fator + ls)
      const quebras = Math.max(1, Math.ceil(largura / util - 1e-9))
      total += quebras
      maior = Math.max(maior, Math.min(largura, quebras > 1 ? util : largura))
      desenhadas.push({ texto, largura })
    }
    return { height: total * fs * lh + cal.folga, maxLineWidth: maior, lineCount: total, linhas: desenhadas }
  }
}
