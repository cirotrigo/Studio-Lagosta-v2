/**
 * Leitor das fixtures de clientes PSEUDONIMIZADOS do piloto (`fixtures/piloto-sintetico/cliente-NN/assinaturas.json`, formato
 * do gerador): devolve páginas com os tokens `fixture:*` já trocados pelos data URLs dos arquivos da própria fixture, as logos
 * idem e as candidatas do véu daquele cliente — cada cliente entra com os PRÓPRIOS ativos, não com os da fixture de 13/10.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Layer } from '@/types/template'
import type { FixtureDoCliente } from '../../../../../scripts/fixtures/pseudonimizar'

export interface ClienteDaFixture {
  id: string
  formatos: Array<'story' | 'feed'>
  numeros: Record<string, unknown>
  paginas: Array<Record<string, unknown> & { id: string; layers: Layer[]; tags: string[] }>
  logos: Array<{ fileUrl: string; isProjectLogo: boolean }>
  candidatasDoVeu: string[]
}

export function carregarClientesDasFixtures(pasta: string): ClienteDaFixture[] {
  if (!fs.existsSync(pasta)) return []
  const lista: ClienteDaFixture[] = []
  for (const nome of fs.readdirSync(pasta).filter((n) => n.startsWith('cliente-')).sort()) {
    const f = path.join(pasta, nome, 'assinaturas.json')
    if (!fs.existsSync(f)) continue
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as FixtureDoCliente
    const dataUrls = Object.fromEntries(Object.entries(j.arquivos ?? {}).map(([token, b64]) => [token, `data:image/png;base64,${b64}`]))
    const trocar = (layers: Layer[]) =>
      layers.map((l) => {
        if (typeof l.fileUrl !== 'string' || !l.fileUrl.startsWith('fixture:')) return l
        const url = dataUrls[l.fileUrl]
        // Token de arquivo que a fixture não carrega (foto de exemplo da assinatura): uma imagem local qualquer serve.
        return { ...l, fileUrl: url ?? dataUrls[Object.keys(dataUrls)[0]] ?? l.fileUrl }
      })
    const paginas = j.paginas.map((p, i) => ({ ...p, id: `${nome}-pagina-${i}`, tags: (p.tags as string[]) ?? [], layers: trocar((typeof p.layers === 'string' ? JSON.parse(p.layers) : p.layers) as Layer[]) }))
    const formatos = [...new Set(paginas.map((p) => (p.tags.includes('feed') ? 'feed' : 'story')))] as ClienteDaFixture['formatos']
    lista.push({ id: nome, formatos, numeros: (j.numerosDoProjeto ?? {}) as Record<string, unknown>, paginas, logos: (j.logos ?? []).map((l) => ({ fileUrl: dataUrls[l.fileUrl] ?? l.fileUrl, isProjectLogo: l.isProjectLogo })), candidatasDoVeu: j.candidatasDoVeu ?? [] })
  }
  return lista
}
