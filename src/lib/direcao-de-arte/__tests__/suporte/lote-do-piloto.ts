/**
 * Piloto sintético (§ 1.3 do contrato) — o LOTE: as specs DITAS (função pura), nunca sorteadas em runtime. Eixos: cliente ×
 * formato × entrada do eixo "foto" (7 sintéticas + a real de 13/10 + "sem foto") × copy (curta/média/longa) × arquétipo (sem +
 * os do catálogo disponíveis no T1a). Exclusões REGISTRADAS: arquétipo indisponível (aguarda T1b), arquétipo que não aceita o
 * formato, arquétipo que exige caixa de assunto numa foto sem assunto. A amostra padrão é determinística (1 em k pela ordem
 * estável) com cobertura mínima por valor de cada eixo; `--completo` é tudo. Denominadores por etapa saem daqui.
 */
import { createHash } from 'node:crypto'
import { listarArquetipos } from '@/lib/compositor/arquetipos/catalogo'
import { disponibilidadeNoT1a } from '@/lib/compositor/arquetipos/na-spec'
import { VERSAO_DAS_FOTOS_SINTETICAS, type CasoDaFoto, type FormatoDaFoto } from './fotos-sinteticas'

export type CopyDoLote = 'curta' | 'media' | 'longa'
export const COPIES: Record<CopyDoLote, Array<{ papel: 'pre' | 'headline' | 'apoio' | 'servico'; linhas: string[] }>> = {
  // A curta já leva apoio: é o mínimo que TODO arquétipo do catálogo aceita (apoio é obrigatório em dois deles).
  curta: [
    { papel: 'headline', linhas: ['Almoço do dia'] },
    { papel: 'apoio', linhas: ['Prato feito'] },
    { papel: 'servico', linhas: ['Seg a sex, 11h30'] },
  ],
  media: [
    { papel: 'pre', linhas: ['Quarta-feira'] },
    { papel: 'headline', linhas: ['Almoço executivo'] },
    { papel: 'apoio', linhas: ['Entrada, prato e café'] },
    { papel: 'servico', linhas: ['Reserve pelo direct'] },
  ],
  // Longa dentro do teto dos arquétipos (apoio e serviço ≤ 2 linhas): o excesso de linhas é recusa estrutural do T1a, não um caso do lote.
  longa: [
    { papel: 'headline', linhas: ['Almoço executivo', 'de sexta'] },
    { papel: 'apoio', linhas: ['Entrada da casa, prato', 'do chef e café coado'] },
    { papel: 'servico', linhas: ['Seg a sex, 11h30 às 15h', 'Reserve pelo direct'] },
  ],
}

export interface ClienteDoLote {
  id: string
  /** Formatos com página de assinatura disponível. */
  formatos: FormatoDaFoto[]
  /** Hash dos insumos do cliente (assinatura, números, logos): entra no `loteId`. */
  versao?: string
}
export interface EntradaDeFoto {
  id: string
  /** Caso sintético, a real de 13/10 ou "sem foto". */
  caso: CasoDaFoto | 'real' | 'sem-foto'
  temAssunto: boolean
  /** A real de 13/10 é story; as sintéticas existem nos dois formatos; "sem foto" em ambos. */
  formatos: FormatoDaFoto[]
}
export const ENTRADAS_DE_FOTO: readonly EntradaDeFoto[] = [
  { id: 'A1', caso: 'A1', temAssunto: true, formatos: ['story', 'feed'] },
  { id: 'A2', caso: 'A2', temAssunto: true, formatos: ['story', 'feed'] },
  { id: 'A3', caso: 'A3', temAssunto: true, formatos: ['story', 'feed'] },
  { id: 'B', caso: 'B', temAssunto: false, formatos: ['story', 'feed'] },
  { id: 'C', caso: 'C', temAssunto: false, formatos: ['story', 'feed'] },
  { id: 'D', caso: 'D', temAssunto: false, formatos: ['story', 'feed'] },
  { id: 'E', caso: 'E', temAssunto: false, formatos: ['story', 'feed'] },
  { id: 'F', caso: 'F', temAssunto: false, formatos: ['story', 'feed'] },
  { id: 'real', caso: 'real', temAssunto: true, formatos: ['story'] },
  { id: 'sem-foto', caso: 'sem-foto', temAssunto: false, formatos: ['story', 'feed'] },
]

export type ArquetipoDoLote = 'sem' | string
export interface SpecDoLote {
  chave: string
  cliente: string
  formato: FormatoDaFoto
  foto: EntradaDeFoto['id']
  copy: CopyDoLote
  arquetipo: ArquetipoDoLote
}
export interface Exclusao {
  cliente: string
  formato: FormatoDaFoto
  foto: string
  copy: CopyDoLote
  arquetipo: string
  motivo: 'arquetipo-indisponivel' | 'arquetipo-sem-formato' | 'arquetipo-exige-assunto'
}
export interface Denominadores {
  elegiveis: number
  excluidos: Record<Exclusao['motivo'], number>
  amostra: number
  porEixo: Record<'cliente' | 'formato' | 'foto' | 'copy' | 'arquetipo', Record<string, number>>
}

