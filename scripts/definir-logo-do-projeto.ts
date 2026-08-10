/**
 * Define qual `Logo` é a do projeto (`isProjectLogo`), a partir da URL do Blob.
 *
 * É a logo que o `loadBrandContext` entrega aos geradores e que o
 * `logo-compositor` cola na arte — em 10/08/2026, 6 dos 10 projetos estavam
 * apontando para um ícone ou para a versão de cor errada, divergindo do
 * `LOGO_MAP` que o insta-automatico usava.
 *
 * Marca a escolhida e DESMARCA as outras do mesmo projeto: `isProjectLogo` é
 * singular na prática (o loader faz `orderBy isProjectLogo desc, take 1`), e
 * deixar duas marcadas transforma a escolha em sorteio por `createdAt`.
 *
 * DRY-RUN POR PADRÃO:
 *   npx tsx scripts/definir-logo-do-projeto.ts
 *   npx tsx scripts/definir-logo-do-projeto.ts --aplicar
 *   npx tsx scripts/definir-logo-do-projeto.ts --folha   # folha de contato em /tmp
 */
import * as fs from 'fs'
import { db } from '../src/lib/db'

/** URLs escolhidas pelo Ciro em 10/08/2026. */
const ESCOLHAS: string[] = [
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/5/logos/1765457389127-bacana.png',
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/8/logos/1760925708911-logo-lagosta-criativa-preto.png',
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/12/logos/1771683215986-Ativo_2icones.png',
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/3/logos/1759897315226-TERO_brasaevinho-branco.png',
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/2/logos/1759895328790-Ativo_1logo.png',
  'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/projects/4/logos/1759948024025-Ativo_1branco.png',
]

const CELL = 420

async function folhaDeContato(
  linhas: Array<{ projeto: string; atual?: { name: string; fileUrl: string }; nova: { name: string; fileUrl: string } }>,
) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const canvas = createCanvas(CELL * 2 + 300, CELL * linhas.length)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const desenhar = async (url: string, x: number, y: number, w: number, h: number) => {
    try {
      const res = await fetch(url)
      const img = await loadImage(Buffer.from(await res.arrayBuffer()))
      const s = Math.min(w / img.width, h / img.height, 1)
      ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
    } catch {
      ctx.fillStyle = '#c00'
      ctx.fillText('erro ao baixar', x, y + 20)
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    const y = i * CELL
    ctx.fillStyle = i % 2 ? '#eceff3' : '#f7f8fa'
    ctx.fillRect(0, y, canvas.width, CELL)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 24px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(l.projeto, 16, y + 12)
    ctx.font = '18px sans-serif'
    ctx.fillStyle = '#777'
    ctx.fillText(`ANTES: ${l.atual?.name ?? '(nenhuma)'}`, 16, y + 46)
    ctx.fillStyle = '#0a7'
    ctx.fillText(`DEPOIS: ${l.nova.name}`, CELL + 316, y + 46)
    if (l.atual) await desenhar(l.atual.fileUrl, 16, y + 80, CELL - 32, CELL - 110)
    await desenhar(l.nova.fileUrl, CELL + 316, y + 80, CELL - 32, CELL - 110)
  }

  fs.mkdirSync('/tmp/logos-decisao', { recursive: true })
  const file = '/tmp/logos-decisao/antes-depois.png'
  fs.writeFileSync(file, canvas.toBuffer('image/png'))
  console.log(`\nfolha de contato: ${file}`)
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const querFolha = process.argv.includes('--folha')

  console.log(aplicar ? '🔴 MODO APLICAR — grava no banco\n' : '🔵 DRY-RUN — nada é gravado (use --aplicar)\n')

  const linhas: Array<{ projeto: string; atual?: { name: string; fileUrl: string }; nova: { name: string; fileUrl: string } }> = []

  for (const url of ESCOLHAS) {
    const escolhida = await db.logo.findFirst({
      where: { fileUrl: url },
      select: { id: true, name: true, fileUrl: true, projectId: true, isProjectLogo: true },
    })
    if (!escolhida) {
      console.log(`❌ nenhuma Logo com esta URL: ${url}`)
      continue
    }

    const projeto = await db.project.findUnique({
      where: { id: escolhida.projectId },
      select: { name: true },
    })
    const atual = await db.logo.findFirst({
      where: { projectId: escolhida.projectId, isProjectLogo: true },
      select: { id: true, name: true, fileUrl: true },
    })

    const rotulo = `[${escolhida.projectId}] ${projeto?.name ?? '?'}`
    if (atual?.id === escolhida.id) {
      console.log(`${rotulo}: já é "${escolhida.name}" — nada a fazer`)
      continue
    }

    console.log(`${rotulo}: "${atual?.name ?? '(nenhuma)'}" → "${escolhida.name}"`)
    linhas.push({ projeto: rotulo, atual: atual ?? undefined, nova: escolhida })

    if (aplicar) {
      // Desmarca as outras ANTES de marcar: se o processo morrer no meio, o
      // pior estado é "nenhuma marcada" (o loader cai no createdAt) e não
      // "duas marcadas", que é escolha por sorteio.
      await db.logo.updateMany({
        where: { projectId: escolhida.projectId, isProjectLogo: true },
        data: { isProjectLogo: false },
      })
      await db.logo.update({ where: { id: escolhida.id }, data: { isProjectLogo: true } })
      console.log('      ✅ gravado')
    }
  }

  if (querFolha && linhas.length > 0) await folhaDeContato(linhas)
  if (!aplicar) console.log('\nNada foi gravado. Confira e rode com --aplicar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
