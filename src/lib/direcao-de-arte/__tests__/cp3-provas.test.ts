/**
 * CP3 — PROVAS VISUAIS (só roda com PROVAS_DIR; o CI pula). O compositor REAL renderiza (o mesmo `CanvasRenderer` da
 * produção, sem banco, sem rede, sem Blob) e grava PNG + JSON por cenário, mais um `indice.json`:
 *
 *   PROVAS_DIR=/tmp/provas-cp3 npx vitest run src/lib/direcao-de-arte/__tests__/cp3-provas.test.ts
 *
 * Cenários: logo clara sobre fundo escuro · escura sobre claro · média enganosa com p10 ruim (metade da logo some) ·
 * variante alternativa (a explícita cinza não lê, a principal do projeto entra) · sem solução (nenhuma lê). Onde o
 * arquétipo RECUSA, a mesma peça é renderizada SEM arquétipo (o legado não recusa) para a inspeção ver o que seria
 * publicado — e a recusa fica no JSON.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
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

import { CreativeError } from '@/lib/creatives/errors'
import { comporPeca } from '@/lib/compositor/compor'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { cenario, medidorCalibrado } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const DIR = process.env.PROVAS_DIR ?? ''
const TOPO = 'minimal-fb-topo-esquerda'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const CINZA = '#808080'
const ARIAL = medidorCalibrado([{ fontFamily: 'Arial', fontSize: 100, lineHeight: 1, letterSpacing: 0, linhaMaisLonga: 'x'.repeat(10), width: 560 + 2 * PADDING_DE_DESENHO + 2, height: 115, linhas: 1 }])

/** Logo 160×80 em DOIS tons: o anel numa tinta, a barra noutra — a parte que some no fundo. */
async function logoDoisTons(anel: string, barra: string): Promise<Buffer> {
  const W = 160
  const H = 80
  const rgb = (t: string) => [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16))
  const [a, b] = [rgb(anel), rgb(barra)]
  const px = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 40, y - 40)
      const noAnel = d < 36 && d > 22
      const naBarra = x > 90 && x < 150 && y > 30 && y < 50
      const p = (y * W + x) * 4
      const t = noAnel ? a : naBarra ? b : null
      if (!t) continue
      px[p] = t[0]
      px[p + 1] = t[1]
      px[p + 2] = t[2]
      px[p + 3] = 255
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

interface Cenario {
  id: string
  titulo: string
  luz: number
  logo: Buffer
  projeto?: Buffer[]
  cores: { headline: string; servico: string }
}

const indice: Array<Record<string, unknown>> = []

async function montar(c: Cenario) {
  const foto = await fotoSintetica(() => c.luz)
  const pagina = paginaSintetica({ id: c.id, headline: { cor: c.cores.headline }, servico: { cor: c.cores.servico }, logoUrl: dataUrl(c.logo), fundoUrl: dataUrl(foto) })
  const comArial = { ...pagina, layers: pagina.layers.map((l) => (l.type === 'text' ? { ...l, style: { ...l.style, fontFamily: 'Arial' } } : l)) }
  const base = await cenarioSintetico({ pagina: comArial, foto, candidatasDoVeu: [], logosDoProjeto: (c.projeto ?? []).map((b) => ({ fileUrl: dataUrl(b), isProjectLogo: true })) })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: ASSINATURA }, medidor: ARIAL }
}

const blocos = [{ papel: 'headline', linhas: ['Almoço', 'de domingo'] }, { papel: 'servico', linhas: ['Dom · 12h às 16h'] }]

