/**
 * CP1 (13/10/2026) — o revisor diz a verdade sobre a força e sobre a piora:
 * - TETO/PISO: na peça piloto ele dizia "já está no teto da marca (0.45)",
 *   e 0.45 era o PISO; a mensagem agora dá força, mínimo, máximo e a margem;
 * - TRATAMENTO_PIOROU_LEITURA: achado medido, `problema`, que a visão não rebaixa.
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import { TOLERANCIA_DE_PIORA, TRATAMENTO_PIOROU_LEITURA, type ContrasteMedido, type PioraDeTratamento } from '@/lib/compositor/regua'
import { avaliarPeca, diagnosticoDaForca, type EntradaDaRevisao } from '../regras'

const W = 1080
const H = 1920
const FAIXA: [number, number] = [0.45, 0.9]

const servico = {
  id: 'servico',
  name: 'servico',
  type: 'text',
  visible: true,
  locked: false,
  order: 3,
  content: 'Seg a sex · 12h às 22h',
  position: { x: 330, y: 1728 },
  size: { width: 421, height: 92 },
  style: { fontSize: 32, lineHeight: 1.25, textAlign: 'center', color: '#F6F0E4' },
  metadata: { compositor: { papel: 'servico' } },
} as Layer

const veu = (cor: string, forca: number) =>
  ({
    id: 'gradiente-leitura-rodape',
    name: 'gradiente',
    type: 'gradient',
    visible: true,
    locked: false,
    order: 1,
    position: { x: 0, y: 1344 },
    size: { width: W, height: 576 },
    style: { gradientStops: [{ id: '0', position: 0, color: cor, opacity: forca }] },
    metadata: { tratamentoDeTexto: 'gradiente-de-leitura', borda: 'rodape', forca },
  }) as Layer

const metrica = (l: Layer): TextLayerMetrics => ({
  layerId: l.id,
  name: l.name,
  box: { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height },
  realHeight: l.size.height,
  maxLineWidth: 400,
  lineCount: 1,
  glyphTop: l.position.y + 6,
  glyphBottom: l.position.y + l.size.height - 6,
  fontSize: 32,
  lineBox: 40,
  autoExpand: true,
})

const entrada = (parcial: Partial<EntradaDaRevisao>): EntradaDaRevisao => ({
  canvas: { width: W, height: H },
  formato: 'story',
  camadas: [],
  metricas: [],
  geometria: [],
  contraste: [],
  faixaDoGradiente: FAIXA,
  referencias: {},
  assunto: null,
  fontesAusentes: [],
  medidasAproximadas: [],
  ...parcial,
})

/** O serviço da piloto: texto creme, p98 166 sem véu → 194 com o véu creme, alvo 139; a régua não acha força que feche. */
const semLeitura = (tinta: number): ContrasteMedido => ({
  grupo: 'grupo-servico',
  camadas: ['servico'],
  sentido: 'claro',
  alvo: 139,
  p98SemHalo: 166,
  p98ComHalo: 194,
  tinta,
  tintaCorrigida: null,
  gradiente: 'gradiente-leitura-rodape',
  ok: false,
  textos: [{ camada: 'servico', sentido: 'claro', alvo: 139, p98SemHalo: 166, p98ComHalo: 194, ok: false, cor: '#F6F0E4', percentis: { sem: { p02: 60, p98: 166 }, com: { p02: 90, p98: 194 } } }],
})

const observacaoDaLeitura = (tinta: number, corDoVeu = '#F3EADC') => {
  const r = avaliarPeca(entrada({ camadas: [veu(corDoVeu, tinta), servico], metricas: [metrica(servico)], contraste: [semLeitura(tinta)] }))
  return r.achados.find((a) => a.regra === 'texto-sem-leitura')!
}

