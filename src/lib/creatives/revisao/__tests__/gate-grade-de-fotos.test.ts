/**
 * G4.5 · o gate com GRADE DE FOTOS (página multi-imagem realista: Story 2/1/2, Blob próprio, célula vazia, textos e
 * logo). O revisor mede o assunto de UMA foto; com várias, `texto-sobre-assunto` cai no fallback que já existia
 * (`fotoDeFundo` + "segunda foto"/"foto sem fundo reconhecido") — NÃO_COMPROVADA e revisão humana, nunca APTO. E nada
 * de retorno antecipado: as falhas REAIS da mesma peça (colisão, copy, fonte, identidade) continuam no gate.
 * Sem mudança no gate (caracterização); a foto avulsa (`pecaLimpa`) segue APTO.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { gateDaMedida, REGRAS_CRITICAS } from '../gate'
import { POLITICA_DO_ASSUNTO_RECOMENDADA } from '../gate'
import { entrada, fundo, metrica, pecaLimpa, texto } from './suporte/corpus-do-gate'
import { criarGrade, preencherCelula } from '@/lib/grades/operacoes'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'

/** 2/1/2 do Story na metade de baixo, quatro fotos e uma célula vazia, criada e preenchida pelo motor real */
function celulas(caixa = { x: 0, y: 700, w: 1080, h: 1220 }): Layer[] {
  const r = criarGrade({ layout: '2-1-2', caixa, espacamento: 10, idDaGrade: 'g1', idsDasCelulas: ['c0', 'c1', 'c2', 'c3', 'c4'] })
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor.map((c, i) => {
    if (i === 3) return c
    const p = preencherCelula(c, `${BLOB}/foto-${i}.jpg`)
    if (!p.ok) throw new Error(JSON.stringify(p.diagnosticos))
    return p.valor
  })
}
const IDS = ['c0', 'c1', 'c2', 'c3', 'c4']
/** A peça limpa trocando a foto de fundo pela grade (textos no topo, fora das células) */
const comGrade = () => {
  const base = pecaLimpa()
  return { camadas: [...celulas(), ...base.camadas.filter((l) => l.id !== 'bg-foto')], metricas: base.metricas }
}
const gate = (parcial: Parameters<typeof entrada>[0]) => {
  const g = gateDaMedida(entrada(parcial)).gate
  expect(g.resultado === 'APTO').toBe(g.motivos.length === 0 && g.naoMedidos.length === 0)
  return g
}

describe('gate × grade de fotos', () => {
  it('controle: a foto avulsa da peça limpa segue APTO', () => {
    expect(gate({}).resultado).toBe('APTO')
  })

  it('grade sem foto de fundo: texto-sobre-assunto NÃO comprovada citando as células (vazia inclusive), revisão humana', () => {
    const peca = comGrade()
    expect(peca.camadas.filter((l) => IDS.includes(l.id))).toHaveLength(5)
    const g = gate({ medida: { camadas: peca.camadas, metricas: peca.metricas } })
    expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(g.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    const motivo = g.motivos.find((m) => m.regra === 'texto-sobre-assunto')!
    expect(motivo.codigo).toBe('NAO_COMPROVADA')
    expect(motivo.camadas).toEqual(IDS)
    // as outras críticas seguem medidas, nada escondido nem inventado
    for (const regra of REGRAS_CRITICAS.filter((r) => r !== 'texto-sobre-assunto')) {
      expect(['comprovada', 'nao-se-aplica'], regra).toContain(g.cobertura[regra].estado)
    }
  })

  it('grade sobre a foto de fundo: NÃO comprovada citando o fundo e as células, com as 4 políticas do assunto', () => {
    const peca = pecaLimpa()
    for (const politica of [POLITICA_DO_ASSUNTO_RECOMENDADA, { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' }, { estimado: 'humano', semAssuntoLocalizavel: 'humano' }, { estimado: 'comprova', semAssuntoLocalizavel: 'humano' }] as const) {
      const g = gate({ politicaDoAssunto: politica, medida: { camadas: [fundo(), ...celulas(), ...peca.camadas.filter((l) => l.id !== 'bg-foto')] } })
      expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
      expect(g.motivos.find((m) => m.regra === 'texto-sobre-assunto')!.camadas).toEqual(['bg-foto', ...IDS])
    }
  })

  it('falhas REAIS da mesma peça com grade continuam no gate, cada uma pelo seu motivo: colisão, fonte, copy, identidade', () => {
    const peca = comGrade()
    const headline = peca.camadas.find((l) => l.id === 'headline')!
    const apoio = texto('apoio', { x: 100, y: 340, width: 600, height: 60 }, 40)
    const camadas = peca.camadas.map((l) => (l.id === 'apoio' ? apoio : l))
    const metricas = [metrica(headline), metrica(apoio), peca.metricas[2]]
    const colisao = gate({ medida: { camadas, metricas, geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 60, detalhe: 'sobrepõem' } as never] } })
    expect(colisao.cobertura.colisao.estado).toBe('reprovada')
    expect(colisao.motivos.some((m) => m.regra === 'colisao' && m.codigo === 'ACHADO_CRITICO')).toBe(true)
    const fonte = gate({ medida: { ...comGrade(), fontesAusentes: [{ familia: 'Branley GC', peso: null, camadas: ['headline'] }] } })
    expect(fonte.cobertura['fonte-nao-carregada'].estado).toBe('reprovada')
    const copy = gate({ medida: comGrade(), copy: { estado: 'sem-mudanca', lacunas: ['cta'] } })
    expect(copy.cobertura['copy-completa']).toEqual({ estado: 'nao-comprovada', motivo: 'lacunas: cta' })
    const identidade = gate({ medida: comGrade(), identidade: { pageVersion: null, copyVersion: null } as never })
    expect(identidade.motivos.some((m) => m.codigo === 'IDENTIDADE_ILEGIVEL')).toBe(true)
    for (const g of [colisao, fonte, copy, identidade]) {
      expect(g.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
      expect(g.cobertura['texto-sobre-assunto'].estado).toBe('nao-comprovada')
    }
  })
})
