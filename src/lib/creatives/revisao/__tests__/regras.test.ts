import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import { avaliarPeca, type EntradaDaRevisao } from '../regras'
import type { AchadoVisto } from '../visao'

const W = 1080
const H = 1920

function camada(id: string, box: { x: number; y: number; width: number; height: number }, fontSize: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    content: id,
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    style: { fontSize, lineHeight: 1.2, textAlign: 'left' },
    metadata: { compositor: { papel: id } },
    ...extra,
  } as Layer
}

function metrica(l: Layer, extra: Partial<TextLayerMetrics> = {}): TextLayerMetrics {
  const box = { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }
  const fontSize = l.style!.fontSize as number
  return {
    layerId: l.id,
    name: l.name,
    box,
    realHeight: box.height,
    maxLineWidth: Math.min(box.width - 12, 400),
    lineCount: 1,
    glyphTop: box.y + 6,
    glyphBottom: box.y + box.height - 6,
    fontSize,
    lineBox: fontSize * 1.2,
    autoExpand: true,
    ...extra,
  }
}

function entrada(parcial: Partial<EntradaDaRevisao>): EntradaDaRevisao {
  return {
    canvas: { width: W, height: H },
    formato: 'story',
    camadas: [],
    metricas: [],
    geometria: [],
    contraste: [],
    faixaDoGradiente: [0.45, 0.9],
    referencias: {},
    assunto: null,
    fontesAusentes: [],
    medidasAproximadas: [],
    ...parcial,
  }
}

function medida(parcial: Partial<ContrasteMedido>): ContrasteMedido {
  return {
    grupo: 'g',
    camadas: [],
    sentido: 'claro',
    alvo: 139,
    p98SemHalo: 200,
    p98ComHalo: 120,
    tinta: 0.6,
    tintaCorrigida: null,
    gradiente: null,
    ok: true,
    ...parcial,
  }
}

const gradienteDoRodape = {
  id: 'gradiente-leitura-rodape',
  name: 'gradiente',
  type: 'gradient',
  visible: true,
  locked: false,
  order: 1,
  position: { x: 0, y: 1100 },
  size: { width: W, height: 820 },
  style: { gradientStops: [{ id: '0', position: 0, color: '#111111', opacity: 0.6 }] },
  metadata: { tratamentoDeTexto: 'gradiente-de-leitura', borda: 'rodape', forca: 0.6 },
} as Layer

describe('o título grande demais', () => {
  it('pela proporção da peça: aviso e escala com o piso de 80% por rodada', () => {
    const titulo = camada('headline', { x: 100, y: 1000, width: 880, height: 520 }, 150)
    const apoio = camada('apoio', { x: 100, y: 1540, width: 880, height: 60 }, 40)
    const r = avaliarPeca(entrada({ camadas: [titulo, apoio], metricas: [metrica(titulo, { lineCount: 3 }), metrica(apoio)] }))
    const achado = r.achados.find((a) => a.regra === 'titulo-grande')!
    expect(achado.severidade).toBe('aviso')
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'fonte', camadas: ['headline'], escala: 0.8 })
  })

  it('maior que o modelo: a escala volta ao corpo do modelo', () => {
    const titulo = camada('headline', { x: 100, y: 1300, width: 880, height: 156 }, 120)
    const r = avaliarPeca(
      entrada({
        camadas: [titulo],
        metricas: [metrica(titulo)],
        referencias: { headline: { fontSize1080: 90, entrelinha: 1, origem: 'assinatura "Story"' } },
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'titulo-grande')!
    expect(achado.severidade).toBe('aviso')
    expect(achado.mensagem).toContain('maior que o modelo')
    expect(r.ajustes[achado.ajustes[0]].escala).toBe(0.75)
  })

  it('fonte não cadastrada no título: o problema é a fonte, e o tamanho fica sem veredito', () => {
    const titulo = camada('headline', { x: 100, y: 1000, width: 880, height: 520 }, 150)
    const r = avaliarPeca(
      entrada({
        camadas: [titulo],
        metricas: [metrica(titulo, { lineCount: 3 })],
        fontesAusentes: [{ familia: 'Amithen', peso: null, camadas: ['headline'] }],
      }),
    )
    expect(r.achados.map((a) => a.regra)).toEqual(['fonte-nao-carregada'])
    expect(r.achados[0].severidade).toBe('problema')
    expect(r.cobertura['titulo-grande']?.estado).toBe('parcial')
  })

  it('corpo e entrelinha nas mesmas camadas saem num comando só', () => {
    const titulo = camada('headline', { x: 100, y: 1000, width: 880, height: 520 }, 150, {
      style: { fontSize: 150, lineHeight: 1.5, textAlign: 'left' },
    } as Partial<Layer>)
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo, { lineCount: 2 })] }))
    expect(r.ajustes).toHaveLength(1)
    expect(r.ajustes[0]).toMatchObject({ tipo: 'fonte', camadas: ['headline'], escala: 0.8, entrelinha: 1.1 })
    const regras = r.achados.filter((a) => a.ajustes.includes(0)).map((a) => a.regra).sort()
    expect(regras).toEqual(['entrelinha-grande', 'titulo-grande'])
  })
})

