/** Piloto sintético — o resumo agrega um lote falso de 20 peças: falso APTO, regra não coberta, divergência de repetibilidade, decisão 1 e 2, modo G. */
import { describe, expect, it } from 'vitest'
import { agregar, impressaoDoGate, iou, paraMarkdown, situacaoDaAnotacao, violacoesDoPiloto, type RegistroDaPeca } from './suporte/relatorio-do-piloto'
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
  assunto: { estimado: { x: 540, y: 1113, width: 432, height: 480 }, estimadoPor: 'compositor', catalogo: { x: 540, y: 1114, width: 432, height: 480 }, verdade: { x: 540, y: 1114, width: 432, height: 480 }, origemNaPeca: 'estimado', par: { sha256DaFoto: 'abc', dimensoes: '1080x1920', corteComCatalogo: 'center-middle', corteSemCatalogo: 'center-middle', mesmoCorte: true } },
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

describe('violacoesDoPiloto — cada invariante violado derruba a rodada', () => {
  const base = (): RegistroDaPeca => ({ spec: { chave: 'c|story|B|curta|sem', cliente: 'c', formato: 'story', foto: 'B', copy: 'curta', arquetipo: 'sem' }, compor: { desfecho: 'composta', ms: 1 }, ciclos: 0, draft: 'criado', juizes: [], oclusaoProduzida: [], renders: {}, ms: {}, estabilidade: { excecoes: [], naoMedida: false, semVinculo: false, timeout: false }, gateV1: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] }, gateFinal: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] }, repeticao: { igual: true, diferencas: [] } })
  it('rodada limpa EXPLORATÓRIA: nenhuma violação; a OFICIAL exige cobertura dos cenários (repetição de tudo, modo G, oclusão injetada)', () => {
    const registros = [base()]
    expect(violacoesDoPiloto(agregar(registros, 1), registros, { oficial: false })).toEqual([])
    expect(violacoesDoPiloto(agregar(registros, 1), registros)).toEqual(['rodada oficial sem nenhuma leitura em modo G', 'rodada oficial sem nenhuma oclusão injetada', 'rodada oficial sem nenhum cenário H (anotação perdida)'])
    const semRepeticao = [{ ...base(), repeticao: undefined }]
    expect(violacoesDoPiloto(agregar(semRepeticao, 1), semRepeticao)[0]).toMatch(/sem repetir todas as specs \(0\/1\)/)
    const completa = [{ ...base(), modoG: { fetchFalhou: true, motivoSemAssunto: true, gateRecusou: true, valido: true }, oclusaoInjetada: { gateRecusou: true, motivos: ['oclusao:NAO_MEDIDO'] }, cenarioH: { corte: 'center-middle → left-top', tipo: 'reestimada-com-assunto' as const, revisorRecusou: true, produtorRecusou: true, aoHumano: true, codigoDoProdutor: 'REVISAO_HUMANA_NECESSARIA' } }]
    expect(violacoesDoPiloto(agregar(completa, 1), completa)).toEqual([])
  })
  it('erro de execução, exceção, timeout e cobertura vazia caem', () => {
    const erro: RegistroDaPeca = { ...base(), compor: { desfecho: 'erro', codigo: 'TypeError', ms: 0 }, gateV1: undefined, gateFinal: undefined, estabilidade: { excecoes: ['TypeError'], naoMedida: false, semVinculo: false, timeout: true } }
    const v = violacoesDoPiloto(agregar([erro], 1), [erro])
    expect(v.some((x) => /erro de execução/.test(x))).toBe(true)
    expect(v.some((x) => /exceção/.test(x))).toBe(true)
    expect(v.some((x) => /timeout/.test(x))).toBe(true)
    expect(v.some((x) => /cobertura vazia/.test(x))).toBe(true)
  })
  it('falso APTO em peça MEDIDA cai; em peça NÃO MEDIDA vira indício (não cai)', () => {
    const juiz = { regra: 'texto-sobre-assunto' as const, estado: 'coberta' as const, viola: true, camadas: ['servico'], detalhe: '' }
    const medida: RegistroDaPeca = { ...base(), juizes: [juiz] }
    expect(violacoesDoPiloto(agregar([medida], 1), [medida], { oficial: false }).some((x) => /falso APTO em 1 peça/.test(x))).toBe(true)
    const naoMedida: RegistroDaPeca = { ...base(), juizes: [juiz], fidelidade: { fora: ['servico'] } }
    const r2 = [naoMedida, base()]
    expect(violacoesDoPiloto(agregar(r2, 2), r2, { oficial: false })).toEqual([])
  })
  it('repetibilidade abaixo de 100 % cai', () => {
    const r: RegistroDaPeca = { ...base(), repeticao: { igual: false, diferencas: ['png: hash difere'] } }
    expect(violacoesDoPiloto(agregar([r], 1), [r], { oficial: false }).some((x) => /repetibilidade 0\/1/.test(x))).toBe(true)
  })
  it('modo G inválido, modo G não recusado e oclusão injetada não recusada caem', () => {
    const invalido: RegistroDaPeca = { ...base(), modoG: { fetchFalhou: false, motivoSemAssunto: false, gateRecusou: false, valido: false } }
    expect(violacoesDoPiloto(agregar([invalido], 1), [invalido], { oficial: false }).some((x) => /modo G: 1 leitura\(s\) inválida/.test(x))).toBe(true)
    const naoRecusado: RegistroDaPeca = { ...base(), modoG: { fetchFalhou: true, motivoSemAssunto: true, gateRecusou: false, valido: true } }
    expect(violacoesDoPiloto(agregar([naoRecusado], 1), [naoRecusado], { oficial: false }).some((x) => /válida\(s\) que o gate NÃO recusou/.test(x))).toBe(true)
    const oclusao: RegistroDaPeca = { ...base(), oclusaoInjetada: { gateRecusou: false, motivos: [] } }
    expect(violacoesDoPiloto(agregar([oclusao], 1), [oclusao], { oficial: false }).some((x) => /oclusão injetada: 1/.test(x))).toBe(true)
  })
})

