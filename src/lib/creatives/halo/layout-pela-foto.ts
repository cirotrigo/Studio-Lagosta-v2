/**
 * Layout pela foto — módulo PURO.
 *
 * Os templates "(3 layouts)" gerados por `scripts/lib/gerador-de-templates.ts`
 * têm três irmãos por tema: "1 · Dividido…" (manchete no topo, serviço no
 * rodapé), "2 · Topo…" (bloco no terço superior) e "3 · Rodapé…" (bloco no
 * terço inferior). Até aqui o irmão vinha do chamador; agora a FOTO decide:
 * o texto pousa na faixa mais CALMA (menor energia de borda), e quando as
 * duas faixas se parecem, a peça se divide.
 *
 * Só a decisão mora aqui; a medição (energia e luz das faixas) está em
 * `halo-medicao.ts`, porque usa sharp.
 */

export type LayoutPelaFoto = 'topo' | 'rodape' | 'dividido'

export interface FaixaParaLayout {
  /** Energia de borda da faixa (desvio-padrão do laplaciano). */
  energia: number
  /** Luz de leitura da faixa (0..255). Desempata: mais escura recebe o texto. */
  luz: number
}

export interface EscolhaDeLayout {
  layout: LayoutPelaFoto
  motivo: string
  /** |eTopo − eRodapé| / max(eTopo, eRodapé), 0..1. */
  diferenca: number
}

/** Abaixo disto as faixas são "iguais" e a peça se divide. */
export const LIMIAR_DE_DIFERENCA = 0.12

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '?'
}

/**
 * Decide o layout pelos números das duas faixas.
 *
 * - diferença de energia < `limiar` → `dividido` (as faixas se equivalem);
 * - senão, a faixa de MENOR energia recebe o texto: calma em cima → `topo`,
 *   calma embaixo → `rodape`;
 * - empate exato de energia (só acontece com `limiar` 0) → a mais escura.
 */
export function escolherLayoutPelaFoto(
  faixas: { topo: FaixaParaLayout; rodape: FaixaParaLayout },
  limiar = LIMIAR_DE_DIFERENCA,
): EscolhaDeLayout {
  const eT = Math.max(0, faixas.topo.energia)
  const eR = Math.max(0, faixas.rodape.energia)
  const maior = Math.max(eT, eR)
  const diferenca = maior > 0 ? Math.abs(eT - eR) / maior : 0
  const numeros = `energia topo ${fmt(eT)} × rodapé ${fmt(eR)} (diferença ${(diferenca * 100).toFixed(0)}%)`

  if (diferenca < limiar) {
    return {
      layout: 'dividido',
      diferenca,
      motivo: `as duas faixas se equivalem — ${numeros}; manchete no topo, serviço no rodapé`,
    }
  }
  if (eT < eR) {
    return { layout: 'topo', diferenca, motivo: `a faixa de cima é a mais calma — ${numeros}` }
  }
  if (eR < eT) {
    return { layout: 'rodape', diferenca, motivo: `a faixa de baixo é a mais calma — ${numeros}` }
  }
  // Empate exato: a mais escura recebe o texto.
  const layout: LayoutPelaFoto = faixas.topo.luz <= faixas.rodape.luz ? 'topo' : 'rodape'
  return {
    layout,
    diferenca,
    motivo: `energia igual nas duas faixas; a mais escura recebe o texto (luz topo ${fmt(faixas.topo.luz)} × rodapé ${fmt(faixas.rodape.luz)})`,
  }
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** O template é da família gerada ("<cliente> — <tema> (3 layouts)")? */
export function ehTemplateDeTresLayouts(nomeDoTemplate: string | null | undefined): boolean {
  return /\(\s*3\s+layouts\s*\)/i.test(nomeDoTemplate ?? '')
}

/**
 * Qual layout uma página-irmã representa, pelo NOME que o gerador grava
 * (`NOME_DO_LAYOUT`): "1 · Dividido — manchete no topo, serviço no rodapé",
 * "2 · Topo — manchete e apoio no terço superior", "3 · Rodapé — bloco no
 * terço inferior, foto domina". Só o rótulo antes do travessão conta — a
 * descrição do "Dividido" cita topo E rodapé.
 */
export function layoutDoNomeDaPagina(nome: string | null | undefined): LayoutPelaFoto | null {
  if (!nome) return null
  const rotulo = normalizar(nome.split(/\s[—–-]\s|—/)[0] ?? '')
  if (/\bdividido\b/.test(rotulo)) return 'dividido'
  if (/\btopo\b/.test(rotulo)) return 'topo'
  if (/\brodape\b/.test(rotulo)) return 'rodape'
  const numero = rotulo.match(/^\s*([123])\b/)
  if (numero) return (['dividido', 'topo', 'rodape'] as const)[Number(numero[1]) - 1]
  return null
}