describe('a leitura sobre a foto (a régua)', () => {
  const servico = camada('servico', { x: 100, y: 1700, width: 880, height: 48 }, 30)

  it('horário sem leitura com força corrigível: problema e o ajuste é a força que a régua achou', () => {
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, servico],
        metricas: [metrica(servico)],
        contraste: [
          medida({
            camadas: ['servico'],
            gradiente: gradienteDoRodape.id,
            tinta: 0.72,
            tintaCorrigida: 0.72,
            p98ComHalo: 130,
            ok: true,
            antesDaCorrecao: { p98: 175, ok: false, tinta: 0.6, alvo: 139, sentido: 'claro' },
          }),
        ],
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'texto-sem-leitura')!
    expect(achado.severidade).toBe('problema')
    expect(achado.mensagem).toContain('horário')
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'gradiente', borda: 'rodape', forca: 0.72 })
  })

  it('a régua da main mede texto a texto: o achado sai da leitura de ANTES da correção, com o alvo e o sentido dela', () => {
    // Depois da correção o pior texto do grupo mudou (outro alvo, e a peça atual
    // até fecha); o achado tem de falar do texto que NÃO dava leitura antes.
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, servico],
        metricas: [metrica(servico)],
        contraste: [
          medida({
            camadas: ['servico'],
            gradiente: gradienteDoRodape.id,
            tinta: 0.8,
            tintaCorrigida: 0.8,
            sentido: 'claro',
            alvo: 90,
            p98ComHalo: 70,
            ok: true,
            antesDaCorrecao: { p98: 175, ok: false, tinta: 0.6, alvo: 139, sentido: 'claro' },
          }),
        ],
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'texto-sem-leitura')!
    expect(achado).toBeDefined()
    expect(achado.evidencia).toMatchObject({ p98: 175, alvo: 139, forcaAtual: 0.6, forcaProposta: 0.8, fechaComAProposta: true })
    expect(achado.mensagem).toContain('p98 175 contra alvo 139')
  })

  it('no teto da força da marca não há ajuste mecânico: a observação manda mudar posição ou foto', () => {
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, servico],
        metricas: [metrica(servico)],
        contraste: [medida({ camadas: ['servico'], gradiente: gradienteDoRodape.id, tinta: 0.9, p98ComHalo: 180, ok: false })],
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'texto-sem-leitura')!
    expect(achado.ajustes).toEqual([])
    expect(achado.observacao).toContain('teto')
  })

  it('gradiente sobrando em TODOS os blocos da borda: sugere devolver luz à foto', () => {
    const apoio = camada('apoio', { x: 100, y: 1500, width: 880, height: 60 }, 40)
    const base = { gradiente: gradienteDoRodape.id, tinta: 0.9, p98SemHalo: 200, p98ComHalo: 60, alvo: 139, ok: true }
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, apoio, servico],
        metricas: [metrica(apoio), metrica(servico)],
        contraste: [medida({ ...base, grupo: 'a', camadas: ['apoio'] }), medida({ ...base, grupo: 's', camadas: ['servico'] })],
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'gradiente-forte-demais')!
    expect(achado.severidade).toBe('sugestao')
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'gradiente', borda: 'rodape', forca: 0.489 })
  })

  it('um bloco da borda no limite do alvo impede reduzir a força do vizinho folgado', () => {
    const apoio = camada('apoio', { x: 100, y: 1500, width: 880, height: 60 }, 40)
    const base = { gradiente: gradienteDoRodape.id, tinta: 0.9, p98SemHalo: 200, alvo: 139, ok: true }
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, apoio, servico],
        metricas: [metrica(apoio), metrica(servico)],
        contraste: [medida({ ...base, camadas: ['apoio'], p98ComHalo: 60 }), medida({ ...base, camadas: ['servico'], p98ComHalo: 130 })],
      }),
    )
    expect(r.achados.some((a) => a.regra === 'gradiente-forte-demais')).toBe(false)
  })
})

