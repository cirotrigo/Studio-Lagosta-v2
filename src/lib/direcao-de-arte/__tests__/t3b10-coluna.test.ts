/**
 * #10 `minimal-coluna-foto@1` / `minimal-coluna-foto-esquerda@1` (IH, 25/10/2026) no COMPOSITOR e no MEDIDOR reais,
 * com o CATÁLOGO REAL (nenhum mock do catálogo) e a Montserrat DO REPO (`cenario-10.ts`). Prova R-08: a peça composta
 * reproduz as amostras v2 aceitas no G-A10 (receipt ACEITE-VISUAL-OWNER.json, "Aprovar os dois lados, com o fio") —
 * corpos, conteúdo e quebras iguais; caixa da foto exata; liso igual; caixas de TINTA dos textos, da logo e do fio ±2 px
 * em x/y/largura/altura; caixas do MOTOR ±2 px em x, y e altura, com a LARGURA pela regra justa do produto
 * (`min(coluna, ceil(maior)) + 14` = 470/427/351 — os 469,8 das amostras são largura FIXA da fixture visual, nunca alvo).
 * As 4 claras com fio são o alvo do PNG; a D-story-escuro (5ª aceita) entra só na medida de tinta. O PNG é gravado se
 * `IH10_PROVAS_DIR` estiver definido e o diff de pixel contra as amostras (lidas de `IH10_AMOSTRAS_DIR`) é só
 * informativo. Dublados: banco, Blob, fontes do projeto, autofix, acervo; a foto vem pelo dublê do fetch. Marca
 * sintética — não é aceite de marca real.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', async () => {
  const { cenario: c, mockDoBanco } = await import('./suporte/compositor')
  const base = mockDoBanco().db as Record<string, any>
  return {
    db: {
      ...base,
      project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Montserrat', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
      page: {
        ...base.page,
        findMany: async (args?: { where?: { id?: { in?: string[]; not?: string } } }) =>
          c.atual!.paginasDeAssinatura.filter((p) => (!args?.where?.id?.in || args.where.id.in.includes(p.id)) && (!args?.where?.id?.not || p.id !== args.where.id.not)),
      },
      fontCombination: { findMany: async () => [] },
    },
  }
})
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { gateDaMedida } from '@/lib/creatives/revisao/gate'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { medida as medidaDoGate } from '@/lib/creatives/revisao/__tests__/suporte/corpus-do-gate'
import { CanvasRenderer } from '@/lib/canvas-renderer'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { CLARO_10, CORPOS_10, COPY_10, ESCURO_10, PROJETO_10, cenario10, copy10, idDoLado, medidorComAsFontesDoRepo, paginaDoCenario10, spec10, type Formato10, type Lado10, type Liso10 } from './suporte/cenario-10'

let medidor: Awaited<ReturnType<typeof medidorComAsFontesDoRepo>> | null = null
const medir = async () => (medidor ??= await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer')))

type R = { x: number; y: number; width: number; height: number }
type Textos = 'headline' | 'apoio' | 'servico'
const TEXTOS = ['headline', 'apoio', 'servico'] as const
/**
 * O ALVO, das amostras v2 aceitas (`cp-t3-b-10-amostras/pecas/v2/<peça>.json`, campos `papeis.*.caixaDoMotorPx`,
 * `papeis.logo.caixaPx`, `fioPx.rect`, `caixasDeTintaPx`, `fotoPx`, `pngSha256`; copiados aqui — o teste não importa
 * nada de `human-output`). `motor` = x, y e altura (a largura não é alvo: é a da regra justa).
 */
