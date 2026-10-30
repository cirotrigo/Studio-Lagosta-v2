/**
 * #9 `minimal-divisao-cor-topo-arco@1` por FIXTURE (I9, 25/10/2026) no COMPOSITOR e no MEDIDOR reais, com a Montserrat
 * DO REPO (`cenario-9.ts`). Prova I-07: a peça composta reproduz a geometria das amostras Bv3 aceitas (receipt
 * ACEITE-VISUAL-OWNER.json, "Aprovar B como está") — corpos, conteúdo e quebras iguais; path da máscara byte a byte;
 * corte e liso iguais; caixas de TINTA dos textos ±2 px em x/y/largura/altura; caixas do MOTOR ±2 px em x, y e altura
 * (a largura segue a regra justa do produto e cabe na referência e na zona HARD — os 648 px das amostras são largura
 * FIXA da fixture visual, não alvo); logo e foto ±2 px. O PNG é gravado se `I9_PROVAS_DIR` estiver definido e o diff de
 * pixel contra as Bv3 (lidas de `I9_BV3_DIR`) é só informativo. Dublados: banco, Blob, fontes do projeto, autofix,
 * acervo; a foto vem pelo dublê do fetch. Marca sintética — não é aceite de marca real.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>>, diagnostico: false }))

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
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) => {
  const f = await import('@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-arco-9')
  return f.catalogoComOArco(original as never, () => [], () => (cap.diagnostico ? f.arcoComOAjusteDeDiagnostico() : f.ARQUETIPO_ARCO_9))
})

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { pathDoArcoJanela } from '@/lib/compositor/arquetipos/mascara'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { CanvasRenderer } from '@/lib/canvas-renderer'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { CLARO_9, CORPOS_9, COPY_9, ESCURO_9, ID_ARCO, PROJETO_9, cenario9, medidorComAsFontesDoRepo, spec9, type Formato9, type Liso9 } from './suporte/cenario-9'

let medidor: Awaited<ReturnType<typeof medidorComAsFontesDoRepo>> | null = null
const medir = async () => (medidor ??= await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer')))

type R = { x: number; y: number; width: number; height: number }
/**
 * O ALVO, das amostras Bv3 (`cp-t3-b-9-amostras/pecas/v3/resumo.json`, campos `caixasPx`, `caixasDeTintaPx`, `fotoPx`;
 * copiados aqui — o teste não importa nada de `human-output`; só o diff informativo lê os PNG por `I9_BV3_DIR`, se
 * definido). `motor` = x, y e altura (a largura não é alvo).
 */
const ALVO: Record<Formato9, { motor: Record<'pre' | 'headline' | 'apoio', { x: number; y: number; height: number }>; logo: R; foto: R; tinta: Record<Liso9, Record<'pre' | 'headline' | 'apoio' | 'logo', R>> }> = {
  story: {
    // Pilha (29/10/2026): o apoio encosta na manchete com o gap da marca (365 + 177 + 14 − 1 de arredondamento) — era a referência solta 624.
    motor: { pre: { x: 92, y: 298, height: 50 }, headline: { x: 92, y: 365, height: 177 }, apoio: { x: 92, y: 555, height: 108 } },
    logo: { x: 854, y: 202, width: 134, height: 67 },
    foto: { x: 0, y: 806, width: 1080, height: 1114 },
    tinta: {
      claro: { pre: { x: 101, y: 313, width: 236, height: 22 }, headline: { x: 103, y: 373, width: 626, height: 154 }, apoio: { x: 102, y: 571, width: 407, height: 85 }, logo: { x: 858, y: 206, width: 122, height: 60 } },
      escuro: { pre: { x: 101, y: 313, width: 236, height: 22 }, headline: { x: 103, y: 373, width: 626, height: 154 }, apoio: { x: 101, y: 571, width: 408, height: 85 }, logo: { x: 858, y: 206, width: 122, height: 60 } },
    },
  },
  feed: {
    // Pilha (29/10/2026): a manchete encosta no pré (216 + 47 + 14 = 277); o apoio já coincidia com a pilha (277 + 175 + 14 = 466).
    motor: { pre: { x: 92, y: 216, height: 47 }, headline: { x: 92, y: 277, height: 175 }, apoio: { x: 92, y: 466, height: 50 } },
    logo: { x: 894, y: 142, width: 94, height: 47 },
    foto: { x: 0, y: 594, width: 1080, height: 756 },
    tinta: {
      claro: { pre: { x: 100, y: 229, width: 214, height: 21 }, headline: { x: 103, y: 284, width: 619, height: 153 }, apoio: { x: 101, y: 479, width: 627, height: 30 }, logo: { x: 897, y: 145, width: 85, height: 42 } },
      escuro: { pre: { x: 100, y: 229, width: 215, height: 21 }, headline: { x: 103, y: 284, width: 619, height: 153 }, apoio: { x: 101, y: 479, width: 627, height: 30 }, logo: { x: 897, y: 145, width: 85, height: 42 } },
    },
  },
}
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
/** A zona HARD (xMax .69) da fixture, em px; a borda da referência (x + w) sai da definição injetada. */
const ZONA_X = 0.69 * 1080
const LIMIAR_DE_TINTA = 16

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const linhasDe = (l: Layer) => String(l.content ?? '').split('\n')

