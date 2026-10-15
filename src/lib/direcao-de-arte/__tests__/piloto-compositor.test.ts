/**
 * CP0 — o COMPOSITOR REAL sobre a peça piloto: caracterização do que ele faz
 * hoje e as propriedades P1–P8 da Constituição sobre a peça composta.
 *
 * `hojeViola` = a propriedade falha hoje por um defeito conhecido (auditoria de
 * 13/10/2026); o checkpoint que a corrigir troca o marcador por `it()`.
 * Os `it()` de "caracterização" fixam o estado atual que prova a fidelidade
 * do harness — eles mudam junto com a correção.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { cenario } from './suporte/compositor'
import { cenarioDoPiloto } from './suporte/cenario-do-piloto'
import { arquivosDaFixture, comArquivos, exigirMedidaFiel, fixture } from './suporte/fixture'
import { hojeViola } from './suporte/hoje-viola'
import {
  CODIGOS,
  foraDaInterface,
  interfaceDoStory,
  K_REFERENCIA_HIERARQUIA,
  leituraDaLogo,
  leituraDentroDoAlvo,
  leiturasDosTextos,
  LIMIAR_DE_CONTRASTE_DA_LOGO,
  ordemDeLeituraInvertida,
  PISO_DE_INTERFACE_DO_STORY,
  resumoDaLogo,
  servicoDisputaEntrada,
  telemetriaDeEscala,
  textosQueInvadem,
  tratamentosQuePioram,
  type LeituraDaLogo,
  type LeituraDoTexto,
} from './suporte/propriedades'

const CANVAS = { width: 1080, height: 1920 }
const TOLERANCIA_DA_FIXTURE = 4

let composta: ResultadoDaComposicao
let comRegiao: ResultadoDaComposicao
let leituras: LeituraDoTexto[]
let logo: LeituraDaLogo | null

beforeAll(async () => {
  const comoNaProducao = await cenarioDoPiloto()
  cenario.atual = comoNaProducao.cenario
  composta = await comporPeca(comoNaProducao.spec, { somenteAvaliar: true })
  const anotado = await cenarioDoPiloto({ regiaoProtegidaNoCatalogo: true })
  cenario.atual = anotado.cenario
  comRegiao = await comporPeca(anotado.spec, { somenteAvaliar: true })
  exigirMedidaFiel(composta.layers)
  leituras = await leiturasDosTextos(composta.layers, CANVAS)
  logo = await leituraDaLogo(composta.layers, CANVAS)
}, 120_000)

const camada = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const leitura = (id: string) => leituras.find((l) => l.camada === id)!

describe('caracterização: o que o compositor faz hoje com a peça piloto', () => {
  it('pousa os blocos e a logo onde a produção pousou (posições; o tamanho é do medidor calibrado, não é prova)', () => {
    for (const id of ['headline', 'apoio', 'servico', 'logo']) {
      expect({ id, position: camada(composta.layers, id).position }).toEqual({ id, position: camada(fixture.peca().v1.layers, id).position })
    }
  })

  it('CP2A: cada borda com o véu da polaridade dos SEUS textos — topo creme (texto escuro), rodapé verde da mancha (serviço claro); altura e posição as de antes', () => {
    const resumo = (gs: Array<{ borda: string; cor: string; forca: number; altura: number }>) => gs.map(({ borda, cor, forca, altura }) => ({ borda, cor, forca, altura }))
    expect(resumo(composta.diagnostico.gradientes ?? [])).toEqual([
      { borda: 'topo', cor: '#F3EADC', forca: 0.9, altura: 665 },
      { borda: 'rodape', cor: '#283D36', forca: 0.45, altura: 576 },
    ])
    expect(resumo(composta.diagnostico.gradientes ?? []).map((g) => g.altura)).toEqual(fixture.peca().composicaoRegistrada.gradientes.map((g) => g.altura))
    for (const [id, cor] of [['gradiente-leitura-topo', '#F3EADC'], ['gradiente-leitura-rodape', '#283D36']]) {
      const stops = (camada(composta.layers, id).style as { gradientStops: Array<{ color: string }> }).gradientStops
      expect(new Set(stops.map((s) => s.color))).toEqual(new Set([cor]))
    }
  })

  it('CP1/CP2A: o diagnóstico de cada borda traz a cor DESENHADA, a força, a altura e a origem — o creme da biblioteca legada, o verde da mancha da assinatura', () => {
    for (const g of composta.diagnostico.gradientes ?? []) {
      const desenhada = camada(composta.layers, `gradiente-leitura-${g.borda}`)
      const stops = (desenhada.style as { gradientStops: Array<{ color: string }> }).gradientStops
      expect({ borda: g.borda, cor: g.cor, forca: g.forca, altura: g.altura }).toEqual({ borda: g.borda, cor: stops[0].color, forca: desenhada.metadata?.forca, altura: desenhada.size.height })
    }
    expect(composta.diagnostico.gradientes?.map((g) => [g.borda, g.origemDaCor])).toEqual([['topo', 'biblioteca-legada'], ['rodape', 'mancha']])
  })

  it('CP2A: o diagnóstico do tratamento por borda — fundo antes, alvo, cor, força, fundo depois, efeito e a candidata recusada', () => {
    const porBorda = Object.fromEntries((composta.diagnostico.tratamentoDeLeitura ?? []).map((t) => [t.borda, t]))
    expect(porBorda.topo).toMatchObject({ estado: 'tratado', cor: '#F3EADC', origemDaCor: 'biblioteca-legada', forca: 0.9, recusadas: [{ cor: '#283D36', origem: 'mancha', motivo: 'SENTIDO_ERRADO' }] })
    expect(porBorda.topo.textos.map(({ camada, polaridade, efeito }) => ({ camada, polaridade, efeito }))).toEqual([
      { camada: 'headline', polaridade: 'escura', efeito: 'melhorou' },
      { camada: 'apoio', polaridade: 'escura', efeito: 'melhorou' },
    ])
    expect(porBorda.rodape).toMatchObject({ estado: 'tratado', cor: '#283D36', origemDaCor: 'mancha', forca: 0.45, alcancaAlvo: true })
    expect(porBorda.rodape.textos).toEqual([expect.objectContaining({ camada: 'servico', polaridade: 'clara', percentil: 'p98', alvo: 139, efeito: 'melhorou' })])
  })

  it('CP2A: nenhum tratamento piora (TRATAMENTO_PIOROU_LEITURA vazio) e o serviço sai no alvo, p98 ≈165→120 contra 139, sem aviso', () => {
    expect(composta.diagnostico.tratamentoPiorou).toEqual([])
    const servico = composta.diagnostico.contraste?.flatMap((m) => m.textos ?? []).find((t) => t.camada === 'servico')
    expect(Math.abs(servico!.p98SemHalo - 166)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    expect(Math.abs(servico!.p98ComHalo - 120)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    expect(servico!.ok).toBe(true)
    expect(composta.diagnostico.avisos.some((a) => /contra alvo 139/.test(a))).toBe(false)
  })

  it('os halos que a assinatura desenhou por grupo somem, sem substituto medido', () => {
    const daAssinatura = fixture.assinatura().pagina.layers.filter((l) => l.type === 'text' && l.effects?.background?.enabled)
    expect(daAssinatura.map((l) => l.name).sort()).toEqual(['apoio', 'headline', 'servico'])
    expect(composta.layers.filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
  })

  it('a logo é o wordmark claro da assinatura, no canto pedido; desde o CP3 ela vem MEDIDA (sem arquétipo: só diagnóstico, a peça não muda)', () => {
    expect(composta.diagnostico.logo).toMatchObject({ canto: 'superior-direito', tinta: 0 })
    expect(logo).not.toBeNull()
    expect(logo!.luzDaLogo).toBeGreaterThan(200)
    const leitura = composta.diagnostico.logo!.legibilidade!
    expect(leitura.estado).toBe('medida')
    expect(leitura.legivel).toBe(false)
    expect(leitura.escolha).toBe('sem-mudanca')
    // A medida de produção e o oráculo do CP0 concordam no critério (o mesmo pixel, a mesma luz 709, o mesmo alfa).
    expect(leitura.medida!.contrasteP10).toBeCloseTo(logo!.p10, 0)
    expect(leitura.medida!.pixelsAvaliados).toBe(logo!.pixelsOpacos)
  })
})

describe('propriedades na peça composta (v1)', () => {
  it('P1 polaridade — nenhum tratamento de leitura piora a leitura de um texto (CP2A)', () => {
    expect(tratamentosQuePioram(leituras), JSON.stringify(tratamentosQuePioram(leituras))).toEqual([])
  })

  it('P2 headline e apoio — leitura dentro do alvo de 3:1 (passa hoje; o apoio só pela tolerância da régua)', () => {
    expect(leituraDentroDoAlvo(leitura('headline'))).toBe(true)
    expect(leituraDentroDoAlvo(leitura('apoio'))).toBe(true)
  })

  it('P3 serviço — leitura dentro do alvo de 3:1 (CP2A: véu escuro no rodapé, na posição de hoje)', () => {
    expect(leituraDentroDoAlvo(leitura('servico')), JSON.stringify(leitura('servico'))).toBe(true)
  })

  it('P4 (caracterização) — a logo não lê hoje pelo critério regional (p10 < 45)', () => {
    expect(logo!.pixelsOpacos).toBeGreaterThan(1000)
    expect(logo!.legivel, resumoDaLogo(logo!)).toBe(false)
  })

  it('P4 (caracterização) — no canto pedido, NENHUMA das duas variantes cadastradas lê na v1 pelo critério regional', async () => {
    const arquivos = await arquivosDaFixture()
    const v1 = comArquivos(fixture.peca().v1.layers, arquivos)
    const comMonograma = v1.map((l) => (l.type === 'logo' ? { ...l, fileUrl: arquivos['fixture:logo-monograma'] } : l))
    const [wordmark, monograma] = await Promise.all([leituraDaLogo(v1, CANVAS), leituraDaLogo(comMonograma, CANVAS)])
    expect(wordmark!.legivel, resumoDaLogo(wordmark!)).toBe(false)
    expect(monograma!.legivel, resumoDaLogo(monograma!)).toBe(false)
    // Por que a MÉDIA sozinha não decide: o monograma passaria na média (≈46), mas as partes creme
    // somem no véu — o p10 fica em ≈21 e menos da metade dos pixels atinge o limiar.
    expect(monograma!.media).toBeGreaterThanOrEqual(LIMIAR_DE_CONTRASTE_DA_LOGO)
    expect(monograma!.fracaoNoLimiar).toBeLessThan(0.9)
  })

  it('P4 logo — critério regional (p10 da diferença pixel a pixel ≥ 45), ou LOGO_SEM_VARIANTE_LEGIVEL / PREFERENCIA_INVIAVEL (o canto veio do DNA) — CP3 sinaliza', () => {
    const sinalizada = [CODIGOS.logoSemVariante, CODIGOS.preferenciaInviavel].some((c) => JSON.stringify(composta.diagnostico.logo).includes(c))
    expect(sinalizada || logo!.legivel, resumoDaLogo(logo!)).toBe(true)
  })

  it('P5 região protegida — com a vitrine (produto) no catálogo, nenhum texto a invade (passa hoje)', () => {
    expect(comRegiao.diagnostico.assuntoOrigem).toBe('catalogo')
    expect(textosQueInvadem(comRegiao.layers, fixture.foto().regiaoProtegida.naPeca)).toEqual([])
  })

  hojeViola('P6 safe interface — texto e logo fora das faixas da UI do story (piso 188/224)', () => {
    const fora = foraDaInterface(composta.layers, CANVAS, interfaceDoStory())
    expect(fora, JSON.stringify(fora)).toEqual([])
  })

  hojeViola('P7 ordem de leitura — o bloco de ordem 0 da spec (QUARTA-FEIRA) fica acima do H1, ou o conflito com a assinatura sai como PREFERENCIA_INVIAVEL', () => {
    const inversoes = ordemDeLeituraInvertida(composta.layers, fixture.peca().spec.blocos)
    // O sinal tem de ser da ORDEM, não da logo: desde o CP3 o diagnóstico da logo sinaliza o próprio PREFERENCIA_INVIAVEL.
    const sinalizado = JSON.stringify({ ...composta.diagnostico, logo: null }).includes(CODIGOS.preferenciaInviavel)
    expect(sinalizado || inversoes.length === 0, JSON.stringify(inversoes)).toBe(true)
  })

  it('P7/P8 papel e geometria (duros) — o serviço não assume a entrada do H1 nem se sobrepõe a ele (passa hoje)', () => {
    expect(servicoDisputaEntrada(composta.layers)).toEqual([])
  })

  it(`telemetria de escala na piloto — razão H1/secundário registrada contra a referência ${K_REFERENCIA_HIERARQUIA} (nunca reprova)`, () => {
    const t = telemetriaDeEscala(composta.layers)
    expect(t).not.toBeNull()
    expect(t!.razao).toBeCloseTo(84 / 40, 5)
    expect(t!.abaixoDaReferencia).toBe(false)
  })
})

describe('K de hierarquia NÃO é gate (decisão do owner, 13/10/2026)', () => {
  // H1 a 44 e serviço a 40 (razão 1,1 < 1,25), na ordem certa e sem sobreposição.
  const texto = (id: string, y: number, fontSize: number): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: id, position: { x: 90, y }, size: { width: 800, height: fontSize + 12 }, style: { fontSize } })
  const peca = [texto('headline', 400, 44), texto('servico', 1500, 40)]

  it('uma peça abaixo da referência passa nas propriedades duras de hierarquia', () => {
    expect(ordemDeLeituraInvertida(peca, [{ ordem: 0, papel: 'headline' }, { ordem: 1, papel: 'servico' }])).toEqual([])
    expect(servicoDisputaEntrada(peca)).toEqual([])
  })

  it('e só a telemetria registra que ficou abaixo da referência', () => {
    expect(telemetriaDeEscala(peca)).toMatchObject({ referencia: K_REFERENCIA_HIERARQUIA, abaixoDaReferencia: true })
  })
})

describe('safe interface ≠ geometria de composição (decisões do owner, 13/10/2026)', () => {
  it('o piso HARD de interface é 188/224, e uma configuração de INTERFACE do cliente só pode apertar', () => {
    expect(interfaceDoStory()).toEqual(PISO_DE_INTERFACE_DO_STORY)
    expect(interfaceDoStory({ topo: 100, rodape: 90 })).toEqual({ topo: 188, rodape: 224 })
    expect(interfaceDoStory({ topo: 200, rodape: 260 })).toEqual({ topo: 200, rodape: 260 })
  })

  it('Project.assinatura.geometria.story (250/350) é geometria de composição / configuração LEGADA: não entra na safe interface', () => {
    const numeros = fixture.assinatura().numerosDoProjeto as { geometria: { story: { safeTopo: number; safeRodape: number } } }
    expect(numeros.geometria.story).toMatchObject({ safeTopo: 250, safeRodape: 350 })
    expect(interfaceDoStory()).toEqual({ topo: 188, rodape: 224 })
  })

  it('caracterização: hoje a geometria derivada da página (148) sobrepõe a do projeto (250) sem aviso — a reconciliar/migrar, nunca vencer em silêncio', () => {
    expect(camada(composta.layers, 'headline').position.y).toBe(148)
    expect(composta.diagnostico.avisos.some((a) => /250|geometria/i.test(a))).toBe(false)
  })
})
