/**
 * ADAPTADORES DO LEGADO → contrato da copy autoral.
 *
 * Duas formas viajam hoje: `Bloco[]` por papel (`spec.blocos`, do compor-arte)
 * e `string[]` posicional (`ItemDePlano.copyProposta`, do criar-plano). Nenhuma
 * carrega id, grupo de leitura, ordem explícita, fatos ou autoria.
 *
 * A regra do adaptador é DECLARAR o que não sabe e NÃO INVENTAR:
 *  - a autoria vira `desconhecido` (nunca "claude" por palpite);
 *  - a ordem sai da posição no array, e isso fica registrado em `lacunas`;
 *  - grupo de leitura NÃO é deduzido (pré-título + manchete não viram frase por
 *    conta própria — é decisão do autor);
 *  - o `string[]` posicional recebe função `livre` para todos os blocos, porque
 *    o papel de cada um era atribuído pela posição DEPOIS (`copyParaBlocos`) e
 *    esse mapeamento é justamente a transformação silenciosa que o contrato
 *    existe para expor; quem souber o papel passa `funcoes` por posição;
 *  - as linhas são copiadas EXATAMENTE (caixa, acento, quebra, colchetes);
 *  - a saída é CONFERIDA pelo mesmo leitor que a copy gravada vai enfrentar
 *    (`validarCopyAutoral`). O que o legado aceitava e o contrato não comporta
 *    — linha acima de 300 caracteres (a API de itens aceita 2.000), mais de
 *    12 linhas num bloco, lista vazia, mais de 40 blocos — é INCOMPATIBILIDADE
 *    explícita, com o original preservado: `converter*` devolve
 *    `{ copy: null, problemas, original }` e `copyDe*` lança
 *    `CopyLegadaIncompativel`. Nunca se corta nem se redistribui texto para
 *    caber, e nunca se devolve contrato que o leitor rejeita (PR2-01 da
 *    revisão final do Codex, 13/09/2026).
 *  - o que o ADAPTADOR inventa (o id a partir do papel, as lacunas) cabe no
 *    contrato por construção: papel longo ou muitos papéis desconhecidos nunca
 *    viram recusa — a incompatibilidade é só do CONTEÚDO (texto, linhas,
 *    blocos) ou dos metadados passados (`em`/`superficie` vazios ou acima de
 *    40 são recusados, nunca omitidos em silêncio). Achado na auditoria de
 *    fronteiras do PR 2, 13/09/2026.
 *
 * Módulo PURO.
 */

import { VERSAO_DO_CONTRATO, copyAutoralSchema, idDeBlocoSchema, type BlocoAutoral, type CopyAutoral, type FuncaoDoBloco } from './contrato'
import { validarCopyAutoral, type ProblemaDaCopy } from './validar'

export interface BlocoLegado {
  papel: string
  linhas: string[]
}

/** O resultado de converter o legado: contrato válido, ou `copy: null` com os problemas e o original intacto. */
export interface ConversaoDoLegado<T> {
  copy: CopyAutoral | null
  problemas: ProblemaDaCopy[]
  original: T
}

/** O legado não tem representação válida no contrato. Nada foi cortado nem redistribuído; `original` é a entrada. */
export class CopyLegadaIncompativel extends Error {
  constructor(
    readonly problemas: ProblemaDaCopy[],
    readonly original: unknown,
  ) {
    super(`a copy do legado não cabe no contrato (nada foi cortado nem redistribuído): ${problemas.map((p) => p.mensagem).join('; ')}`)
    this.name = 'CopyLegadaIncompativel'
  }
}

/** Confere a copy montada contra o leitor; só a devolve quando ele a aceitaria. */
function conferida<T>(copy: CopyAutoral, original: T): ConversaoDoLegado<T> {
  const { problemas } = validarCopyAutoral(copy)
  return problemas.length === 0 ? { copy, problemas: [], original } : { copy: null, problemas, original }
}

