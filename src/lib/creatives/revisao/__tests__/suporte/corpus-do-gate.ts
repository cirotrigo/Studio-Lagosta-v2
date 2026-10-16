/**
 * CP5b — as FIXTURES de medida do gate e o CORPUS da impressão digital das regras (§ 5 do contrato,
 * `docs/PLANO-2026-10-16-CP5B-CONTRATO.md`). Antes moravam em `gate.test.ts`; saíram para cá porque a impressão
 * digital precisa das MESMAS peças que os G-casos exercitam — e o corpus é ENUMERADO de propósito (decisão 9.6,
 * cobertura AMOSTRAL): regra que nenhuma peça daqui toca muda em silêncio, por isso todo PR em `regras.ts`/`gate.ts`
 * responde "o corpus cobre?". As ENTRADAS entram na impressão: editar uma peça daqui exige bump.
 *
 * Só dados e construtores; nada de `expect`. Sem banco, sem render.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { MedidaDaLogo } from '@/lib/compositor/legibilidade-da-logo'
import type { LeituraDaLogoNaRevisao } from '../../regras'
import { copyVersionDe } from '../../versao'
import { POLITICA_DO_ASSUNTO_RECOMENDADA, type EntradaDoGate, type MedidaDaPeca, type PoliticaDoAssunto } from '../../gate'
import type { PecaDoCorpus } from '../../impressao-digital'

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

// ─── A fixture do piloto (G24) ────────────────────────────────────────────

/**
 * A peça REAL do piloto de 13/10 (`src/lib/direcao-de-arte/__tests__/fixtures/piloto-2026-10-13/peca.json`), como medida
 * do gate: v1 (o compositor; métricas de `composicaoRegistrada.medidasFinais`) e v2 (depois de `ajustar-arte`;
 * métricas sintéticas pela caixa, porque a composição registrada é a da v1). Dados FIXOS: é o que a impressão digital
 * precisa.
 */
export function medidaDoPiloto(versao: 'v1' | 'v2'): MedidaDaPeca {
  const peca = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/direcao-de-arte/__tests__/fixtures/piloto-2026-10-13/peca.json'), 'utf8'))
  const camadas = peca[versao].layers as Layer[]
  const porId = new Map(camadas.map((l) => [l.id, l]))
  const finais = peca.composicaoRegistrada.medidasFinais as Array<{ id: string; fontSize: number; linhas: number; height: number; width: number; lineHeight: number }>
  const metricas: TextLayerMetrics[] =
    versao === 'v1'
      ? finais.map((m) => {
          const l = porId.get(m.id)!
          return { layerId: m.id, name: m.id, box: { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }, realHeight: m.height, maxLineWidth: m.width - 12, lineCount: m.linhas, glyphTop: l.position.y + 6, glyphBottom: l.position.y + m.height - 6, fontSize: m.fontSize, lineBox: m.fontSize * m.lineHeight, autoExpand: true }
        })
      : camadas.filter((l) => l.type === 'text' && l.visible !== false).map((l) => metrica(l))
  return {
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
}

// ─── O corpus da impressão digital (decisão 9.6) ──────────────────────────

/** As 4 políticas do assunto: a impressão do gate roda cada peça com todas. */
export const POLITICAS_DO_CORPUS: readonly PoliticaDoAssunto[] = [
  { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' },
  { estimado: 'humano', semAssuntoLocalizavel: 'humano' },
  { estimado: 'comprova', semAssuntoLocalizavel: 'nao-se-aplica' },
  { estimado: 'comprova', semAssuntoLocalizavel: 'humano' },
]

function peca(nome: string, parcial: Parameters<typeof entrada>[0] = {}): PecaDoCorpus {
  const e = entrada(parcial)
  return { nome, medida: e.medida, identidade: e.identidade, copy: e.copy }
}

const SEM_FUNDO = { assunto: null, assuntoNaoSeAplica: true as const, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' }
const GRADIENTE_ACIMA: Layer = { id: 'grad', name: 'grad', type: 'gradient', visible: true, locked: false, order: 9, position: { x: 0, y: 0 }, size: { width: W, height: 665 }, style: { gradientType: 'linear', gradientStops: [{ id: 'a', color: '#000', position: 0, opacity: 0.9 }] }, metadata: { tratamentoDeTexto: 'gradiente-de-leitura', borda: 'topo' } } as Layer
const FEED = { width: 1080, height: 1350 }
const paraFeed = (camadas: Layer[]) => camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: FEED } : l.id === 'servico' ? { ...l, position: { x: 100, y: 1150 } } : l))
const metricasParaFeed = (metricas: TextLayerMetrics[]) => metricas.map((m) => (m.layerId === 'servico' ? { ...m, box: { ...m.box, y: 1150 }, glyphTop: 1150, glyphBottom: 1210 } : m))
const apoioEm = (y: number, extra: Partial<Layer> = {}) => texto('apoio', { x: 100, y, width: 600, height: 60 }, 40, extra)
const apoioMovido = (y: number) => ({ camadas: pecaLimpa().camadas.map((l) => (l.id === 'apoio' ? { ...l, position: { x: 100, y } } : l)), metricas: pecaLimpa().metricas.map((m) => (m.layerId === 'apoio' ? { ...m, box: { ...m.box, y }, glyphTop: y + 6, glyphBottom: y + 54 } : m)) })

