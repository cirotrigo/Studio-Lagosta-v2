/**
 * CP5a — o gate puro (`gate.ts`): a matriz G1–G29 do contrato (`docs/PLANO-2026-10-15-CP5A-CONTRATO.md`, PR #236,
 * aprovado no HEAD 08a44af5). Fixtures de MEDIDA sintéticas sobre o relatório REAL de `avaliarPeca`; a paridade
 * com o render (G21c/G21e) usa o renderizador do servidor de verdade. Nada de banco, nada de produção.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { MedidaDaLogo } from '@/lib/compositor/legibilidade-da-logo'
import { REGRAS_DA_REVISAO, type AchadoDaRevisao } from '../contrato'
import { avaliarPeca, type EntradaDaRevisao, type LeituraDaLogoNaRevisao } from '../regras'
import { copyVersionDe } from '../versao'
import { measureTextLayers, toleranciaDeColisao, encaixeEntre } from '@/lib/creatives/text-geometry'
import {
  CHAVES_CLASSIFICADAS,
  CONFERENCIAS_DO_GATE,
  FOLGA_DE_ANTIALIAS,
  NAO_CRITICAS,
  PISO_DE_INTERFACE_DO_STORY,
  POLITICA_DO_ASSUNTO_RECOMENDADA,
  REGRAS_CRITICAS,
  achadoCritico,
  cenariosNaoMedidos,
  decidirCritica,
  foraDaInterface,
  gateDaMedida,
  interfaceDoStory,
  limitesDe,
  limitesDoTexto,
  type EntradaDoGate,
  type MedidaDaPeca,
  type PoliticaDoAssunto,
} from '../gate'

import { CANVAS, COPY_OK, H, IDENTIDADE, POLITICA, W, contraste, entrada, forma, fundo, leitura, logo, medida, medidaDaLogo, metrica, pecaLimpa, texto } from './suporte/corpus-do-gate'

const gate = (parcial: Parameters<typeof entrada>[0] = {}) => {
  const g = gateDaMedida(entrada(parcial)).gate
  // Invariante 2.3 do contrato, conferido em TODA chamada dos testes: APTO ⇔ motivos vazio ∧ naoMedidos vazio.
  expect(g.resultado === 'APTO', `resultado ${g.resultado} com motivos=${g.motivos.length} naoMedidos=${g.naoMedidos.length}`).toBe(g.motivos.length === 0 && g.naoMedidos.length === 0)
  return g
}
const motivosDe = (g: ReturnType<typeof gate>, regra: string) => g.motivos.filter((m) => m.regra === regra)

// ─── G1/G2 — peça limpa e invariantes ─────────────────────────────────────

describe('G1/G2 — peça limpa é APTO; invariantes', () => {
  it('G1: tudo comprovado ou não se aplica; motivos, achados e naoMedidos vazios; relatório = avaliarPeca(medida)', () => {
    const e = entrada()
    const { gate: g, relatorio } = gateDaMedida(e)
    expect(g.resultado, JSON.stringify(g.motivos)).toBe('APTO')
    expect(g.motivos).toEqual([])
    expect(g.achados).toEqual([])
    expect(g.naoMedidos).toEqual([])
    for (const regra of [...REGRAS_CRITICAS, ...CONFERENCIAS_DO_GATE]) {
      expect(['comprovada', 'nao-se-aplica'], `${regra}: ${JSON.stringify(g.cobertura[regra])}`).toContain(g.cobertura[regra].estado)
    }
    expect(g.cobertura.oclusao).toEqual({ estado: 'comprovada' })
    expect(g.cobertura['copy-completa']).toEqual({ estado: 'comprovada' })
    expect(g.cobertura['piso-de-interface']).toEqual({ estado: 'comprovada' })
    expect(g.cobertura.identidade).toEqual({ estado: 'comprovada' })
    expect(relatorio).toEqual(avaliarPeca(e.medida as EntradaDaRevisao))
    expect(g.rulesVersion).toBe(relatorio.versaoDasRegras)
    expect(g.pageVersion).toBe(IDENTIDADE.pageVersion)
    expect(g.copyVersion).toBe(IDENTIDADE.copyVersion)
  })

  it('G2: determinismo byte a byte; avisos não mudam o resultado', () => {
    const a = JSON.stringify(gateDaMedida(entrada()).gate)
    const b = JSON.stringify(gateDaMedida(entrada()).gate)
    expect(a).toBe(b)
    const semLogo = gate({ medida: { camadas: pecaLimpa().camadas.filter((l) => l.id !== 'logo'), leituraDaLogo: [] } })
    expect(semLogo.avisos.some((x) => /sem logo solta/.test(x))).toBe(true)
    expect(semLogo.resultado).toBe('APTO')
  })
})

// ─── G3–G10 — achados e cobertura ─────────────────────────────────────────

describe('G3–G10 — achado crítico, não crítico, visão, cobertura', () => {
  it('G3: achado crítico medido de severidade aviso (colisao) reprova', () => {
    const base = pecaLimpa()
    const headline = base.camadas.find((l) => l.id === 'headline')!
    const apoio = texto('apoio', { x: 100, y: 340, width: 600, height: 60 }, 40) // sobre a headline
    const metricas = [metrica(headline), metrica(apoio), base.metricas[2]]
    const camadas = base.camadas.map((l) => (l.id === 'apoio' ? apoio : l))
    const g = gate({ medida: { camadas, metricas, geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 60, detalhe: 'sobrepõem' } as never] } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.cobertura.colisao.estado).toBe('reprovada')
    expect(g.achados.some((a) => a.regra === 'colisao' && a.certeza === 'medida')).toBe(true)
    expect(motivosDe(g, 'colisao')[0]?.codigo).toBe('ACHADO_CRITICO')
  })

  it('G4: achado em regra NÃO crítica (titulo-grande) não decide → APTO', () => {
    const base = pecaLimpa()
    const headline = texto('headline', { x: 100, y: 300, width: 880, height: 180 }, 140)
    const apoio = texto('apoio', { x: 100, y: 520, width: 600, height: 60 }, 40)
    const camadas = base.camadas.map((l) => (l.id === 'headline' ? headline : l.id === 'apoio' ? apoio : l))
    const metricas = [metrica(headline, { lineCount: 1 }), metrica(apoio), base.metricas[2]]
    const { gate: g, relatorio } = gateDaMedida(entrada({ medida: { camadas, metricas, geometria: [] } }))
    expect(relatorio.achados.some((a) => a.regra === 'titulo-grande')).toBe(true)
    expect(g.resultado, JSON.stringify(g.motivos)).toBe('APTO')
  })

  it('G5: achado de VISÃO em regra crítica é ignorado — pelo predicado e pela entrada (a medida não tem visão)', () => {
    const visao: AchadoDaRevisao = { id: 'texto-sem-leitura:servico', regra: 'texto-sem-leitura', severidade: 'problema', certeza: 'visao', camadas: ['servico'], mensagem: 'a visão achou', evidencia: {}, ajustes: [] }
    for (const politica of POLITICAS) expect(achadoCritico(visao, politica)).toBe(false)
    const d = decidirCritica({ regra: 'texto-sem-leitura', medida: medida(), cob: { estado: 'avaliada' }, achados: [visao], politica: POLITICA })
    expect(d.cobertura).toEqual({ estado: 'comprovada' })
    // E o mesmo achado com certeza MEDIDA reprova: a diferença é só a certeza.
    expect(decidirCritica({ regra: 'texto-sem-leitura', medida: medida(), cob: { estado: 'avaliada' }, achados: [{ ...visao, certeza: 'medida' }], politica: POLITICA }).cobertura.estado).toBe('reprovada')
    // A medida que o gate recebe não carrega `vistos`: o gate recalcula o relatório sem visão.
    expect('vistos' in entrada().medida).toBe(false)
    expect(gateDaMedida(entrada()).gate.resultado).toBe('APTO')
  })

  it('G6: cobertura nao-avaliada em crítica (motivoSemMedida) → NAO_COMPROVADA com o motivo', () => {
    const g = gate({ medida: { metricas: [], motivoSemMedida: 'a medição dos textos falhou: fonte' } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.cobertura['texto-cortado']).toEqual({ estado: 'nao-comprovada', motivo: 'a medição dos textos falhou: fonte' })
    expect(motivosDe(g, 'colisao')[0]?.codigo).toBe('NAO_COMPROVADA')
  })

  it('G7: parcial (rich text / fonte não cadastrada) → não comprovada (o gate de produção não tem a exceção do piloto)', () => {
    const base = pecaLimpa()
    const rich = { ...base.camadas.find((l) => l.id === 'apoio')!, type: 'rich-text' } as Layer
    const camadas = base.camadas.map((l) => (l.id === 'apoio' ? rich : l))
    const g = gate({ medida: { camadas, medidasAproximadas: ['apoio'] } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.cobertura['texto-cortado'].estado).toBe('nao-comprovada')
  })

  it('G8: textosSemMetrica → não comprovada nas regras de texto + naoMedidos.geometria', () => {
    const g = gate({ medida: { textosSemMetrica: ['servico'], metricas: pecaLimpa().metricas.filter((m) => m.layerId !== 'servico') } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.cobertura['fora-da-area-segura'].estado).toBe('nao-comprovada')
    expect(g.naoMedidos.some((n) => n.regra === 'geometria' && n.camadas.includes('servico'))).toBe(true)
  })

  it('G9: contraste null → leitura e tratamento não comprovadas; pioras null com contraste → só o tratamento', () => {
    const semRegua = gate({ medida: { contraste: null, pioras: null } })
    expect(semRegua.cobertura['texto-sem-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'a régua de contraste não mediu' })
    expect(semRegua.cobertura['tratamento-piorou-leitura'].estado).toBe('nao-comprovada')
    // Codex (revisão final): `contraste: []` com textos visíveis NÃO comprova a leitura; a leitura é por TEXTO (`textos[].camada`),
    // e o grupo (`camadas`) sem `textos` não substitui a leitura individual.
    const vazio = gate({ medida: { contraste: [] } })
    expect(vazio.cobertura['texto-sem-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'texto sem leitura da régua: headline, apoio, servico' })
    expect(vazio.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    const faltaUm = gate({ medida: { contraste: pecaLimpa().metricas.filter((m) => m.layerId !== 'servico').map((m) => contraste([m.layerId])) } })
    expect(faltaUm.cobertura['tratamento-piorou-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'texto sem leitura da régua: servico' })
    const grupoSemTextos = gate({ medida: { contraste: [{ ...contraste(['headline', 'apoio']), textos: [{ camada: 'headline', sentido: 'escuro', alvo: 130, p98SemHalo: 60, p98ComHalo: 200, ok: true }] }, contraste(['servico'])] } })
    expect(grupoSemTextos.cobertura['texto-sem-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'texto sem leitura da régua: apoio' })
    const grupoSoCamadas = gate({ medida: { contraste: [{ ...contraste(['headline', 'apoio']), textos: undefined }, contraste(['servico'])] } })
    expect(grupoSoCamadas.cobertura['texto-sem-leitura'].estado).toBe('nao-comprovada')
    const semPioras = gate({ medida: { pioras: null } })
    expect(semPioras.cobertura['texto-sem-leitura']).toEqual({ estado: 'comprovada' })
    expect(semPioras.cobertura['tratamento-piorou-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'as pioras de tratamento não foram medidas' })
  })

  it('G10: fonte-nao-carregada com achado problema reprova; motivoSemFontes → não comprovada', () => {
    const comFalta = gate({ medida: { fontesAusentes: [{ familia: 'Branley GC', peso: null, camadas: ['headline'] }] } })
    expect(comFalta.cobertura['fonte-nao-carregada'].estado).toBe('reprovada')
    expect(comFalta.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    const semConferencia = gate({ medida: { motivoSemFontes: 'a conferência das fontes falhou: canvas' } })
    expect(semConferencia.cobertura['fonte-nao-carregada']).toEqual({ estado: 'nao-comprovada', motivo: 'a conferência das fontes falhou: canvas' })
  })
})

// ─── G11/G12 — logo ───────────────────────────────────────────────────────

describe('G11/G12 — logo-sem-leitura', () => {
  it('G11: sem logo solta (leituraDaLogo []) → comprovada + aviso, nunca em silêncio', () => {
    const g = gate({ medida: { camadas: pecaLimpa().camadas.filter((l) => l.id !== 'logo'), leituraDaLogo: [] } })
    expect(g.cobertura['logo-sem-leitura']).toEqual({ estado: 'comprovada' })
    expect(g.avisos).toContain('peça sem logo solta: a ausência de logo é decisão de composição, não defeito medido')
  })

  it('G12: logo indisponivel / fora-do-contrato / sem-pixels → não comprovada com naoMedidos; leituraDaLogo null → não comprovada', () => {
    for (const estado of ['indisponivel', 'fora-do-contrato', 'sem-pixels'] as const) {
      const g = gate({ medida: { leituraDaLogo: [leitura('logo', null, estado, 'HTTP 404')] } })
      expect(g.cobertura['logo-sem-leitura'].estado, estado).toBe('nao-comprovada')
      expect(g.naoMedidos.some((n) => n.regra === 'logo-sem-leitura' && n.camadas.includes('logo'))).toBe(true)
    }
    const semLeitura = gate({ medida: { leituraDaLogo: null, motivoSemLeituraDaLogo: 'a medição da logo não rodou' } })
    expect(semLeitura.cobertura['logo-sem-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'a medição da logo não rodou' })
    // Codex (revisão final): logo SOLTA na peça sem entrada em leituraDaLogo → não comprovada (e sem o aviso de "sem logo").
    const semEntrada = gate({ medida: { leituraDaLogo: [] } })
    expect(semEntrada.cobertura['logo-sem-leitura']).toEqual({ estado: 'nao-comprovada', motivo: 'logo solta sem leitura: logo' })
    expect(semEntrada.avisos.some((a) => /sem logo solta/.test(a))).toBe(false)
    expect(semEntrada.naoMedidos.some((n) => n.regra === 'logo-sem-leitura' && n.camadas.includes('logo'))).toBe(true)
    const duasUmaOmitida = gate({ medida: { camadas: [...pecaLimpa().camadas, logo({ id: 'logo-2', position: { x: 100, y: 1750 } })], leituraDaLogo: [leitura('logo', medidaDaLogo())] } })
    expect(duasUmaOmitida.cobertura['logo-sem-leitura'].estado).toBe('nao-comprovada')
    // Codex (revisão final R4): a leitura do CP3 lê o ARQUIVO; chave que muda os pixels/recorte no render (invert, flipH,
    // mask, grayscale, filter…) deixa a leitura não comprovada mesmo com estado 'medida'. E uma shape com id "logo" não é logo.
    for (const style of [{ objectFit: 'contain', invert: true }, { objectFit: 'contain', flipH: true }, { objectFit: 'contain', mask: { shapeId: 'c', path: 'M0 0H100V100H0Z' } }, { objectFit: 'contain', grayscale: true }, { objectFit: 'contain', filter: 'blur(2px)' }, { objectFit: 'contain', exposure: 0.5 }] as const) {
      const g = gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, style } : l)) } })
      expect(g.cobertura['logo-sem-leitura'].estado, JSON.stringify(style)).toBe('nao-comprovada')
      expect(g.resultado, JSON.stringify(style)).toBe('REVISAO_HUMANA_NECESSARIA')
    }
    const shapeLogo = gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, type: 'shape', fileUrl: 'https://blob.test/logo.png', style: { shapeType: 'circle', fill: '#fff' } } : l)) } })
    expect(shapeLogo.cobertura['logo-sem-leitura'].estado).toBe('nao-comprovada')
    // Codex R5: `border.radius` recorta os cantos, `border.width` pinta sobre a logo, sombra/desfoque/traço mudam a composição.
    // Codex R6: o render liga efeito por verdade JS (`enabled: 1`, `'true'`) e coage `opacity: '0.5'`; o CP3 só recusa número < 1.
    for (const extra of [{ style: { objectFit: 'contain', border: { width: 0, color: '#000', radius: 8 } } }, { style: { objectFit: 'contain', border: { width: 6, color: '#000', radius: 0 } } }, { style: { objectFit: 'contain', shadow: { offsetX: 4, offsetY: 4, blur: 2, color: '#000' } } }, { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 1 } } }, { effects: { blur: { enabled: true, blurRadius: 3 } } }, { effects: { shadow: { enabled: 1, shadowColor: '#000', shadowBlur: 4 } } }, { effects: { shadow: { enabled: 'true' } } }, { style: { objectFit: 'contain', opacity: '0.5' } }, { style: { objectFit: 'contain', opacity: 0.5 } }, { style: { objectFit: 'contain', opacity: Number.NaN } }, { style: { objectFit: 'contain', opacity: null } }, { effects: { shadow: { enabled: ' ' } } }, { effects: { shadow: { enabled: [] } } }, { style: { objectFit: 'contain', invert: {} } }, { rotation: '90' }, { rotation: '0' }, { rotation: [] }] as unknown as Array<Partial<Layer>>) {
      const g = gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, ...extra } : l)) } })
      expect(g.cobertura['logo-sem-leitura'].estado, JSON.stringify(extra)).toBe('nao-comprovada')
      const nm = g.naoMedidos.filter((n) => n.regra === 'logo-sem-leitura')
      expect(nm.length, JSON.stringify(extra)).toBeGreaterThan(0)
      expect(nm.every((n) => n.camadas.includes('logo')), JSON.stringify(extra)).toBe(true)
    }
    // `opacity: 1` numérica e `enabled: false`/`0` seguem comprovados (o render também não liga).
    expect(gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? ({ ...l, style: { objectFit: 'contain', opacity: 1 }, effects: { shadow: { enabled: 0 }, blur: { enabled: false } } } as unknown as Layer) : l)) } }).cobertura['logo-sem-leitura']).toEqual({ estado: 'comprovada' })
    // Controle: `objectFit: 'contain'` liso (e borda com width 0 e radius 0) segue comprovado.
    expect(gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, style: { objectFit: 'contain', border: { width: 0, color: '#000', radius: 0 } } } : l)) } }).cobertura['logo-sem-leitura']).toEqual({ estado: 'comprovada' })
    const ilegivel = gate({ medida: { leituraDaLogo: [leitura('logo', medidaDaLogo(12))] } })
    expect(ilegivel.cobertura['logo-sem-leitura'].estado).toBe('reprovada')
  })
})

// ─── G13–G18 — assunto da foto ────────────────────────────────────────────

const POLITICAS: PoliticaDoAssunto[] = [
  { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' },
  { estimado: 'humano', semAssuntoLocalizavel: 'humano' },
  { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' },
  { estimado: 'comprova', semAssuntoLocalizavel: 'humano' },
]

describe('G13–G18 — política do assunto', () => {
  const sobreOAssunto = () => {
    // Serviço inteiro dentro do assunto → o revisor acusa `texto-sobre-assunto`.
    const base = pecaLimpa()
    return { camadas: base.camadas, metricas: base.metricas, assuntoRect: { x: 0, y: 1400, width: 1080, height: 400 } }
  }

  it('G13: catálogo sem achado → comprovada; com achado (medida) → reprovada, com qualquer política', () => {
    for (const politica of POLITICAS) {
      expect(gate({ politicaDoAssunto: politica }).cobertura['texto-sobre-assunto']).toEqual({ estado: 'comprovada' })
      const s = sobreOAssunto()
      const g = gate({ politicaDoAssunto: politica, medida: { assunto: { rect: s.assuntoRect, origem: 'catalogo' } } })
      expect(g.cobertura['texto-sobre-assunto'].estado, JSON.stringify(politica)).toBe('reprovada')
      expect(g.achados.some((a) => a.regra === 'texto-sobre-assunto' && a.certeza === 'medida')).toBe(true)
    }
  })

  it('G14: estimado — humano → não comprovada sempre; comprova → comprovada sem achado, reprovada com achado estimado (exceção 4.1, registrado com certeza estimada); achado estimado de OUTRA regra nunca reprova', () => {
    const longe = { rect: { x: 0, y: 900, width: 1080, height: 500 }, origem: 'estimado' as const }
    const humano = gate({ politicaDoAssunto: { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { assunto: longe } })
    expect(humano.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    expect(motivosDe(humano, 'texto-sobre-assunto')[0]?.motivo).toMatch(/estimado/)
    const comprova = gate({ politicaDoAssunto: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { assunto: longe } })
    expect(comprova.cobertura['texto-sobre-assunto']).toEqual({ estado: 'comprovada' })
    const s = sobreOAssunto()
    const comAchado = gate({ politicaDoAssunto: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { assunto: { rect: s.assuntoRect, origem: 'estimado' } } })
    expect(comAchado.cobertura['texto-sobre-assunto'].estado).toBe('reprovada')
    expect(comAchado.achados.find((a) => a.regra === 'texto-sobre-assunto')?.certeza).toBe('estimada')
    const mesmoAchadoHumano = gate({ politicaDoAssunto: { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { assunto: { rect: s.assuntoRect, origem: 'estimado' } } })
    expect(mesmoAchadoHumano.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    expect(mesmoAchadoHumano.achados).toEqual([])
    // Achado estimado de outra regra crítica (rich text em texto-cortado) → não comprovada, nunca reprovada.
    const base = pecaLimpa()
    const rich = { ...base.camadas.find((l) => l.id === 'servico')!, type: 'rich-text' } as Layer
    const g = gate({ politicaDoAssunto: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { camadas: base.camadas.map((l) => (l.id === 'servico' ? rich : l)), medidasAproximadas: ['servico'], geometria: [{ tipo: 'overflow', camadas: ['servico'], layerIds: ['servico'], px: 30, detalhe: 'corta' } as never] } })
    expect(g.cobertura['texto-cortado'].estado).toBe('nao-comprovada')
    expect(g.achados.some((a) => a.regra === 'texto-cortado')).toBe(false)
  })

  it("G15: C (naoSeAplica, foto COM arquivo) → não se aplica + aviso / humano; C' (foto sem arquivo) → não comprovada com as 4 políticas", () => {
    const c = gate({ medida: { assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a foto foi lida e não tem assunto localizável' } })
    expect(c.cobertura['texto-sobre-assunto'].estado).toBe('nao-se-aplica')
    expect(c.avisos.some((a) => /sem assunto localizável/.test(a))).toBe(true)
    expect(c.resultado).toBe('APTO')
    const cHumano = gate({ politicaDoAssunto: { estimado: 'humano', semAssuntoLocalizavel: 'humano' }, medida: { assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a foto foi lida e não tem assunto localizável' } })
    expect(cHumano.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    for (const politica of POLITICAS) {
      const camadas = pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: undefined } : l))
      const g = gate({ politicaDoAssunto: politica, medida: { camadas, assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' } })
      expect(g.cobertura['texto-sobre-assunto'], JSON.stringify(politica)).toEqual({ estado: 'nao-comprovada', motivo: 'foto de fundo sem arquivo: nada foi lido' })
    }
  })

  it("G13b (Codex R5): foto de fundo com recorte manual (`style.crop`), espelho, máscara, filtro, desfoque ou rotação → o assunto medido não representa o render → não comprovada com as 4 políticas; sem isso, comprovada", () => {
    for (const style of [{ objectFit: 'cover', crop: { x: 0.3, y: 0.3, width: 0.5, height: 0.5 } }, { objectFit: 'cover', flipH: true }, { objectFit: 'cover', mask: { shapeId: 'c', path: 'M0 0H100V100H0Z' } }, { objectFit: 'cover', filter: 'blur(4px)' }, { objectFit: 'cover', blur: 3 }, { objectFit: 'cover', flipH: ' ' }, { objectFit: 'cover', flipH: [] }, { objectFit: 'cover', mask: {} }, { objectFit: 'cover', cropPosition: '' }, { objectFit: 'cover', cropPosition: 'center' }, { objectFit: 'cover', cropPosition: 'centro-meio' }, { objectFit: 'cover', shadow: { offsetX: 0, offsetY: 40, blur: 8, color: '#000' } }, { objectFit: 'cover', opacity: 0.5 }, { objectFit: 'cover', border: { width: 4, radius: 0, color: '#000' } }] as unknown as Array<Layer['style']>) {
      for (const politica of POLITICAS) {
        const g = gate({ politicaDoAssunto: politica, medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, style } : l)) } })
        expect(g.cobertura['texto-sobre-assunto'].estado, JSON.stringify(style)).toBe('nao-comprovada')
        expect(motivosDe(g, 'texto-sobre-assunto')[0]?.camadas, JSON.stringify(style)).toEqual(['bg-foto'])
      }
    }
    const girada = gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, rotation: 5 } : l)) } })
    expect(girada.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    expect(gate({ medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, style: { objectFit: 'cover', cropPosition: 'right-middle' } } : l)) } }).cobertura['texto-sobre-assunto']).toEqual({ estado: 'comprovada' })
  })

  it('G13c (Codex R6): a medida lê a foto como UM cover do canvas inteiro — objectFit ≠ cover, caixa fora de (0,0,canvas), filtro de pixel ou segunda foto visível → não comprovada com as 4 políticas', () => {
    const casos: Array<[string, Partial<Layer>]> = [
      ['contain', { style: { objectFit: 'contain' } }],
      ['fill', { style: { objectFit: 'fill' } }],
      ['sem objectFit', { style: {} }],
      ['exposure', { style: { objectFit: 'cover', exposure: 20 } }],
      ['contrast', { style: { objectFit: 'cover', contrast: 15 } }],
      ['saturation', { style: { objectFit: 'cover', saturation: -30 } }],
      ['deslocada', { position: { x: 0, y: 200 } }],
      ['menor', { size: { width: W * 0.95, height: H * 0.95 } }],
      ['posição não numérica', { position: { x: '0', y: 0 } as unknown as Layer['position'] }],
      ['rotação em string', { rotation: '5' } as unknown as Partial<Layer>],
      ['effects.shadow ligado', { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 40, shadowOpacity: 1 } } } as unknown as Partial<Layer>],
    ]
    for (const [nome, extra] of casos) {
      for (const politica of POLITICAS) {
        const g = gate({ politicaDoAssunto: politica, medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, ...extra } : l)) } })
        expect(g.cobertura['texto-sobre-assunto'].estado, nome).toBe('nao-comprovada')
        expect(motivosDe(g, 'texto-sobre-assunto')[0]?.camadas, nome).toEqual(['bg-foto'])
      }
    }
    // Segunda foto de tela inteira ABAIXO dos textos (não oclui nada): o revisor mede o assunto de `bg-foto`, o visível é o da outra.
    const segunda = fundo({ id: 'foto-2', name: 'Outra foto', order: 1, fileUrl: 'https://blob.test/outra.jpg' })
    for (const politica of POLITICAS) {
      const g = gate({ politicaDoAssunto: politica, medida: { camadas: [...pecaLimpa().camadas, segunda] } })
      expect(g.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
      expect(motivosDe(g, 'texto-sobre-assunto')[0]?.camadas).toEqual(['bg-foto', 'foto-2'])
    }
    // `element` é desenhado pelo mesmo renderImage (Codex R7).
    const elemento = { ...segunda, id: 'el-1', type: 'element' } as Layer
    expect(motivosDe(gate({ medida: { camadas: [...pecaLimpa().camadas, elemento] } }), 'texto-sobre-assunto')[0]?.camadas).toEqual(['bg-foto', 'el-1'])
    // Controle: a imagem extra que é LOGO solta (type image com "logo" no nome) não é segunda foto.
    const logoImagem = fundo({ id: 'logo-2', name: 'Logo secundária', type: 'image', order: 8, position: { x: 100, y: 1600 }, size: { width: 120, height: 60 }, fileUrl: 'https://blob.test/logo2.png' })
    const comLogo = gate({ medida: { camadas: [...pecaLimpa().camadas, logoImagem], leituraDaLogo: [leitura('logo', medidaDaLogo()), leitura('logo-2', medidaDaLogo())] } })
    expect(comLogo.cobertura['texto-sobre-assunto']).toEqual({ estado: 'comprovada' })
  })

  it('G13d (Codex R10/R11): o assunto só vale no canvas canônico do formato — catálogo, estimado e "nenhum" são cache da composição sem largura/altura; página redimensionada ou sem formato → não comprovada; e o piso do story fora do canônico não está provado', () => {
    const grande = { width: 2160, height: 3840 }
    const camadas = pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: grande } : l))
    for (const politica of POLITICAS) {
      const g = gate({ politicaDoAssunto: politica, medida: { canvas: grande, camadas } })
      expect(g.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
      expect(motivosDe(g, 'texto-sobre-assunto')[0]?.motivo).toContain('fora do canônico')
      expect(motivosDe(g, 'texto-sobre-assunto')[0]?.camadas).toEqual(['bg-foto'])
      // O piso do story em px do canônico também não está provado no canvas grande.
      expect(g.cobertura['piso-de-interface'].estado).toBe('nao-comprovada')
      expect(motivosDe(g, 'piso-de-interface')[0]?.motivo).toContain('fora do canônico')
    }
    expect(motivosDe(gate({ medida: { formato: null } }), 'texto-sobre-assunto')[0]?.motivo).toContain('fora do canônico')
    // Codex R11: ESTIMADO e "nenhum" também são reaproveitados do cache da composição (sem largura/altura) → recusam igual.
    const estimado = gate({ politicaDoAssunto: { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' }, medida: { canvas: grande, camadas, assunto: { rect: { x: 0, y: 2000, width: 2160, height: 900 }, origem: 'estimado' } } })
    expect(estimado.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    expect(motivosDe(estimado, 'texto-sobre-assunto')[0]?.motivo).toContain('fora do canônico')
    const nenhum = gate({ medida: { canvas: grande, camadas, assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a foto não tem assunto localizável (o compositor leu esta foto neste corte e não achou região forte): nada a proteger' } })
    expect(nenhum.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    // Story 2160×3840 com texto em y=250 (passaria pelos 188 px absolutos; exibido em 1080 cai em y=125): piso não comprovado, nunca APTO.
    const y250 = pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: grande } : l.id === 'apoio' ? { ...l, position: { x: 100, y: 250 } } : l))
    const m250 = pecaLimpa().metricas.map((m) => (m.layerId === 'apoio' ? { ...m, box: { ...m.box, y: 250 }, glyphTop: 256, glyphBottom: 304 } : m))
    const g250 = gate({ medida: { canvas: grande, camadas: y250, metricas: m250 } })
    expect(g250.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g250.cobertura['piso-de-interface'].estado).toBe('nao-comprovada')
    // Feed canônico (1080×1350) com catálogo segue comprovado.
    const feed = { width: 1080, height: 1350 }
    expect(gate({ medida: { canvas: feed, formato: 'feed', camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: feed } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l)), metricas: pecaLimpa().metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m)), assunto: { rect: { x: 0, y: 700, width: 1080, height: 400 }, origem: 'catalogo' } } }).cobertura['texto-sobre-assunto']).toEqual({ estado: 'comprovada' })
  })

  it('G13e (Codex R11): foto visível que `fotoDeFundo` não reconhece (element de tela inteira, image < 90%) sem bg-foto → o assunto não foi medido → não comprovada; sem foto nenhuma → não se aplica', () => {
    const semFundo = pecaLimpa().camadas.filter((l) => l.id !== 'bg-foto')
    const semAssunto = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' }
    const elemento = fundo({ id: 'el-foto', name: 'Foto', type: 'element', order: 1, fileUrl: 'https://blob.test/el.jpg' })
    const pequena = fundo({ id: 'img-peq', name: 'Detalhe', order: 1, size: { width: 500, height: 500 }, position: { x: 100, y: 300 } })
    for (const [nome, extra] of [['element tela inteira', elemento], ['image < 90%', pequena]] as const) {
      for (const politica of POLITICAS) {
        const g = gate({ politicaDoAssunto: politica, medida: { camadas: [...semFundo, extra], ...semAssunto } })
        expect(g.cobertura['texto-sobre-assunto'].estado, nome).toBe('nao-comprovada')
        expect(motivosDe(g, 'texto-sobre-assunto')[0]?.camadas, nome).toEqual([extra.id])
      }
    }
    expect(gate({ medida: { camadas: semFundo, ...semAssunto } }).cobertura['texto-sobre-assunto'].estado).toBe('nao-se-aplica')
    // A imagem solta que é LOGO (nome com "logo") não é foto.
    expect(gate({ medida: { camadas: [...semFundo, fundo({ id: 'logo-2', name: 'Logo 2', order: 8, size: { width: 120, height: 60 }, position: { x: 100, y: 1600 } })], ...semAssunto, leituraDaLogo: [leitura('logo', medidaDaLogo()), leitura('logo-2', medidaDaLogo())] } }).cobertura['texto-sobre-assunto'].estado).toBe('nao-se-aplica')
  })

  it('G31 (Codex R8/R9): QUALQUER camada visível em movimento — fundo, logo-imagem ou imagem solta sob a logo sem foto de fundo — derruba as 4 regras que leem pixels do quadro parado; invisível não conta', () => {
    const regras = ['texto-sem-leitura', 'tratamento-piorou-leitura', 'logo-sem-leitura', 'texto-sobre-assunto'] as const
    const casos: Array<[string, Layer[]]> = [
      ['fundo aproximar', pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? ({ ...l, movimento: 'aproximar' } as Layer) : l))],
      ['fundo afastar', pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? ({ ...l, movimento: 'afastar' } as Layer) : l))],
      ['logo-imagem em movimento', pecaLimpa().camadas.map((l) => (l.id === 'logo' ? ({ ...l, type: 'image', name: 'Logo', movimento: 'afastar' } as Layer) : l))],
      ['imagem < 90% sob a logo, sem foto de fundo', [...pecaLimpa().camadas.filter((l) => l.id !== 'bg-foto'), { ...fundo({ id: 'img-1', name: 'Detalhe', order: 1, position: { x: 700, y: 1400 }, size: { width: 380, height: 300 } }), movimento: 'afastar' } as Layer]],
      // Codex R10: vídeo ABAIXO dos textos — o render parado não o desenha, a publicação (MP4) sim; desvio conservador do contrato (que só previa vídeo acima).
      ['vídeo abaixo dos textos', [...pecaLimpa().camadas, { id: 'vid', name: 'Vídeo', type: 'video', visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: W, height: H }, fileUrl: 'https://blob.test/v.mp4' } as Layer]],
    ]
    for (const [nome, camadas] of casos) {
      const g = gate({ medida: { camadas, ...(nome.includes('sem foto') ? { assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a peça não tem foto de fundo' } : {}) } as Partial<MedidaDaPeca> })
      expect(g.resultado, nome).toBe('REVISAO_HUMANA_NECESSARIA')
      for (const r of regras) {
        expect(g.cobertura[r].estado, `${nome} / ${r}`).toBe('nao-comprovada')
        expect(motivosDe(g, r)[0]?.camadas.length, `${nome} / ${r}`).toBeGreaterThan(0)
      }
    }
    // Camada em movimento mas INVISÍVEL não conta; e a peça limpa segue APTO.
    expect(gate({ medida: { camadas: [...pecaLimpa().camadas, { ...fundo({ id: 'img-2', visible: false }), movimento: 'afastar' } as Layer] } }).resultado).toBe('APTO')
  })

  it('G30 (Codex R6): invariante 2.3 — `naoMedidos` não vazio nunca sai APTO, mesmo sem outro motivo (id residual em textosSemMetrica numa peça sem texto visível)', () => {
    const semTextos = { camadas: [fundo(), logo()], metricas: [], contraste: [], textosSemMetrica: ['fantasma'] }
    const g = gate({ medida: semTextos })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.naoMedidos.some((n) => n.regra === 'geometria' && n.camadas.includes('fantasma'))).toBe(true)
    expect(g.motivos.length).toBeGreaterThan(0)
    expect(gate({ medida: { ...semTextos, textosSemMetrica: [] } }).naoMedidos).toEqual([])
    // O ramo residual (naoMedidos SEM nenhum outro motivo): sem foto de fundo, sem texto visível — só o id residual sobra.
    const soLogo = { camadas: [logo()], metricas: [], contraste: [], assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a peça não tem foto de fundo', textosSemMetrica: ['fantasma'] } as Partial<MedidaDaPeca>
    const r = gate({ medida: soLogo })
    expect(r.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(r.motivos.map((m) => m.codigo)).toEqual(['NAO_MEDIDO'])
    expect(r.motivos[0].camadas).toEqual(['fantasma'])
    expect(r.cobertura.oclusao.estado).toBe('nao-comprovada')
    expect(gate({ medida: { ...soLogo, textosSemMetrica: [] } }).resultado).toBe('APTO')
  })

  it('G16: D (falha ao analisar, sem a marca) → não comprovada, independente da política', () => {
    for (const politica of POLITICAS) {
      const g = gate({ politicaDoAssunto: politica, medida: { assunto: null, motivoSemAssunto: 'o assunto da foto não foi estimado: HTTP 403' } })
      expect(g.cobertura['texto-sobre-assunto'], JSON.stringify(politica)).toEqual({ estado: 'nao-comprovada', motivo: 'o assunto da foto não foi estimado: HTTP 403' })
    }
  })

  it('G17: E (sem foto de fundo) → não se aplica, independente da política', () => {
    for (const politica of POLITICAS) {
      const g = gate({ politicaDoAssunto: politica, medida: { camadas: pecaLimpa().camadas.filter((l) => l.id !== 'bg-foto'), assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' } })
      expect(g.cobertura['texto-sobre-assunto'].estado, JSON.stringify(politica)).toBe('nao-se-aplica')
    }
  })

  it('G18: naoSeAplica FORJADO numa crítica fora do mapa (colisao, logo-sem-leitura, fonte) → não comprovada; em texto-sobre-assunto (foto lida) → não se aplica', () => {
    const forjada = { estado: 'nao-avaliada' as const, motivo: 'forjado', naoSeAplica: true as const }
    for (const regra of ['colisao', 'texto-cortado', 'fora-da-area-segura', 'fonte-nao-carregada', 'logo-sem-leitura'] as const) {
      const d = decidirCritica({ regra, medida: medida(), cob: forjada, achados: [], politica: POLITICA })
      expect(d.cobertura, regra).toEqual({ estado: 'nao-comprovada', motivo: 'forjado' })
    }
    const assunto = decidirCritica({ regra: 'texto-sobre-assunto', medida: medida({ assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'foto lida sem assunto' }), cob: forjada, achados: [], politica: POLITICA })
    expect(assunto.cobertura.estado).toBe('nao-se-aplica')
  })
})

// ─── G19/G26 — piso de interface ──────────────────────────────────────────

describe('G19/G26 — piso de interface do story', () => {
  it('G19: texto em y=100 reprova; logo invadindo o rodapé reprova; feed → não se aplica; texto girado 90° invadindo o topo → reprova; logo com transformação não suportada → não comprovada', () => {
    const base = pecaLimpa()
    const alto = gate({ medida: { camadas: base.camadas.map((l) => (l.id === 'apoio' ? { ...l, position: { x: 100, y: 100 } } : l)), metricas: base.metricas.map((m) => (m.layerId === 'apoio' ? { ...m, box: { ...m.box, y: 100 }, glyphTop: 106, glyphBottom: 154 } : m)) } })
    expect(alto.cobertura['piso-de-interface'].estado).toBe('reprovada')
    expect(motivosDe(alto, 'piso-de-interface')[0]?.camadas).toEqual(['apoio'])
    const logoBaixa = gate({ medida: { camadas: base.camadas.map((l) => (l.id === 'logo' ? { ...l, position: { x: 799, y: 1750 } } : l)) } })
    expect(logoBaixa.cobertura['piso-de-interface'].estado).toBe('reprovada')
    const feed = gate({ medida: { formato: 'feed', camadas: base.camadas.map((l) => (l.id === 'apoio' ? { ...l, position: { x: 100, y: 100 } } : l)) } })
    expect(feed.cobertura['piso-de-interface'].estado).toBe('nao-se-aplica')
    // Texto 300×100 em (400, 450) girado 90° em torno da origem: ocupa x 300–400 × y 450–750 — a caixa original (y 450–550)
    // está na faixa livre; o limite girado também... então usamos -90°: ocupa x 400–500 × y 150–450 → invade o topo (188).
    const girado = { ...base.camadas.find((l) => l.id === 'apoio')!, position: { x: 400, y: 450 }, size: { width: 300, height: 100 }, rotation: -90 } as Layer
    const g = gate({ medida: { camadas: base.camadas.map((l) => (l.id === 'apoio' ? girado : l)), metricas: base.metricas.map((m) => (m.layerId === 'apoio' ? metrica(girado) : m)) } })
    expect(g.cobertura['piso-de-interface'].estado).toBe('reprovada')
    const logoFiltro = gate({ medida: { camadas: base.camadas.map((l) => (l.id === 'logo' ? { ...l, style: { ...l.style, filter: 'blur(20px)' } } : l)) } })
    expect(logoFiltro.cobertura['piso-de-interface'].estado).toBe('nao-comprovada')
    expect(logoFiltro.naoMedidos.some((n) => n.regra === 'piso-de-interface' && n.camadas.includes('logo'))).toBe(true)
  })

  it('G26 (ratificado pelo owner em 16/10: folga de antialias de 1 px, pisos 188/224): TOPO — texto ou logo em y=188 reprova, y=189 passa; RODAPÉ — base em H−224 reprova, H−225 passa; cliente menos restritivo não afrouxa; mais restritivo aperta; oculta não conta', () => {
    const t = (y: number, extra: Partial<Layer> = {}) => texto('t', { x: 100, y, width: 300, height: 50 }, 30, extra)
    const sem = (ls: Layer[], iface = interfaceDoStory()) => foraDaInterface(ls, CANVAS, iface).map((f) => f.camada)
    const logoEm = (y: number) => logo({ position: { x: 799, y } })
    expect(FOLGA_DE_ANTIALIAS).toBe(1)
    // Topo: os dois lados da fronteira, texto e logo.
    expect(sem([t(187)])).toEqual(['t'])
    expect(sem([t(188)])).toEqual(['t'])
    expect(sem([t(189)])).toEqual([])
    expect(sem([logoEm(188)])).toEqual(['logo'])
    expect(sem([logoEm(189)])).toEqual([])
    // Rodapé: os dois lados da fronteira, logo (95 de altura) e texto (50 de altura).
    expect(sem([logoEm(H - 223 - 95)])).toEqual(['logo'])
    expect(sem([logoEm(H - 224 - 95)])).toEqual(['logo'])
    expect(sem([logoEm(H - 225 - 95)])).toEqual([])
    expect(sem([t(H - 224 - 50)])).toEqual(['t'])
    expect(sem([t(H - 225 - 50)])).toEqual([])
    expect(interfaceDoStory({ topo: 100 })).toEqual({ topo: 188, rodape: 224 })
    // Codex R9: configuração não finita nunca afrouxa (`Math.max(NaN, 188)` era NaN e o piso deixava de pegar invasão).
    for (const cfg of [{ topo: Number.NaN, rodape: Number.NaN }, { topo: Infinity, rodape: -Infinity }, { topo: '300', rodape: null }] as unknown as Array<{ topo?: number; rodape?: number }>) {
      const i = interfaceDoStory(cfg)
      expect(Number.isFinite(i.topo) && i.topo >= 188 && Number.isFinite(i.rodape) && i.rodape >= 224, JSON.stringify(cfg)).toBe(true)
      expect(sem([t(187)], i), JSON.stringify(cfg)).toEqual(['t'])
    }
    expect(sem([t(250)], interfaceDoStory({ topo: 300 }))).toEqual(['t'])
    expect(sem([t(100, { visible: false })])).toEqual([])
    expect(PISO_DE_INTERFACE_DO_STORY).toEqual({ topo: 188, rodape: 224 })
  })
})

// ─── G20 — copy completa ──────────────────────────────────────────────────

describe('G20 — copy completa', () => {
  it('cada estado da tabela 4.4 e copy ausente', () => {
    expect(gate({ copy: { estado: 'sem-mudanca', lacunas: [] } }).cobertura['copy-completa']).toEqual({ estado: 'comprovada' })
    expect(gate({ copy: { estado: 'sem-mudanca', lacunas: ['o contrato não descrevia x'] } }).cobertura['copy-completa'].estado).toBe('nao-comprovada')
    for (const estado of ['registrada', 'sem-contrato', 'ilegivel', 'copy-invalida', 'historico-cheio'] as const) {
      const g = gate({ copy: { estado, lacunas: [] } })
      expect(g.cobertura['copy-completa'], estado).toEqual({ estado: 'nao-comprovada', motivo: `copy ${estado}` })
      expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    }
    const ausente = gate({ copy: undefined })
    expect(ausente.cobertura['copy-completa']).toEqual({ estado: 'nao-comprovada', motivo: 'quem chamou não conferiu a copy' })
  })
})

// ─── G21 — oclusão (detecção do cenário) ──────────────────────────────────

describe('G21 — oclusão sem rotação', () => {
  const base = () => pecaLimpa()
  const comForma = (f: Layer, extra: Partial<MedidaDaPeca> = {}) => {
    const b = base()
    return gate({ medida: { camadas: [...b.camadas, f], metricas: b.metricas, ...extra } })
  }
  const oclusaoDe = (g: ReturnType<typeof gate>) => g.naoMedidos.filter((n) => n.regra === 'oclusao')

  it('shape acima intersectando → oclusão; order igual → idem; abaixo → nada; acima sem intersecção → nada', () => {
    const sobreApoio = forma('f', { x: 100, y: 440, width: 200, height: 60 })
    expect(oclusaoDe(comForma({ ...sobreApoio, order: 9 }))).toHaveLength(1)
    expect(comForma({ ...sobreApoio, order: 9 }).cobertura.oclusao.estado).toBe('nao-comprovada')
    expect(oclusaoDe(comForma({ ...sobreApoio, order: 3 }))).toHaveLength(1)
    expect(oclusaoDe(comForma({ ...sobreApoio, order: 1 }))).toHaveLength(0)
    expect(oclusaoDe(comForma(forma('f', { x: 100, y: 800, width: 200, height: 60 }, { order: 9 })))).toHaveLength(0)
    expect(comForma(forma('f', { x: 100, y: 800, width: 200, height: 60 }, { order: 9 })).cobertura.oclusao).toEqual({ estado: 'comprovada' })
  })

  it('gradiente acima, COM e SEM a marca de tratamento → oclusão (sem exceção); gradiente de leitura ABAIXO → nada', () => {
    const grad = (order: number, marcado: boolean): Layer => ({ id: 'grad', name: 'grad', type: 'gradient', visible: true, locked: false, order, position: { x: 0, y: 0 }, size: { width: W, height: 665 }, style: { gradientType: 'linear', gradientStops: [{ id: 'a', color: '#000', position: 0, opacity: 0.9 }] }, metadata: marcado ? { tratamentoDeTexto: 'gradiente-de-leitura', borda: 'topo' } : {} }) as Layer
    expect(oclusaoDe(comForma(grad(9, true)))).toHaveLength(2)
    expect(oclusaoDe(comForma(grad(9, false)))).toHaveLength(2)
    expect(oclusaoDe(comForma(grad(1, true)))).toHaveLength(0)
    const g2 = { ...grad(9, true), type: 'gradient2' } as Layer
    expect(oclusaoDe(comForma(g2)).length).toBeGreaterThan(0)
  })

  it('imagem que não é o fundo acima → oclusão; foto de fundo com order >= ao de um texto → oclusão', () => {
    const img = { ...fundo({ id: 'img2', position: { x: 100, y: 440, width: 200, height: 60 } as never }), size: { width: 200, height: 60 }, order: 9 } as Layer
    expect(oclusaoDe(comForma(img))).toHaveLength(1)
    const b = base()
    const fundoAcima = b.camadas.map((l) => (l.id === 'bg-foto' ? { ...l, order: 9 } : l))
    const g = gate({ medida: { camadas: fundoAcima } })
    expect(oclusaoDe(g).length).toBe(3)
  })

  it('texto sobre texto: ambos limpos, medidos, sem rotação, colisao avaliada → nada; tolerância 9.7 (6 px dentro → nada; 20 px acima → colisao acusa, oclusão também); com sombra num deles, ou sem métrica → oclusão', () => {
    const b = base()
    const headline = b.camadas.find((l) => l.id === 'headline')!
    // Tolerância vertical = max(4, 0,18 × MAIOR corpo = 84) + 0 = 15,12. Glifos da headline terminam em 300+120-6 = 414.
    const apoioEm = (y: number, extra: Partial<Layer> = {}) => texto('apoio', { x: 100, y, width: 600, height: 60 }, 40, { order: 9, ...extra })
    const medir = (apoio: Layer, extra: Partial<MedidaDaPeca> = {}) => {
      const camadas = b.camadas.map((l) => (l.id === 'apoio' ? apoio : l))
      const metricas = [metrica(headline), metrica(apoio), b.metricas[2]]
      return gate({ medida: { camadas, metricas, ...extra } })
    }
    // 6 px de sobreposição de glifos: glyphTop do apoio = y+6 = 408 → 414-408 = 6 ≤ 15,12 → dentro da tolerância.
    const dentro = medir(apoioEm(402))
    expect(oclusaoDe(dentro)).toHaveLength(0)
    expect(dentro.cobertura.colisao).toEqual({ estado: 'comprovada' })
    const tol = toleranciaDeColisao(metrica(headline), metrica(apoioEm(402)), encaixeEntre(headline, apoioEm(402)))
    expect(tol).toEqual({ vertical: Math.max(4, 0.18 * 84), horizontal: 4 })
    // 20 px: acima da tolerância → o revisor acusa colisão (reprovada por achado) e a oclusão também conta — fail-closed.
    const acima = medir(apoioEm(388), { geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 20, detalhe: 'x' } as never] })
    expect(acima.cobertura.colisao.estado).toBe('reprovada')
    expect(oclusaoDe(acima)).toHaveLength(1)
    // Sombra num deles → a exceção não vale.
    const comSombra = medir(apoioEm(402, { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } }))
    expect(oclusaoDe(comSombra)).toHaveLength(1)
    // Sem métrica do de cima → o de cima é `contido: false` → transformação não suportada.
    const semMetrica = medir(apoioEm(402), { textosSemMetrica: ['apoio'], metricas: [metrica(headline), b.metricas[2]] })
    expect(semMetrica.naoMedidos.some((n) => n.regra === 'oclusao' && /apoio/.test(n.motivo))).toBe(true)
  })

  it('logo solta × texto: limpos, texto com métrica, logo-sobre-texto avaliada → nada; agrupada / texto sem métrica / regra parcial / com filtro → oclusão', () => {
    const b = base()
    // Logo sobre o serviço (y 1500), order 9 > 4.
    const logoSobre = (extra: Partial<Layer> = {}) => logo({ position: { x: 100, y: 1500 }, ...extra })
    const medir = (lg: Layer, extra: Partial<MedidaDaPeca> = {}) => gate({ medida: { camadas: b.camadas.map((l) => (l.id === 'logo' ? lg : l)), ...extra } })
    // Limpa: a regra do revisor examina o par (acusa logo-sobre-texto: reprovada por achado) — não é oclusão.
    const limpa = medir(logoSobre())
    expect(oclusaoDe(limpa)).toHaveLength(0)
    expect(limpa.cobertura['logo-sobre-texto'].estado).toBe('reprovada')
    expect(oclusaoDe(medir(logoSobre({ metadata: { groupId: 'g1' } })))).toHaveLength(1)
    expect(medir(logoSobre(), { textosSemMetrica: ['servico'], metricas: b.metricas.filter((m) => m.layerId !== 'servico') }).naoMedidos.some((n) => n.regra === 'oclusao')).toBe(true)
    // Codex (revisão final): métrica DUPLICADA ou de OUTRA caixa para o texto → não prova o par → a exceção não vale.
    const duplicada = medir(logoSobre(), { metricas: [...b.metricas, metrica(b.camadas.find((l) => l.id === 'servico')!)] })
    expect(duplicada.naoMedidos.some((n) => n.regra === 'oclusao')).toBe(true)
    const outraCaixa = medir(logoSobre(), { metricas: b.metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, x: 900 } } : m)) })
    expect(outraCaixa.naoMedidos.some((n) => n.regra === 'oclusao')).toBe(true)
    // Codex (revisão final R4): `shape` circular com id "logo" (centrada em position, fora da caixa de canto que a regra usa)
    // cobrindo os glifos → a exceção NÃO vale → oclusão.
    const circuloLogo = medir({ ...logoSobre({ position: { x: 530, y: 1530 }, size: { width: 100, height: 100 } }), type: 'shape', style: { shapeType: 'circle', fill: '#ffffff' } } as Layer)
    expect(oclusaoDe(circuloLogo)).toHaveLength(1)
    const comFiltro = medir(logoSobre({ style: { objectFit: 'contain', filter: 'blur(2px)' } }))
    expect(comFiltro.naoMedidos.some((n) => n.regra === 'oclusao' && /filter/.test(n.motivo))).toBe(true)
  })

  it('logo LIMPA sobre a EXPANSÃO do texto (owner R3): contorno, sombra, desfoque e borda do texto → oclusão; controle sem efeitos → exceção vale; mancha → nada', () => {
    const b = base()
    // Serviço em (100, 1500) 600×60; tinta termina em x 100+6+min(588, 400) = 506. Logo a 8 px da tinta: x = 514.
    const logoPerto = (x: number) => logo({ position: { x, y: 1500 } })
    const servicoCom = (extra: Partial<Layer>) => ({ ...b.camadas.find((l) => l.id === 'servico')!, ...extra }) as Layer
    const medir = (servico: Layer, lg: Layer) => gate({ medida: { camadas: b.camadas.map((l) => (l.id === 'servico' ? servico : l.id === 'logo' ? lg : l)) } })
    const casos: Array<[string, Partial<Layer>, number]> = [
      ['contorno', { effects: { stroke: { enabled: true, strokeColor: '#000', strokeWidth: 12 } } }, 514],
      ['sombra', { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } }, 526],
      ['desfoque', { effects: { blur: { enabled: true, blurRadius: 20 } } }, 546],
      ['borda', { style: { fontSize: 32, lineHeight: 1.2, textAlign: 'left', color: '#111', border: { width: 12, color: '#000', radius: 0 } } }, 514],
    ]
    for (const [nome, extra, x] of casos) {
      const g = medir(servicoCom(extra), logoPerto(x))
      expect(oclusaoDe(g).length, nome).toBe(1)
      expect(g.resultado, nome).toBe('REVISAO_HUMANA_NECESSARIA')
      expect(motivosDe(g, 'oclusao')[0]?.codigo, nome).toBe('NAO_MEDIDO')
      // E a interseção dos LIMITES é real (o texto expandido alcança a logo).
      const lt = limitesDoTexto(servicoCom(extra), b.metricas[2])
      expect(lt.contido && lt.rect.x + lt.rect.width > x, nome).toBe(true)
    }
    // Controle: sem efeito, a 8 px da tinta → o par é o que a regra examinou (folga de 4 px, sem interseção de tinta) → nada.
    const controle = medir(servicoCom({}), logoPerto(514))
    expect(oclusaoDe(controle)).toHaveLength(0)
    expect(controle.cobertura['logo-sobre-texto']).toEqual({ estado: 'comprovada' })
    // Mancha de fundo do texto: a logo sobre a mancha sem tocar a tinta → nada (decisão preservada).
    // (o serviço fica ABAIXO dos outros textos: um texto COM mancha acima de outro texto é ocluidora não suportada, 6.2)
    const comMancha = medir(servicoCom({ order: 2, effects: { background: { enabled: true, backgroundColor: '#fff', padding: 40 } } }), logoPerto(514))
    expect(oclusaoDe(comMancha)).toHaveLength(0)
  })

  it('cobertura.oclusao = comprovada só com a lista vazia; texto oculto sob uma forma → nada', () => {
    const b = base()
    const oculto = b.camadas.map((l) => (l.id === 'apoio' ? { ...l, visible: false } : l))
    const g = gate({ medida: { camadas: [...oculto, forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order: 9 })], metricas: b.metricas.filter((m) => m.layerId !== 'apoio') } })
    expect(oclusaoDe(g)).toHaveLength(0)
  })
})

// ─── G21b / G21b' — rotação, forma e transformação (os dois lados) ────────

describe("G21b/G21b' — rotação, formas centradas e transformações", () => {
  const b = () => pecaLimpa()
  const cenario = (camadas: Layer[], metricas: TextLayerMetrics[]) => cenariosNaoMedidos({ camadas, canvas: CANVAS, metricas, textosSemMetrica: [], motivoSemMedida: undefined }, { colisao: { estado: 'avaliada' }, 'logo-sobre-texto': { estado: 'avaliada' } })

  it('forma 600×40 em (400, 500) a 90° (caixa original y 500–540) sobre texto em y 600–700 → oclusão; abaixo → nada', () => {
    const t = texto('t', { x: 370, y: 600, width: 20, height: 100 }, 30)
    const f = forma('f', { x: 400, y: 500, width: 600, height: 40 }, { order: 9, rotation: 90 })
    const lim = limitesDe(f)
    expect(lim.contido && [Math.round(lim.rect.x), Math.round(lim.rect.y), Math.round(lim.rect.x + lim.rect.width), Math.round(lim.rect.y + lim.rect.height)]).toEqual([360 - FOLGA_DE_ANTIALIAS, 500 - FOLGA_DE_ANTIALIAS, 400 + FOLGA_DE_ANTIALIAS, 1100 + FOLGA_DE_ANTIALIAS])
    expect(cenario([t, f], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    expect(cenario([t, { ...f, order: 1 }], [metrica(t)])).toEqual([])
  })

  it('círculo 100×100 em (400, 500) é desenhado centrado (x 350–450 × y 450–550): texto em x 355–395 × y 480–490 → oclusão; triângulo e estrela idem; girado 45° usa a caixa centrada girada', () => {
    const t = texto('t', { x: 355, y: 480, width: 40, height: 10 }, 8)
    for (const shapeType of ['circle', 'triangle', 'star'] as const) {
      const c = forma('c', { x: 400, y: 500, width: 100, height: 100 }, { order: 9, style: { shapeType, fill: '#f00' } })
      const lim = limitesDe(c)
      expect(lim.contido && [lim.rect.x, lim.rect.y, lim.rect.width, lim.rect.height], shapeType).toEqual([350 - FOLGA_DE_ANTIALIAS, 450 - FOLGA_DE_ANTIALIAS, 100 + 2 * FOLGA_DE_ANTIALIAS, 100 + 2 * FOLGA_DE_ANTIALIAS])
      expect(cenario([t, c], [metrica(t)]), shapeType).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['c'] }])
    }
    const girado = limitesDe(forma('c', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'circle' }, rotation: 45 }))
    expect(girado.contido && girado.rect.width > 100).toBe(true)
  })

  it('texto girado 15° acima de outro texto → oclusão; logo solta girada acima de texto com métrica → oclusão; mask → oclusão; flipH → limites da caixa', () => {
    const t = texto('t', { x: 100, y: 600, width: 600, height: 100 }, 40)
    const acima = texto('a', { x: 100, y: 600, width: 600, height: 100 }, 40, { order: 9, rotation: 15 })
    expect(cenario([t, acima], [metrica(t), metrica(acima)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['a'] }])
    const lg = logo({ position: { x: 100, y: 600 }, rotation: 10 })
    expect(cenario([t, lg], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['logo'] }])
    const mascarada = forma('m', { x: 100, y: 600, width: 100, height: 100 }, { order: 9, style: { shapeType: 'rectangle', mask: { shapeId: 'circle', path: 'M0 0H100V100H0Z' } } })
    expect(cenario([t, mascarada], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['m'] }])
    const flip = limitesDe(forma('fl', { x: 100, y: 600, width: 100, height: 100 }, { style: { shapeType: 'rectangle', flipH: true } }))
    expect(flip.contido && [flip.rect.x, flip.rect.width]).toEqual([100 - FOLGA_DE_ANTIALIAS, 100 + 2 * FOLGA_DE_ANTIALIAS])
  })

  it('não suportados ANTES do teste de caixa (sem intersecção pela caixa original): svg-path, icon, line/arrow, shapeType desconhecido, filter, rich-text, video, texto com mancha, texto sem métrica, chave fora da árvore, rotation string', () => {
    const t = texto('t', { x: 100, y: 1000, width: 600, height: 100 }, 40)
    const longe = { x: 100, y: 100, width: 50, height: 50 }
    const casos: Array<[string, Layer]> = [
      ['svg-path', forma('x', longe, { order: 9, style: { shapeType: 'svg-path', pathData: 'M0 0 L5000 5000', pathViewBox: [0, 0, 100, 100] } })],
      ['icon', { ...forma('x', longe, { order: 9 }), type: 'icon', style: { iconId: 'star' } } as Layer],
      ['line', forma('x', longe, { order: 9, style: { shapeType: 'line', lineWidth: 4 } as never })],
      ['arrow', forma('x', longe, { order: 9, style: { shapeType: 'arrow' } })],
      ['desconhecido', forma('x', longe, { order: 9, style: { shapeType: 'hexagon' as never } })],
      ['filter', { ...fundo({ id: 'x' }), position: { x: 100, y: 100 }, size: { width: 50, height: 50 }, order: 9, style: { filter: 'blur(20px)' } } as Layer],
      ['rich-text', { ...texto('x', longe, 20, { order: 9 }), type: 'rich-text' } as Layer],
      ['video', { ...forma('x', longe, { order: 9 }), type: 'video' } as Layer],
      ['mancha', texto('x', longe, 20, { order: 9, effects: { background: { enabled: true, backgroundColor: '#fff', padding: 40 } } })],
      ['chave fora da árvore', forma('x', longe, { order: 9, style: { shapeType: 'rectangle', escala: 2 } as never })],
      ['chave inefetiva + filter (Codex R1)', { ...fundo({ id: 'x' }), position: { x: 100, y: 100 }, size: { width: 50, height: 50 }, order: 9, style: { escala: 0, filter: 'blur(20px)' } } as Layer],
      ['rotation string', forma('x', longe, { order: 9, rotation: '90' as never })],
    ]
    for (const [nome, c] of casos) {
      const metricas = nome === 'rich-text' || nome === 'mancha' ? [metrica(t), metrica(c)] : [metrica(t)]
      const r = cenario([t, c], metricas)
      expect(r.length, nome).toBe(1)
      expect(r[0].tipo, nome).toBe('transformacao-nao-suportada')
    }
    // Texto sem métrica acima (com ou sem autoExpand) → não suportado.
    const semMetrica = cenariosNaoMedidos({ camadas: [t, texto('x', longe, 20, { order: 9 })], canvas: CANVAS, metricas: [metrica(t)], textosSemMetrica: ['x'], motivoSemMedida: undefined }, { colisao: { estado: 'avaliada' } })
    expect(semMetrica[0]?.tipo).toBe('transformacao-nao-suportada')
  })

  it("G21b' (i)–(v): o TEXTO PROTEGIDO transformado — cenário do owner, logo sobre texto girado, ambos girados, t não suportado, controles", () => {
    // (i) texto em (600, 600) 300×100 a 90° sob shape em (500, 600) 100×300 sem rotação.
    const t = texto('t', { x: 600, y: 600, width: 300, height: 100 }, 40, { rotation: 90 })
    const f = forma('f', { x: 500, y: 600, width: 100, height: 300 }, { order: 9 })
    const lt = limitesDoTexto(t, metrica(t))
    expect(lt.contido && [Math.round(lt.rect.x + FOLGA_DE_ANTIALIAS), Math.round(lt.rect.y + FOLGA_DE_ANTIALIAS), Math.round(lt.rect.x + lt.rect.width - FOLGA_DE_ANTIALIAS), Math.round(lt.rect.y + lt.rect.height - FOLGA_DE_ANTIALIAS)]).toEqual([500, 600, 600, 900])
    expect(cenario([t, f], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    // (ii) o mesmo texto girado sob logo SOLTA sem rotação, com métrica e regra avaliada → a exceção não vale.
    const lg = logo({ position: { x: 500, y: 600 }, size: { width: 100, height: 300 } })
    expect(cenario([t, lg], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['logo'] }])
    // (iii) ambos girados.
    const f45 = forma('f', { x: 520, y: 700, width: 60, height: 60 }, { order: 9, rotation: 45 })
    expect(cenario([t, f45], [metrica(t)])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    // (iv) t com transformação não suportada → NAO_MEDIDO antes da caixa, mesmo sem interseção pela caixa original.
    for (const extra of [{ style: { fontSize: 40, filter: 'blur(2px)' } }, { rotation: '90' as never }, { style: { fontSize: 40, escala: 2 } as never }]) {
      const tx = { ...t, ...extra } as Layer
      const r = cenario([tx, forma('f', { x: 100, y: 100, width: 50, height: 50 }, { order: 9 })], [metrica(tx)])
      expect(r[0]?.tipo, JSON.stringify(extra)).toBe('transformacao-nao-suportada')
      expect(r[0]?.tipo === 'transformacao-nao-suportada' && r[0].camadas).toContain('t')
    }
    // (v) controles: sem interseção DEPOIS da transformação; ocluidora abaixo; logo longe.
    expect(cenario([t, forma('f', { x: 700, y: 600, width: 100, height: 300 }, { order: 9 })], [metrica(t)])).toEqual([])
    expect(cenario([t, { ...f, order: 1 }], [metrica(t)])).toEqual([])
    expect(cenario([t, logo({ position: { x: 700, y: 600 } })], [metrica(t)])).toEqual([])
  })
})

// ─── G21d — efeitos que expandem; limites de t pelos glifos ──────────────

describe('G21f — adversarial: valores não numéricos, chaves no topo, tipos novos, opacidade, invisível, efeitos combinados', () => {
  const tt = (extra: Partial<Layer> = {}): Layer => texto('t', { x: 100, y: 600, width: 600, height: 100 }, 40, extra)
  const ff = (extra: Partial<Layer> = {}): Layer => forma('f', { x: 100, y: 600, width: 200, height: 60 }, { order: 9, ...extra })
  const cen = (c: Layer, t: Layer = tt(), metricas: TextLayerMetrics[] = [metrica(t)]) => cenariosNaoMedidos({ camadas: [t, c], canvas: CANVAS, metricas, textosSemMetrica: [], motivoSemMedida: undefined }, { colisao: { estado: 'avaliada' }, 'logo-sobre-texto': { estado: 'avaliada' } })
  const naoSuportada = (r: ReturnType<typeof cen>, id: string) => r.some((x) => x.tipo === 'transformacao-nao-suportada' && x.camadas.includes(id))

  it('order não numérica (string, NaN, Infinity, string numérica) na ocluidora → NAO_MEDIDO (nunca "abaixo"); ausente/null é 0 como no render; no texto protegido → NAO_MEDIDO com todas as visíveis', () => {
    for (const order of ['z', NaN, Infinity, '9'] as never[]) expect(naoSuportada(cen(ff({ order })), 'f'), String(order)).toBe(true)
    expect(cen(ff({ order: undefined as never }))).toEqual([])
    expect(cen(ff({ order: null as never }))).toEqual([])
    const r = cen(ff({ order: 1 }), tt({ order: 'a' as never }))
    expect(r[0]?.tipo).toBe('transformacao-nao-suportada')
    expect(r[0]?.tipo === 'transformacao-nao-suportada' && r[0].camadas).toEqual(['t', 'f'])
  })

  it('position/size não numéricas ou negativas na ocluidora ou no texto → contido: false → NAO_MEDIDO (antes viravam NaN e passavam)', () => {
    const casos: Array<[string, Partial<Layer>]> = [
      ['position.x string', { position: { x: 'abc' as never, y: 600 } }],
      ['position.x string numérica', { position: { x: '100' as never, y: 600 } }],
      ['position.y null', { position: { x: 100, y: null as never } }],
      ['size.width NaN', { size: { width: NaN, height: 60 } }],
      ['size.width Infinity', { size: { width: Infinity, height: 60 } }],
      ['size.height negativa', { size: { width: 200, height: -60 } }],
      ['size ausente', { size: undefined as never }],
    ]
    for (const [nome, extra] of casos) {
      expect(limitesDe(ff(extra)).contido, `ocluidora ${nome}`).toBe(false)
      expect(naoSuportada(cen(ff(extra)), 'f'), `ocluidora ${nome}`).toBe(true)
      expect(limitesDoTexto(tt(extra), metrica(tt())).contido, `texto ${nome}`).toBe(false)
    }
    expect(limitesDoTexto(tt(), { ...metrica(tt()), glyphTop: NaN }).contido).toBe(false)
    // Rotação finita mas fora de escala (1e308 graus → radianos Infinity → sin/cos NaN): limites não finitos → contido: false.
    expect(limitesDe(ff({ rotation: 1e308 })).contido).toBe(false)
    expect(limitesDoTexto(tt({ rotation: 1e308 }), metrica(tt())).contido).toBe(false)
    expect(naoSuportada(cen(ff({ rotation: 1e308 })), 'f')).toBe(true)
    expect(naoSuportada(cen(ff(), tt({ rotation: 1e308 })), 't')).toBe(true)
  })

  it('efeito com valor não numérico (shadowOffsetX, strokeWidth, blurRadius, style.shadow.blur, border.width) → contido: false, mesmo com a caixa longe do texto', () => {
    const casos: Array<[string, Partial<Layer>]> = [
      ['shadowOffsetX', { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 'muito' as never, shadowOffsetY: 90, shadowOpacity: 1 } } }],
      ['strokeWidth', { style: { shapeType: 'rectangle', strokeWidth: 'grosso' as never } }],
      ['blurRadius', { effects: { blur: { enabled: true, blurRadius: NaN } } }],
      ['style.shadow.blur', { style: { shapeType: 'rectangle', shadow: { offsetX: 1, offsetY: 1, blur: 'x' as never, color: '#000' } } }],
      ['border.width', { style: { shapeType: 'rectangle', border: { width: 'fina' as never, color: '#000', radius: 0 } } }],
    ]
    for (const [nome, extra] of casos) {
      const c = { ...ff({ position: { x: 100, y: 400 } }), ...extra } as Layer
      expect(limitesDe(c).contido, nome).toBe(false)
      expect(naoSuportada(cen(c), 'f'), nome).toBe(true)
    }
  })

  it('chave desconhecida no TOPO, tipo fora de LayerType, effects.curved e textboxConfig desconhecido → NAO_MEDIDO; opacity 0/parcial e filter vazio continuam oclusão (conservador); visible false não conta, visible 0/"false" conta como visível (como o render)', () => {
    expect(naoSuportada(cen(ff({ zIndexExtra: 5 } as never)), 'f')).toBe(true)
    expect(naoSuportada(cen(ff({ type: 'sticker' as never })), 'f')).toBe(true)
    expect(naoSuportada(cen(tt({ id: 'c', order: 9, effects: { curved: { enabled: true, curvature: 50 } } }), tt(), [metrica(tt()), metrica(tt({ id: 'c' }))]), 'c')).toBe(true)
    expect(naoSuportada(cen(tt({ id: 'c', order: 9, textboxConfig: { modoNovo: 'x' } as never }), tt(), [metrica(tt()), metrica(tt({ id: 'c' }))]), 'c')).toBe(true)
    expect(cen(ff({ style: { shapeType: 'rectangle', opacity: 0 } }))).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    expect(cen(ff({ style: { shapeType: 'rectangle', opacity: 0.3 } }))).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    expect(cen(ff({ style: { shapeType: 'rectangle', filter: '' } }))).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    expect(cen(ff({ visible: false }))).toEqual([])
    expect(cen(ff({ visible: 0 as never }))).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
    expect(cen(ff({ visible: 'false' as never }))).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['f'] }])
  })

  it('efeitos COMBINADOS (blur + shadow + border; máscara + flip + crop + sombra + blur na imagem) somam na expansão e a paridade com o render real cobre a combinação', async () => {
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    const pintada = async (l: Layer) => {
      const png = await new CanvasRenderer(1300, 1300).renderDesign({ canvas: { width: 1300, height: 1300, backgroundColor: 'transparent' }, layers: [l] } as never, {})
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
      return { x0, y0, x1: x1 + 1, y1: y1 + 1 }
    }
    const combinada = forma('q', { x: 500, y: 500, width: 100, height: 100 }, { order: 9, style: { shapeType: 'rectangle', fill: '#ff0000', border: { width: 12, color: '#000000', radius: 0 } }, effects: { blur: { enabled: true, blurRadius: 20 }, shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } })
    const lim = limitesDe(combinada)
    expect(lim.contido).toBe(true)
    if (!lim.contido) return
    expect(lim.rect.x).toBe(500 - 162 - FOLGA_DE_ANTIALIAS) // 12 + 60 + 30 + 30 + 30
    const p = await pintada(combinada)
    expect(p.x1).toBeGreaterThan(0)
    expect(p.x0 >= lim.rect.x && p.y0 >= lim.rect.y && p.x1 <= lim.rect.x + lim.rect.width && p.y1 <= lim.rect.y + lim.rect.height, JSON.stringify({ p, rect: lim.rect })).toBe(true)
    const t = texto('t', { x: 345, y: 500, width: 8, height: 100 }, 30)
    expect(cenariosNaoMedidos({ camadas: [t, combinada], canvas: CANVAS, metricas: [metrica(t)], textosSemMetrica: [], motivoSemMedida: undefined }, { colisao: { estado: 'avaliada' } })).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['q'] }])
    // Imagem com máscara + flip + crop + sombra + blur: tudo contido/expandido, provado no render.
    const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()
    const img = { id: 'i', name: 'i', type: 'image', visible: true, locked: false, order: 9, position: { x: 500, y: 500 }, size: { width: 100, height: 100 }, fileUrl: `data:image/png;base64,${png.toString('base64')}`, rotation: 30, style: { objectFit: 'cover', crop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, flipH: true, mask: { shapeId: 'circle', path: 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z' }, border: { width: 12, color: '#000000', radius: 0 } }, effects: { blur: { enabled: true, blurRadius: 20 }, shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } } as Layer
    const li = limitesDe(img)
    expect(li.contido).toBe(true)
    if (!li.contido) return
    const pi = await pintada(img)
    expect(pi.x1).toBeGreaterThan(0)
    expect(pi.x0 >= li.rect.x && pi.y0 >= li.rect.y && pi.x1 <= li.rect.x + li.rect.width && pi.y1 <= li.rect.y + li.rect.height, JSON.stringify({ pi, rect: li.rect })).toBe(true)
  }, 60_000)
})

describe('G21d — expansão por efeitos e os limites do texto protegido', () => {
  const cenario = (camadas: Layer[], metricas: TextLayerMetrics[]) => cenariosNaoMedidos({ camadas, canvas: CANVAS, metricas, textosSemMetrica: [], motivoSemMedida: undefined }, { colisao: { estado: 'avaliada' }, 'logo-sobre-texto': { estado: 'avaliada' } })
  const t = (x: number, w = 20) => texto('t', { x, y: 500, width: w, height: 100 }, 30)

  it('blur (folga 60), strokeWidth, border.width (forma e imagem), effects.shadow e style.shadow expandem; sem efeito, os mesmos textos → nada', () => {
    const quadrado = (extra: Partial<Layer>) => forma('q', { x: 500, y: 500, width: 100, height: 100 }, { order: 9, ...extra })
    const casos: Array<[string, Layer, number]> = [
      ['blur', quadrado({ effects: { blur: { enabled: true, blurRadius: 20 } } }), 434],
      ['strokeWidth', quadrado({ style: { shapeType: 'rectangle', strokeWidth: 12, strokeColor: '#000' } }), 486],
      ['border forma', quadrado({ style: { shapeType: 'rectangle', border: { width: 12, color: '#000', radius: 0 } } }), 486],
      ['border imagem', { ...fundo({ id: 'q' }), position: { x: 500, y: 500 }, size: { width: 100, height: 100 }, order: 9, style: { border: { width: 12, color: '#000', radius: 0 } } } as Layer, 486],
      ['effects.shadow', quadrado({ effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } }), 605],
      ['style.shadow', quadrado({ style: { shapeType: 'rectangle', shadow: { offsetX: 30, offsetY: 30, blur: 10, color: '#000' } } }), 605],
    ]
    for (const [nome, c, x] of casos) {
      const tx = t(x, 8)
      expect(cenario([tx, c], [metrica(tx)]), nome).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['q'] }])
      expect(cenario([tx, quadrado({})], [metrica(tx)]), `${nome} sem efeito`).toEqual([])
    }
  })

  it('limites de t: glifos que passam da caixa (autoExpand) entram na união; forma cobrindo só a MANCHA → nada', () => {
    const tx = texto('t', { x: 100, y: 500, width: 300, height: 50 }, 30)
    const m = metrica(tx, { glyphBottom: 700, realHeight: 200, lineCount: 4 })
    const abaixoDaCaixa = forma('q', { x: 100, y: 600, width: 100, height: 50 }, { order: 9 })
    expect(cenario([tx, abaixoDaCaixa], [m])).toEqual([{ tipo: 'oclusao', texto: 't', acima: ['q'] }])
    const comMancha = { ...tx, effects: { background: { enabled: true, backgroundColor: '#fff', padding: 40 } } } as Layer
    const soNaMancha = forma('q', { x: 100, y: 400, width: 100, height: 50 }, { order: 9 }) // y 400–450: acima da caixa (500), dentro do padding 40? 460–500 é a mancha; 400–450 não toca nada
    expect(cenario([comMancha, soNaMancha], [metrica(comMancha)])).toEqual([])
    const naMancha = forma('q', { x: 100, y: 465, width: 100, height: 30 }, { order: 9 }) // y 465–495: só a mancha (caixa começa em 500, glifos em 506)
    expect(cenario([comMancha, naMancha], [metrica(comMancha)])).toEqual([])
  })
})

// ─── G22/G27–G29 — invariantes com copy, identidade e piso ───────────────

describe('G22/G27–G29 — APTO exige copy completa, identidade válida e piso satisfeito', () => {
  it('G27: as 11 comprovadas + copy ausente / sem-contrato → só copy-completa reprova', () => {
    for (const copy of [undefined, { estado: 'sem-contrato' as const, lacunas: [] }]) {
      const g = gate({ copy })
      expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
      expect(g.motivos.map((m) => m.regra)).toEqual(['copy-completa'])
    }
  })

  it('G22/G28: pageVersion null → IDENTIDADE_ILEGIVEL, só identidade', () => {
    const g = gate({ identidade: { pageVersion: null, copyVersion: IDENTIDADE.copyVersion } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.motivos).toEqual([{ regra: 'identidade', codigo: 'IDENTIDADE_ILEGIVEL', motivo: 'identidade: camadas ilegíveis', camadas: [] }])
    expect(g.cobertura.identidade).toEqual({ estado: 'nao-comprovada', motivo: 'camadas ilegíveis' })
  })

  it('G29: story com texto em y=150 (dentro da margem, fora do piso) → só piso-de-interface; a mesma peça em feed → APTO', () => {
    const b = pecaLimpa()
    const camadas = b.camadas.map((l) => (l.id === 'apoio' ? { ...l, position: { x: 100, y: 150 } } : l))
    const metricas = b.metricas.map((m) => (m.layerId === 'apoio' ? { ...m, box: { ...m.box, y: 150 }, glyphTop: 156, glyphBottom: 204 } : m))
    const story = gate({ medida: { camadas, metricas } })
    expect(story.motivos.map((m) => m.regra)).toEqual(['piso-de-interface'])
    // Em feed a peça é a MESMA no canvas canônico do feed (1080×1350): o fundo cobre o canvas e o `servico` sobe para caber.
    const feed = { width: 1080, height: 1350 }
    const emFeed = camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: feed } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l))
    const metricasFeed = metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m))
    const gf = gate({ medida: { camadas: emFeed, metricas: metricasFeed, formato: 'feed', canvas: feed, assunto: { rect: { x: 0, y: 700, width: 1080, height: 400 }, origem: 'catalogo' } } })
    expect(gf.resultado).toBe('APTO')
  })
})

// ─── G23/G23b/G25 — classificação fechada, chaves declaradas, copyVersion ─

describe('G23/G23b/G25 — conjuntos fechados', () => {
  it('G23: REGRAS_CRITICAS ∪ NAO_CRITICAS === REGRAS_DA_REVISAO, sem sobra nem falta', () => {
    const uniao = [...REGRAS_CRITICAS, ...NAO_CRITICAS].sort()
    expect(uniao).toEqual([...REGRAS_DA_REVISAO].sort())
    expect(new Set(uniao).size).toBe(uniao.length)
  })

  it('G23b: toda chave DECLARADA em Layer/LayerStyle/TextboxConfig/BorderStyle/ShadowStyle (lidas do fonte, com chaves balanceadas) está classificada; filter é não suportada; toda folha aceita tem valorDeProva', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/types/template.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const corpoDe = (nome: string): string => {
      const i = fonte.indexOf(`export interface ${nome} {`)
      expect(i, nome).toBeGreaterThan(-1)
      let d = 0
      let j = fonte.indexOf('{', i)
      const inicio = j
      for (; j < fonte.length; j++) {
        if (fonte[j] === '{') d++
        else if (fonte[j] === '}') {
          d--
          if (d === 0) break
        }
      }
      return fonte.slice(inicio + 1, j)
    }
    const caminhos: string[] = []
    const visitar = (corpo: string, prefixo: string) => {
      let d = 0
      let atual = ''
      const entradas: string[] = []
      for (const ch of corpo) {
        if (ch === '{') d++
        if (ch === '}') d--
        if ((ch === ';' || ch === '\n') && d === 0) {
          if (atual.trim()) entradas.push(atual.trim())
          atual = ''
        } else atual += ch
      }
      if (atual.trim()) entradas.push(atual.trim())
      for (const e of entradas) {
        const m = /^(\w+)\??\s*:\s*([\s\S]+)$/.exec(e)
        if (!m) continue // índice `[key: string]` e afins
        const nome = m[1]
        const tipo = m[2].trim()
        const caminho = prefixo ? `${prefixo}.${nome}` : nome
        if (tipo.startsWith('{')) visitar(tipo.slice(1, tipo.lastIndexOf('}')), caminho)
        else if (/^(LayerStyle|TextboxConfig|BorderStyle|ShadowStyle)\b/.test(tipo)) visitar(corpoDe(tipo.replace(/\W.*$/, '')), caminho)
        else caminhos.push(caminho)
      }
    }
    visitar(corpoDe('Layer'), '')
    expect(caminhos.length).toBeGreaterThan(80)
    const classeDe = (caminho: string) => {
      if (CHAVES_CLASSIFICADAS[caminho] || CHAVES_CLASSIFICADAS[`${caminho}.*`]) return true
      const partes = caminho.split('.')
      for (let n = partes.length - 1; n >= 1; n--) if (CHAVES_CLASSIFICADAS[`${partes.slice(0, n).join('.')}.*`]) return true
      return false
    }
    const semClasse = caminhos.filter((c) => !classeDe(c))
    expect(semClasse, 'chave declarada sem classificação').toEqual([])
    expect(CHAVES_CLASSIFICADAS['style.filter'].classe).toBe('nao-suportada')
    for (const [caminho, c] of Object.entries(CHAVES_CLASSIFICADAS)) {
      if (c.classe !== 'nao-suportada') expect(c.valorDeProva, caminho).not.toBeUndefined()
    }
  })

  it('G25: copyVersionDe — null → sem-contrato; mesma copy com chaves em outra ordem → mesmo hash; diferente → diferente', () => {
    expect(copyVersionDe(null)).toBe('sem-contrato')
    expect(copyVersionDe(undefined)).toBe('sem-contrato')
    const a = copyVersionDe({ versao: 'copy-autoral-v1', blocos: [{ id: 'h', funcao: 'headline', linhas: ['A'] }] })
    const b = copyVersionDe({ blocos: [{ linhas: ['A'], funcao: 'headline', id: 'h' }], versao: 'copy-autoral-v1' })
    expect(a).toBe(b)
    expect(a).toMatch(/^c1:[0-9a-f]{20}$/)
    expect(copyVersionDe({ versao: 'copy-autoral-v1', blocos: [{ id: 'h', funcao: 'headline', linhas: ['B'] }] })).not.toBe(a)
  })
})

// ─── G24 — a fixture do piloto ────────────────────────────────────────────

describe('G24 — o relatório real da fixture do piloto', () => {
  it('a v1 (serviço medido sem leitura) → REVISAO_HUMANA_NECESSARIA com texto-sem-leitura:servico', () => {
    const peca = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/direcao-de-arte/__tests__/fixtures/piloto-2026-10-13/peca.json'), 'utf8'))
    const camadas = peca.v1.layers as Layer[]
    const porId = new Map(camadas.map((l) => [l.id, l]))
    const metricas: TextLayerMetrics[] = peca.composicaoRegistrada.medidasFinais.map((m: { id: string; fontSize: number; linhas: number; height: number; width: number; lineHeight: number }) => {
      const l = porId.get(m.id)!
      return { layerId: m.id, name: m.id, box: { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }, realHeight: m.height, maxLineWidth: m.width - 12, lineCount: m.linhas, glyphTop: l.position.y + 6, glyphBottom: l.position.y + m.height - 6, fontSize: m.fontSize, lineBox: m.fontSize * m.lineHeight, autoExpand: true }
    })
    const m: MedidaDaPeca = {
      canvas: peca.canvas,
      formato: 'story',
      camadas,
      metricas,
      geometria: [],
      contraste: peca.composicaoRegistrada.contraste as ContrasteMedido[],
      pioras: [],
      faixaDoGradiente: [0.45, 0.9],
      referencias: { headline: { fontSize1080: 84, entrelinha: null, origem: 'assinatura' } },
      assunto: { rect: peca.composicaoRegistrada.assunto, origem: 'estimado' },
      leituraDaLogo: [{ camada: 'logo', variante: { url: 'fixture:logo-wordmark', origem: 'pagina' }, posicao: { x: 813, y: 148, width: 197, height: 95 }, medida: medidaDaLogo(), estado: 'medida' }],
      fontesAusentes: [],
      medidasAproximadas: [],
      textosSemMetrica: [],
    }
    const { gate: g, relatorio } = gateDaMedida({ medida: m, identidade: IDENTIDADE, copy: COPY_OK, politicaDoAssunto: POLITICA })
    expect(relatorio.achados.some((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico'))).toBe(true)
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.achados.some((a) => a.regra === 'texto-sem-leitura' && a.camadas.includes('servico') && /texto-sem-leitura:servico/.test(a.id))).toBe(true)
    expect(motivosDe(g, 'texto-sem-leitura')[0]?.codigo).toBe('ACHADO_CRITICO')
  })
})

// ─── G21c / G21e — paridade com o render REAL, gerada da árvore ───────────

describe('G21c/G21e — paridade com o render real (gerada de CHAVES_CLASSIFICADAS)', () => {
  const CV = { width: 1200, height: 1300 }
  let CanvasRenderer: typeof import('@/lib/canvas-renderer').CanvasRenderer
  let imagemPng = ''
  beforeAll(async () => {
    ;({ CanvasRenderer } = await import('@/lib/canvas-renderer'))
    const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()
    imagemPng = `data:image/png;base64,${png.toString('base64')}`
  }, 60_000)

  async function caixaPintada(layers: Layer[]): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
    const png = await new CanvasRenderer(CV.width, CV.height).renderDesign({ canvas: { ...CV, backgroundColor: 'transparent' }, layers } as never, {})
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
  }

  // Variante SEM pixel pintado não prova nada (Codex R1): `null` reprova.
  const dentro = (pintada: { x0: number; y0: number; x1: number; y1: number } | null, r: { x: number; y: number; width: number; height: number }) =>
    pintada !== null && pintada.x0 >= r.x && pintada.y0 >= r.y && pintada.x1 <= r.x + r.width && pintada.y1 <= r.y + r.height

  type Base = { nome: string; camada: Layer; chaves: (c: string) => boolean }
  const geral = (c: string) => !/^style\.(font|text|letter|line|gradient|objectFit|cropPosition|crop\.|iconId|path|shapeType|fill|stroke|border\.radius|blur|exposure|contrast|highlights|shadows|whites|blacks|saturation|vignette|brightness|grayscale|sepia|invert)/.test(c) && !/^(textboxConfig|content|richTextStyles|videoMetadata|clipe|movimento|logoId|elementId|fileUrl|parentId|metadata|id|name|type|visible|locked|order|isDynamic)/.test(c) && !/^effects\.background/.test(c)
  const bases = (): Base[] => {
    const formaBase = (shapeType: string, w: number, h: number): Layer => forma(shapeType, { x: 400, y: 500, width: w, height: h }, { style: { shapeType: shapeType as never, fill: '#ff0000' } })
    const img = (type: 'image' | 'logo' | 'element'): Layer => ({ id: type, name: type, type, visible: true, locked: false, order: 5, position: { x: 400, y: 500 }, size: { width: 100, height: 100 }, fileUrl: imagemPng, style: { objectFit: 'cover' } }) as Layer
    const grad = (type: 'gradient' | 'gradient2'): Layer => ({ id: type, name: type, type, visible: true, locked: false, order: 5, position: { x: 400, y: 500 }, size: { width: 600, height: 40 }, style: { gradientType: 'linear', gradientAngle: 90, gradientStops: [{ id: 'a', color: '#000000', position: 0, opacity: 1 }, { id: 'b', color: '#ffffff', position: 1, opacity: 1 }] } }) as Layer
    return [
      { nome: 'rectangle 600×40', camada: formaBase('rectangle', 600, 40), chaves: (c) => geral(c) || /^style\.(fill|stroke|border\.radius|shapeType)/.test(c) },
      { nome: 'rounded-rectangle 100×100', camada: formaBase('rounded-rectangle', 100, 100), chaves: (c) => geral(c) || /^style\.(fill|stroke|border\.radius)/.test(c) },
      { nome: 'circle 100×100', camada: formaBase('circle', 100, 100), chaves: (c) => geral(c) || /^style\.(fill|stroke)/.test(c) },
      { nome: 'triangle 100×100', camada: formaBase('triangle', 100, 100), chaves: (c) => geral(c) || /^style\.(fill|stroke)/.test(c) },
      { nome: 'star 100×100', camada: formaBase('star', 100, 100), chaves: (c) => geral(c) || /^style\.(fill|stroke)/.test(c) },
      { nome: 'image', camada: img('image'), chaves: (c) => geral(c) || /^style\.(objectFit|cropPosition|crop\.|border\.radius|exposure|contrast|highlights|shadows|whites|blacks|saturation|vignette|brightness|grayscale|sepia|invert)/.test(c) },
      { nome: 'logo', camada: img('logo'), chaves: (c) => geral(c) || /^style\.(objectFit|border\.radius)/.test(c) },
      { nome: 'element', camada: img('element'), chaves: (c) => geral(c) || /^style\.objectFit/.test(c) },
      { nome: 'gradient', camada: grad('gradient'), chaves: (c) => geral(c) || /^style\.gradient/.test(c) },
      { nome: 'gradient2', camada: grad('gradient2'), chaves: (c) => geral(c) || /^style\.gradient/.test(c) },
    ]
  }

  function aplicar(camada: Layer, caminho: string, valor: unknown): Layer {
    const copia = JSON.parse(JSON.stringify(camada)) as Record<string, unknown>
    const partes = caminho.replace(/\.\*$/, '').split('.')
    let alvo: Record<string, unknown> = copia
    for (const p of partes.slice(0, -1)) {
      if (!ehObj(alvo[p])) alvo[p] = {}
      alvo = alvo[p] as Record<string, unknown>
    }
    alvo[partes[partes.length - 1]] = valor
    // Folhas de efeito precisam do `enabled` para o render desenhar o efeito.
    const fx = copia.effects as Record<string, Record<string, unknown>> | undefined
    if (fx?.blur && fx.blur.enabled === undefined) fx.blur = { enabled: true, blurRadius: 20, ...fx.blur }
    if (fx?.stroke && fx.stroke.enabled === undefined) fx.stroke = { enabled: true, strokeColor: '#000', strokeWidth: 12, ...fx.stroke }
    if (fx?.shadow && fx.shadow.enabled === undefined) fx.shadow = { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1, ...fx.shadow }
    const st = copia.style as Record<string, unknown> | undefined
    if (st?.shadow && ehObj(st.shadow)) st.shadow = { offsetX: 30, offsetY: 30, blur: 10, color: '#000', ...(st.shadow as object) }
    if (st?.border && ehObj(st.border)) st.border = { width: 12, color: '#000', radius: 0, ...(st.border as object) }
    if (st?.mask && ehObj(st.mask)) st.mask = { shapeId: 'circle', path: 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z', ...(st.mask as object) }
    return copia as unknown as Layer
  }
  const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

  it('G21c: toda folha aceita, em cada base aplicável, mais rotação/flip/mask/efeitos: pixels pintados dentro de limitesDe; folha aceita sem valorDeProva falha', async () => {
    const folhas = Object.entries(CHAVES_CLASSIFICADAS).filter(([, c]) => c.classe !== 'nao-suportada')
    for (const [caminho, c] of folhas) expect(c.valorDeProva, caminho).not.toBeUndefined()
    const fixos: Array<[string, Partial<Layer>]> = [
      ['rotation 30', { rotation: 30 }],
      ['rotation 90', { rotation: 90 }],
      ['rotation 180', { rotation: 180 }],
      ['rotation 270', { rotation: 270 }],
      ['flipH', { style: { flipH: true } as never }],
      ['blur 20', { effects: { blur: { enabled: true, blurRadius: 20 } } }],
      ['shadow', { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } }],
      ['style.shadow', { style: { shadow: { offsetX: 30, offsetY: 30, blur: 10, color: '#000' } } as never }],
      ['border 12', { style: { border: { width: 12, color: '#000', radius: 0 } } as never }],
    ]
    // O TEXTO simples como OCLUIDORA também é base (Codex R1): métrica real do medidor por variante (o layout muda com a folha).
    const { createServerTextBoxMeasurer } = await import('@/lib/creatives/server-text-measurer')
    const medir = await createServerTextBoxMeasurer()
    const textoBase: Base = {
      nome: 'text 300×100 (ocluidora)',
      camada: texto('tx', { x: 400, y: 500, width: 300, height: 100 }, 40, { content: 'Sua pausa\ncom sabores', style: { fontSize: 40, fontFamily: 'sans-serif', lineHeight: 1.2, textAlign: 'left', color: '#000000' }, textboxConfig: { autoWrap: { lineHeight: 1.2, breakMode: 'word', autoExpand: true } } }),
      chaves: (c) => (geral(c) && !/^style\.(shadow|border)\.|^effects\.blur/.test(c) ? true : /^style\.(font|text|letter|line)|^textboxConfig|^effects\.(stroke|blur|shadow)|^style\.(shadow|border)\./.test(c)),
    }
    let casos = 0
    for (const base of [...bases(), textoBase]) {
      const variantes: Array<[string, Layer]> = [['base', base.camada]]
      for (const [caminho, c] of folhas) if (base.chaves(caminho)) variantes.push([caminho, aplicar(base.camada, caminho, c.valorDeProva)])
      for (const [nome, extra] of fixos) variantes.push([nome, { ...base.camada, ...extra, style: { ...(base.camada.style ?? {}), ...((extra as { style?: object }).style ?? {}) } } as Layer])
      for (const [nome, camada] of variantes) {
        const metricaDaVariante = camada.type === 'text' ? measureTextLayers([camada], medir)[0] : undefined
        const lim = limitesDe(camada, metricaDaVariante)
        expect(lim.contido, `${base.nome} / ${nome}: ${lim.contido === false ? lim.motivo : ''}`).toBe(true)
        if (!lim.contido) continue
        const pintada = await caixaPintada([camada])
        expect(dentro(pintada, lim.rect), `${base.nome} / ${nome}: pintado ${JSON.stringify(pintada)} fora de ${JSON.stringify(lim.rect)}`).toBe(true)
        casos++
      }
    }
    expect(casos).toBeGreaterThan(120)
    // Valores fixos: retângulo a 90° e círculo sem rotação.
    const r90 = limitesDe(forma('r', { x: 400, y: 500, width: 600, height: 40 }, { rotation: 90 }))
    expect(r90.contido && [r90.rect.x + FOLGA_DE_ANTIALIAS, r90.rect.y + FOLGA_DE_ANTIALIAS, r90.rect.x + r90.rect.width - FOLGA_DE_ANTIALIAS, r90.rect.y + r90.rect.height - FOLGA_DE_ANTIALIAS].map(Math.round)).toEqual([360, 500, 400, 1100])
    const circ = limitesDe(forma('c', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'circle' } }))
    expect(circ.contido && [circ.rect.x + FOLGA_DE_ANTIALIAS, circ.rect.y + FOLGA_DE_ANTIALIAS, circ.rect.x + circ.rect.width - FOLGA_DE_ANTIALIAS, circ.rect.y + circ.rect.height - FOLGA_DE_ANTIALIAS]).toEqual([350, 450, 450, 550])
    // Fora do conjunto: contido: false.
    for (const l of [
      forma('x', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'svg-path', pathData: 'M0 0H100V100Z' } }),
      { ...forma('x', { x: 400, y: 500, width: 10, height: 10 }), type: 'icon', style: { iconId: 'star' } } as Layer,
      forma('x', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'line' } }),
      forma('x', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'arrow' } }),
      { ...forma('x', { x: 400, y: 500, width: 100, height: 100 }), type: 'video' } as Layer,
      forma('x', { x: 400, y: 500, width: 100, height: 100 }, { style: { shapeType: 'rectangle', filter: 'blur(2px)' } }),
      { ...texto('x', { x: 400, y: 500, width: 100, height: 100 }, 20), type: 'rich-text' } as Layer,
      texto('x', { x: 400, y: 500, width: 100, height: 100 }, 20, { effects: { background: { enabled: true, backgroundColor: '#fff', padding: 10 } } }),
    ]) expect(limitesDe(l, metrica(l)).contido, l.id + String(l.type) + String(l.style?.shapeType)).toBe(false)
    expect(limitesDe(texto('x', { x: 400, y: 500, width: 100, height: 100 }, 20)).contido).toBe(false) // texto sem métrica
  }, 600_000)

  it('G21e: o lado PROTEGIDO — texto com métrica real do medidor, rotações, autoExpand e cada folha de texto aceita: glifos dentro de limitesDoTexto', async () => {
    const { createServerTextBoxMeasurer } = await import('@/lib/creatives/server-text-measurer')
    const medir = await createServerTextBoxMeasurer()
    const base = texto('t', { x: 600, y: 600, width: 300, height: 100 }, 40, { content: 'Sua pausa\ncom sabores', style: { fontSize: 40, fontFamily: 'sans-serif', lineHeight: 1.2, textAlign: 'left', color: '#000000' }, textboxConfig: { autoWrap: { lineHeight: 1.2, breakMode: 'word', autoExpand: true } } })
    const folhasDeTexto = Object.entries(CHAVES_CLASSIFICADAS).filter(([c, k]) => k.classe !== 'nao-suportada' && (/^style\.(font|text|letter|line)/.test(c) || /^textboxConfig/.test(c) || /^effects\.(stroke|blur|shadow)/.test(c) || /^style\.(shadow|border)\./.test(c)))
    for (const [caminho, c] of folhasDeTexto) expect(c.valorDeProva, caminho).not.toBeUndefined()
    const variantes: Array<[string, Layer]> = [['base', base]]
    for (const rot of [30, 90, 180, 270]) variantes.push([`rotation ${rot}`, { ...base, rotation: rot }])
    variantes.push(['autoExpand false', { ...base, textboxConfig: { autoWrap: { lineHeight: 1.2, breakMode: 'word', autoExpand: false } } }])
    for (const [caminho, c] of folhasDeTexto) variantes.push([caminho, aplicar(base, caminho, c.valorDeProva)])
    variantes.push(['background 40 (mancha fora do render)', { ...base, effects: { background: { enabled: true, backgroundColor: '#ffffff', padding: 40 } } }])
    let casos = 0
    for (const [nome, camada] of variantes) {
      const [m] = measureTextLayers([camada], medir)
      expect(m, `${nome}: sem métrica`).toBeTruthy()
      const lim = limitesDoTexto(camada, m, 'protegido')
      expect(lim.contido, `${nome}: ${lim.contido === false ? lim.motivo : ''}`).toBe(true)
      if (!lim.contido) continue
      // A mancha não entra nos limites: renderiza SEM ela (a decisão é sobre os glifos).
      const semMancha = { ...camada, effects: { ...(camada.effects ?? {}), background: undefined } } as Layer
      const pintada = await caixaPintada([semMancha])
      expect(dentro(pintada, lim.rect), `${nome}: pintado ${JSON.stringify(pintada)} fora de ${JSON.stringify(lim.rect)}`).toBe(true)
      casos++
    }
    expect(casos).toBeGreaterThan(15)
    const [m90] = measureTextLayers([{ ...base, rotation: 90 }], medir)
    const l90 = limitesDoTexto({ ...base, rotation: 90 }, m90)
    // 300×100 em (600, 600) a 90° → x 500–600 × y 600–900 (antes das expansões; aqui só a folga de antialias e a união com os glifos).
    expect(l90.contido && l90.rect.x + l90.rect.width - FOLGA_DE_ANTIALIAS).toBeCloseTo(600, 0)
    expect(l90.contido && l90.rect.y + FOLGA_DE_ANTIALIAS).toBeCloseTo(600, 0)
    expect(l90.contido && l90.rect.x + FOLGA_DE_ANTIALIAS <= 500).toBe(true)
    expect(l90.contido && l90.rect.y + l90.rect.height - FOLGA_DE_ANTIALIAS >= 900).toBe(true)
    for (const l of [{ ...base, style: { ...base.style, filter: 'blur(2px)' } }, { ...base, rotation: '90' as never }, { ...base, style: { ...base.style, escala: 2 } as never }]) {
      const [m] = measureTextLayers([l as Layer], medir)
      expect(limitesDoTexto(l as Layer, m).contido).toBe(false)
    }
  }, 600_000)

  it('oclusão EFETIVA comprovada pelo renderer: a forma acima apaga os glifos do texto (pixels do texto somem) e o gate a acusa; controle sem efeito e sem forma acima → APTO', async () => {
    const { createServerTextBoxMeasurer } = await import('@/lib/creatives/server-text-measurer')
    const medir = await createServerTextBoxMeasurer()
    const t = texto('t', { x: 600, y: 600, width: 300, height: 100 }, 40, { content: 'Sua pausa', rotation: 90, style: { fontSize: 40, fontFamily: 'sans-serif', lineHeight: 1.2, textAlign: 'left', color: '#000000' } })
    const f = forma('f', { x: 500, y: 600, width: 100, height: 300 }, { order: 9, style: { shapeType: 'rectangle', fill: '#ff0000' } })
    const [m] = measureTextLayers([t], medir)
    // Render do texto sozinho × com a forma acima: os pixels PRETOS do texto desaparecem (a forma cobre a manchete inteira).
    const pretos = async (layers: Layer[]) => {
      const png = await new CanvasRenderer(CV.width, CV.height).renderDesign({ canvas: { ...CV, backgroundColor: '#ffffff' }, layers } as never, {})
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
      let n = 0
      for (let i = 0; i < info.width * info.height; i++) if (data[i * info.channels] < 60 && data[i * info.channels + 1] < 60 && data[i * info.channels + 2] < 60) n++
      return n
    }
    const so = await pretos([t])
    const coberto = await pretos([t, f])
    expect(so).toBeGreaterThan(200)
    expect(coberto).toBeLessThan(so * 0.05)
    const g = gate({ medida: { camadas: [fundo(), t, f, logo()], metricas: [m] } })
    expect(g.cobertura.oclusao.estado).toBe('nao-comprovada')
    expect(motivosDe(g, 'oclusao')[0]?.codigo).toBe('NAO_MEDIDO')
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    // Controle: a mesma peça com a forma ABAIXO do texto (order 1) e sem efeitos → oclusão comprovada.
    const controle = gate({ medida: { camadas: [fundo(), t, { ...f, order: 1 }, logo()], metricas: [m] } })
    expect(controle.cobertura.oclusao).toEqual({ estado: 'comprovada' })
  }, 120_000)
})
