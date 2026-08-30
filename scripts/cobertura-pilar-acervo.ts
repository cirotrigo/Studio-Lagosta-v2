/**
 * Cobertura do ACERVO INTEIRO por pilar aprovado — insumo do brief do fotógrafo.
 *
 * Complementa o relatorio-lacunas-do-acervo: lá o item 2 cruza pilar × fotos
 * DESTACADAS (lacuna de curadoria); aqui é pilar × catálogo completo — pilar
 * com pouquíssima foto casável é lacuna de FOTOGRAFIA, que curadoria nenhuma
 * resolve. "Casável" é casamento por palavra (descrição/tags/pasta): mede
 * presença do ASSUNTO, não qualidade da foto.
 *
 * Somente leitura; nunca chama buscarNoAcervo (registraria um LearningSignal
 * por busca). A versão semanal automatizada vive em
 * src/lib/relatorios/pauta-fotografos.ts (cron de segunda 09h BRT).
 *
 * USO: npx tsx scripts/cobertura-pilar-acervo.ts
 *
 * Achado da primeira rodada (30/08/2026): TERO "Rolha free" com ZERO fotos
 * casáveis num acervo de 1.398 — a única lacuna absoluta da carteira.
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import { lerCatalogoDoProjeto } from '../src/lib/creatives/acervo'
import { palavrasDoTema, casaComTema, type PilarParaBusca } from '../src/lib/creatives/ranquear-acervo'

async function main() {
  const projetos = await db.project.findMany({
    where: { OR: [{ googleDriveImagesFolderId: { not: null } }, { googleDriveFolderId: { not: null } }] },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  for (const p of projetos) {
    const pilares = await db.contentPillar.findMany({
      where: { projectId: p.id, aprovado: true },
      select: { slug: true, nome: true, exemplos: true },
      orderBy: { ordem: 'asc' },
    })
    if (pilares.length === 0) continue

    let todas
    try {
      todas = (await lerCatalogoDoProjeto(p.id)).todas
    } catch {
      console.log(`\n${p.name} (${p.id}): sem catálogo legível — pulado.`)
      continue
    }

    console.log(`\n${p.name} (${p.id}) — acervo de ${todas.length} fotos:`)
    for (const pilar of pilares) {
      const comoBusca: PilarParaBusca = { slug: pilar.slug, nome: pilar.nome, exemplos: pilar.exemplos }
      const palavras = palavrasDoTema(`${pilar.nome} ${pilar.slug}`, [comoBusca])
      const casam = todas.filter((img) => casaComTema(img, palavras).casa).length
      const pct = todas.length ? ((casam / todas.length) * 100).toFixed(1) : '0'
      const marca = casam === 0 ? ' 🔴 ZERO' : casam < 15 ? ' ⚠️ magro' : ''
      console.log(`  ${pilar.nome}: ${casam} foto(s) casáveis (${pct}%)${marca}`)
    }
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