async function pixels(png: Buffer) {
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data }
}
const render = (layers: Layer[], formato: Formato9, fundo: string) =>
  new CanvasRenderer(CANVAS[formato].width, CANVAS[formato].height).renderDesign({ canvas: { ...CANVAS[formato], backgroundColor: fundo }, layers } as never)

/** A caixa de TINTA: a diferença (> 16 num canal) entre a peça e a mesma peça sem a camada, na tela inteira (o método das Bv3). */
async function caixaDeTinta(cheia: Awaited<ReturnType<typeof pixels>>, layers: Layer[], id: string, formato: Formato9, fundo: string): Promise<R> {
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

const medidas: Record<string, unknown> = {}

describe('#9 · a fixture LITERAL das Bv3 no produto: os dois achados medidos (A-I1, A-I2), nenhum do arco', () => {
  it('A-I1 Story: "Bastidores da" a 87 px mede 636 px > coluna 634 da referência de 648 → a escada desce a manchete para 84', async () => {
    cap.diagnostico = false
    const m = await medir()
    const linha = (fs: number) => m({ id: 'x', type: 'text', content: 'Bastidores da', position: { x: 0, y: 0 }, size: { width: 5000, height: 200 }, style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: fs, lineHeight: 0.95, letterSpacing: 0 }, textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: 0.95 } } } as Layer)!.maxLineWidth
    const { colunaDaCaixa } = await import('@/lib/compositor/blocos')
    expect([linha(87), colunaDaCaixa(648)]).toEqual([636, 634])
    for (const liso of ['claro', 'escuro'] as const) {
      cenario.atual = await cenario9(liso, m)
      const r = await comporPeca(spec9('story', liso), { autor: 'u-fixture' })
      expect(['pre', 'headline', 'apoio'].map((p) => Number(camada(r, p).style?.fontSize))).toEqual([32, 84, 40])
      expect((camada(r, 'bg-foto').style as any).mask.path).toBe(pathDoArcoJanela({ w: 1080, h: 1114 }, 0.62))
    }
  }, 180_000)

  it('A-I2 Feed: a logo de 94,5 px arredonda para 894 + 95 = 989 contra a zona 988 — a folga do arredondamento na horizontal (29/10/2026) aceita o que a materialização aceitou', async () => {
    // Antes da folga, a composição recusava: "a caixa de logo (x 894–989) passa da zona efetiva na horizontal (x 756–988)".
    cap.diagnostico = false
    for (const liso of ['claro', 'escuro'] as const) {
      cenario.atual = await cenario9(liso, await medir())
      const r = await comporPeca(spec9('feed', liso), { autor: 'u-fixture' })
      const logo = camada(r, 'logo')
      // A caixa gravada é a arredondada (x e largura separados): 894 + 95; a borda real é 988,2, a da zona 988,2.
      expect([logo.position.x, logo.size.width, logo.position.x + logo.size.width]).toEqual([894, 95, 989])
      medidas[`A-I2-feed-${liso}`] = { logo: { x: logo.position.x, width: logo.size.width }, corpos: ['pre', 'headline', 'apoio'].map((p) => Number(camada(r, p).style?.fontSize)) }
    }
  }, 180_000)
})