function exigirCompativel<T>(conversao: ConversaoDoLegado<T>): CopyAutoral {
  if (!conversao.copy) throw new CopyLegadaIncompativel(conversao.problemas, conversao.original)
  return conversao.copy
}

const PAPEIS_LEGADOS: Record<string, FuncaoDoBloco> = {
  pre: 'pre',
  headline: 'headline',
  headline2: 'headline',
  apoio: 'apoio',
  cta: 'cta',
  servico: 'servico',
}

/** Tetos lidos do PRÓPRIO schema: o que o adaptador inventa não pode passar deles. */
const MAX_CARACTERES_DO_ID = idDeBlocoSchema.maxLength ?? 60
const MAX_LACUNAS = copyAutoralSchema.shape.lacunas.unwrap()._def.maxLength?.value ?? 20
/** Quanto do papel desconhecido a lacuna cita (o resto vira "…", marcado — o papel não é conteúdo do contrato). */
const PAPEL_CITADO_NA_LACUNA = 60

/** O id nasce do papel, com espaço para o sufixo de desempate ("-40"): cabe nos 60 do schema por construção. */
function idUnico(base: string, usados: Set<string>): string {
  const limpo = (base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'bloco').slice(0, MAX_CARACTERES_DO_ID - 4)
  let id = limpo
  let n = 2
  while (usados.has(id)) id = `${limpo}-${n++}`
  usados.add(id)
  return id
}

/**
 * Uma lacuna por bloco de papel desconhecido enquanto couber no teto de
 * lacunas; o que passar vira UMA lacuna de resumo. O papel é citado até
 * `PAPEL_CITADO_NA_LACUNA` caracteres, com "…" marcando o corte.
 */
function lacunasDePapelDesconhecido(desconhecidos: Array<{ i: number; papel: string }>, vagas: number): string[] {
  const citar = (papel: string) => (papel.length > PAPEL_CITADO_NA_LACUNA ? `${papel.slice(0, PAPEL_CITADO_NA_LACUNA)}…` : papel)
  const uma = ({ i, papel }: { i: number; papel: string }) => `bloco ${i} com papel desconhecido "${citar(papel)}" tratado como livre`
  if (desconhecidos.length <= vagas) return desconhecidos.map(uma)
  const individuais = desconhecidos.slice(0, Math.max(0, vagas - 1)).map(uma)
  const resto = desconhecidos.length - individuais.length
  return [...individuais, `mais ${resto} bloco(s) com papel desconhecido tratado(s) como livre`]
}

/**
 * `spec.blocos` (papel + linhas) → contrato. O id nasce do papel (`headline`,
 * `servico-2`…); `headline2` vira uma manchete com as linhas dela na voz 2, se
 * o chamador pedir por `fundirHeadline2` (o padrão mantém como bloco próprio
 * de função `headline`, e a lacuna diz isso).
 */
export function converterBlocosLegados(
  blocos: BlocoLegado[],
  opcoes: { em?: string; superficie?: string } = {},
): ConversaoDoLegado<BlocoLegado[]> {
  const usados = new Set<string>()
  const lacunas = [
    'autoria desconhecida: a copy veio de blocos por papel (spec) sem registro de quem escreveu',
    'ordem de leitura inferida pela posição no array',
    'sem grupos de leitura: o legado não declara que blocos formam uma frase',
  ]
  const desconhecidos: Array<{ i: number; papel: string }> = []
  const saida: BlocoAutoral[] = blocos.map((b, i) => {
    const funcao = PAPEIS_LEGADOS[b.papel]
    if (!funcao) desconhecidos.push({ i, papel: b.papel })
    return {
      id: idUnico(b.papel, usados),
      funcao: funcao ?? 'livre',
      ordem: i,
      linhas: [...b.linhas],
      ...(b.papel === 'headline2' ? { estilo: { herdaDe: 'headline' as const } } : {}),
    }
  })
  const temHeadline2 = blocos.some((b) => b.papel === 'headline2')
  lacunas.push(...lacunasDePapelDesconhecido(desconhecidos, MAX_LACUNAS - lacunas.length - (temHeadline2 ? 1 : 0)))
  if (temHeadline2) lacunas.push('headline2 veio como bloco próprio: a segunda voz não foi declarada por linha')
  return conferida(
    {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'desconhecido', ...(opcoes.em !== undefined ? { em: opcoes.em } : {}), ...(opcoes.superficie !== undefined ? { superficie: opcoes.superficie } : {}) },
      blocos: saida,
      revisoes: [],
      lacunas,
    },
    blocos.map((b) => ({ ...b, linhas: [...b.linhas] })),
  )
}