async function provar(c: Cenario) {
  await montar(c)
  const spec = { ...specSintetica({ pagina: c.id, blocos }), arquetipo: { id: TOPO } }
  const registro: Record<string, unknown> = { id: c.id, titulo: c.titulo }
  try {
    const r = await comporPeca(spec, { provar: true })
    writeFileSync(join(DIR, `${c.id}.png`), r.prova!)
    const l = r.diagnostico.logo!.legibilidade!
    registro.resultado = 'compôs'
    registro.leitura = { escolha: l.escolha, legivel: l.legivel, variante: l.variante.origem, canto: l.canto, medida: l.medida, avaliacoes: l.avaliacoes.map((a) => ({ variante: a.variante.origem, canto: a.canto, estado: a.estado, p10: a.medida?.contrasteP10, media: a.medida?.contrasteMedio, proporcao: a.medida?.proporcaoAcima45 })) }
    registro.avisos = r.diagnostico.avisos.filter((a) => /logo/i.test(a))
  } catch (e) {
    if (!(e instanceof CreativeError)) throw e
    registro.resultado = `recusou: ${e.code}`
    registro.mensagem = e.message
    registro.detalhes = e.details
    // O legado não recusa: a mesma peça sem arquétipo mostra o que seria publicado.
    await montar(c)
    const r = await comporPeca({ ...specSintetica({ pagina: c.id, blocos }), preferencias: { variante: c.id, cantoDaMarca: 'inferior-direito' } }, { provar: true })
    writeFileSync(join(DIR, `${c.id}-legado.png`), r.prova!)
    registro.legado = r.diagnostico.logo?.legibilidade ? { codigo: r.diagnostico.logo.legibilidade.codigo ?? null, medida: r.diagnostico.logo.legibilidade.medida, mensagem: r.diagnostico.logo.legibilidade.mensagem } : null
  }
  writeFileSync(join(DIR, `${c.id}.json`), JSON.stringify(registro, null, 2))
  indice.push(registro)
  return registro
}

describe.skipIf(!DIR)('CP3 · provas visuais', () => {
  afterAll(() => {
    if (DIR) writeFileSync(join(DIR, 'indice.json'), JSON.stringify(indice, null, 2))
  })

  it('gera as cinco provas', async () => {
    mkdirSync(DIR, { recursive: true })
    const clara = await logoSintetica('#D0D0D0')
    const escura = await logoSintetica(ESCURO)
    const r1 = await provar({ id: '1-clara-sobre-escuro', titulo: 'logo clara sobre fundo escuro: lê', luz: 45, logo: clara, cores: { headline: CLARO, servico: CLARO } })
    const r2 = await provar({ id: '2-escura-sobre-claro', titulo: 'logo escura sobre fundo claro: lê', luz: 215, logo: escura, cores: { headline: ESCURO, servico: ESCURO } })
    const r3 = await provar({ id: '3-media-enganosa-p10-ruim', titulo: 'anel claro + barra escura sobre fundo escuro: a média passa, o p10 reprova (a barra some)', luz: 40, logo: await logoDoisTons('#F5F5F5', '#303030'), cores: { headline: CLARO, servico: CLARO } })
    const r4 = await provar({ id: '4-variante-alternativa', titulo: 'a explícita cinza não lê sobre cinza; a principal do projeto (clara) entra no mesmo lugar', luz: 128, logo: await logoSintetica(CINZA), projeto: [clara], cores: { headline: CLARO, servico: CLARO } })
    const r5 = await provar({ id: '5-sem-solucao', titulo: 'nenhuma variante lê (cinza e cinza-escuro sobre cinza): LOGO_SEM_VARIANTE_LEGIVEL', luz: 128, logo: await logoSintetica(CINZA), projeto: [await logoSintetica('#707070')], cores: { headline: CLARO, servico: CLARO } })
    expect(r1.resultado).toBe('compôs')
    expect(r2.resultado).toBe('compôs')
    expect(r3.resultado).toMatch(/LOGO_SEM_VARIANTE_LEGIVEL/)
    expect(r4.resultado).toBe('compôs')
    expect(r5.resultado).toMatch(/LOGO_SEM_VARIANTE_LEGIVEL/)
  }, 300_000)
})
