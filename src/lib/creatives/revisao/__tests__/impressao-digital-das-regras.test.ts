/**
 * CP5b § 5 — H9/H9b/H10: a impressão digital das regras de decisão bate com o arquivo da versão em vigor; mudou a
 * regra (ou o corpus) sem subir a versão → este teste FALHA e diz qual versão subir. Regenerar (SÓ depois de subir
 * a versão):
 *
 *   IMPRESSAO_DIGITAL=gravar npx vitest run src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts
 *
 * O arquivo de uma versão que já existe na `main` é IMUTÁVEL (`scripts/validar-impressao-digital.ts`, no CI): quem
 * regenerar o JSON da versão velha para "voltar a passar" é barrado lá.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layer } from '@/types/template'
import { REGRAS_DA_REVISAO, VERSAO_DAS_REGRAS } from '../contrato'
import { avaliarPeca, type EntradaDaRevisao } from '../regras'
import { CHAVES_CLASSIFICADAS, CONFERENCIAS_DO_GATE, REGRAS_CRITICAS, VERSAO_DO_GATE, gateDaMedida } from '../gate'
import { serializarParaImpressao } from '../gate-registro'
import { versaoDaPagina } from '../versao'
import { impressaoDigitalDasRegras, nomeDoArquivoDaImpressao, type ArquivoDaImpressao, type EntradasDaImpressao, type PecaDoCorpus } from '../impressao-digital'
import { CORPUS_DO_GATE, POLITICAS_DO_CORPUS, forma, pecaLimpa } from './suporte/corpus-do-gate'

const PASTA = join(__dirname, 'impressao-digital')

const ENTRADAS: EntradasDaImpressao = {
  regrasDaRevisao: REGRAS_DA_REVISAO,
  criticas: REGRAS_CRITICAS,
  conferencias: CONFERENCIAS_DO_GATE,
  chavesClassificadas: CHAVES_CLASSIFICADAS,
  avaliar: (m) => avaliarPeca(m as EntradaDaRevisao),
  gate: gateDaMedida,
  politicas: POLITICAS_DO_CORPUS,
}

const comoBumpar = (camada: 'revisor' | 'gate', versao: string, constante: string) =>
  `a regra do ${camada} (ou o corpus) mudou e ${constante} continua '${versao}': suba ${constante} (em ${camada === 'revisor' ? 'revisao/contrato.ts' : 'revisao/gate.ts'}) e gere ${nomeDoArquivoDaImpressao(camada, '<nova>')} com IMPRESSAO_DIGITAL=gravar npx vitest run src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts`

describe('H9 — a impressão digital bate com o arquivo da versão em vigor', () => {
  const atual = impressaoDigitalDasRegras(ENTRADAS, CORPUS_DO_GATE)
  const casos: Array<['revisor' | 'gate', string, string, string]> = [
    ['revisor', VERSAO_DAS_REGRAS, atual.revisor, 'VERSAO_DAS_REGRAS'],
    ['gate', VERSAO_DO_GATE, atual.gate, 'VERSAO_DO_GATE'],
  ]

  if (process.env.IMPRESSAO_DIGITAL === 'gravar') {
    it('grava as duas impressões da versão em vigor (modo IMPRESSAO_DIGITAL=gravar)', () => {
      for (const [camada, versao, impressao] of casos) {
        const arquivo: ArquivoDaImpressao = { camada, versao, impressao, corpus: CORPUS_DO_GATE.map((p) => p.nome) }
        writeFileSync(join(PASTA, nomeDoArquivoDaImpressao(camada, versao)), JSON.stringify(arquivo, null, 2) + '\n')
      }
    })
  }

  for (const [camada, versao, impressao, constante] of casos) {
    it(`${camada}: ${nomeDoArquivoDaImpressao(camada, versao)} existe e bate`, () => {
      const caminho = join(PASTA, nomeDoArquivoDaImpressao(camada, versao))
      expect(existsSync(caminho), `não existe ${caminho}: gere a impressão da versão nova com IMPRESSAO_DIGITAL=gravar npx vitest run …`).toBe(true)
      const gravado = JSON.parse(readFileSync(caminho, 'utf8')) as ArquivoDaImpressao
      expect(gravado.camada).toBe(camada)
      expect(gravado.versao).toBe(versao)
      expect(gravado.corpus).toEqual(CORPUS_DO_GATE.map((p) => p.nome))
      expect(gravado.impressao, comoBumpar(camada, versao, constante)).toBe(impressao)
    })
  }

  it('é determinística, cada camada tem a sua, e o corpus é enumerado com nomes únicos', () => {
    expect(impressaoDigitalDasRegras(ENTRADAS, CORPUS_DO_GATE)).toEqual(atual)
    expect(atual.revisor).not.toBe(atual.gate)
    expect(atual.revisor).toMatch(/^[0-9a-f]{64}$/)
    const nomes = CORPUS_DO_GATE.map((p) => p.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
    expect(nomes).toContain('piloto-2026-10-13 v1')
    expect(nomes).toContain('piloto-2026-10-13 v2')
    expect(nomes.length).toBeGreaterThanOrEqual(40)
  })
})

describe('H9b — serialização própria: NaN, Infinity, -0 e undefined não se confundem', () => {
  it('serializarParaImpressao distingue o que o JSON achata; versaoDaPagina não muda', () => {
    expect(serializarParaImpressao({ a: NaN })).toBe('{"a":{"$num":"NaN"}}')
    expect(serializarParaImpressao({ a: Infinity })).toBe('{"a":{"$num":"Infinity"}}')
    expect(serializarParaImpressao({ a: -Infinity })).toBe('{"a":{"$num":"-Infinity"}}')
    expect(serializarParaImpressao({ a: -0 })).toBe('{"a":{"$num":"-0"}}')
    expect(serializarParaImpressao({ a: 0 })).toBe('{"a":0}')
    expect(serializarParaImpressao({ a: [1, undefined, null] })).toBe('{"a":[1,{"$undefined":true},null]}')
    // Chaves ordenadas e `undefined` fora dos objetos, como `estavel`.
    expect(serializarParaImpressao({ b: 1, a: undefined, c: { z: 1, y: 2 } })).toBe('{"b":1,"c":{"y":2,"z":1}}')
    const camada = (order: number) => forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order })
    const pagina = (order: number) => ({ width: 1080, height: 1920, layers: [camada(order)] })
    expect(versaoDaPagina(pagina(NaN))).toBe(versaoDaPagina(pagina(Infinity)))
    expect(serializarParaImpressao(camada(NaN))).not.toBe(serializarParaImpressao(camada(Infinity)))
  })

  it('a mesma entrada de G21f com order NaN × Infinity × -0 dá impressões diferentes', () => {
    const com = (order: number): PecaDoCorpus => {
      const base = CORPUS_DO_GATE.find((p) => p.nome === 'G1 peça limpa')!
      return { ...base, nome: 'G21f variante', medida: { ...base.medida, camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order })] } }
    }
    const [nan, inf, zero] = [NaN, Infinity, -0].map((o) => impressaoDigitalDasRegras(ENTRADAS, [com(o)]))
    expect(nan.revisor).not.toBe(inf.revisor)
    expect(nan.gate).not.toBe(inf.gate)
    expect(zero.revisor).not.toBe(nan.revisor)
    expect(zero.gate).not.toBe(impressaoDigitalDasRegras(ENTRADAS, [com(0)]).gate)
  })
})

describe('H10 — mudar UMA entrada observável muda a impressão certa', () => {
  const base = impressaoDigitalDasRegras(ENTRADAS, CORPUS_DO_GATE)

  it('`criticas` sem `colisao` → só a impressão do gate muda', () => {
    const r = impressaoDigitalDasRegras({ ...ENTRADAS, criticas: REGRAS_CRITICAS.filter((c) => c !== 'colisao') }, CORPUS_DO_GATE)
    expect(r.gate).not.toBe(base.gate)
    expect(r.revisor).toBe(base.revisor)
  })

  it('um `gate` que devolve outro resultado para uma peça → só a impressão do gate muda', () => {
    const alvo = CORPUS_DO_GATE[2].medida
    const r = impressaoDigitalDasRegras(
      { ...ENTRADAS, gate: (e) => (e.medida === alvo ? { gate: { ...gateDaMedida(e).gate, resultado: 'REVISAO_HUMANA_NECESSARIA' } } : gateDaMedida(e)) },
      CORPUS_DO_GATE,
    )
    expect(r.gate).not.toBe(base.gate)
    expect(r.revisor).toBe(base.revisor)
  })

  it('um `avaliar` que devolve um achado a mais → a impressão do REVISOR muda (a do gate injetado é a real: a transitividade é do código, gate.ts chama avaliarPeca)', () => {
    const avaliarComAchado = (m: Parameters<EntradasDaImpressao['avaliar']>[0]) => {
      const r = avaliarPeca(m as EntradaDaRevisao)
      return { ...r, achados: [...r.achados, { id: 'colisao:extra', regra: 'colisao' as const, severidade: 'problema' as const, certeza: 'medida' as const, camadas: ['headline'], mensagem: 'x', evidencia: {}, ajustes: [] }] }
    }
    const r = impressaoDigitalDasRegras({ ...ENTRADAS, avaliar: avaliarComAchado }, CORPUS_DO_GATE)
    expect(r.revisor).not.toBe(base.revisor)
    expect(r.gate).toBe(base.gate)
  })

  it('as cópias da entrada na saída do gate ficam fora: subir só rulesVersion na saída não muda a impressão do gate', () => {
    const r = impressaoDigitalDasRegras({ ...ENTRADAS, gate: (e) => ({ gate: { ...gateDaMedida(e).gate, rulesVersion: 'revisao-v99' } }) }, CORPUS_DO_GATE)
    expect(r.gate).toBe(base.gate)
  })

  it('a ENTRADA do corpus entra: a mesma peça com uma camada a mais muda as duas impressões', () => {
    const [p0, ...resto] = CORPUS_DO_GATE
    const alterada: PecaDoCorpus = { ...p0, medida: { ...p0.medida, camadas: [...p0.medida.camadas, { ...(p0.medida.camadas[0] as Layer), id: 'extra', visible: false }] } }
    const r = impressaoDigitalDasRegras(ENTRADAS, [alterada, ...resto])
    expect(r.revisor).not.toBe(base.revisor)
    expect(r.gate).not.toBe(base.gate)
  })
})