describe('geometria', () => {
  it('colisão entre blocos: o bloco de baixo desce o necessário para sair da tolerância', () => {
    const apoio = camada('apoio', { x: 100, y: 1294, width: 880, height: 72 }, 40, { metadata: { groupId: 'g1', compositor: { papel: 'apoio' } } })
    const cta = camada('cta', { x: 100, y: 1334, width: 880, height: 62 }, 40, { metadata: { groupId: 'g2', compositor: { papel: 'cta' } } })
    const r = avaliarPeca(
      entrada({
        camadas: [apoio, cta],
        metricas: [metrica(apoio, { glyphTop: 1300, glyphBottom: 1360 }), metrica(cta, { glyphTop: 1340, glyphBottom: 1390 })],
        geometria: [{ tipo: 'colisao', camadas: ['apoio', 'cta'], layerIds: ['apoio', 'cta'], px: 30, detalhe: '' }],
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'colisao')!
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'mover', camadas: ['cta'], dy: 29 })
  })

  it('logo sobre o título no story: vai para um canto livre, nunca o do avatar', () => {
    const titulo = camada('headline', { x: 500, y: 160, width: 500, height: 120 }, 80)
    const logo = {
      id: 'logo',
      name: 'logo',
      type: 'logo',
      visible: true,
      locked: false,
      order: 3,
      position: { x: 900, y: 150 },
      size: { width: 120, height: 120 },
    } as Layer
    const r = avaliarPeca(entrada({ camadas: [titulo, logo], metricas: [metrica(titulo, { maxLineWidth: 480 })] }))
    const achado = r.achados.find((a) => a.regra === 'logo-sobre-texto')!
    expect(r.ajustes[achado.ajustes[0]]).toEqual({ tipo: 'mover', camadas: ['logo'], dx: -10, dy: 1500, achado: achado.id })
  })

  it('a cedilha além da caixa é aviso sem ajuste: o conserto é no editor', () => {
    const titulo = camada('headline', { x: 100, y: 800, width: 880, height: 110 }, 90)
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo, { glyphBottom: 918 })] }))
    const achado = r.achados.find((a) => a.regra === 'tinta-fora-da-caixa')!
    expect(achado.severidade).toBe('aviso')
    expect(achado.mensagem).toContain('cedilha')
    expect(achado.ajustes).toEqual([])
  })

  it('palavra órfã criada pela quebra: sugere alargar a caixa; a última linha escrita pela copy fica', () => {
    const apoio = camada('apoio', { x: 100, y: 1400, width: 700, height: 108 }, 40, { content: 'Almoço com a família hoje' })
    const linhas = [
      { texto: 'Almoço com a família', largura: 600 },
      { texto: 'hoje', largura: 120 },
    ]
    const r = avaliarPeca(entrada({ camadas: [apoio], metricas: [metrica(apoio, { lineCount: 2, maxLineWidth: 600, linhas })] }))
    const achado = r.achados.find((a) => a.regra === 'palavra-orfa')!
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'caixa', camadas: ['apoio'], largura: 844 })

    const escrita = camada('apoio', { x: 100, y: 1400, width: 700, height: 108 }, 40, { content: 'Almoço com a família\nhoje' })
    const r2 = avaliarPeca(entrada({ camadas: [escrita], metricas: [metrica(escrita, { lineCount: 2, maxLineWidth: 600, linhas })] }))
    expect(r2.achados.some((a) => a.regra === 'palavra-orfa')).toBe(false)
  })

  it('texto sobre o assunto catalogado: aviso sem ajuste, com a recomposição sugerida', () => {
    const titulo = camada('headline', { x: 300, y: 800, width: 500, height: 200 }, 90)
    const r = avaliarPeca(
      entrada({
        camadas: [titulo],
        metricas: [metrica(titulo, { maxLineWidth: 480 })],
        assunto: { rect: { x: 250, y: 700, width: 600, height: 400 }, origem: 'catalogo' },
      }),
    )
    const achado = r.achados.find((a) => a.regra === 'texto-sobre-assunto')!
    expect(achado.severidade).toBe('aviso')
    expect(achado.ajustes).toEqual([])
    expect(achado.observacao).toContain('compor-arte')
  })
})

