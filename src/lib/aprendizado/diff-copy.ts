/**
 * Diff entre a copy SUGERIDA e a copy FINAL.
 *
 * É o sinal mais rico do aprendizado por uso: não "gostou/não gostou", mas
 * *o que* a pessoa mudou — que headline reescreveu, que campo apagou, que
 * texto acrescentou.
 *
 * ⚠️ O DEFEITO A EVITAR É O DIFF FALSAMENTE VAZIO. `Page.layers` tem
 * codificação inconsistente no banco (array, string JSON, às vezes
 * dupla-codificada) e o `parseLayers` da arte-rápida devolve `[]` em silêncio
 * na dupla. Um diff que aceitasse isso registraria "o usuário não editou
 * nada" justamente nas páginas que ninguém consegue ler — e o corpus
 * aprenderia que a sugestão estava perfeita. Por isso:
 *
 *   - a leitura das camadas passa por `page-layers.ts` (decodificação
 *     profunda, a única correta da base);
 *   - o resultado carrega `ilegivel`, e `desfechoPeloDiff` devolve `null`
 *     nesse caso. Ilegível NUNCA vira "aceita-como-veio".
 *
 * O módulo é PURO (sem Prisma, sem rede): quem carrega os dois lados do banco
 * é `captura.ts`. É o que permite testar o caso da camada dupla-codificada
 * sem banco nenhum.
 */

import { normalizeForComparison } from '@/lib/ai/text-comparison'
import { lerCamadas, textosDaPagina } from '@/lib/posts/page-layers'
import type { Desfecho } from './vocabulario'

/**
 * Um lado do diff. Aceita as duas formas que a base já produz:
 *
 *  - `Record<campo, texto>` — o formato de `slotValues` e de
 *    `textosDaPagina` (tem NOME de campo, e por isso o diff é por campo);
 *  - `string[]` — o formato de `extractExpectedTexts`, que devolve só os
 *    valores. Sem nomes, o pareamento é por conteúdo.
 */
export type LadoDaCopy = Record<string, string> | string[] | null | undefined

export interface CampoAlterado {
  /** Nome do campo quando existe dos dois lados; `null` no pareamento por conteúdo. */
  campo: string | null
  antes: string
  depois: string
  /**
   * `true` quando a diferença some na normalização da casa (caixa, acento,
   * separador de lista, espaço do "R$"). É edição de DIAGRAMAÇÃO, não de
   * conteúdo — a F2 vai querer pesá-la diferente.
   */
  apenasFormatacao: boolean
  /** 0..1, quanto os dois textos se parecem (bigramas). */
  semelhanca: number
}

export interface DiffDeCopy {
  /** Houve qualquer diferença de conteúdo entre os dois lados. */
  mudou: boolean
  /**
   * Não deu para ler um dos lados. **`mudou: false` aqui não significa "não
   * editou"** — significa "não sei". Quem agrega precisa descartar a linha.
   */
  ilegivel: boolean
  motivo?: string
  /** Textos que existem dos dois lados, alterados. */
  alterados: CampoAlterado[]
  /** Textos que só existem no final (a pessoa acrescentou). */
  adicionados: Array<{ campo: string | null; texto: string }>
  /** Textos que só existem na sugestão (a pessoa tirou). */
  removidos: Array<{ campo: string | null; texto: string }>
  /** Campos que ficaram idênticos, caractere a caractere. */
  iguais: string[]
  /** Quantos textos a sugestão tinha (denominador de `proporcaoAlterada`). */
  totalSugerido: number
  /** 0..1 — fração dos textos sugeridos que não sobreviveu intacta. */
  proporcaoAlterada: number
}

/** Semelhança mínima para considerar que um texto foi EDITADO e não trocado. */
const LIMIAR_EDICAO = 0.45

const DIFF_ILEGIVEL = (motivo: string): DiffDeCopy => ({
  mudou: false,
  ilegivel: true,
  motivo,
  alterados: [],
  adicionados: [],
  removidos: [],
  iguais: [],
  totalSugerido: 0,
  proporcaoAlterada: 0,
})

function normalizarLado(lado: LadoDaCopy): { comChave: Record<string, string> | null; valores: string[] } | null {
  if (lado == null) return null
  if (Array.isArray(lado)) {
    const valores = lado.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
    return { comChave: null, valores }
  }
  if (typeof lado !== 'object') return null
  const comChave: Record<string, string> = {}
  for (const [campo, valor] of Object.entries(lado)) {
    // `_driveImageId` / `_imageUrl` são reservados do slotValues — não são copy.
    if (campo.startsWith('_')) continue
    if (typeof valor !== 'string') continue
    const limpo = valor.trim()
    if (!limpo) continue
    comChave[campo] = limpo
  }
  return { comChave, valores: Object.values(comChave) }
}

/**
 * Os textos de um lado da copy, na ordem, já limpos — as MESMAS regras que o
 * diff usa (campo reservado `_…` fora, vazio fora, sem espaço nas pontas).
 *
 * Existe para quem precisa entregar `string[]` a jusante (a dica de copy guarda
 * `blocos`) sem reimplementar a normalização: duas noções de "o que conta como
 * texto da peça" fariam o mesmo texto comparar diferente conforme o caminho.
 */
export function valoresDaCopy(lado: LadoDaCopy): string[] {
  return normalizarLado(lado)?.valores ?? []
}

/**
 * Semelhança por bigramas (Dice) sobre o texto normalizado. Barata,
 * independente de ordem de palavras e sem dependência externa.
 */
