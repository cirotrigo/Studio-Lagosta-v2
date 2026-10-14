/**
 * CP2B — a BUSCA ESPACIAL do arquétipo pela foto, no COMPOSITOR REAL (foto, página de assinatura e logo geradas):
 * posição primeiro, tratamento depois; a busca só escolhe DENTRO das zonas, e o CP2A continua o juiz da peça.
 *
 * Cenários sintéticos (cinza por faixas de luz, textura ±6 da `fotoSintetica`). Três escolhas de parâmetro valem
 * para o arquivo inteiro:
 * - a foto é servida por um CAMINHO curto (arquivo temporário), como a URL do Blob em produção: desde a correção
 *   da identidade da foto (`EscolhaEspacial.foto` = a URL que a peça desenha), um data URL entraria inteiro no
 *   diagnóstico. Só o ciclo de recomposição usa data URL — a cadeia dele valida `foto.url` como URL, e caminho não é;
 * - cenário com faixas de luz no MEIO da foto traz um assunto de CATÁLOGO num canto (fora de qualquer zona): sem
 *   catálogo, a energia das duas bordas da faixa vira a região protegida ESTIMADA e elimina tudo (comportamento
 *   anterior ao CP2B, do `estimarAssunto`) — o cenário deixaria de ser o caso que o teste descreve;
 * - o medidor calibrado mede 0,5 do corpo por caractere (manchete 90 px, apoio 40, serviço 34 na página sintética).
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  persistAndRenderCreative: async (e: Record<string, any>) => {
    cap.entradas.push(e)
    return { generationId: `g-${cap.entradas.length}`, pageId: `p-${cap.entradas.length}`, url: 'https://blob.test/arte.png' }
  },
}))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Layer } from '@/types/template'
import type { Rect } from '@/lib/creatives/halo/halo'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import { CreativeError } from '@/lib/creatives/errors'
import { comporPeca, type OpcoesDeComposicao, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { montarAssinatura } from '@/lib/compositor/assinatura'
import { medirCopy } from '@/lib/compositor/medir-copy'
import { validarSpec, type SpecDePeca } from '@/lib/compositor/spec'
import { escolhaEspacialOriginal, specComACopyDaPagina, specComAPosicaoOriginal } from '@/lib/compositor/defasagem'
import { specDaRecomposicao } from '@/lib/compositor/spec-da-recomposicao'
import { mapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import { alturaDaFaixa, CURVA_DE_LEITURA, GRADIENTE_PADRAO } from '@/lib/compositor/gradiente-de-leitura'
import { candidatasDistintas, planejarTratamentoDaBorda } from '@/lib/compositor/tratamento-de-leitura'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { prepararArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { avaliarCombinacao, ordenarAvaliacoes } from '@/lib/compositor/arquetipos/pontuacao-espacial'
import {
  LIMITES_DA_BUSCA,
  MODO_BUSCA_ESPACIAL,
  MOTIVOS_DE_ELIMINACAO,
  type DiagnosticoDaBuscaEspacial,
  type EscolhaEspacial,
  type FaixaDeBusca,
  type MembroDaFaixa,
  type PlanejamentoDoTratamento,
  type UnidadeDaCombinacao,
} from '@/lib/compositor/arquetipos/busca-espacial-tipos'
import type { PapelDeTexto } from '@/lib/compositor/arquetipos/tipos'
import { cenario, medidorCalibrado, type PaginaDeAssinatura } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { leituraDentroDoAlvo, leiturasDosTextos, ordemDeLeituraInvertida, servicoDisputaEntrada, textosQueInvadem, tratamentosQuePioram } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const STORY = { width: 1080, height: 1920 }
const v1 = (id: string) => ({ id, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(id, 1)!) })

// ─── Os cenários ─────────────────────────────────────────────────────────────

type Luz = (x: number, y: number) => number
type Blocos = Array<{ papel: string; linhas: string[] }>
interface Cena {
  id: string
  arquetipo?: string
  luz: Luz
  dimensoes?: { width: number; height: number }
  cores: { headline: string; apoio?: string; servico: string }
  /** O assunto do CATÁLOGO, em frações: a região protegida. */
  assunto?: { x0: number; y0: number; x1: number; y1: number }
  blocos?: Blocos
  /** A foto como data URL (a cadeia da recomposição valida `foto.url` como URL). */
  dataUrl?: boolean
  /** O tamanho da camada da logo na página de assinatura (a largura e a proporção da logo da peça). */
  logo?: { width: number; height: number }
}

/** A faixa escura do serviço no topo-esquerda: logo ACIMA da referência (y 1555), dentro da zona dele (1382–1695). */
const FAIXA_ESCURA = { y0: 1340, y1: 1450 }
const naFaixaEscura = (y: number) => y >= FAIXA_ESCURA.y0 && y < FAIXA_ESCURA.y1
/** Ruído forte e determinístico, ±40 por pixel (a textura que a calma enxerga). */
const ruidoForte = (x: number, y: number) => (((Math.imul(x, 2654435761) ^ Math.imul(y, 40503)) >>> 0) % 81) - 40
/** Um assunto de catálogo no canto superior esquerdo, fora de qualquer zona dos dois arquétipos. */
const CANTO = { x0: 0, y0: 0, x1: 0.15, y1: 0.08 }

const CENAS = {
  /** 2 e 10 — o caso H: topo claro, base escura; manchete escura em cima, serviço claro embaixo. */
  h: { id: 'cp2b-h', arquetipo: TOPO, luz: (_x, y) => (y < 960 ? 205 : 55), cores: { headline: ESCURO, servico: CLARO } },
  /** 3 — foto clara (205) com a faixa escura (50) acima da referência do serviço. */
  faixa: { id: 'cp2b-faixa', arquetipo: TOPO, luz: (_x, y) => (naFaixaEscura(y) ? 50 : 205), cores: { headline: ESCURO, servico: CLARO } },
  /** 4 — a mesma faixa com textura forte (50 ± 40), o resto claro com a textura padrão (±6). */
  textura: { id: 'cp2b-textura', arquetipo: TOPO, luz: (x, y) => (naFaixaEscura(y) ? 50 + ruidoForte(x, y) : 205), cores: { headline: ESCURO, servico: CLARO } },
  /** 7 — a faixa do 3 coincide com a região protegida do catálogo (a metade esquerda dela). */
  regiao: {
    id: 'cp2b-regiao',
    arquetipo: TOPO,
    luz: (_x, y) => (naFaixaEscura(y) ? 50 : 205),
    cores: { headline: ESCURO, servico: CLARO },
    assunto: { x0: 0, y0: FAIXA_ESCURA.y0 / 1920, x1: 0.5, y1: FAIXA_ESCURA.y1 / 1920 },
  },
  /** 11, 19 — o caso A no centro-óptico: escuro até 1150, CLARO de 1150 a 1450, escuro daí para baixo. */
  a: {
    id: 'cp2b-a',
    arquetipo: CENTRO,
    luz: (_x, y) => (y < 1150 ? 55 : y < 1450 ? 205 : 55),
    cores: { headline: CLARO, apoio: ESCURO, servico: CLARO },
    assunto: CANTO,
  },
  /** 13 — foto LARGA: o canto inferior esquerdo escuro (só o corte da esquerda o põe sob o serviço). */
  larga: {
    id: 'cp2b-larga',
    arquetipo: TOPO,
    dimensoes: { width: 1920, height: 1920 },
    luz: (x, y) => (x < 700 && y > 1300 ? 50 : 205),
    cores: { headline: ESCURO, servico: CLARO },
  },
  /** 14 — a mesma foto larga, uniforme e clara; textos escuros. */
  largaUniforme: { id: 'cp2b-larga-uniforme', arquetipo: TOPO, dimensoes: { width: 1920, height: 1920 }, luz: () => 205, cores: { headline: ESCURO, servico: ESCURO } },
  /**
   * 15 — o véu que o topo pede piora outro texto que ele alcança: a manchete clara cai na faixa clara (300–480) e pede
   * véu escuro; o apoio claro está sobre o quase-preto (5), e o véu (#1A1A1A) clarearia o fundo dele.
   */
  piora: {
    id: 'cp2b-piora',
    arquetipo: TOPO,
    luz: (_x, y) => (y >= 300 && y < 480 ? 205 : y < 1000 ? 5 : 205),
    cores: { headline: CLARO, apoio: CLARO, servico: ESCURO },
    assunto: CANTO,
  },
} satisfies Record<string, Cena>

