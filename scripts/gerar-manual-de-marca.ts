/**
 * Gera o MANUAL DE MARCA de um cliente com as fontes REAIS do projeto, a
 * paleta, a logo, os elementos da aba Assets e o estilo lido das peças
 * aprovadas (`BrandDNA.estiloDasReferencias`). Ver `src/lib/ai/manual-de-marca.ts`.
 *
 * Dry-run por padrão: grava o PNG em `.tmp-medicao-estilo-chatgpt/manuais/`
 * para conferir no olho. `--aplicar` sobe o PNG para o Blob e aponta
 * `Project.brandManualUrl` para ele — o manual anterior fica registrado no
 * log do script (`manuais/ANTERIORES.txt`) para voltar se preciso.
 *
 * Uso:
 *   npx tsx scripts/gerar-manual-de-marca.ts --projeto 6
 *   npx tsx scripts/gerar-manual-de-marca.ts --projeto 6 --aplicar
 *   npx tsx scripts/gerar-manual-de-marca.ts --todos
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { put } from '@vercel/blob'
import { db } from '../src/lib/db'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { lerEstiloDasReferencias } from '../src/lib/brand/estilo-das-referencias'
import { renderManualDeMarca } from '../src/lib/ai/manual-de-marca'

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (nome: string) => process.argv.includes(`--${nome}`)

const VARIANTE_DE_COR = /-(vermelh[oa]|amarel[oa]|branc[oa]|pret[oa]|dourad[oa]|verde|azul)(\.(png|jpe?g|webp|svg))?$/i
/** Ordem de preferência entre as variantes de cor de um mesmo ícone. */
const PREFERENCIA = ['vermelh', 'amarel', 'dourad', 'verde', 'azul', 'pret', 'branc']

/**
 * Um ícone por FAMÍLIA (relogio-vermelho / -amarelo / -branco viram um só), a
 * variante mais próxima da cor de destaque primeiro; só elementos COM
 * categoria — o Espeto tem 48 arquivos sem categoria que são cópias dos
 * categorizados mais sombras de design. Ícones até 8, gráficos até 8.
 */
function escolherElementos(rows: Array<{ name: string; fileUrl: string; category: string | null }>) {
  // Sombras de design e arquivos de trabalho não são elementos da marca.
  const uteis = rows.filter((r) => !/sombra|shadow|mockup|teste/i.test(r.name))
  const categorizados = uteis.filter((r) => r.category)
  const base = categorizados.length ? categorizados : uteis
  const porFamilia = new Map<string, { name: string; fileUrl: string; categoria: string | null; peso: number }>()
  for (const r of base) {
    const nome = r.name.replace(/\.(png|jpe?g|webp|svg)$/i, '')
    const familia = `${r.category ?? ''}:${nome.replace(VARIANTE_DE_COR, '')}`.toLowerCase()
    const cor = (VARIANTE_DE_COR.exec(nome)?.[1] ?? '').toLowerCase()
    const peso = PREFERENCIA.findIndex((c) => cor.startsWith(c))
    const atual = porFamilia.get(familia)
    const pesoNormalizado = peso < 0 ? 99 : peso
    if (!atual || pesoNormalizado < atual.peso) porFamilia.set(familia, { name: nome, fileUrl: r.fileUrl, categoria: r.category, peso: pesoNormalizado })
  }
  const lista = [...porFamilia.values()]
  const icones = lista.filter((e) => (e.categoria ?? '').toLowerCase() === 'icones').slice(0, 8)
  const graficos = lista.filter((e) => (e.categoria ?? '').toLowerCase() !== 'icones').slice(0, 8)
  return [...icones, ...graficos].map(({ name, fileUrl, categoria }) => ({ name, fileUrl, categoria }))
}

async function main() {
  const aplicar = flag('aplicar')
  const saida = path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'manuais')
  await fs.mkdir(saida, { recursive: true })

  const projetos = flag('todos')
    ? await db.project.findMany({ select: { id: true, name: true, brandManualUrl: true }, orderBy: { id: 'asc' } })
    : await db.project.findMany({ where: { id: Number(arg('projeto')) }, select: { id: true, name: true, brandManualUrl: true } })
  if (projetos.length === 0) throw new Error('informe --projeto <id> ou --todos')

  for (const p of projetos) {
    const brand = await loadBrandContext(p.id)
    if (!brand) continue
    const dna = await db.brandDNA.findUnique({ where: { projectId: p.id }, select: { estiloDasReferencias: true } })
    const estilo = lerEstiloDasReferencias(dna?.estiloDasReferencias)
    const elementos = escolherElementos(
      await db.element.findMany({
        where: { projectId: p.id },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: { name: true, fileUrl: true, category: true },
      }),
    )
    console.log(`\n══ ${p.name} (${p.id}) · fontes ${brand.fonts.title ?? '-'} / ${brand.fonts.subtitle ?? '-'} / ${brand.fonts.body ?? '-'} · estilo ${estilo ? 'lido' : 'ausente'} · ${elementos.length} elemento(s)`)
    const png = await renderManualDeMarca({ brand, estilo, elementos })
    const arquivo = path.join(saida, `${p.id}-manual.png`)
    await fs.writeFile(arquivo, png)
    console.log(`PNG: ${arquivo}`)
    if (aplicar) {
      const blob = await put(`brand-manual/${p.id}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-gerado.png`, png, {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: true,
      })
      await fs.appendFile(path.join(saida, 'ANTERIORES.txt'), `${new Date().toISOString()} projeto ${p.id}: ${p.brandManualUrl ?? '(nenhum)'} → ${blob.url}\n`)
      await db.project.update({ where: { id: p.id }, data: { brandManualUrl: blob.url } })
      console.log(`→ Project.brandManualUrl = ${blob.url} (anterior: ${p.brandManualUrl ?? 'nenhum'})`)
    }
  }
  if (!aplicar) console.log('\ndry-run — nada aplicado. Confira os PNGs e rode com --aplicar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
