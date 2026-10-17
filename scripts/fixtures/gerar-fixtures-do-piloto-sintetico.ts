/**
 * GERADOR das fixtures do piloto sintético (contrato § 1.1): dos exports LOCAIS do exportador para
 * `src/lib/direcao-de-arte/__tests__/fixtures/piloto-sintetico/cliente-NN/assinaturas.json`. Não fala com banco, Blob nem Drive:
 * baixa as logos pelas URLs públicas do export (as únicas leituras de rede) e PSEUDONIMIZA: nome → `cliente-NN` (a tabela
 * nome ↔ NN vai para `human-output/piloto-sintetico-clientes.json`, fora do repositório), URLs → tokens `fixture:*`.
 *
 *   npx tsx scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <pasta-das-fixtures>
 */
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const [entrada, saida] = process.argv.slice(2)
  if (!entrada || !saida) {
    console.error('uso: gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <pasta-das-fixtures>')
    process.exit(1)
  }
  const exports = fs.readdirSync(entrada).filter((n) => /^projeto-\d+\.json$/.test(n)).sort()
  const tabela: Array<{ clienteId: string; projectId: number; nome: string }> = []
  let nn = 1
  for (const nome of exports) {
    const j = JSON.parse(fs.readFileSync(path.join(entrada, nome), 'utf8')) as { projeto: { id: number; name: string; assinatura: unknown }; paginas: Array<Record<string, unknown>>; logos: Array<{ id: number; fileUrl: string; isProjectLogo: boolean }> }
    const clienteId = `cliente-${String(nn++).padStart(2, '0')}`
    tabela.push({ clienteId, projectId: j.projeto.id, nome: j.projeto.name })
    const arquivos: Record<string, string> = {}
    const logos: Array<{ fileUrl: string; isProjectLogo: boolean }> = []
    for (const [k, l] of j.logos.entries()) {
      const token = `fixture:logo-${k}`
      const r = await fetch(l.fileUrl)
      if (!r.ok) throw new Error(`logo ${l.fileUrl}: HTTP ${r.status}`)
      arquivos[token] = Buffer.from(await r.arrayBuffer()).toString('base64')
      logos.push({ fileUrl: token, isProjectLogo: l.isProjectLogo })
    }
    // Camadas: toda URL de arquivo vira token (as logos pelo mapa; o resto, `fixture:arquivo-<n>` sem conteúdo — a assinatura não precisa das fotos de exemplo).
    let n = 0
    const paginas = j.paginas.map((p) => ({
      ...p,
      name: String(p.name).replace(j.projeto.name, clienteId),
      layers: (typeof p.layers === 'string' ? JSON.parse(p.layers) : p.layers).map((l: Record<string, unknown>) => {
        if (typeof l.fileUrl !== 'string') return l
        const logo = j.logos.findIndex((x) => x.fileUrl === l.fileUrl)
        return { ...l, fileUrl: logo >= 0 ? `fixture:logo-${logo}` : `fixture:arquivo-${++n}` }
      }),
    }))
    const pasta = path.join(saida, clienteId)
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, 'assinaturas.json'), JSON.stringify({ clienteId, numerosDoProjeto: j.projeto.assinatura, paginas, logos, arquivos }, null, 1))
    console.log(`${clienteId} ← projeto ${j.projeto.id}: ${paginas.length} página(s), ${logos.length} logo(s)`)
  }
  fs.mkdirSync('human-output', { recursive: true })
  fs.writeFileSync('human-output/piloto-sintetico-clientes.json', JSON.stringify(tabela, null, 1))
  console.log(`tabela nome ↔ NN em human-output/piloto-sintetico-clientes.json (fora do repositório)`)
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
