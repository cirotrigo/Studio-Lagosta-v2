/**
 * #5 `minimal-fb-topo-centro@1` (24/10/2026) — a PÍLULA DE CONTORNO no módulo puro: o tipo envolvente no contrato e no
 * validador, a definição contra o cálculo puro do preflight (`cp-t4-a-5-preflight/evidencias/geometria-5.txt`), a receita
 * e a leitura da receita gravada (o raio transportado), a medida pela caixa real do serviço, o INTERIOR CURVO (o
 * contraexemplo da revisão recusa; o traço do asset cabe em toda a capacidade), a ocupação para os outros, a área segura,
 * a forma, a coerência receita × elemento ANTES do lookup, o envoltório na zona e na faixa, e a guarda do replay. Puro: sem
 * banco, sem render, sem medidor (as caixas do serviço são a estimativa do preflight; a medida real é das provas do
 * compositor).
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import {
  cabeNoInteriorDaPilula,
  camadaDoAcento,
  envoltoriosDoArquetipo,
  incoerenciaDosEnvolventesCongelados,
  lerAcentosGravados,
  obstaculosDosAcentos,
  ocupacaoDoAcento,
  posicionarAcentos,
  receitasDoArquetipo,
  type ReceitaDoAcento,
} from '../acentos'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { candidatosDasFaixas, faixasDoArquetipo, partidaNoArquetipo } from '../candidatos-espaciais'
import { impressaoDoArquetipo } from '../impressao'
import { materializarArquetipo, zonaEfetiva, type RetanguloPx } from '../materializar'
import { vitrineDeArquetipos } from '../na-spec'
import type { UnidadeDoArquetipo } from '../no-compositor'
import { ELEMENTOS_DO_ARQUETIPO, ELEMENTOS_QUE_ENVOLVEM, type ArquetipoDeLayout, type FormatoDoArquetipo } from '../tipos'
import { CODIGOS_DO_ARQUETIPO, validarArquetipo, validarCatalogo } from '../validar'

const ID = 'minimal-fb-topo-centro'
const IMPRESSAO = 'arq1-023d4c649e2482'
const def = () => verArquetipo(ID, 1)!
const copia = (): any => JSON.parse(JSON.stringify(def()))
const CANVAS = DIMENSOES as Record<FormatoDoArquetipo, { width: number; height: number }>
const piso = (f: FormatoDoArquetipo) => NUMEROS_PADRAO.geometria[f]
const problemas = (a: unknown) => validarArquetipo(a as ArquetipoDeLayout).map((p) => `${p.codigo} ${p.campo}`)
/** A folga do preflight (D2): 32 × 19 px no Story, 32 × 16 no Feed. */
const FOLGA = { story: { x: 32, y: 19 }, feed: { x: 32, y: 16 } } as const
/** A altura estimada da caixa do serviço (preflight §5: ⌈corpo × 1,2⌉ + 15); a medida real é das provas do compositor. */
const alturaDaCaixa = (corpo: number) => Math.ceil(corpo * 1.2) + 15
const receitaDaPilula = (): ReceitaDoAcento => receitasDoArquetipo(def(), { formato: 'story', canvas: CANVAS.story }).receitas[0]
const congelada = (extra: Record<string, unknown> = {}, desenho: Record<string, unknown> = {}) => {
  const r = receitaDaPilula()
  return { ...r, cor: '#f5f1e8', fonteDaCor: 'texto-do-papel', ...extra, desenho: { ...r.desenho, ...desenho } }
}

/** O serviço centrado na referência (o y da referência arredondado, como a materialização), com a largura `w` e a altura `h`. */
function servicoNaReferencia(f: FormatoDoArquetipo, w: number, h: number, dy = 0): RetanguloPx {
  const R = (def().formatos[f].papeis.servico as { referencia: { x: number; y: number; w: number } }).referencia
  const { width: W, height: H } = CANVAS[f]
  return { x: Math.round(R.x * W + (R.w * W - w) / 2), y: Math.round(R.y * H) + dy, width: w, height: h }
}

function posicionar(f: FormatoDoArquetipo, servico: RetanguloPx | null, extras: Array<{ id: string; rect: RetanguloPx }> = [], receitas: ReceitaDoAcento[] = receitasDoArquetipo(def(), { formato: f, canvas: CANVAS[f] }).receitas, opcoes: { arquetipo?: ArquetipoDeLayout; geometria?: { margemH: number; safeTopo: number; safeRodape: number } } = {}) {
  return posicionarAcentos({
    arquetipo: opcoes.arquetipo ?? def(),
    formato: f,
    canvas: CANVAS[f],
    geometria: opcoes.geometria ?? piso(f),
    receitas,
    papeis: servico ? { servico: { posicao: servico } } : {},
    obstaculos: [...(servico ? [{ id: 'servico', rect: servico }] : []), ...extras],
  })
}

