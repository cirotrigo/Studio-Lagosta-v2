/**
 * CP2B — PROVAS VISUAIS e bateria funcional (só roda com PROVAS_DIR; o CI pula). Para cada cenário sintético, o
 * compositor REAL renderiza (o mesmo `CanvasRenderer` da produção, `provar: true`, sem banco, sem rede, sem Blob):
 * a REFERÊNCIA (a peça como o T1a a faria), a VENCEDORA da busca e, quando útil, a principal REJEITADA — e grava
 * PNG + JSON num diretório temporário, mais um `indice.json` e as medidas de estabilidade, recomposição e tempo.
 *
 *   PROVAS_DIR=/tmp/provas-cp2b npx vitest run src/lib/direcao-de-arte/__tests__/cp2b-provas.test.ts
 *
 * A fonte da página sintética vira Arial (o medidor calibrado a 0,56 do corpo por caractere), para a tinta no PNG
 * bater com a caixa medida.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

import type { Layer } from '@/types/template'
import { assuntoEmPixels, fracaoVisivelDoAssunto } from '@/lib/compositor/assunto-da-foto'
import { comporPeca, type OpcoesDeComposicao, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { escolhaEspacialOriginal, specComACopyDaPagina, specComAPosicaoOriginal } from '@/lib/compositor/defasagem'
import { specDaRecomposicao } from '@/lib/compositor/spec-da-recomposicao'
import type { EscolhaEspacial } from '@/lib/compositor/arquetipos/busca-espacial-tipos'
import { CreativeError } from '@/lib/creatives/errors'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { cenario, medidorCalibrado } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { leiturasDosTextos, textosQueInvadem, tratamentosQuePioram } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const DIR = process.env.PROVAS_DIR ?? ''
const TOPO = 'minimal-fb-topo-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const CANVAS = { width: 1080, height: 1920 }
const ARIAL = medidorCalibrado([{ fontFamily: 'Arial', fontSize: 100, lineHeight: 1, letterSpacing: 0, linhaMaisLonga: 'x'.repeat(10), width: 560 + 2 * PADDING_DE_DESENHO + 2, height: 115, linhas: 1 }])

type Luz = (x: number, y: number) => number
interface Cenario {
  id: string
  titulo: string
  arquetipo: string
  luz: Luz
  dimensoes?: { width: number; height: number }
  cores: { headline: string; apoio?: string; servico: string }
  blocos: Array<{ papel: string; linhas: string[] }>
  /** A região protegida, em frações da FOTO (o campo `assunto` do catálogo). */
  assunto?: { x0: number; y0: number; x1: number; y1: number }
}

const HEADLINE = { papel: 'headline', linhas: ['Almoço', 'de domingo'] }
const APOIO = { papel: 'apoio', linhas: ['com a família toda'] }
const SERVICO = { papel: 'servico', linhas: ['Dom · 12h às 16h'] }
const faixa = (y0: number, y1: number, dentro: number, fora: number): Luz => (_x, y) => (y >= y0 && y < y1 ? dentro : fora)
/**
 * Um "produto" visível na caixa do catálogo (frações da FOTO): listras verticais claras e escuras de 40 px sobre o
 * fundo — no PNG dá para ver onde o corte o corta.
 */
const comProduto = (fundo: number, cx: { x0: number; y0: number; x1: number; y1: number }, W: number, H: number): Luz => (x, y) =>
  x >= cx.x0 * W && x < cx.x1 * W && y >= cx.y0 * H && y < cx.y1 * H ? (Math.floor(x / 40) % 2 === 0 ? 220 : 110) : fundo
const PRODUTO_LATERAL = { x0: 0, y0: 0.4, x1: 0.3, y1: 0.5 }
const PRODUTO_LARGO = { x0: 0.05, y0: 0.35, x1: 0.95, y1: 0.65 }
/** Textura forte e determinística (±30) sobre uma base escura. */
const texturaEscura = (x: number, y: number) => 50 + ((Math.imul(x, 7) + Math.imul(y, 13) + ((x >> 3) ^ (y >> 3)) * 17) % 61) - 30

