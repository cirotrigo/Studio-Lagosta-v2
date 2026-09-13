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