type Alvo = { sha: string; motor: Record<Textos, { x: number; y: number; height: number }>; logo: R; fio: R; foto: R; tinta: Record<Textos | 'logo' | 'fio', R> }
const motor = (x: number, ys: [number, number, number]) => ({ headline: { x, y: ys[0], height: 240 }, apoio: { x, y: ys[1], height: 108 }, servico: { x, y: ys[2], height: 48 } })
const tintaTextos = (dx: number, ys: [number, number, number], larguraDaManchete: number) => ({
  headline: { x: 99 + dx, y: ys[0], width: larguraDaManchete, height: 218 },
  apoio: { x: 101 + dx, y: ys[1], width: 408, height: 85 },
  servico: { x: 97 + dx, y: ys[2], width: 335, height: 23 },
})
// Pilha (29/10/2026): o serviço encosta no apoio com o gap da marca (apoio + 108 + 14) — era a referência solta 1574,4 / 1107.
const STORY_Y: [number, number, number] = [297.6, 1190.4, 1312.4]
const FEED_Y: [number, number, number] = [222.8, 810, 932]
const ALVO: Record<string, Alvo> = {
  'D-story-claro-fio': {
    sha: '9cc1305693540fd6573481c9676c964598d11c42d89f844bd17616db68c986f3',
    motor: motor(91.8, STORY_Y),
    logo: { x: 91.8, y: 201.6, width: 134.4, height: 67.2 },
    fio: { x: 98, y: 547, width: 194, height: 4 },
    foto: { x: 621, y: 0, width: 459, height: 1920 },
    tinta: { ...tintaTextos(0, [305, 1206, 1324], 453), fio: { x: 97, y: 548, width: 196, height: 2 }, logo: { x: 96, y: 205, width: 122, height: 61 } },
  },
  'D-feed-claro-fio': {
    sha: 'f53a5f76f4800f8fe11e82a06d757ba1ddd3a74612fd395f25e45620ee24f6ec',
    motor: motor(91.8, FEED_Y),
    logo: { x: 91.8, y: 135, width: 94.5, height: 47.3 },
    fio: { x: 98, y: 470, width: 194, height: 4 },
    foto: { x: 621, y: 0, width: 459, height: 1350 },
    tinta: { ...tintaTextos(0, [230, 826, 944], 453), fio: { x: 97, y: 471, width: 196, height: 2 }, logo: { x: 94, y: 138, width: 87, height: 42 } },
  },
  'E-story-claro-fio': {
    sha: '8ebe9e4a3a668498802c522c4d77fb8f5460ee819d94b7f0754c7dcbe93119f1',
    motor: motor(518.4, STORY_Y),
    logo: { x: 853.8, y: 201.6, width: 134.4, height: 67.2 },
    fio: { x: 524, y: 547, width: 194, height: 4 },
    foto: { x: 0, y: 0, width: 459, height: 1920 },
    tinta: { ...tintaTextos(427, [305, 1206, 1324], 452), fio: { x: 523, y: 548, width: 196, height: 2 }, logo: { x: 858, y: 205, width: 122, height: 61 } },
  },
  'E-feed-claro-fio': {
    sha: 'cbf2fe52f9860303493506c9f0d0048c26d35da2ea015f32782842aea6138ccf',
    motor: motor(518.4, FEED_Y),
    logo: { x: 893.7, y: 135, width: 94.5, height: 47.3 },
    fio: { x: 524, y: 470, width: 194, height: 4 },
    foto: { x: 0, y: 0, width: 459, height: 1350 },
    tinta: { ...tintaTextos(427, [230, 826, 944], 452), fio: { x: 523, y: 471, width: 196, height: 2 }, logo: { x: 896, y: 138, width: 87, height: 42 } },
  },
  'D-story-escuro-fio': {
    sha: '61088ec77f479cd0bd8647b5bca2be95c71db1f88e8bead08ff0c10b3fc56aeb',
    motor: motor(91.8, STORY_Y),
    logo: { x: 91.8, y: 201.6, width: 134.4, height: 67.2 },
    fio: { x: 98, y: 547, width: 194, height: 4 },
    foto: { x: 621, y: 0, width: 459, height: 1920 },
    tinta: { ...tintaTextos(0, [305, 1206, 1324], 453), fio: { x: 97, y: 548, width: 196, height: 2 }, logo: { x: 96, y: 205, width: 122, height: 61 } },
  },
}
/** A largura da caixa do motor pela regra justa: `min(456, ceil(maior linha)) + 14` (CT-08 mediu 456 / 413 / 337). */
const LARGURA_JUSTA: Record<Textos, number> = { headline: 470, apoio: 427, servico: 351 }
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const LIMIAR_DE_TINTA = 16

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const fioDe = (r: ResultadoDaComposicao) => r.layers.filter((l) => /fio/.test(l.id))
const linhasDe = (l: Layer) => String(l.content ?? '').split('\n')

