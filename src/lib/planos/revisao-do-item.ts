/**
 * A revisão de CONTEÚDO de um item de plano — o token `itemRevisao` que o
 * `ver-plano` devolve e o `compor-leva` manda de volta (pré-revisão C11-1a…1b
 * do PR 11 de "Marca simples, copy melhor", 12/09/2026). Módulo PURO.
 *
 * É o mesmo valor que o caminho do plano confere sob a trava do item
 * (`enfileirarComposicaoDoPlanoEm`) e grava no job e na Generation
 * (`planoRevisao`): a chamada declara "montei esta peça a partir desta
 * revisão", e a tabela só produz com lote quando ela é a revisão do item agora.
 *
 * Entram SÓ os campos que viram a spec do compositor (`montarSpecDoItem`, e o
 * que o chat monta a partir do `ver-plano`): a copy (a lista e o contrato, sem
 * a autoria e o histórico de revisões), a foto e as candidatas, o formato, o
 * horário e o tema. Ficam de fora a legenda, a via, a direção, o ajuste da
 * foto, as referências, o cliente citado, o escopo, a campanha, o status, os
 * vínculos e o `updatedAt`: mudar a legenda não muda a peça, e uma revisão que
 * mudasse por eles recusaria a retomada de uma peça que continua certa
 * (C11-1b). `updatedAt` ainda muda nas transições (`na-fila`, `erro`).
 *
 * Mudou o conjunto de campos? Suba a versão: revisão de outra versão nunca é
 * igual, e quem chama relê o `ver-plano`.
 */
import { createHash } from 'node:crypto'
import stableStringify from 'json-stable-stringify'

export const VERSAO_DA_REVISAO_DO_ITEM = 'rev1'

