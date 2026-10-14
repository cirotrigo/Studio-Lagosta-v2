/**
 * CP1 (13/10/2026) — NADA EM SILÊNCIO no executor de ajustes: todo campo de
 * todo ajuste termina APLICADO (e aparece no `detalhe`) ou RECUSADO (com
 * `codigo` e `campos`). O caso que motivou: na peça piloto, um gradiente com
 * `cor` sobre um véu existente teve a cor descartada calada enquanto a força
 * mudava, e o registro dizia `recusados: []`.
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import { camadaDeGradiente, CURVA_DE_LEITURA } from '@/lib/compositor/gradiente-de-leitura'
import { aplicarAjustes } from '../aplicar-ajustes'
import { camposForaDoTipo, problemaDoAjuste, problemaEstruturadoDoAjuste, type Ajuste } from '../contrato'

const W = 1080
const H = 1920
const canvas = { width: W, height: H }
const medir = (l: Layer) => (l.type !== 'text' ? null : Math.round(String(l.content ?? '').split('\n').length * Number(l.style?.fontSize ?? 16) * 1.2 + 12))

const foto = { id: 'bg-foto', name: 'foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: W, height: H } } as Layer
const texto = (id: string, y: number): Layer =>
  ({ id, name: id, type: 'text', visible: true, locked: false, order: 3, content: 'Linha', position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40, lineHeight: 1.2, textAlign: 'left' } }) as Layer
const veuCreme = (): Layer => ({ ...camadaDeGradiente({ borda: 'rodape', W, H, altura: 600, cor: '#F3EADC', curva: CURVA_DE_LEITURA, forca: 0.45 }), order: 1 })
const peca = () => [foto, veuCreme(), texto('servico', 1700)]
const aplicar = (ajustes: Ajuste[], camadas = peca()) => aplicarAjustes(camadas, ajustes, { canvas, medir })
const rodape = (camadas: Layer[]) => camadas.find((l) => l.id === 'gradiente-leitura-rodape')!
const cores = (l: Layer) => [...new Set(((l.style as { gradientStops: Array<{ color: string }> }).gradientStops).map((s) => s.color))]

describe('campo que o tipo não usa', () => {
  it('é recusado com CAMPO_FORA_DO_TIPO e o campo nomeado — nunca ignorado calado', () => {
    for (const [ajuste, campo] of [
      [{ tipo: 'mover', camadas: ['servico'], dy: 10, forca: 0.5 }, 'forca'],
      [{ tipo: 'fonte', camadas: ['servico'], fontSize: 30, dx: 5 }, 'dx'],
      [{ tipo: 'visibilidade', camadas: ['servico'], visivel: false, cor: '#000000' }, 'cor'],
    ] as Array<[Ajuste, string]>) {
      const r = aplicar([ajuste])
      expect(r.aplicados).toEqual([])
      expect(r.recusados).toEqual([expect.objectContaining({ indice: 0, codigo: 'CAMPO_FORA_DO_TIPO', campos: [campo] })])
    }
  })

  it('o contrato aponta o campo antes de qualquer página (a fronteira do ajustar-arte recusa a chamada)', () => {
    const a = { tipo: 'mover', camadas: ['servico'], dy: 10, forca: 0.5 } as Ajuste
    expect(camposForaDoTipo(a)).toEqual(['forca'])
    expect(problemaEstruturadoDoAjuste(a)).toMatchObject({ codigo: 'CAMPO_FORA_DO_TIPO', campos: ['forca'] })
    expect(problemaDoAjuste(a)).toMatch(/mover não usa "forca"/)
    // O rótulo `achado` vale para qualquer tipo.
    expect(camposForaDoTipo({ tipo: 'mover', camadas: ['servico'], dy: 10, achado: 'x:y' } as Ajuste)).toEqual([])
  })
})

describe('cor num gradiente que já existe', () => {
  it('cor diferente da dele: o ajuste inteiro é RECUSADO (COR_DE_GRADIENTE_EXISTENTE) e nada muda — nem a força', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', cor: '#283D36', forca: 0.85, altura: 730 }])
    expect(r.aplicados).toEqual([])
    expect(r.recusados).toEqual([expect.objectContaining({ indice: 0, codigo: 'COR_DE_GRADIENTE_EXISTENTE', campos: ['cor'] })])
    expect(r.recusados[0].motivo).toMatch(/#283D36 não foi aplicada/)
    expect(cores(rodape(r.camadas))).toEqual(['#F3EADC'])
    expect(rodape(r.camadas).metadata).toMatchObject({ forca: 0.45 })
    expect(rodape(r.camadas).size.height).toBe(600)
  })

  it('cor igual à dele é só confirmação: aplica e diz no detalhe', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', cor: '#f3eadc', forca: 0.6 }])
    expect(r.recusados).toEqual([])
    expect(r.aplicados[0].detalhe).toMatch(/força 0\.45→0\.6, cor #f3eadc mantida/)
  })

  it('pela borda, sobre um gradiente DESENHADO À MÃO de outra cor: recusado — criar outro sob ele seria a troca por outra porta', () => {
    const aMao = { ...veuCreme(), id: 'gradiente-da-equipe', metadata: {} } as Layer
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.7, cor: '#000000' }], [foto, aMao, texto('servico', 1700)])
    expect(r.aplicados).toEqual([])
    expect(r.recusados).toEqual([expect.objectContaining({ codigo: 'COR_DE_GRADIENTE_EXISTENTE', campos: ['cor'] })])
    expect(r.recusados[0].motivo).toMatch(/gradiente-da-equipe/)
    expect(r.camadas.filter((l) => l.type === 'gradient')).toHaveLength(1)
    // Sem cor (ou com a mesma), o comportamento de antes: cria o gradiente de leitura.
    expect(aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.7 }], [foto, aMao, texto('servico', 1700)]).recusados).toEqual([])
    expect(aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.7, cor: '#F3EADC' }], [foto, aMao, texto('servico', 1700)]).recusados).toEqual([])
  })

  it('numa borda SEM gradiente, a cor cria o gradiente e aparece no detalhe', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'topo', cor: '#1A1A1A', forca: 0.5, altura: 500 }])
    expect(r.recusados).toEqual([])
    expect(r.aplicados[0].detalhe).toMatch(/criado no topo \(cor #1A1A1A, força 0\.5, altura 500px\)/)
  })
})

describe('valores que a peça limita ou que não fazem nada', () => {
  it('altura maior que a peça: aplicada limitada, e o detalhe diz a pedida e a aplicada', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.6, altura: 4000 }])
    expect(r.aplicados[0].detalhe).toMatch(/altura 1920px \(pedida 4000px, limitada à altura da peça\)/)
    expect(rodape(r.camadas).size.height).toBe(1920)
  })

  it('força fora de 0–1 é recusada (VALOR_FORA_DA_FAIXA)', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 2 }])
    expect(r.recusados).toEqual([expect.objectContaining({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['forca'] })])
  })

  it('deslocamento que arredonda a 0px é recusado (SEM_EFEITO), não "aplicado" sem efeito', () => {
    const r = aplicar([{ tipo: 'mover', camadas: ['servico'], dx: 0.4 }])
    expect(r.aplicados).toEqual([])
    expect(r.recusados).toEqual([expect.objectContaining({ codigo: 'SEM_EFEITO', campos: ['dx'] })])
  })

  it('um eixo pedido que arredonda para 0px enquanto o outro se move: o ajuste inteiro é recusado (o eixo não some calado)', () => {
    const r = aplicar([{ tipo: 'mover', camadas: ['servico'], dx: 0.4, dy: 10 }])
    expect(r.aplicados).toEqual([])
    expect(r.recusados).toEqual([expect.objectContaining({ codigo: 'SEM_EFEITO', campos: ['dx'] })])
    expect(r.camadas.find((l) => l.id === 'servico')!.position).toEqual({ x: 100, y: 1700 })
  })

  it('arredondamento ao pixel é dito no detalhe: deslocamento, corpo, largura e altura do gradiente; força nas 3 casas gravadas', () => {
    expect(aplicar([{ tipo: 'mover', camadas: ['servico'], dx: 10.4, dy: -3 }]).aplicados[0].detalhe).toMatch(/deslocadas 10px na horizontal e -3px na vertical \(pedido dx 10\.4, dy -3, arredondado ao pixel\)/)
    expect(aplicar([{ tipo: 'fonte', camadas: ['servico'], fontSize: 40.4 }]).aplicados[0].detalhe).toMatch(/40→40px \(pedido 40\.4px, arredondado\)/)
    expect(aplicar([{ tipo: 'caixa', camadas: ['servico'], largura: 700.4 }]).aplicados[0].detalhe).toMatch(/largura 800→700px \(pedida 700\.4px, arredondada\)/)
    expect(aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.12345, altura: 730.4 }]).aplicados[0].detalhe).toMatch(/força 0\.45→0\.123 \(pedida 0\.12345, arredondada\), altura 730px \(pedida 730\.4px, arredondada\)/)
  })

  it('o valor RECEBIDO aparece como veio (sem arredondar o pedido) quando a peça limita', () => {
    expect(aplicar([{ tipo: 'gradiente', borda: 'rodape', forca: 0.6, altura: 2000.4 }]).aplicados[0].detalhe).toMatch(/altura 1920px \(pedida 2000\.4px, limitada à altura da peça\)/)
  })

  it('cada registro, aplicado ou recusado, carrega o `achado` do próprio ajuste', () => {
    const r = aplicar([
      { tipo: 'mover', camadas: ['servico'], dy: 10, achado: 'a:servico' },
      { tipo: 'mover', camadas: ['nada'], dy: 10, achado: 'b:nada' },
    ])
    expect(r.aplicados).toEqual([expect.objectContaining({ indice: 0, achado: 'a:servico' })])
    expect(r.recusados).toEqual([expect.objectContaining({ indice: 1, codigo: 'CAMADA_INEXISTENTE', achado: 'b:nada' })])
    // Até o rótulo vazio, que o contrato aceita, chega ao registro.
    expect(aplicar([{ tipo: 'mover', camadas: ['servico'], dy: 10, achado: '' }]).aplicados[0]).toHaveProperty('achado', '')
  })

  it('"alturaAutomatica": false não desliga nada: recusado (SEM_EFEITO)', () => {
    const r = aplicar([{ tipo: 'caixa', camadas: ['servico'], largura: 700, alturaAutomatica: false }])
    expect(r.recusados).toEqual([expect.objectContaining({ codigo: 'SEM_EFEITO', campos: ['alturaAutomatica'] })])
  })

  it('sem cor e sem gradiente de leitura na peça, o detalhe diz que a cor é a padrão', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'topo', forca: 0.5 }], [foto, texto('servico', 1700)])
    expect(r.aplicados[0].detalhe).toMatch(/cor #000000, a padrão: a peça não tem gradiente de leitura/)
  })

  it('gradiente apontado pelo id e OCULTO: aplica, e o detalhe diz que não aparece na peça', () => {
    const oculto = { ...veuCreme(), visible: false } as Layer
    const r = aplicar([{ tipo: 'gradiente', borda: 'rodape', camadas: ['gradiente-leitura-rodape'], forca: 0.6 }], [foto, oculto, texto('servico', 1700)])
    expect(r.aplicados[0].detalhe).toMatch(/camada oculta: a mudança não aparece na peça/)
  })

  it('só a entrelinha: o corpo fica como está (nem arredondado, nem limitado) e o detalhe diz', () => {
    const t = { ...texto('servico', 1700), style: { fontSize: 31.5, lineHeight: 1.2, textAlign: 'left' } } as Layer
    const r = aplicar([{ tipo: 'fonte', camadas: ['servico'], entrelinha: 1.4 }], [foto, t])
    expect(r.camadas.find((l) => l.id === 'servico')!.style?.fontSize).toBe(31.5)
    expect(r.aplicados[0].detalhe).toMatch(/corpo 31\.5px mantido, entrelinha 1\.4/)
  })

  it('escala que passa do teto de 600px: o detalhe diz o pedido e que foi limitado', () => {
    const t = { ...texto('servico', 1700), style: { fontSize: 400, lineHeight: 1.2, textAlign: 'left' } } as Layer
    const r = aplicar([{ tipo: 'fonte', camadas: ['servico'], escala: 2 }], [foto, t])
    expect(r.aplicados[0].detalhe).toMatch(/400→600px \(escala 2, pedido 800px, limitado\)/)
  })

  it('a escala pedida aparece no detalhe da fonte', () => {
    const r = aplicar([{ tipo: 'fonte', camadas: ['servico'], escala: 1.25 }])
    expect(r.aplicados[0].detalhe).toMatch(/40→50px \(escala 1\.25\)/)
  })

  it('apontado pelo id, a borda informada que diverge da camada é dita no detalhe (vale a camada)', () => {
    const r = aplicar([{ tipo: 'gradiente', borda: 'topo', camadas: ['gradiente-leitura-rodape'], forca: 0.6 }])
    expect(r.recusados).toEqual([])
    expect(r.aplicados[0].detalhe).toMatch(/borda informada topo ≠ rodapé da camada \(vale a camada apontada\)/)
  })
})
