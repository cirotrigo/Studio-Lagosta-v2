/**
 * A validação do contrato da copy autoral, ALÉM do schema: o que o zod não vê.
 *
 *  - id duplicado (dois blocos com o mesmo id não se comparam);
 *  - ordem repetida ou com buraco declarada como problema (a ordem é o contrato
 *    de leitura, não a posição no array);
 *  - grupo de leitura com um bloco só (grupo é frase entre blocos);
 *  - `linhasNaVoz2` apontando para linha que não existe, ou em bloco que não
 *    é manchete;
 *  - revisão citando bloco inexistente, detalhando campos ou registrando
 *    remoção de bloco que ela mesma não lista.
 *
 * As regras se dividem em LOCAIS (dependem só do elemento: um bloco, uma
 * revisão) e de CONJUNTO (dependem dos outros: id repetido, ordem, grupo,
 * revisão citando bloco que não existe). As locais moram UMA vez
 * (`problemasLocaisDoBloco`, `problemasLocaisDaRevisao`) e são as MESMAS na
 * validação do elemento solto e na da copy inteira — um validador parcial que
 * aprova o que a copy recusa por regra local é o defeito PR2-04 da revisão
 * final do Codex (13/09/2026). Regra local nova entra nessas funções, nunca só
 * em `problemasDeCoerencia`.
 *
 * Devolve TODOS os problemas, nunca só o primeiro — quem escreve a copy corrige
 * de uma vez. Módulo PURO.
 */

import type { ZodIssue } from 'zod'
import { blocoAutoralSchema, copyAutoralSchema, revisaoDaCopySchema, type BlocoAutoral, type CopyAutoral, type RevisaoDaCopy } from './contrato'

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

function problemasDoSchema(issues: ZodIssue[]): ProblemaDaCopy[] {
  return issues.map((i) => ({ tipo: 'schema', mensagem: `${i.path.join('.') || '(raiz)'}: ${i.message}` }))
}

/** Valida forma E coerência. `copy` só volta quando não há problema nenhum. */
export function validarCopyAutoral(entrada: unknown): ResultadoDaValidacao {
  const lido = copyAutoralSchema.safeParse(entrada)
  if (!lido.success) return { copy: null, problemas: problemasDoSchema(lido.error.issues) }
  const copy = lido.data
  const problemas = problemasDeCoerencia(copy)
  return { copy: problemas.length === 0 ? copy : null, problemas }
}

/**
 * As regras LOCAIS de um bloco (não dependem dos outros blocos): a segunda voz
 * só existe na manchete e só aponta para linha que o bloco tem.
 */
export function problemasLocaisDoBloco(b: BlocoAutoral): ProblemaDaCopy[] {
  const problemas: ProblemaDaCopy[] = []
  const voz2 = b.estilo?.linhasNaVoz2
  if (voz2 && voz2.length > 0) {
    if (b.funcao !== 'headline') problemas.push({ tipo: 'estilo', bloco: b.id, mensagem: `segunda voz só existe na manchete (bloco "${b.id}" é ${b.funcao})` })
    for (const i of voz2) {
      if (i >= b.linhas.length) problemas.push({ tipo: 'estilo', bloco: b.id, mensagem: `linhasNaVoz2 aponta para a linha ${i}, e o bloco "${b.id}" tem ${b.linhas.length}` })
    }
    // As duas vozes são duas CAMADAS empilhadas: a voz 2 só pode ser o fim
    // contíguo da manchete. Índice no meio não tem como ser desenhado, e
    // aceitar para depois ignorar seria transformação silenciosa. Regra LOCAL
    // (só depende do bloco): mora aqui, para o validador do bloco solto e o da
    // copy inteira concordarem (PR2-04).
    const ordenados = [...new Set(voz2)].sort((a, b) => a - b)
    const contiguoAteOFim = ordenados.every((v, k) => v === ordenados[0] + k) && ordenados[0] + ordenados.length === b.linhas.length
    if (ordenados.every((i) => i < b.linhas.length) && !contiguoAteOFim) {
      problemas.push({ tipo: 'estilo', bloco: b.id, mensagem: `linhasNaVoz2 precisa ser as ÚLTIMAS linhas da manchete, contíguas até o fim (bloco "${b.id}": veio ${ordenados.join(', ')} de ${b.linhas.length} linhas)` })
    }
  }
  return problemas
}

