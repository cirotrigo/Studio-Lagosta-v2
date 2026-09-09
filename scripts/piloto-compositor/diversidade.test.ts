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

it('gradiente integrado reproduz aprovação e compara fotos novas', async () => {
  const root = resolve('.tmp-medicao-compositor')
  const out = resolve(root, 'diversidade')
  const snapshot = JSON.parse(readFileSync(resolve(root, 'snapshot.json'), 'utf8'))
  const fotos = JSON.parse(readFileSync(resolve(out, 'fotos.json'), 'utf8')).filter((f: any) => !process.env.PILOTO_FOTO || f.slug === process.env.PILOTO_FOTO)
  estado.snapshot = snapshot
  const { comporPeca } = await import('@/lib/compositor/compor')
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const sharp = (await import('sharp')).default
  const resultados: any[] = []
  for (const foto of [...(process.env.PILOTO_FOTO ? [] : [{ projectId: 1, slug: 'aprovada', driveFileId: snapshot.casos.find((c: any) => c.projeto.id === 1).evidencia.spec.fotoDriveId }]), ...fotos]) {
    const c = structuredClone(snapshot.casos.find((c: any) => c.projeto.id === foto.projectId))
    for (const l of c.projeto.Logo) l.fileUrl = snapshot.assets[l.fileUrl]
    for (const p of c.paginas) { let layers = p.layers; while (typeof layers === 'string') layers = JSON.parse(layers); for (const l of layers) if (l.fileUrl) l.fileUrl = snapshot.assets[l.fileUrl]; p.layers = layers }
    estado.atual = c
    if (foto.path) snapshot.assets[foto.driveFileId] = foto.path
    expect(foto.catalogo?.precoLegivel ?? false).toBe(false)
    expect(foto.catalogo?.marcaDeTerceiro ?? null).toBeNull()
    const e = c.evidencia.spec
    for (const tratamento of foto.slug === 'aprovada' ? ['gradiente-suave-topo'] : ['assinatura', 'gradiente-suave-topo']) {
      const spec: SpecDePeca = { projectId: foto.projectId, formato: 'story', foto: { driveFileId: foto.driveFileId }, blocos: e.blocos, preferencias: { ...e.preferencias, variante: c.historica.fieldValues.composicao.assinatura.pageId, tratamentoDeTexto: tratamento as any }, nome: e.nome, tema: e.tema, quando: e.quando }
      const inicio = performance.now()
      const r = await comporPeca(spec, { somenteAvaliar: true, medirComparacao: true })
      const design = { canvas: { width: 1080, height: 1920 }, layers: r.layers }
      const png = await new CanvasRenderer(1080, 1920).renderDesign(design)
      const ms = performance.now() - inicio
      const path = resolve(out, `${foto.projectId}-${foto.slug}-${tratamento}.png`)
      writeFileSync(path, png); writeFileSync(path + '.design.json', JSON.stringify(design, null, 2))
      await sharp(png).resize(360).png().toFile(path.replace('.png', '-360.png'))
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
      for (const b of spec.blocos) expect(norm(r.layers.filter((l) => l.type === 'text' && (l.name === b.papel || b.papel === 'headline' && l.name === 'headline2')).map((l) => l.content).join(' '))).toBe(norm(b.linhas.join(' ')))
      if (foto.slug === 'aprovada') expect(png.equals(readFileSync(resolve(root, 'real-difusao/gradiente.png')))).toBe(true)
      resultados.push({ projectId: foto.projectId, slug: foto.slug, driveFileId: foto.driveFileId, tratamento, path, ms, hash: createHash('sha256').update(png).digest('hex'), diagnostico: r.diagnostico })
    }
  }
  expect(resultados).toHaveLength(fotos.length * 2 + (process.env.PILOTO_FOTO ? 0 : 1))
  const anteriores = process.env.PILOTO_FOTO ? JSON.parse(readFileSync(resolve(out, 'resultados.json'), 'utf8')).filter((r: any) => r.slug !== process.env.PILOTO_FOTO) : []
  writeFileSync(resolve(out, 'resultados.json'), JSON.stringify([...anteriores, ...resultados], null, 2))
})