describe('diagnosticoDaForca — a posição REAL da força na faixa da marca', () => {
  it('posição e margem saem da MESMA diferença real (3 casas, a precisão gravada); fora da faixa, a posição diz que está fora', () => {
    expect(diagnosticoDaForca(0.454, [0.45, 0.75])).toMatchObject({ posicao: 'entre', margemParaDiminuir: 0.004 })
    expect(diagnosticoDaForca(0.746, [0.45, 0.75])).toMatchObject({ posicao: 'entre', margemParaAumentar: 0.004 })
    expect(diagnosticoDaForca(0.45000000001, [0.45, 0.75])).toMatchObject({ posicao: 'piso', margemParaDiminuir: 0 })
    expect(diagnosticoDaForca(0.95, FAIXA)).toMatchObject({ posicao: 'acima-do-teto', margemParaAumentar: 0, margemParaDiminuir: 0.5 })
    expect(diagnosticoDaForca(0.2, FAIXA)).toMatchObject({ posicao: 'abaixo-do-piso', margemParaAumentar: 0.7, margemParaDiminuir: 0 })
  })

  it('exatamente no piso: PISO, margem para aumentar, nenhuma para diminuir', () => {
    expect(diagnosticoDaForca(0.45, FAIXA)).toEqual({ posicao: 'piso', forca: 0.45, minima: 0.45, maxima: 0.9, margemParaAumentar: 0.45, margemParaDiminuir: 0 })
  })

  it('exatamente no teto: TETO, nenhuma margem para aumentar', () => {
    expect(diagnosticoDaForca(0.9, FAIXA)).toEqual({ posicao: 'teto', forca: 0.9, minima: 0.45, maxima: 0.9, margemParaAumentar: 0, margemParaDiminuir: 0.45 })
  })

  it('entre o piso e o teto: margem para os dois lados', () => {
    expect(diagnosticoDaForca(0.6, FAIXA)).toEqual({ posicao: 'entre', forca: 0.6, minima: 0.45, maxima: 0.9, margemParaAumentar: 0.3, margemParaDiminuir: 0.15 })
  })

  it('faixa degenerada (mínimo = máximo) conta como teto: não há margem', () => {
    expect(diagnosticoDaForca(0.5, [0.5, 0.5])).toMatchObject({ posicao: 'teto', margemParaAumentar: 0, margemParaDiminuir: 0 })
  })
})

