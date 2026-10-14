/**
 * T1a — a REGRA DE OURO: spec sem `arquetipo` compõe EXATAMENTE como antes do
 * T1a. O snapshot deste arquivo foi gerado no código da base (b5e541fd, ANTES de
 * qualquer linha do T1a) e entra no PR como o primeiro commit; os commits do T1a
 * não podem mudá-lo. Diferença no `.snap` = regressão do caminho sem arquétipo.
 *
 * Projeção estável entre plataformas: posições, tamanhos, estilos, ids, a escolha
 * de posição, a logo, os blocos, as medidas finais, os gradientes (borda, altura,
 * cor), o tratamento por borda (estado, cor) e a spec/ fieldValues gravados. Fica
 * de fora o que vem do raster no último bit (pontuações, forças, percentis).
 */
import { createHash } from 'node:crypto'
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

import type { Layer } from '@/types/template'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { specComAPosicaoOriginal } from '@/lib/compositor/defasagem'
import { validarSpec } from '@/lib/compositor/spec'
import { hashDoPayload, payloadParaHash } from '@/lib/lotes/identidade'
import { cenario } from './suporte/compositor'
import { cenarioDoPiloto } from './suporte/cenario-do-piloto'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const token = (u: unknown) => (typeof u === 'string' && u.startsWith('data:') ? `data:${createHash('sha1').update(u).digest('hex').slice(0, 12)}` : u)
const ehGradiente = (l: Layer) => l.type === 'gradient' || l.type === 'gradient2'
const semNumeros = (s: string) => s.replace(/\d+(?:[.,]\d+)?/g, '#')

function projecao(r: ResultadoDaComposicao, entrada: Record<string, any> | undefined) {
  const d = r.diagnostico
  return {
    layers: r.layers.map((l) =>
      ehGradiente(l)
        ? { id: l.id, type: l.type, order: l.order, position: l.position, size: l.size, borda: (l.metadata as Record<string, unknown> | undefined)?.borda, cor: (l.style as { gradientStops?: Array<{ color?: string }> })?.gradientStops?.[0]?.color }
        : { ...l, fileUrl: token(l.fileUrl) },
    ),
    chavesDoDiagnostico: Object.keys(d).sort(),
    posicao: { ancora: d.posicao.ancora, alinha: d.posicao.alinha, crop: d.posicao.crop },
    candidatos: d.candidatos.map((c) => [c.ancora, c.alinha, c.crop, c.descartado]),
    assuntoOrigem: d.assuntoOrigem,
    logo: d.logo,
    blocos: d.blocos,
    medidasFinais: d.medidasFinais,
    arranjos: d.arranjos,
    segundaVoz: d.segundaVoz,
    assinatura: d.assinatura,
    gradientes: d.gradientes?.map(({ borda, altura, cor, origemDaCor }) => ({ borda, altura, cor, origemDaCor })),
    tratamento: d.tratamentoDeLeitura?.map(({ borda, estado, cor, origemDaCor, textos }) => ({ borda, estado, cor, origemDaCor, textos: textos.map(({ camada, polaridade }) => ({ camada, polaridade })) })),
    avisos: d.avisos.map(semNumeros),
    persist: entrada
      ? {
          chaves: Object.keys(entrada.fieldValues).sort(),
          spec: entrada.fieldValues.spec,
          // A recomposição congela a posição a partir do diagnóstico gravado — o caminho sem arquétipo, intacto.
          specDaRecomposicao: specComAPosicaoOriginal(entrada.fieldValues.spec, entrada.fieldValues),
        }
      : null,
  }
}

const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }

async function sintetico(id: string, opcoes: { luz: number; apoio?: boolean; formato?: 'story' | 'feed'; preferencias?: Record<string, unknown> }) {
  const foto = await fotoSintetica(() => opcoes.luz)
  const pagina = paginaSintetica({
    id,
    headline: { cor: '#F5F5F5' },
    ...(opcoes.apoio ? { apoio: { cor: '#F5F5F5' } } : {}),
    servico: { cor: '#F5F5F5' },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [] })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: ASSINATURA } }
  const blocos = [
    { papel: 'headline', linhas: ['Almoço', 'de domingo'] },
    ...(opcoes.apoio ? [{ papel: 'apoio', linhas: ['com a família toda'] }] : []),
    { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
  ]
  const spec = { ...specSintetica({ pagina: id, blocos, preferencias: opcoes.preferencias }), ...(opcoes.formato ? { formato: opcoes.formato } : {}) }
  return spec
}

async function compor(spec: Record<string, unknown>) {
  const antes = cap.entradas.length
  const r = await comporPeca(spec, { autor: 'u-fixture' })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

describe('T1a · baseline sem arquétipo (gerado na base b5e541fd)', () => {
  it('a spec sem arquétipo não ganha a chave na validação nem muda o hash do lote', async () => {
    const spec = await sintetico('base-hash', { luz: 200 })
    const v = validarSpec(spec)
    expect('arquetipo' in (v.spec as object)).toBe(false)
    expect({ spec: v.spec, hash: hashDoPayload(payloadParaHash(v.spec!)) }).toMatchSnapshot()
  })

  it('1. texto claro sobre foto clara (story)', async () => {
    const { r, entrada } = await compor(await sintetico('base-a', { luz: 205 }))
    expect(projecao(r, entrada)).toMatchSnapshot()
  }, 60_000)

  it('2. headline + apoio no mesmo grupo da página (story)', async () => {
    const { r, entrada } = await compor(await sintetico('base-grupo', { luz: 60, apoio: true }))
    expect(projecao(r, entrada)).toMatchSnapshot()
  }, 60_000)

  it('3. feed a partir de página de story', async () => {
    const { r, entrada } = await compor(await sintetico('base-feed', { luz: 120, apoio: true, formato: 'feed' }))
    expect(projecao(r, entrada)).toMatchSnapshot()
  }, 60_000)

  it('4. preferências explícitas de posição e canto da marca', async () => {
    const { r, entrada } = await compor(await sintetico('base-pref', { luz: 90, preferencias: { ancora: 'rodape', alinha: 'centro', cantoDaMarca: 'superior-esquerdo' } }))
    expect(projecao(r, entrada)).toMatchSnapshot()
  }, 60_000)

  it('5. a peça piloto (somenteAvaliar)', async () => {
    const { cenario: c, spec } = await cenarioDoPiloto()
    cenario.atual = c
    const r = await comporPeca(spec, { somenteAvaliar: true })
    expect(projecao(r, undefined)).toMatchSnapshot()
  }, 120_000)
})
