/**
 * A identidade de um item de LOTE e o hash do que ele pede — módulo PURO (zod +
 * `node:crypto`), sem Prisma, com teste.
 *
 * PR 11 de "Marca simples, copy melhor" (12/09/2026). Até aqui repetir uma leva
 * (retentativa do modelo no chat, timeout do conector, retomada depois de falha
 * parcial) criava Generations e jobs NOVOS: não havia identidade de lote nem de
 * item. Agora quem chama manda `loteId` + `itemId` estáveis, e o registro durável
 * (`ItemDeLote`) responde: mesma chave com o mesmo payload é a MESMA peça; mesma
 * chave com payload diferente é CONFLITO, nunca sobrescrita.
 *
 * O que decide "o mesmo payload" é `hashDoPayload(payloadParaHash(spec))`, sobre
 * a spec JÁ normalizada por `validarSpec` (blocos derivados do contrato,
 * `selecaoExperimental: false` removido). Ficam FORA do hash, e só estes:
 *  - `projectId` — já é parte da chave;
 *  - `copyAutoral.origem.em` e `copyAutoral.revisoes[].em` — carimbos de
 *    relógio: o modelo que remonta a mesma chamada escreve outra hora, e contar
 *    isso como diferença faria a retentativa legítima virar conflito;
 *  - o que não mora na spec: `decididoPor`, `autor`, `canal`, `itemAtualizadoEm`
 *    — atribuição e ficha de concorrência, não o que a peça mostra.
 * Todo o resto entra, `nome` e `quando` inclusive: o que é persistido com a
 * peça e chega diferente sob a mesma chave é pedido diferente, e o caminho
 * honesto é dizer isso em vez de devolver em silêncio a peça antiga.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonico } from '@/lib/copy-autoral/revisao'

/** Mudou a normalização do payload? Suba a versão (ver `hashConfere`). */
export const VERSAO_DO_HASH = 'lote-v1'

/** Letras, números, pontuação, símbolos e espaço — nada de caractere de controle. */
const ID_DE_LOTE = /^[\p{L}\p{N}\p{P}\p{S} ]+$/u

export const identidadeDeLoteSchema = z
  .object({
    loteId: z.string().trim().min(1).max(120).regex(ID_DE_LOTE),
    itemId: z.string().trim().min(1).max(120).regex(ID_DE_LOTE),
  })
  .strict()
export type IdentidadeDeLote = z.infer<typeof identidadeDeLoteSchema>

/** A identidade válida ou a lista de problemas, sem lançar. */
export function validarIdentidadeDeLote(entrada: unknown): { identidade: IdentidadeDeLote; problemas: [] } | { identidade: null; problemas: string[] } {
  const r = identidadeDeLoteSchema.safeParse(entrada)
  if (r.success) return { identidade: r.data, problemas: [] }
  return { identidade: null, problemas: r.error.issues.map((p) => `${p.path.join('.') || '(raiz)'}: ${p.message}`) }
}

function semEm(valor: unknown): unknown {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor
  const { em: _em, ...resto } = valor as Record<string, unknown>
  return resto
}

/**
 * O payload que entra no hash: a spec como ela é gravada (JSON puro), menos o
 * que está listado no topo do arquivo. Idempotente — aplicar duas vezes dá o
 * mesmo resultado, e é o que permite recalcular o hash de uma linha antiga.
 */
export function payloadParaHash(spec: unknown): Record<string, unknown> {
  const puro = JSON.parse(JSON.stringify(spec ?? {})) as Record<string, unknown>
  const { projectId: _projectId, ...resto } = puro
  const copy = resto.copyAutoral
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
    const c = copy as Record<string, unknown>
    resto.copyAutoral = {
      ...c,
      ...(c.origem !== undefined ? { origem: semEm(c.origem) } : {}),
      ...(Array.isArray(c.revisoes) ? { revisoes: c.revisoes.map(semEm) } : {}),
    }
  }
  return resto
}

/** `lote-v1:<sha256 do JSON canônico>` — a ordem das chaves não é diferença. */
export function hashDoPayload(payload: unknown): string {
  return `${VERSAO_DO_HASH}:${createHash('sha256').update(canonico(payload)).digest('hex')}`
}

/**
 * O hash guardado confere com o de agora? Linha gravada por OUTRA versão da
 * normalização é comparada recalculando o hash do `payload` que ela guardou —
 * senão subir a versão transformaria toda repetição de lote antigo em conflito.
 */
