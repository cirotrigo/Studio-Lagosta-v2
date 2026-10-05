/**
 * Devolve o BrandDNA de um projeto ao SNAPSHOT tirado no começo da prova
 * (PR7-F-01, nota da revisão final do Codex, 18/09/2026). A prova da voz
 * tira o DNA de cena (apaga e recria a linha) para exercitar `prepareCreative`
 * sem DNA: se a recriação falhar, o cleanup antigo só fazia `update` — que não
 * recupera linha ausente — e conferia dois campos. Aqui a linha ausente é
 * RECRIADA pelo snapshot inteiro (mesmo id), a presente volta campo a campo, e
 * a conferência cobre TODOS os campos. Sem Prisma: recebe o cliente.
 */

export type LinhaDoDna = Record<string, unknown> & { id: number; projectId: number }

export interface ClienteDoDna {
  brandDNA: {
    findUnique(args: { where: { projectId: number } }): Promise<LinhaDoDna | null>
    create(args: { data: LinhaDoDna }): Promise<unknown>
    update(args: { where: { projectId: number }; data: Record<string, unknown> }): Promise<unknown>
    deleteMany(args: { where: { projectId: number } }): Promise<unknown>
  }
}

/** `updatedAt` muda em toda escrita; o resto tem de voltar idêntico. */
const IGNORADOS = new Set(['updatedAt'])

export function camposDiferentes(esperado: LinhaDoDna | null, atual: LinhaDoDna | null): string[] {
  if (!esperado || !atual) return esperado === atual ? [] : ['(linha)']
  const chaves = new Set([...Object.keys(esperado), ...Object.keys(atual)])
  return [...chaves].filter((k) => !IGNORADOS.has(k) && JSON.stringify(esperado[k] ?? null) !== JSON.stringify(atual[k] ?? null)).sort()
}

/** Devolve a lista de problemas; vazia = o DNA está como no snapshot. */
export async function restaurarDna(cliente: ClienteDoDna, projectId: number, snapshot: LinhaDoDna | null): Promise<string[]> {
  const atual = await cliente.brandDNA.findUnique({ where: { projectId } })
  if (!snapshot) {
    if (atual) await cliente.brandDNA.deleteMany({ where: { projectId } })
  } else if (!atual) {
    await cliente.brandDNA.create({ data: snapshot })
  } else {
    const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, ...campos } = snapshot
    await cliente.brandDNA.update({ where: { projectId }, data: campos })
  }
  const depois = await cliente.brandDNA.findUnique({ where: { projectId } })
  const diferentes = camposDiferentes(snapshot, depois)
  return diferentes.length ? [`o DNA não voltou ao snapshot (${diferentes.join(', ')})`] : []
}
