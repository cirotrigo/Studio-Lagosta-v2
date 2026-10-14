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

  it('UMA cor de véu para a peça inteira: #F3EADC no topo e no rodapé, forças 0.9 e 0.45 (o defeito de polaridade)', () => {
    const resumo = (gs: Array<{ borda: string; cor: string; forca: number; altura: number }>) => gs.map(({ borda, cor, forca, altura }) => ({ borda, cor, forca, altura }))
    expect(resumo(composta.diagnostico.gradientes ?? [])).toEqual(resumo(fixture.peca().composicaoRegistrada.gradientes))
    expect(composta.diagnostico.gradientes?.map((g) => g.cor)).toEqual(['#F3EADC', '#F3EADC'])
    // A cor que de fato foi desenhada em cada borda.
    for (const id of ['gradiente-leitura-topo', 'gradiente-leitura-rodape']) {
      const stops = (camada(composta.layers, id).style as { gradientStops: Array<{ color: string }> }).gradientStops
      expect(new Set(stops.map((s) => s.color))).toEqual(new Set(['#F3EADC']))
    }
  })

  it('CP1: o diagnóstico de cada borda traz a cor DESENHADA na camada, a força, a altura e a origem da cor', () => {
    for (const g of composta.diagnostico.gradientes ?? []) {
      const desenhada = camada(composta.layers, `gradiente-leitura-${g.borda}`)
      const stops = (desenhada.style as { gradientStops: Array<{ color: string }> }).gradientStops
      expect({ borda: g.borda, cor: g.cor, forca: g.forca, altura: g.altura }).toEqual({ borda: g.borda, cor: stops[0].color, forca: desenhada.metadata?.forca, altura: desenhada.size.height })
      expect(g.origemDaCor).toBe('contraste-com-os-textos')
    }
  })

  it('CP1: o diagnóstico acusa TRATAMENTO_PIOROU_LEITURA no serviço (texto claro, o véu creme sobe o p98 ≈166→194) — só acusa, não corrige', () => {
    const servico = composta.diagnostico.tratamentoPiorou?.find((p) => p.camada === 'servico')
    expect(servico).toMatchObject({ codigo: 'TRATAMENTO_PIOROU_LEITURA', polaridade: 'clara', percentil: 'p98', gradiente: 'gradiente-leitura-rodape' })
    expect(Math.abs(servico!.antes - 166)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    expect(Math.abs(servico!.depois - 194)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
  })

  it('o serviço sai com p98 ≈166→194 contra alvo 139 (ok:false) — e a peça é montada mesmo assim, só com aviso', () => {
    const servico = composta.diagnostico.contraste?.flatMap((m) => m.textos ?? []).find((t) => t.camada === 'servico')
    expect(servico).toBeDefined()
    expect(Math.abs(servico!.p98SemHalo - 166)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    expect(Math.abs(servico!.p98ComHalo - 194)).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    expect(servico!.ok).toBe(false)
    expect(composta.diagnostico.avisos.some((a) => /p98 \d+ contra alvo 139/.test(a))).toBe(true)
    expect(composta.layers.length).toBeGreaterThan(0)
  })

  it('os halos que a assinatura desenhou por grupo somem, sem substituto medido', () => {
    const daAssinatura = fixture.assinatura().pagina.layers.filter((l) => l.type === 'text' && l.effects?.background?.enabled)
    expect(daAssinatura.map((l) => l.name).sort()).toEqual(['apoio', 'headline', 'servico'])
    expect(composta.layers.filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
  })

  it('a logo é o wordmark claro da assinatura, no canto pedido, sem medida ("tinta" 0)', () => {
    expect(composta.diagnostico.logo).toEqual({ canto: 'superior-direito', tinta: 0 })
    expect(logo).not.toBeNull()
    expect(logo!.luzDaLogo).toBeGreaterThan(200)
  })
})

describe('propriedades na peça composta (v1)', () => {
  hojeViola('P1 polaridade — nenhum tratamento de leitura piora a leitura de um texto', () => {
    expect(tratamentosQuePioram(leituras), JSON.stringify(tratamentosQuePioram(leituras))).toEqual([])
  })

  it('P2 headline e apoio — leitura dentro do alvo de 3:1 (passa hoje; o apoio só pela tolerância da régua)', () => {
    expect(leituraDentroDoAlvo(leitura('headline'))).toBe(true)
    expect(leituraDentroDoAlvo(leitura('apoio'))).toBe(true)
  })

  hojeViola('P3 serviço — leitura dentro do alvo de 3:1', () => {
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

  hojeViola('P4 logo — critério regional (p10 da diferença pixel a pixel ≥ 45), ou LOGO_SEM_VARIANTE_LEGIVEL / PREFERENCIA_INVIAVEL (o canto veio do DNA)', () => {
    const sinalizada = [CODIGOS.logoSemVariante, CODIGOS.preferenciaInviavel].some((c) => JSON.stringify(composta.diagnostico).includes(c))
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
    const sinalizado = JSON.stringify(composta.diagnostico).includes(CODIGOS.preferenciaInviavel)
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