/**
 * Enumerado, um por grupo de `gate.test.ts`: G1, achados e cobertura G3–G10, logo G11/G12, política do assunto
 * G13–G18, piso G19/G26/G29, copy G20/G27, oclusão G21/G21b/G21d/G21f, identidade G22, movimento e vídeo G30/G31 — e
 * o piloto (v1 e v2). Acrescentar ou editar uma peça MUDA as duas impressões e exige os dois bumps — deliberado: o
 * corpus faz parte da definição da versão.
 */
export const CORPUS_DO_GATE: readonly PecaDoCorpus[] = [
  { nome: 'piloto-2026-10-13 v1', medida: medidaDoPiloto('v1'), identidade: IDENTIDADE, copy: COPY_OK },
  { nome: 'piloto-2026-10-13 v2', medida: medidaDoPiloto('v2'), identidade: IDENTIDADE, copy: COPY_OK },
  peca('G1 peça limpa'),
  peca('G3 colisão medida (apoio sobre a headline)', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'apoio' ? apoioEm(340) : l)), metricas: [metrica(pecaLimpa().camadas[1]), metrica(apoioEm(340)), pecaLimpa().metricas[2]], geometria: [{ tipo: 'colisao', camadas: ['headline', 'apoio'], layerIds: ['headline', 'apoio'], px: 60, detalhe: 'sobrepõem' } as never] } }),
  peca('G4 título grande (não crítica)', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'headline' ? texto('headline', { x: 100, y: 300, width: 880, height: 180 }, 140) : l.id === 'apoio' ? apoioEm(520) : l)), metricas: [metrica(texto('headline', { x: 100, y: 300, width: 880, height: 180 }, 140), { lineCount: 1 }), metrica(apoioEm(520)), pecaLimpa().metricas[2]] } }),
  peca('G6 medição dos textos falhou', { medida: { metricas: [], motivoSemMedida: 'a medição dos textos falhou: fonte' } }),
  peca('G7 rich text (medida aproximada)', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'apoio' ? ({ ...l, type: 'rich-text' } as Layer) : l)), medidasAproximadas: ['apoio'] } }),
  peca('G8 texto sem métrica', { medida: { textosSemMetrica: ['servico'], metricas: pecaLimpa().metricas.filter((m) => m.layerId !== 'servico') } }),
  peca('G9 régua não mediu', { medida: { contraste: null, pioras: null } }),
  peca('G9 régua vazia com textos', { medida: { contraste: [] } }),
  peca('G10 fonte ausente', { medida: { fontesAusentes: [{ familia: 'Branley GC', peso: null, camadas: ['headline'] }] } }),
  peca('G10 conferência das fontes falhou', { medida: { motivoSemFontes: 'a conferência das fontes falhou: canvas' } }),
  peca('G11 sem logo solta', { medida: { camadas: pecaLimpa().camadas.filter((l) => l.id !== 'logo'), leituraDaLogo: [] } }),
  peca('G12 logo indisponível', { medida: { leituraDaLogo: [leitura('logo', null, 'indisponivel', 'HTTP 404')] } }),
  peca('G12 logo solta sem entrada na leitura', { medida: { leituraDaLogo: [] } }),
  peca('G12 logo sem leitura (p10 baixo)', { medida: { leituraDaLogo: [leitura('logo', medidaDaLogo(20))] } }),
  peca('G12 logo com invert (a leitura não representa o render)', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, style: { objectFit: 'contain', invert: true } } : l)) } }),
  peca('G13 serviço sobre o assunto (catálogo)', { medida: { assunto: { rect: { x: 0, y: 1400, width: 1080, height: 400 }, origem: 'catalogo' } } }),
  peca('G14 assunto estimado longe dos textos', { medida: { assunto: { rect: { x: 0, y: 900, width: 1080, height: 500 }, origem: 'estimado' } } }),
  peca('G14 serviço sobre o assunto estimado', { medida: { assunto: { rect: { x: 0, y: 1400, width: 1080, height: 400 }, origem: 'estimado' } } }),
  peca('G15 foto lida sem assunto localizável', { medida: { assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a foto foi lida e não tem assunto localizável' } }),
  peca("G15 C' foto de fundo sem arquivo", { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: undefined } : l)), assunto: null, assuntoNaoSeAplica: true, motivoSemAssunto: 'a peça não tem foto de fundo: não há assunto a proteger' } }),
  peca('G16 falha ao analisar a foto', { medida: { assunto: null, motivoSemAssunto: 'o assunto da foto não foi estimado: HTTP 403' } }),
  peca('G17 sem foto de fundo', { medida: { camadas: pecaLimpa().camadas.filter((l) => l.id !== 'bg-foto'), ...SEM_FUNDO } }),
  peca('G13b foto de fundo com recorte manual', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, style: { objectFit: 'cover', crop: { x: 0.3, y: 0.3, width: 0.5, height: 0.5 } } } : l)) } }),
  peca('G13c segunda foto de tela inteira', { medida: { camadas: [...pecaLimpa().camadas, fundo({ id: 'foto-2', name: 'Outra foto', order: 1, fileUrl: 'https://blob.test/outra.jpg' })] } }),
  peca('G13d canvas fora do canônico', { medida: { canvas: { width: 2160, height: 3840 }, camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? { ...l, size: { width: 2160, height: 3840 } } : l)) } }),
  peca('G19 texto no topo da interface', { medida: apoioMovido(100) }),
  peca('G19 logo com filtro (piso não comprovável)', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? { ...l, style: { ...l.style, filter: 'blur(20px)' } } : l)) } }),
  peca('G29 texto em y=150 (dentro da margem, fora do piso)', { medida: apoioMovido(150) }),
  peca('G29 a mesma peça em feed', { medida: { formato: 'feed', canvas: FEED, camadas: paraFeed(apoioMovido(150).camadas), metricas: metricasParaFeed(apoioMovido(150).metricas), assunto: { rect: { x: 0, y: 700, width: 1080, height: 400 }, origem: 'catalogo' } } }),
  peca('G20 copy com lacunas', { copy: { estado: 'sem-mudanca', lacunas: ['o contrato não descrevia x'] } }),
  peca('G20 copy sem contrato', { copy: { estado: 'sem-contrato', lacunas: [] } }),
  peca('G27 copy não conferida', { copy: undefined }),
  peca('G21 forma acima do apoio', { medida: { camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order: 9 })] } }),
  peca('G21 gradiente de leitura acima', { medida: { camadas: [...pecaLimpa().camadas, GRADIENTE_ACIMA] } }),
  peca('G21 texto sobre texto dentro da tolerância', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'apoio' ? apoioEm(402, { order: 9 }) : l)), metricas: pecaLimpa().metricas.map((m) => (m.layerId === 'apoio' ? metrica(apoioEm(402, { order: 9 })) : m)) } }),
  peca('G21 logo solta sobre o serviço', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'logo' ? logo({ position: { x: 100, y: 1500 } }) : l)) } }),
  peca('G21 logo sobre a sombra do serviço', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'servico' ? ({ ...l, effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 10, shadowOffsetX: 30, shadowOffsetY: 30, shadowOpacity: 1 } } } as Layer) : l.id === 'logo' ? logo({ position: { x: 526, y: 1500 } }) : l)) } }),
  peca('G21b forma girada 90° sobre texto', { medida: { camadas: [...pecaLimpa().camadas.filter((l) => l.id !== 'apoio'), texto('t', { x: 370, y: 600, width: 20, height: 100 }, 30), forma('f', { x: 400, y: 500, width: 600, height: 40 }, { order: 9, rotation: 90 })], metricas: [pecaLimpa().metricas[0], pecaLimpa().metricas[2], metrica(texto('t', { x: 370, y: 600, width: 20, height: 100 }, 30))] } }),
  peca('G21b círculo centrado sobre texto', { medida: { camadas: [...pecaLimpa().camadas.filter((l) => l.id !== 'apoio'), texto('t', { x: 355, y: 480, width: 40, height: 10 }, 8), forma('c', { x: 400, y: 500, width: 100, height: 100 }, { order: 9, style: { shapeType: 'circle', fill: '#f00' } })], metricas: [pecaLimpa().metricas[0], pecaLimpa().metricas[2], metrica(texto('t', { x: 355, y: 480, width: 40, height: 10 }, 8))] } }),
  peca('G21d forma com blur sobre texto', { medida: { camadas: [...pecaLimpa().camadas, forma('q', { x: 500, y: 500, width: 100, height: 100 }, { order: 9, effects: { blur: { enabled: true, blurRadius: 20 } } } as Partial<Layer>)] } }),
  peca('G21f order NaN na ocluidora', { medida: { camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order: NaN })] } }),
  peca('G21f order Infinity na ocluidora', { medida: { camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 440, width: 200, height: 60 }, { order: Infinity })] } }),
  peca('G21f order em string na ocluidora', { medida: { camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 800, width: 200, height: 60 }, { order: 'z' as never })] } }),
  peca('G21f position.x em string', { medida: { camadas: [...pecaLimpa().camadas, forma('f', { x: 100, y: 800, width: 200, height: 60 }, { order: 9, position: { x: 'abc' as never, y: 800 } })] } }),
  peca('G22 identidade ilegível', { identidade: { pageVersion: null, copyVersion: IDENTIDADE.copyVersion } }),
  peca('G30 id residual em textosSemMetrica sem texto visível', { medida: { camadas: [fundo(), logo()], metricas: [], contraste: [], textosSemMetrica: ['fantasma'] } }),
  peca('G31 fundo em movimento', { medida: { camadas: pecaLimpa().camadas.map((l) => (l.id === 'bg-foto' ? ({ ...l, movimento: 'aproximar' } as Layer) : l)) } }),
  peca('G31 vídeo abaixo dos textos', { medida: { camadas: [...pecaLimpa().camadas, { id: 'vid', name: 'Vídeo', type: 'video', visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: W, height: H }, fileUrl: 'https://blob.test/v.mp4' } as Layer] } }),
]
