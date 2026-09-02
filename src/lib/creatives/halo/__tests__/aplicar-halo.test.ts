/**
 * A parte PURA (agrupamento, ordem, remoção do véu) e uma passada inteira
 * com foto sintética: foto clara ganha halo, foto escura não ganha nenhum —
 * e nos dois casos o véu vai embora.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import {
  aplicarHalo,
  coresDoGrupo,
  ehCamadaDeVeu,
  gruposDeTexto,
  inserirHalos,
  montarCamadaDeHalo,
} from '../aplicar-halo'

const CANVAS = { width: 1080, height: 1920 }

function texto(id: string, y: number, h: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    position: { x: 84, y },
    size: { width: 912, height: h },
    content: `${id}\nsegunda linha`,
    style: { color: '#FFFFFF', fontSize: 40 },
    ...extra,
  }
}

function camadasDeModelo(): Layer[] {
  return [
    { id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: CANVAS, fileUrl: 'https://x/foto.jpg', style: { objectFit: 'cover' } },
    { id: 'veu-topo', name: 'Veu topo', type: 'gradient', visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: CANVAS, style: { gradientStops: [{ id: '1', color: '#1A0E08', opacity: 0.9, position: 0 }] } },
    { id: 'veu-rodape', name: 'Veu rodape', type: 'gradient', visible: true, locked: false, order: 2, position: { x: 0, y: 0 }, size: CANVAS },
    { id: 'marca-degrade', name: 'Degradê da marca', type: 'gradient', visible: true, locked: false, order: 3, position: { x: 0, y: 0 }, size: { width: 1080, height: 200 } },
    texto('titulo', 170, 160, { order: 4 }),
    texto('descricao', 350, 100, { order: 5, style: { color: '#F5F0E8' } }),
    texto('servico', 1620, 40, { order: 6, style: { color: '#F4301A' } }),
    { id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: 7, position: { x: 828, y: 1700 }, size: { width: 168, height: 76 } },
  ]
}

describe('ehCamadaDeVeu', () => {
  it('só o véu: id "veu*" ou nome com "Veu"/"Véu", e só gradiente', () => {
    const [, veuTopo, veuRodape, marca] = camadasDeModelo()
    expect(ehCamadaDeVeu(veuTopo)).toBe(true)
    expect(ehCamadaDeVeu(veuRodape)).toBe(true)
    expect(ehCamadaDeVeu(marca)).toBe(false)
    expect(ehCamadaDeVeu({ ...veuTopo, type: 'shape' })).toBe(false)
    expect(ehCamadaDeVeu({ ...marca, name: 'Véu de leitura', id: 'x' })).toBe(true)
  })
})

describe('gruposDeTexto', () => {
  it('manchete + apoio ficam juntos; o serviço lá embaixo é outro bloco', () => {
    const grupos = gruposDeTexto(camadasDeModelo())
    expect(grupos).toHaveLength(2)
    expect(grupos[0].camadas.map((c) => c.id)).toEqual(['titulo', 'descricao'])
    expect(grupos[0].rect).toEqual({ x: 84, y: 170, width: 912, height: 280 })
    expect(grupos[1].camadas.map((c) => c.id)).toEqual(['servico'])
  })

  it('camada oculta não vota', () => {
    const camadas = camadasDeModelo().map((c) => (c.id === 'descricao' ? { ...c, visible: false } : c))
    expect(gruposDeTexto(camadas)[0].camadas.map((c) => c.id)).toEqual(['titulo'])
  })

  it('cores: só hex, sem repetição', () => {
    const cores = coresDoGrupo([
      texto('a', 0, 10),
      texto('b', 0, 10, { style: { color: '#ffffff' } }),
      texto('c', 0, 10, { style: { color: 'rgb(1,2,3)' } }),
    ])
    expect(cores).toEqual(['#FFFFFF', '#ffffff'])
  })
})

describe('inserirHalos', () => {
  it('tira o véu, mantém o outro gradiente, põe o halo acima da foto e abaixo do texto, renumera', () => {
    const halo = montarCamadaDeHalo(
      { rect: { x: 0, y: 100, width: 1080, height: 500 }, raio: 110, tinta: 0.6, alvo: 149, luzMedida: 200, noTeto: false },
      1,
      '#1A0E08',
    )
    const saida = inserirHalos(camadasDeModelo(), [halo], CANVAS)
    const ids = saida.map((l) => l.id)
    expect(ids).toEqual(['bg-foto', 'halo-1', 'marca-degrade', 'titulo', 'descricao', 'servico', 'logo'])
    expect(saida.map((l) => l.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('é idempotente: halo antigo sai antes de o novo entrar', () => {
    const halo = montarCamadaDeHalo(
      { rect: { x: 0, y: 100, width: 1080, height: 500 }, raio: 110, tinta: 0.6, alvo: 149, luzMedida: 200, noTeto: false },
      1,
      '#1A0E08',
    )
    const primeira = inserirHalos(camadasDeModelo(), [halo], CANVAS)
    const segunda = inserirHalos(primeira, [halo], CANVAS)
    expect(segunda.filter((l) => l.id.startsWith('halo-'))).toHaveLength(1)
  })

  it('sem foto de fundo o halo vai para o chão, ainda abaixo do texto', () => {
    const halo = montarCamadaDeHalo(
      { rect: { x: 0, y: 0, width: 100, height: 100 }, raio: 40, tinta: 0.5, alvo: 149, luzMedida: 200, noTeto: false },
      1,
      '#111111',
    )
    const saida = inserirHalos([texto('t', 0, 50)], [halo], CANVAS)
    expect(saida.map((l) => l.id)).toEqual(['halo-1', 't'])
  })
})

describe('montarCamadaDeHalo', () => {
  it('é um shape retângulo com blur na PRÓPRIA forma e opacidade em fillOpacity', () => {
    const camada = montarCamadaDeHalo(
      { rect: { x: -70, y: 16, width: 1220, height: 588 }, raio: 110, tinta: 0.574, alvo: 149, luzMedida: 180, noTeto: false },
      2,
      '#2C3445',
    )
    expect(camada.id).toBe('halo-2')
    expect(camada.type).toBe('shape')
    expect(camada.style?.shapeType).toBe('rectangle')
    expect(camada.style?.fill).toBe('#2C3445')
    expect(camada.style?.fillOpacity).toBe(0.574)
    expect(camada.effects?.blur).toEqual({ enabled: true, blurRadius: 110 })
    // raio + 60, limitado à metade do lado menor
    expect(camada.style?.border?.radius).toBe(170)
    expect(camada.position).toEqual({ x: -70, y: 16 })
    expect(camada.size).toEqual({ width: 1220, height: 588 })
  })
})

async function fotoLisa(luz: number): Promise<Buffer> {
  const w = 270
  const h = 480
  const raw = Buffer.alloc(w * h * 3, luz)
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer()
}

describe('aplicarHalo (com foto sintética)', () => {
  it('foto clara: cada bloco ganha um halo com tinta > 0 e o véu sai', async () => {
    const r = await aplicarHalo({
      layers: camadasDeModelo(),
      canvas: CANVAS,
      foto: await fotoLisa(230),
      corDaMancha: '#1A0E08',
    })
    expect(r.halos).toHaveLength(2)
    expect(r.halos.every((h) => h.tinta > 0 && h.camadaId)).toBe(true)
    const ids = r.layers.map((l) => l.id)
    expect(ids.filter((id) => id.startsWith('veu'))).toHaveLength(0)
    expect(ids.indexOf('halo-1')).toBeGreaterThan(ids.indexOf('bg-foto'))
    expect(ids.indexOf('halo-2')).toBeLessThan(ids.indexOf('titulo'))
    expect(ids).toContain('marca-degrade')
    // O vermelho do Espeto exige fundo ≤ 51 — pede mais tinta que o branco
    const servico = r.halos.find((h) => h.camadas.includes('servico'))!
    const titulo = r.halos.find((h) => h.camadas.includes('titulo'))!
    expect(servico.tinta).toBeGreaterThan(titulo.tinta)
    expect(r.avisos).toHaveLength(0)
  })

  it('mancha clara demais não alcança o alvo: tinta no teto vira aviso legível', async () => {
    // Cinza médio (luz 128) sobre foto de 230 não chega ao fundo ≤ 51 do
    // vermelho — é o "véu de volta com outro nome" que o aviso denuncia.
    const r = await aplicarHalo({
      layers: camadasDeModelo(),
      canvas: CANVAS,
      foto: await fotoLisa(230),
      corDaMancha: '#808080',
    })
    const servico = r.halos.find((h) => h.camadas.includes('servico'))!
    expect(servico.noTeto).toBe(true)
    expect(servico.tinta).toBe(0.95)
    expect(r.avisos.some((a) => a.includes('"servico"') && a.includes('não carrega'))).toBe(true)
  })

  it('foto escura: tinta zero, nenhuma camada de halo — e o véu sai do mesmo jeito', async () => {
    const r = await aplicarHalo({
      layers: camadasDeModelo(),
      canvas: CANVAS,
      foto: await fotoLisa(20),
      corDaMancha: '#1A0E08',
    })
    expect(r.halos.every((h) => h.tinta === 0 && h.camadaId === null)).toBe(true)
    expect(r.layers.some((l) => l.id.startsWith('halo-'))).toBe(false)
    expect(r.layers.some((l) => l.id.startsWith('veu'))).toBe(false)
    expect(r.avisos).toHaveLength(0)
  })
})
