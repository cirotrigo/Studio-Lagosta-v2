/**
 * DUAS FAIXAS (05/11/2026) no compositor REAL (dublês de banco, persistência, fontes, medidor e acervo; foto sintética):
 * a peça pelo Ref 03 do Empório põe manchete e apoio no topo e serviço e CTA no rodapé, cada texto na caixa aprovada.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

const definicoes = vi.hoisted(() => ({ atual: [] as unknown[] }))
vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))
vi.mock('@/lib/compositor/referencias', () => ({ resolucaoParaASpec: async () => ({ definicoes: definicoes.atual }) }))

import { comporPeca } from '@/lib/compositor/compor'
import { compilarReferencia } from '@/lib/compositor/arquetipos/referencia'
import ref03 from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref03-topo-duas-faixas.json'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const PISO_DO_EMPORIO = { margemH: 64, safeTopo: 160, safeRodape: 160 }

describe('duas faixas · o Ref 03 no compositor', () => {
  it('manchete e apoio nascem no topo e serviço e CTA no rodapé, nas caixas aprovadas', async () => {
    const foto = await fotoSintetica(() => 40)
    const base0 = paginaSintetica({ id: 'duas-faixas', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, servico: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
    // A assinatura sintética não tem CTA: a camada do serviço copiada com o papel cta.
    const servico = base0.layers.find((l) => l.name === 'servico')!
    const pagina = { ...base0, layers: [...base0.layers, { ...servico, id: 'cta', name: 'cta', position: { ...servico.position, y: 1720 } } as Layer] }
    const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
    cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
    const c = compilarReferencia(ref03 as unknown as Pagina, { pageVersion: 'v', versao: 1, piso: PISO_DO_EMPORIO })
    if (!c.ok) throw new Error(`${(c as { codigo: string }).codigo}: ${(c as { mensagem: string }).mensagem}`)
    definicoes.atual = [c.definicao]
    const spec = {
      ...specSintetica({ pagina: 'duas-faixas', blocos: [
        { papel: 'headline', linhas: ['Pão fresco e', 'café de método'] },
        { papel: 'apoio', linhas: ['Brioche e café coado'] },
        { papel: 'servico', linhas: ['Terça a domingo, das 9h'] },
        { papel: 'cta', linhas: ['Aguardamos você.'] },
      ] }),
      foto: { driveFileId: 'foto-sintetica' },
      arquetipo: { id: c.definicao.id },
    }
    const r = await comporPeca(spec, { somenteAvaliar: true })
    const y = (papel: string) => {
      const l = r.layers.find((x) => x.type === 'text' && (x.name === papel || x.id === papel || (x as { metadata?: { papel?: string } }).metadata?.papel === papel))
      if (!l) throw new Error(`sem camada de ${papel}: ${r.layers.map((x) => `${x.id}/${x.name}`).join(', ')}`)
      return l.position.y
    }
    // Cada texto na caixa da página do Ref 03 (y 160, 319, 1608, 1712); a logo na dela (y 1705).
    expect(['headline', 'apoio', 'servico', 'cta'].map(y)).toEqual([160, 319, 1608, 1712])
    expect(Math.round(r.layers.find((l) => l.type === 'logo')!.position.y)).toBe(1705)
  })
})