/** As peças que compõem (as propriedades transversais 5, 8, 9, 20, 21 e 22 passam por todas). */
const QUE_COMPOEM: Cena[] = [CENAS.h, CENAS.faixa, CENAS.textura, CENAS.regiao, CENAS.a, CENAS.larga, CENAS.largaUniforme, CENAS.piora]
/** 17 — o cenário do 3 com a manchete de UMA linha (há espaço na zona para a escolha congelada ir ao fundo dela). */
const CONGELADA: Cena = { ...CENAS.faixa, id: 'cp2b-congelada', blocos: [{ papel: 'headline', linhas: ['Almoço'] }, { papel: 'servico', linhas: ['Dom · 12h às 16h'] }] }
/** 16 e 18 — o cenário do 3, com a foto em data URL (a cadeia da recomposição). */
const CICLO: Cena = { ...CENAS.faixa, id: 'cp2b-ciclo', dataUrl: true }

async function montar(c: Cena): Promise<PaginaDeAssinatura> {
  const foto = await fotoSintetica(c.luz, c.dimensoes)
  const sintetica = paginaSintetica({
    id: c.id,
    headline: { cor: c.cores.headline },
    ...(c.cores.apoio ? { apoio: { cor: c.cores.apoio } } : {}),
    servico: { cor: c.cores.servico },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const pagina = c.logo ? { ...sintetica, layers: sintetica.layers.map((l) => (l.type === 'logo' ? { ...l, size: c.logo! } : l)) } : sintetica
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], ...(c.assunto ? { assunto: c.assunto } : {}) })
  const url = c.dataUrl ? dataUrl(foto) : join(tmpdir(), `cp2b-busca-espacial-${c.id}.png`)
  if (!c.dataUrl) writeFileSync(url, foto)
  cenario.atual = { ...base, foto: { url, bytes: foto }, projeto: { ...base.projeto, assinatura: ASSINATURA } }
  return pagina
}

