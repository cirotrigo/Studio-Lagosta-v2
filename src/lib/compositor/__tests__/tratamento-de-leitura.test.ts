/**
 * CP2A (14/10/2026) — o tratamento de leitura POR BORDA, puro: texto claro
 * pede véu escuro, texto escuro pede véu claro, sem necessidade não há véu,
 * candidata que piora não vence e polaridades incompatíveis na mesma borda
 * tornam a ESTRATÉGIA inviável (não a peça). As cores são fixture.
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import { alvoPorContraste, luzDaCor } from '@/lib/creatives/halo/halo'
import { bordaDaCamadaDeGradiente, CURVA_DE_LEITURA, ehGradienteDeLeituraDaPagina, faixaDeOpacidade } from '../gradiente-de-leitura'
import { alvoClaroPorContraste, ladosDeLeitura, luzMedida, polaridadeDoTexto, TRATAMENTO_PIOROU_LEITURA, type PioraDeTratamento } from '../regua'
import {
  candidatasDistintas,
  fundoNoPiorCaso,
  gradientesARecusar,
  MOTIVOS_DO_TRATAMENTO,
  planejarTratamentoDaBorda,
  type CandidataDoTratamento,
  type TextoNaBorda,
} from '../tratamento-de-leitura'

const H = 1920
const CLARO = '#F5F5F5'
const ESCURO = '#1E1E1E'
const VEU_ESCURO: CandidataDoTratamento = { cor: '#1A1A1A', origem: 'mancha' }
const VEU_CLARO: CandidataDoTratamento = { cor: '#F2F2F2', origem: 'numeros-da-assinatura' }

/** Um texto de 60 px de altura; no rodapé, a 160–220 px da borda (dentro da faixa de 600 px). */
const texto = (camada: string, cor: string, p02: number, p98: number, y = 1700, extra: Partial<TextoNaBorda> = {}): TextoNaBorda => ({
  camada,
  grupo: `g-${camada}`,
  cor,
  rect: { x: 100, y, width: 800, height: 60 },
  percentis: { p02, p98 },
  ...extra,
})

const planejar = (borda: 'topo' | 'rodape', textos: TextoNaBorda[], candidatas: CandidataDoTratamento[] = [VEU_ESCURO, VEU_CLARO]) =>
  planejarTratamentoDaBorda({ borda, textos, candidatas, curva: CURVA_DE_LEITURA, forcaMinima: 0.45, forcaMaxima: 0.9, altura: 600, H })

