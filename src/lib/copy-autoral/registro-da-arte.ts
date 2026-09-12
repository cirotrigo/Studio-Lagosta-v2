/**
 * O registro da copy de uma ARTE (`Generation.fieldValues.copyAutoral =
 * { original, efetiva, comparavel, lacunas? }`) acompanha o PNG — módulo PURO.
 *
 * PR3-F02 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): a arte
 * re-renderizada (a página ajustada à mão, a recuperação forçada) trocava o
 * PNG e deixava `efetiva` da versão anterior; a recomposição que não
 * conseguia ler o contrato fazia o mesmo. `ver-geracao` apresentava o texto
 * antigo como `desenhada`, com `comparavel: true`, para a imagem nova. Quem
 * troca o PNG de uma arte que carrega o registro grava o registro de novo:
 * a efetiva medida nas camadas desenhadas, ou — quando não dá para medir —
 * `efetiva: null`, `comparavel: false` e o motivo em `lacunas`. Nunca a
 * efetiva antiga como se fosse a atual. O `original` fica.
 */

/**
 * O registro da copy autoral numa ARTE SEM CAMADAS — a via de IA e a melhoria
 * (F1 de "Marca simples, copy melhor", PR 5, 12/09/2026). Módulo PURO, sem
 * Prisma.
 *
 * Na via de modelo e no compositor a copy "efetiva" sai das CAMADAS gravadas.
 * Na IA não há camada: o que se sabe é o texto ENVIADO ao modelo de imagem e
 * o que a visão LEU de volta. O registro declara isso em vez de fingir uma
 * efetiva: `original` (o contrato), `enviada` (os blocos como foram ao prompt,
 * já na caixa da marca), `conferencia` (a transcrição por visão, o que faltou,
 * se passou) e `lacunas`. `comparavel` continua sendo autoria conhecida — quem
 * lê (`ver-geracao`) compara `original` com `conferencia.lida` sabendo que é
 * transcrição, não camada.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import type { CopyAutoral } from './contrato'
import { tentarCopyEfetivaDasCamadas } from './efetiva'
import { lerCopyAutoral } from './serializar'
import { normalizeForComparison } from '@/lib/ai/text-comparison'
import { aplicarRevisao, blocosEmOrdem, copyComparavel, validarCopyAutoral, type Autor, type BlocoAutoral } from '.'

export interface RegistroDaCopyDaArte {
  original: CopyAutoral
  efetiva: CopyAutoral | null
  comparavel: boolean
  lacunas?: string[]
}

function registroAnterior(anterior: unknown): Record<string, unknown> | null {
  return anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? (anterior as Record<string, unknown>) : null
}

/** O registro de quem NÃO conseguiu medir a copy desta imagem; `null` quando a arte não carregava registro nenhum. */
export function copyDaArteIndisponivel(anterior: unknown, motivo: string): RegistroDaCopyDaArte | null {
  const ant = registroAnterior(anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return null
  return { original, efetiva: null, comparavel: false, lacunas: [`a copy desenhada nesta imagem não pôde ser medida: ${motivo}`] }
}

/**
 * O registro para o PNG que desenha `camadas`. A base da leitura é o contrato
 * da página (o que ela mostra, com as revisões da equipe); sem ele, a efetiva
 * anterior da arte. `null` quando a arte não carregava registro (não se inventa um).
 */
export function registroDaCopyDaArte(args: { anterior: unknown; contratoDaPagina: unknown; camadas: unknown; superficie: string }): { registro: RegistroDaCopyDaArte | null; aviso: string | null } {
  const ant = registroAnterior(args.anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return { registro: null, aviso: null }
  const indisponivel = (motivo: string) => ({ registro: copyDaArteIndisponivel(args.anterior, motivo), aviso: `A copy desenhada na imagem nova não pôde ser medida (${motivo}); a arte ficou marcada como não comparável.` })
  const base = (args.contratoDaPagina == null ? null : lerCopyAutoral(args.contratoDaPagina).copy) ?? lerCopyAutoral(ant!.efetiva).copy ?? original
  const lidas = lerCamadas(args.camadas)
  if (!lidas.legivel) return indisponivel('camadas da página ilegíveis')
  const leitura = tentarCopyEfetivaDasCamadas(base, lidas.camadas as unknown as Layer[], { superficie: args.superficie })
  if (leitura.ok === false) return indisponivel(leitura.aviso)
  const { efetiva, lacunas } = leitura.leitura
  return { registro: { original, efetiva, comparavel: original.origem.autor !== 'desconhecido', ...(lacunas.length ? { lacunas } : {}) }, aviso: null }
}

/** A lacuna que toda arte sem camadas carrega — dita, nunca escondida. */
export const LACUNA_SEM_CAMADAS =
  'a arte não tem camadas: o texto desenhado só é conhecido pela transcrição por visão (conferencia.lida)'

export interface ConferenciaDaCopy {
  /** O que a visão leu na arte pronta (transcrição crua, por bloco). */
  lida: string[]
  /** Blocos esperados que a visão não encontrou (normalizados). */
  faltando: string[]
  /** `null` = a conferência não rodou (visão indisponível, peça sem texto). */
  passou: boolean | null
  /** De onde veio a régua da conferência: `copy` (o texto enviado), `visao`, `linhagem`, `nenhuma`. */
  regua: string
  /** Blocos que só casaram com tolerância de UMA edição por palavra. */
  grafiaDivergente?: Array<{ esperado: string; lido: string }>
}

export interface RegistroDaCopyNaArte {
  original: CopyAutoral
  /** Os blocos como foram ENVIADOS ao modelo de imagem (caixa da marca aplicada, colchetes fora). */
  enviada: string[]
  comparavel: boolean
  lacunas: string[]
  conferencia?: ConferenciaDaCopy
}

/** Os blocos com texto, em ordem, cada um com as linhas do autor unidas por "\n" — o que a via de IA envia. */
export function textoEnviadoDoContrato(copy: CopyAutoral): string[] {
  return blocosEmOrdem(copy)
    .filter((b) => b.linhas.some((l) => l.trim().length > 0))
    .map((b) => b.linhas.join('\n'))
}

export function registroParaIA(original: CopyAutoral, enviada: string[], lacunas: string[] = []): RegistroDaCopyNaArte {
  return { original, enviada, comparavel: copyComparavel(original), lacunas: [LACUNA_SEM_CAMADAS, ...lacunas] }
}

export function comConferencia(registro: RegistroDaCopyNaArte, conferencia: ConferenciaDaCopy): RegistroDaCopyNaArte {
  return { ...registro, conferencia }
}

/** O resultado da conferência por visão no formato do registro; `null` = ela não rodou. */
export function conferenciaDoCheck(
  check: { passed: boolean; missing: string[]; extracted: string[]; grafiaDivergente?: Array<{ esperado: string; lido: string }> } | null,
  regua: string,
): ConferenciaDaCopy {
  if (!check) return { lida: [], faltando: [], passou: null, regua }
  return {
    lida: check.extracted.slice(0, 40),
    faltando: check.missing,
    passou: check.passed,
    regua,
    ...(check.grafiaDivergente && check.grafiaDivergente.length > 0 ? { grafiaDivergente: check.grafiaDivergente } : {}),
  }
}

/**
 * A IDENTIDADE de um contrato para a chave de deduplicação da geração: quem
 * escreveu, e cada bloco com id, função, ordem, linhas EXATAS, grupo de leitura
 * e a voz 2 declarada. Dois pedidos com os mesmos TEXTOS e contratos
 * diferentes (ids, papéis ou autoria) são peças diferentes; pedido SEM contrato
 * devolve `null`, e quem monta a chave o distingue do pedido com contrato —
 * sem isso o pedido legado e o pedido com contrato colidiam na janela e o
 * segundo saía `reused` sem o contrato gravado (PR5-01 da revisão do Codex,
 * 12/09/2026).
 */
export function identidadeDoContrato(copy: CopyAutoral | null | undefined): string | null {
  if (!copy) return null
  return JSON.stringify([
    copy.origem.autor,
    blocosEmOrdem(copy).map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.grupoDeLeitura ?? null, b.estilo?.linhasNaVoz2 ?? null]),
  ])
}

