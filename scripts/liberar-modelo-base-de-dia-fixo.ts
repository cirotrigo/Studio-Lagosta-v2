/**
 * Tira a tag `quinta` dos templates "Story base (3 layouts)" (16/08/2026).
 *
 * Esses modelos são GENÉRICOS por desenho — as tags deles descrevem a
 * diagramação (topo/dividido/rodapé), não o assunto. Alguém carimbou `quinta`
 * no template porque, até hoje, era a única forma de o modelo aparecer na
 * sugestão: `casaComDia` só dá match quando o texto CONTÉM o nome do dia.
 * O efeito colateral era prender um modelo "para qualquer dia" a um dia só.
 *
 * 🔴 Este script SÓ faz sentido depois do curinga (`escolherModeloDoDia` em
 * `src/lib/posts/dia-semana.ts`). Rodá-lo antes REMOVIA os modelos da sugestão
 * em vez de liberá-los — medido: TERO e Wine Vix perdiam a quinta e não
 * ganhavam nenhum outro dia. Com o curinga, o modelo sem dia vira reserva de
 * todos os dias que não têm específico.
 *
 * Medido em produção, cobertura de dias com modelo:
 *   TERO      2 -> 7   (segunda específico + 6 pela reserva)
 *   Wine Vix  2 -> 7   (sexta específico + 6 pela reserva)
 *
 *   npx tsx scripts/liberar-modelo-base-de-dia-fixo.ts              # dry-run
 *   npx tsx scripts/liberar-modelo-base-de-dia-fixo.ts --confirmar
 *   npx tsx scripts/liberar-modelo-base-de-dia-fixo.ts --desfazer
 */
import { db } from '@/lib/db'

/** Declarado pelo NOME exato, não por heurística: o alvo são estes dois. */
const TEMPLATES_BASE = ['TERO — Story base (3 layouts)', 'Wine Vix — Story base (3 layouts)']
const TAG = 'quinta'

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const desfazer = process.argv.includes('--desfazer')
  console.log(desfazer ? '=== DESFAZER ===' : confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (use --confirmar) ===')

  let mudados = 0
  for (const nome of TEMPLATES_BASE) {
    const templates = await db.template.findMany({
      where: { name: nome },
      select: { id: true, name: true, tags: true, Project: { select: { name: true } } },
    })
    if (templates.length === 0) {
      console.log(`\n!! template "${nome}" não encontrado; pulando.`)
      continue
    }
    for (const t of templates) {
      const atuais = t.tags ?? []
      const alvo = desfazer
        ? Array.from(new Set([...atuais, TAG]))
        : atuais.filter((x) => x.toLowerCase() !== TAG)
      const igual = alvo.length === atuais.length && alvo.every((x, i) => x === atuais[i])

      console.log(`\n${t.Project.name} · template "${t.name}" (id ${t.id})`)
      console.log(`   antes:  [${atuais.join(', ') || '—'}]`)
      console.log(`   depois: [${alvo.join(', ') || '—'}]${igual ? '  (sem mudança)' : ''}`)

      if (igual || !(confirmar || desfazer)) continue
      await db.template.update({ where: { id: t.id }, data: { tags: alvo } })
      mudados++
    }
  }
  console.log(`\n${confirmar || desfazer ? `${mudados} template(s) atualizado(s).` : 'Nada foi gravado (dry-run).'}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