describe('calibração contra peças reais (11/09/2026)', () => {
  const servico = camada('servico', { x: 100, y: 1700, width: 880, height: 48 }, 30)
  const semLeitura = medida({
    camadas: ['servico'],
    gradiente: gradienteDoRodape.id,
    tinta: 0.72,
    tintaCorrigida: 0.72,
    p98ComHalo: 130,
    ok: true,
    antesDaCorrecao: { p98: 175, ok: false, tinta: 0.6, alvo: 139, sentido: 'claro' },
  })

  it('a sombra presa ao glifo rebaixa a leitura um nível e diz por quê', () => {
    const comSombra = camada('servico', { x: 100, y: 1700, width: 880, height: 48 }, 30, {
      effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.6 } },
    } as Partial<Layer>)
    const r = avaliarPeca(entrada({ camadas: [gradienteDoRodape, comSombra], metricas: [metrica(comSombra)], contraste: [semLeitura] }))
    const achado = r.achados.find((a) => a.regra === 'texto-sem-leitura')!
    expect(achado.severidade).toBe('aviso')
    expect(achado.observacao).toContain('sombra presa ao glifo')
    expect(achado.ajustes).toHaveLength(1)
  })

  it('com a visão rodando e sem confirmar, a leitura vira sugestão e o assunto estimado sai', () => {
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, servico],
        metricas: [metrica(servico)],
        contraste: [semLeitura],
        assunto: { rect: { x: 0, y: 1600, width: 1080, height: 300 }, origem: 'estimado' },
        vistos: [],
      }),
    )
    expect(r.achados.find((a) => a.regra === 'texto-sem-leitura')!.severidade).toBe('sugestao')
    expect(r.achados.some((a) => a.regra === 'texto-sobre-assunto')).toBe(false)
  })

  it('visão que não concluiu não rebaixa nada, e a cobertura e o resumo dizem isso', () => {
    const r = avaliarPeca(
      entrada({
        camadas: [gradienteDoRodape, servico],
        metricas: [metrica(servico)],
        contraste: [semLeitura],
        vistos: [],
        visaoConclusiva: false,
      }),
    )
    expect(r.achados.find((a) => a.regra === 'texto-sem-leitura')!.severidade).not.toBe('sugestao')
    expect(r.cobertura.visao?.estado).toBe('parcial')
    expect(r.resumo).toContain('a visão concluiu só em parte')
  })

  it('assunto estimado precisa cobrir mais de 40% do bloco; o catalogado, 25%', () => {
    const titulo = camada('headline', { x: 300, y: 800, width: 500, height: 200 }, 90)
    const assunto = { rect: { x: 0, y: 700, width: 450, height: 400 } }
    const estimado = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo, { maxLineWidth: 480 })], assunto: { ...assunto, origem: 'estimado' } }))
    const catalogo = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo, { maxLineWidth: 480 })], assunto: { ...assunto, origem: 'catalogo' } }))
    expect(estimado.achados.some((a) => a.regra === 'texto-sobre-assunto')).toBe(false)
    expect(catalogo.achados.some((a) => a.regra === 'texto-sobre-assunto')).toBe(true)
  })
})

