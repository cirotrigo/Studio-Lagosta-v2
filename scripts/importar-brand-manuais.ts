/**
 * Importa os manuais de identidade feitos por DESIGNER que só existiam no
 * insta-automatico (`templates/<slug>/assets/brand-manual.png`) para o Blob, e
 * aponta `Project.brandManualUrl` para a cópia permanente.
 *
 * Por que isso importa: no insta-automatico o manual do designer tem
 * prioridade absoluta sobre qualquer card auto-gerado — "funciona MUITO melhor".
 * O `brand-reference-card.ts` do Studio passou a preferi-lo quando existe;
 * este script é o que faz ele existir.
 *
 * DRY-RUN POR PADRÃO. Para aplicar de verdade:
 *   npx tsx scripts/importar-brand-manuais.ts --aplicar
 * Um projeto só:
 *   npx tsx scripts/importar-brand-manuais.ts --projeto 7 --aplicar
 *
 * ⚠️ Escreve no banco do `.env`, que é PRODUÇÃO. A escrita é de uma coluna
 * nova e nula em todos os projetos — sem `--aplicar` nada acontece.
 */
import * as fs from 'fs'
import * as path from 'path'
import { put } from '@vercel/blob'
import { db } from '../src/lib/db'

const INSTA_ROOT = process.env.INSTA_AUTOMATICO_ROOT || '/Users/cirotrigo/Documents/insta-automatico'

/**
 * Projeto do Studio → slug do insta-automatico. Mapa explícito: os nomes não
 * batem por normalização ("O Quintal Parrilla" → `quintal-parrilla`) e
 * adivinhar por slug geraria upload no projeto errado.
 */
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

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const filtroIdx = process.argv.indexOf('--projeto')
  const filtro = filtroIdx >= 0 ? Number(process.argv[filtroIdx + 1]) : null

  const alvos = Object.entries(SLUG_POR_PROJETO)
    .map(([id, slug]) => ({ id: Number(id), slug }))
    .filter((a) => filtro === null || a.id === filtro)

  console.log(aplicar ? '🔴 MODO APLICAR — grava no banco\n' : '🔵 DRY-RUN — nada é gravado (use --aplicar)\n')

  let importados = 0
  let pulados = 0

  for (const { id, slug } of alvos) {
    const projeto = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, brandManualUrl: true },
    })
    if (!projeto) {
      console.log(`[${id}] projeto não existe — pulando`)
      pulados++
      continue
    }

    if (projeto.brandManualUrl) {
      console.log(`[${id}] ${projeto.name}: já tem manual (${projeto.brandManualUrl.slice(0, 60)}…) — pulando`)
      pulados++
      continue
    }

    const dir = path.join(INSTA_ROOT, 'templates', slug, 'assets')
    const arquivo = ['brand-manual.png', 'brand-manual.jpg', 'brand-manual.jpeg']
      .map((n) => path.join(dir, n))
      .find((p) => fs.existsSync(p))

    if (!arquivo) {
      console.log(`[${id}] ${projeto.name} (${slug}): sem brand-manual no insta-automatico — pulando`)
      pulados++
      continue
    }

    const bytes = fs.readFileSync(arquivo)
    const kb = Math.round(bytes.length / 1024)
    console.log(`[${id}] ${projeto.name} (${slug}): ${path.basename(arquivo)} — ${kb} KB`)

    if (!aplicar) {
      importados++
      continue
    }

    const ext = path.extname(arquivo).toLowerCase()
    const blob = await put(`brand-manual/${id}-${slug}${ext}`, bytes, {
      access: 'public',
      contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
      // O nome já é único por projeto; sem sufixo aleatório dá para reimportar
      // por cima quando o designer manda uma versão nova.
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    await db.project.update({ where: { id }, data: { brandManualUrl: blob.url } })
    console.log(`      ✅ ${blob.url}`)
    importados++
  }

  console.log(`\n${importados} importado(s), ${pulados} pulado(s).`)
  if (!aplicar && importados > 0) console.log('Nada foi gravado. Rode de novo com --aplicar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
