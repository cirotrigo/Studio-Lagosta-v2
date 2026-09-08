/**
 * A LEITURA MEDIDA da foto — o que o diretor de arte recebe em texto além da
 * própria imagem (08/09/2026, "religar o diretor").
 *
 * O diretor (`gpt-5.2` com visão) já ENXERGA a foto; o que ele não tem é
 * medida. Duas fontes baratas e determinísticas dizem o que a visão só
 * estima:
 *
 *  - o MAPA DE CALMA do compositor (`mapa-de-calma.ts`, ~100ms no sharp):
 *    energia de borda e luz por célula, de onde saem "onde a foto é calma" e
 *    "onde o assunto está" — a mesma régua que pousa o texto das peças
 *    compostas;
 *  - o CATÁLOGO v3 (`catalogo-de-fotos.ts`): assunto, elementos,
 *    enquadramento, pessoas, lotação, momento — a análise prévia por visão do
 *    acervo, que até aqui nenhum prompt de geração lia.
 *
 * Regra da casa (crivo, decodificador de guia, caixa das letras): o modelo
 * declara o fato, o CÓDIGO tira a conclusão. Aqui a conclusão "a região mais
 * calma é o terço superior à esquerda" sai da medição, e o diretor a recebe
 * pronta — em vez de adivinhar olhando.
 *
 * Módulo PURO (sem Prisma, sem sharp): recebe o mapa já calculado. Quem
 * decodifica a foto é `lerFotoComoCover` (`halo-medicao.ts`), no runner.
 */

import type { MapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import type { Rect } from '@/lib/creatives/halo/halo'

export interface EntradaDoCatalogoDaFoto {
  assunto?: string | null
  elementos?: string[] | null
  enquadramento?: string | null
  momento?: string | null
  lotacao?: string | null
  pessoas?: string | null
  description?: string | null
  menuItem?: string | null
  folder?: string | null
}

/** Uma das nove regiões (3 faixas × 3 colunas) com o que foi medido nela. */
export interface RegiaoLida {
  faixa: 'superior' | 'central' | 'inferior'
  coluna: 'esquerda' | 'centro' | 'direita'
  /** 0..1 — fração da energia máxima do quadro. */
  energia: number
  /** 0..255 — luz média. */
  luz: number
  calma: 'calma' | 'média' | 'agitada'
  tom: 'escura' | 'média' | 'clara'
}

const FAIXAS: RegiaoLida['faixa'][] = ['superior', 'central', 'inferior']
const COLUNAS: RegiaoLida['coluna'][] = ['esquerda', 'centro', 'direita']

/**
 * Agrupa a grade (6×10 por padrão) em nove regiões. A fração de energia vale
 * mais que o número absoluto: uma foto de estúdio inteira tem energia baixa,
 * um salão cheio tem alta, e "calma" é sempre RELATIVA ao próprio quadro.
 */
export function regioesDoMapa(mapa: MapaDeCalma): RegiaoLida[] {
  const { width, height } = mapa.canvas
  const regioes: RegiaoLida[] = []
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 3; c++) {
      const x0 = (width * c) / 3
      const x1 = (width * (c + 1)) / 3
      const y0 = (height * f) / 3
      const y1 = (height * (f + 1)) / 3
      let peso = 0
      let energia = 0
      let luz = 0
      for (const cel of mapa.celulas) {
        const ax = Math.max(0, Math.min(x1, cel.rect.x + cel.rect.width) - Math.max(x0, cel.rect.x))
        const ay = Math.max(0, Math.min(y1, cel.rect.y + cel.rect.height) - Math.max(y0, cel.rect.y))
        const a = ax * ay
        if (a <= 0) continue
        peso += a
        energia += cel.energia * a
        luz += cel.media * a
      }
      const e = peso > 0 && mapa.energiaMaxima > 0 ? energia / peso / mapa.energiaMaxima : 0
      const l = peso > 0 ? luz / peso : 0
      regioes.push({
        faixa: FAIXAS[f],
        coluna: COLUNAS[c],
        energia: e,
        luz: l,
        calma: e < 0.25 ? 'calma' : e < 0.5 ? 'média' : 'agitada',
        tom: l < 85 ? 'escura' : l < 170 ? 'média' : 'clara',
      })
    }
  }
  return regioes
}

function pct(v: number, total: number): string {
  return `${Math.round((v / total) * 100)}%`
}

/**
 * O texto que vai ao diretor. Sem opinião: faixa a faixa o que foi medido, o
 * assunto estimado em fração da altura/largura e as três regiões mais calmas,
 * em ordem. Quem decide onde o texto pousa é o diretor — mas decide sabendo.
 */
export function resumirMapaDeCalma(mapa: MapaDeCalma, assunto: Rect | null): string {
  const regioes = regioesDoMapa(mapa)
  const linhas: string[] = ['LEITURA MEDIDA DA FOTO (grade de energia e luz, calculada — não é opinião):']
  for (const faixa of FAIXAS) {
    const partes = regioes
      .filter((r) => r.faixa === faixa)
      .map((r) => `${r.coluna} ${r.calma} e ${r.tom}`)
    linhas.push(`- terço ${faixa}: ${partes.join('; ')}`)
  }
  if (assunto) {
    const { width, height } = mapa.canvas
    linhas.push(
      `- assunto estimado (região mais agitada): entre ${pct(assunto.y, height)} e ${pct(assunto.y + assunto.height, height)} da altura, de ${pct(assunto.x, width)} a ${pct(assunto.x + assunto.width, width)} da largura — texto e marca fora dela.`,
    )
  } else {
    linhas.push('- assunto: não localizado (a foto é uniformemente movimentada) — escolha pela calma relativa.')
  }
  const maisCalmas = [...regioes].sort((a, b) => a.energia - b.energia).slice(0, 3)
  linhas.push(`- regiões mais calmas, em ordem: ${maisCalmas.map((r) => `${r.faixa}-${r.coluna}`).join(', ')}.`)
  return linhas.join('\n')
}

/** A análise prévia do acervo, quando a foto tem entrada no catálogo. */
export function resumirCatalogoDaFoto(entrada: EntradaDoCatalogoDaFoto | null | undefined): string | null {
  if (!entrada) return null
  const partes: string[] = []
  if (entrada.assunto) partes.push(`assunto: ${entrada.assunto}`)
  else if (entrada.menuItem) partes.push(`prato: ${entrada.menuItem}`)
  if (entrada.elementos && entrada.elementos.length > 0) partes.push(`também no quadro: ${entrada.elementos.slice(0, 8).join(', ')}`)
  if (entrada.enquadramento) partes.push(`enquadramento: ${entrada.enquadramento}`)
  if (entrada.pessoas) partes.push(`pessoas: ${entrada.pessoas}`)
  if (entrada.lotacao) partes.push(`lotação: ${entrada.lotacao}`)
  if (entrada.momento) partes.push(`momento: ${entrada.momento}`)
  if (partes.length === 0 && entrada.description) partes.push(entrada.description.slice(0, 300))
  if (partes.length === 0) return null
  return `CATÁLOGO DA FOTO (análise prévia por visão do acervo): ${partes.join(' · ')}.`
}
