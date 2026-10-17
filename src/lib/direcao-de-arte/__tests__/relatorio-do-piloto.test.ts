/** Piloto sintético — o resumo agrega um lote falso de 20 peças: falso APTO, regra não coberta, divergência de repetibilidade, decisão 1 e 2, modo G. */
import { describe, expect, it } from 'vitest'
import { agregar, iou, paraMarkdown, type RegistroDaPeca } from './suporte/relatorio-do-piloto'
import { REGRAS_JULGADAS, MATRIZ } from './suporte/oraculos-do-piloto'

const juizes = (viola: Partial<Record<string, boolean | null>> = {}) => REGRAS_JULGADAS.map((regra) => ({ regra, estado: MATRIZ[regra].estado, viola: viola[regra] ?? (MATRIZ[regra].estado === 'coberta' || MATRIZ[regra].estado === 'coberta-parcial' ? false : null), camadas: viola[regra] ? ['apoio'] : [], detalhe: '' }))
const peca = (i: number, extra: Partial<RegistroDaPeca> = {}): RegistroDaPeca => ({
  spec: { chave: `c|story|A1|curta|sem|${i}`, cliente: i % 2 ? 'cliente-00' : 'cliente-01', formato: 'story', foto: i % 3 ? 'A1' : 'C', copy: 'curta', arquetipo: 'sem' },
  compor: { desfecho: 'composta', ms: 500 },
  gateV1: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] },
  ciclos: 0,
  gateFinal: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] },
  draft: 'criado',
  juizes: juizes(),
  oclusaoProduzida: [],
  renders: { compor: 3, revisar: 2, juizes: 2, png: 1 },
  ms: { compor: 500, revisar: 300 },
  estabilidade: { excecoes: [], naoMedida: false, semVinculo: false, timeout: false },
  repeticao: { igual: true, diferencas: [] },
  assunto: { estimado: { x: 540, y: 1113, width: 432, height: 480 }, catalogo: { x: 540, y: 1114, width: 432, height: 480 }, verdade: { x: 540, y: 1114, width: 432, height: 480 }, origemNaPeca: 'estimado' },
  ...extra,
})

