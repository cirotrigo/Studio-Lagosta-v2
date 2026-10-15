/**
 * CP3 — a regra `logo-sem-leitura` do revisor, com a leitura já medida (sem render): o achado, a evidência, e a
 * cobertura em cada estado (medida e legível, ilegível, arquivo indisponível, fora do contrato do desenho, não
 * medida, logo num arranjo). Nunca propõe ajuste; o humano só é avisado.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { avaliarPeca, type EntradaDaRevisao, type LeituraDaLogoNaRevisao } from '../regras'
import type { MedidaDaLogo } from '@/lib/compositor/legibilidade-da-logo'

const W = 1080
const H = 1920

function logo(id = 'logo', extra: Partial<Layer> = {}): Layer {
  return { id, name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 799, y: 1575 }, size: { width: 189, height: 95 }, fileUrl: 'https://blob.test/logo.png', style: { objectFit: 'contain' }, ...extra } as Layer
}

function entrada(parcial: Partial<EntradaDaRevisao>): EntradaDaRevisao {
  return { canvas: { width: W, height: H }, formato: 'story', camadas: [], metricas: [], geometria: [], contraste: [], faixaDoGradiente: [0.45, 0.9], referencias: {}, assunto: null, fontesAusentes: [], medidasAproximadas: [], ...parcial }
}

const medida = (p10: number, extra: Partial<MedidaDaLogo> = {}): MedidaDaLogo => ({ pixelsAvaliados: 5159, contrasteP10: p10, contrasteMedio: Math.max(p10, 60), proporcaoAcima45: p10 >= 45 ? 1 : 0.4, luzDaLogo: 200, luzDoFundo: 150, legivel: p10 >= 45, ...extra })
const leitura = (camada: string, m: MedidaDaLogo | null, estado: LeituraDaLogoNaRevisao['estado'] = 'medida', motivo?: string): LeituraDaLogoNaRevisao => ({ camada, variante: { url: 'https://blob.test/logo.png', origem: 'pagina' }, posicao: { x: 799, y: 1575, width: 189, height: 95 }, medida: m, estado, ...(motivo ? { motivo } : {}) })

const achadosDaLogo = (r: ReturnType<typeof avaliarPeca>) => r.achados.filter((a) => a.regra === 'logo-sem-leitura')

describe('logo-sem-leitura', () => {
  it('logo medida e legível: nenhum achado, regra avaliada', () => {
    const r = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: [leitura('logo', medida(120))] }))
    expect(achadosDaLogo(r)).toEqual([])
    expect(r.cobertura['logo-sem-leitura']).toEqual({ estado: 'avaliada' })
  })

  it('logo ilegível: problema MEDIDO, com p10, média, proporção, pixels, limiar, alfa, variante e posição — e sem ajuste', () => {
    const r = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: [leitura('logo', medida(12, { contrasteMedio: 70, proporcaoAcima45: 0.69 }))] }))
    const [a] = achadosDaLogo(r)
    expect(a).toMatchObject({ severidade: 'problema', certeza: 'medida', camadas: ['logo'], ajustes: [] })
    expect(a.mensagem).toMatch(/31% dos pixels dela têm contraste abaixo de 45/)
    expect(a.mensagem).toMatch(/p10 12/)
    expect(a.evidencia).toMatchObject({ codigo: 'LOGO_SEM_LEITURA', p10: 12, media: 70, proporcaoNoLimiar: 0.69, pixelsAvaliados: 5159, limiar: 45, alfaMinimo: 128, percentil: 0.1, variante: 'https://blob.test/logo.png', origem: 'pagina', x: 799, y: 1575, largura: 189, altura: 95 })
    expect(a.observacao).toMatch(/Nenhuma variante é fabricada/)
    expect(r.cobertura['logo-sem-leitura']).toEqual({ estado: 'avaliada' })
    expect(r.ajustes).toEqual([])
  })

  it('a média alta não salva a logo: p10 abaixo do limiar é problema mesmo com média 140', () => {
    const r = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: [leitura('logo', medida(6, { contrasteMedio: 144 }))] }))
    expect(achadosDaLogo(r)).toHaveLength(1)
  })

  it('arquivo indisponível: cobertura parcial (ou não avaliada quando é a única), dita — nunca "sem contraste"', () => {
    const so = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: [leitura('logo', null, 'indisponivel', 'HTTP 404 ao baixar')] }))
    expect(achadosDaLogo(so)).toEqual([])
    expect(so.cobertura['logo-sem-leitura']).toEqual({ estado: 'nao-avaliada', motivo: 'logo: o arquivo da logo não carregou (HTTP 404 ao baixar)' })
    const duas = avaliarPeca(entrada({ camadas: [logo(), logo('logo-2')], leituraDaLogo: [leitura('logo', medida(90)), leitura('logo-2', null, 'indisponivel', 'HTTP 404 ao baixar')] }))
    expect(duas.cobertura['logo-sem-leitura']).toMatchObject({ estado: 'parcial' })
  })

  it('camada fora do contrato do desenho (rotação, opacidade, recorte): não é medida, dita', () => {
    const r = avaliarPeca(entrada({ camadas: [logo('logo', { rotation: 90 })], leituraDaLogo: [leitura('logo', null, 'fora-do-contrato', 'a camada é desenhada com rotação 90°: a medida da caixa não representa o desenho')] }))
    expect(achadosDaLogo(r)).toEqual([])
    expect(r.cobertura['logo-sem-leitura']).toMatchObject({ estado: 'nao-avaliada', motivo: expect.stringContaining('rotação 90°') })
  })

  it('leitura não medida (render falhou): regra não avaliada com o motivo; sem leitura e sem logo: avaliada', () => {
    const falhou = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: null, motivoSemLeituraDaLogo: 'a leitura da logo não foi medida: render falhou' }))
    expect(falhou.cobertura['logo-sem-leitura']).toEqual({ estado: 'nao-avaliada', motivo: 'a leitura da logo não foi medida: render falhou' })
    const semLogo = avaliarPeca(entrada({ camadas: [], leituraDaLogo: [] }))
    expect(semLogo.cobertura['logo-sem-leitura']).toEqual({ estado: 'avaliada' })
  })

  it('a logo num arranjo (grupo com o texto) não é medida como logo solta: não avaliada, dita', () => {
    const r = avaliarPeca(entrada({ camadas: [logo('logo', { metadata: { groupId: 'g-rodape' } })], leituraDaLogo: [] }))
    expect(r.cobertura['logo-sem-leitura']).toMatchObject({ estado: 'nao-avaliada', motivo: expect.stringContaining('arranjo') })
  })

  it('imagem com "logo" no nome (parceiro, selo) ilegível é AVISO, com observação própria', () => {
    const parceiro = { ...logo('selo'), type: 'image', name: 'logo do parceiro' } as Layer
    const r = avaliarPeca(entrada({ camadas: [parceiro], leituraDaLogo: [{ ...leitura('selo', medida(10)), variante: { url: 'https://blob.test/parceiro.png' } }] }))
    const [a] = achadosDaLogo(r)
    expect(a.severidade).toBe('aviso')
    expect(a.observacao).toMatch(/parceiro, selo/)
  })

  it('a regra não depende das métricas de texto: com a medição dos textos falhada ela continua avaliada', () => {
    const r = avaliarPeca(entrada({ camadas: [logo()], leituraDaLogo: [leitura('logo', medida(90))], motivoSemMedida: 'o medidor falhou' }))
    expect(r.cobertura['logo-sem-leitura']).toEqual({ estado: 'avaliada' })
    expect(r.cobertura['colisao']).toMatchObject({ estado: 'nao-avaliada' })
  })

  it('data URL na variante vai truncada à evidência (nunca a base64 inteira)', () => {
    const enorme = `data:image/png;base64,${'A'.repeat(5000)}`
    const r = avaliarPeca(entrada({ camadas: [logo('logo', { fileUrl: enorme })], leituraDaLogo: [{ ...leitura('logo', medida(10)), variante: { url: enorme } }] }))
    expect(String(achadosDaLogo(r)[0].evidencia.variante).length).toBeLessThan(60)
  })
})
