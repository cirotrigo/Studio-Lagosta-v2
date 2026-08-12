/**
 * Registro de uso das fotos do acervo (B5).
 *
 * O QUE ESTAVA QUEBRADO: o `usageHistory` do `_image-catalog.json` nunca era
 * escrito por caminho nenhum do Studio — o único `push` vivo está em
 * `scripts/generate-creatives.ts`, o gerador CLI antigo. Como `ultimoUso()`
 * devolve `'2000-01-01'` para histórico vazio, o `sort` de "menos usadas
 * primeiro" ordenava um campo CONSTANTE: era no-op, e toda foto respondia
 * `ultimoUso: 'nunca'`. A regra do DNA de não repetir foto dentro da semana
 * não tinha como ser cumprida — nem para foto usada DENTRO do Studio.
 *
 * POR QUE NO BANCO, e não no JSON do Drive:
 *
 * 1. **Corrida.** O catálogo é um arquivo único; duas gerações simultâneas
 *    fariam read-modify-write uma por cima da outra e um dos usos sumiria.
 * 2. **Durabilidade.** Regerar o catálogo zera `usageHistory`
 *    (`reconciliar-catalogo.ts` cria entrada nova com `[]`), então o histórico
 *    morria a cada recatalogação.
 *
 * O catálogo segue sendo lido como LEGADO: `mesclarUsos` funde as duas fontes,
 * para as marcações antigas do gerador CLI não serem perdidas.
 */

import { db } from '@/lib/db'

/** De onde veio o uso. TEXT no banco — o vocabulário ainda se move. */
export type OrigemDeUso = 'arte-ia' | 'arte-rapida' | 'externo'

export interface RegistroDeUso {
  projectId: number
  /** Ids do Drive. Repetidos na mesma chamada contam uma vez só. */
  driveFileIds: string[]
  origem: OrigemDeUso
  tema?: string | null
  generationId?: string | null
  /** Quando o uso aconteceu. Padrão: agora. Serve para marcar peça já publicada. */
  usedAt?: Date | null
}

/**
 * Marca as fotos como usadas.
 *
 * ⚠️ **Nunca lança.** Registrar uso é telemetria de curadoria: falhar aqui não
 * pode derrubar uma arte que já ficou pronta e já foi paga — mesmo contrato de
 * `captura.ts` e de `sendWhatsAppText`.
 *
 * Chame DEPOIS do sucesso. Contar uso de uma foto cuja arte falhou mentiria
 * sobre a preferência do cliente, pela mesma razão que o rodízio de referência
 * de estilo só marca uso quando a arte existe.
 */
export async function registrarUsoDeFoto(registro: RegistroDeUso): Promise<number> {
  const ids = [...new Set(registro.driveFileIds.filter((id) => typeof id === 'string' && id.trim()))]
  if (ids.length === 0) return 0
  try {
    const r = await db.photoUsage.createMany({
      data: ids.map((driveFileId) => ({
        projectId: registro.projectId,
        driveFileId,
        origem: registro.origem,
        tema: registro.tema?.slice(0, 200) ?? null,
        generationId: registro.generationId ?? null,
        ...(registro.usedAt ? { usedAt: registro.usedAt } : {}),
      })),
    })
    return r.count
  } catch (erro) {
    console.warn('[uso-de-foto] não consegui registrar o uso:', erro)
    return 0
  }
}

export interface UsoDaFoto {
  /** ISO da última vez que a foto foi usada. */
  ultimoUso: string
  vezes: number
}

/**
 * Último uso e contagem por foto, do banco.
 *
 * Uma consulta por projeto — não uma por foto. O `groupBy` com `_max` resolve
 * as duas perguntas de uma vez e o índice `(projectId, driveFileId)` cobre.
 */
export async function lerUsosDeFoto(projectId: number): Promise<Map<string, UsoDaFoto>> {
  const mapa = new Map<string, UsoDaFoto>()
  try {
    const linhas = await db.photoUsage.groupBy({
      by: ['driveFileId'],
      where: { projectId },
      _max: { usedAt: true },
      _count: { _all: true },
    })
    for (const l of linhas) {
      if (!l._max.usedAt) continue
      mapa.set(l.driveFileId, {
        ultimoUso: l._max.usedAt.toISOString(),
        vezes: l._count._all,
      })
    }
  } catch (erro) {
    // Sem o registro, a ordenação cai no comportamento antigo — degradação
    // honesta, e não tela vazia.
    console.warn('[uso-de-foto] não consegui ler os usos:', erro)
  }
  return mapa
}

/**
 * A data que vale para ordenar: a MAIS RECENTE entre o banco e o
 * `usageHistory` legado do catálogo.
 *
 * O legado ainda tem valor — são as marcações do gerador CLI antigo, e jogá-las
 * fora faria fotos realmente usadas voltarem ao topo do rodízio.
 */
export function mesclarUsos(
  doBanco: UsoDaFoto | undefined,
  doCatalogo: string | undefined,
): string | null {
  const a = doBanco?.ultimoUso ?? null
  const b = doCatalogo && doCatalogo.length > 0 ? doCatalogo : null
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}
