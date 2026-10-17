/**
 * GERADOR das fixtures do piloto sintético (contrato § 1.1): dos exports LOCAIS do exportador (JSON + PNGs das logos) para
 * `src/lib/direcao-de-arte/__tests__/fixtures/piloto-sintetico/cliente-NN/assinaturas.json`. OFFLINE: não fala com banco,
 * Blob, Drive nem rede. PSEUDONIMIZA em qualquer profundidade (`scripts/fixtures/pseudonimizar.ts`, testado em
 * `pseudonimizar.test.ts`): só os campos permitidos da página; nome do cliente → `cliente-NN`; toda URL → token `fixture:*`;
 * identificadores externos zerados; e uma conferência final RECUSA a saída se sobrou qualquer um deles. A tabela nome ↔ NN
 * vai para `human-output/piloto-sintetico-clientes.json`, fora do repositório.
 *
 *   npx tsx scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <pasta-das-fixtures>
 *
 * ESCRITO E NÃO EXECUTADO: a lista de clientes é a decisão 5.2 do owner.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pseudonimizar, type ExportDoCliente } from './pseudonimizar'

/** Re-codifica o PNG com o sharp, que descarta todo metadado (tEXt/EXIF/XMP/tempo) — a fixture leva só pixels. */
async function pngNormalizado(bytes: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(bytes).png({ compressionLevel: 9 }).toBuffer()
}

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
    const j = JSON.parse(fs.readFileSync(path.join(entrada, nome), 'utf8')) as ExportDoCliente & { arquivos?: Record<string, string> }
    const clienteId = `cliente-${String(nn++).padStart(2, '0')}`
    // URL → PNG normalizado em base64: as logos e TODA imagem das camadas que o exportador baixou (`arquivos` do export).
    const arquivos: Record<string, string> = {}
    for (const [url, arquivo] of [...j.logos.map((l) => [l.fileUrl, l.arquivo] as const), ...Object.entries(j.arquivos ?? {})]) {
      if (arquivo) arquivos[url] = (await pngNormalizado(fs.readFileSync(path.join(entrada, arquivo)))).toString('base64')
    }
    const { fixture, descartados } = pseudonimizar(j, clienteId, arquivos)
    for (const d of descartados) console.log(`  descartado (fora do esquema): ${d}`)
    const pasta = path.join(saida, clienteId)
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, 'assinaturas.json'), JSON.stringify(fixture, null, 1))
    tabela.push({ clienteId, projectId: j.projeto.id, nome: j.projeto.name })
    console.log(`${clienteId} ← projeto ${j.projeto.id}: ${fixture.paginas.length} página(s), ${fixture.logos.length} logo(s)`)
  }
  fs.mkdirSync('human-output', { recursive: true })
  fs.writeFileSync('human-output/piloto-sintetico-clientes.json', JSON.stringify(tabela, null, 1))
  console.log('tabela nome ↔ NN em human-output/piloto-sintetico-clientes.json (fora do repositório)')
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
