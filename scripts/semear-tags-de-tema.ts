/**
 * Leva os PILARES aprovados de cada cliente para o vocabulário de tags
 * (`ProjectTag`) — a lista que aparece no TagInput de quem vai taguear um
 * modelo (16/08/2026).
 *
 * Por que isto e não uma taxonomia nova: os pilares da F2 JÁ são "a taxonomia
 * fechada de temas de UM cliente", com slug normalizado, propostos a partir do
 * histórico do próprio cliente e **aprovados por gente**. Inventar um segundo
 * vocabulário de temas criaria justamente o problema que os pilares vieram
 * resolver — "happy hour" e "drinks" em baldes diferentes.
 *
 * O que este script NÃO faz:
 *  - não toca em `Page.tags` (taguear modelo é curadoria item a item, feita
 *    olhando a arte — ver `scripts/taguear-modelos-sem-tema.ts`);
 *  - não apaga o que já está em `ProjectTag`. Hoje essa lista é quase toda
 *    dia-da-semana e nome de arquivo ("Template", "Página 1", "Quarta-feira
 *    (Cópia)"); limpar é outra decisão, e destrutiva.
 *
 * `ProjectTag` é só a fonte de SUGESTÃO do autocomplete — semear não muda o
 * comportamento de busca de ninguém. Quem casa modelo com tema é `Page.tags` +
 * `Template.tags`, via `prepareCreative`.
 *
 *   npx tsx scripts/semear-tags-de-tema.ts              # dry-run
 *   npx tsx scripts/semear-tags-de-tema.ts --confirmar
 *   npx tsx scripts/semear-tags-de-tema.ts --desfazer   # remove só o que semeou
 */
import { db } from '@/lib/db'

/** Mesma paleta e rotação de `/api/projects/[id]/modelos` e da rota de tags. */
const TAG_COLORS = [
  '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#EF4444', '#06B6D4', '#84CC16',
]

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const desfazer = process.argv.includes('--desfazer')
  console.log(desfazer ? '=== DESFAZER ===' : confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (use --confirmar) ===')

  const projetos = await db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
  let criadas = 0
  let removidas = 0

  for (const projeto of projetos) {
    const pilares = await db.contentPillar.findMany({
      where: { projectId: projeto.id, aprovado: true },
      select: { slug: true, nome: true },
      orderBy: { slug: 'asc' },
    })
    if (pilares.length === 0) {
      console.log(`\n${projeto.name}: sem pilar aprovado — pulando (a taxonomia se aprova na aba Marca).`)
      continue
    }

    const existentes = await db.projectTag.findMany({
      where: { projectId: projeto.id },
      select: { id: true, name: true },
    })
    const jaTem = new Map(existentes.map((t) => [t.name.toLowerCase(), t.id]))

    if (desfazer) {
      const alvo = pilares.map((p) => p.slug).filter((s) => jaTem.has(s.toLowerCase()))
      console.log(`\n${projeto.name}: remover ${alvo.length} — [${alvo.join(', ') || '—'}]`)
      if (confirmarOuDesfazer()) {
        for (const slug of alvo) {
          await db.projectTag.delete({ where: { id: jaTem.get(slug.toLowerCase())! } })
          removidas++
        }
      }
      continue
    }

    const faltando = pilares.filter((p) => !jaTem.has(p.slug.toLowerCase()))
    console.log(`\n${projeto.name}: ${pilares.length} pilar(es) aprovado(s), ${faltando.length} a semear`)
    for (const p of pilares) {
      const nova = faltando.some((f) => f.slug === p.slug)
      console.log(`   ${nova ? '+' : '·'} ${p.slug.padEnd(28)} "${p.nome}"${nova ? '' : '  (já existe)'}`)
    }
    if (faltando.length === 0 || !confirmar) continue

    const offset = existentes.length
    await db.projectTag.createMany({
      data: faltando.map((p, i) => ({
        name: p.slug,
        color: TAG_COLORS[(offset + i) % TAG_COLORS.length],
        projectId: projeto.id,
      })),
    })
    criadas += faltando.length
  }

  function confirmarOuDesfazer() {
    return confirmar || desfazer
  }

  console.log(
    `\n${
      desfazer
        ? `${removidas} tag(s) removida(s).`
        : confirmar
          ? `${criadas} tag(s) criada(s).`
          : 'Nada foi gravado (dry-run).'
    }`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
