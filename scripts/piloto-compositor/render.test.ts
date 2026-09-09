import { expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import type { Layer } from '@/types/template'
import type { SpecDePeca } from '@/lib/compositor/spec'

const estado = vi.hoisted(() => ({ atual: null as any, snapshot: null as any }))
const negar = () => { throw new Error('Operação não autorizada no piloto offline') }
vi.mock('@/lib/db', () => ({ db: {
  project: { findUnique: async () => ({ ...estado.atual.projeto, userId: 'piloto' }) },
  template: { findFirst: async () => estado.atual.template },
  page: { findMany: async () => estado.atual.paginas },
} }))
vi.mock('@/lib/creatives/persist', () => ({ persistAndRenderCreative: negar, resolveImageUrl: async (_: unknown, id: string) => ({ url: estado.snapshot.assets[id] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: negar, ordemNaPasta: negar }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: negar }))
vi.mock('@/lib/creatives/acervo', () => ({ lerCatalogoDoProjeto: async () => ({ todas: estado.atual.catalogo ?? [] }) }))
vi.mock('@/lib/posts/register-project-fonts', () => ({
  fetchBuffer: async (url: string) => readFileSync(estado.snapshot.assets[url] ?? url),
  registerProjectFonts: async () => {
    const { GlobalFonts } = await import('@napi-rs/canvas')
    for (const f of estado.atual.fontes) {
      const ok = GlobalFonts.registerFromPath(estado.snapshot.assets[f.fileUrl], f.fontFamily)
      if (!ok) throw new Error(`Fonte local não registrada: ${f.fontFamily}`)
    }
  },
}))

it('piloto com ativos reais congelados e persistência proibida', async () => {
  const out = resolve('.tmp-medicao-compositor')
  const snapshot = JSON.parse(readFileSync(resolve(out, 'snapshot.json'), 'utf8'))
  estado.snapshot = snapshot
  const beforePath = resolve(out, 'baseline-compor.ts')
  const before = await import(beforePath)
  const after = await import('@/lib/compositor/compor')
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const resultados: any[] = []
  for (const original of snapshot.casos) {
    // Troca URLs por arquivos reais idênticos, apenas no adaptador local.
    const c = structuredClone(original)
    for (const l of c.projeto.Logo) l.fileUrl = snapshot.assets[l.fileUrl]
    for (const p of c.paginas) {
      let layers = p.layers
      while (typeof layers === 'string') layers = JSON.parse(layers)
      for (const l of layers) if (l.fileUrl) {
        if (!snapshot.assets[l.fileUrl]) throw new Error('Ativo da assinatura não capturado')
        l.fileUrl = snapshot.assets[l.fileUrl]
      }
      p.layers = layers
    }
    estado.atual = c
    const e = c.evidencia.spec
    const spec: SpecDePeca = { projectId: e.projectId, formato: e.formato, foto: { driveFileId: e.fotoDriveId }, blocos: e.blocos, preferencias: e.preferencias, nome: e.nome, tema: e.tema, quando: e.quando }
    const caso: any = { cliente: c.projeto.name, id: c.projeto.id, preparacaoMs: c.preparacaoMs, rodadas: [], paginas: c.paginas.map((p: any) => ({ id: p.id, updatedAt: p.updatedAt })) }
    for (let rodada = 0; rodada < 3; rodada++) {
      for (const condicao of rodada === 1 ? ['atual', 'anterior'] : ['anterior', 'atual']) {
        const t = performance.now()
        try {
          const r = await (condicao === 'anterior' ? before.comporPeca(spec, { provar: true }) : after.comporPeca({ ...spec, selecaoExperimental: true, fotosCandidatas: [e.fotoDriveId] }, { provar: true }))
          const ms = performance.now() - t
          const path = resolve(out, `${c.projeto.id}-${condicao}-${rodada}.png`)
          writeFileSync(path, r.prova)
          writeFileSync(path + '.layers.json', JSON.stringify(r.layers, null, 2))
          caso.rodadas.push({ rodada, condicao, ms, status: 'preview', path, hash: createHash('sha256').update(r.prova).digest('hex'), diagnostico: r.diagnostico })
          expect(r.persistido).toBeNull()
        } catch (erro: any) {
          caso.rodadas.push({ rodada, condicao, ms: performance.now() - t, status: 'recusada', codigo: erro.code, mensagem: erro.message, detalhes: erro.details })
        }
      }
    }
    const padrao = await after.comporPeca({ ...spec, fotosCandidatas: [e.fotoDriveId] }, { provar: true })
    caso.padraoHash = createHash('sha256').update(padrao.prova!).digest('hex')
    caso.padraoPath = resolve(out, `${c.projeto.id}-padrao.png`)
    writeFileSync(caso.padraoPath, padrao.prova!)
    expect(caso.padraoHash).toBe(caso.rodadas.find((r: any) => r.condicao === 'anterior').hash)
    const selecao = caso.rodadas.find((r: any) => r.condicao === 'atual' && r.status === 'preview')?.diagnostico.selecao
    const alternativa = selecao?.alternativas?.[0]
    if (alternativa) {
      const r = await after.comporPeca({ ...spec, preferencias: { ...spec.preferencias, variante: alternativa.variante } }, { somenteAvaliar: true, medirComparacao: true })
      const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920 }, layers: r.layers as Layer[] })
      caso.alternativa = { ...alternativa, path: resolve(out, `${c.projeto.id}-alternativa.png`), diagnostico: r.diagnostico }
      writeFileSync(caso.alternativa.path, png)
      writeFileSync(caso.alternativa.path + '.layers.json', JSON.stringify(r.layers, null, 2))
    }
    // Materializa para inspeção a variante histórica também se a seleção a recusou.
    // Não conta no benchmark: é diagnóstico, não resultado aprovado da seleção.
    const base = caso.rodadas.find((r: any) => r.condicao === 'anterior' && r.status === 'preview')
    if (base && !caso.rodadas.some((r: any) => r.condicao === 'atual' && r.status === 'preview')) {
      const r = await after.comporPeca({ ...spec, preferencias: { ...spec.preferencias, variante: base.diagnostico.assinatura.pageId } }, { somenteAvaliar: true })
      const png = await new CanvasRenderer(1080, 1920).renderDesign({ canvas: { width: 1080, height: 1920 }, layers: r.layers as Layer[] })
      caso.previewDiagnostico = resolve(out, `${c.projeto.id}-atual-recusada.png`)
      writeFileSync(caso.previewDiagnostico, png)
      caso.diagnosticoRecusado = r.diagnostico
    }
    resultados.push(caso)
    writeFileSync(resolve(out, 'resultados-render.json'), JSON.stringify({ capturadoEm: snapshot.capturadoEm, bancoMs: snapshot.bancoMs, preparacaoTotalMs: snapshot.preparacaoTotalMs, resultados }, null, 2))
    console.log(`PILOTO ${c.projeto.name}: ${caso.rodadas.map((r: any) => r.condicao + '=' + r.status + '/' + Math.round(r.ms) + 'ms').join(', ')}`)
  }
  expect(resultados).toHaveLength(3)
})
