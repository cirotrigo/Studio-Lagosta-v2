/**
 * As FAIXAS do arquétipo (CP2B): os papéis cujas ZONAS se sobrepõem na vertical, por fecho transitivo. Vivia em
 * `candidatos-espaciais.ts`; mudou para cá em 29/10/2026 porque a materialização também precisa delas (a pilha da
 * unidade). Texto intacto.
 */
import type { MembroDaFaixa } from './busca-espacial-tipos'
import type { ArquetipoDeLayout, FormatoDoArquetipo, Zona } from './tipos'

/**
 * As FAIXAS do arquétipo num formato: os papéis com referência e zona (a logo automática fica fora) cujas ZONAS se
 * sobrepõem na vertical, por fecho transitivo. Faixas na ordem do primeiro membro na leitura; membros na leitura.
 */
export function faixasDoArquetipo(arquetipo: ArquetipoDeLayout, formato: FormatoDoArquetipo): MembroDaFaixa[][] {
  const ordem = new Map(arquetipo.papeis.map((p) => [p.papel, p.ordemDeLeitura]))
  const porOrdem = (a: MembroDaFaixa, b: MembroDaFaixa) => (ordem.get(a) ?? 99) - (ordem.get(b) ?? 99)
  const zonas = new Map<MembroDaFaixa, Zona>()
  for (const [papel, pos] of Object.entries(arquetipo.formatos[formato].papeis)) {
    if (pos && 'zona' in pos) zonas.set(papel as MembroDaFaixa, pos.zona)
  }
  const sobrepoem = (a: MembroDaFaixa, b: MembroDaFaixa) => zonas.get(a)!.yMin < zonas.get(b)!.yMax && zonas.get(b)!.yMin < zonas.get(a)!.yMax
  let faixas: MembroDaFaixa[][] = []
  // União incremental: cada membro funde todas as faixas que toca (o fecho transitivo).
  for (const m of [...zonas.keys()].sort(porOrdem)) {
    const tocadas = faixas.filter((f) => f.some((o) => sobrepoem(o, m)))
    faixas = [...faixas.filter((f) => !tocadas.includes(f)), [...tocadas.flat(), m].sort(porOrdem)]
  }
  return faixas.sort((a, b) => porOrdem(a[0], b[0]))
}