describe('#9 · VARIANTE DE DIAGNÓSTICO (A-I1/A-I2) no compositor real, fontes do repo: o resto do I-07, CT-09, IF-03–IF-06', () => {
  it('IF-03: a Montserrat do repo (400/600/800) registrada e medida pelo medidor real', async () => {
    await medir()
    const { GlobalFonts } = await import('@napi-rs/canvas')
    expect(GlobalFonts.families.some((f: { family: string }) => f.family === 'Montserrat')).toBe(true)
    const sha = (p: string) => createHash('sha256').update(readFileSync(join(process.cwd(), p))).digest('hex')
    expect([400, 600, 800].map((p) => sha(`assets/fonts/montserrat/Montserrat-${p}.ttf`).slice(0, 8))).toEqual(['84f3d327', 'c535bb15', 'f0123e28'])
  })

  for (const formato of ['story', 'feed'] as const) {
    for (const liso of ['claro', 'escuro'] as const) {
      it(`I-07 sob a variante de diagnóstico · ${formato} · liso ${liso}: corpos/conteúdo/quebras, path, corte, liso, motor, tinta, logo e foto contra a Bv3; medir = compor`, async () => {
        cap.diagnostico = true
        cenario.atual = await cenario9(liso, await medir())
        const s = spec9(formato, liso)
        const antes = cap.entradas.length
        const r = await comporPeca(s, { autor: 'u-fixture' })
        const entrada = cap.entradas.length > antes ? cap.entradas.at(-1)! : null
        const fundo = liso === 'claro' ? CLARO_9 : ESCURO_9
        const alvo = ALVO[formato]
        const c = CORPOS_9[formato]

        // Liso = Page.background (IF-05 / CT-09 do #8 herdado).
        expect([r.fundo, entrada?.background, r.diagnostico.papelDoFundo?.papel]).toEqual([fundo, fundo, liso])
        // IF-04: conteúdo e quebras LITERAIS das Bv3, e os corpos (32/87/40 · 29/86/32), sem a escada descer.
        const textos = ['pre', 'headline', 'apoio'] as const
        expect(r.layers.filter((l) => l.type === 'text' || l.type === 'rich-text').map((l) => l.id).sort()).toEqual(['apoio', 'headline', 'pre'])
        expect(linhasDe(camada(r, 'pre'))).toEqual([COPY_9[formato].pre])
        expect(linhasDe(camada(r, 'headline'))).toEqual(COPY_9[formato].headline)
        expect(linhasDe(camada(r, 'apoio'))).toEqual(COPY_9[formato].apoio)
        for (const p of textos) expect([p, Number(camada(r, p).style?.fontSize)]).toEqual([p, c[p]])
        // A quebra DESENHADA (o medidor real, na caixa gravada): cada linha autoral é uma linha visual.
        const m = await medir()
        for (const p of textos) expect([p, m(camada(r, p)).lineCount]).toEqual([p, linhasDe(camada(r, p)).length])

        // A foto: caixa, corte, cover e a máscara (path byte a byte o da Bv3 = o da derivação da caixa).
        const bg = camada(r, 'bg-foto')
        const style = bg.style as Record<string, any>
        expect(perto(bg.position.x, alvo.foto.x) && perto(bg.position.y, alvo.foto.y), JSON.stringify(bg.position)).toBe(true)
        expect([bg.size.width, bg.size.height]).toEqual([alvo.foto.width, alvo.foto.height])
        expect([style.objectFit, style.cropPosition]).toEqual(['cover', 'center-middle'])
        expect(style.mask).toEqual({ shapeId: 'arco-janela', path: pathDoArcoJanela({ w: alvo.foto.width, h: alvo.foto.height }, 0.62) })
        expect(Object.keys(style).sort()).toEqual(['cropPosition', 'mask', 'objectFit'])
        // IF-01: a receita no diagnóstico gravado, coerente com `composicao.foto` (que não mudou de lugar).
        const composicao = entrada!.fieldValues.composicao
        expect(composicao.arquetipo.foto.mascara).toEqual({ tipo: 'arco-janela', versao: 1, raio: 0.62, caixa: { w: composicao.foto.caixa.width, h: composicao.foto.caixa.height }, path: style.mask.path })
        expect(composicao.foto).toMatchObject({ corte: 'center-middle', caixa: { x: 0, width: 1080, height: alvo.foto.height } })

        // Motor: x (âncora), y e altura ±2; a largura pela regra justa, contida na referência e na zona HARD.
        const motor: Record<string, unknown> = {}
        for (const p of textos) {
          const l = camada(r, p)
          motor[p] = { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height }
          expect([p, perto(l.position.x, alvo.motor[p].x), perto(l.position.y, alvo.motor[p].y), perto(l.size.height, alvo.motor[p].height)], JSON.stringify(motor[p])).toEqual([p, true, true, true])
          const ref = (verArquetipo(ID_ARCO, 1)!.formatos[formato].papeis[p] as { referencia: { x: number; w: number } }).referencia
          expect(l.position.x + l.size.width, `${p}: cabe na referência`).toBeLessThanOrEqual((ref.x + ref.w) * 1080 + 0.5) // a tolerância de meio px do próprio produto (materializar.ts)
          expect(l.position.x + l.size.width, `${p}: cabe na zona HARD`).toBeLessThanOrEqual(ZONA_X)
          expect(l.position.y + l.size.height, `${p}: acima da caixa da foto`).toBeLessThanOrEqual(bg.position.y)
        }
        const logo = camada(r, 'logo')
        expect([perto(logo.position.x, alvo.logo.x), perto(logo.position.y, alvo.logo.y), perto(logo.size.width, alvo.logo.width), perto(logo.size.height, alvo.logo.height)], JSON.stringify([logo.position, logo.size])).toEqual([true, true, true, true])

        // Tinta (render real da peça, a mesma régua das Bv3): ±2 px em x, y, largura e altura; a tinta dentro da caixa do motor.
        const png = r.prova ?? (await render(r.layers, formato, fundo))
        const cheia = await pixels(png)
        const tinta: Record<string, R> = {}
        for (const p of [...textos, 'logo'] as const) {
          const t = await caixaDeTinta(cheia, r.layers, p, formato, fundo)
          tinta[p] = t
          const a = alvo.tinta[liso][p]
          expect([p, perto(t.x, a.x), perto(t.y, a.y), perto(t.width, a.width), perto(t.height, a.height)], `${p} tinta ${JSON.stringify(t)} × ${JSON.stringify(a)}`).toEqual([p, true, true, true, true])
          if (p !== 'logo') {
            const l = camada(r, p)
            expect(t.x >= l.position.x && t.x + t.width <= l.position.x + l.size.width, `${p}: a tinta dentro da caixa do motor`).toBe(true)
          }
        }
        // O liso nos cantos de cima da caixa (o arco os esconde) e a foto sob o pico.
        const corDe = (x: number, y: number) => {
          const i = (y * cheia.w + x) * 4
          return `#${[0, 1, 2].map((k) => cheia.d[i + k].toString(16).padStart(2, '0')).join('')}`.toUpperCase()
        }
        const topo = Math.round(bg.position.y)
        expect([corDe(5, topo + 5), corDe(1074, topo + 5)]).toEqual([fundo, fundo])
        expect(corDe(540, topo + 20)).not.toBe(fundo)

        // CT-09: o medir-copy, no mesmo contexto, mede igual (posições e fundo), sem recusa.
        const mc = await medirCopyDoProjeto({ projectId: PROJETO_9, formato, copyAutoral: s.copyAutoral, fotoUrl: s.foto.url, variante: s.preferencias.variante, arquetipo: s.arquetipo } as never)
        expect([mc.fundo, mc.medicao.cabeTudo]).toEqual([fundo, true])
        for (const p of [...textos, 'logo'] as const) {
          const pos = mc.medicao.arquetipo!.posicoes![p]!.posicao
          const l = camada(r, p)
          expect([p, Math.round(pos.x), Math.round(pos.y)]).toEqual([p, Math.round(l.position.x), Math.round(l.position.y)])
        }

        // Provas (informativas): o PNG e o diff de pixel contra a Bv3.
        const nome = `B-${formato}-${liso}`
        let diff: Record<string, unknown> | null = null
        const bv3 = process.env.I9_BV3_DIR ? join(process.env.I9_BV3_DIR, `${nome}.png`) : null
        if (bv3 && existsSync(bv3)) {
          const ref = await pixels(readFileSync(bv3))
          let diferentes = 0
          let acima32 = 0
          for (let i = 0; i < ref.d.length; i += 4) {
            const d = Math.max(Math.abs(ref.d[i] - cheia.d[i]), Math.abs(ref.d[i + 1] - cheia.d[i + 1]), Math.abs(ref.d[i + 2] - cheia.d[i + 2]))
            if (d > 0) diferentes++
            if (d > 32) acima32++
          }
          diff = { referenciaSha256: createHash('sha256').update(readFileSync(bv3)).digest('hex'), pixels: ref.w * ref.h, diferentes, acima32 }
        }
        medidas[nome] = {
          corpos: Object.fromEntries(textos.map((p) => [p, camada(r, p).style?.fontSize])),
          linhas: Object.fromEntries(textos.map((p) => [p, linhasDe(camada(r, p))])),
          motor,
          logo: { ...logo.position, ...logo.size },
          foto: { ...bg.position, ...bg.size },
          tinta,
          path: style.mask.path,
          corte: style.cropPosition,
          liso: r.fundo,
          pngSha256: createHash('sha256').update(png).digest('hex'),
          diffInformativoContraBv3: diff,
        }
        if (process.env.I9_PROVAS_DIR) {
          mkdirSync(process.env.I9_PROVAS_DIR, { recursive: true })
          writeFileSync(join(process.env.I9_PROVAS_DIR, `${nome}.png`), png)
          writeFileSync(join(process.env.I9_PROVAS_DIR, 'medidas.json'), JSON.stringify(medidas, null, 2))
        }
      }, 180_000)
    }
  }
})
