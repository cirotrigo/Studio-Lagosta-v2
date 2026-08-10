/**
 * Leitura-só. Duas coisas:
 * 1. folha de contato das 9 logos do Seu Quinto (projeto 4) + a que o
 *    insta-automatico usava, para o Ciro escolher;
 * 2. luminância média de cada logo recém-marcada — para saber se o compositor,
 *    que escolhe o canto mais CALMO (não o de maior contraste), pode engolir
 *    uma logo clara num canto claro.
 */
import * as fs from 'fs'
import { db } from '../src/lib/db'

const INSTA = '/Users/cirotrigo/Documents/insta-automatico/templates/seu-quinto/assets/logo-amarelo.png'
const CELL = 300

async function main() {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const sharp = (await import('sharp')).default

  // ── 1. Folha do Seu Quinto ───────────────────────────────────────────────
  const logos = await db.logo.findMany({
    where: { projectId: 4 },
    select: { name: true, fileUrl: true, isProjectLogo: true },
    orderBy: { createdAt: 'asc' },
  })

  const cols = 4
  const rows = Math.ceil((logos.length + 1) / cols)
  const canvas = createCanvas(CELL * cols, CELL * rows + 40)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111'
  ctx.font = 'bold 22px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('SEU QUINTO (projeto 4) — 9 logos no Studio + a do insta-automatico (última)', 12, 10)

  const desenhar = async (buf: Buffer, i: number, rotulo: string, marcada: boolean) => {
    const x = (i % cols) * CELL
    const y = Math.floor(i / cols) * CELL + 40
    ctx.fillStyle = i % 2 ? '#f2f4f7' : '#fafbfc'
    ctx.fillRect(x, y, CELL, CELL)
    try {
      const img = await loadImage(buf)
      const s = Math.min((CELL - 30) / img.width, (CELL - 70) / img.height, 1)
      ctx.drawImage(img, x + (CELL - img.width * s) / 2, y + 34 + (CELL - 70 - img.height * s) / 2, img.width * s, img.height * s)
    } catch {}
    ctx.fillStyle = marcada ? '#c60' : '#333'
    ctx.font = marcada ? 'bold 15px sans-serif' : '15px sans-serif'
    ctx.fillText(`${marcada ? '★ ' : ''}${rotulo.slice(0, 30)}`, x + 10, y + 8)
  }

  for (let i = 0; i < logos.length; i++) {
    const res = await fetch(logos[i].fileUrl)
    await desenhar(Buffer.from(await res.arrayBuffer()), i, logos[i].name, logos[i].isProjectLogo)
  }
  if (fs.existsSync(INSTA)) {
    await desenhar(fs.readFileSync(INSTA), logos.length, 'INSTA: logo-amarelo.png', false)
  }
  fs.mkdirSync('/tmp/logos-decisao', { recursive: true })
  fs.writeFileSync('/tmp/logos-decisao/seu-quinto.png', canvas.toBuffer('image/png'))
  console.log('folha: /tmp/logos-decisao/seu-quinto.png')

  // ── 2. Luminância média das logos marcadas ───────────────────────────────
  console.log('\nLuminância média dos pixels VISÍVEIS de cada logo marcada')
  console.log('(0 = preto, 255 = branco; acima de ~200 a logo só aparece em canto escuro)\n')

  const marcadas = await db.logo.findMany({
    where: { isProjectLogo: true, projectId: { in: [1, 2, 3, 4, 5, 6, 7, 8, 11, 12] } },
    select: { name: true, fileUrl: true, projectId: true },
    orderBy: { projectId: 'asc' },
  })

  for (const l of marcadas) {
    try {
      const res = await fetch(l.fileUrl)
      const buf = Buffer.from(await res.arrayBuffer())
      const { data, info } = await sharp(buf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      let soma = 0
      let n = 0
      for (let p = 0; p < data.length; p += info.channels) {
        const a = data[p + 3]
        if (a < 128) continue // pixel transparente não conta
        soma += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
        n++
      }
      const media = n > 0 ? soma / n : 0
      const opaco = n / (info.width * info.height)
      const alerta = media > 200 ? '  ⚠️ CLARA — some em canto claro' : media < 60 ? '  (escura)' : ''
      console.log(
        `[${String(l.projectId).padStart(2)}] ${l.name.slice(0, 34).padEnd(34)} luminância ${media.toFixed(0).padStart(3)} | ${(opaco * 100).toFixed(0)}% opaca${alerta}`,
      )
    } catch (e) {
      console.log(`[${l.projectId}] ${l.name}: erro — ${e}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
