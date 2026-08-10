/**
 * Teste do conserto de contraste do logo-compositor, sem gerar arte nenhuma.
 *
 * Monta artes sintéticas onde o canto reservado (inferior direito) é CLARO e
 * calmo — o caso que engolia a logo branca — e confere se a composição foge
 * para um canto escuro.
 */
import * as fs from 'fs'
import sharp from 'sharp'
import { comporLogo } from '../src/lib/ai/logo-compositor'
import { db } from '../src/lib/db'

const W = 1080
const H = 1350

/** Arte com metade de baixo CLARA e lisa, metade de cima escura e lisa. */
async function arteClaraEmbaixo(): Promise<Buffer> {
  const claro = await sharp({ create: { width: W, height: H / 2, channels: 3, background: '#f2efe9' } })
    .png()
    .toBuffer()
  const escuro = await sharp({ create: { width: W, height: H / 2, channels: 3, background: '#1a1512' } })
    .png()
    .toBuffer()
  return sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite([
      { input: escuro, top: 0, left: 0 },
      { input: claro, top: H / 2, left: 0 },
    ])
    .jpeg()
    .toBuffer()
}

/** O inverso: claro em cima, escuro embaixo. */
async function arteClaraEmCima(): Promise<Buffer> {
  const claro = await sharp({ create: { width: W, height: H / 2, channels: 3, background: '#f4f1ea' } })
    .png()
    .toBuffer()
  const escuro = await sharp({ create: { width: W, height: H / 2, channels: 3, background: '#16120f' } })
    .png()
    .toBuffer()
  return sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite([
      { input: claro, top: 0, left: 0 },
      { input: escuro, top: H / 2, left: 0 },
    ])
    .jpeg()
    .toBuffer()
}

async function main() {
  const logos = await db.logo.findMany({
    where: { isProjectLogo: true, projectId: { in: [2, 7] } },
    select: { name: true, fileUrl: true, projectId: true },
  })
  const branca = logos.find((l) => l.projectId === 2)! // Quintal, luminância 255
  const escura = logos.find((l) => l.projectId === 7)! // By Rock, luminância 89

  const casos: Array<{ nome: string; arte: Buffer; logo: string; url: string; esperado: string }> = [
    {
      nome: 'logo BRANCA + canto reservado CLARO',
      arte: await arteClaraEmbaixo(),
      logo: branca.name,
      url: branca.fileUrl,
      esperado: 'deve FUGIR para o topo (escuro)',
    },
    {
      nome: 'logo BRANCA + canto reservado ESCURO',
      arte: await arteClaraEmCima(),
      logo: branca.name,
      url: branca.fileUrl,
      esperado: 'deve FICAR embaixo (escuro)',
    },
    {
      nome: 'logo ESCURA + canto reservado CLARO',
      arte: await arteClaraEmbaixo(),
      logo: escura.name,
      url: escura.fileUrl,
      esperado: 'deve FICAR embaixo (claro contrasta com logo escura)',
    },
  ]

  fs.mkdirSync('/tmp/teste-logo', { recursive: true })
  for (const [i, caso] of casos.entries()) {
    const res = await fetch(caso.url)
    const logoBuf = Buffer.from(await res.arrayBuffer())
    const r = await comporLogo(caso.arte, logoBuf, { cornerReservado: 'bottom-right' })
    fs.writeFileSync(`/tmp/teste-logo/caso-${i + 1}.jpg`, r.buffer)
    console.log(
      `${caso.nome}\n  logo: ${caso.logo}\n  esperado: ${caso.esperado}\n  → canto ${r.corner} | contraste ${r.contraste?.toFixed(0)} | calma ${r.calmness.toFixed(1)} | moveu=${r.moveu}\n`,
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