describe('os sete casos do CP2A (puros)', () => {
  it('A — texto claro sobre fundo claro: o véu ESCURO vence e alcança o alvo', () => {
    const p = planejar('rodape', [texto('servico', CLARO, 150, 200)])
    expect(p).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO.cor, origemDaCor: 'mancha', alcancaAlvo: true })
    expect(p.textos).toEqual([expect.objectContaining({ polaridade: 'clara', percentil: 'p98', antes: 200, alvo: Math.round(alvoPorContraste(CLARO, 3)), ok: false })])
    expect(p.recusadas).toEqual([{ ...VEU_CLARO, motivo: MOTIVOS_DO_TRATAMENTO.sentidoErrado }])
  })

  it('B — texto escuro sobre fundo escuro: o véu CLARO vence e alcança o alvo', () => {
    const p = planejar('rodape', [texto('servico', ESCURO, 40, 80)])
    expect(p).toMatchObject({ estado: 'tratado', cor: VEU_CLARO.cor, origemDaCor: 'numeros-da-assinatura', alcancaAlvo: true })
    expect(p.textos).toEqual([expect.objectContaining({ polaridade: 'escura', percentil: 'p02', antes: 40, alvo: alvoClaroPorContraste(ESCURO, 3), ok: false })])
    expect(p.recusadas).toEqual([{ ...VEU_ESCURO, motivo: MOTIVOS_DO_TRATAMENTO.sentidoErrado }])
  })

  it('C — texto claro sobre fundo já escuro o bastante: nenhum tratamento (nem cor, nem força)', () => {
    const p = planejar('rodape', [texto('servico', CLARO, 20, 90)])
    expect(p).toEqual({ borda: 'rodape', estado: 'sem-necessidade', grupos: ['g-servico'], textos: [expect.objectContaining({ polaridade: 'clara', ok: true })] })
  })

  it('D — texto escuro sobre fundo já claro o bastante: nenhum tratamento', () => {
    const p = planejar('topo', [texto('headline', ESCURO, 190, 240, 300)])
    expect(p).toMatchObject({ estado: 'sem-necessidade' })
    expect(p.cor).toBeUndefined()
    expect(p.forca).toBeUndefined()
  })

  it('E — topo e rodapé independentes: cada borda com a polaridade dos seus textos, das MESMAS candidatas', () => {
    const topo = planejar('topo', [texto('headline', ESCURO, 40, 80, 300)])
    const rodape = planejar('rodape', [texto('servico', CLARO, 150, 200)])
    expect([topo.cor, rodape.cor]).toEqual([VEU_CLARO.cor, VEU_ESCURO.cor])
  })

  it('F — a candidata que piora (no pior caso previsto) algum texto nunca vence: a próxima, que não piora, vence', () => {
    // Um cinza médio alcança o alvo do serviço, mas CLAREIA o fundo escuro (p98 60) do outro texto claro da borda.
    const medio: CandidataDoTratamento = { cor: '#777777', origem: 'pagina' }
    const p = planejar('rodape', [texto('servico', '#FFFFFF', 150, 200), texto('nota', '#FFFFFF', 30, 60, 1600)], [medio, VEU_ESCURO])
    expect(p).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO.cor })
    expect(p.recusadas).toEqual([{ ...medio, motivo: TRATAMENTO_PIOROU_LEITURA, camada: 'nota' }])
    // Sem a alternativa, a estratégia é inviável: a que piora não é desenhada.
    expect(planejar('rodape', [texto('servico', '#FFFFFF', 150, 200), texto('nota', '#FFFFFF', 30, 60, 1600)], [medio])).toMatchObject({
      estado: 'inviavel',
      motivo: TRATAMENTO_PIOROU_LEITURA,
    })
  })

  it('G — polaridades incompatíveis na mesma borda: a ESTRATÉGIA de tratamento é inviável, com motivo estruturado (não a peça)', () => {
    // Os dois sem leitura: nenhum véu anda nos dois sentidos.
    expect(planejar('rodape', [texto('servico', CLARO, 150, 200), texto('headline', ESCURO, 40, 80, 1600)])).toMatchObject({
      estado: 'inviavel',
      motivo: MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel,
    })
    // Só o claro pede leitura, mas o véu escuro afundaria o fundo claro do texto escuro que já lê.
    const p = planejar('rodape', [texto('servico', CLARO, 150, 200), texto('headline', ESCURO, 172, 190, 1600)])
    expect(p).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel })
    expect(p.recusadas).toEqual(expect.arrayContaining([{ ...VEU_ESCURO, motivo: TRATAMENTO_PIOROU_LEITURA, camada: 'headline' }]))
  })

  it('G (controle) — a mera presença das duas polaridades não condena a borda: o texto escuro FORA da faixa do véu não piora', () => {
    const p = planejar('rodape', [texto('servico', CLARO, 150, 200), texto('headline', ESCURO, 172, 190, 1000)])
    expect(p).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO.cor })
  })
})

describe('as duas direções nunca se invertem', () => {
  it('texto claro nunca ganha véu que clareia: só com candidata clara, a estratégia é inviável (SEM_COR_APROVADA_PARA_A_POLARIDADE)', () => {
    expect(planejar('rodape', [texto('servico', CLARO, 150, 200)], [VEU_CLARO])).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.semCor })
  })

  it('texto escuro nunca ganha véu que escurece: só com candidata escura, inviável (SEM_COR_APROVADA_PARA_A_POLARIDADE)', () => {
    expect(planejar('rodape', [texto('servico', ESCURO, 40, 80)], [VEU_ESCURO])).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.semCor })
  })
})

