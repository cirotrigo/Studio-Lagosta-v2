/**
 * Referências de estilo do projeto — as artes que a equipe aprovou e quer que
 * as próximas se pareçam com.
 *
 * O problema que isto resolve: sem referência, cada peça nasce do zero e a
 * marca não tem cara própria; com uma referência FIXA, toda peça sai igual à
 * anterior. A saída é o **rodízio**: manda uma aprovada por vez, sempre a
 * menos usada. O resultado é parentesco em vez de clone — a mesma lógica que
 * o acervo já usa para não repetir foto entre os posts de uma leva.
 *
 * Uma só por geração, e não duas: o papel `style` tem teto de 2, mas
 * referências competindo causam deriva visual (regra-mãe do plano). Duas
 * aprovadas de levas diferentes puxariam a peça para lugares opostos.
 */

import { db } from '@/lib/db'

export interface StyleReference {
  generationId: string
  resultUrl: string
  /** Nunca usada ainda — informativo para quem loga. */
  inedita: boolean
}

/**
 * Escolhe a referência de estilo da vez: a marcada há mais tempo sem uso.
 * Devolve null quando o projeto não tem nenhuma marcada.
 *
 * NÃO marca como usada aqui — quem confirma é `registrarUsoDaReferencia`,
 * depois de a geração dar certo. Marcar antes faria uma geração que falhou
 * empurrar a referência para o fim da fila sem nunca ter chegado ao modelo.
 */
export async function escolherReferenciaDeEstilo(projectId: number): Promise<StyleReference | null> {
  const escolhida = await db.generation.findFirst({
    where: {
      projectId,
      styleRefAt: { not: null },
      status: 'COMPLETED',
      resultUrl: { not: null },
    },
    // ⚠️ `nulls: 'first'` EXPLÍCITO. Em Postgres, `ASC` ordena NULLS **LAST**,
    // e sem isto a referência que já foi usada (timestamp) vinha ANTES das que
    // nunca foram (NULL) — o rodízio devolvia sempre a mesma, que é exatamente
    // o defeito que ele existe para não ter. Medido em 10/08/2026: cinco
    // gerações seguidas escolheram a mesma arte.
    orderBy: [{ styleRefUsedAt: { sort: 'asc', nulls: 'first' } }, { styleRefAt: 'asc' }],
    select: { id: true, resultUrl: true, styleRefUsedAt: true },
  })
  if (!escolhida?.resultUrl) return null
  return {
    generationId: escolhida.id,
    resultUrl: escolhida.resultUrl,
    inedita: escolhida.styleRefUsedAt === null,
  }
}

/** Empurra a referência para o fim da fila do rodízio. */
export async function registrarUsoDaReferencia(generationId: string): Promise<void> {
  await db.generation
    .update({ where: { id: generationId }, data: { styleRefUsedAt: new Date() } })
    // Falha aqui não pode derrubar uma arte pronta: o pior efeito é a mesma
    // referência sair duas vezes seguidas.
    .catch((error) => console.warn('[style-ref] não deu para registrar o uso:', error))
}

/**
 * Marca/desmarca uma arte como referência de estilo.
 *
 * Só arte pronta pode virar referência — uma Generation em PROCESSING não tem
 * `resultUrl` para mandar ao modelo.
 */
export async function definirReferenciaDeEstilo(
  generationId: string,
  marcada: boolean,
): Promise<{ generationId: string; marcada: boolean }> {
  const gen = await db.generation.findUnique({
    where: { id: generationId },
    select: { id: true, status: true, resultUrl: true },
  })
  if (!gen) throw new Error('Arte não encontrada.')
  if (marcada && (gen.status !== 'COMPLETED' || !gen.resultUrl)) {
    throw new Error('Só arte pronta pode virar referência de estilo.')
  }

  await db.generation.update({
    where: { id: generationId },
    data: {
      styleRefAt: marcada ? new Date() : null,
      // Desmarcar zera o rodízio: se ela voltar a ser referência um dia, entra
      // como inédita em vez de carregar um "usada" de meses atrás.
      ...(marcada ? {} : { styleRefUsedAt: null }),
    },
  })
  return { generationId, marcada }
}

/** As referências do projeto, na ordem em que o rodízio vai usá-las. */
export async function listarReferenciasDeEstilo(projectId: number) {
  const refs = await db.generation.findMany({
    where: { projectId, styleRefAt: { not: null } },
    // Mesma ordem do rodízio — a lista mostra quem entra primeiro.
    orderBy: [{ styleRefUsedAt: { sort: 'asc', nulls: 'first' } }, { styleRefAt: 'asc' }],
    select: { id: true, resultUrl: true, styleRefAt: true, styleRefUsedAt: true, templateId: true },
  })
  return refs.map((r) => ({
    generationId: r.id,
    url: r.resultUrl,
    marcadaEm: r.styleRefAt,
    ultimoUso: r.styleRefUsedAt,
    proximaDaFila: false,
  })).map((r, i) => ({ ...r, proximaDaFila: i === 0 }))
}