describe('o que a visão viu', () => {
  const titulo = camada('headline', { x: 100, y: 700, width: 880, height: 112 }, 90)
  const marca = { marca: 'T1', tipo: 'texto' as const, camadas: ['headline'], rect: { x: 106, y: 706, width: 400, height: 100 }, descricao: 'Almoço' }

  it('achado só da visão vira ajuste com o NÚMERO calculado pelo código', () => {
    const vistos: AchadoVisto[] = [
      { marca, problema: 'posicao-estranha', evidencia: 'o bloco flutua no meio da foto sem apoio', confianca: 'alta', correcao: 'descer', intensidade: 'medio' },
    ]
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo)], vistos }))
    const achado = r.achados.find((a) => a.regra === 'visao')!
    expect(achado.certeza).toBe('visao')
    // Posição é gosto: confiança alta não a leva além de sugestão.
    expect(achado.severidade).toBe('sugestao')
    expect(r.ajustes[achado.ajustes[0]]).toMatchObject({ tipo: 'mover', camadas: ['headline'], dy: 67 })
    expect(r.cobertura.visao?.estado).toBe('avaliada')
  })

  it('problema técnico só da visão, com confiança alta, é aviso', () => {
    const vistos: AchadoVisto[] = [
      { marca, problema: 'texto-pequeno', evidencia: 'o texto some no celular de tão miúdo', confianca: 'alta', correcao: 'aumentar-fonte', intensidade: 'pouco' },
    ]
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo)], vistos }))
    expect(r.achados.find((a) => a.regra === 'visao')!.severidade).toBe('aviso')
  })

  it('reduzir a fonte que já está no piso não vira aumento: fica sem ajuste', () => {
    const miudo = camada('apoio', { x: 100, y: 700, width: 880, height: 41 }, 24)
    const vistos: AchadoVisto[] = [
      {
        marca: { ...marca, camadas: ['apoio'] },
        problema: 'posicao-estranha',
        evidencia: 'o apoio briga com o título pelo olhar',
        confianca: 'alta',
        correcao: 'reduzir-fonte',
        intensidade: 'medio',
      },
    ]
    const r = avaliarPeca(entrada({ camadas: [miudo], metricas: [metrica(miudo)], vistos }))
    expect(r.achados.find((a) => a.regra === 'visao')!.ajustes).toEqual([])
    expect(r.ajustes.some((a) => a.tipo === 'fonte' && (a.escala ?? 1) > 1)).toBe(false)
  })

  it('a visão que confirma um achado medido vira evidência dele, sem comando novo', () => {
    const grande = camada('headline', { x: 100, y: 1000, width: 880, height: 520 }, 150)
    const vistos: AchadoVisto[] = [
      { marca: { ...marca, rect: { x: 106, y: 1006, width: 400, height: 508 } }, problema: 'titulo-grande', evidencia: 'o título ocupa quase metade da peça', confianca: 'alta', correcao: 'reduzir-fonte', intensidade: 'muito' },
    ]
    const r = avaliarPeca(entrada({ camadas: [grande], metricas: [metrica(grande, { lineCount: 3 })], vistos }))
    expect(r.achados.filter((a) => a.regra === 'visao')).toHaveLength(0)
    expect(r.achados.find((a) => a.regra === 'titulo-grande')!.visao?.evidencia).toContain('metade')
    expect(r.ajustes).toHaveLength(1)
  })

  it('medição que não rodou vira cobertura "não avaliada" nas regras de texto — nunca aprovação (R4)', () => {
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [], motivoSemMedida: 'a medição dos textos falhou: fonte' }))
    for (const regra of ['texto-cortado', 'colisao', 'titulo-grande', 'palavra-orfa'] as const) {
      expect(r.cobertura[regra]).toEqual({ estado: 'nao-avaliada', motivo: 'a medição dos textos falhou: fonte' })
    }
    expect(r.cobertura['fonte-nao-carregada']?.estado).toBe('avaliada')
    expect(r.resumo).not.toMatch(/nada a corrigir/i)
  })

  it('sem visão, a cobertura diz que ela não rodou', () => {
    const r = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo)], motivoSemVisao: 'visão desligada' }))
    expect(r.cobertura.visao).toEqual({ estado: 'nao-avaliada', motivo: 'visão desligada' })
    expect(r.resumo).toContain('a visão não rodou')
  })
})