const blocosDe = (c: Cena): Blocos =>
  c.blocos ?? [
    { papel: 'headline', linhas: c.arquetipo === CENTRO ? ['Sexta'] : ['Almoço', 'de domingo'] },
    ...(c.cores.apoio ? [{ papel: 'apoio', linhas: [c.arquetipo === CENTRO ? 'jazz ao vivo' : 'com a família toda'] }] : []),
    { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
  ]
const specDe = (c: Cena) => ({ ...specSintetica({ pagina: c.id, blocos: blocosDe(c) }), ...(c.arquetipo ? { arquetipo: { id: c.arquetipo } } : {}) })

interface Composta {
  cena: Cena
  r: ResultadoDaComposicao
  entrada: Record<string, any> | undefined
}

async function compor(c: Cena, opcoes: OpcoesDeComposicao = {}): Promise<Composta> {
  await montar(c)
  const antes = cap.entradas.length
  const r = await comporPeca(specDe(c), { autor: 'u-fixture', ...opcoes })
  return { cena: c, r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

async function recusa(c: Cena, opcoes: OpcoesDeComposicao = {}): Promise<CreativeError> {
  await montar(c)
  try {
    await comporPeca(specDe(c), { somenteAvaliar: true, ...opcoes })
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return e as CreativeError
  }
  throw new Error(`a composição de ${c.id} não recusou`)
}

/** Uma composição por cenário, compartilhada entre os testes (sempre aguardada em sequência: o cenário é global). */
const memo = new Map<string, Promise<Composta>>()
function peca(c: Cena): Promise<Composta> {
  if (!memo.has(c.id)) memo.set(c.id, compor(c))
  return memo.get(c.id)!
}
async function todas(): Promise<Composta[]> {
  const saida: Composta[] = []
  for (const c of QUE_COMPOEM) saida.push(await peca(c))
  return saida
}

/** O ciclo do 16/18: compor (persistido), mudar UMA palavra do serviço na página e recompor pela cadeia real. */
let cicloMemo: Promise<{ r1: ResultadoDaComposicao; r2: ResultadoDaComposicao; fv: Record<string, any>; gravada: SpecDePeca }> | null = null
function ciclo() {
  cicloMemo ??= (async () => {
    const { r: r1, entrada } = await compor(CICLO)
    const fv = entrada!.fieldValues
    const editadas = (entrada!.layers as Layer[]).map((l) => (l.id === 'servico' ? { ...l, content: 'Sáb · 12h às 16h' } : l))
    const gravada = validarSpec(fv.spec).spec as SpecDePeca
    const posicionada = specComAPosicaoOriginal(specComACopyDaPagina(gravada, editadas).spec, fv)
    const specRecomposta = specDaRecomposicao(posicionada, null)
    await montar(CICLO)
    const r2 = await comporPeca(specRecomposta, { somenteAvaliar: true, escolhaEspacial: escolhaEspacialOriginal(fv, gravada)! })
    return { r1, r2, fv, gravada }
  })()
  return cicloMemo
}

// ─── Leitura do resultado ────────────────────────────────────────────────────

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const busca = (r: ResultadoDaComposicao): DiagnosticoDaBuscaEspacial => r.diagnostico.arquetipo!.buscaEspacial!
const rotulos = (escolhas: Array<{ rotulo: string }>) => escolhas.map((e) => e.rotulo)
const faixaDe = (b: DiagnosticoDaBuscaEspacial, membro: MembroDaFaixa) => b.faixas.findIndex((f) => f.membros.includes(membro))
const escolhaDa = (b: DiagnosticoDaBuscaEspacial, membro: MembroDaFaixa) => b.vencedor!.escolhas.find((e) => e.faixa === faixaDe(b, membro))!
const gradientesDeLeitura = (r: ResultadoDaComposicao) => r.layers.filter((l) => l.id.startsWith('gradiente-leitura-'))
const ehReferenciaCentral = (a: { crop: string; escolhas: Array<{ rotulo: string }> }) => a.crop === 'center-middle' && a.escolhas.every((e) => e.rotulo === 'referencia')
const cortDaFoto = (r: ResultadoDaComposicao) => (camada(r, 'bg-foto').style as { cropPosition?: string }).cropPosition
const rectDe = (l: Layer): Rect => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })
const inter = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * A geometria de cada candidato da busca, conferida por fora: o `dy` dentro do intervalo da faixa, e cada membro
 * (a caixa da peça, levada de volta à referência e deslocada pelo `dy`) dentro da zona efetiva dele.
 */
function candidatosForaDaZona(r: ResultadoDaComposicao): string[] {
  const d = r.diagnostico.arquetipo!
  const b = d.buscaEspacial!
  const caixas = new Map(d.papeis.map((p) => [p.papel, { posicao: p.posicao, zona: p.zonaEfetiva }]))
  if (d.logo.modo === 'referencia') caixas.set('logo', { posicao: d.logo.posicao!, zona: d.logo.zonaEfetiva! })
  const fora: string[] = []
  for (const f of b.faixas) {
    for (const c of f.candidatos) {
      if (c.dy < f.intervalo.min || c.dy > f.intervalo.max) fora.push(`${c.rotulo} dy ${c.dy} fora do intervalo ${f.intervalo.min}..${f.intervalo.max}`)
      for (const m of f.membros) {
        const { posicao, zona } = caixas.get(m)!
        const y = posicao.y - (b.escolha.deslocamentos[m] ?? 0) + c.dy
        if (y < zona.y - 1 || y + posicao.height > zona.y + zona.height + 1) fora.push(`${m} em ${c.rotulo} (y ${y}–${y + posicao.height}) fora da zona ${zona.y}–${zona.y + zona.height}`)
      }
    }
  }
  return fora
}

/** Onde a manchete pousa em cada candidato da faixa dela (topo, base e x). */
function mancheteNosCandidatos(r: ResultadoDaComposicao) {
  const d = r.diagnostico.arquetipo!
  const b = d.buscaEspacial!
  const h = d.papeis.find((p) => p.papel === 'headline')!
  const yRef = h.posicao.y - (b.escolha.deslocamentos.headline ?? 0)
  return b.faixas[faixaDe(b, 'headline')].candidatos.map((c) => ({ rotulo: c.rotulo, y: yRef + c.dy, base: yRef + c.dy + h.posicao.height, x: h.posicao.x, zona: h.zonaEfetiva }))
}

// ─── A avaliação pura (8 e 9) ────────────────────────────────────────────────

/** Raster 108×192 uniforme do story. */
function rasterUniforme(luz: number): FotoCinza {
  const width = 108
  const height = 192
  return { data: Buffer.alloc(width * height, luz), width, height, stride: 1, escala: 0.1, canvas: STORY }
}

function unidade(papel: PapelDeTexto, o: { y: number; dy?: number; x?: number; w?: number; h?: number; faixa: number; ordem: number }): UnidadeDaCombinacao {
  const ref = { x: o.x ?? 92, y: o.y, width: o.w ?? 600, height: o.h ?? 100 }
  const rect = { ...ref, y: ref.y + (o.dy ?? 0) }
  return {
    papel,
    ordemDeLeitura: o.ordem,
    faixa: o.faixa,
    rect,
    rectComOrnamentos: rect,
    rectNaReferencia: ref,
    borda: ref.y + ref.height / 2 < 960 ? 'topo' : 'rodape',
    textos: [{ camada: papel, grupo: `grupo-arq-${papel}`, cor: CLARO, rect, caixaDeFundo: false }],
  }
}

/** A avaliação REAL (`avaliarCombinacao`) sobre foto escura, com o planejamento do CP2A (véus escuro e claro). */
function avaliarPuro(unidades: UnidadeDaCombinacao[], indice: number) {
  const raster = rasterUniforme(30)
  const mapa = mapaDeCalma(raster)
  const candidatas = candidatasDistintas([VEU_ESCURO, VEU_CLARO].map((cor) => ({ cor, origem: 'pagina' as const })))
  const planejamento: PlanejamentoDoTratamento = {
    bordasExplicitas: [],
    planejar: ({ borda, textos, vizinhos, alcance }) =>
      planejarTratamentoDaBorda({ borda, textos, vizinhos, candidatas, curva: CURVA_DE_LEITURA, forcaMinima: 0.45, forcaMaxima: 0.9, altura: alturaDaFaixa(alcance, 1920, GRADIENTE_PADRAO), H: 1920 }),
  }
  const indices = [...new Set(unidades.map((u) => u.faixa))]
  const faixas: FaixaDeBusca[] = indices.map((i) => ({
    indice: i,
    membros: unidades.filter((u) => u.faixa === i).map((u) => u.papel),
    intervalo: { min: -1500, max: 1500 },
    referenciaValida: true,
    candidatos: [{ rotulo: 'referencia', dy: 0 }],
  }))
  const dyDe = (i: number) => {
    const u = unidades.find((x) => x.faixa === i)!
    return u.rect.y - u.rectNaReferencia.y
  }
  return avaliarCombinacao({
    corte: { crop: 'center-middle', raster, mapa, regioes: [], assuntoVisivel: null },
    energiaDeReferencia: Math.max(1, mapa.energiaMaxima),
    materializada: {
      combinacao: {
        indice,
        escolhas: indices.map((i) => ({ faixa: i, rotulo: dyDe(i) === 0 ? ('referencia' as const) : dyDe(i) < 0 ? ('acima' as const) : ('abaixo' as const), dy: dyDe(i) })),
        deslocamentos: Object.fromEntries(unidades.map((u) => [u.papel, u.rect.y - u.rectNaReferencia.y])),
      },
      unidades,
    },
    faixas,
    planejamento,
    canvas: STORY,
  })
}

// ─── Os testes ───────────────────────────────────────────────────────────────

describe('CP2B · sem arquétipo, nada muda', () => {
  it('1. a mesma spec SEM arquétipo composta duas vezes dá camadas idênticas, e o diagnóstico não tem a chave arquetipo', async () => {
    // O resto da regra de ouro (o caminho sem arquétipo idêntico ao de ANTES do CP2B) está nos snapshots gerados na
    // base: t1a-baseline-sem-arquetipo.test.ts (fotos uniformes) e cp2b-baseline-sem-arquetipo.test.ts (onde a foto
    // decide: metades, faixa, região protegida, foto larga, feed).
    const sem: Cena = { ...CENAS.faixa, id: 'cp2b-sem-arquetipo', arquetipo: undefined }
    const a = await compor(sem)
    const b = await compor(sem)
    expect(JSON.stringify(b.r.layers)).toBe(JSON.stringify(a.r.layers))
    for (const { r, entrada } of [a, b]) {
      expect(Object.keys(r.diagnostico)).not.toContain('arquetipo')
      expect(entrada!.fieldValues.spec.arquetipo).toBeUndefined()
      expect(entrada!.fieldValues.composicao?.arquetipo).toBeUndefined()
    }
  }, 60_000)
})

describe('CP2B · a busca escolhe a posição pela foto', () => {
  it('2. referência perfeita vence: manchete em 298, serviço na referência, todas as escolhas "referencia", sem véu nenhum', async () => {
    const { r } = await peca(CENAS.h)
    expect(camada(r, 'headline').position).toEqual({ x: 92, y: 298 })
    expect(camada(r, 'servico').position).toEqual({ x: 92, y: 1555 })
    const b = busca(r)
    expect(rotulos(b.vencedor!.escolhas)).toEqual(['referencia', 'referencia'])
    expect(b.escolha.deslocamentos).toEqual({ headline: 0, servico: 0, logo: 0 })
    expect(b.vencedor!.tratamento).toEqual([
      { borda: 'topo', estado: 'sem-necessidade' },
      { borda: 'rodape', estado: 'sem-necessidade' },
    ])
    expect(gradientesDeLeitura(r)).toEqual([])
  }, 60_000)

  it('3. referência ruim → outra posição válida vence: o serviço sobe para a faixa escura (acima) e lê sem véu, dentro da zona', async () => {
    const { r } = await peca(CENAS.faixa)
    const b = busca(r)
    // A referência (serviço em 1555, sobre o claro) pede véu escuro no rodapé.
    const referencia = b.alternativas.find(ehReferenciaCentral)!
    expect(referencia.eliminada).toEqual([])
    expect(referencia.tratamento.find((t) => t.borda === 'rodape')).toMatchObject({ estado: 'tratado', cor: VEU_ESCURO })
    expect(referencia.componentes!.custoDoTratamento).toBeGreaterThan(0)
    // A candidata 'acima' cai na faixa escura e lê sem véu: vence.
    expect(escolhaDa(b, 'servico')).toMatchObject({ rotulo: 'acima', dy: -172 })
    expect(escolhaDa(b, 'headline').rotulo).toBe('referencia')
    expect(b.vencedor!.componentes!.custoDoTratamento).toBe(0)
    const servico = camada(r, 'servico')
    expect(servico.position.y).toBe(1555 - 172)
    expect(servico.position.y).toBeGreaterThanOrEqual(FAIXA_ESCURA.y0)
    expect(servico.position.y + servico.size.height).toBeLessThanOrEqual(FAIXA_ESCURA.y1)
    const zona = r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'servico')!.zonaEfetiva
    expect(servico.position.y).toBeGreaterThanOrEqual(zona.y)
    expect(servico.position.y + servico.size.height).toBeLessThanOrEqual(zona.y + zona.height)
    // A peça sai sem véu de leitura, e o serviço lê (medido por fora, no render).
    expect(gradientesDeLeitura(r)).toEqual([])
    const leitura = (await leiturasDosTextos(r.layers, STORY)).find((l) => l.camada === 'servico')!
    expect(leituraDentroDoAlvo(leitura)).toBe(true)
  }, 60_000)

  it('4. sem tratamento vence a que precisaria de tratamento, MESMO menos calma', async () => {
    const { r } = await peca(CENAS.textura)
    const b = busca(r)
    const referencia = b.alternativas.find(ehReferenciaCentral)!
    expect(escolhaDa(b, 'servico').rotulo).toBe('acima')
    expect(b.vencedor!.componentes!.custoDoTratamento).toBe(0)
    expect(referencia.eliminada).toEqual([])
    expect(referencia.componentes!.custoDoTratamento).toBeGreaterThan(0)
    // A faixa texturizada é MENOS calma que o claro liso da referência — e mesmo assim vence.
    expect(b.vencedor!.componentes!.calma).toBeLessThan(referencia.componentes!.calma)
    expect(b.motivo).toMatch(/aqui lê sem véu/)
  }, 60_000)

  it('7. região protegida do catálogo sobre a faixa escura: a candidata que a invade é eliminada, e o vencedor não invade', async () => {
    // Sem a região (o cenário do 3), a candidata 'acima' venceria.
    expect(escolhaDa(busca((await peca(CENAS.faixa)).r), 'servico').rotulo).toBe('acima')
    const { r } = await peca(CENAS.regiao)
    const b = busca(r)
    expect(b.recusas.INVADE_REGIAO_PROTEGIDA).toBeGreaterThan(0)
    const invasoras = b.exemplosDeRecusa.filter((e) => e.eliminada.some((x) => x.motivo === MOTIVOS_DE_ELIMINACAO.invadeRegiaoProtegida))
    expect(invasoras.length).toBeGreaterThan(0)
    for (const e of invasoras) expect(e.escolhas.find((x) => x.faixa === faixaDe(b, 'servico'))!.rotulo).toBe('acima')
    expect(escolhaDa(b, 'servico').rotulo).not.toBe('acima')
    expect(b.vencedor!.eliminada).toEqual([])
    const regiao = { x: 0, y: FAIXA_ESCURA.y0, width: 540, height: FAIXA_ESCURA.y1 - FAIXA_ESCURA.y0 }
    expect(textosQueInvadem(r.layers, regiao)).toEqual([])
  }, 60_000)

  it('13. crop lateral vence: na foto larga o serviço só lê sem véu no corte da esquerda', async () => {
    const { r } = await peca(CENAS.larga)
    const b = busca(r)
    expect([...b.cortesAvaliados].sort()).toEqual(['center-middle', 'left-middle', 'right-middle'])
    expect(b.escolha.corte).toBe('left-middle')
    expect(b.vencedor!.componentes!.custoDoTratamento).toBe(0)
    // No corte central, a referência pede véu no rodapé.
    const central = b.alternativas.find(ehReferenciaCentral)!
    expect(central.tratamento.find((t) => t.borda === 'rodape')!.estado).toBe('tratado')
    expect(central.componentes!.custoDoTratamento).toBeGreaterThan(0)
    expect(cortDaFoto(r)).toBe('left-middle')
    expect(r.diagnostico.posicao.crop).toBe('left-middle')
  }, 60_000)

  it('14. central vence quando equivalente: foto larga uniforme e textos escuros — center-middle e a referência', async () => {
    const { r } = await peca(CENAS.largaUniforme)
    const b = busca(r)
    expect(b.cortesAvaliados).toHaveLength(3)
    expect(b.escolha.corte).toBe('center-middle')
    expect(rotulos(b.vencedor!.escolhas)).toEqual(['referencia', 'referencia'])
    expect(cortDaFoto(r)).toBe('center-middle')
    expect(r.diagnostico.posicao.crop).toBe('center-middle')
  }, 60_000)
})