/** Os arquétipos do catálogo com a disponibilidade do T1a (o indisponível vira exclusão, não peça). */
export function arquetiposDoLote(): Array<{ id: string; formatos: FormatoDaFoto[]; disponivel: boolean; motivo?: string }> {
  return listarArquetipos().map((a) => {
    const d = disponibilidadeNoT1a(a)
    return { id: a.id, formatos: Object.keys(a.formatos) as FormatoDaFoto[], disponivel: d.disponivel, ...(d.motivo ? { motivo: d.motivo } : {}) }
  })
}

/** `insumosVisuais`: hash do que o lote não enxerga (bytes da foto real, semente) — entra no `loteId`. */
export function specsDoLote(entrada: { clientes: ClienteDoLote[]; amostra: number | 'completo'; coberturaMinima?: number; insumosVisuais?: string }): {
  loteId: string
  elegiveis: SpecDoLote[]
  excluidos: Exclusao[]
  amostra: SpecDoLote[]
  denominadores: Denominadores
} {
  const arquetipos = arquetiposDoLote()
  const elegiveis: SpecDoLote[] = []
  const excluidos: Exclusao[] = []
  for (const cliente of entrada.clientes) {
    for (const formato of cliente.formatos) {
      for (const foto of ENTRADAS_DE_FOTO.filter((f) => f.formatos.includes(formato))) {
        for (const copy of Object.keys(COPIES) as CopyDoLote[]) {
          elegiveis.push({ chave: `${cliente.id}|${formato}|${foto.id}|${copy}|sem`, cliente: cliente.id, formato, foto: foto.id, copy, arquetipo: 'sem' })
          for (const a of arquetipos) {
            const base = { cliente: cliente.id, formato, foto: foto.id, copy, arquetipo: a.id }
            if (!a.disponivel) excluidos.push({ ...base, motivo: 'arquetipo-indisponivel' })
            else if (!a.formatos.includes(formato)) excluidos.push({ ...base, motivo: 'arquetipo-sem-formato' })
            // CP2B: com arquétipo a posição é escolhida pela foto e a região protegida é obrigatória.
            else if (!foto.temAssunto) excluidos.push({ ...base, motivo: 'arquetipo-exige-assunto' })
            else elegiveis.push({ chave: `${cliente.id}|${formato}|${foto.id}|${copy}|${a.id}`, ...base })
          }
        }
      }
    }
  }
  elegiveis.sort((x, y) => x.chave.localeCompare(y.chave))
  // O id do lote identifica os INSUMOS, não só as chaves: copies, entradas de foto, arquétipos e a versão de cada cliente.
  const insumos = JSON.stringify({ copies: COPIES, fotos: ENTRADAS_DE_FOTO, versaoDasFotosSinteticas: VERSAO_DAS_FOTOS_SINTETICAS, insumosVisuais: entrada.insumosVisuais ?? null, arquetipos: arquetipos.map((a) => `${a.id}:${a.disponivel}:${a.formatos.join('/')}`), clientes: entrada.clientes.map((c) => [c.id, c.versao ?? null]) })
  const loteId = `piloto-sintetico-${createHash('sha256').update(insumos).update('\n').update(elegiveis.map((e) => e.chave).join('\n')).digest('hex').slice(0, 12)}`
  let amostra: SpecDoLote[]
  if (entrada.amostra === 'completo') amostra = [...elegiveis]
  else {
    const k = Math.max(1, Math.round(1 / entrada.amostra))
    amostra = elegiveis.filter((_, i) => i % k === 0)
    const minimo = entrada.coberturaMinima ?? 3
    for (const eixo of ['cliente', 'formato', 'foto', 'copy', 'arquetipo'] as const) {
      const valores = new Set(elegiveis.map((e) => e[eixo]))
      for (const v of valores) {
        let faltam = minimo - amostra.filter((e) => e[eixo] === v).length
        for (const e of elegiveis) {
          if (faltam <= 0) break
          if (e[eixo] === v && !amostra.includes(e)) {
            amostra.push(e)
            faltam--
          }
        }
      }
    }
    // Decisão 1 e modo G (§ 4.2) precisam de peças SEM arquétipo com foto de assunto (A1/A2): a cobertura por eixo não garante o PAR.
    for (const foto of ENTRADAS_DE_FOTO.filter((f) => f.temAssunto)) {
      let faltam = minimo - amostra.filter((e) => e.foto === foto.id && e.arquetipo === 'sem').length
      for (const e of elegiveis) {
        if (faltam <= 0) break
        if (e.foto === foto.id && e.arquetipo === 'sem' && !amostra.includes(e)) {
          amostra.push(e)
          faltam--
        }
      }
    }
    amostra.sort((x, y) => x.chave.localeCompare(y.chave))
  }
  const porEixo = Object.fromEntries((['cliente', 'formato', 'foto', 'copy', 'arquetipo'] as const).map((eixo) => [eixo, contar(amostra.map((e) => e[eixo]))])) as Denominadores['porEixo']
  const excluidosPorMotivo = contar(excluidos.map((e) => e.motivo)) as Record<Exclusao['motivo'], number>
  for (const m of ['arquetipo-indisponivel', 'arquetipo-sem-formato', 'arquetipo-exige-assunto'] as const) excluidosPorMotivo[m] ??= 0
  return { loteId, elegiveis, excluidos, amostra, denominadores: { elegiveis: elegiveis.length, excluidos: excluidosPorMotivo, amostra: amostra.length, porEixo } }
}

function contar(valores: string[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const v of valores) r[v] = (r[v] ?? 0) + 1
  return r
}