export function semelhanca(a: string, b: string): number {
  const x = normalizeForComparison(a)
  const y = normalizeForComparison(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0

  const bigramas = new Map<string, number>()
  for (let i = 0; i < x.length - 1; i++) {
    const par = x.slice(i, i + 2)
    bigramas.set(par, (bigramas.get(par) ?? 0) + 1)
  }
  let comuns = 0
  for (let i = 0; i < y.length - 1; i++) {
    const par = y.slice(i, i + 2)
    const restante = bigramas.get(par) ?? 0
    if (restante > 0) {
      bigramas.set(par, restante - 1)
      comuns++
    }
  }
  return (2 * comuns) / (x.length - 1 + (y.length - 1))
}

function alteracao(campo: string | null, antes: string, depois: string): CampoAlterado {
  return {
    campo,
    antes,
    depois,
    apenasFormatacao: normalizeForComparison(antes) === normalizeForComparison(depois),
    semelhanca: semelhanca(antes, depois),
  }
}

/**
 * Compara a copy proposta com a que foi de fato usada.
 *
 * Quando os DOIS lados têm nome de campo, a comparação é por campo (é o caso
 * de `slotValues` × `textosDaPagina`). Quando um dos lados vem sem nomes
 * (`extractExpectedTexts`), o pareamento é por conteúdo: o que sobra dos dois
 * lados é casado pelo texto mais parecido, e só vira "alterado" acima do
 * limiar de semelhança — abaixo dele são um texto removido e outro
 * acrescentado, que é o que de fato aconteceu.
 */
export function diffDeCopy(sugerida: LadoDaCopy, final: LadoDaCopy): DiffDeCopy {
  const a = normalizarLado(sugerida)
  const b = normalizarLado(final)

  if (!a) return DIFF_ILEGIVEL('não há copy sugerida para comparar')
  if (!b) return DIFF_ILEGIVEL('não deu para ler a copy final')

  const alterados: CampoAlterado[] = []
  const adicionados: Array<{ campo: string | null; texto: string }> = []
  const removidos: Array<{ campo: string | null; texto: string }> = []
  const iguais: string[] = []

  if (a.comChave && b.comChave) {
    const campos = new Set([...Object.keys(a.comChave), ...Object.keys(b.comChave)])
    for (const campo of campos) {
      const antes = a.comChave[campo]
      const depois = b.comChave[campo]
      if (antes != null && depois != null) {
        if (antes === depois) iguais.push(campo)
        else alterados.push(alteracao(campo, antes, depois))
      } else if (antes != null) {
        removidos.push({ campo, texto: antes })
      } else if (depois != null) {
        adicionados.push({ campo, texto: depois })
      }
    }
  } else {
    // Pareamento por conteúdo. O que bate exatamente sai da conta primeiro,
    // para não ser roubado por um vizinho parecido.
    const sobraA = [...a.valores]
    const sobraB = [...b.valores]

    for (let i = sobraA.length - 1; i >= 0; i--) {
      const j = sobraB.indexOf(sobraA[i])
      if (j >= 0) {
        iguais.push(sobraA[i])
        sobraA.splice(i, 1)
        sobraB.splice(j, 1)
      }
    }

    for (let i = sobraA.length - 1; i >= 0; i--) {
      let melhor = -1
      let melhorScore = 0
      for (let j = 0; j < sobraB.length; j++) {
        const s = semelhanca(sobraA[i], sobraB[j])
        if (s > melhorScore) {
          melhorScore = s
          melhor = j
        }
      }
      if (melhor >= 0 && melhorScore >= LIMIAR_EDICAO) {
        alterados.push(alteracao(null, sobraA[i], sobraB[melhor]))
        sobraB.splice(melhor, 1)
        sobraA.splice(i, 1)
      }
    }

    for (const texto of sobraA) removidos.push({ campo: null, texto })
    for (const texto of sobraB) adicionados.push({ campo: null, texto })
  }

  const totalSugerido = a.comChave ? Object.keys(a.comChave).length : a.valores.length
  const tocados = alterados.length + removidos.length
  const mudou = alterados.length > 0 || adicionados.length > 0 || removidos.length > 0

  return {
    mudou,
    ilegivel: false,
    alterados,
    adicionados,
    removidos,
    iguais,
    totalSugerido,
    proporcaoAlterada: totalSugerido > 0 ? Math.min(1, tocados / totalSugerido) : mudou ? 1 : 0,
  }
}

/**
 * Copy de uma página do editor, no formato com nome de campo.
 *
 * Devolve `null` quando as camadas são ILEGÍVEIS — e é essa distinção entre
 * "página sem texto" (`{}`) e "não consegui ler" (`null`) que impede o diff
 * falsamente vazio. Use sempre isto, nunca `parseLayers` da arte-rápida.
 */
export function copyDeCamadas(layers: unknown): Record<string, string> | null {
  const { legivel } = lerCamadas(layers)
  if (!legivel) return null
  return textosDaPagina(layers)
}

/**
 * O desfecho que o diff sugere — `null` quando o diff não permite concluir.
 *
 * `null` não é "sem mudança": é "não sei", e quem registra tem de tratá-lo
 * como ausência de sinal, não como aceitação.
 */
export function desfechoPeloDiff(diff: DiffDeCopy): Desfecho | null {
  if (diff.ilegivel) return null
  if (!diff.mudou) return 'aceita-como-veio'
  // Nada da sugestão sobreviveu: não foi editada, foi substituída.
  if (diff.iguais.length === 0 && diff.alterados.length === 0) return 'trocada'
  return 'editada'
}