const CENARIOS: Cenario[] = [
  { id: 'a-referencia-boa', titulo: 'A. Referência já boa', arquetipo: TOPO, luz: () => 45, cores: { headline: CLARO, apoio: CLARO, servico: CLARO }, blocos: [HEADLINE, APOIO, SERVICO] },
  { id: 'b-referencia-ruim', titulo: 'B. Referência ruim, alternativa boa na zona', arquetipo: TOPO, luz: faixa(1382, 1530, 50, 205), cores: { headline: ESCURO, servico: CLARO }, blocos: [HEADLINE, SERVICO] },
  { id: 'c-polaridades', titulo: 'C. Polaridades diferentes (caso H)', arquetipo: TOPO, luz: (_x, y) => (y < 960 ? 205 : 55), cores: { headline: ESCURO, apoio: ESCURO, servico: CLARO }, blocos: [HEADLINE, APOIO, SERVICO] },
  {
    id: 'd-tratamento-evitavel',
    titulo: 'D. Tratamento evitável (sem véu vence, mesmo menos calma)',
    arquetipo: TOPO,
    luz: (x, y) => (y >= 1382 && y < 1530 ? texturaEscura(x, y) : 205),
    cores: { headline: ESCURO, servico: CLARO },
    blocos: [HEADLINE, SERVICO],
  },
  {
    id: 'e-regiao-protegida',
    titulo: 'E. Região protegida (calma, mas é o assunto)',
    arquetipo: TOPO,
    luz: faixa(1382, 1530, 50, 205),
    cores: { headline: ESCURO, servico: CLARO },
    blocos: [HEADLINE, SERVICO],
    assunto: { x0: 0, y0: 1382 / 1920, x1: 0.75, y1: 1530 / 1920 },
  },
  {
    id: 'f-sem-solucao',
    titulo: 'F. Sem solução (polaridades opostas na mesma borda, em toda posição)',
    arquetipo: CENTRO,
    luz: (_x, y) => (y < 1400 ? 50 : 210),
    cores: { headline: CLARO, apoio: ESCURO, servico: CLARO },
    blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Sex · 20h'] }],
  },
  {
    id: 'g-corte',
    titulo: 'G. Corte lateral abre leitura melhor que o central',
    arquetipo: TOPO,
    luz: (x, y) => (x < 700 && y > 1300 ? 50 : 205),
    dimensoes: { width: 1920, height: 1920 },
    cores: { headline: ESCURO, servico: CLARO },
    blocos: [HEADLINE, SERVICO],
  },
  {
    id: 'h-centro-optico',
    titulo: 'H. Centro óptico (fica na zona central)',
    arquetipo: CENTRO,
    luz: faixa(1000, 1400, 50, 205),
    cores: { headline: CLARO, apoio: CLARO, servico: ESCURO },
    blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Sex · 20h'] }],
  },
  // Ajuste final (o owner): o Caso A do pedido original (teste 11) e o assunto do CATÁLOGO como restrição dura.
  {
    id: 'i-caso-a',
    titulo: 'I. Caso A (centro-óptico: o apoio escuro não lê na referência e o véu pioraria; a faixa {headline, apoio} desce até o claro)',
    arquetipo: CENTRO,
    luz: (_x, y) => (y < 1150 ? 55 : y < 1450 ? 205 : 55),
    cores: { headline: CLARO, apoio: ESCURO, servico: CLARO },
    blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, SERVICO],
    assunto: { x0: 0, y0: 0, x1: 0.15, y1: 0.08 },
  },
  {
    id: 'j-corte-preserva-o-produto',
    titulo: 'J. Produto do catálogo à esquerda: o corte central o perde, o da esquerda preserva e vence',
    arquetipo: TOPO,
    luz: comProduto(60, PRODUTO_LATERAL, 1920, 1920),
    dimensoes: { width: 1920, height: 1920 },
    cores: { headline: CLARO, servico: CLARO },
    blocos: [HEADLINE, SERVICO],
    assunto: PRODUTO_LATERAL,
  },
  {
    id: 'k-nenhum-corte-preserva',
    titulo: 'K. Produto do catálogo largo numa foto 4:3: nenhum corte do story preserva 75% — recusa, nenhuma peça',
    arquetipo: TOPO,
    luz: comProduto(60, PRODUTO_LARGO, 1920, 1440),
    dimensoes: { width: 1920, height: 1440 },
    cores: { headline: CLARO, servico: CLARO },
    blocos: [HEADLINE, SERVICO],
    assunto: PRODUTO_LARGO,
  },
]

