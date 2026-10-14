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
  K_DA_HIERARQUIA,
  leituraDaLogo,
  leituraDentroDoAlvo,
  leiturasDosTextos,
  LIMIAR_DE_CONTRASTE_DA_LOGO,
  ordemDeLeituraInvertida,
  PISO_DE_INTERFACE_DO_STORY,
  servicoDisputaEntrada,
  textosQueInvademOAssunto,
  tratamentosQuePioram,
  type LeituraDaLogo,
  type LeituraDoTexto,
} from './suporte/propriedades'

const CANVAS = { width: 1080, height: 1920 }
const TOLERANCIA_DA_FIXTURE = 4

let composta: ResultadoDaComposicao
let comAssunto: ResultadoDaComposicao
let leituras: LeituraDoTexto[]
let logo: LeituraDaLogo | null

beforeAll(async () => {
  const comoNaProducao = await cenarioDoPiloto()
  cenario.atual = comoNaProducao.cenario
  composta = await comporPeca(comoNaProducao.spec, { somenteAvaliar: true })
  const anotado = await cenarioDoPiloto({ assuntoNoCatalogo: true })
  cenario.atual = anotado.cenario
  comAssunto = await comporPeca(anotado.spec, { somenteAvaliar: true })
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
    // A cor que de fato foi desenhada em cada borda (o diagnóstico só registra a global).
    for (const id of ['gradiente-leitura-topo', 'gradiente-leitura-rodape']) {
      const stops = (camada(composta.layers, id).style as { gradientStops: Array<{ color: string }> }).gradientStops
      expect(new Set(stops.map((s) => s.color))).toEqual(new Set(['#F3EADC']))
    }
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

  it('P4 (caracterização) — a logo tem hoje contraste abaixo do limiar contra o fundo efetivo', () => {
    expect(logo!.pixelsOpacos).toBeGreaterThan(1000)
    expect(logo!.contraste).toBeLessThan(LIMIAR_DE_CONTRASTE_DA_LOGO)
  })

  it('P4 (caracterização) — no canto pedido, NENHUMA das duas variantes cadastradas lê na v1 (wordmark ≈17, monograma ≈38)', async () => {
    const arquivos = await arquivosDaFixture()
    const v1 = comArquivos(fixture.peca().v1.layers, arquivos)
    const comMonograma = v1.map((l) => (l.type === 'logo' ? { ...l, fileUrl: arquivos['fixture:logo-monograma'] } : l))
    const [wordmark, monograma] = await Promise.all([leituraDaLogo(v1, CANVAS), leituraDaLogo(comMonograma, CANVAS)])
    expect(wordmark!.contraste).toBeLessThan(LIMIAR_DE_CONTRASTE_DA_LOGO)
    expect(monograma!.contraste).toBeLessThan(LIMIAR_DE_CONTRASTE_DA_LOGO)
  })

  hojeViola('P4 logo — contraste ≥ 45 contra o fundo efetivo, ou LOGO_SEM_VARIANTE_LEGIVEL / PREFERENCIA_INVIAVEL (o canto veio do DNA)', () => {
    const sinalizada = [CODIGOS.logoSemVariante, CODIGOS.preferenciaInviavel].some((c) => JSON.stringify(composta.diagnostico).includes(c))
    expect(sinalizada || logo!.contraste >= LIMIAR_DE_CONTRASTE_DA_LOGO, `contraste ${logo!.contraste.toFixed(1)}`).toBe(true)
  })

  it.todo('P4 critério por REGIÃO da logo (uma parte some e a média esconde) — pending-owner-decision; hoje o limiar vale sobre a média dos pixels opacos')

  it('P5 zona — com a vitrine anotada no catálogo, nenhum texto invade o assunto (passa hoje)', () => {
    expect(comAssunto.diagnostico.assuntoOrigem).toBe('catalogo')
    expect(textosQueInvademOAssunto(comAssunto.layers, fixture.foto().assuntoAnotado.naPeca)).toEqual([])
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

  it.todo(`P7 razão de escala H1 / maior secundário ≥ K — pending-owner-decision (K_DA_HIERARQUIA = ${K_DA_HIERARQUIA})`)

  it('P8 serviço × H1 — serviço secundário: corpo menor e abaixo do H1 (passa hoje)', () => {
    expect(servicoDisputaEntrada(composta.layers)).toEqual([])
  })
})

describe('contrato da safe interface (decisão do owner, 13/10/2026)', () => {
  it('o piso é 188/224 e a configuração do cliente só pode apertar', () => {
    expect(interfaceDoStory()).toEqual(PISO_DE_INTERFACE_DO_STORY)
    expect(interfaceDoStory({ topo: 100, rodape: 90 })).toEqual({ topo: 188, rodape: 224 })
    expect(interfaceDoStory({ topo: 250, rodape: 350 })).toEqual({ topo: 250, rodape: 350 })
  })

  it.todo('pending-owner-decision: Project.assinatura.geometria.story (250/350) é safe interface ou margem de composição? Hoje a derivação pela página o sobrepõe (148/100)')
})
