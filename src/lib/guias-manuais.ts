/**
 * Guias manuais e réguas do editor (L4 das linhas-guia, 29/10/2026) — módulo puro, como no Canva: a guia nasce
 * arrastada da régua (com a posição em px), apaga arrastada de volta, encaixa como qualquer outra linha; "Adicionar
 * guias" calcula colunas e linhas DENTRO da margem da marca (assimétrica no Story), não na página inteira.
 *
 * v1 (D4): as guias são por PESSOA e por PÁGINA, no localStorage (`chaveDasGuias`). Nada vai para `Page.layers`.
 */
import type { LinhasDaMarca } from './canvas-margin'
import type { RectInfo } from './konva-smart-guides'

export interface Guia {
  id: string
  orientacao: 'vertical' | 'horizontal'
  /** Em px do design (x para a vertical, y para a horizontal). */
  posicao: number
}

export interface GuiasDaPagina {
  guias: Guia[]
  ocultas: boolean
  travadas: boolean
}

export const GUIAS_VAZIAS: GuiasDaPagina = { guias: [], ocultas: false, travadas: false }

/** Por PESSOA (a conta, não o navegador — duas contas no mesmo perfil não dividem guias) e por página. */
export const chaveDasGuias = (pessoaId: string, pageId: string): string => `lagosta:editor:guias:${pessoaId}:${pageId}`

/** O teto de colunas/linhas de "Adicionar guias": acima disso é lixo, não grade (e travava a prévia). */
export const MAX_COLUNAS = 24

/** O JSON gravado → o estado; guia sem número finito ou sem orientação válida é descartada, o resto fica. */
export function lerGuias(json: string | null | undefined): GuiasDaPagina {
  if (!json) return { ...GUIAS_VAZIAS, guias: [] }
  let lido: unknown
  try {
    lido = JSON.parse(json)
  } catch {
    return { ...GUIAS_VAZIAS, guias: [] }
  }
  if (!lido || typeof lido !== 'object') return { ...GUIAS_VAZIAS, guias: [] }
  const o = lido as Record<string, unknown>
  const guias = Array.isArray(o.guias)
    ? (o.guias as unknown[]).flatMap((g): Guia[] => {
        if (!g || typeof g !== 'object') return []
        const { id, orientacao, posicao } = g as Record<string, unknown>
        if ((orientacao !== 'vertical' && orientacao !== 'horizontal') || typeof posicao !== 'number' || !Number.isFinite(posicao)) return []
        return [{ id: typeof id === 'string' && id ? id : `${orientacao}-${posicao}`, orientacao, posicao }]
      })
    : []
  return { guias, ocultas: o.ocultas === true, travadas: o.travadas === true }
}

let contador = 0
/** Id curto e único na sessão (o localStorage não precisa de mais). */
export const novoIdDeGuia = (): string => `g-${Date.now().toString(36)}-${(contador++).toString(36)}`

/** A guia solta FORA da página (de volta na régua ou além) é apagada; dentro, fica onde caiu. */
export function cairForaDaPagina(posicao: number, comprimento: number): boolean {
  return !Number.isFinite(posicao) || posicao < 0 || posicao > comprimento
}

/**
 * Colunas e linhas DENTRO da margem da marca: cada coluna ganha as duas bordas (como no Canva); posições repetidas
 * saem uma vez. `colunas`/`linhas` = 0 não gera nada naquele eixo; espaçamento negativo vira 0.
 */
export function gerarGuias(args: { colunas: number; linhas: number; espacamento: number; marca: LinhasDaMarca }): Guia[] {
  const esp = Number.isFinite(args.espacamento) ? Math.max(0, args.espacamento) : 0
  const eixo = (n: number, inicio: number, fim: number): number[] => {
    const qtd = Number.isFinite(n) ? Math.min(MAX_COLUNAS, Math.max(0, Math.floor(n))) : 0
    if (qtd === 0) return []
    const util = fim - inicio - esp * (qtd - 1)
    if (util <= 0) return []
    const largura = util / qtd
    const posicoes: number[] = []
    for (let i = 0; i < qtd; i++) {
      const a = inicio + i * (largura + esp)
      posicoes.push(Math.round(a), Math.round(a + largura))
    }
    return [...new Set(posicoes)]
  }
  const { marca } = args
  return [
    ...eixo(args.colunas, marca.esquerda, marca.direita).map((x, i): Guia => ({ id: `col-${i}-${x}`, orientacao: 'vertical', posicao: x })),
    ...eixo(args.linhas, marca.topo, marca.base).map((y, i): Guia => ({ id: `lin-${i}-${y}`, orientacao: 'horizontal', posicao: y })),
  ]
}

/** As guias como "objetos" de largura/altura zero: o encaixe ao arrastar gruda nelas. Vazio quando ocultas. */
export function retangulosDasGuias(estado: GuiasDaPagina, largura: number, altura: number): RectInfo[] {
  if (estado.ocultas) return []
  return estado.guias.map((g) =>
    g.orientacao === 'vertical' ? { id: `guia-${g.id}`, x: g.posicao, y: 0, width: 0, height: altura } : { id: `guia-${g.id}`, x: 0, y: g.posicao, width: largura, height: 0 },
  )
}

/** As paradas do encaixe no redimensionar. Vazio quando ocultas. */
export function paradasDasGuias(estado: GuiasDaPagina): { v: number[]; h: number[] } {
  if (estado.ocultas) return { v: [], h: [] }
  return {
    v: estado.guias.filter((g) => g.orientacao === 'vertical').map((g) => g.posicao),
    h: estado.guias.filter((g) => g.orientacao === 'horizontal').map((g) => g.posicao),
  }
}

/** O intervalo das marcas da régua pelo zoom (a régua do desktop usa os mesmos degraus). */
export function intervaloDaRegua(zoom: number): number {
  if (zoom >= 2) return 10
  if (zoom >= 1) return 25
  if (zoom >= 0.5) return 50
  if (zoom >= 0.25) return 100
  return 200
}

/** As marcas da régua em px do DESIGN, de 0 ao comprimento; a maior leva o número. */
export function marcasDaRegua(comprimento: number, zoom: number): Array<{ posicao: number; maior: boolean }> {
  const passo = intervaloDaRegua(zoom)
  const marcas: Array<{ posicao: number; maior: boolean }> = []
  for (let p = 0; p <= comprimento; p += passo) marcas.push({ posicao: p, maior: p % (passo * 2) === 0 || passo >= 100 })
  return marcas
}

/**
 * Junta guias novas às da página: posição já ocupada (mesma orientação) não entra, e TODA guia que entra ganha id
 * novo — o id de `gerarGuias` vem da posição original e repetiria depois de a pessoa mover a guia (Codex R1 do L4).
 */
export function acrescentarGuias(atuais: Guia[], novas: Guia[]): Guia[] {
  const ocupadas = new Set(atuais.map((g) => `${g.orientacao}:${g.posicao}`))
  const entram: Guia[] = []
  for (const g of novas) {
    const chave = `${g.orientacao}:${g.posicao}`
    if (ocupadas.has(chave)) continue
    ocupadas.add(chave)
    entram.push({ ...g, id: novoIdDeGuia() })
  }
  return [...atuais, ...entram]
}