/** Os campos do item que entram na revisão — aceita a linha crua do banco. */
export interface ConteudoDaRevisaoDoItem {
  copyProposta?: unknown
  copyAutoral?: unknown
  fotoDriveId?: unknown
  fotoUrl?: unknown
  fotoCandidatas?: unknown
  formato?: unknown
  quando?: unknown
  tema?: unknown
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** `rev1:<32 hex>` — ausente e nulo são o mesmo valor; a ordem das chaves não é diferença. */
export function revisaoDoItem(item: ConteudoDaRevisaoDoItem): string {
  const contrato = objeto(item.copyAutoral)
  // O contrato sem `origem` e `revisoes`: quem escreveu e quando não é conteúdo.
  const copyAutoral = contrato ? Object.fromEntries(Object.entries(contrato).filter(([chave]) => chave !== 'origem' && chave !== 'revisoes')) : null
  const conteudo = {
    copy: item.copyProposta ?? null,
    copyAutoral,
    foto: [item.fotoDriveId ?? null, item.fotoUrl ?? null],
    candidatas: item.fotoCandidatas ?? null,
    formato: item.formato ?? null,
    quando: item.quando instanceof Date ? item.quando.toISOString() : (item.quando ?? null),
    tema: item.tema ?? null,
  }
  const hash = createHash('sha256').update(stableStringify(conteudo) ?? '').digest('hex')
  return `${VERSAO_DA_REVISAO_DO_ITEM}:${hash.slice(0, 32)}`
}

// ── A revisão LEGADA (PR11-F01) ─────────────────────────────────────────────

/**
 * A revisão que a main ANTERIOR ao PR 11 gravava — e que a produção já tem.
 * Um único escritor em todo o histórico da main
 * (`src/lib/planos/enfileirar-composicao.ts`, linhas 32–38 e 49 em 6405bfd5),
 * e um único destino: `GenerationJob.payload.planoRevisao` do job COMPOR. Nunca
 * `Generation.fieldValues`, e `ItemDeLote` não existia. O formato é a string
 * do `json-stable-stringify` (chaves ordenadas, Date via `toJSON` em ISO,
 * `undefined` omitido, `null` mantido) destes 15 campos do item. A versão de
 * 14, sem `candidatas`, é a do commit 6892e362; os dois entraram na main no
 * MESMO merge (#115, 09/09/2026), então a produção só rodou a de 15.
 *
 * Comparar essa string com `rev1:<hash>` dava SEMPRE "diferente": o mesmo
 * pedido de um item intocado virava `superada` (peça viva ou pronta) ou
 * `revisado` (job terminal com o item em voo) depois do deploy.
 */
const CHAVES_DA_REVISAO_LEGADA = ['ajuste', 'campanha', 'candidatas', 'cliente', 'copy', 'direcao', 'escopo', 'foto', 'formato', 'legenda', 'modelo', 'quando', 'referencias', 'tema', 'via']
const CONJUNTOS_LEGADOS = [CHAVES_DA_REVISAO_LEGADA, CHAVES_DA_REVISAO_LEGADA.filter((k) => k !== 'candidatas')].map((c) => [...c].sort().join('|'))

/**
 * Da revisão legada, só entra na comparação o que o `rev1` trata como CONTEÚDO
 * e o legado capturou. Os outros nove (legenda, via, modelo, direção, ajuste,
 * referências, cliente, escopo e campanha) o `rev1` exclui de propósito
 * (C11-1b; "campanha e escopo fora do token"): mudá-los não muda a peça.
 */
const CAMPOS_DE_CONTEUDO_LEGADOS = ['copy', 'foto', 'candidatas', 'formato', 'quando', 'tema']

/** A revisão legada, SÓ quando o conjunto de chaves é exatamente um dos dois da main — nunca por palpite. */
function lerRevisaoLegada(gravada: string): Record<string, unknown> | null {
  let valor: unknown
  try {
    valor = JSON.parse(gravada)
  } catch {
    return null
  }
  const legada = objeto(valor)
  if (!legada) return null
  return CONJUNTOS_LEGADOS.includes(Object.keys(legada).sort().join('|')) ? legada : null
}

/** A revisão gravada com a peça contra o item AGORA — o mesmo vocabulário do `Confronto` da tabela. */
export type ConfrontoDaRevisao = 'igual' | 'diferente' | 'desconhecido'

/**
 * A revisão gravada com a peça confere com o item agora?
 *
 * - Nada gravado → `desconhecido`.
 * - Revisão da família `revN:` → igualdade literal (revisão de outra versão
 *   nunca é igual), como sempre.
 * - Revisão LEGADA reconhecida (um dos dois conjuntos exatos) → os campos de
 *   conteúdo que ela capturou, cada um pelo `stableStringify` da MESMA
 *   expressão que a main usou: tudo igual é `igual`; mudança real é
 *   `diferente`, e a recusa continua.
 * - Qualquer outra forma → `desconhecido`, como a ausência — nunca `igual`.
 *
 * Só a comparação de REVISÃO muda: a da spec gravada (`pedido`) é a de sempre.
 *
 * Limites declarados — o legado não tem testemunha para:
 * - o contrato da copy (`copyAutoral`): a main nunca o pôs na revisão. O TEXTO
 *   dele continua coberto pelo `copy` (o espelho posicional); mudança SÓ de
 *   estrutura (voz 2 declarada, grupo de leitura, função, fatos) depois de um
 *   enfileiramento legado passa. População em 21/09/2026: ZERO contratos
 *   gravados em produção (página, arte ou item) — limite real, mas vazio.
 * - as `candidatas`, na versão de 14 chaves: troca só delas passa como `igual`.
 */
export function confrontarRevisaoGravada(gravada: string | undefined, atual: string, item: ConteudoDaRevisaoDoItem): ConfrontoDaRevisao {
  if (gravada === undefined) return 'desconhecido'
  if (gravada === atual) return 'igual'
  if (/^rev\d+:/.test(gravada)) return 'diferente'
  const legada = lerRevisaoLegada(gravada)
  if (!legada) return 'desconhecido'
  const agora: Record<string, unknown> = {
    copy: item.copyProposta ?? null,
    foto: [item.fotoDriveId ?? null, item.fotoUrl ?? null],
    candidatas: item.fotoCandidatas ?? null,
    formato: item.formato ?? null,
    quando: item.quando ?? null,
    tema: item.tema ?? null,
  }
  const confere = CAMPOS_DE_CONTEUDO_LEGADOS.filter((k) => k in legada).every((k) => stableStringify(legada[k] ?? null) === stableStringify(agora[k]))
  return confere ? 'igual' : 'diferente'
}