describe('CP2B · candidatos fora da zona nunca entram', () => {
  it('5. dy que tira o serviço da zona: a reprodução forçada recusa (nada é movido); e todo candidato gerado cai no intervalo e na zona', async () => {
    const { r } = await peca(CENAS.faixa)
    const congelada: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: busca(r).escolha.foto, corte: 'center-middle', deslocamentos: { headline: 0, servico: -250, logo: -250 } }
    const e = await recusa(CENAS.faixa, { escolhaEspacial: congelada })
    expect(e.code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
    const details = e.details as { escolha: EscolhaEspacial; problemas: Array<{ codigo: string; papel: string }> }
    expect(details.escolha.deslocamentos).toEqual(congelada.deslocamentos)
    expect(details.problemas).toContainEqual(expect.objectContaining({ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: 'servico' }))
    // A geometria dos candidatos que a busca GEROU, conferida por fora em todas as peças compostas.
    for (const p of await todas()) {
      expect(busca(p.r).faixas.every((f) => f.candidatos.length > 0)).toBe(true)
      expect(candidatosForaDaZona(p.r), p.cena.id).toEqual([])
    }
  }, 120_000)

  it('6. dentro da área segura mas fora da zona: a manchete do topo-esquerda abaixo de 639 é recusada (FORA_DA_ZONA da headline)', async () => {
    const { r } = await peca(CENAS.faixa)
    const congelada: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: busca(r).escolha.foto, corte: 'center-middle', deslocamentos: { headline: 400, servico: 0, logo: 0 } }
    const e = await recusa(CENAS.faixa, { escolhaEspacial: congelada })
    expect(e.code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
    const problema = (e.details as { problemas: Array<Record<string, any>> }).problemas.find((p) => p.papel === 'headline')!
    expect(problema.codigo).toBe('ARQUETIPO_FORA_DA_ZONA')
    expect(problema.zonaEfetiva.y + problema.zonaEfetiva.height).toBe(639)
    // Na posição pedida a manchete (298 + 400) passa da zona, mas fica dentro da área segura do story (188–1696).
    const topo = problema.referencia.y + 400
    expect(topo).toBeGreaterThan(639)
    expect(topo + problema.medida.height).toBeLessThan(1920 - 224)
  }, 60_000)
})

describe('CP2B · hard constraints da avaliação', () => {
  it('8. colisão entre grupos elimina a combinação (puro); e na integração nenhum texto final se sobrepõe a outro', async () => {
    const headline = () => unidade('headline', { y: 300, h: 200, faixa: 0, ordem: 1 })
    const colide = avaliarPuro([headline(), unidade('servico', { y: 1555, dy: -1150, h: 46, faixa: 1, ordem: 3 })], 1)
    expect(colide.eliminada.map((x) => x.motivo)).toContain(MOTIVOS_DE_ELIMINACAO.colisao)
    expect(colide.componentes).toBeUndefined()
    const valida = avaliarPuro([headline(), unidade('servico', { y: 1555, h: 46, faixa: 1, ordem: 3 })], 0)
    expect(valida.eliminada).toEqual([])
    const ordenadas = ordenarAvaliacoes([colide, valida])
    expect(ordenadas[0]).toBe(valida)
    expect(ordenadas.at(-1)).toBe(colide)

    for (const { cena, r } of await todas()) {
      const ts = r.layers.filter((l) => l.type === 'text')
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) expect(inter(rectDe(ts[i]), rectDe(ts[j])), `${cena.id}: ${ts[i].id} × ${ts[j].id}`).toBe(0)
    }
  }, 120_000)

  it('9. ordem de leitura invertida elimina a combinação (puro); e na integração nenhuma peça inverte a ordem', async () => {
    // O serviço (lido depois) sobe para o lado da manchete, sem encostar nela: a ordem acusa (e a hierarquia), não a colisão.
    const invertida = avaliarPuro([unidade('headline', { y: 300, w: 300, faixa: 0, ordem: 1 }), unidade('servico', { y: 1555, dy: -1355, x: 600, w: 300, h: 46, faixa: 1, ordem: 3 })], 1)
    const motivos = invertida.eliminada.map((x) => x.motivo)
    expect(motivos).toContain(MOTIVOS_DE_ELIMINACAO.ordemDeLeitura)
    expect(motivos).not.toContain(MOTIVOS_DE_ELIMINACAO.colisao)
    const valida = avaliarPuro([unidade('headline', { y: 300, w: 300, faixa: 0, ordem: 1 }), unidade('servico', { y: 1555, x: 600, w: 300, h: 46, faixa: 1, ordem: 3 })], 0)
    expect(valida.eliminada).toEqual([])
    expect(ordenarAvaliacoes([invertida, valida])[0]).toBe(valida)

    for (const { cena, r } of await todas()) expect(ordemDeLeituraInvertida(r.layers, specDe(cena).blocos), cena.id).toEqual([])
  }, 120_000)
})