/** Como `converterBlocosLegados`, mas LANÇA `CopyLegadaIncompativel` quando não há contrato válido. */
export function copyDeBlocosLegados(blocos: BlocoLegado[], opcoes: { em?: string; superficie?: string } = {}): CopyAutoral {
  return exigirCompativel(converterBlocosLegados(blocos, opcoes))
}

/**
 * `copyProposta: string[]` (posicional) → contrato. Um bloco por item; `\n`
 * dentro do item vira quebra de linha (o legado colapsava). Sem `funcoes`,
 * todos saem `livre` — atribuir papel pela posição seria repetir o
 * `copyParaBlocos`, que é a perda posicional que o contrato expõe.
 */
export function converterListaLegada(
  itens: string[],
  opcoes: { funcoes?: Array<FuncaoDoBloco | null | undefined>; em?: string; superficie?: string } = {},
): ConversaoDoLegado<string[]> {
  const usados = new Set<string>()
  const lacunas = [
    'autoria desconhecida: a copy veio como lista posicional (copyProposta) sem registro de quem escreveu',
    'ordem de leitura inferida pela posição na lista',
    'sem grupos de leitura: o legado não declara que blocos formam uma frase',
  ]
  const semFuncao = itens.some((_, i) => !opcoes.funcoes?.[i])
  if (semFuncao) lacunas.push('função dos blocos não informada: ficaram "livre" (o papel por posição era a transformação silenciosa)')
  const blocos: BlocoAutoral[] = itens.map((texto, i) => {
    const funcao = opcoes.funcoes?.[i] ?? 'livre'
    return {
      id: idUnico(funcao === 'livre' ? `texto-${i + 1}` : funcao, usados),
      funcao,
      ordem: i,
      linhas: texto.split('\n'),
    }
  })
  return conferida(
    {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'desconhecido', ...(opcoes.em !== undefined ? { em: opcoes.em } : {}), ...(opcoes.superficie !== undefined ? { superficie: opcoes.superficie } : {}) },
      blocos,
      revisoes: [],
      lacunas,
    },
    [...itens],
  )
}

/** Como `converterListaLegada`, mas LANÇA `CopyLegadaIncompativel` quando não há contrato válido. */
export function copyDeListaLegada(
  itens: string[],
  opcoes: { funcoes?: Array<FuncaoDoBloco | null | undefined>; em?: string; superficie?: string } = {},
): CopyAutoral {
  return exigirCompativel(converterListaLegada(itens, opcoes))
}

/**
 * Contrato → `Bloco[]` por papel, para o compositor de HOJE (PR 4 passa a
 * consumir o contrato direto). É a única conversão de saída, e ela NÃO
 * transforma texto: bloco `livre` não tem papel e é devolvido em `semPapel`
 * em vez de sumir — quem chama decide (recusa, camada extra na F3, aviso).
 */
export function blocosParaOCompositor(copy: CopyAutoral): { blocos: BlocoLegado[]; semPapel: BlocoAutoral[] } {
  const blocos: BlocoLegado[] = []
  const semPapel: BlocoAutoral[] = []
  for (const b of [...copy.blocos].sort((a, z) => a.ordem - z.ordem)) {
    if (b.funcao === 'livre') {
      semPapel.push(b)
      continue
    }
    blocos.push({ papel: b.funcao, linhas: [...b.linhas] })
  }
  return { blocos, semPapel }
}
