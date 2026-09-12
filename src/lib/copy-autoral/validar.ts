/**
 * A validação do contrato da copy autoral, ALÉM do schema: o que o zod não vê.
 *
 *  - id duplicado (dois blocos com o mesmo id não se comparam);
 *  - ordem repetida ou com buraco declarada como problema (a ordem é o contrato
 *    de leitura, não a posição no array);
 *  - grupo de leitura com um bloco só (grupo é frase entre blocos);
 *  - `linhasNaVoz2` apontando para linha que não existe, ou em bloco que não
 *    é manchete;
 *  - revisão citando bloco inexistente.
 *
 * Devolve TODOS os problemas, nunca só o primeiro — quem escreve a copy corrige
 * de uma vez. Módulo PURO.
 */

import { blocoAutoralSchema, copyAutoralSchema, type BlocoAutoral, type CopyAutoral } from './contrato'

export interface ProblemaDaCopy {
  /** `schema` (forma), `id`, `ordem`, `grupo`, `estilo`, `revisao`. */
  tipo: 'schema' | 'id' | 'ordem' | 'grupo' | 'estilo' | 'revisao'
  bloco?: string
  mensagem: string
}

export interface ResultadoDaValidacao {
  copy: CopyAutoral | null
  problemas: ProblemaDaCopy[]
}

/** Valida forma E coerência. `copy` só volta quando não há problema nenhum. */
export function validarCopyAutoral(entrada: unknown): ResultadoDaValidacao {
  const lido = copyAutoralSchema.safeParse(entrada)
  if (!lido.success) {
    return {
      copy: null,
      problemas: lido.error.issues.map((i) => ({ tipo: 'schema', mensagem: `${i.path.join('.') || '(raiz)'}: ${i.message}` })),
    }
  }
  const copy = lido.data
  const problemas = problemasDeCoerencia(copy)
  return { copy: problemas.length === 0 ? copy : null, problemas }
}

/** Só a coerência (para quem já tem o objeto tipado). */
export function problemasDeCoerencia(copy: CopyAutoral): ProblemaDaCopy[] {
  const problemas: ProblemaDaCopy[] = []
  const ids = new Set<string>()
  const ordens = new Map<number, string>()
  const porGrupo = new Map<string, string[]>()

  for (const b of copy.blocos) {
    if (ids.has(b.id)) problemas.push({ tipo: 'id', bloco: b.id, mensagem: `id repetido: "${b.id}"` })
    ids.add(b.id)

    const dono = ordens.get(b.ordem)
    if (dono) problemas.push({ tipo: 'ordem', bloco: b.id, mensagem: `ordem ${b.ordem} repetida entre "${dono}" e "${b.id}"` })
    else ordens.set(b.ordem, b.id)

    if (b.grupoDeLeitura) porGrupo.set(b.grupoDeLeitura, [...(porGrupo.get(b.grupoDeLeitura) ?? []), b.id])

    const voz2 = b.estilo?.linhasNaVoz2
    if (voz2 && voz2.length > 0) {
      if (b.funcao !== 'headline') problemas.push({ tipo: 'estilo', bloco: b.id, mensagem: `segunda voz só existe na manchete (bloco "${b.id}" é ${b.funcao})` })
      for (const i of voz2) {
        if (i >= b.linhas.length) problemas.push({ tipo: 'estilo', bloco: b.id, mensagem: `linhasNaVoz2 aponta para a linha ${i}, e o bloco "${b.id}" tem ${b.linhas.length}` })
      }
    }
  }

  for (const [grupo, membros] of porGrupo) {
    if (membros.length < 2) problemas.push({ tipo: 'grupo', bloco: membros[0], mensagem: `grupo de leitura "${grupo}" tem um bloco só ("${membros[0]}") — grupo é frase entre blocos` })
  }

  const ordenadas = [...ordens.keys()].sort((a, b) => a - b)
  ordenadas.forEach((o, i) => {
    if (o !== i) {
      if (i === 0 || ordenadas[i - 1] !== o - 1) problemas.push({ tipo: 'ordem', mensagem: `a ordem de leitura tem buraco: esperava ${i}, veio ${o}` })
    }
  })

  // Um id citado no histórico existe HOJE ou foi REMOVIDO por alguma revisão
  // (a remoção fica registrada com o que o bloco dizia). Id sem lastro nenhum
  // continua sendo problema.
  const removidos = new Set(copy.revisoes.flatMap((r) => (r.removidos ?? []).map((x) => x.id)))
  copy.revisoes.forEach((r, i) => {
    for (const id of r.blocos) {
      if (!ids.has(id) && !removidos.has(id)) problemas.push({ tipo: 'revisao', bloco: id, mensagem: `revisão ${i} cita o bloco "${id}", que não existe na copy nem consta como removido` })
    }
    for (const id of Object.keys(r.campos ?? {})) {
      if (!r.blocos.includes(id)) problemas.push({ tipo: 'revisao', bloco: id, mensagem: `revisão ${i} detalha campos do bloco "${id}" sem listá-lo em blocos` })
    }
  })

  return problemas
}

/** Valida UM bloco solto (a camada extra da F3 chega assim). */
export function validarBlocoAutoral(entrada: unknown): { bloco: BlocoAutoral | null; problemas: ProblemaDaCopy[] } {
  const lido = blocoAutoralSchema.safeParse(entrada)
  if (!lido.success) return { bloco: null, problemas: lido.error.issues.map((i) => ({ tipo: 'schema', mensagem: `${i.path.join('.') || '(raiz)'}: ${i.message}` })) }
  return { bloco: lido.data, problemas: [] }
}

/** Os blocos na ORDEM DE LEITURA declarada (nunca a ordem do array). */
export function blocosEmOrdem(copy: CopyAutoral): BlocoAutoral[] {
  return [...copy.blocos].sort((a, b) => a.ordem - b.ordem)
}

/** Os grupos de leitura, cada um com os blocos em ordem; bloco sem grupo é um grupo de si mesmo. */
export function gruposDeLeitura(copy: CopyAutoral): Array<{ grupo: string; blocos: BlocoAutoral[]; declarado: boolean }> {
  // A chave interna do bloco SEM grupo usa um separador que o alfabeto do id
  // e do grupo não permitem ("\u0000"): um grupo declarado "_aviso" nunca
  // engole o bloco independente "aviso".
  const saida = new Map<string, { grupo: string; blocos: BlocoAutoral[]; declarado: boolean }>()
  for (const b of blocosEmOrdem(copy)) {
    const chave = b.grupoDeLeitura ? `g\u0000${b.grupoDeLeitura}` : `solo\u0000${b.id}`
    const atual = saida.get(chave) ?? { grupo: b.grupoDeLeitura ?? b.id, blocos: [], declarado: !!b.grupoDeLeitura }
    atual.blocos.push(b)
    saida.set(chave, atual)
  }
  return [...saida.values()]
}