describe('revisão adversarial do CP2A: o sentido vem do ALVO, a luz do espaço da medida, e o vizinho conta', () => {
  it('texto escuro sobre foto com pontos mais escuros que o véu escuro: o véu escuro NÃO serve (a cor tem de ficar do lado legível do alvo)', () => {
    const escuroComPontos = texto('servico', ESCURO, 10, 230, 1500)
    expect(planejar('rodape', [escuroComPontos], [VEU_ESCURO])).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.semCor })
    expect(planejar('rodape', [escuroComPontos])).toMatchObject({ estado: 'tratado', cor: VEU_CLARO.cor })
    // O espelho: texto claro sobre foto com brilhos acima do creme não ganha o creme.
    expect(planejar('rodape', [texto('servico', '#FFFFFF', 30, 252)], [{ cor: '#F3EADC', origem: 'pagina' }])).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.semCor })
  })

  it('vermelho saturado sobre fundo médio (p02 97, p98 103) é texto CLARO no espaço da medida: ganha véu escuro, nunca o claro', () => {
    expect(luzMedida('#FF0000')).toBeGreaterThan(103)
    expect(polaridadeDoTexto('#FF0000', { p02: 97, p98: 103 })).toEqual({ polaridade: 'clara', por: 'fundo' })
    expect(planejar('rodape', [texto('servico', '#FF0000', 97, 103)])).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO.cor })
  })

  it('o alvo EXATO decide, como na régua: branco com p98 161 (alvo 148,9 + 12 = 160,9) pede véu', () => {
    expect(alvoPorContraste('#FFFFFF', 3)).toBeCloseTo(148.88, 1)
    expect(planejar('rodape', [texto('servico', '#FFFFFF', 120, 161)])).toMatchObject({ estado: 'tratado', textos: [expect.objectContaining({ alvo: 149, ok: false })] })
    expect(planejar('rodape', [texto('servico', '#FFFFFF', 120, 160)])).toMatchObject({ estado: 'sem-necessidade' })
  })

  it('o texto da OUTRA borda que a cauda da faixa alcança também não pode piorar; o que ela não alcança, não conta', () => {
    const claroSemLeitura = texto('servico', CLARO, 150, 200)
    const escuroNaCauda = texto('headline', ESCURO, 172, 190, 1340)
    const plano = (y: number) =>
      planejarTratamentoDaBorda({ borda: 'rodape', textos: [claroSemLeitura], vizinhos: [{ ...escuroNaCauda, rect: { ...escuroNaCauda.rect, y } }], candidatas: [VEU_ESCURO], curva: CURVA_DE_LEITURA, forcaMinima: 0.45, forcaMaxima: 0.9, altura: 600, H })
    expect(plano(1340)).toMatchObject({ estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel })
    expect(plano(400)).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO.cor })
  })
})

describe('força: a faixa da marca só vale quando há necessidade', () => {
  it('pouca necessidade: a força pedida fica abaixo do piso e sai no piso da marca (0.45)', () => {
    const p = planejar('rodape', [texto('servico', CLARO, 120, 160)])
    expect(p.forcaPedida).toBeLessThan(0.45)
    expect(p.forca).toBe(0.45)
  })

  it('cor que não alcança o alvo nem no teto: força no teto e `alcancaAlvo: false` (melhora sem prometer o alvo)', () => {
    const p = planejar('rodape', [texto('servico', '#FFFFFF', 200, 250)], [{ cor: '#808080', origem: 'pagina' }])
    expect(p).toMatchObject({ estado: 'tratado', forca: 0.9, alcancaAlvo: false })
    expect(p.forcaPedida!).toBeGreaterThan(0.9)
  })

  it('entre as que alcançam, vence a origem mais preferida; a que só melhora perde para a que alcança', () => {
    const fraca: CandidataDoTratamento = { cor: '#808080', origem: 'pagina' }
    const p = planejar('rodape', [texto('servico', '#FFFFFF', 200, 250)], [fraca, VEU_ESCURO])
    expect(p).toMatchObject({ cor: VEU_ESCURO.cor, alcancaAlvo: true })
  })
})

