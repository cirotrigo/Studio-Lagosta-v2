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
import { resolverGeracoesSoDestePost } from '@/lib/creatives/geracoes-do-post'

/**
 * De onde veio o uso. TEXT no banco — o vocabulário ainda se move.
 *
 * `historico` é o que a semeadura grava: uso RECONSTRUÍDO de post já publicado,
 * não observado ao vivo. Fica separado de propósito, para dar para auditar (e
 * desfazer) o que veio de reconstituição.
 */
export type OrigemDeUso = 'arte-ia' | 'arte-rapida' | 'compositor' | 'externo' | 'historico'

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

// ── Desfazer o uso quando o post é apagado ─────────────────────────────────

export type MotivoDeNaoDesfazer = 'post-nao-encontrado' | 'publicado' | 'sem-arte' | 'erro'

export interface GeracoesParaDesfazer {
  /** As artes cujo uso de foto pode ser desfeito — só as que NENHUM outro post usa. */
  geracoes: string[]
  motivo?: MotivoDeNaoDesfazer
}

/**
 * Quais artes deste post terão o uso de foto desfeito — a LEITURA de
 * `desfazerUsoDeFotoDoPost`, separada para o dry-run
 * (`scripts/validar-desfazer-uso-de-foto.ts`) mostrar a conta sem apagar nada.
 *
 * Só post que NÃO foi publicado: o rascunho apagado nunca chegou ao Instagram,
 * então a foto dele não "saiu" — mantê-la como usada a empurrava para o fim do
 * rodízio por uma peça que não existiu (defeito real, 01/09/2026). Post
 * PUBLICADO é história: apagar o registro dele não desfaz a publicação, e o
 * uso continua verdadeiro. A guarda mora AQUI, e não em quem chama, porque o
 * DELETE web não barra POSTED.
 *
 * ⚠️ Nunca lança.
 */
export async function geracoesParaDesfazerUso(entrada: {
  projectId: number
  postId: string
}): Promise<GeracoesParaDesfazer> {
  try {
    const post = await db.socialPost.findUnique({
      where: { id: entrada.postId },
      select: { projectId: true, status: true, generationId: true, mediaUrls: true },
    })
    if (!post || post.projectId !== entrada.projectId) return { geracoes: [], motivo: 'post-nao-encontrado' }
    if (post.status === 'POSTED') return { geracoes: [], motivo: 'publicado' }

    const urls = (post.mediaUrls ?? []).filter((u) => typeof u === 'string' && u.length > 0)
    const filtros: Array<Record<string, unknown>> = []
    if (post.generationId) filtros.push({ id: post.generationId })
    if (urls.length > 0) filtros.push({ resultUrl: { in: urls } })
    if (filtros.length === 0) return { geracoes: [], motivo: 'sem-arte' }

    const selecao = { id: true, resultUrl: true, sourceGenerationId: true } as const

    // Carrossel: cada slide tem a sua Generation e o post só guarda a URL.
    const pool = await db.generation.findMany({
      where: { projectId: entrada.projectId, OR: filtros },
      select: selecao,
    })
    const noPool = new Set(pool.map((g) => g.id))

    // 🔴 Sobe a LINHAGEM: o post aponta para a melhoria e o uso da foto está
    // na original (medido em 01/09/2026 — sem isto, zero desfeitos).
    let pendentes = pool.map((g) => g.sourceGenerationId).filter((s): s is string => !!s && !noPool.has(s))
    for (let nivel = 0; pendentes.length > 0 && nivel < 10; nivel++) {
      const ancestrais = await db.generation.findMany({
        where: { projectId: entrada.projectId, id: { in: pendentes } },
        select: selecao,
      })
      for (const g of ancestrais) { pool.push(g); noPool.add(g.id) }
      pendentes = ancestrais.map((g) => g.sourceGenerationId).filter((s): s is string => !!s && !noPool.has(s))
    }

    const candidatas = resolverGeracoesSoDestePost(post, pool)
    if (candidatas.length === 0) return { geracoes: [], motivo: 'sem-arte' }

    // Para a PROTEÇÃO, o pool ganha as irmãs/descendentes das candidatas
    // (outra melhoria da mesma original): se outro post usa uma delas, a
    // original continua em uso.
    const descendentes = await db.generation.findMany({
      where: { projectId: entrada.projectId, sourceGenerationId: { in: candidatas }, id: { notIn: [...noPool] } },
      select: selecao,
    })
    for (const g of descendentes) { pool.push(g); noPool.add(g.id) }

    // Arte compartilhada com OUTRO post (duplicar na bancada, trocar-arte,
    // melhoria-irmã) continua em uso — desfazer mentiria sobre a peça que
    // ficou na agenda.
    const urlsDoPool = pool.map((g) => g.resultUrl).filter((u): u is string => !!u)
    const outros = await db.socialPost.findMany({
      where: {
        projectId: entrada.projectId,
        id: { not: entrada.postId },
        OR: [
          { generationId: { in: [...noPool] } },
          ...(urlsDoPool.length > 0 ? [{ mediaUrls: { hasSome: urlsDoPool } }] : []),
        ],
      },
      select: { generationId: true, mediaUrls: true },
    })
    const geracoesSoDeste = resolverGeracoesSoDestePost(post, pool, outros)
    return geracoesSoDeste.length > 0 ? { geracoes: geracoesSoDeste } : { geracoes: [], motivo: 'sem-arte' }
  } catch (erro) {
    console.warn('[uso-de-foto] não consegui resolver as artes do post:', erro)
    return { geracoes: [], motivo: 'erro' }
  }
}

/**
 * Apaga o `PhotoUsage` das artes de um post que está sendo EXCLUÍDO.
 *
 * Chame ANTES do `db.socialPost.delete` — depois dele não há mais post para
 * ler. Mesmo contrato de `registrarUsoDeFoto`: **nunca lança**; telemetria de
 * curadoria não pode impedir alguém de apagar um rascunho.
 */
export async function desfazerUsoDeFotoDoPost(entrada: {
  projectId: number
  postId: string
}): Promise<{ removidos: number; motivo?: MotivoDeNaoDesfazer }> {
  const { geracoes, motivo } = await geracoesParaDesfazerUso(entrada)
  if (geracoes.length === 0) return { removidos: 0, ...(motivo ? { motivo } : {}) }
  try {
    const r = await db.photoUsage.deleteMany({
      where: { projectId: entrada.projectId, generationId: { in: geracoes } },
    })
    return { removidos: r.count }
  } catch (erro) {
    console.warn('[uso-de-foto] não consegui desfazer o uso:', erro)
    return { removidos: 0, motivo: 'erro' }
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