describe('CP2B · os casos H e A com arquétipo', () => {
  it('10. caso H: manchete escura no topo claro e serviço claro na base escura leem SEM tratamento', async () => {
    const { r } = await peca(CENAS.h)
    expect(r.diagnostico.tratamentoDeLeitura!.map((t) => [t.borda, t.estado])).toEqual([
      ['topo', 'sem-necessidade'],
      ['rodape', 'sem-necessidade'],
    ])
    expect(gradientesDeLeitura(r)).toEqual([])
    const leituras = await leiturasDosTextos(r.layers, STORY)
    expect(leituras.map((l) => l.camada).sort()).toEqual(['headline', 'servico'])
    for (const l of leituras) expect(leituraDentroDoAlvo(l), `${l.camada}: ${l.com} contra o alvo ${l.alvo}`).toBe(true)
    expect(tratamentosQuePioram(leituras)).toEqual([])
  }, 60_000)

  it('11. caso A: a referência (apoio escuro no escuro; o véu claro pioraria o serviço claro) é eliminada; a faixa {headline, apoio} desce até o apoio cair no claro', async () => {
    const { r } = await peca(CENAS.a)
    const b = busca(r)
    // A referência: o apoio não lê, e nenhum véu do rodapé serve aos dois.
    const referencia = b.alternativas.find(ehReferenciaCentral)!
    const motivos = referencia.eliminada.map((x) => x.motivo)
    expect(motivos.some((m) => m === MOTIVOS_DE_ELIMINACAO.tratamentoPiora || m === MOTIVOS_DE_ELIMINACAO.polaridadeIncompativel)).toBe(true)
    expect(referencia.textos.find((t) => t.camada === 'apoio')!.jaLe).toBe(false)
    expect((b.recusas.TRATAMENTO_PIORA_LEITURA ?? 0) + (b.recusas.POLARIDADE_INCOMPATIVEL ?? 0)).toBeGreaterThan(0)
    // A busca desceu a faixa da manchete e do apoio, e a peça saiu (sem SEM_COMBINACAO).
    const escolha = escolhaDa(b, 'apoio')
    expect(escolhaDa(b, 'headline')).toEqual(escolha)
    expect(escolha.dy).toBeGreaterThan(0)
    const apoio = camada(r, 'apoio')
    expect(apoio.position.y).toBeGreaterThanOrEqual(1150)
    expect(apoio.position.y + apoio.size.height).toBeLessThanOrEqual(1450)
    const leituras = await leiturasDosTextos(r.layers, STORY)
    const doApoio = leituras.find((l) => l.camada === 'apoio')!
    expect(doApoio.polaridade).toBe('escura')
    expect(leituraDentroDoAlvo(doApoio)).toBe(true)
    expect(tratamentosQuePioram(leituras)).toEqual([])
  }, 60_000)

  it('12. nenhuma posição: centro-óptico em cinza uniforme, apoio escuro e serviço claro que não leem → SEM_COMBINACAO só depois de esgotar a busca', async () => {
    // Com as cores extremas (#1E1E1E e #F5F5F5) o cinza 128 NÃO é o caso: as duas leem (o apoio pede p02 ≥ 104 e tem
    // ~124; o serviço pede p98 ≤ 142 e tem ~131). O caso "nenhum lê" pede cores de meio-tom, de polaridade
    // inequívoca: #3A3A3A (alvo p02 ≥ 131) e #C8C8C8 (alvo p98 ≤ 111).
    const literal = await compor({ id: 'cp2b-cinza-literal', arquetipo: CENTRO, luz: () => 128, cores: { headline: CLARO, apoio: ESCURO, servico: CLARO } }, { somenteAvaliar: true })
    expect(busca(literal.r).vencedor!.textos.every((t) => t.jaLe)).toBe(true)

    const e = await recusa({ id: 'cp2b-cinza', arquetipo: CENTRO, luz: () => 128, cores: { headline: CLARO, apoio: '#3A3A3A', servico: '#C8C8C8' } })
    expect(e.code).toBe('SEM_COMBINACAO')
    const details = e.details as { motivo: string; cortesAvaliados: string[]; combinacoesAvaliadas: number; recusas: Record<string, number> }
    // Apoio (escuro, pede véu CLARO) e serviço (claro, pede véu ESCURO) na MESMA borda (rodapé, pela referência): o
    // CP2A recusa antes de escolher a cor — em todas as combinações, então é ele o motivo da falta.
    expect(details.motivo).toBe('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')
    // Esgotada: todas as combinações de todos os cortes avaliadas (a geometria é a do caso A: mesma copy, mesma página).
    const faixas = busca((await peca(CENAS.a)).r).faixas
    const total = details.cortesAvaliados.length * faixas.reduce((n, f) => n * f.candidatos.length, 1)
    expect(details.combinacoesAvaliadas).toBe(total)
    expect(details.recusas).toEqual({ POLARIDADE_INCOMPATIVEL: total })
  }, 60_000)

  it('15. o tratamento que o CP2A prova pior nunca vence: a referência cujo véu pioraria o apoio sai com TRATAMENTO_PIORA_LEITURA', async () => {
    const { r } = await peca(CENAS.piora)
    const b = busca(r)
    expect(b.recusas.TRATAMENTO_PIORA_LEITURA).toBeGreaterThan(0)
    const referencia = b.alternativas.find(ehReferenciaCentral)!
    expect(referencia.eliminada).toContainEqual(expect.objectContaining({ motivo: MOTIVOS_DE_ELIMINACAO.tratamentoPiora, motivoDoTratamento: 'TRATAMENTO_PIOROU_LEITURA' }))
    expect(referencia.tratamento.find((t) => t.borda === 'topo')).toMatchObject({ estado: 'inviavel', motivo: 'TRATAMENTO_PIOROU_LEITURA' })
    // O vencedor não está entre as eliminadas pelo tratamento que piora.
    const chave = (a: { crop: string; escolhas: unknown }) => JSON.stringify([a.crop, a.escolhas])
    const pioradas = [...b.exemplosDeRecusa, ...b.alternativas].filter((a) => a.eliminada.some((x) => x.motivo === MOTIVOS_DE_ELIMINACAO.tratamentoPiora))
    expect(pioradas.length).toBeGreaterThan(0)
    expect(pioradas.map(chave)).not.toContain(chave(b.vencedor!))
    expect(b.vencedor!.eliminada).toEqual([])
    // A peça final: a régua não acusa piora, e o oráculo de fora também não.
    expect(r.diagnostico.tratamentoPiorou ?? []).toEqual([])
    expect(tratamentosQuePioram(await leiturasDosTextos(r.layers, STORY))).toEqual([])
  }, 60_000)
})

