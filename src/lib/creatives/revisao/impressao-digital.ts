/**
 * CP5b § 5 — a IMPRESSÃO DIGITAL das regras de decisão: o que cobra o bump manual de `VERSAO_DAS_REGRAS` e de
 * `VERSAO_DO_GATE` (`revisao-v1` ficou parada por quatro checkpoints que mudaram regra). DUAS impressões, uma por
 * versão (Codex R3), cada uma com as ENTRADAS do corpus dentro (Codex R5: mudar regra e fixture ao mesmo tempo,
 * preservando as saídas, muda a impressão do mesmo jeito):
 *
 * - **revisor** = sha256 da serialização de { `REGRAS_DA_REVISAO`, e, para cada peça do corpus, a `medida` e a saída
 *   `avaliarPeca(medida)` } → `revisao-<VERSAO_DAS_REGRAS>.json`;
 * - **gate** = sha256 da serialização de { `REGRAS_CRITICAS`, `CONFERENCIAS_DO_GATE`, `CHAVES_CLASSIFICADAS`
 *   (caminhos e classes), e, para cada peça e cada uma das 4 políticas, a entrada e a saída `gateDaMedida(entrada).gate`
 *   SEM `rulesVersion`, `pageVersion` e `copyVersion` da saída (o gate os copia da entrada; com eles dentro, subir
 *   `VERSAO_DAS_REGRAS` sozinho já mudava a impressão do gate — Codex R10) } → `gate-<VERSAO_DO_GATE>.json`.
 *
 * A serialização é `serializarParaImpressao` (`gate-registro.ts`): preserva `NaN`/`Infinity`/`-0`/`undefined`, que o
 * corpus usa de propósito e o JSON achataria (Codex R16). Limite dito (§ 5): a impressão NÃO cobre a MEDIÇÃO —
 * só o que decide sobre medidas fixas — e só vê o que o corpus exercita (cobertura amostral, decisão 9.6).
 *
 * As tabelas e as funções chegam como PARÂMETROS (H10): o teste prova que mudar UMA entrada observável muda a
 * impressão sem `vi.mock` de constante privada. Módulo PURO.
 */
import { createHash } from 'node:crypto'
import type { RelatorioDaRevisao } from './contrato'
import type { EntradaDoGate, GateDaArte, MedidaDaPeca, PoliticaDoAssunto } from './gate'
import { serializarParaImpressao } from './gate-registro'

export interface PecaDoCorpus {
  nome: string
  medida: MedidaDaPeca
  identidade: EntradaDoGate['identidade']
  copy?: EntradaDoGate['copy']
}

export interface EntradasDaImpressao {
  regrasDaRevisao: readonly string[]
  criticas: readonly string[]
  conferencias: readonly string[]
  chavesClassificadas: Record<string, { classe: string }>
  avaliar: (medida: MedidaDaPeca) => RelatorioDaRevisao
  gate: (entrada: EntradaDoGate) => { gate: GateDaArte }
  politicas: readonly PoliticaDoAssunto[]
}

/** A saída do gate sem as três cópias da entrada. */
export function saidaDoGateSemAsCopias(g: GateDaArte) {
  const { rulesVersion: _r, pageVersion: _p, copyVersion: _c, ...resto } = g
  return resto
}

const sha256 = (valor: unknown) => createHash('sha256').update(serializarParaImpressao(valor)).digest('hex')

export function impressaoDigitalDasRegras(entradas: EntradasDaImpressao, corpus: readonly PecaDoCorpus[]): { revisor: string; gate: string } {
  const revisor = sha256({
    regras: [...entradas.regrasDaRevisao],
    corpus: corpus.map((p) => ({ nome: p.nome, medida: p.medida, relatorio: entradas.avaliar(p.medida) })),
  })
  const gate = sha256({
    criticas: [...entradas.criticas],
    conferencias: [...entradas.conferencias],
    chaves: Object.fromEntries(Object.entries(entradas.chavesClassificadas).map(([k, v]) => [k, v.classe])),
    corpus: corpus.map((p) => ({
      nome: p.nome,
      medida: p.medida,
      identidade: p.identidade,
      copy: p.copy ?? null,
      porPolitica: entradas.politicas.map((politica) => ({
        politica,
        gate: saidaDoGateSemAsCopias(entradas.gate({ medida: p.medida, identidade: p.identidade, copy: p.copy, politicaDoAssunto: politica }).gate),
      })),
    })),
  })
  return { revisor, gate }
}

/** O conteúdo dos arquivos commitados em `__tests__/impressao-digital/`. Sem data: a regeneração é determinística. */
export interface ArquivoDaImpressao {
  camada: 'revisor' | 'gate'
  versao: string
  impressao: string
  corpus: string[]
}

export const nomeDoArquivoDaImpressao = (camada: 'revisor' | 'gate', versao: string) => `${camada === 'revisor' ? 'revisao' : 'gate'}-${versao}.json`