describe('o que o plano não julga fica dito', () => {
  it('texto com caixa de fundo própria e cor que não é #hex ficam fora do plano (e não pedem véu)', () => {
    const p = planejar('rodape', [texto('pilula', CLARO, 150, 200, 1700, { caixaDeFundo: true }), texto('rgba', 'rgba(255,255,255,1)', 150, 200)])
    expect(p).toMatchObject({ estado: 'sem-necessidade', foraDoPlano: ['pilula', 'rgba'], textos: [] })
  })
})

describe('polaridade do texto (a mesma de quem detecta a piora no CP1)', () => {
  it('lados de leitura: escuro demais só lê sobre claro; claro demais só sobre escuro; luz média lê dos dois lados', () => {
    expect(ladosDeLeitura(ESCURO)).toEqual({ clara: false, escura: true })
    expect(ladosDeLeitura(CLARO)).toEqual({ clara: true, escura: false })
    expect(ladosDeLeitura('#DC0909')).toEqual({ clara: true, escura: true })
  })

  it('pelo fundo quando ele não deixa dúvida — mas texto escuro demais para ler como claro é escuro mesmo sobre fundo mais escuro', () => {
    expect(polaridadeDoTexto('#DC0909', { p02: 10, p98: 40 })).toEqual({ polaridade: 'clara', por: 'fundo' })
    expect(polaridadeDoTexto('#DC0909', { p02: 120, p98: 230 })).toEqual({ polaridade: 'escura', por: 'fundo' })
    expect(polaridadeDoTexto(ESCURO, { p02: 5, p98: 20 })).toEqual({ polaridade: 'escura', por: 'cor-do-texto' })
    expect(polaridadeDoTexto('#F4301A', { p02: 56, p98: 225 })).toEqual({ polaridade: 'clara', por: 'cor-do-texto' })
    expect(polaridadeDoTexto('rgba(0,0,0,1)', { p02: 0, p98: 0 })).toBeNull()
  })
})