/**
 * As regras LOCAIS de uma revisão (não dependem da copy): o que ela detalha em
 * `campos` e o que registra em `removidos` precisa estar listado em `blocos`.
 * `rotulo` só muda a mensagem ("revisão 3" na copy, "a revisão" solta).
 */
export function problemasLocaisDaRevisao(r: RevisaoDaCopy, rotulo = 'a revisão'): ProblemaDaCopy[] {
  const problemas: ProblemaDaCopy[] = []
  for (const id of Object.keys(r.campos ?? {})) {
    if (!r.blocos.includes(id)) problemas.push({ tipo: 'revisao', bloco: id, mensagem: `${rotulo} detalha campos do bloco "${id}" sem listá-lo em blocos` })
  }
  // Remoção é mudança do bloco: quem a registra lista o id em `blocos`,
  // senão `autorDoBloco` (que anda pelas revisões por `blocos`) devolveria o
  // autor da edição anterior (R02 da revisão do Codex, 12/09/2026).
  for (const x of r.removidos ?? []) {
    if (!r.blocos.includes(x.id)) problemas.push({ tipo: 'revisao', bloco: x.id, mensagem: `${rotulo} registra a remoção do bloco "${x.id}" sem listá-lo em blocos` })
  }
  return problemas
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

    problemas.push(...problemasLocaisDoBloco(b))
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
  // continua sendo problema — regra de CONJUNTO.
  const removidos = new Set(copy.revisoes.flatMap((r) => (r.removidos ?? []).map((x) => x.id)))
  copy.revisoes.forEach((r, i) => {
    for (const id of r.blocos) {
      if (!ids.has(id) && !removidos.has(id)) problemas.push({ tipo: 'revisao', bloco: id, mensagem: `revisão ${i} cita o bloco "${id}", que não existe na copy nem consta como removido` })
    }
    problemas.push(...problemasLocaisDaRevisao(r, `revisão ${i}`))
  })

  return problemas
}

/**
 * Valida UM bloco solto (a camada extra da F3 chega assim): forma e as regras
 * LOCAIS — as mesmas que a copy aplica a ele. `bloco` só volta sem problema.
 */
export function validarBlocoAutoral(entrada: unknown): { bloco: BlocoAutoral | null; problemas: ProblemaDaCopy[] } {
  const lido = blocoAutoralSchema.safeParse(entrada)
  if (!lido.success) return { bloco: null, problemas: problemasDoSchema(lido.error.issues) }
  const problemas = problemasLocaisDoBloco(lido.data)
  return { bloco: problemas.length === 0 ? lido.data : null, problemas }
}

/** Valida UMA revisão solta: forma e as regras LOCAIS — as mesmas que a copy aplica a ela. */
export function validarRevisaoDaCopy(entrada: unknown): { revisao: RevisaoDaCopy | null; problemas: ProblemaDaCopy[] } {
  const lido = revisaoDaCopySchema.safeParse(entrada)
  if (!lido.success) return { revisao: null, problemas: problemasDoSchema(lido.error.issues) }
  const problemas = problemasLocaisDaRevisao(lido.data)
  return { revisao: problemas.length === 0 ? lido.data : null, problemas }
}

/** Os blocos na ORDEM DE LEITURA declarada (nunca a ordem do array). */
export function blocosEmOrdem(copy: CopyAutoral): BlocoAutoral[] {
  return [...copy.blocos].sort((a, b) => a.ordem - b.ordem)
}

/** Os grupos de leitura, cada um com os blocos em ordem; bloco sem grupo é um grupo de si mesmo. */
export function gruposDeLeitura(copy: CopyAutoral): Array<{ grupo: string; blocos: BlocoAutoral[]; declarado: boolean }> {
  // Os prefixos distintos das chaves internas ("g" para grupo declarado,
  // "solo" para bloco sem grupo, separados por "\u0000", que o alfabeto do id
  // não permite) isolam os dois: um grupo declarado "_aviso" ou "aviso" nunca
  // engole o bloco independente "aviso". O NOME do grupo é livre (1–60).
  const saida = new Map<string, { grupo: string; blocos: BlocoAutoral[]; declarado: boolean }>()
  for (const b of blocosEmOrdem(copy)) {
    const chave = b.grupoDeLeitura ? `g\u0000${b.grupoDeLeitura}` : `solo\u0000${b.id}`
    const atual = saida.get(chave) ?? { grupo: b.grupoDeLeitura ?? b.id, blocos: [], declarado: !!b.grupoDeLeitura }
    atual.blocos.push(b)
    saida.set(chave, atual)
  }
  return [...saida.values()]
}
