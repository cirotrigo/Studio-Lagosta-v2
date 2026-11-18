import { describe, expect, it } from 'vitest'
import {
  FONTE_DA_MELHORIA_DE_FOTO,
  fotoAindaEAMesma,
  lerRegistroDaMelhoriaDeFoto,
  opcaoParaAplicar,
  retornoDasOpcoes,
  type RegistroDaMelhoriaDeFoto,
} from '../melhoria-de-foto-registro'

const registro = (extra: Partial<RegistroDaMelhoriaDeFoto> = {}): RegistroDaMelhoriaDeFoto => ({
  trilha: 'foto-melhorada',
  pageId: 'p1',
  camadaId: 'bg-img',
  fotoDeOrigemUrl: 'https://x/foto.jpg',
  recorteDeOrigem: null,
  quadro: { width: 1080, height: 1920 },
  receitas: [{ id: 'humanizar' }],
  pedido: '',
  promptDe: 'diretor',
  leitura: 'Vou pôr uma mão puxando a fatia.',
  prompt: 'Add a hand…',
  riscos: ['mão perto do copo'],
  rostoEmFoco: false,
  opcoes: [
    { opcao: 1, fotoUrl: 'https://x/o1.jpg', previaUrl: 'https://x/p1.png', avisos: [{ tipo: 'rosto', texto: 'Esta foto tem rosto: confira se a pessoa continua a mesma.', destaque: true }, { tipo: 'cena', texto: 'O prato pode ter mudado.' }], custoUsd: 0.05, segundos: 20 },
    { opcao: 2, fotoUrl: null, previaUrl: null, avisos: [], descartada: 'saiu igual à foto de origem', custoUsd: 0.05, segundos: 18 },
  ],
  postId: null,
  aplicada: null,
  ...extra,
})

describe('lerRegistroDaMelhoriaDeFoto', () => {
  it('só lê a proposta de foto', () => {
    const r = registro()
    expect(lerRegistroDaMelhoriaDeFoto({ source: FONTE_DA_MELHORIA_DE_FOTO, melhoriaDeFoto: r })).toEqual(r)
    expect(lerRegistroDaMelhoriaDeFoto({ source: 'ai_improvement', melhoriaDeFoto: r })).toBeNull()
    expect(lerRegistroDaMelhoriaDeFoto({ source: FONTE_DA_MELHORIA_DE_FOTO })).toBeNull()
    expect(lerRegistroDaMelhoriaDeFoto(null)).toBeNull()
  })
})

describe('fotoAindaEAMesma', () => {
  const atual = { camadaId: 'bg-img', url: 'https://x/foto.jpg', caixa: { width: 1080, height: 1920 }, estilo: {} }
  it('aceita a página cuja foto e recorte não mudaram', () => {
    expect(fotoAindaEAMesma(registro(), atual)).toBe(true)
    const comRecorte = { x: 0.1, y: 0, width: 0.5, height: 1 }
    expect(fotoAindaEAMesma(registro({ recorteDeOrigem: comRecorte }), { ...atual, estilo: { crop: { ...comRecorte } } })).toBe(true)
  })
  it('o recorte volta do banco com as chaves em outra ordem e continua sendo o mesmo', () => {
    // O `jsonb` do Postgres reordena as chaves: comparar como texto recusava toda página com recorte manual.
    const doBanco = JSON.parse('{"x":0.13316346318063138,"y":0.2310536345102041,"width":0.7692882713881907,"height":0.7689463654897959}')
    const reordenado = { height: doBanco.height, width: doBanco.width, x: doBanco.x, y: doBanco.y }
    expect(fotoAindaEAMesma(registro({ recorteDeOrigem: reordenado }), { ...atual, estilo: { crop: doBanco } })).toBe(true)
    expect(fotoAindaEAMesma(registro({ recorteDeOrigem: reordenado }), { ...atual, estilo: {} })).toBe(false)
  })

  it('recusa quando a foto, o recorte ou a caixa mudaram desde a prévia', () => {
    expect(fotoAindaEAMesma(registro(), null)).toBe(false)
    expect(fotoAindaEAMesma(registro(), { ...atual, url: 'https://x/outra.jpg' })).toBe(false)
    expect(fotoAindaEAMesma(registro(), { ...atual, camadaId: 'outra' })).toBe(false)
    expect(fotoAindaEAMesma(registro(), { ...atual, estilo: { crop: { x: 0, y: 0, width: 0.5, height: 1 } } })).toBe(false)
    expect(fotoAindaEAMesma(registro(), { ...atual, caixa: { width: 1080, height: 1350 } })).toBe(false)
  })
})

describe('opcaoParaAplicar', () => {
  it('entrega a opção válida', () => {
    const r = opcaoParaAplicar(registro(), 1)
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.opcao.fotoUrl).toBe('https://x/o1.jpg')
  })
  it('recusa opção que não existe e opção descartada', () => {
    expect(opcaoParaAplicar(registro(), 3)).toMatchObject({ ok: false, codigo: 'OPCAO_NAO_EXISTE' })
    expect(opcaoParaAplicar(registro(), 2)).toMatchObject({ ok: false, codigo: 'OPCAO_DESCARTADA' })
  })
  it('aplicar de novo a mesma opção devolve a aplicação que já existe', () => {
    const aplicada = { opcao: 1, generationId: 'g2', url: 'https://x/arte.png', em: '2026-11-17T00:00:00.000Z' }
    expect(opcaoParaAplicar(registro({ aplicada }), 1)).toEqual({ ok: 'ja-aplicada', aplicada })
  })
  it('recusa aplicar a outra opção depois de uma já aplicada', () => {
    const aplicada = { opcao: 2, generationId: 'g2', url: 'https://x/arte.png', em: '2026-11-17T00:00:00.000Z' }
    expect(opcaoParaAplicar(registro({ aplicada }), 1)).toMatchObject({ ok: false, codigo: 'OUTRA_OPCAO_JA_APLICADA' })
  })
})

describe('retornoDasOpcoes', () => {
  it('separa o aviso em destaque e diz qual foi aplicada', () => {
    const r = retornoDasOpcoes(registro({ aplicada: { opcao: 1, generationId: 'g2', url: 'https://x/arte.png', em: 'agora' } }))
    expect(r.leitura).toBe('Vou pôr uma mão puxando a fatia.')
    expect(r.prompt).toBe('Add a hand…')
    expect(r.riscos).toEqual(['mão perto do copo'])
    expect(r.opcoes[0]).toMatchObject({ opcao: 1, previaUrl: 'https://x/p1.png', avisosEmDestaque: ['Esta foto tem rosto: confira se a pessoa continua a mesma.'], avisos: ['O prato pode ter mudado.'] })
    expect(r.opcoes[1]).toMatchObject({ opcao: 2, descartada: 'saiu igual à foto de origem' })
    expect(r.aplicada).toEqual({ opcao: 1, generationId: 'g2', url: 'https://x/arte.png' })
  })
})