export function hashConfere(registro: { hashDoPayload: string; payload: unknown }, hashAtual: string): boolean {
  if (registro.hashDoPayload === hashAtual) return true
  if (registro.hashDoPayload.startsWith(`${VERSAO_DO_HASH}:`)) return false
  return hashDoPayload(payloadParaHash(registro.payload)) === hashAtual
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A chave com que um elemento de lista é casado: o `id` do bloco autoral, o `papel` do bloco da spec. */
function chaveDoElemento(v: unknown): string | null {
  if (!ehObjeto(v)) return null
  if (typeof v.id === 'string') return v.id
  if (typeof v.papel === 'string') return v.papel
  return null
}

/**
 * ONDE dois payloads diferem, em caminhos legíveis (`nome`, `blocos[headline].linhas`,
 * `copyAutoral.blocos[cta].linhas`). É o que o conflito devolve: sem isso, "mesma
 * chave com outro payload" obriga quem chamou a adivinhar o que mudou.
 */
export function diferencasDoPayload(antes: unknown, depois: unknown, limite = 12): string[] {
  const saida: string[] = []
  const visitar = (a: unknown, b: unknown, caminho: string, profundidade: number) => {
    if (saida.length >= limite) return
    if (canonico(a) === canonico(b)) return
    if (profundidade >= 4) return void saida.push(caminho || '(raiz)')
    if (ehObjeto(a) && ehObjeto(b)) {
      for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        visitar(a[k], b[k], caminho ? `${caminho}.${k}` : k, profundidade + 1)
      }
      return
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const chavesA = a.map(chaveDoElemento)
      const chavesB = b.map(chaveDoElemento)
      const porChave = chavesA.every((k) => k !== null) && chavesB.every((k) => k !== null)
        && new Set(chavesA).size === chavesA.length && new Set(chavesB).size === chavesB.length
      if (porChave) {
        for (const k of [...new Set([...(chavesA as string[]), ...(chavesB as string[])])]) {
          visitar(a[chavesA.indexOf(k)], b[chavesB.indexOf(k)], `${caminho}[${k}]`, profundidade + 1)
        }
        return
      }
      // Lista sem chave (as linhas de um bloco, as fotos candidatas) é folha:
      // "a linha 0 mudou" diz menos que "as linhas mudaram".
      return void saida.push(caminho || '(raiz)')
    }
    saida.push(caminho || '(raiz)')
  }
  visitar(antes, depois, '', 0)
  return saida
}

/** O que o registro sabe do item quando a decisão é tomada. */
export interface RegistroDoItemDeLote {
  hashDoPayload: string
  payload: unknown
  generationId: string | null
  jobId: string | null
}

export type DecisaoDaReserva =
  | { acao: 'criar' }
  | { acao: 'reaproveitar' }
  | { acao: 'retomar'; falta: 'geracao-e-job' | 'job'; motivo: string }
  | { acao: 'conflito'; diferencas: string[] }

/**
 * A decisão, dada a linha, o hash de agora e o estado da Generation e do job
 * que ela aponta. Ordem: conflito vence tudo (nunca se sobrescreve outro
 * pedido); depois, só se cria o que FALTA.
 *
 * - Sem linha → `criar`.
 * - Linha sem Generation (a chamada anterior parou entre reservar e criar) →
 *   `retomar` tudo.
 * - Generation sumida ou FAILED, ou job terminal (DONE/FAILED) com a Generation
 *   ainda aberta → `retomar` tudo: a peça anterior não existe, e repetir a
 *   chamada é pedir de novo (a Generation que falhou fica como histórico).
 * - Generation PROCESSING sem job → `retomar` só o job.
 * - Generation COMPLETED COM arquivo (com ou sem job), ou PROCESSING com job
 *   vivo → `reaproveitar`, sem criar nada. COMPLETED sem `resultUrl` não é peça
 *   pronta (PR11-F02): `retomar` tudo.
 */
export function decidirReserva(entrada: {
  registro: RegistroDoItemDeLote | null
  hash: string
  payload: unknown
  geracao: GeracaoDaPeca | null
  job: { status: string } | null
}): DecisaoDaReserva {
  const { registro, hash, geracao, job } = entrada
  if (!registro) return { acao: 'criar' }
  if (!hashConfere(registro, hash)) return { acao: 'conflito', diferencas: diferencasDoPayload(registro.payload, entrada.payload) }
  if (!registro.generationId) return { acao: 'retomar', falta: 'geracao-e-job', motivo: 'a reserva ficou sem geração (a chamada anterior parou entre reservar e criar)' }
  return estadoDaPeca({ geracao, job })
}

export type EstadoDaPeca = Extract<DecisaoDaReserva, { acao: 'reaproveitar' | 'retomar' }>

/**
 * O que a Generation da peça precisa mostrar para a decisão. O `resultUrl` é
 * OBRIGATÓRIO de propósito (PR11-F02): a leitura que pedia só o `status`
 * devolvia como pronta a peça COMPLETED sem arquivo — e cada repetição
 * devolvia de novo a mesma peça sem imagem. Quem lê a Generation para decidir
 * tem de pedir as duas colunas.
 */