describe('peças do modelo', () => {
  it('faixaDeOpacidade: os extremos da curva no trecho que a caixa ocupa; além do fim da faixa, zero', () => {
    expect(faixaDeOpacidade(CURVA_DE_LEITURA, 0, 0.1)).toEqual({ min: 1, max: 1 })
    const meio = faixaDeOpacidade(CURVA_DE_LEITURA, 0.2, 0.6)
    expect(meio.max).toBeGreaterThan(meio.min)
    expect(faixaDeOpacidade(CURVA_DE_LEITURA, 1.2, 1.5)).toEqual({ min: 0, max: 0 })
  })

  it('fundoNoPiorCaso: véu mais claro que o fundo sobe pela opacidade MAIOR; mais escuro, desce pela MENOR', () => {
    expect(fundoNoPiorCaso({ p02: 40, p98: 80 }, 240, 0.5, { min: 0.4, max: 1 })).toEqual({ p02: 40 + 0.5 * 0.4 * 200, p98: 80 + 0.5 * 1 * 160 })
    expect(fundoNoPiorCaso({ p02: 150, p98: 200 }, 20, 0.5, { min: 0.4, max: 1 })).toEqual({ p02: 150 - 0.5 * 1 * 130, p98: 200 - 0.5 * 0.4 * 180 })
  })

  it('candidatasDistintas: sem repetir a cor (fica a origem mais preferida) e só #hex', () => {
    expect(
      candidatasDistintas([
        { cor: '#283D36', origem: 'mancha' },
        { cor: '#283d36', origem: 'biblioteca-legada' },
        { cor: 'rgba(0,0,0,.5)', origem: 'pagina' },
        { cor: null, origem: 'numeros-da-assinatura' },
        { cor: '#F3EADC', origem: 'biblioteca-legada' },
      ]),
    ).toEqual([
      { cor: '#283D36', origem: 'mancha' },
      { cor: '#F3EADC', origem: 'biblioteca-legada' },
    ])
  })

  it('gradientesARecusar: só os automáticos; com vários sob o texto, o que empurra o fundo CONTRA ele', () => {
    const piora = (gradientes: string[]): PioraDeTratamento => ({
      codigo: TRATAMENTO_PIOROU_LEITURA,
      grupo: 'g',
      camada: 't',
      camadas: ['t'],
      gradiente: gradientes.length === 1 ? gradientes[0] : null,
      gradientes,
      polaridade: 'clara',
      polaridadePor: 'fundo',
      percentil: 'p98',
      antes: 100,
      depois: 120,
      tolerancia: 2,
      luzDoTexto: 245,
    })
    // A luz de cada véu automático (espaço da medida). O texto claro (p98 100 antes) piorou.
    const automaticos = new Map([['gradiente-leitura-rodape', 26], ['gradiente-leitura-topo', 240]])
    // O explícito do template (fora do mapa) nunca sai; com ele sob o texto, sai só o automático que CLAREIA o fundo.
    expect(gradientesARecusar([piora(['gradiente-da-equipe', 'gradiente-leitura-topo'])], automaticos)).toEqual(['gradiente-leitura-topo'])
    expect(gradientesARecusar([piora(['gradiente-leitura-topo', 'gradiente-leitura-rodape'])], automaticos)).toEqual(['gradiente-leitura-topo'])
    expect(gradientesARecusar([piora(['gradiente-da-equipe'])], automaticos)).toEqual([])
    // Só automáticos sob o texto, nenhum contra ele: a régua provou o conjunto pior — saem.
    expect(gradientesARecusar([piora(['gradiente-leitura-rodape'])], automaticos)).toEqual(['gradiente-leitura-rodape'])
    // O explícito do template (claro) sob o texto e a cauda de um automático escuro, que ajuda: a piora é do explícito; o automático fica.
    expect(gradientesARecusar([piora(['gradiente-explicito', 'gradiente-leitura-rodape'])], new Map([['gradiente-leitura-rodape', 26]]))).toEqual([])
  })
})