/**
 * Os 3 cortes da foto lado a lado, com a caixa do catálogo em vermelho (na geometria do compositor, `assuntoEmPixels`)
 * e a fração visível — para VER que o corte corta o produto. A caixa tem de cair sobre as listras: é a conferência
 * de que a geometria do compositor e o recorte do PNG concordam.
 */
async function provarCortes(c: Cenario) {
  const foto = await fotoSintetica(c.luz, c.dimensoes)
  const dimensoes = c.dimensoes ?? CANVAS
  const quadros: Buffer[] = []
  const medidas: Array<{ crop: string; visivel: number }> = []
  for (const [crop, posicao] of [['left-middle', 'left'], ['center-middle', 'centre'], ['right-middle', 'right']] as const) {
    const r = assuntoEmPixels(c.assunto!, dimensoes, CANVAS, crop)
    const visivel = Math.round(fracaoVisivelDoAssunto(r, CANVAS) * 100)
    medidas.push({ crop, visivel })
    const svg = `<svg width="${CANVAS.width}" height="${CANVAS.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff2d2d" stroke-width="12"/><text x="40" y="130" font-size="80" font-family="Arial" fill="#ff2d2d">${crop}: ${visivel}%</text></svg>`
    const recorte = await sharp(foto).resize(CANVAS.width, CANVAS.height, { fit: 'cover', position: posicao }).toColourspace('srgb').png().toBuffer()
    const marcado = await sharp(recorte).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
    quadros.push(await sharp(marcado).resize(360, 640).png().toBuffer())
  }
  const tira = await sharp({ create: { width: 3 * 360 + 2 * 20, height: 640, channels: 3, background: '#ffffff' } })
    .composite(quadros.map((q, i) => ({ input: q, left: i * 380, top: 0 })))
    .png()
    .toBuffer()
  writeFileSync(join(DIR, `${c.id}-0-cortes.png`), tira)
  return medidas
}

const emArial = (l: Layer): Layer => (l.type === 'text' && l.style ? { ...l, style: { ...l.style, fontFamily: 'Arial' } } : l)