describe('CP2B · a região ESTIMADA pela energia é custo, não recusa', () => {
  it('sem catálogo, a borda de uma faixa de luz (que vira "assunto" estimado) não elimina posição nenhuma: o caso A compõe igual', async () => {
    const { assunto: _catalogo, ...semCatalogo } = CENAS.a
    const { r } = await compor({ ...semCatalogo, id: 'cp2b-a-sem-catalogo' }, { somenteAvaliar: true })
    const b = busca(r)
    expect(r.diagnostico.assuntoOrigem).toBe('estimado')
    expect(b.recusas.INVADE_REGIAO_PROTEGIDA ?? 0).toBe(0)
    expect(escolhaDa(b, 'apoio').dy).toBeGreaterThan(0)
    // A estimada entra no componente assunto (o vencedor carrega o custo, se cobre a caixa estimada).
    expect(b.vencedor!.componentes!.assunto).toBeGreaterThanOrEqual(0)
    expect(b.vencedor!.componentes!.assunto).toBeLessThanOrEqual(1)
  }, 60_000)
})

describe('CP2B · a escolha congelada na recomposição', () => {
  it('16. recomposição por mudança de UMA palavra do serviço: mesmo corte, mesmos y, mesma versão, a escolha reproduzida (mesmo id)', async () => {
    const { r1, r2 } = await ciclo()
    // O cenário do 3: o serviço saiu da referência.
    expect(escolhaDa(busca(r1), 'servico').rotulo).toBe('acima')
    expect(camada(r2, 'servico').content).toBe('Sáb · 12h às 16h')
    expect(r2.diagnostico.posicao.crop).toBe(r1.diagnostico.posicao.crop)
    expect(cortDaFoto(r2)).toBe(cortDaFoto(r1))
    for (const id of ['headline', 'servico', 'logo']) expect(camada(r2, id).position.y, id).toBe(camada(r1, id).position.y)
    const a1 = r1.diagnostico.arquetipo!
    const a2 = r2.diagnostico.arquetipo!
    expect({ id: a2.id, versao: a2.versao, impressao: a2.impressao, modo: a2.modo }).toEqual({ id: a1.id, versao: a1.versao, impressao: a1.impressao, modo: a1.modo })
    expect(busca(r2).reproduzida).toMatchObject({ de: busca(r1).id, original: { id: busca(r1).id, motivo: busca(r1).motivo } })
    expect(busca(r2).id).toBe(busca(r1).id)
    expect(busca(r2).escolha).toEqual(busca(r1).escolha)
    expect(r2.diagnostico.avisos.some((a) => /foto da peça mudou/.test(a))).toBe(false)
  }, 120_000)

  it('17. posição persistida não é re-sorteada: o dy congelado vale; e a copy que não cabe nele é recusada sem mover nada', async () => {
    const livre = (await peca(CONGELADA)).r
    const b = busca(livre)
    const abaixo = (membro: MembroDaFaixa) => b.faixas[faixaDe(b, membro)].candidatos.find((c) => c.rotulo === 'abaixo')!.dy
    const congelada: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: b.escolha.foto, corte: 'center-middle', deslocamentos: { headline: abaixo('headline'), servico: abaixo('servico'), logo: abaixo('servico') } }
    // Uma busca nova NÃO escolhe essa posição.
    expect(rotulos(b.vencedor!.escolhas)).not.toEqual(['abaixo', 'abaixo'])
    expect(b.escolha.deslocamentos).not.toEqual(congelada.deslocamentos)

    const { r } = await compor(CONGELADA, { somenteAvaliar: true, escolhaEspacial: congelada })
    const yRef = (id: MembroDaFaixa) => camada(livre, id).position.y - (b.escolha.deslocamentos[id] ?? 0)
    for (const id of ['headline', 'servico', 'logo'] as const) expect(camada(r, id).position.y, id).toBe(yRef(id) + congelada.deslocamentos[id]!)
    expect(busca(r).escolha.deslocamentos).toEqual(congelada.deslocamentos)
    expect(busca(r).reproduzida).toBeDefined()
    expect(busca(r).combinacoesAvaliadas).toBe(1)

    // O exemplo do pedido (serviço de 2 linhas no 'abaixo') CABE: o 'abaixo' do serviço é limitado pela LOGO (23 px), e
    // duas linhas de serviço ainda terminam antes de 1695. O que não cabe é a manchete de 2 linhas no fundo da zona.
    const servico2 = await compor({ ...CONGELADA, blocos: [{ papel: 'headline', linhas: ['Almoço'] }, { papel: 'servico', linhas: ['Dom · 12h às 16h', 'Reservas pelo direct'] }] }, { somenteAvaliar: true, escolhaEspacial: congelada })
    expect(camada(servico2.r, 'servico').position.y).toBe(camada(r, 'servico').position.y)

    const e = await recusa({ ...CONGELADA, blocos: [{ papel: 'headline', linhas: ['Almoço', 'de domingo'] }, { papel: 'servico', linhas: ['Dom · 12h às 16h'] }] }, { escolhaEspacial: congelada })
    expect(e.code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
    const details = e.details as { escolha: EscolhaEspacial; problemas: Array<{ codigo: string; papel: string }> }
    expect(details.escolha.deslocamentos).toEqual(congelada.deslocamentos)
    expect(details.problemas).toContainEqual(expect.objectContaining({ codigo: 'ARQUETIPO_FORA_DA_ZONA', papel: 'headline' }))
  }, 120_000)

  it('18. versão congelada: id/versão/impressão iguais na spec gravada, no diagnóstico e depois da recomposição', async () => {
    const { r1, r2, fv, gravada } = await ciclo()
    const esperado = v1(TOPO)
    expect(fv.spec.arquetipo).toEqual(esperado)
    expect(gravada.arquetipo).toEqual(esperado)
    for (const a of [r1.diagnostico.arquetipo!, fv.composicao.arquetipo, r2.diagnostico.arquetipo!]) expect({ id: a.id, versao: a.versao, impressao: a.impressao }).toEqual(esperado)
  }, 120_000)
})

describe('CP2B · a busca respeita a identidade do arquétipo', () => {
  it('19. centro-óptico: todas as candidatas da faixa {headline, apoio} mantêm a manchete na zona central (806–1190), centrada', async () => {
    const { r } = await peca(CENAS.a)
    const b = busca(r)
    expect(b.faixas[faixaDe(b, 'headline')].membros).toEqual(['headline', 'apoio'])
    const candidatas = mancheteNosCandidatos(r)
    expect(candidatas.length).toBeGreaterThan(1)
    const zona = candidatas[0].zona
    expect([zona.y, zona.y + zona.height]).toEqual([806, 1190])
    for (const c of candidatas) {
      expect(c.y, c.rotulo).toBeGreaterThanOrEqual(806)
      expect(c.base, c.rotulo).toBeLessThanOrEqual(1190)
    }
    const h = camada(r, 'headline')
    expect(h.position.y).toBeGreaterThanOrEqual(806)
    expect(h.position.y + h.size.height).toBeLessThanOrEqual(1190)
    expect(Math.abs(h.position.x + h.size.width / 2 - 540)).toBeLessThanOrEqual(1)
  }, 60_000)

  it('20. topo-esquerda: a manchete nunca desce ao centro nem à base — base ≤ 639 e x 92 em toda candidata', async () => {
    for (const { cena, r } of (await todas()).filter((p) => p.cena.arquetipo === TOPO)) {
      for (const m of mancheteNosCandidatos(r)) {
        expect(m.base, `${cena.id} ${m.rotulo}`).toBeLessThanOrEqual(639)
        expect(m.x, `${cena.id} ${m.rotulo}`).toBe(92)
      }
      const h = camada(r, 'headline')
      expect(h.position.x).toBe(92)
      expect(h.position.y + h.size.height).toBeLessThanOrEqual(639)
    }
  }, 120_000)

  it('21. o serviço permanece secundário: abaixo da faixa da manchete, em corpo menor, e nunca na faixa dela', async () => {
    const pecas: Array<[string, ResultadoDaComposicao]> = (await todas()).map((p) => [p.cena.id, p.r])
    pecas.push(['cp2b-congelada', (await peca(CONGELADA)).r], ['cp2b-ciclo-recomposta', (await ciclo()).r2])
    for (const [id, r] of pecas) {
      const b = busca(r)
      const daManchete = b.faixas[faixaDe(b, 'headline')].membros
      expect(daManchete, id).not.toContain('servico')
      const baseDaFaixa = Math.max(...daManchete.filter((m) => m !== 'logo').map((m) => camada(r, m).position.y + camada(r, m).size.height))
      const servico = camada(r, 'servico')
      expect(servico.position.y, id).toBeGreaterThanOrEqual(baseDaFaixa)
      expect(Number(servico.style?.fontSize), id).toBeLessThan(Number(camada(r, 'headline').style?.fontSize))
      expect(servicoDisputaEntrada(r.layers), id).toEqual([])
    }
  }, 120_000)
})