describe('resumo do piloto', () => {
  it('agrega denominadores, taxa por eixo, motivos, falso APTO (só regra coberta), candidatos a falso bloqueio, repetibilidade, decisão 1 e 2, modo G', () => {
    const registros = Array.from({ length: 20 }, (_, i) => peca(i))
    // 1 falso APTO: gate APTO mas o juiz coberto acusa texto-sem-leitura.
    registros[3] = peca(3, { juizes: juizes({ 'texto-sem-leitura': true }) })
    // 1 recusa do gate com juiz coberto acusando → NÃO é candidato a falso bloqueio.
    registros[4] = peca(4, { gateFinal: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA', motivos: [{ regra: 'piso-de-interface', codigo: 'ACHADO_CRITICO', camadas: ['apoio'] }], naoMedidos: [] }, draft: 'recusado', juizes: juizes({ 'piso-de-interface': true }) })
    // 1 recusa do gate SEM juiz acusando → candidato a falso bloqueio (não comprovada).
    registros[5] = peca(5, { gateFinal: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA', motivos: [{ regra: 'texto-sobre-assunto', codigo: 'NAO_COMPROVADA', camadas: [] }], naoMedidos: [] }, draft: 'recusado' })
    // 1 regra não coberta "violada" num APTO não conta como falso APTO.
    registros[6] = peca(6, { juizes: juizes({ 'copy-completa': true }) })
    // 1 divergência de repetibilidade; 1 recusa estrutural; 1 erro; 1 modo G válido e recusado; 1 oclusão produzida.
    registros[7] = peca(7, { repeticao: { igual: false, diferencas: ['png: hash difere'] } })
    registros[8] = peca(8, { compor: { desfecho: 'recusa-estrutural', codigo: 'ASSINATURA_INCOMPLETA', ms: 10 }, gateV1: undefined, gateFinal: undefined, draft: 'nao-tentado', juizes: [], repeticao: undefined, assunto: undefined })
    registros[9] = peca(9, { compor: { desfecho: 'erro', codigo: 'TypeError', ms: 10 }, gateV1: undefined, gateFinal: undefined, draft: 'nao-tentado', juizes: [], repeticao: undefined, assunto: undefined, estabilidade: { excecoes: ['TypeError: x'], naoMedida: false, semVinculo: false, timeout: false } })
    registros[10] = peca(10, { modoG: { fetchFalhou: true, motivoSemAssunto: true, gateRecusou: true, valido: true }, gateFinal: { tipo: 'medida', resultado: 'REVISAO_HUMANA_NECESSARIA', motivos: [{ regra: 'texto-sobre-assunto', codigo: 'NAO_COMPROVADA', camadas: [] }], naoMedidos: [] }, draft: 'recusado' })
    registros[11] = peca(11, { oclusaoProduzida: ['fio'] })
    const r = agregar(registros, 120)
    expect(r.denominadores).toMatchObject({ elegiveis: 120, compostas: 18, recusasEstruturais: 1, erros: 1, chegaramAoGate: 18, drafts: 15 })
    expect(r.falsoApto).toEqual([{ chave: registros[3].spec.chave, regra: 'texto-sem-leitura', camadas: ['apoio'], png: undefined }])
    expect(r.candidatosFalsoBloqueio.map((c) => c.chave)).toEqual([registros[5].spec.chave, registros[10].spec.chave])
    expect(r.candidatosFalsoBloqueio[0]).toMatchObject({ naoComprovadas: 1, criticos: 0 })
    expect(r.motivos['texto-sobre-assunto'].NAO_COMPROVADA).toBe(2)
    expect(r.motivos['piso-de-interface'].ACHADO_CRITICO).toBe(1)
    expect(r.repetibilidade).toMatchObject({ comparadas: 18, iguais: 17 })
    expect(r.repetibilidade.divergencias[0].chave).toBe(registros[7].spec.chave)
    expect(r.estabilidade.excecoes).toBe(1)
    expect(r.decisao1.fotos).toBe(18)
    expect(r.decisao1.iouCatalogoVerdade).toBe(1)
    expect(r.decisao1.iouEstimadoVerdade).toBeGreaterThan(0.99)
    expect(r.decisao1.bloqueiosPorCaso['D-falha-de-leitura']).toMatchObject({ pecas: 1, bloqueadas: 1 })
    expect(r.decisao2.pecasComCamadaAcimaDeTexto).toBe(1)
    expect(r.modoG).toMatchObject({ leituras: 1, validas: 1, recusadas: 1, invalidas: 0 })
    expect(r.naoCoberto.map((n) => n.regra)).toEqual(expect.arrayContaining(['colisao', 'copy-completa', 'fonte-nao-carregada']))
    expect(r.taxaApto.cliente['cliente-00'].pecas + r.taxaApto.cliente['cliente-01'].pecas).toBe(18)
    const md = paraMarkdown(r, { data: '2026-10-17', head: 'abc', loteId: 'piloto-sintetico-x', ambiente: 'teste', rodada: 'calibração', hashRelatorio: 'deadbeef', limites: ['fontes reais', 'visão'] })
    expect(md).toContain('## 3. Falso APTO')
    expect(md).toContain('**1** — o piloto é INSATISFATÓRIO por definição')
    expect(md).toContain('O que este piloto NÃO mede')
    expect(md).toContain('## 10. O que NÃO está coberto por juiz')
  })
  it('iou: caixas iguais 1, disjuntas 0, nula quando falta uma', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(iou(a, a)).toBe(1)
    expect(iou(a, { x: 20, y: 20, width: 10, height: 10 })).toBe(0)
    expect(iou(a, null)).toBeNull()
  })
})
