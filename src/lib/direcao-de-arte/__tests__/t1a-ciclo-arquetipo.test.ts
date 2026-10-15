/**
 * T1a — o CICLO sintético de ponta a ponta, sem banco real e sem rede:
 * medir-copy (o serviço real) → fixação → compor (o caminho de persistência,
 * capturado) → a spec gravada → a recomposição por mudança de copy (a cadeia
 * pura da recomposição + o compositor real). A peça nunca troca de arquétipo,
 * de versão nem de impressão, e as referências são as mesmas.
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
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: () => true, getFileMetadata: async () => ({}) } }))
vi.mock('@/lib/google-drive/escopo', () => ({ assertDriveDoProjeto: async (_p: number, id: string) => id }))

import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { specComACopyDaPagina, specComAPosicaoOriginal } from '@/lib/compositor/defasagem'
import { specDaRecomposicao } from '@/lib/compositor/spec-da-recomposicao'
import { validarSpec, type SpecDePeca } from '@/lib/compositor/spec'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { resolverArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'

describe('T1a · ciclo medir-copy → fixação → compor → persistência → recompor', () => {
  it('a peça nasce e renasce no MESMO id@versão+impressão, com as MESMAS referências', async () => {
    // O cenário: foto clara, página sintética (headline + serviço), assinatura com as cores aprovadas.
    const foto = await fotoSintetica(() => 200)
    const fotoUrl = dataUrl(foto)
    const pagina = paginaSintetica({ id: 't1a-ciclo', headline: { cor: '#F5F5F5' }, servico: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: fotoUrl })
    const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
    cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
    const blocos = [
      { papel: 'headline' as const, linhas: ['Almoço', 'de domingo'] },
      { papel: 'servico' as const, linhas: ['Dom · 12h às 16h'] },
    ]
    const v1 = { id: TOPO, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(TOPO, 1)!) }

    // 1. MEDIR só com o id: a fixação devolve a versão exata e a impressão.
    const medicao = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos, variante: 't1a-ciclo', fotoUrl, arquetipo: { id: TOPO } })
    expect(medicao.fixacao.arquetipo).toEqual(v1)
    expect(medicao.medicao.cabeTudo).toBe(true)
    const posicoesMedidas = medicao.medicao.arquetipo!.posicoes!

    // 2. COMPOR com a fixação inteira (o caminho de persistência).
    const antes = cap.entradas.length
    const r1 = await comporPeca(
      { ...specSintetica({ pagina: 't1a-ciclo', blocos }), foto: { url: fotoUrl }, preferencias: { variante: medicao.fixacao.variante, arranjos: medicao.fixacao.arranjos }, arquetipo: medicao.fixacao.arquetipo },
      { autor: 'u-fixture' },
    )
    expect(cap.entradas.length).toBe(antes + 1)
    const entrada = cap.entradas.at(-1)!
    // medir-copy e compositor concordam: a posição medida é a posição composta.
    for (const p of r1.diagnostico.arquetipo!.papeis) expect(p.posicao, p.papel).toEqual(posicoesMedidas[p.papel as 'headline']!.posicao)

    // 3. PERSISTIDO: a spec gravada é a resolvida; a composição guarda a procedência.
    const fv = entrada.fieldValues
    expect(fv.spec.arquetipo).toEqual(v1)
    expect(fv.composicao.arquetipo).toMatchObject({ ...v1, codigoTaxonomico: 'MIN-01', modo: 'busca-espacial-v1' })

    // 4. RECOMPOR por mudança de copy: a cadeia da recomposição sobre a página editada, e o compositor real.
    const editadas = (entrada.layers as Layer[]).map((l) => (l.id === 'headline' ? { ...l, content: 'Almoço\nde sábado' } : l))
    const gravada = validarSpec(fv.spec).spec as SpecDePeca
    expect(resolverArquetipo(gravada.arquetipo as typeof v1, { persistida: true }).resolvido).toEqual(v1)
    const posicionada = specComAPosicaoOriginal(specComACopyDaPagina(gravada, editadas).spec, fv)
    expect(posicionada.preferencias?.ancora).toBeUndefined()
    expect(posicionada.preferencias?.alinha).toBeUndefined()
    const specRecomposta = specDaRecomposicao(posicionada, null)
    const r2 = await comporPeca(specRecomposta, { somenteAvaliar: true })

    const a1 = r1.diagnostico.arquetipo!
    const a2 = r2.diagnostico.arquetipo!
    expect({ id: a2.id, versao: a2.versao, impressao: a2.impressao }).toEqual(v1)
    expect(a2.papeis.map((p) => [p.papel, p.referencia, p.zonaEfetiva])).toEqual(a1.papeis.map((p) => [p.papel, p.referencia, p.zonaEfetiva]))
    // A copy mudou, a geometria não: os papéis seguem nas mesmas posições de referência.
    const pos = (r: typeof r1, id: string) => r.layers.find((l) => l.id === id)!.position
    expect(pos(r2, 'headline')).toEqual(pos(r1, 'headline'))
    expect(pos(r2, 'servico')).toEqual(pos(r1, 'servico'))
    expect(r2.layers.find((l) => l.id === 'headline')!.content).toBe('Almoço\nde sábado')
  }, 120_000)
})
