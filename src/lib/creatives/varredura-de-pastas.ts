/**
 * Varredura RECURSIVA de uma árvore de pastas do Drive, por NÍVEL e em LOTES
 * de pastas (`'a' in parents or 'b' in parents …`), com o caminho relativo de
 * cada arquivo (`07_ambiente/salao`) — o mesmo formato do `folder` do catálogo.
 *
 * Nasceu de um defeito medido em 13/09/2026: a tool `list-drive-images` do
 * servidor MCP local descia UM nível só (a raiz e as filhas diretas). No TERO
 * ela devolvia 116 fotos — só as que moram soltas numa pasta de primeiro nível
 * — contra 1.467 do catálogo, e um agente concluiu que a pasta configurada no
 * projeto estava errada; com esta varredura, 1.500. O conector remoto
 * (`listarImagensDoDrive`) descia, mas uma pasta por chamada e só até o 4º
 * nível: medido em 13/09/2026, o Seu Quinto perdia 35 fotos em pastas de 6º
 * nível, e cada listagem levava de 11 a 89s (com esta varredura, de 2,5 a 9s).
 *
 * Por nível e em lote pelo mesmo motivo de `listChildrenOfFolders`: uma
 * consulta por pasta custa centenas de chamadas num acervo grande. Aqui são
 * duas consultas por NÍVEL (arquivos e subpastas), divididas em lotes de
 * `PASTAS_POR_CONSULTA`.
 *
 * Módulo PURO: não importa googleapis nem Prisma. Quem chama injeta como
 * listar os filhos de um lote de pastas — o conector remoto usa
 * `listChildrenOfFolders`; o servidor local usa o próprio cliente do Drive,
 * porque devolve campos que o serviço não pede (miniatura, tamanho).
 */

/** Pastas por consulta — o mesmo 20 de `listChildrenOfFolders`. */
export const PASTAS_POR_CONSULTA = 20

/**
 * Até onde as LISTAGENS descem. Mais fundo que a catalogação
 * (`PROFUNDIDADE_MAXIMA` = 4, em `reconciliacao.ts`) de propósito: listar
 * custa duas consultas por nível, não por pasta, e mostrar a foto que mora
 * fundo demais para o catálogo é melhor que escondê-la. O que passar disto
 * sai com `parcial: true`.
 */
export const PROFUNDIDADE_DA_LISTAGEM = 10

/** Teto de pastas visitadas (a raiz conta). Acima dele, `parcial: true`. */
export const PASTAS_DA_LISTAGEM_MAX = 2000

export interface ItemDoDrive {
  id: string
  name: string
  /** É por ele que o arquivo ganha o caminho — a listagem PRECISA pedi-lo. */
  parents?: string[] | null
}

export interface OpcoesDaVarredura<A extends ItemDoDrive> {
  raiz: string
  /** Níveis abaixo da raiz (0 = só os arquivos da própria raiz). */
  profundidadeMaxima: number
  maxPastas: number
  /** Arquivos filhos de QUALQUER uma das pastas, com paginação completa. */
  listarArquivos: (pastas: string[]) => Promise<A[]>
  /** Subpastas filhas de QUALQUER uma das pastas, com paginação completa. */
  listarSubpastas: (pastas: string[]) => Promise<ItemDoDrive[]>
}

export interface ArquivoDaVarredura<A> {
  arquivo: A
  /** Caminho relativo à raiz (`07_ambiente/salao`); `''` na própria raiz. */
  pasta: string
  pastaId: string
}

export interface ResultadoDaVarredura<A> {
  arquivos: Array<ArquivoDaVarredura<A>>
  pastasVisitadas: number
  /** Sobrou pasta além da profundidade ou do teto: a lista não é o acervo inteiro. */
  parcial: boolean
}

/** O filtro `q` do Drive para os filhos de um lote de pastas, já dividido em lotes. */
export function consultasDeFilhos(pastas: string[], filtroDeTipo: string): string[] {
  const consultas: string[] = []
  for (let i = 0; i < pastas.length; i += PASTAS_POR_CONSULTA) {
    const pais = pastas
      .slice(i, i + PASTAS_POR_CONSULTA)
      .map((id) => `'${escaparNaConsulta(id)}' in parents`)
      .join(' or ')
    consultas.push(`(${pais}) and ${filtroDeTipo} and trashed = false`)
  }
  return consultas
}

export async function varrerArvoreDePastas<A extends ItemDoDrive>({
  raiz,
  profundidadeMaxima,
  maxPastas,
  listarArquivos,
  listarSubpastas,
}: OpcoesDaVarredura<A>): Promise<ResultadoDaVarredura<A>> {
  const arquivos = new Map<string, ArquivoDaVarredura<A>>()
  // Guarda contra ciclo e contra pasta com duas mães: cada pasta entra uma vez.
  const visitadas = new Set<string>([raiz])
  let parcial = false
  let nivel: Array<{ id: string; caminho: string }> = [{ id: raiz, caminho: '' }]

  for (let profundidade = 0; nivel.length > 0; profundidade++) {
    const caminhoPorId = new Map(nivel.map((p) => [p.id, p.caminho]))
    const ids = nivel.map((p) => p.id)

    for (const arquivo of await listarArquivos(ids)) {
      // Arquivo em duas pastas do mesmo lote volta duas vezes; fica o primeiro.
      if (arquivos.has(arquivo.id)) continue
      const pastaId = paiNoNivel(arquivo, caminhoPorId)
      arquivos.set(arquivo.id, { arquivo, pasta: caminhoPorId.get(pastaId)!, pastaId })
    }

    const proximo: Array<{ id: string; caminho: string }> = []
    // A consulta roda também no último nível: é ela que diz se sobrou pasta
    // além do limite. Sem isso a lista cortada teria cara de completa — que é
    // exatamente o defeito que este módulo veio consertar.
    for (const sub of await listarSubpastas(ids)) {
      if (visitadas.has(sub.id)) continue
      const pai = paiNoNivel(sub, caminhoPorId)
      if (profundidade >= profundidadeMaxima || visitadas.size >= maxPastas) {
        parcial = true
        continue
      }
      visitadas.add(sub.id)
      const base = caminhoPorId.get(pai)!
      proximo.push({ id: sub.id, caminho: base ? `${base}/${sub.name}` : sub.name })
    }
    nivel = proximo
  }

  return { arquivos: [...arquivos.values()], pastasVisitadas: visitadas.size, parcial }
}

function paiNoNivel(item: ItemDoDrive, caminhoPorId: Map<string, string>): string {
  const pai = (item.parents ?? []).find((p) => caminhoPorId.has(p))
  if (pai) return pai
  // Lote de uma pasta só: não há dúvida de quem é a mãe.
  if (caminhoPorId.size === 1) return [...caminhoPorId.keys()][0]
  // Falha alto: pôr o arquivo na pasta errada em silêncio mentiria sobre o acervo.
  throw new Error(
    `A listagem do Drive devolveu "${item.name}" sem uma pasta-mãe do lote consultado — ela precisa pedir o campo "parents".`,
  )
}

function escaparNaConsulta(valor: string): string {
  return valor.replace(/['\\]/g, (c) => `\\${c}`)
}