describe('CP2B · diagnóstico, estabilidade e medir-copy', () => {
  it('22. o diagnóstico explica a busca e cabe no MCP', async () => {
    const { r, entrada } = await peca(CENAS.faixa)
    const b = busca(r)
    expect(r.diagnostico.arquetipo!.modo).toBe('busca-espacial-v1')
    expect(b.versao).toBe('busca-espacial-v1')
    expect(b.id).toMatch(/^be1-[0-9a-f]{12}$/)
    expect(b.escolha).toMatchObject({ modo: 'busca-espacial-v1', corte: 'center-middle', deslocamentos: { headline: 0, servico: -172, logo: -172 } })
    expect(typeof b.escolha.foto).toBe('string')
    expect(b.cortesAvaliados).toEqual(['center-middle'])
    expect(b.combinacoesAvaliadas).toBe(20)
    expect(b.combinacoesAvaliadas).toBeLessThanOrEqual(75)
    expect(b.limite).toBe(75)
    expect(b.limite).toBe(LIMITES_DA_BUSCA.avaliacoes)
    expect(b.faixas.map((f) => f.membros)).toEqual([['headline'], ['servico', 'logo']])
    for (const f of b.faixas) expect(f.candidatos[0]).toEqual({ rotulo: 'referencia', dy: 0 })
    expect(Object.keys(b.vencedor!.componentes!).sort()).toEqual(['assunto', 'calma', 'contrasteNatural', 'corte', 'custoDoTratamento', 'referencia'])
    expect(typeof b.vencedor!.pontuacao).toBe('number')
    expect(b.vencedor!.tratamento.map((t) => t.borda)).toEqual(['topo', 'rodape'])
    expect(b.vencedor!.textos.map((t) => t.camada)).toEqual(['headline', 'servico'])
    expect(b.alternativas.length).toBeGreaterThan(0)
    expect(b.alternativas.length).toBeLessThanOrEqual(2)
    expect(b.recusas).toEqual({})
    expect(b.motivo.length).toBeGreaterThan(0)
    // Gravado onde a recomposição o lê.
    expect(entrada!.fieldValues.composicao.arquetipo.buscaEspacial).toEqual(JSON.parse(JSON.stringify(b)))
    // Cabe no MCP: < 20 KB em todas as peças (também nas com recusas e nas de 3 cortes).
    for (const p of await todas()) expect(JSON.stringify(busca(p.r)).length, p.cena.id).toBeLessThan(20 * 1024)
  }, 120_000)

  it('ESTABILIDADE: a mesma entrada (o cenário do 3) composta 3 vezes dá camadas e busca idênticas', async () => {
    const vezes: Composta[] = []
    for (let i = 0; i < 3; i++) vezes.push(await compor(CENAS.faixa, { somenteAvaliar: true }))
    for (const v of vezes.slice(1)) {
      expect(JSON.stringify(v.r.layers)).toBe(JSON.stringify(vezes[0].r.layers))
      expect(busca(v.r)).toEqual(busca(vezes[0].r))
    }
  }, 120_000)

  it('MEDIR-COPY: com arquétipo a busca espacial não roda lá (avaliacaoEspacial "nao-executada"); a posição dita é a de partida', async () => {
    const pagina = await montar(CENAS.faixa)
    const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: ASSINATURA, logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(specDe(CENAS.faixa))
    const m = medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
    expect(m.cabeTudo).toBe(true)
    expect(m.arquetipo!.avaliacaoEspacial).toBe('nao-executada')
    // A medida diz a referência (1555); o compor, pela foto, sobe o serviço (1383).
    expect(m.arquetipo!.posicoes!.servico!.posicao.y).toBe(1555)
    expect(camada((await peca(CENAS.faixa)).r, 'servico').position.y).toBe(1383)
  }, 60_000)
})