describe('#5 · o tipo envolvente no contrato (C-01, C-02, C-12)', () => {
  it('C-01: o vocabulário são os 4 de antes + a pílula, nessa ordem; só a pílula envolve', () => {
    expect([...ELEMENTOS_DO_ARQUETIPO]).toEqual(['fio-fino', 'moldura-aberta', 'spark-4', 'cantoneiras', 'pilula-contorno'])
    expect([...ELEMENTOS_QUE_ENVOLVEM]).toEqual(['pilula-contorno'])
  })

  it('C-02: nenhuma chave nova no contrato (uma "folga" no elemento é recusada, não lida)', () => {
    const c = copia()
    c.elementos[0].folga = 32
    expect(problemas(c)).toContain('CAMPO_DESCONHECIDO elementos[0].folga')
  })

  it('C-12: nenhum código novo no validador', () => {
    expect([...CODIGOS_DO_ARQUETIPO]).toEqual([
      'ID_INVALIDO', 'ID_DUPLICADO', 'VERSAO_INVALIDA', 'FORMATO_AUSENTE', 'FORMATO_DESCONHECIDO', 'COORDENADA_FORA', 'TAMANHO_INVALIDO',
      'ZONA_INVERTIDA', 'REFERENCIA_FORA_DA_ZONA', 'FORA_DA_AREA_SEGURA', 'AREA_SEGURA_IMPOSSIVEL', 'SEM_HEADLINE', 'PAPEL_DUPLICADO',
      'PAPEL_FORA_DO_CONTRATO', 'POSICAO_AUSENTE', 'ELEMENTO_DESCONHECIDO', 'PREFERENCIA_INCOERENTE', 'CAMPO_PROIBIDO', 'CAMPO_DESCONHECIDO',
      'CAMPO_INVALIDO', 'ZONA_SOBRE_A_FOTO',
    ])
  })
})