export interface GeracaoDaPeca {
  status: string
  resultUrl: string | null
}

/**
 * O que a peça que EXISTE pede, dado o estado da Generation e do job — a regra
 * da retomada sob a trava da LINHA do lote (`decidirReserva`). O caminho do
 * item de plano decide DE NOVO sob a trava do ITEM, pela tabela e por
 * `classificarPecaDoItem` (R04; desde R05–R06), que já separa `pronta` de
 * `pronta-sem-arquivo` — a reserva segue a mesma régua: sem arquivo não é
 * pronta, e a peça vai à recuperação, onde valem as guardas do plano.
 */
export function estadoDaPeca(entrada: { geracao: GeracaoDaPeca | null; job: { status: string } | null }): EstadoDaPeca {
  const { geracao, job } = entrada
  if (!geracao) return { acao: 'retomar', falta: 'geracao-e-job', motivo: 'a geração do item não existe mais' }
  if (geracao.status === 'COMPLETED') {
    return geracao.resultUrl ? { acao: 'reaproveitar' } : { acao: 'retomar', falta: 'geracao-e-job', motivo: 'a geração terminou sem arquivo' }
  }
  if (geracao.status === 'FAILED') return { acao: 'retomar', falta: 'geracao-e-job', motivo: 'a geração anterior falhou' }
  if (!job) return { acao: 'retomar', falta: 'job', motivo: 'a geração ficou sem job' }
  if (job.status === 'DONE' || job.status === 'FAILED') return { acao: 'retomar', falta: 'geracao-e-job', motivo: `o job terminou (${job.status}) sem fechar a geração` }
  return { acao: 'reaproveitar' }
}

/**
 * Duas specs são o MESMO pedido para o lote? A mesma normalização e o mesmo
 * hash que decidem a reserva (revisão R03): quem compara specs no caminho da
 * retomada usa ISTO, nunca a comparação crua — senão o lote aceita a
 * retentativa que só mudou os carimbos `em` e o criador a recusa.
 *
 * Não confere `projectId` (fica fora do hash por ser parte da chave): quem
 * compara a spec gravada numa peça confere o projeto à parte.
 */
export function mesmoPedidoDoLote(a: unknown, b: unknown): boolean {
  return hashDoPayload(payloadParaHash(a)) === hashDoPayload(payloadParaHash(b))
}

/**
 * O que o CRIADOR precisa saber da retomada (revisão R01–R02): a peça que a
 * linha do lote aponta morreu, e o que falta refazer. Quem cria por outro
 * caminho (o do item de plano) tem de HONRAR isto — sem a decisão ele via a
 * Generation aberta e reaproveitava o job terminal (R01), ou recusava o item em
 * voo porque `na-fila` não é executável (R02).
 *
 * `null` quando não há peça anterior (criar, reserva órfã): aí o criador segue
 * o caminho normal, que pode ligar a linha à peça que o item já tinha.
 */
export interface RecuperacaoDaReserva {
  falta: 'geracao-e-job' | 'job'
  /** A Generation que a linha do lote aponta — a que morreu, ou a que ficou sem job. */
  generationId: string
}

export function recuperacaoDaDecisao(decisao: DecisaoDaReserva, generationIdDaLinha: string | null): RecuperacaoDaReserva | null {
  if (decisao.acao !== 'retomar' || !generationIdDaLinha) return null
  return { falta: decisao.falta, generationId: generationIdDaLinha }
}

/** Como a peça do item está agora, lida da Generation — o retorno individual da F4. */
export type SituacaoDaPecaDoLote = 'pendente' | 'pronta' | 'falhou'

/** `pronta` só COM arquivo (PR11-F02): COMPLETED sem `resultUrl` não entregou nada, e dizer "pronta" mentiria. */
export function situacaoDaPeca(statusDaGeracao: string | null | undefined, resultUrl: string | null | undefined): SituacaoDaPecaDoLote {
  if (statusDaGeracao === 'COMPLETED') return resultUrl ? 'pronta' : 'falhou'
  if (statusDaGeracao === 'FAILED' || !statusDaGeracao) return 'falhou'
  return 'pendente'
}

/** O que a chamada fez com o item: criou agora, devolveu o que existia, ou criou o que faltava. */
export type DesfechoDoItemDeLote = 'criado' | 'reaproveitado' | 'retomado'

export const SITUACOES_DO_REGISTRO = ['reservado', 'enfileirado'] as const
export type SituacaoDoRegistro = (typeof SITUACOES_DO_REGISTRO)[number]
