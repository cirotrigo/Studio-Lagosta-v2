/**
 * Leitura-só: monta uma folha de contato comparando, por cliente, a logo
 * marcada como isProjectLogo no Studio (esquerda) com a logo preferida pelo
 * LOGO_MAP do insta-automatico (direita). Serve para decidir por VISÃO, não
 * por nome de arquivo — os nomes no Studio são opacos ("Ativo 4logo.png").
 *
 * Nenhuma escrita no banco. Saída em /tmp.
 */
import * as fs from 'fs'
import * as path from 'path'
import { db } from '../src/lib/db'

const INSTA = '/Users/cirotrigo/Documents/insta-automatico'
const OUT = '/tmp/comparacao-logos'

// LOGO_MAP copiado de insta-automatico/src/gpt-image.js:545
const LOGO_MAP: Record<string, string> = {
  bacana: 'logo-branca.png',
  'by-rock': 'logo.png',
  'emporio-fonseca': 'logo-branca.png',
  'espeto-gaucho': 'logo.png',
  'lagosta-criativa': 'logo.png',
  'quintal-parrilla': 'logo-verde.png',
  'real-gelateria': 'logo-selo-R-dourado.png',
  'seu-quinto': 'logo-amarelo.png',
  tero: 'logo.png',
  'wine-vix': 'logo.png',
}

const SLUG_POR_PROJETO: Record<number, string> = {
  1: 'real-gelateria',
  2: 'quintal-parrilla',
  3: 'tero',
  4: 'seu-quinto',
  5: 'bacana',
  6: 'espeto-gaucho',
  7: 'by-rock',
  8: 'lagosta-criativa',
  11: 'wine-vix',
  12: 'emporio-fonseca',
}

const CELL = 420

async function main() {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  fs.mkdirSync(OUT, { recursive: true })

  const projects = await db.project.findMany({
    where: { id: { in: Object.keys(SLUG_POR_PROJETO).map(Number) } },
    select: { id: true, name: true, Logo: { select: { name: true, fileUrl: true, isProjectLogo: true } } },
    orderBy: { id: 'asc' },
  })

  const linhas = projects.length
  const canvas = createCanvas(CELL * 2 + 300, CELL * linhas)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i]
    const slug = SLUG_POR_PROJETO[p.id]
    const y = i * CELL

    // Faixa xadrez para enxergar transparência
    ctx.fillStyle = i % 2 ? '#eceff3' : '#f7f8fa'
    ctx.fillRect(0, y, canvas.width, CELL)

    ctx.fillStyle = '#111'
    ctx.font = 'bold 24px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`[${p.id}] ${p.name}  (${slug})`, 16, y + 12)
    ctx.font = '18px sans-serif'
    ctx.fillStyle = '#555'
    ctx.fillText('STUDIO (isProjectLogo)', 16, y + 46)
    ctx.fillText(`INSTA-AUTOMATICO (${LOGO_MAP[slug]})`, CELL + 316, y + 46)

    const marcada = p.Logo.find((l) => l.isProjectLogo)

    // Esquerda: Studio
    if (marcada) {
      try {
        const res = await fetch(marcada.fileUrl)
        const buf = Buffer.from(await res.arrayBuffer())
        const img = await loadImage(buf)
        desenhar(ctx, img, 16, y + 80, CELL - 32, CELL - 110)
        ctx.fillStyle = '#777'
        ctx.font = '15px sans-serif'
        ctx.fillText(marcada.name.slice(0, 40), 16, y + CELL - 26)
      } catch (e) {
        ctx.fillStyle = '#c00'
        ctx.fillText(`erro ao baixar: ${e}`, 16, y + 100)
      }
    } else {
      ctx.fillStyle = '#c00'
      ctx.fillText('NENHUMA marcada', 16, y + 100)
    }

    // Direita: insta-automatico
    const p2 = path.join(INSTA, 'templates', slug, 'assets', LOGO_MAP[slug])
    if (fs.existsSync(p2)) {
      const img = await loadImage(fs.readFileSync(p2))
      desenhar(ctx, img, CELL + 316, y + 80, CELL - 32, CELL - 110)
    } else {
      ctx.fillStyle = '#c00'
      ctx.fillText('arquivo ausente', CELL + 316, y + 100)
    }
  }

  const file = path.join(OUT, 'comparacao.png')
  fs.writeFileSync(file, canvas.toBuffer('image/png'))
  console.log(file)
}

function desenhar(ctx: any, img: any, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height, 1)
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