async function montar(c: Cenario) {
  const foto = await fotoSintetica(c.luz, c.dimensoes)
  const pagina = paginaSintetica({
    id: c.id,
    headline: { cor: c.cores.headline },
    ...(c.cores.apoio ? { apoio: { cor: c.cores.apoio } } : {}),
    servico: { cor: c.cores.servico },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const comArial = { ...pagina, layers: pagina.layers.map(emArial) }
  const base = await cenarioSintetico({ pagina: comArial, foto, candidatasDoVeu: [], ...(c.assunto ? { assunto: c.assunto } : {}) })
  cenario.atual = { ...base, medidor: ARIAL, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
  return { ...specSintetica({ pagina: c.id, blocos: c.blocos }), arquetipo: { id: c.arquetipo } }
}

const caixa = (r: ResultadoDaComposicao, id: string) => {
  const l = r.layers.find((x) => x.id === id)
  return l ? { x: Math.round(l.position.x), y: Math.round(l.position.y), w: Math.round(l.size.width), h: Math.round(l.size.height) } : null
}
const posicoes = (r: ResultadoDaComposicao) => Object.fromEntries(['pre', 'headline', 'apoio', 'servico', 'logo'].flatMap((id) => (caixa(r, id) ? [[id, caixa(r, id)]] : [])))
const gradientes = (r: ResultadoDaComposicao) => r.layers.filter((l) => (l.metadata as { borda?: string } | undefined)?.borda).map((l) => l.id)

async function provar(nome: string, spec: Record<string, unknown>, opcoes: OpcoesDeComposicao = {}) {
  const r = await comporPeca(spec, { ...opcoes, provar: true })
  writeFileSync(join(DIR, `${nome}.png`), r.prova!)
  const d = r.diagnostico
  writeFileSync(
    join(DIR, `${nome}.json`),
    JSON.stringify({ posicoes: posicoes(r), crop: d.posicao.crop, gradientes: gradientes(r), tratamento: d.tratamentoDeLeitura?.map((t) => ({ borda: t.borda, estado: t.estado, forca: t.forca })), arquetipo: d.arquetipo, avisos: d.avisos }, null, 2),
  )
  return r
}

const indice: Array<Record<string, unknown>> = []

describe.runIf(DIR)('CP2B · provas visuais e bateria funcional', () => {
  beforeAll(() => mkdirSync(DIR, { recursive: true }))
  afterAll(() => writeFileSync(join(DIR, 'indice.json'), JSON.stringify(indice, null, 2)))

  for (const c of CENARIOS) {
    it(c.titulo, async () => {
      const spec = await montar(c)
      // A referência: a peça do T1a (referência + corte central), pela reprodução da escolha `referencia`.
      const ref = await provar(`${c.id}-1-referencia`, spec, { escolhaEspacial: { modo: 'referencia' } })
      let vencedora: ResultadoDaComposicao | null = null
      let recusa: CreativeError | null = null
      const t0 = performance.now()
      try {
        vencedora = await provar(`${c.id}-2-vencedora`, spec)
      } catch (e) {
        if (!(e instanceof CreativeError)) throw e
        recusa = e
        writeFileSync(join(DIR, `${c.id}-2-recusa.json`), JSON.stringify({ code: e.code, message: e.message, details: e.details }, null, 2))
      }
      const ms = Math.round(performance.now() - t0)
      const busca = vencedora?.diagnostico.arquetipo?.buscaEspacial
      // A principal rejeitada que vale mostrar: a alternativa relevante que NÃO é a referência central (essa já tem PNG).
      const rejeitada = busca?.alternativas.find((a) => !(a.crop === 'center-middle' && a.escolhas.every((e) => e.dy === 0)))
      if (rejeitada) {
        const escolha: EscolhaEspacial = { modo: 'busca-espacial-v1', foto: busca!.escolha.foto, corte: rejeitada.crop, deslocamentos: Object.fromEntries(rejeitada.escolhas.flatMap((e) => busca!.faixas[e.faixa].membros.map((m) => [m, e.dy]))) }
        await provar(`${c.id}-3-rejeitada`, spec, { escolhaEspacial: escolha })
      }
      // A primeira ELIMINADA (quando há): o que a busca descartou antes de pontuar — renderizada para conferir o motivo.
      const eliminada = busca?.exemplosDeRecusa[0]
      if (eliminada) {
        const escolha: EscolhaEspacial = { modo: 'busca-espacial-v1', foto: busca!.escolha.foto, corte: eliminada.crop, deslocamentos: Object.fromEntries(eliminada.escolhas.flatMap((e) => busca!.faixas[e.faixa].membros.map((m) => [m, e.dy]))) }
        // A reprodução RECUSA a posição que invade a região do catálogo (como deve): para ver a eliminada, ela é desenhada
        // sem a caixa do catálogo — a mesma foto, a mesma posição.
        if (c.assunto) await montar({ ...c, assunto: undefined })
        await provar(`${c.id}-4-eliminada`, spec, { escolhaEspacial: escolha })
        if (c.assunto) await montar(c)
      }
      const cortesDoProduto = c.assunto && c.dimensoes ? await provarCortes(c) : null
      const leituras = vencedora ? await leiturasDosTextos(vencedora.layers, CANVAS) : null
      const regiaoPx = c.assunto ? { x: c.assunto.x0 * 1080, y: c.assunto.y0 * 1920, width: (c.assunto.x1 - c.assunto.x0) * 1080, height: (c.assunto.y1 - c.assunto.y0) * 1920 } : null
      indice.push({
        cenario: c.titulo,
        arquivo: c.id,
        referencia: { posicoes: posicoes(ref), crop: ref.diagnostico.posicao.crop, gradientes: gradientes(ref), tratamento: ref.diagnostico.tratamentoDeLeitura?.map((t) => `${t.borda}:${t.estado}`) },
        escolhida: vencedora
          ? {
              posicoes: posicoes(vencedora),
              crop: vencedora.diagnostico.posicao.crop,
              escolhas: busca?.vencedor?.escolhas,
              gradientes: gradientes(vencedora),
              tratamento: vencedora.diagnostico.tratamentoDeLeitura?.map((t) => `${t.borda}:${t.estado}`),
              tratamentoEstimado: busca?.vencedor?.tratamento.map((t) => `${t.borda}:${t.estado}${t.forca ? `@${t.forca}` : ''}`),
              componentes: busca?.vencedor?.componentes,
              motivo: busca?.motivo,
              combinacoesAvaliadas: busca?.combinacoesAvaliadas,
              cortesAvaliados: busca?.cortesAvaliados,
              recusas: busca?.recusas,
              pioras: leituras ? tratamentosQuePioram(leituras) : null,
              invasoes: regiaoPx ? textosQueInvadem(vencedora.layers, regiaoPx) : null,
            }
          : null,
        recusa: recusa ? { code: recusa.code, motivo: (recusa.details as { motivo?: string })?.motivo, combinacoesAvaliadas: (recusa.details as { combinacoesAvaliadas?: number })?.combinacoesAvaliadas, recusas: (recusa.details as { recusas?: unknown })?.recusas } : null,
        eliminada: eliminada ? { crop: eliminada.crop, escolhas: eliminada.escolhas, motivos: eliminada.eliminada.map((e) => `${e.motivo}: ${e.detalhe}`) } : null,
        rejeitada: rejeitada ? { crop: rejeitada.crop, escolhas: rejeitada.escolhas, eliminada: rejeitada.eliminada.map((e) => e.motivo), componentes: rejeitada.componentes, tratamento: rejeitada.tratamento.map((t) => `${t.borda}:${t.estado}${t.forca ? `@${t.forca}` : ''}`) } : null,
        tempoDaComposicaoMs: ms,
        ...(cortesDoProduto ? { assuntoVisivelPorCorte: cortesDoProduto } : {}),
      })
      expect(vencedora || recusa).toBeTruthy()
    }, 120_000)
  }

  it('estabilidade: a mesma entrada 5 vezes dá o mesmo corte, as mesmas posições, o mesmo vencedor e o mesmo diagnóstico', async () => {
    const spec = await montar(CENARIOS[1])
    const vistas = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const r = await comporPeca(spec, { somenteAvaliar: true })
      const b = r.diagnostico.arquetipo!.buscaEspacial!
      vistas.add(JSON.stringify({ posicoes: posicoes(r), crop: r.diagnostico.posicao.crop, id: b.id, vencedor: b.vencedor, motivo: b.motivo }))
    }
    indice.push({ estabilidade: { execucoes: 5, resultadosDistintos: vistas.size } })
    expect(vistas.size).toBe(1)
  }, 120_000)

  it('desempenho: o pior caso (centro-óptico, foto larga: 3 cortes × 25) e o custo da busca contra a referência sem busca', async () => {
    const pior: Cenario = { ...CENARIOS[7], id: 'desempenho-pior', dimensoes: { width: 1920, height: 1920 } }
    const medidas: Array<Record<string, unknown>> = []
    for (const c of [pior, CENARIOS[1], CENARIOS[6]]) {
      const spec = await montar(c)
      await comporPeca(spec, { somenteAvaliar: true }) // aquece
      const t = (async (opcoes: OpcoesDeComposicao) => {
        const tempos: number[] = []
        let r: ResultadoDaComposicao | null = null
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now()
          r = await comporPeca(spec, { somenteAvaliar: true, ...opcoes })
          tempos.push(performance.now() - t0)
        }
        return { ms: Math.round(tempos.sort((a, b) => a - b)[1]), r: r! }
      })
      const comBusca = await t({})
      const semBusca = await t({ escolhaEspacial: { modo: 'referencia' } })
      const b = comBusca.r.diagnostico.arquetipo!.buscaEspacial!
      medidas.push({
        cenario: c.id,
        cortes: b.cortesAvaliados.length,
        candidatosPorFaixa: b.faixas.map((f) => f.candidatos.length),
        combinacoesAvaliadas: b.combinacoesAvaliadas,
        limite: b.limite,
        compondoComBuscaMs: comBusca.ms,
        compondoNaReferenciaMs: semBusca.ms,
        custoDaBuscaMs: comBusca.ms - semBusca.ms,
      })
      expect(b.combinacoesAvaliadas).toBeLessThanOrEqual(75)
    }
    indice.push({ desempenho: medidas })
  }, 180_000)

  it('recomposição: uma palavra a mais reproduz a posição; a copy que não cabe na posição congelada é recusada', async () => {
    // A manchete de UMA linha desce ao "abaixo" da faixa (o claro entre 500 e 660 é o único lugar onde a escura lê).
    const c: Cenario = {
      id: 'recomposicao',
      titulo: 'recomposição',
      arquetipo: TOPO,
      luz: (_x, y) => (y >= 500 && y < 660 ? 205 : 50),
      cores: { headline: ESCURO, servico: CLARO },
      blocos: [{ papel: 'headline', linhas: ['Domingo'] }, SERVICO],
    }
    const spec = await montar(c)
    const r1 = await comporPeca(spec, { autor: 'u-fixture' })
    const fv = cap.entradas.at(-1)!.fieldValues
    const gravada = fv.spec
    const escolha = escolhaEspacialOriginal(fv, gravada)
    const recompor = async (camadas: Layer[]) =>
      comporPeca(specDaRecomposicao(specComAPosicaoOriginal(specComACopyDaPagina(gravada, camadas).spec, fv), null), { provar: true, escolhaEspacial: escolha! })
    writeFileSync(join(DIR, 'recomposicao-1-original.png'), (await comporPeca(spec, { provar: true })).prova!)
    const r2 = await recompor(r1.layers.map((l) => (l.id === 'servico' ? { ...l, content: 'Dom · 12h às 16h30' } : l)))
    writeFileSync(join(DIR, 'recomposicao-2-uma-palavra.png'), r2.prova!)
    const b1 = r1.diagnostico.arquetipo!.buscaEspacial!
    const b2 = r2.diagnostico.arquetipo!.buscaEspacial!
    // A manchete em DUAS linhas: na referência caberia, na posição congelada (231 px abaixo) passa da zona.
    let recusa: CreativeError | null = null
    try {
      await recompor(r1.layers.map((l) => (l.id === 'headline' ? { ...l, content: 'Almoço de\ndomingo' } : l)))
    } catch (e) {
      recusa = e as CreativeError
    }
    indice.push({
      recomposicao: {
        escolhaGravada: { ...b1.escolha, foto: '(a URL do fundo)' },
        mesmoId: b1.id === b2.id,
        reproduzida: b2.reproduzida,
        mesmoCorte: r1.diagnostico.posicao.crop === r2.diagnostico.posicao.crop,
        yAntes: posicoes(r1),
        yDepois: posicoes(r2),
        arquetipo: [r2.diagnostico.arquetipo!.id, r2.diagnostico.arquetipo!.versao, r2.diagnostico.arquetipo!.impressao],
        copyQueNaoCabe: recusa ? { code: recusa.code, message: recusa.message } : 'COMPÔS (esperado: recusa)',
      },
    })
    expect(b1.escolha.deslocamentos.headline).toBeGreaterThan(0)
    expect(b2.reproduzida?.de).toBe(b1.id)
    // As MESMAS posições (x, y); a largura do serviço cresce com a palavra a mais.
    const xy = (r: ResultadoDaComposicao) => Object.fromEntries(Object.entries(posicoes(r)).map(([k, v]) => [k, { x: v!.x, y: v!.y }]))
    expect(xy(r2)).toEqual(xy(r1))
    expect(recusa?.code).toBe('ARQUETIPO_POSICAO_CONGELADA_NAO_CABE')
  }, 120_000)
})