describe('a medida arbitra a visão (calibração de 11/09/2026)', () => {
  const apoio = camada('apoio', { x: 100, y: 1500, width: 880, height: 60 }, 40)
  const servico = camada('servico', { x: 100, y: 1700, width: 880, height: 48 }, 30)
  const marcaApoio = { marca: 'T1', tipo: 'texto' as const, camadas: ['apoio'], rect: { x: 106, y: 1506, width: 400, height: 48 }, descricao: 'apoio' }
  const marcaServico = { marca: 'T2', tipo: 'texto' as const, camadas: ['servico'], rect: { x: 106, y: 1706, width: 400, height: 36 }, descricao: 'serviço' }
  const rodapeA06 = { ...gradienteDoRodape, metadata: { ...gradienteDoRodape.metadata, forca: 0.6 } } as Layer
  const noLimite = (id: string) => medida({ camadas: [id], gradiente: rodapeA06.id, tinta: 0.6, p98ComHalo: 135, alvo: 139, ok: true })

  it('"mais" e "menos" gradiente na mesma borda não se fundem', () => {
    const vistos: AchadoVisto[] = [
      { marca: marcaApoio, problema: 'gradiente-claro-demais', evidencia: 'o apoio some sobre o piso claro', confianca: 'alta', correcao: 'mais-gradiente', intensidade: 'medio' },
      { marca: marcaServico, problema: 'gradiente-escuro-demais', evidencia: 'a faixa escura pesa sobre a foto no rodapé', confianca: 'alta', correcao: 'menos-gradiente', intensidade: 'medio' },
    ]
    const r = avaliarPeca(
      entrada({ camadas: [rodapeA06, apoio, servico], metricas: [metrica(apoio), metrica(servico)], contraste: [noLimite('apoio'), noLimite('servico')], vistos }),
    )
    expect(r.ajustes).toHaveLength(1)
    expect(r.ajustes[0]).toMatchObject({ tipo: 'gradiente', borda: 'rodape', forca: 0.75 })
    const escuro = r.achados.find((a) => a.evidencia.problema === 'gradiente-escuro-demais')!
    expect(escuro.ajustes).toEqual([])
    expect(escuro.observacao).toContain('opostas')
  })

  it('"menos gradiente" não é proposto onde a régua mede falta de leitura', () => {
    const falta = medida({ camadas: ['servico'], gradiente: rodapeA06.id, tinta: 0.9, p98ComHalo: 180, ok: false })
    const vistos: AchadoVisto[] = [
      { marca: marcaServico, problema: 'gradiente-escuro-demais', evidencia: 'a faixa escura pesa sobre a foto no rodapé', confianca: 'alta', correcao: 'menos-gradiente', intensidade: 'muito' },
    ]
    const r = avaliarPeca(entrada({ camadas: [rodapeA06, servico], metricas: [metrica(servico)], contraste: [falta], vistos }))
    const escuro = r.achados.find((a) => a.evidencia.problema === 'gradiente-escuro-demais')!
    expect(escuro.ajustes).toEqual([])
    expect(escuro.observacao).toContain('pioraria')
  })

  it('a redução do gradiente confere CADA texto do grupo, não só o representante (R1 do merge)', () => {
    // Cenário da revisão do Codex: A é o pior na força atual (folga 55 × 59),
    // mas B é quem limita a redução — a 0,45 o fundo de B iria a ~140, acima do
    // alvo 110 + 12. A força proposta tem de preservar B.
    const a = camada('apoio', { x: 100, y: 1500, width: 880, height: 60 }, 40)
    const b = camada('servico', { x: 100, y: 1700, width: 880, height: 48 }, 30)
    const rodapeA08 = { ...gradienteDoRodape, metadata: { ...gradienteDoRodape.metadata, forca: 0.8 } } as Layer
    const grupo = medida({
      grupo: 'g',
      camadas: ['apoio', 'servico'],
      gradiente: rodapeA08.id,
      tinta: 0.8,
      sentido: 'claro',
      alvo: 65,
      p98SemHalo: 50,
      p98ComHalo: 10,
      ok: true,
      textos: [
        { camada: 'apoio', sentido: 'claro', alvo: 65, p98SemHalo: 50, p98ComHalo: 10, ok: true },
        { camada: 'servico', sentido: 'claro', alvo: 110, p98SemHalo: 255, p98ComHalo: 51, ok: true },
      ],
    })
    const r = avaliarPeca(entrada({ camadas: [rodapeA08, a, b], metricas: [metrica(a), metrica(b)], contraste: [grupo] }))
    const sobra = r.achados.find((x) => x.regra === 'gradiente-forte-demais')
    expect(sobra).toBeDefined()
    const ajuste = r.ajustes[sobra!.ajustes[0]]
    expect(ajuste.tipo).toBe('gradiente')
    // 0,8 × (255 − 95) / (255 − 51) ≈ 0,627 — nunca o piso 0,45 que o representante A sugeriria.
    expect(ajuste.forca).toBeGreaterThan(0.6)
    expect(ajuste.forca).toBeLessThan(0.8)
  })

  it('"menos gradiente" também não é proposto sobre gradiente DESENHADO À MÃO quando a régua mede falta de leitura na borda (REV-03)', () => {
    // Gradiente sem a marca do compositor: a régua não o associa (gradiente: null
    // na medida). A proteção tem de olhar a BORDA, não o id.
    const manual = { ...gradienteDoRodape, id: 'gradiente-manual', metadata: { forca: 0.6 } } as Layer
    const falta = medida({ camadas: ['servico'], gradiente: null, tinta: 0, p98ComHalo: 180, ok: false })
    const vistos: AchadoVisto[] = [
      { marca: marcaServico, problema: 'gradiente-escuro-demais', evidencia: 'a faixa escura pesa sobre a foto no rodapé', confianca: 'alta', correcao: 'menos-gradiente', intensidade: 'medio' },
    ]
    const r = avaliarPeca(entrada({ camadas: [manual, servico], metricas: [metrica(servico)], contraste: [falta], vistos }))
    expect(r.ajustes.filter((a) => a.tipo === 'gradiente' && (a.forca ?? 1) < 0.6)).toHaveLength(0)
    const escuro = r.achados.find((a) => a.evidencia.problema === 'gradiente-escuro-demais')!
    expect(escuro.ajustes).toEqual([])
  })

  it('"menos gradiente" NUNCA é proposto sobre gradiente DESENHADO À MÃO, mesmo com a régua satisfeita — a visão fica como observação (REV-F03)', () => {
    const manual = { ...gradienteDoRodape, id: 'gradiente-manual', metadata: { forca: 0.6 } } as Layer
    const sobra = medida({ camadas: ['servico'], gradiente: null, tinta: 0, p98ComHalo: 60, ok: true })
    const vistos: AchadoVisto[] = [
      { marca: marcaServico, problema: 'gradiente-escuro-demais', evidencia: 'a faixa escura pesa sobre a foto no rodapé', confianca: 'alta', correcao: 'menos-gradiente', intensidade: 'medio' },
    ]
    const r = avaliarPeca(entrada({ camadas: [manual, servico], metricas: [metrica(servico)], contraste: [sobra], vistos }))
    expect(r.ajustes.filter((a) => a.tipo === 'gradiente')).toHaveLength(0)
    const escuro = r.achados.find((a) => a.evidencia.problema === 'gradiente-escuro-demais')!
    expect(escuro).toBeDefined()
    expect(escuro.ajustes).toEqual([])
  })

  it('visão que voltou SEM a lista (inconclusiva) não rebaixa a leitura medida nem marca a visão como avaliada (REV-02)', () => {
    const falta = medida({ camadas: ['servico'], gradiente: rodapeA06.id, tinta: 0.6, tintaCorrigida: 0.8, p98ComHalo: 120, ok: true, antesDaCorrecao: { p98: 180, ok: false, tinta: 0.6, alvo: 139, sentido: 'claro' } })
    const base = { camadas: [rodapeA06, servico], metricas: [metrica(servico)], contraste: [falta] }
    const inconclusiva = avaliarPeca(entrada({ ...base, vistos: [], visaoConclusiva: false }))
    expect(inconclusiva.achados.find((a) => a.regra === 'texto-sem-leitura')!.severidade).toBe('problema')
    expect(inconclusiva.cobertura.visao?.estado).toBe('parcial')
    // `achados: []` de verdade continua arbitrando: a leitura que a visão não viu desce para sugestão.
    const vazia = avaliarPeca(entrada({ ...base, vistos: [], visaoConclusiva: true }))
    expect(vazia.achados.find((a) => a.regra === 'texto-sem-leitura')!.severidade).toBe('sugestao')
    expect(vazia.cobertura.visao?.estado).toBe('avaliada')
  })

  it('"sem leitura" onde a régua mede folga clara é descartado; no limite do alvo, fica', () => {
    const olhar = (marca: typeof marcaServico): AchadoVisto => ({
      marca,
      problema: 'texto-sem-leitura',
      evidencia: 'as letras finas se perdem na textura',
      confianca: 'media',
      correcao: 'mais-gradiente',
      intensidade: 'pouco',
    })
    const folga = medida({ camadas: ['servico'], gradiente: rodapeA06.id, tinta: 0.6, p98ComHalo: 100, alvo: 139, ok: true })
    const r = avaliarPeca(
      entrada({ camadas: [rodapeA06, apoio, servico], metricas: [metrica(apoio), metrica(servico)], contraste: [noLimite('apoio'), folga], vistos: [olhar(marcaServico), olhar(marcaApoio)] }),
    )
    const daVisao = r.achados.filter((a) => a.regra === 'visao')
    expect(daVisao.map((a) => a.camadas)).toEqual([['apoio']])
    expect(r.cobertura.visao?.motivo).toContain('de leitura')
  })

  it('corte apontado pela visão sem medida que o confirme sai; em rich text, fica', () => {
    const titulo = camada('headline', { x: 100, y: 700, width: 880, height: 112 }, 90)
    const marca = { marca: 'T1', tipo: 'texto' as const, camadas: ['headline'], rect: { x: 106, y: 706, width: 400, height: 100 }, descricao: 'Almoço' }
    const vistos: AchadoVisto[] = [
      { marca, problema: 'texto-cortado', evidencia: 'a base das letras da última linha parece cortada', confianca: 'alta', correcao: null, intensidade: 'pouco' },
    ]
    const simples = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo)], vistos }))
    expect(simples.achados.some((a) => a.regra === 'visao')).toBe(false)
    expect(simples.cobertura.visao?.motivo).toContain('de corte')

    const rico = avaliarPeca(entrada({ camadas: [titulo], metricas: [metrica(titulo)], vistos, medidasAproximadas: ['headline'] }))
    expect(rico.achados.some((a) => a.regra === 'visao' && a.evidencia.problema === 'texto-cortado')).toBe(true)
  })
})