describe('a observação do achado de leitura quando a régua não acha força que feche', () => {
  it('no PISO (a peça piloto): nunca diz "teto"; diz piso, faixa, margem e que o véu creme é mais claro que o fundo', () => {
    const a = observacaoDaLeitura(0.45)
    expect(a.observacao).not.toMatch(/teto/i)
    expect(a.observacao).toMatch(/está no PISO da faixa da marca \(força 0\.45; faixa da marca 0\.45–0\.9\): há margem para aumentar até 0\.9; não há margem para diminuir\./)
    expect(a.observacao).toMatch(/Mais força não resolve: o véu \(#F3EADC, luz 235\) é mais claro que o fundo sob o texto \(p98 sem véu 166\)/)
    expect(a.evidencia).toMatchObject({ forcaAtual: 0.45, forcaMinima: 0.45, forcaMaxima: 0.9, posicaoDaForca: 'piso' })
  })

  it('no TETO: diz teto e que não há margem para aumentar', () => {
    const a = observacaoDaLeitura(0.9)
    expect(a.observacao).toMatch(/está no TETO da faixa da marca \(força 0\.9; faixa da marca 0\.45–0\.9\): não há margem para aumentar; há margem para diminuir até 0\.45\./)
    expect(a.evidencia).toMatchObject({ posicaoDaForca: 'teto' })
  })

  it('com proposta que não fecha a leitura: diz a posição REAL da força proposta e a margem, nunca "teto" abaixo do teto', () => {
    const r = avaliarPeca(entrada({ camadas: [veu('#1A1A1A', 0.5), servico], metricas: [metrica(servico)], contraste: [{ ...semLeitura(0.5), tintaCorrigida: 0.7 }] }))
    const a = r.achados.find((x) => x.regra === 'texto-sem-leitura')!
    expect(a.observacao).toMatch(/Mesmo com a força proposta \(0\.7\) a leitura não fecha/)
    expect(a.observacao).toMatch(/Com a proposta, o gradiente do rodapé fica entre o piso e o teto da faixa da marca \(força 0\.7; faixa da marca 0\.45–0\.9\): há margem para aumentar até 0\.9/)
    expect(a.observacao).not.toMatch(/teto da marca:/)
  })

  it('ENTRE piso e teto, com véu escuro (não é a polaridade): diz entre, as margens, e não culpa a cor do véu', () => {
    const a = observacaoDaLeitura(0.6, '#1A1A1A')
    expect(a.observacao).toMatch(/está entre o piso e o teto da faixa da marca \(força 0\.6; faixa da marca 0\.45–0\.9\): há margem para aumentar até 0\.9; há margem para diminuir até 0\.45\./)
    expect(a.observacao).toMatch(/Mesmo assim a régua não acha força deste véu que feche a leitura/)
    expect(a.observacao).not.toMatch(/mais claro que o fundo/)
  })
})

describe('TRATAMENTO_PIOROU_LEITURA no revisor', () => {
  const piora: PioraDeTratamento = {
    codigo: TRATAMENTO_PIOROU_LEITURA,
    grupo: 'grupo-servico',
    camada: 'servico',
    camadas: ['servico'],
    gradiente: 'gradiente-leitura-rodape',
    gradientes: ['gradiente-leitura-rodape'],
    polaridade: 'clara',
    polaridadePor: 'fundo',
    percentil: 'p98',
    antes: 166,
    depois: 194,
    tolerancia: TOLERANCIA_DE_PIORA,
    luzDoTexto: 240,
  }
  const base = { camadas: [veu('#F3EADC', 0.45), servico], metricas: [metrica(servico)], contraste: [semLeitura(0.45)], pioras: [piora] }

  it('vira achado `problema` medido, com grupo, camada, polaridade, antes/depois e o código — sem ajuste', () => {
    const r = avaliarPeca(entrada(base))
    const a = r.achados.find((x) => x.regra === 'tratamento-piorou-leitura')!
    expect(a).toMatchObject({ severidade: 'problema', certeza: 'medida', camadas: ['servico'], ajustes: [] })
    expect(a.evidencia).toMatchObject({ codigo: 'TRATAMENTO_PIOROU_LEITURA', grupo: 'grupo-servico', polaridade: 'clara', percentil: 'p98', antes: 166, depois: 194, tolerancia: TOLERANCIA_DE_PIORA })
    expect(a.mensagem).toMatch(/PIOROU "servico": com ele, o p98 do fundo sob o texto claro SUBIU de 166 para 194/)
    expect(r.cobertura['tratamento-piorou-leitura']?.estado).toBe('avaliada')
  })

  it('topo e rodapé sobrepostos sob o texto: a piora é do CONJUNTO — não aponta um gradiente só', () => {
    const doConjunto = { ...piora, gradiente: null, gradientes: ['gradiente-leitura-topo', 'gradiente-leitura-rodape'] }
    const a = avaliarPeca(entrada({ ...base, pioras: [doConjunto] })).achados.find((x) => x.regra === 'tratamento-piorou-leitura')!
    expect(a.mensagem).toMatch(/Os tratamentos de leitura \(gradiente-leitura-topo, gradiente-leitura-rodape\) PIORARAM "servico"/)
    expect(a.evidencia).toMatchObject({ gradiente: null, gradientes: 'gradiente-leitura-topo, gradiente-leitura-rodape' })
  })

  it('a VISÃO não o rebaixa: com a visão vazia e conclusiva, o "sem leitura" desce a sugestão e a piora continua problema', () => {
    const r = avaliarPeca(entrada({ ...base, vistos: [], visaoConclusiva: true }))
    expect(r.achados.find((x) => x.regra === 'texto-sem-leitura')!.severidade).toBe('sugestao')
    expect(r.achados.find((x) => x.regra === 'tratamento-piorou-leitura')!.severidade).toBe('problema')
  })

  it('sem a régua (contraste null e pioras null): a regra sai "não avaliada", nunca positiva', () => {
    const r = avaliarPeca(entrada({ camadas: [servico], metricas: [metrica(servico)], contraste: null, pioras: null }))
    expect(r.cobertura['tratamento-piorou-leitura']).toMatchObject({ estado: 'nao-avaliada' })
    expect(r.achados.some((x) => x.regra === 'tratamento-piorou-leitura')).toBe(false)
  })

  it('sem `pioras` na entrada, ela sai da própria medida (os dois percentis de cada texto)', () => {
    const r = avaliarPeca(entrada({ camadas: [veu('#F3EADC', 0.45), servico], metricas: [metrica(servico)], contraste: [semLeitura(0.45)] }))
    expect(r.achados.find((x) => x.regra === 'tratamento-piorou-leitura')?.evidencia).toMatchObject({ antes: 166, depois: 194, polaridade: 'clara' })
  })

  it('o que a regra não julga fica na cobertura como "parcial", nunca lido como "sem piora"', () => {
    const { textos: _textos, ...medidaAntiga } = semLeitura(0.45)
    const antiga = avaliarPeca(entrada({ camadas: [veu('#F3EADC', 0.45), servico], metricas: [metrica(servico)], contraste: [medidaAntiga] }))
    expect(antiga.cobertura['tratamento-piorou-leitura']).toMatchObject({ estado: 'parcial', motivo: expect.stringMatching(/servico/) })

    const aMao = { ...veu('#F3EADC', 0.45), id: 'gradiente-a-mao', metadata: {} } as Layer
    const r = avaliarPeca(entrada({ camadas: [aMao, servico], metricas: [metrica(servico)], contraste: [{ ...semLeitura(0.45), gradiente: null }], pioras: [] }))
    expect(r.cobertura['tratamento-piorou-leitura']).toMatchObject({ estado: 'parcial', motivo: expect.stringMatching(/desenhado à mão/) })
  })

  it('a proposta que REFORÇA o gradiente que piorou a leitura sai com o aviso — a proposta não some (a correção é de outro checkpoint)', () => {
    const corrigivel: ContrasteMedido = { ...semLeitura(0.45), tintaCorrigida: 0.9 }
    const r = avaliarPeca(entrada({ ...base, contraste: [corrigivel] }))
    const a = r.achados.find((x) => x.regra === 'texto-sem-leitura')!
    expect(a.ajustes.map((i) => r.ajustes[i])).toEqual([expect.objectContaining({ tipo: 'gradiente', camadas: ['gradiente-leitura-rodape'], forca: 0.9 })])
    expect(a.observacao).toMatch(/este gradiente PIOROU a leitura deste texto \(TRATAMENTO_PIOROU_LEITURA, medido\)/)
  })
})