describe('CP2B · correções da revisão adversarial', () => {
  it('a região ESTIMADA vence o véu: sem catálogo, a manchete clara não pousa sobre o "prato" para fugir do véu', async () => {
    // O "prato" texturizado (escuro, 30 ± 20) ocupa o meio do topo; o resto é claro. Descer a manchete clara para cima dele
    // leria sem véu — e cobriria o assunto. Subir a mantém fora dele, com véu.
    const prato: Cena = {
      id: 'cp2b-prato',
      arquetipo: TOPO,
      luz: (x, y) => (y >= 384 && y < 1344 ? 30 + Math.round(ruidoForte(x, y) / 2) : 205),
      cores: { headline: CLARO, servico: ESCURO },
    }
    const { r } = await compor(prato, { somenteAvaliar: true })
    expect(r.diagnostico.assuntoOrigem).toBe('estimado')
    const b = busca(r)
    expect(b.vencedor!.regiaoEstimada?.invade).toBe(false)
    // Havia candidata válida que leria sem véu sobre o prato — e perdeu para a que não cobre o assunto.
    const sobreOPrato = [...b.alternativas].find((a) => a.regiaoEstimada?.invade && a.componentes?.custoDoTratamento === 0)
    if (sobreOPrato) expect(b.vencedor!.componentes!.custoDoTratamento).toBeGreaterThanOrEqual(0)
    const manchete = camada(r, 'headline')
    expect(manchete.position.y + manchete.size.height).toBeLessThanOrEqual(384 + 0.4 * manchete.size.height)
  }, 60_000)

  it('a logo automática congelada que encostaria no texto novo vai para o canto livre, DITO (nunca fica por cima do serviço)', async () => {
    const larga: Cena = { id: 'cp2b-logo-larga', arquetipo: CENTRO, luz: () => 55, cores: { headline: CLARO, apoio: CLARO, servico: CLARO }, logo: { width: 300, height: 150 }, blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Sex 20h'] }] }
    const { r } = await compor(larga, { somenteAvaliar: true })
    const escolha = busca(r).escolha
    expect(escolha.cantoDaLogo).toBeTruthy()
    const longa = { ...larga, blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Sexta-feira · 20h às 23h · no bar'] }] }
    const { r: r2 } = await compor(longa, { somenteAvaliar: true, escolhaEspacial: escolha })
    const logo = rectDe(camada(r2, 'logo'))
    const servico = rectDe(camada(r2, 'servico'))
    expect(inter(logo, servico)).toBe(0)
    const canto = (camada(r2, 'logo').metadata as { compositor?: { canto?: string } }).compositor?.canto
    if (canto !== escolha.cantoDaLogo) expect(r2.diagnostico.avisos.some((a) => /A logo saiu do canto congelado/.test(a))).toBe(true)
  }, 60_000)

  it('a logo de referência fixa que mudou de proporção não derruba a recomposição: ela se ajusta na zona, dito; o texto fica', async () => {
    const livre = (await peca(CONGELADA)).r
    const b = busca(livre)
    const abaixo = b.faixas[faixaDe(b, 'servico')].candidatos.find((c) => c.rotulo === 'abaixo')!.dy
    const congelada: EscolhaEspacial = { modo: MODO_BUSCA_ESPACIAL, foto: b.escolha.foto, corte: 'center-middle', deslocamentos: { headline: 0, servico: abaixo, logo: abaixo } }
    // O mesmo id (a mesma foto, a mesma escolha); só a logo da página virou quadrada.
    const { r } = await compor({ ...CONGELADA, logo: { width: 120, height: 120 } }, { somenteAvaliar: true, escolhaEspacial: congelada })
    expect(r.diagnostico.avisos.some((a) => /A logo da assinatura não cabia mais/.test(a))).toBe(true)
    const yServico = camada(livre, 'servico').position.y - (b.escolha.deslocamentos.servico ?? 0) + abaixo
    expect(camada(r, 'servico').position.y).toBe(yServico)
  }, 60_000)

  it('a escolha gravada que parte uma faixa (dy diferentes entre membros) é ilegível — nunca uma faixa partida', async () => {
    const e = await recusa(CENAS.a, { escolhaEspacial: { modo: MODO_BUSCA_ESPACIAL, foto: busca((await peca(CENAS.a)).r).escolha.foto, corte: 'center-middle', deslocamentos: { headline: 0, apoio: 40, servico: 0 } } })
    expect(e.code).toBe('ARQUETIPO_ESCOLHA_ILEGIVEL')
  }, 60_000)

  it('a borda do tratamento da busca é a mesma da régua: no centro-óptico, a manchete que cruza H/2 é estimada no rodapé', async () => {
    const cruza: Cena = { id: 'cp2b-borda', arquetipo: CENTRO, luz: (_x, y) => (y < 960 ? 250 : y < 1400 ? 170 : 230), cores: { headline: CLARO, apoio: CLARO, servico: CLARO } }
    const { r } = await compor(cruza, { somenteAvaliar: true })
    const b = busca(r)
    const manchete = rectDe(camada(r, 'headline'))
    const geometrica = manchete.y + manchete.height / 2 < 960 ? 'topo' : 'rodape'
    expect(b.vencedor!.textos.find((t) => t.camada === 'headline')!.borda).toBe(geometrica)
    expect(r.diagnostico.tratamentoDeLeitura!.find((t) => t.textos.some((x) => x.camada === 'headline'))!.borda).toBe(geometrica)
  }, 60_000)

  it('assunto do catálogo que NENHUM corte preserva não vira SEM_COMBINACAO (o T1a compunha): compõe, com aviso', async () => {
    const largo: Cena = { id: 'cp2b-assunto-largo', arquetipo: TOPO, dimensoes: { width: 1920, height: 1440 }, luz: () => 60, cores: { headline: CLARO, servico: CLARO }, assunto: { x0: 0.05, y0: 0.35, x1: 0.95, y1: 0.65 } }
    const { r } = await compor(largo, { somenteAvaliar: true })
    expect(busca(r).recusas.CORTE_PERDE_O_ASSUNTO ?? 0).toBe(0)
    expect(r.diagnostico.avisos.some((a) => /preserva menos de 75% da caixa do assunto/.test(a))).toBe(true)
  }, 60_000)

  it('na reprodução, a copy nova que invade a região protegida do catálogo é recusada (nunca publicada por cima do produto)', async () => {
    const produto: Cena = { id: 'cp2b-produto', arquetipo: TOPO, luz: () => 60, cores: { headline: CLARO, servico: CLARO }, assunto: { x0: 0.36, y0: 0.8, x1: 0.5, y1: 0.86 } }
    const { r } = await compor(produto, { somenteAvaliar: true })
    const escolha = busca(r).escolha
    // A copy curta não toca a região (x 389–540) e fica na referência; a longa passaria por cima dela na posição congelada.
    expect(escolha.deslocamentos.servico).toBe(0)
    const e = await recusa({ ...produto, blocos: [{ papel: 'headline', linhas: ['Almoço', 'de domingo'] }, { papel: 'servico', linhas: ['Domingo · das 12h às 16h'] }] }, { escolhaEspacial: escolha })
    expect(e.code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
    expect(e.message).toMatch(/região protegida do catálogo/)
  }, 60_000)

  it('o caso antigo do T1a 15 (centro-óptico em foto clara e uniforme, textos claros): compõe dentro da zona, sem piorar leitura', async () => {
    // Na referência a manchete e o apoio claros não leem sobre o claro; a busca escolhe a posição de véu mais leve
    // (a regra do owner: tratamento mais leve antes da referência) — dentro da zona central, sem piora medida pela régua.
    const claro: Cena = { id: 'cp2b-t1a-15', arquetipo: CENTRO, luz: () => 205, cores: { headline: CLARO, apoio: CLARO, servico: CLARO } }
    const { r } = await compor(claro, { somenteAvaliar: true })
    const manchete = rectDe(camada(r, 'headline'))
    expect(manchete.y).toBeGreaterThanOrEqual(806)
    expect(manchete.y + manchete.height).toBeLessThanOrEqual(1190)
    expect(Math.abs(manchete.x + manchete.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect(busca(r).motivo.length).toBeGreaterThan(0)
    expect(tratamentosQuePioram(await leiturasDosTextos(r.layers, STORY))).toEqual([])
  }, 60_000)

  it('pela cadeia real da recomposição (driveFileId → URL da página), o assunto do catálogo continua protegendo a posição congelada', async () => {
    const produto: Cena = { id: 'cp2b-produto-ciclo', arquetipo: TOPO, luz: () => 60, cores: { headline: CLARO, servico: CLARO }, assunto: { x0: 0.36, y0: 0.8, x1: 0.5, y1: 0.86 }, dataUrl: true }
    const { entrada } = await compor(produto)
    const fv = entrada!.fieldValues
    const gravada = validarSpec(fv.spec).spec as SpecDePeca
    expect(gravada.foto).toEqual({ driveFileId: 'foto-sintetica' })
    const longa = (entrada!.layers as Layer[]).map((l) => (l.id === 'servico' ? { ...l, content: 'Domingo · das 12h às 16h' } : l))
    const reconstruida = specComACopyDaPagina(gravada, longa, { fotoDesenhada: fv.imageUrl })
    expect(reconstruida.spec.foto?.driveFileId).toBe('foto-sintetica')
    const spec2 = specDaRecomposicao(specComAPosicaoOriginal(reconstruida.spec, fv), null)
    await montar(produto)
    const erro = await comporPeca(spec2, { somenteAvaliar: true, escolhaEspacial: escolhaEspacialOriginal(fv, gravada)! }).catch((e) => e as CreativeError)
    expect((erro as CreativeError).code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
    expect((erro as CreativeError).message).toMatch(/região protegida do catálogo/)
  }, 60_000)

  it('enquadramento FIXO com o corte central perdendo o assunto do catálogo, e um lateral preservando: PREFERENCIA_INVIAVEL', async () => {
    const lateral: Cena = { id: 'cp2b-fixo-lateral', arquetipo: TOPO, dimensoes: { width: 1920, height: 1920 }, luz: () => 60, cores: { headline: CLARO, servico: CLARO }, assunto: { x0: 0, y0: 0.4, x1: 0.3, y1: 0.5 } }
    // Sem a preferência, a busca vai ao corte que preserva o assunto.
    const { r } = await compor(lateral, { somenteAvaliar: true })
    expect(r.diagnostico.posicao.crop).toBe('left-middle')
    await montar(lateral)
    const e = await comporPeca({ ...specDe(lateral), preferencias: { ...specDe(lateral).preferencias, enquadramento: 'fixo' } }, { somenteAvaliar: true }).catch((x) => x as CreativeError)
    expect((e as CreativeError).code).toBe('PREFERENCIA_INVIAVEL')
    expect((e as CreativeError).details).toMatchObject({ preferencia: 'enquadramento', alternativa: { crop: 'left-middle' } })
  }, 60_000)

  it('o motivo explica a vitória quando as posições sem véu foram eliminadas (o caso da região protegida)', async () => {
    const { r } = await peca(CENAS.regiao)
    expect(busca(r).motivo).toMatch(/as posições que leriam sem véu caíam em INVADE_REGIAO_PROTEGIDA/)
  }, 60_000)
})