export type ResultadoDaRevisaoPosicional = { copy: CopyAutoral; mudou: boolean } | { descartado: string }

/**
 * A revisão do REFINO: o planejador recebeu a copy `antes` (os textos como
 * foram ao prompt — na ORDEM DOS SLOTS da arte, já na caixa da origem) e
 * devolveu `depois`, bloco a bloco na mesma ordem. O que decide se um bloco
 * MUDOU é a comparação EXATA entre entrada e saída do planejador — acento e
 * quebra de linha contam (PR5-04: a tolerância da régua por visão apagava a
 * correção "familia → família" do histórico). O bloco do CONTRATO que recebe
 * a mudança é LOCALIZADO pelo texto de `antes` (normalizado só para achar —
 * a caixa da origem é transformação do sistema), nunca pela posição: a ordem
 * dos slots não é a ordem do contrato (PR5-03: a headline trocada caía no
 * pré-título). Bloco sem correspondência única é descartado com o motivo, e
 * os blocos que não mudaram mantêm as linhas do autor.
 */
export function revisaoDoRefino(
  contrato: CopyAutoral,
  antes: string[],
  depois: string[],
  quem: { autor: Autor; superficie: string; em?: string },
  motivo: string,
): ResultadoDaRevisaoPosicional {
  if (antes.length !== depois.length) {
    return { descartado: `o planejador devolveu ${depois.length} bloco(s) para ${antes.length} enviado(s) e não há como saber qual bloco é qual` }
  }
  const mudancas = antes.map((a, i) => ({ i, antes: a, depois: depois[i] })).filter((m) => m.antes !== m.depois)
  if (mudancas.length === 0) return { copy: contrato, mudou: false }
  const emOrdem = blocosEmOrdem(contrato)
  const comTexto = emOrdem.filter((b) => b.linhas.some((l) => l.trim().length > 0))
  const chave = (t: string) => normalizeForComparison(t.replace(/\[|\]/g, ''))
  const novos = new Map<string, string[]>()
  for (const m of mudancas) {
    const candidatos = comTexto.filter((b) => !novos.has(b.id) && chave(b.linhas.join('\n')) === chave(m.antes))
    if (candidatos.length !== 1) {
      return {
        descartado:
          candidatos.length === 0
            ? `o texto enviado na posição ${m.i + 1} ("${m.antes.slice(0, 40)}") não corresponde a nenhum bloco do contrato`
            : `o texto enviado na posição ${m.i + 1} ("${m.antes.slice(0, 40)}") corresponde a ${candidatos.length} blocos do contrato`,
      }
    }
    novos.set(candidatos[0].id, m.depois.split('\n'))
  }
  const blocos: BlocoAutoral[] = emOrdem.map((b) => {
    const linhas = novos.get(b.id)
    if (!linhas) return b
    const { estilo: estiloAntigo, ...semEstilo } = b
    const voz2 = estiloAntigo?.linhasNaVoz2?.filter((i) => i < linhas.length) ?? []
    const { linhasNaVoz2: _fora, ...restoDoEstilo } = estiloAntigo ?? {}
    const estilo = { ...restoDoEstilo, ...(voz2.length > 0 ? { linhasNaVoz2: voz2 } : {}) }
    return { ...semEstilo, linhas, ...(Object.keys(estilo).length > 0 ? { estilo } : {}) }
  })
  const { copy } = aplicarRevisao(contrato, blocos, { autor: quem.autor, motivo, superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  const conferida = validarCopyAutoral(copy)
  if (!conferida.copy) return { descartado: `a revisão do refino deixou o contrato inválido (${conferida.problemas.map((p) => p.mensagem).join('; ')})` }
  return { copy: conferida.copy, mudou: conferida.copy.revisoes.length !== contrato.revisoes.length }
}

/**
 * Uma lista POSICIONAL de textos aplicada sobre um contrato: vira REVISÃO
 * (de `quem`) quando casa posição a posição com os blocos que têm texto; a
 * segunda voz por índice acompanha a linha que sumiu. Quando não casa (número
 * de blocos diferente, ou o contrato ficaria inválido), devolve `descartado`
 * com o motivo — manter um contrato que não descreve mais o texto seria
 * mentir para a métrica. É a mesma regra do item de plano (PR 3) e do pedido
 * de refino da melhoria (PR 5): "troque a frase X por Y" é revisão EXPLÍCITA
 * do autor que pediu, nunca mudança silenciosa.
 */
export function revisaoPosicional(
  contrato: CopyAutoral,
  lista: string[],
  quem: { autor: Autor; superficie: string; em?: string },
  motivo: string,
): ResultadoDaRevisaoPosicional {
  const emOrdem = blocosEmOrdem(contrato)
  const comTexto = emOrdem.filter((b) => b.linhas.length > 0)
  if (comTexto.length !== lista.length) {
    return { descartado: `a edição posicional mudou o número de blocos com texto (${comTexto.length} → ${lista.length}) e não há como saber qual bloco é qual` }
  }
  const novos: BlocoAutoral[] = emOrdem.map((b) => {
    if (b.linhas.length === 0) return b
    const linhas = lista[comTexto.indexOf(b)].split('\n')
    const { estilo: estiloAntigo, ...semEstilo } = b
    const voz2 = estiloAntigo?.linhasNaVoz2?.filter((i) => i < linhas.length) ?? []
    const { linhasNaVoz2: _fora, ...restoDoEstilo } = estiloAntigo ?? {}
    const estilo = { ...restoDoEstilo, ...(voz2.length > 0 ? { linhasNaVoz2: voz2 } : {}) }
    return { ...semEstilo, linhas, ...(Object.keys(estilo).length > 0 ? { estilo } : {}) }
  })
  const { copy } = aplicarRevisao(contrato, novos, { autor: quem.autor, motivo, superficie: quem.superficie, ...(quem.em ? { em: quem.em } : {}) })
  const conferida = validarCopyAutoral(copy)
  if (!conferida.copy) return { descartado: `a edição posicional deixou o contrato inválido (${conferida.problemas.map((p) => p.mensagem).join('; ')})` }
  return { copy: conferida.copy, mudou: conferida.copy.revisoes.length !== contrato.revisoes.length }
}