async function pixels(png: Buffer) {
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data }
}
const render = (layers: Layer[], formato: Formato10, fundo: string) =>
  new CanvasRenderer(CANVAS[formato].width, CANVAS[formato].height).renderDesign({ canvas: { ...CANVAS[formato], backgroundColor: fundo }, layers } as never)

/** A caixa de TINTA: a diferença (> 16 num canal) entre a peça e a mesma peça sem a camada, na tela inteira (o método das amostras). */
async function caixaDeTinta(cheia: Awaited<ReturnType<typeof pixels>>, layers: Layer[], id: string, formato: Formato10, fundo: string): Promise<R> {
  const sem = await pixels(await render(layers.filter((l) => l.id !== id), formato, fundo))
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1]
  for (let y = 0; y < cheia.h; y++) {
    for (let x = 0; x < cheia.w; x++) {
      const i = (y * cheia.w + x) * 4
      if (Math.max(Math.abs(cheia.d[i] - sem.d[i]), Math.abs(cheia.d[i + 1] - sem.d[i + 1]), Math.abs(cheia.d[i + 2] - sem.d[i + 2])) > LIMIAR_DE_TINTA) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    }
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
const perto = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol
async function recusaDe(p: Promise<unknown>): Promise<{ code?: string; message: string; details?: any }> {
  try {
    await p
  } catch (e) {
    return e as { code?: string; message: string }
  }
  throw new Error('não recusou')
}

const medidas: Record<string, unknown> = {}
const gravarMedidas = () => {
  if (!process.env.IH10_PROVAS_DIR) return
  mkdirSync(process.env.IH10_PROVAS_DIR, { recursive: true })
  writeFileSync(join(process.env.IH10_PROVAS_DIR, 'medidas.json'), JSON.stringify(medidas, null, 2))
}

describe('#10 · R-08 no compositor real: as 5 peças aceitas (4 claras com fio no PNG, a escura só na tinta)', () => {
  const PECAS: Array<[Lado10, Formato10, Liso10]> = [
    ['D', 'story', 'claro'],
    ['D', 'feed', 'claro'],
    ['E', 'story', 'claro'],
    ['E', 'feed', 'claro'],
    ['D', 'story', 'escuro'],
  ]
  for (const [lado, formato, liso] of PECAS) {
    const nome = `${lado}-${formato}-${liso}-fio`
    it(`R-01–R-04/R-06/R-08 ${nome}: corpos/conteúdo/quebras, foto na caixa, liso, motor (largura justa), tinta, logo e fio contra a amostra; medir = compor`, async () => {
      cenario.atual = await cenario10(liso, await medir())
      const s = spec10(formato, lado, liso)
      const antes = cap.entradas.length
      const r = await comporPeca(s, { autor: 'u-fixture' })
      const entrada = cap.entradas.length > antes ? cap.entradas.at(-1)! : null
      const fundo = liso === 'claro' ? CLARO_10 : ESCURO_10
      const alvo = ALVO[nome]
      const id = idDoLado(lado)

      // R-02: o liso = Page.background (o papel pelo produto, `papelDoBloco`).
      expect([r.fundo, entrada?.background, r.diagnostico.papelDoFundo?.papel]).toEqual([fundo, fundo, liso])
      expect(entrada!.fieldValues.composicao.arquetipo).toMatchObject({ id, versao: 1 })
      // Conteúdo, quebras LITERAIS e os corpos 80/40/30, sem a escada descer.
      expect(r.layers.filter((l) => l.type === 'text' || l.type === 'rich-text').map((l) => l.id).sort()).toEqual(['apoio', 'headline', 'servico'])
      for (const p of TEXTOS) {
        expect([p, linhasDe(camada(r, p))]).toEqual([p, COPY_10[p]])
        expect([p, Number(camada(r, p).style?.fontSize)]).toEqual([p, CORPOS_10[p]])
      }
      const m = await medir()
      for (const p of TEXTOS) expect([p, m(camada(r, p)).lineCount]).toEqual([p, COPY_10[p].length])

      // R-01: a foto na caixa exata, cover, central (sem catálogo); a ampliação dita no diagnóstico.
      const bg = camada(r, 'bg-foto')
      const style = bg.style as Record<string, any>
      expect([bg.position.x, bg.position.y, bg.size.width, bg.size.height]).toEqual([alvo.foto.x, alvo.foto.y, alvo.foto.width, alvo.foto.height])
      expect([style.objectFit, style.cropPosition, style.mask]).toEqual(['cover', 'center-middle', undefined])
      expect(r.diagnostico.foto).toMatchObject({ corte: 'center-middle', assuntoVisivel: null })
      expect(r.diagnostico.foto!.escala).toBeCloseTo(CANVAS[formato].height / 1024, 3)

      // Motor: x, y e altura ±2; a largura EXATA da regra justa, dentro da referência e da zona (e fora da foto).
      const motorPx: Record<string, R> = {}
      const def = verArquetipo(id, 1)!
      for (const p of TEXTOS) {
        const l = camada(r, p)
        motorPx[p] = { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }
        expect([p, perto(l.position.x, alvo.motor[p].x), perto(l.position.y, alvo.motor[p].y), perto(l.size.height, alvo.motor[p].height), l.size.width], JSON.stringify(motorPx[p])).toEqual([p, true, true, true, LARGURA_JUSTA[p]])
        const pos = def.formatos[formato].papeis[p] as { referencia: { x: number; w: number }; zona: { xMax: number } }
        expect(l.position.x + l.size.width, `${p}: cabe na referência`).toBeLessThanOrEqual((pos.referencia.x + pos.referencia.w) * 1080 + 0.5)
        expect(l.position.x + l.size.width, `${p}: cabe na zona`).toBeLessThanOrEqual(pos.zona.xMax * 1080 + 0.5)
        expect(lado === 'D' ? l.position.x + l.size.width <= 621 : l.position.x >= 459, `${p}: fora da foto`).toBe(true)
      }
      // R-03: a logo ±2 (rente ao canto de fora), ≥ 24 px acima da manchete.
      const logo = camada(r, 'logo')
      expect([perto(logo.position.x, alvo.logo.x), perto(logo.position.y, alvo.logo.y), perto(logo.size.width, alvo.logo.width), perto(logo.size.height, alvo.logo.height)], JSON.stringify([logo.position, logo.size])).toEqual([true, true, true, true])
      expect(camada(r, 'headline').position.y - (logo.position.y + logo.size.height)).toBeGreaterThanOrEqual(24)
      // R-04: o fio presente, sob a manchete, na cor da manchete; fio − camada da manchete igual nos dois lados (6 px).
      const fios = fioDe(r)
      expect(fios.map((l) => l.id), r.layers.map((l) => l.id).join(',')).toHaveLength(1)
      const fio = fios[0]
      expect(fio.position.x - camada(r, 'headline').position.x).toBeCloseTo(6, 6)
      expect(fio.position.y).toBeGreaterThan(camada(r, 'headline').position.y + camada(r, 'headline').size.height)
      const fioRect = { x: fio.position.x, y: fio.position.y, width: fio.size.width, height: fio.size.height }
      expect([perto(fioRect.x, alvo.fio.x), perto(fioRect.y, alvo.fio.y), perto(fioRect.width, alvo.fio.width), perto(fioRect.height, alvo.fio.height)], JSON.stringify(fioRect)).toEqual([true, true, true, true])
      expect(r.diagnostico.avisos.filter((a) => /acento fio/.test(a))).toEqual([])

      // Tinta (render real da peça, a mesma régua das amostras): ±2 px em x, y, largura e altura.
      const png = r.prova ?? (await render(r.layers, formato, fundo))
      const cheia = await pixels(png)
      const tinta: Record<string, R> = {}
      for (const p of [...TEXTOS, 'logo', 'fio'] as const) {
        const t = await caixaDeTinta(cheia, r.layers, p === 'fio' ? fio.id : p, formato, fundo)
        tinta[p] = t
        const a = alvo.tinta[p]
        expect([p, perto(t.x, a.x), perto(t.y, a.y), perto(t.width, a.width), perto(t.height, a.height)], `${p} tinta ${JSON.stringify(t)} × ${JSON.stringify(a)}`).toEqual([p, true, true, true, true])
      }
      // O liso fora da caixa e a foto dentro.
      const corDe = (x: number, y: number) => {
        const i = (y * cheia.w + x) * 4
        return `#${[0, 1, 2].map((k) => cheia.d[i + k].toString(16).padStart(2, '0')).join('')}`.toUpperCase()
      }
      const [xLiso, xFoto] = lado === 'D' ? [40, 850] : [1040, 230]
      expect(corDe(xLiso, CANVAS[formato].height - 30)).toBe(fundo)
      expect(corDe(xFoto, Math.round(CANVAS[formato].height / 2))).not.toBe(fundo)

      // R-06: o medir-copy, no mesmo contexto, mede igual (posições e fundo), sem recusa.
      const mc = await medirCopyDoProjeto({ projectId: PROJETO_10, formato, copyAutoral: s.copyAutoral, fotoUrl: s.foto.url, variante: s.preferencias.variante, arquetipo: s.arquetipo } as never)
      expect([mc.fundo, mc.medicao.cabeTudo]).toEqual([fundo, true])
      for (const p of [...TEXTOS, 'logo'] as const) {
        const pos = mc.medicao.arquetipo!.posicoes![p]!.posicao
        const l = camada(r, p)
        expect([p, Math.round(pos.x), Math.round(pos.y)]).toEqual([p, Math.round(l.position.x), Math.round(l.position.y)])
      }

      // Provas (informativas): o PNG (só as 4 claras) e o diff de pixel contra a amostra.
      const pngSha256 = createHash('sha256').update(png).digest('hex')
      let diff: Record<string, unknown> | null = null
      const amostra = process.env.IH10_AMOSTRAS_DIR ? join(process.env.IH10_AMOSTRAS_DIR, `${nome}.png`) : null
      if (amostra && existsSync(amostra)) {
        const bytes = readFileSync(amostra)
        const ref = await pixels(bytes)
        let diferentes = 0
        let acima32 = 0
        for (let i = 0; i < ref.d.length; i += 4) {
          const d = Math.max(Math.abs(ref.d[i] - cheia.d[i]), Math.abs(ref.d[i + 1] - cheia.d[i + 1]), Math.abs(ref.d[i + 2] - cheia.d[i + 2]))
          if (d > 0) diferentes++
          if (d > 32) acima32++
        }
        diff = { referenciaSha256: createHash('sha256').update(bytes).digest('hex'), referenciaIgualAoReceipt: createHash('sha256').update(bytes).digest('hex') === alvo.sha, pixels: ref.w * ref.h, diferentes, acima32 }
      }
      medidas[nome] = {
        arquetipo: entrada!.fieldValues.composicao.arquetipo,
        corpos: Object.fromEntries(TEXTOS.map((p) => [p, camada(r, p).style?.fontSize])),
        linhas: Object.fromEntries(TEXTOS.map((p) => [p, linhasDe(camada(r, p))])),
        motor: motorPx,
        logo: { ...logo.position, ...logo.size },
        fio: fioRect,
        foto: { ...bg.position, ...bg.size, escala: r.diagnostico.foto!.escala, corte: style.cropPosition },
        tinta,
        liso: r.fundo,
        avisos: r.diagnostico.avisos,
        pngSha256,
        alvoSha256: alvo.sha,
        diffInformativoContraAmostra: diff,
      }
      gravarMedidas()
      if (process.env.IH10_PROVAS_DIR && liso === 'claro') writeFileSync(join(process.env.IH10_PROVAS_DIR, `${nome}.png`), png)
    }, 180_000)
  }
})

describe('#10 · recusas, corte pelo assunto e gate (R-01, R-03, R-06, R-07, CT-07)', () => {
  it('ARQUETIPO_FOTO_AUSENTE sem foto; ARQUETIPO_TEXTO_NAO_CABE com o apoio sem a quebra autoral (F3), declarado antes pelo medir-copy', async () => {
    cenario.atual = await cenario10('claro', await medir())
    const semFoto = spec10('story', 'D', 'claro')
    delete (semFoto as Record<string, unknown>).foto
    expect((await recusaDe(comporPeca(semFoto, { autor: 'u' }))).code).toBe('ARQUETIPO_FOTO_AUSENTE')
    const umaLinha = spec10('feed', 'E', 'claro', { copyAutoral: copy10({ apoio: ['Luz natural e cada prato no ponto certo'] }) })
    const e = await recusaDe(comporPeca(umaLinha, { autor: 'u' }))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    const mc = await medirCopyDoProjeto({ projectId: PROJETO_10, formato: 'feed', copyAutoral: umaLinha.copyAutoral, fotoUrl: umaLinha.foto.url, variante: umaLinha.preferencias.variante, arquetipo: umaLinha.arquetipo } as never)
    expect(mc.medicao.cabeTudo).toBe(false)
    medidas['recusa-texto-nao-cabe'] = { code: e.code, message: e.message, medirCopy: { cabeTudo: mc.medicao.cabeTudo } }
    gravarMedidas()
  }, 180_000)

  it('corte pela CAIXA com o assunto: à esquerda → left-*, à direita → right-*; assunto mais largo que a coluna → SEM_COMBINACAO', async () => {
    const comAssunto = async (assunto: { x0: number; y0: number; x1: number; y1: number }) => (cenario.atual = await cenario10('claro', await medir(), { catalogo: { driveFileId: 'drive-10', assunto } }))
    const specDrive = (lado: Lado10) => spec10('story', lado, 'claro', { foto: { driveFileId: 'drive-10' } })
    await comAssunto({ x0: 0.02, y0: 0.4, x1: 0.3, y1: 0.6 })
    const esq = await comporPeca(specDrive('D'), { autor: 'u' })
    expect(esq.diagnostico.foto!.corte).toMatch(/^left-/)
    expect(esq.diagnostico.foto!.assuntoVisivel!).toBeGreaterThanOrEqual(0.75)
    await comAssunto({ x0: 0.7, y0: 0.4, x1: 0.98, y1: 0.6 })
    const dir = await comporPeca(specDrive('E'), { autor: 'u' })
    expect(dir.diagnostico.foto!.corte).toMatch(/^right-/)
    await comAssunto({ x0: 0.05, y0: 0.4, x1: 0.95, y1: 0.6 })
    const largo = await recusaDe(comporPeca(specDrive('D'), { autor: 'u' }))
    expect([largo.code, largo.details?.motivo]).toEqual(['SEM_COMBINACAO', 'CORTE_PERDE_O_ASSUNTO'])
    medidas['corte-pelo-assunto'] = { esquerda: esq.diagnostico.foto, direita: dir.diagnostico.foto, largo: { code: largo.code, motivo: largo.details?.motivo } }
    gravarMedidas()
  }, 180_000)

  it('R-07 (D8): o gate de autonomia numa peça #10 sai revisão humana (texto-sobre-assunto não comprovada), sem achado falso', async () => {
    cenario.atual = await cenario10('claro', await medir())
    for (const lado of ['D', 'E'] as const) {
      const r = await comporPeca(spec10('story', lado, 'claro'), { autor: 'u' })
      const { gate } = gateDaMedida({ medida: medidaDoGate({ camadas: r.layers, formato: 'story' }), identidade: { pageVersion: 'v1:teste', copyVersion: 'c1' }, copy: { estado: 'sem-mudanca', lacunas: [] }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE })
      expect([lado, gate.cobertura['texto-sobre-assunto']?.estado, gate.resultado]).toEqual([lado, 'nao-comprovada', 'REVISAO_HUMANA_NECESSARIA'])
      expect(gate.achados.filter((a) => a.regra === 'texto-sobre-assunto')).toEqual([])
    }
  }, 180_000)
})

/**
 * Rodada 1 do Codex (25/10/2026): os dois negativos que faltavam NO PRÓPRIO #10 (R-01 e R-02 estavam PARCIAIS). A
 * fronteira de escrita do compositor são dois pontos (`compor.ts`): `persistAndRenderCreative` (aqui o dublê que
 * captura em `cap.entradas`; ele é quem renderiza e grava no caminho normal) e o `renderDesign` da prova
 * (`opcoes.provar`). A recusa prova zero escrita e zero render nos dois: nenhuma entrada nova e o `renderDesign` do
 * `CanvasRenderer` espionado sem chamada. Sem variáveis de prova/render: nada é gravado em disco.
 */
describe('#10 · rodada 1: negativos do próprio #10 (R-01 PREFERENCIA_INVIAVEL, R-02 ARQUETIPO_FUNDO_INDISPONIVEL)', () => {
  async function semEscritaNemRender(promessa: Promise<unknown>) {
    const antes = cap.entradas.length
    const render = vi.spyOn(CanvasRenderer.prototype, 'renderDesign')
    try {
      const e = await recusaDe(promessa)
      expect(cap.entradas.length, 'nada persistido').toBe(antes)
      expect(render, 'nada renderizado').not.toHaveBeenCalled()
      return e
    } finally {
      render.mockRestore()
    }
  }

  for (const [lado, assunto, corteLivre] of [
    ['D', { x0: 0.02, y0: 0.4, x1: 0.3, y1: 0.6 }, /^left-/],
    ['E', { x0: 0.7, y0: 0.4, x1: 0.98, y1: 0.6 }, /^right-/],
  ] as const) {
    it(`R-01b ${lado}: assunto na lateral — o corte livre o preserva (${corteLivre}); o enquadramento FIXO (central) o perde → PREFERENCIA_INVIAVEL com a alternativa, sem render nem persistência`, async () => {
      cenario.atual = await cenario10('claro', await medir(), { catalogo: { driveFileId: 'drive-10', assunto } })
      const spec = (extra: Record<string, unknown> = {}) => spec10('feed', lado, 'claro', { foto: { driveFileId: 'drive-10' }, ...extra })
      // Controle: livre, o corte lateral mostra o assunto inteiro.
      const livre = await comporPeca(spec(), { autor: 'u' })
      expect(livre.diagnostico.foto!.corte).toMatch(corteLivre)
      expect(livre.diagnostico.foto!.assuntoVisivel!).toBeGreaterThanOrEqual(0.75)
      // Fixo: o central perde o assunto, o lateral resolveria → recusa dita, com a alternativa útil.
      const fixo = await semEscritaNemRender(comporPeca(spec({ preferencias: { variante: 'coluna10-claro', enquadramento: 'fixo' } }), { autor: 'u' }))
      expect(fixo.code).toBe('PREFERENCIA_INVIAVEL')
      expect(fixo.details?.alternativa?.corte).toMatch(corteLivre)
      medidas[`R-01b-${lado}`] = { livre: livre.diagnostico.foto, fixo: { code: fixo.code, message: fixo.message, alternativa: fixo.details?.alternativa } }
      console.info(`R-01b-${lado} ${JSON.stringify(medidas[`R-01b-${lado}`])}`)
    }, 180_000)
  }

  for (const lado of ['D', 'E'] as const) {
    it(`R-02b ${lado}: tintas ativas mistas (manchete no claro da marca, apoio e serviço no escuro) — nenhum papel do liso atende → ARQUETIPO_FUNDO_INDISPONIVEL (contraste), sem fundo improvisado, sem render nem persistência`, async () => {
      const m = await medir()
      const mista = async (formato: Formato10) => {
        const p = await paginaDoCenario10(formato, 'claro')
        return { ...p, layers: p.layers.map((l) => (l.type === 'text' ? { ...l, style: { ...(l.style as object), color: l.id === 'headline-pagina' ? CLARO_10 : ESCURO_10 } } : l)) as Layer[] }
      }
      cenario.atual = await cenario10('claro', m, { paginas: [await mista('story'), await mista('feed')] })
      const e = await semEscritaNemRender(comporPeca(spec10('story', lado, 'claro'), { autor: 'u' }))
      expect(e.code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
      expect(e.details?.origem).toBe('contraste')
      // Os dois papéis do liso foram avaliados e os dois reprovaram — nenhum véu, gradiente ou outro fundo em seu lugar.
      expect((e.details?.folgas ?? []).map((f: any) => [f.papel, f.atende])).toEqual([
        ['escuro', false],
        ['claro', false],
      ])
      medidas[`R-02b-${lado}`] = { code: e.code, message: e.message, origem: e.details?.origem, folgas: e.details?.folgas, tintas: e.details?.tintas }
      console.info(`R-02b-${lado} ${JSON.stringify(medidas[`R-02b-${lado}`])}`)
    }, 180_000)
  }
})
