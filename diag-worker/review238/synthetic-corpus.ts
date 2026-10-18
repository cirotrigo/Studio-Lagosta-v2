// Diagnostic copy of unchanged synthetic helpers only; historical corpus excluded.
/**
 * CP5b — as FIXTURES de medida do gate e o CORPUS da impressão digital das regras (§ 5 do contrato,
 * `docs/PLANO-2026-10-16-CP5B-CONTRATO.md`). Antes moravam em `gate.test.ts`; saíram para cá porque a impressão
 * digital precisa das MESMAS peças que os G-casos exercitam — e o corpus é ENUMERADO de propósito (decisão 9.6,
 * cobertura AMOSTRAL): regra que nenhuma peça daqui toca muda em silêncio, por isso todo PR em `regras.ts`/`gate.ts`
 * responde "o corpus cobre?". As ENTRADAS entram na impressão: editar uma peça daqui exige bump.
 *
 * Só dados e construtores; nada de `expect`. Sem banco, sem render.
 */
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { MedidaDaLogo } from '@/lib/compositor/legibilidade-da-logo'
import type { LeituraDaLogoNaRevisao } from '@/lib/creatives/revisao/regras'
import { copyVersionDe } from '@/lib/creatives/revisao/versao'
import { POLITICA_DO_ASSUNTO_RECOMENDADA, type EntradaDoGate, type MedidaDaPeca, type PoliticaDoAssunto } from '@/lib/creatives/revisao/gate'
import type { PecaDoCorpus } from '@/lib/creatives/revisao/impressao-digital'

export const W = 1080
export const H = 1920
export const CANVAS = { width: W, height: H }

// ─── Fixtures ─────────────────────────────────────────────────────────────

export function texto(id: string, box: { x: number; y: number; width: number; height: number }, fontSize: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 3,
    content: `Texto ${id}`,
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#111111' },
    metadata: { compositor: { papel: id === 'headline' ? 'headline' : 'apoio' } },
    ...extra,
  } as Layer
}

export function metrica(l: Layer, extra: Partial<TextLayerMetrics> = {}): TextLayerMetrics {
  const box = { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }
  const fontSize = (l.style?.fontSize as number) ?? 16
  return {
    layerId: l.id,
    name: l.name,
    box,
    realHeight: box.height,
    maxLineWidth: Math.min(box.width - 12, 400),
    lineCount: 1,
    glyphTop: box.y + 6,
    glyphBottom: box.y + box.height - 6,
    fontSize,
    lineBox: fontSize * 1.2,
    autoExpand: true,
    ...extra,
  }
}

export const fundo = (extra: Partial<Layer> = {}): Layer =>
  ({ id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: W, height: H }, fileUrl: 'https://blob.test/foto.jpg', style: { objectFit: 'cover' }, ...extra }) as Layer

export const logo = (extra: Partial<Layer> = {}): Layer =>
  ({ id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 799, y: 1500 }, size: { width: 189, height: 95 }, fileUrl: 'https://blob.test/logo.png', style: { objectFit: 'contain' }, ...extra }) as Layer

export const forma = (id: string, box: { x: number; y: number; width: number; height: number }, extra: Partial<Layer> = {}): Layer =>
  ({ id, name: id, type: 'shape', visible: true, locked: false, order: 5, position: { x: box.x, y: box.y }, size: { width: box.width, height: box.height }, style: { shapeType: 'rectangle', fill: '#ff0000' }, ...extra }) as Layer

export const medidaDaLogo = (p10 = 120): MedidaDaLogo => ({ pixelsAvaliados: 5159, contrasteP10: p10, contrasteMedio: Math.max(p10, 60), proporcaoAcima45: p10 >= 45 ? 1 : 0.4, luzDaLogo: 200, luzDoFundo: 150, legivel: p10 >= 45 })
export const leitura = (camada: string, m: MedidaDaLogo | null, estado: LeituraDaLogoNaRevisao['estado'] = 'medida', motivo?: string): LeituraDaLogoNaRevisao => ({ camada, variante: { url: 'https://blob.test/logo.png', origem: 'pagina' }, posicao: { x: 799, y: 1500, width: 189, height: 95 }, medida: m, estado, ...(motivo ? { motivo } : {}) })

export function contraste(camadas: string[], extra: Partial<ContrasteMedido> = {}): ContrasteMedido {
  return { grupo: camadas.join('+'), camadas, sentido: 'escuro', alvo: 130, p98SemHalo: 60, p98ComHalo: 200, tinta: 0.9, tintaCorrigida: null, gradiente: null, ok: true, textos: camadas.map((c) => ({ camada: c, sentido: 'escuro', alvo: 130, p98SemHalo: 60, p98ComHalo: 200, ok: true })), ...extra } as ContrasteMedido
}

/** A peça LIMPA de G1: três textos, foto com assunto de catálogo longe deles, logo solta medida, régua presente. */
export function pecaLimpa(): { camadas: Layer[]; metricas: TextLayerMetrics[] } {
  const headline = texto('headline', { x: 100, y: 300, width: 880, height: 120 }, 84)
  const apoio = texto('apoio', { x: 100, y: 440, width: 600, height: 60 }, 40)
  const servico = texto('servico', { x: 100, y: 1500, width: 600, height: 60 }, 32, { order: 4 })
  const camadas = [fundo(), headline, apoio, servico, logo()]
  return { camadas, metricas: [metrica(headline), metrica(apoio), metrica(servico)] }
}

export function medida(parcial: Partial<MedidaDaPeca> = {}): MedidaDaPeca {
  const base = pecaLimpa()
  const camadas = parcial.camadas ?? base.camadas
  const metricas = parcial.metricas ?? base.metricas
  return {
    canvas: CANVAS,
    formato: 'story',
    camadas,
    metricas,
    geometria: [],
    contraste: metricas.map((m) => contraste([m.layerId])),
    pioras: [],
    faixaDoGradiente: [0.45, 0.9],
    referencias: { headline: { fontSize1080: 84, entrelinha: null, origem: 'assinatura' } },
    assunto: { rect: { x: 0, y: 900, width: 1080, height: 500 }, origem: 'catalogo' },
    leituraDaLogo: [leitura('logo', medidaDaLogo())],
    fontesAusentes: [],
    medidasAproximadas: [],
    textosSemMetrica: [],
    ...parcial,
  } as MedidaDaPeca
}

export const IDENTIDADE = { pageVersion: 'v1:abcdef0123456789abcd', copyVersion: copyVersionDe({ versao: 'copy-autoral-v1', blocos: [] }) }
export const COPY_OK = { estado: 'sem-mudanca' as const, lacunas: [] as string[] }
export const POLITICA = POLITICA_DO_ASSUNTO_RECOMENDADA

export function entrada(parcial: Omit<Partial<EntradaDoGate>, 'medida'> & { medida?: Partial<MedidaDaPeca> } = {}): EntradaDoGate {
  const { medida: m, ...resto } = parcial
  return { medida: medida(m), identidade: IDENTIDADE, copy: COPY_OK, politicaDoAssunto: POLITICA, ...resto }
}