describe('#5 · o validador conhece o envolvente (C-03 a C-11)', () => {
  it('C-03: presoA logo, ausente ou papel não declarado', () => {
    const logo = copia()
    logo.elementos[0].presoA = 'logo'
    expect(problemas(logo)).toContain('CAMPO_INVALIDO elementos[0].presoA')
    const sem = copia()
    delete sem.elementos[0].presoA
    expect(problemas(sem)).toContain('CAMPO_INVALIDO elementos[0].presoA')
    const pre = copia()
    pre.elementos[0].presoA = 'pre'
    expect(problemas(pre)).toContain('PAPEL_FORA_DO_CONTRATO elementos[0].presoA')
  })

  it('C-04: preso a um papel de lista', () => {
    const c = copia()
    c.papeis.find((p: any) => p.papel === 'apoio').lista = true
    for (const f of ['story', 'feed']) c.formatos[f].itens = { apoio: { vao: 0.05 } }
    c.elementos[0].presoA = 'apoio'
    expect(problemas(c)).toContain('CAMPO_INVALIDO elementos[0].presoA')
  })

  it('C-05: dois envolventes no mesmo papel', () => {
    const c = copia()
    c.elementos.push({ ...c.elementos[0], id: 'pilula-2' })
    for (const f of ['story', 'feed']) c.formatos[f].elementos['pilula-2'] = { ...c.formatos[f].elementos.pilula }
    expect(problemas(c)).toContain('CAMPO_INVALIDO elementos[1].presoA')
  })

  it('C-06: o papel envolvido tem linhasMax 1 em cada formato', () => {
    const c = copia()
    c.formatos.feed.limitesDeTexto.servico.linhasMax = 2
    expect(problemas(c)).toEqual(['CAMPO_INVALIDO formatos.feed.limitesDeTexto.servico.linhasMax'])
  })

  it('C-07: a caixa E não contém a referência, ou contém com margens assimétricas', () => {
    const fora = copia()
    fora.formatos.story.elementos.pilula = { x: 0.21, y: 0.815, w: 0.58, h: 0.065 }
    expect(problemas(fora)).toContain('PREFERENCIA_INCOERENTE formatos.story.elementos.pilula')
    const torta = copia()
    torta.formatos.feed.elementos.pilula = { x: 0.17, y: 0.818, w: 0.67, h: 0.084 }
    expect(problemas(torta)).toEqual(['PREFERENCIA_INCOERENTE formatos.feed.elementos.pilula'])
  })

  it('C-08: a folga em px fica abaixo de 8 (x ou y)', () => {
    const y = copia()
    y.formatos.story.elementos.pilula = { x: 0.17, y: 0.822, w: 0.66, h: 0.051 }
    expect(problemas(y)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.elementos.pilula'])
    const x = copia()
    x.formatos.feed.elementos.pilula = { x: 0.195, y: 0.818, w: 0.61, h: 0.084 }
    expect(problemas(x)).toEqual(['PREFERENCIA_INCOERENTE formatos.feed.elementos.pilula'])
  })

  it('C-09: E fora da zona do serviço', () => {
    const c = copia()
    c.formatos.story.elementos.pilula = { x: 0.14, y: 0.815, w: 0.72, h: 0.065 }
    expect(problemas(c)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.elementos.pilula'])
  })

  it('C-10: canto, porItem e braço na pílula seguem recusados pelas regras de hoje', () => {
    for (const [campo, valor] of [['canto', 'superior-esquerdo'], ['porItem', true], ['braco', 0.1]] as const) {
      const c = copia()
      c.elementos[0][campo] = valor
      expect(problemas(c), campo).toContain(`CAMPO_INVALIDO elementos[0].${campo}`)
    }
  })

  it('C-11 / G-01: o catálogo inteiro valida; o #5 sem problema; as 9 versões anteriores sem problema novo', () => {
    expect(validarCatalogo(listarArquetipos())).toEqual([])
    expect(validarArquetipo(def())).toEqual([])
  })
})

describe('#5 · definição e geometria (G-02 a G-07, G-09)', () => {
  it('G-03/G-04: papéis, ordem, elemento, preferências e limites', () => {
    const a = def()
    expect([a.id, a.versao, a.codigoTaxonomico, 'fundo' in a]).toEqual([ID, 1, 'MIN-01', false])
    expect(a.papeis.map((p) => [p.papel, p.obrigatorio, p.ordemDeLeitura])).toEqual([
      ['headline', true, 0],
      ['apoio', false, 1],
      ['servico', true, 2],
      ['logo', true, 3],
    ])
    expect(a.elementos).toEqual([{ id: 'pilula', tipo: 'pilula-contorno', opcional: false, corPorPapel: 'texto', presoA: 'servico' }])
    expect(a.preferencias).toEqual({ ancora: 'topo', alinha: 'centro', cantoDaMarca: 'superior-centro' })
    for (const f of ['story', 'feed'] as const) {
      expect('automatica' in a.formatos[f].papeis.logo!).toBe(false)
      expect(a.formatos[f].limitesDeTexto).toEqual({ headline: { linhasMax: 2, caracteresPorLinha: 16 }, apoio: { linhasMax: 2, caracteresPorLinha: 28 }, servico: { linhasMax: 1, caracteresPorLinha: 30 } })
    }
  })

  it('G-02: referências e zonas efetivas em px = geometria-5.txt (±0,5); a manchete do Feed desce para .16 (desvio da execução, G-10)', () => {
    const esperado = {
      story: {
        logo: [442.8, 637.2, 201.6, 268.8, 324, 756, 188.16, 326.4],
        headline: [129.6, 950.4, 297.6, 528, 108, 972, 288, 576],
        apoio: [216, 864, 556.8, 672, 162, 918, 518.4, 768],
        servico: [216, 864, 1584, 1670.4, 162, 918, 1516.8, 1695.36],
      },
      feed: {
        logo: [442.8, 637.2, 141.75, 189, 324, 756, 120.15, 229.5],
        headline: [129.6, 950.4, 216, 378, 108, 972, 202.5, 432],
        apoio: [216, 864, 405, 499.5, 162, 918, 378, 567],
        servico: [216, 864, 1120.5, 1201.5, 162, 918, 1053, 1244.7],
      },
    } as const
    for (const f of ['story', 'feed'] as const) {
      const { width: W, height: H } = CANVAS[f]
      for (const [papel, v] of Object.entries(esperado[f])) {
        const p = (def().formatos[f].papeis as any)[papel]
        const z = zonaEfetiva(p.zona, CANVAS[f], piso(f))!
        const obtido = [p.referencia.x * W, (p.referencia.x + p.referencia.w) * W, p.referencia.y * H, (p.referencia.y + p.referencia.h) * H, z.x, z.x + z.width, z.y, z.y + z.height]
        obtido.forEach((n, i) => expect(Math.abs(n - v[i]), `${f} ${papel} [${i}] ${n} × ${v[i]}`).toBeLessThanOrEqual(0.5))
      }
    }
    // A caixa E da pílula: 183,6–896,4 × 1564,8–1689,6 (Story) e × 1104,3–1217,7 (Feed).
    const E = (f: FormatoDoArquetipo) => def().formatos[f].elementos!.pilula
    expect([E('story').x * 1080, (E('story').x + E('story').w) * 1080, E('story').y * 1920, (E('story').y + E('story').h) * 1920].map((n) => Math.round(n * 10) / 10)).toEqual([183.6, 896.4, 1564.8, 1689.6])
    expect([E('feed').y * 1350, (E('feed').y + E('feed').h) * 1350].map((n) => Math.round(n * 10) / 10)).toEqual([1104.3, 1217.7])
  })

  it('G-10: a logo de referência fica ≥ 24 px acima da manchete nos dois formatos (a folga do CP3, `intersecta`), em qualquer proporção da logo', () => {
    for (const f of ['story', 'feed'] as const) {
      const { height: H } = CANVAS[f]
      const p = def().formatos[f].papeis as any
      // A logo em contain fica centrada na altura da referência: o pé dela nunca passa do pé da referência.
      const peDaLogo = Math.round(p.logo.referencia.y * H) + Math.round(p.logo.referencia.h * H)
      const topoDaManchete = Math.round(p.headline.referencia.y * H)
      expect(topoDaManchete - peDaLogo, f).toBeGreaterThanOrEqual(24)
    }
  })

  it('G-05: duas faixas por formato — [manchete, apoio, logo] e [serviço]', () => {
    for (const f of ['story', 'feed'] as const) expect(faixasDoArquetipo(def(), f)).toEqual([['headline', 'apoio', 'logo'], ['servico']])
  })

  it('G-06/G-07: impressão própria travada; 9 ids / 10 versões, o #5 entre o centro óptico e o topo-esquerda', () => {
    expect(impressaoDoArquetipo(def())).toBe(IMPRESSAO)
    expect(verArquetipo(ID)!.versao).toBe(1)
    const ids = [...new Set(listarArquetipos().map((a) => a.id))]
    expect(ids.slice(ids.indexOf('minimal-fb-centro-optico'), ids.indexOf('minimal-fb-topo-esquerda') + 1)).toEqual(['minimal-fb-centro-optico', ID, 'minimal-fb-topo-esquerda'])
    // H9: o #9@1 publicado → 10 ids, 11 versões; IH #10: os 2 da coluna → 12 / 13 (o recorte acima não muda).
    expect([ids.length, listarArquetipos().length]).toEqual([12, 13])
  })

  it('G-09: Story e Feed são definições próprias, no mesmo eixo e na mesma ordem', () => {
    const a = def()
    expect(a.formatos.story).not.toEqual(a.formatos.feed)
    for (const f of ['story', 'feed'] as const) {
      for (const [papel, p] of Object.entries(a.formatos[f].papeis) as Array<[string, any]>) expect(Math.abs(p.referencia.x + p.referencia.w / 2 - 0.5), `${f} ${papel}`).toBeLessThan(1e-9)
      const y = (papel: string) => (a.formatos[f].papeis as any)[papel].referencia.y
      expect(y('logo') < y('headline') && y('headline') < y('apoio') && y('apoio') < y('servico')).toBe(true)
    }
  })

  it('V-01: a vitrine traz o #5 de foto, disponível, com a pílula presa ao serviço', () => {
    expect(vitrineDeArquetipos().find((a) => a.id === ID)).toMatchObject({
      versao: 1,
      fundo: 'foto',
      disponibilidade: 'disponivel',
      elementos: [{ id: 'pilula', tipo: 'pilula-contorno', opcional: false, corPorPapel: 'texto', presoA: 'servico' }],
    })
  })
})

describe('#5 · a receita e o envoltório (P-01 a P-03)', () => {
  it('P-01: retângulo arredondado, traço 2, raio 9999, contorno, asset pilula-contorno@1, livre, preso ao serviço', () => {
    expect(receitasDoArquetipo(def())).toEqual({
      semReceita: [],
      receitas: [{ elemento: 'pilula', tipo: 'pilula-contorno', presoA: 'servico', corPorPapel: 'texto', canal: 'contorno', asset: { id: 'pilula-contorno', versao: 1 }, desenho: { shapeType: 'rounded-rectangle', strokeWidth: 2, raio: 9999, ajuste: 'livre' } }],
    })
  })

  it('P-02: o retângulo arredondado só para o tipo pilula-contorno (o fio declarado com o desenho dele continua linha)', () => {
    for (const a of listarArquetipos().filter((x) => x.id !== ID)) {
      for (const r of receitasDoArquetipo(a).receitas) expect(r.desenho.shapeType, `${a.id} ${r.elemento}`).not.toBe('rounded-rectangle')
    }
  })

  it('P-03: a folga é da definição — {servico: 32×19} no Story, {32×16} no Feed; {} nos 9 anteriores', () => {
    expect(envoltoriosDoArquetipo(def(), 'story', CANVAS.story)).toEqual({ servico: FOLGA.story })
    expect(envoltoriosDoArquetipo(def(), 'feed', CANVAS.feed)).toEqual({ servico: FOLGA.feed })
    for (const a of listarArquetipos().filter((x) => x.id !== ID)) {
      for (const f of ['story', 'feed'] as const) expect(envoltoriosDoArquetipo(a, f, CANVAS[f]), `${a.id}@${a.versao} ${f}`).toEqual({})
    }
  })
})

describe('#5 · a medida pela caixa do serviço (P-04, P-08, P-09, P-13)', () => {
  // Preflight §5: corpo 30/40/56 no Story e 26,25/35/49 no Feed; larguras da caixa = tinta + 2 × 6 + 2.
  const casos = {
    story: [
      [30, 74, 136, 87],
      [30, 328, 390, 87],
      [30, 648, 710, 87],
      [56, 648, 710, 119],
    ],
    feed: [
      [26.25, 67, 129, 77],
      [26.25, 289, 351, 77],
      [26.25, 648, 710, 77],
      [49, 648, 710, 104],
    ],
  } as const
  for (const f of ['story', 'feed'] as const) {
    it(`P-04 ${f}: O = T ⊕ folga e L = O ⊖ 1, em inteiros, nos casos curto/médio/longo/corpo grande; o serviço centrado`, () => {
      for (const [corpo, w, Lw, Lh] of casos[f]) {
        const T = servicoNaReferencia(f, w, alturaDaCaixa(corpo))
        const { acentos, recusas, omitidos } = posicionar(f, T)
        expect([recusas, omitidos]).toEqual([[], []])
        const L = acentos[0].rect
        expect([L.width, L.height], `${f} ${corpo} ${w}`).toEqual([Lw, Lh])
        expect([L.x, L.y]).toEqual([T.x - FOLGA[f].x + 1, T.y - FOLGA[f].y + 1])
        expect(Math.abs(L.x + L.width / 2 - (T.x + T.width / 2))).toBeLessThanOrEqual(0.5)
        expect(Object.values(L).every(Number.isInteger)).toBe(true)
      }
    })
  }

  it('P-08: serviço curto demais (L.w < L.h) recusa com o motivo, nunca pílula vertical', () => {
    const r = posicionar('story', servicoNaReferencia('story', 40, alturaDaCaixa(56)))
    expect(r.acentos).toEqual([])
    expect(r.recusas).toEqual([{ elemento: 'pilula', tipo: 'pilula-contorno', opcional: false, rect: expect.objectContaining({ width: 102, height: 119 }), motivo: expect.stringMatching(/curto demais para a cápsula horizontal/) }])
  })

  it('P-09 / P-15 (puro): com traço 2 os quatro cantos do serviço ficam ≥ 1 px dentro da borda interna curva — sobras do preflight', () => {
    const sobra = (f: FormatoDoArquetipo, corpo: number, w: number) => {
      const T = servicoNaReferencia(f, w, alturaDaCaixa(corpo))
      const L = posicionar(f, T).acentos[0].rect
      return cabeNoInteriorDaPilula(T, L, 2, 9999).sobra
    }
    // geometria-5.txt: 13,1 / 11,0 / 7,2 (Story, corpos 30/40/56) e 11,8 / 10,4 / 7,5 (Feed).
    for (const [f, corpo, esperado] of [['story', 30, 13.1], ['story', 40, 11.0], ['story', 56, 7.2], ['feed', 26.25, 11.8], ['feed', 35, 10.4], ['feed', 49, 7.5]] as const) {
      for (const w of [94, 328, 648]) expect(Math.abs(sobra(f, corpo, w) - esperado), `${f} ${corpo} ${w}`).toBeLessThanOrEqual(0.05)
    }
  })

  it('P-15 varredura: toda a capacidade do serviço com o traço do asset — sobra mínima 6,6 (Story) / 6,2 (Feed), nunca negativa', () => {
    for (const [f, capacidade, esperado] of [['story', 86, 6.6], ['feed', 81, 6.2]] as const) {
      const { x: FX, y: FY } = FOLGA[f]
      let pior = Infinity
      for (let h = 20; h <= capacidade; h++) {
        for (const w of new Set([Math.max(1, h + 2 * FY - 2 * FX), 200, 648])) {
          const L = { x: -FX + 1, y: -FY + 1, width: w + 2 * FX - 2, height: h + 2 * FY - 2 }
          if (L.width < L.height) continue
          pior = Math.min(pior, cabeNoInteriorDaPilula({ x: 0, y: 0, width: w, height: h }, L, 2, 9999).sobra)
        }
      }
      expect(pior, f).toBeGreaterThanOrEqual(0)
      expect(Math.abs(pior - esperado), f).toBeLessThanOrEqual(0.05)
    }
  })

  it('P-13: sem serviço na peça a pílula falha dita (obrigatória: recusa), nunca pílula vazia', () => {
    const r = posicionar('story', null)
    expect(r.acentos).toEqual([])
    expect(r.recusas).toEqual([expect.objectContaining({ elemento: 'pilula', opcional: false, rect: null, motivo: expect.stringMatching(/que a pílula envolve, não está na peça/) })])
  })
})

describe('#5 · o INTERIOR CURVO (P-07, P-16, P-17, H-01)', () => {
  it('P-16: o contraexemplo da revisão — T 100×80, folga 32×19, traço 16 → L 148×102, raio 51, interno 43; o canto (32,19) recusa', () => {
    // A conta pura: escalar 19 − 8 − 8 = 3 ≥ 1, AABB contida, w ≥ h, T.h 80 ≤ 86 — e mesmo assim o canto invade o arco.
    const T = { x: 32, y: 19, width: 100, height: 80 }
    const L = { x: 8, y: 8, width: 148, height: 102 }
    const r = cabeNoInteriorDaPilula(T, L, 16, 9999)
    expect(r.cabe).toBe(false)
    expect(r.canto).toEqual({ x: 32, y: 19 })
    expect(r.sobra).toBeCloseTo(43 - 1 - Math.sqrt(27 ** 2 + 40 ** 2) + 0, 6)
    // O mesmo T com o traço do asset (2): L 162×116, raio 58 — cabe com 7,7 px.
    expect(cabeNoInteriorDaPilula(T, { x: 1, y: 1, width: 162, height: 116 }, 2, 9999).sobra).toBeCloseTo(7.74, 2)
  })

  it('P-07 / P-16 no posicionamento: a receita CONGELADA com traço 16 recusa pela conferência curva (a escalar e a AABB passariam)', () => {
    const T = { x: 490, y: 1590, width: 100, height: 80 }
    const grossa = { ...receitaDaPilula(), desenho: { ...receitaDaPilula().desenho, strokeWidth: 16 } }
    const r = posicionar('story', T, [], [grossa])
    expect(r.acentos).toEqual([])
    expect(r.recusas).toEqual([
      { elemento: 'pilula', tipo: 'pilula-contorno', opcional: false, rect: { x: 466, y: 1579, width: 148, height: 102 }, motivo: expect.stringMatching(/canto \(490, 1590\) do servico encostaria no contorno arredondado \(sobra -6,3|canto \(490, 1590\) do servico encostaria no contorno arredondado \(sobra -6\.3/) },
    ])
    // O mesmo serviço com o traço do asset pousa.
    expect(posicionar('story', T).acentos).toHaveLength(1)
  })

  it('H-01: só o serviço (e serviço#k) mora no interior; um canto que passa do arco recusa mesmo com o retângulo dentro de L', () => {
    const T = servicoNaReferencia('story', 648, 51)
    const L = posicionar('story', T).acentos[0].rect
    // Uma segunda linha do mesmo papel (`servico#2`) que encosta no canto arredondado: dentro da AABB, fora do arco.
    const r = posicionar('story', T, [{ id: 'servico#2', rect: { x: L.x + 4, y: L.y + 4, width: 30, height: 20 } }])
    expect(r.recusas).toEqual([expect.objectContaining({ motivo: expect.stringMatching(/servico#2 encostaria no contorno arredondado/) })])
  })

  it('P-17: a AABB da pílula vale para os OUTROS — outro texto ou a logo no canto de O, fora do arco, recusa', () => {
    const T = servicoNaReferencia('story', 648, 51)
    const L = posicionar('story', T).acentos[0].rect
    const canto = { x: L.x - 1, y: L.y - 1, width: 6, height: 6 }
    // Fora do arco (o canto do retângulo), mas dentro da AABB O: para a manchete e para a logo é obstáculo.
    expect(cabeNoInteriorDaPilula(canto, L, 2, 9999).cabe).toBe(false)
    for (const id of ['headline', 'logo']) {
      const r = posicionar('story', T, [{ id, rect: canto }])
      expect(r.recusas, id).toEqual([expect.objectContaining({ elemento: 'pilula', motivo: expect.stringMatching(new RegExp(`encosta em ${id}`)) })])
    }
  })
})

describe('#5 · HARD, colisão e área segura (H-02 a H-05)', () => {
  it('H-02: outro texto tocando a borda externa (inclusive no interior) recusa', () => {
    const T = servicoNaReferencia('story', 328, 51)
    const L = posicionar('story', T).acentos[0].rect
    const dentro = { x: T.x + 10, y: T.y + 5, width: 20, height: 10 }
    const naBorda = { x: L.x + L.width / 2, y: L.y - 3, width: 10, height: 4 }
    for (const rect of [dentro, naBorda]) expect(posicionar('story', T, [{ id: 'apoio', rect }]).recusas).toEqual([expect.objectContaining({ motivo: expect.stringMatching(/encosta em apoio/) })])
  })

  it('H-03: a ocupação da pílula é L ⊕ s/2 = O, retângulo cheio; os outros tipos não mudam', () => {
    const r = receitaDaPilula()
    const L = { x: 472, y: 1566, width: 136, height: 87 }
    expect(ocupacaoDoAcento(r, L)).toEqual([{ x: 471, y: 1565, width: 138, height: 89 }])
    expect(ocupacaoDoAcento(r, L, 0)).toEqual([L])
    const fio = receitasDoArquetipo(verArquetipo('minimal-fb-topo-esquerda')!).receitas[0]
    expect(ocupacaoDoAcento(fio, L)).toEqual([L])
  })

  it('H-04: a borda externa fora da área segura do projeto recusa (mais estrito que o retângulo da camada)', () => {
    const T = servicoNaReferencia('story', 328, 51)
    const O = { y: T.y - 19, bottom: T.y + 51 + 19 }
    // Uma área segura do rodapé que corta só o traço de baixo: a camada L ainda caberia, a borda externa não.
    const geometria = { ...piso('story'), safeRodape: 1920 - (O.bottom - 1) }
    const r = posicionar('story', T, [], undefined, { geometria })
    expect(r.recusas).toEqual([expect.objectContaining({ motivo: expect.stringMatching(/sai da área segura do projeto/) })])
  })

  it('H-05: o obstáculo do serviço é a caixa com os ornamentos do arranjo — sem a folga da pílula', () => {
    const p = { x: 216, y: 1584, width: 648, height: 51 }
    expect(obstaculosDosAcentos([{ papel: 'servico', ornamentos: { esquerda: 4, direita: 0, topo: 0, base: 6 } }], { servico: { posicao: p } }, null)).toEqual([{ id: 'servico', rect: { x: 212, y: 1584, width: 652, height: 57 } }])
  })
})

describe('#5 · envoltório na zona e na faixa (B-01 a B-04)', () => {
  const unidade = (papel: 'headline' | 'apoio' | 'servico', w: number, h: number): UnidadeDoArquetipo => ({ papel, blocos: [], pilha: { width: w, height: h, offsets: [0] } as never, ornamentos: { esquerda: 0, direita: 0, topo: 0, base: 0 }, ornamentosPorBloco: [] })
  const unidades = (f: FormatoDoArquetipo, corpo: number) => [unidade('headline', 700, f === 'story' ? 217 : 157), unidade('servico', 648, alturaDaCaixa(corpo))]

  it('B-01: com envoltório, a materialização confere (P ⊕ ornamentos ⊕ folga) na zona, com o motivo da pílula; sem ele, a de sempre', () => {
    const base = { arquetipo: def(), formato: 'story' as const, canvas: CANVAS.story, geometria: piso('story'), medidas: { servico: { width: 648, height: 51 } }, logo: null }
    // dy 45: a caixa (1629–1680) cabe na zona (até 1695,4); a borda externa (até 1699) não.
    expect(materializarArquetipo({ ...base, deslocamentos: { servico: 45 } }).ok).toBe(true)
    const m = materializarArquetipo({ ...base, deslocamentos: { servico: 45 }, envoltorios: { servico: FOLGA.story } })
    expect(m).toEqual({ ok: false, problemas: [expect.objectContaining({ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: 'servico', motivo: expect.stringMatching(/pílula de contorno \(folga 32 × 19 px\)/) })] })
    expect(materializarArquetipo({ ...base, envoltorios: { servico: FOLGA.story } }).ok).toBe(true)
  })

  it('B-02: os 9 anteriores não têm envoltório (a materialização deles não recebe nada a mais)', () => {
    for (const a of listarArquetipos().filter((x) => x.id !== ID)) expect(envoltoriosDoArquetipo(a, 'story', CANVAS.story)).toEqual({})
  })

  it('B-03: o intervalo da faixa do serviço com a folga — Story corpo 30 [−47, 39], Feed 26,25 [−51, 59] (±1 px)', () => {
    for (const [f, corpo, min, max] of [['story', 30, -47, 39], ['feed', 26.25, -51, 59]] as const) {
      const p = partidaNoArquetipo({ arquetipo: def(), formato: f, canvas: CANVAS[f], geometria: piso(f), unidades: unidades(f, corpo), logo: { razao: 0.25 } })
      if ('problemas' in p) throw new Error(JSON.stringify(p.problemas))
      const faixa = p.faixas.find((x) => x.membros.includes('servico'))!
      expect(Math.abs(faixa.intervalo.min - min), `${f} min ${faixa.intervalo.min}`).toBeLessThanOrEqual(1)
      expect(Math.abs(faixa.intervalo.max - max), `${f} max ${faixa.intervalo.max}`).toBeLessThanOrEqual(1)
    }
  })

  it('B-04 / B-05 (puro): sem a folga, o dy máximo poria a borda externa além do HARD; com ela, toda candidata materializa a pílula', () => {
    for (const [f, corpo, hard] of [['story', 30, 1696], ['feed', 26.25, 1246]] as const) {
      const p = partidaNoArquetipo({ arquetipo: def(), formato: f, canvas: CANVAS[f], geometria: piso(f), unidades: unidades(f, corpo), logo: { razao: 0.25 } })
      if ('problemas' in p) throw new Error(JSON.stringify(p.problemas))
      const faixa = p.faixas.find((x) => x.membros.includes('servico'))!
      // Contrafactual: a mesma faixa sem a folga (os ornamentos crus).
      const sem = candidatosDasFaixas({ arquetipo: def(), formato: f, papeis: p.naReferencia.papeis, ornamentos: {} }).find((x) => x.membros.includes('servico'))!
      const T = p.naReferencia.papeis.servico!.posicao
      expect(T.y + sem.intervalo.max + T.height + FOLGA[f].y, `${f} contrafactual`).toBeGreaterThan(hard)
      for (const c of faixa.candidatos) {
        const r = posicionar(f, { ...T, y: T.y + c.dy })
        expect([c.rotulo, r.recusas]).toEqual([c.rotulo, []])
        expect(r.acentos).toHaveLength(1)
      }
    }
  })
})

describe('#5 · a coerência receita × elemento ANTES do lookup (R-14) e a guarda do replay (D7/D11)', () => {
  it('R-14: receita com o mesmo id e tipo presa à MANCHETE recusa antes de ler referência, posição ou obstáculo — sem exceção', () => {
    const errada = { ...receitaDaPilula(), presoA: 'headline' as const }
    // Sem nenhum papel nem obstáculo da manchete: um lookup chegaria a undefined.
    const r = posicionarAcentos({ arquetipo: def(), formato: 'story', canvas: CANVAS.story, geometria: piso('story'), receitas: [errada], papeis: {}, obstaculos: [] })
    expect(r).toEqual({ acentos: [], omitidos: [], avisos: [], recusas: [{ elemento: 'pilula', tipo: 'pilula-contorno', opcional: false, rect: null, motivo: expect.stringMatching(/não é a de um elemento declarado/) }] })
  })

  it('R-14: envoltório ausente (sem a caixa do elemento) ou inválido (folga < 8) recusa, controlado', () => {
    const semCaixa = copia()
    delete semCaixa.formatos.story.elementos
    const T = servicoNaReferencia('story', 328, 51)
    expect(posicionar('story', T, [], undefined, { arquetipo: semCaixa }).recusas).toEqual([expect.objectContaining({ rect: null, motivo: expect.stringMatching(/não tem a folga da pílula/) })])
    const fina = copia()
    fina.formatos.story.elementos.pilula = { x: 0.197, y: 0.822, w: 0.606, h: 0.051 }
    expect(posicionar('story', T, [], undefined, { arquetipo: fina }).recusas).toEqual([expect.objectContaining({ rect: null, motivo: expect.stringMatching(/não tem a folga da pílula/) })])
  })

  it('R-14: desenho incoerente (forma, canal, raio, espessura) recusa antes do lookup, nunca pelo asset vivo', () => {
    const T = servicoNaReferencia('story', 328, 51)
    const r0 = receitaDaPilula()
    for (const r of [
      { ...r0, desenho: { ...r0.desenho, shapeType: 'svg-path' as const } },
      { ...r0, canal: 'preenchimento' as const },
      { ...r0, desenho: { ...r0.desenho, raio: undefined } },
      { ...r0, desenho: { ...r0.desenho, strokeWidth: undefined } },
    ]) expect(posicionar('story', T, [], [r]).recusas).toEqual([expect.objectContaining({ rect: null, motivo: expect.stringMatching(/desenho da pílula/) })])
  })

  it('D7/D11: a guarda pura do replay — ausente, presa a outro papel, outro tipo ou elemento inexistente; os coerentes e os tipos antigos passam', () => {
    const ok = congelada() as never
    expect(incoerenciaDosEnvolventesCongelados(def(), [ok])).toBeNull()
    expect(incoerenciaDosEnvolventesCongelados(def(), [])).toMatch(/não gravou o acento obrigatório "pilula"/)
    expect(incoerenciaDosEnvolventesCongelados(def(), [congelada({ presoA: 'headline' }) as never])).toMatch(/preso a headline\) não é o elemento declarado.*preso a servico/)
    expect(incoerenciaDosEnvolventesCongelados(def(), [congelada({ elemento: 'capsula' }) as never])).toMatch(/"capsula".*não é o elemento declarado/)
    // Um fio congelado (tipo antigo) numa peça de outro arquétipo: a guarda não olha (lacuna herdada).
    const fio = receitasDoArquetipo(verArquetipo('minimal-fb-topo-esquerda')!).receitas[0]
    expect(incoerenciaDosEnvolventesCongelados(verArquetipo('minimal-fb-topo-esquerda')!, [])).toBeNull()
    expect(incoerenciaDosEnvolventesCongelados(verArquetipo('minimal-fb-base-esquerda')!, [{ ...fio, presoA: 'servico' }])).toBeNull()
  })

  it('D7/D11 (rodada 1): receita de TIPO ANTIGO legível no id da pílula (o tipo DECLARADO é envolvente) → incoerente, recusa antecipada', () => {
    // Gatilho da revisão: elemento 'pilula', tipo 'fio-fino', presoA 'servico', linha de contorno com asset, cor e fonte válidos.
    const antiga = { elemento: 'pilula', tipo: 'fio-fino', presoA: 'servico', corPorPapel: 'texto', canal: 'contorno', asset: { id: 'fio-fino', versao: 1 }, desenho: { shapeType: 'line', strokeWidth: 2, ajuste: 'livre' }, cor: '#f5f1e8', fonteDaCor: 'texto-do-papel' }
    // O leitor da receita gravada aceita a forma antiga — é a guarda que tem de ver o tipo declarado.
    const lida = lerAcentosGravados([antiga])
    expect(Array.isArray(lida)).toBe(true)
    expect(incoerenciaDosEnvolventesCongelados(def(), lida as never)).toMatch(/"pilula" \(fio-fino, preso a servico\) não é o elemento declarado.*\(pilula-contorno, preso a servico\)/)
    // Antigo → antigo continua intocado (a lacuna herdada dos tipos antigos não é ampliada).
    const fio = receitasDoArquetipo(verArquetipo('minimal-fb-topo-esquerda')!).receitas[0]
    expect(incoerenciaDosEnvolventesCongelados(verArquetipo('minimal-fb-topo-esquerda')!, [{ ...fio, tipo: 'spark-4' }])).toBeNull()
  })
})

describe('#5 · a receita congelada (R-02 a R-04, R-15)', () => {
  it('R-02/R-15: a pílula válida é lida com o RAIO transportado (e a cor congelada)', () => {
    const lida = lerAcentosGravados([JSON.parse(JSON.stringify({ ...congelada({}, { raio: 120 }), camada: 'acento-pilula', rect: { x: 0, y: 0, width: 1, height: 1 } }))])
    expect(lida).toEqual([{ ...congelada({}, { raio: 120 }) }])
    expect((lida as Array<{ desenho: { raio?: number } }>)[0].desenho.raio).toBe(120)
  })

  it('R-02: forma trocada, raio ausente/0/não inteiro/> 9999, canal preenchimento, pathData, sem espessura, derivação → ilegível', () => {
    const casos: Array<[unknown, RegExp]> = [
      [congelada({}, { shapeType: 'line' }), /retângulo arredondado de contorno/],
      [congelada({}, { raio: undefined }), /raio da pílula/],
      [congelada({}, { raio: 0 }), /raio da pílula/],
      [congelada({}, { raio: 1.5 }), /raio da pílula/],
      [congelada({}, { raio: 10000 }), /raio da pílula/],
      [congelada({ canal: 'preenchimento' }), /retângulo arredondado de contorno/],
      [congelada({}, { pathData: 'M0 0 L1 1' }), /retângulo arredondado de contorno/],
      [congelada({}, { strokeWidth: undefined }), /retângulo arredondado de contorno/],
      [congelada({ derivacao: { regra: 'bracos-iguais', bracoPx: 10 } }), /não tem derivação/],
    ]
    for (const [r, motivo] of casos) expect(lerAcentosGravados([JSON.parse(JSON.stringify(r))]), String(motivo)).toEqual({ problema: expect.stringMatching(motivo) })
  })

  it('R-03: retângulo arredondado gravado com outro tipo é ilegível', () => {
    const fio = receitasDoArquetipo(verArquetipo('minimal-fb-topo-esquerda')!).receitas[0]
    expect(lerAcentosGravados([{ ...fio, desenho: { shapeType: 'rounded-rectangle', strokeWidth: 2, raio: 9999, ajuste: 'livre' }, cor: '#fff', fonteDaCor: 'x' }])).toEqual({ problema: expect.stringMatching(/forma rounded-rectangle/) })
  })

  it('R-04: as receitas dos tipos antigos são lidas como antes (sem raio, mesmo que a gravada traga um)', () => {
    for (const a of listarArquetipos().filter((x) => x.id !== ID)) {
      for (const r of receitasDoArquetipo(a).receitas) {
        const gravada = { ...r, desenho: { ...r.desenho, raio: 5 }, cor: '#ffffff', fonteDaCor: 'texto-do-papel' }
        expect(lerAcentosGravados([gravada]), `${a.id} ${r.elemento}`).toEqual([{ ...r, cor: '#ffffff', fonteDaCor: 'texto-do-papel' }])
      }
    }
  })
})

describe('#5 · a camada da pílula (P-10, puro)', () => {
  it('shape rounded-rectangle de contorno, fill transparente, traço 2, raio 9999, asset sem papéis, metadata presoA servico', () => {
    const c = camadaDoAcento({ receita: receitaDaPilula(), rect: { x: 472, y: 1566, width: 136, height: 87 } }, { hex: '#f5f1e8', fonte: 'texto-do-papel' }, `${ID}@1`)
    expect(c).toMatchObject({ id: 'acento-pilula', name: 'Acento · Pílula de contorno', type: 'shape', position: { x: 472, y: 1566 }, size: { width: 136, height: 87 } })
    expect(c.style).toMatchObject({ shapeType: 'rounded-rectangle', fill: 'transparent', strokeColor: 'rgba(245, 241, 232, 1)', strokeWidth: 2, border: { width: 0, color: 'transparent', radius: 9999 }, vetor: { asset: { id: 'pilula-contorno', versao: 1 } } })
    expect(c.style?.vetor?.papeis).toBeUndefined()
    expect(c.metadata).toEqual({ compositor: { acento: { elemento: 'pilula', tipo: 'pilula-contorno', presoA: 'servico', corPorPapel: 'texto', fonteDaCor: 'texto-do-papel', arquetipo: `${ID}@1` } } })
  })
})