describe('gradiente de leitura × decorativo na página de assinatura', () => {
  const pagina = { width: 1080, height: 1920 }
  const gradiente = (extra: Partial<Layer> & { style?: Record<string, unknown> }, paradas = [1, 0.5, 0]): Layer =>
    ({
      id: 'g',
      name: 'g',
      type: 'gradient',
      visible: true,
      locked: false,
      order: 1,
      position: { x: 0, y: 0 },
      size: { width: 1080, height: 1920 },
      ...extra,
      style: {
        gradientType: 'linear',
        gradientAngle: 169,
        gradientStops: paradas.map((opacity, i) => ({ id: `s${i}`, position: i / (paradas.length - 1), color: '#130D0A', opacity })),
        ...(extra.style ?? {}),
      },
    }) as Layer

  it('a forma dos gradientes das páginas de assinatura em produção (14/10/2026) é de leitura', () => {
    // Wine Vix: a página inteira, forte no topo (169°).
    expect(ehGradienteDeLeituraDaPagina(gradiente({}), pagina)).toBe(true)
    // TERO: rodapé, y 894 + altura 1026 = 1920 (11°).
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 894 }, size: { width: 1080, height: 1026 }, style: { gradientAngle: 11 } }), pagina)).toBe(true)
    // Quintal: creme no rodapé, começando em 120 e passando da borda (7°).
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 120 }, size: { width: 1080, height: 1920 }, style: { gradientAngle: 7 } }), pagina)).toBe(true)
  })

  it('decorativo não é tratamento: radial, faixa parcial, solto no meio, tinta que não some', () => {
    expect(ehGradienteDeLeituraDaPagina(gradiente({ style: { gradientType: 'radial' } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ size: { width: 500, height: 1920 } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 600 }, size: { width: 1080, height: 600 } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({}, [0.6, 0.5, 0.4]), pagina)).toBe(false)
  })

  it('os segmentos dos gradientes de produção (Quintal creme no rodapé, TERO no rodapé) e o topo arrastado 20 px seguem de leitura', () => {
    const seg = (inicioX: number, inicioY: number, fimX: number, fimY: number) => ({ gradientStartX: inicioX, gradientStartY: inicioY, gradientEndX: fimX, gradientEndY: fimY })
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 120 }, style: { gradientAngle: 7, ...seg(0.3153, 1.0345, 0.4501, 0.4291) } }, [1, 0.5, 0]), pagina)).toBe(true)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 894 }, size: { width: 1080, height: 1026 }, style: { gradientAngle: 1, ...seg(0.3928, 1.0804, 0.4158, 0) } }, [0.92, 0.5, 0]), pagina)).toBe(true)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: 0, y: 20 }, size: { width: 1080, height: 900 } }), pagina)).toBe(true)
  })

  it('lateral, diagonal, segmento horizontal, faixa no meio pelas paradas, rotação e caixa deslocada são decorativos', () => {
    expect(ehGradienteDeLeituraDaPagina(gradiente({ style: { gradientAngle: 90 } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ style: { gradientAngle: 45 } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ style: { gradientStartX: 0, gradientStartY: 0.5, gradientEndX: 1, gradientEndY: 0.5 } }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({}, [0, 0.8, 0]), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ rotation: 90 }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ position: { x: -300, y: 0 } }), pagina)).toBe(false)
    // Opacidade ABSOLUTA: uma faixa tênue (0.2 → 0) é tinta decorativa; a que zera no meio e volta opaca no fim, também.
    expect(ehGradienteDeLeituraDaPagina(gradiente({}, [0.2, 0.1, 0]), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina(gradiente({}, [1, 0, 1]), pagina)).toBe(false)
    // A borda forte mais fraca de produção (TERO, 0.55) segue de leitura.
    expect(ehGradienteDeLeituraDaPagina(gradiente({}, [0.55, 0.3, 0]), pagina)).toBe(true)
  })

  it('a borda do gradiente sem ângulo é a do render (0°: começa embaixo), e o segmento só vale com os quatro números', () => {
    expect(bordaDaCamadaDeGradiente(gradiente({ style: { gradientAngle: undefined } }))).toBe('rodape')
    expect(bordaDaCamadaDeGradiente(gradiente({ style: { gradientAngle: 180 } }))).toBe('topo')
    expect(bordaDaCamadaDeGradiente(gradiente({ style: { gradientAngle: 0, gradientStartY: 0, gradientEndY: 1 } }))).toBe('rodape')
  })

  it('o marcado como tratamento de leitura conta sempre; camada oculta ou que não é gradiente, nunca', () => {
    expect(ehGradienteDeLeituraDaPagina(gradiente({ size: { width: 300, height: 300 }, metadata: { tratamentoDeTexto: 'gradiente-de-leitura' } }), pagina)).toBe(true)
    expect(ehGradienteDeLeituraDaPagina(gradiente({ visible: false }), pagina)).toBe(false)
    expect(ehGradienteDeLeituraDaPagina({ ...gradiente({}), type: 'shape' } as Layer, pagina)).toBe(false)
  })

  it('luz das candidatas: o véu escuro anda abaixo do alvo do texto claro; o claro acima do alvo do escuro', () => {
    expect(luzDaCor(VEU_ESCURO.cor)).toBeLessThan(alvoPorContraste(CLARO, 3))
    expect(luzDaCor(VEU_CLARO.cor)).toBeGreaterThan(alvoClaroPorContraste(ESCURO, 3))
  })
})