describe('impressaoDoGate — a repetibilidade compara o gate INTEIRO, menos o relógio', () => {
  const g = { tipo: 'medida', resultado: 'APTO', rulesVersion: 'r1', versaoDoGate: 'g1', medidoEm: '2026-10-17T01:00:00Z', motivos: [], naoMedidos: [], pageVersion: 'p1', copyVersion: 'c1', politicaDoAssunto: { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }, vinculo: { generationId: 'g', postType: 'STORY' } }
  it('só `medidoEm` diferente → mesma impressão', () => {
    expect(impressaoDoGate(g)).toBe(impressaoDoGate({ ...g, medidoEm: '2026-10-17T02:00:00Z' }))
  })
  it('rulesVersion, pageVersion, copyVersion ou política diferentes → impressões diferentes (o recorte tipo/resultado/motivos deixaria passar)', () => {
    expect(impressaoDoGate({ ...g, rulesVersion: 'r2' })).not.toBe(impressaoDoGate(g))
    expect(impressaoDoGate({ ...g, pageVersion: 'p2' })).not.toBe(impressaoDoGate(g))
    expect(impressaoDoGate({ ...g, copyVersion: 'c2' })).not.toBe(impressaoDoGate(g))
    expect(impressaoDoGate({ ...g, politicaDoAssunto: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' } })).not.toBe(impressaoDoGate(g))
  })
})

describe('adendo § 1 — anotação do assunto e cenário H', () => {
  const rect = { x: 0, y: 900, width: 1080, height: 500 }
  const ok: NonNullable<RegistroDaPeca['anotacao']> = { compositor: { origem: 'catalogo', rect }, revisor: { estimativas: [0, 0], cobertura: { estado: 'avaliada', naoSeAplica: false, motivo: null }, motivos: [] }, produtor: { assunto: { rect, origem: 'catalogo' }, naoSeAplica: false, motivos: [] } }
  it('preservada só quando os três elos batem; cada quebra tem o seu nome', () => {
    expect(situacaoDaAnotacao(ok)).toBe('preservada')
    expect(situacaoDaAnotacao({ ...ok, compositor: { origem: 'estimado', rect } })).toBe('nao-e-caso-a')
    expect(situacaoDaAnotacao({ ...ok, revisor: { ...ok.revisor, estimativas: [0, 1] } })).toBe('revisor-reestimou')
    expect(situacaoDaAnotacao({ ...ok, revisor: { ...ok.revisor, motivos: ['NAO_COMPROVADA'] } })).toBe('revisor-nao-avaliou')
    expect(situacaoDaAnotacao({ ...ok, produtor: null })).toBe('produtor-nao-mediu')
    expect(situacaoDaAnotacao({ ...ok, produtor: { assunto: { rect, origem: 'estimado' }, naoSeAplica: false, motivos: ['NAO_COMPROVADA'] } })).toBe('produtor-sem-catalogo')
    expect(situacaoDaAnotacao({ ...ok, produtor: { assunto: { rect: { ...rect, y: 901 }, origem: 'catalogo' }, naoSeAplica: false, motivos: [] } })).toBe('produtor-outra-caixa')
  })
  it('cenário H que NÃO vai ao humano e par com corte divergente derrubam a rodada', () => {
    const base = (): RegistroDaPeca => ({ spec: { chave: 'c|story|A1|curta|minimal-fb-centro-optico', cliente: 'c', formato: 'story', foto: 'A1', copy: 'curta', arquetipo: 'minimal-fb-centro-optico' }, compor: { desfecho: 'composta', ms: 1 }, ciclos: 0, draft: 'criado', juizes: [], oclusaoProduzida: [], renders: {}, ms: {}, estabilidade: { excecoes: [], naoMedida: false, semVinculo: false, timeout: false }, gateV1: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] }, gateFinal: { tipo: 'medida', resultado: 'APTO', motivos: [], naoMedidos: [] }, repeticao: { igual: true, diferencas: [] } })
    const h = [{ ...base(), cenarioH: { corte: 'a → b', tipo: 'reestimada-com-assunto' as const, revisorRecusou: true, produtorRecusou: false, aoHumano: false, codigoDoProdutor: 'criado' } }]
    expect(violacoesDoPiloto(agregar(h, 1), h, { oficial: false })).toContainEqual(expect.stringMatching(/cenário H: 1 peça\(s\) com a anotação perdida que NÃO foram ao humano/))
    const par = [{ ...base(), assunto: { estimado: null, catalogo: rect, verdade: rect, origemNaPeca: 'catalogo' as const, par: { sha256DaFoto: 'abc', dimensoes: '1080x1920', corteComCatalogo: 'center-middle', corteSemCatalogo: 'left-top', mesmoCorte: false } } }]
    expect(violacoesDoPiloto(agregar(par, 1), par, { oficial: false })).toContainEqual(expect.stringMatching(/corte divergente em 1/))
    // Decisão 1 só agrega pares com mesmoCorte === true; `null` (corte desconhecido) e `false` ficam de fora.
    const desconhecido = [{ ...base(), assunto: { estimado: rect, catalogo: rect, verdade: rect, origemNaPeca: 'estimado' as const, par: { sha256DaFoto: 'abc', dimensoes: '1080x1920', corteComCatalogo: null, corteSemCatalogo: null, mesmoCorte: null } } }]
    expect(agregar(desconhecido, 1).decisao1.fotos).toBe(0)
    // Os denominadores: par com estimado nulo conta em `estimadoSemCaixa` e não entra no IoU com estimado.
    const semCaixa = [{ ...base(), assunto: { estimado: null, estimadoPor: 'harness-mesmo-corte' as const, catalogo: rect, verdade: rect, origemNaPeca: 'catalogo' as const, par: { sha256DaFoto: 'abc', dimensoes: '1080x1920', corteComCatalogo: 'center-middle', corteSemCatalogo: 'center-middle', mesmoCorte: true } } }]
    const d1 = agregar(semCaixa, 1)
    expect(d1.decisao1).toMatchObject({ fotos: 1, estimadoLocalizado: 0, estimadoSemCaixa: 1, iouEstimadoCatalogo: null, iouCatalogoVerdade: 1 })
    expect(d1.par.estimadoPor).toEqual({ 'harness-mesmo-corte (sem caixa)': 1 })
    const resumo = agregar([{ ...base(), anotacao: ok }], 1)
    expect(resumo.anotacao).toMatchObject({ casoA: 1, preservadas: 1 })
    expect(paraMarkdown(resumo, { data: 'd', head: 'h', loteId: 'l', ambiente: 'a', rodada: 'r', hashRelatorio: 'x', limites: [] })).toMatch(/9b\. Anotação do assunto.*caso A: 1 peças; preservada[^:]*: 1/)
  })
})
