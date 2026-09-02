/**
 * Saneamento dos MODELOS do O Quintal Parrilla (projectId 2) — 01/09/2026.
 *
 * O teste real do dia pelo caminho padrão das ferramentas mostrou três coisas
 * que este script conserta no DADO (o código foi consertado à parte):
 *
 *  (a) `escolher-modelo("almoço executivo")` devolvia a página LEGADA "Pag.01"
 *      do template "Segunda-feira" (dez/2025): campos de texto NÃO dinâmicos e
 *      foto que não é aplicada. É modelo só no flag — como arte, não serve de
 *      base. Aqui ela é DESPROMOVIDA (`isTemplate: false`), nunca apagada, e o
 *      mesmo vale para qualquer outra página-modelo do projeto cujo template
 *      não venha do lote do gerador (`lote-tema-2026-08`) e cujas camadas de
 *      texto sejam todas `isDynamic: false`.
 *
 *  (b) Os 3 layouts de "O Quintal Parrilla — Happy Hour (3 layouts)" trazem
 *      "Ter a Sex, das 17h às 19h" no slot `info-1` e "Não vale em feriado."
 *      na descrição de fábrica — a base diz 16h, e a ressalva de feriado não
 *      é afirmação para toda peça. Os `content` são trocados nas camadas e a
 *      gravação chama `invalidateScheduledRenders` (regra da casa: quem grava
 *      `Page.layers` devolve à fila os posts que dependem da página).
 *
 *  (c) Os modelos do lote usam VÉU (gradiente de faixa); o padrão da casa
 *      virou HALO (caixa desfocada atrás do texto) e o gerador já desenha
 *      assim. Este script NÃO regenera nada: a regeneração é
 *
 *        npx tsx scripts/criar-templates-por-tema.ts --projeto 2 --desfazer --confirmar
 *        npx tsx scripts/criar-templates-por-tema.ts --projeto 2 --confirmar
 *
 *      e é decisão de quem roda — apaga e recria as páginas do lote (ids
 *      novos), e o item (b) acima deixa de importar para o happy hour porque
 *      a copy de fábrica do kit já saiu corrigida. O tema "funcionamento"
 *      (TEMAS_EXTRAS) também nasce nessa rodada.
 *
 *   npx tsx scripts/sanear-modelos-quintal.ts               # dry-run (só leitura)
 *   npx tsx scripts/sanear-modelos-quintal.ts --confirmar   # grava
 */
import { db } from '../src/lib/db'
import { lerCamadas, type PageLayer } from '../src/lib/posts/page-layers'
import { invalidateScheduledRenders } from '../src/lib/posts/invalidate-renders'

const PROJECT_ID = 2
const MARCA_DO_LOTE = 'lote-tema-2026-08'
/** A página legada que o teste de 01/09 apontou — despromovida sempre. */
const PAGINA_LEGADA = 'cmj3mmwv00001jo04em8k2muy'

const TROCAS: Array<{ de: string; para: string }> = [
  { de: 'Ter a Sex, das 17h às 19h', para: 'Ter a Sex, das 16h às 19h' },
  { de: ' Não vale em feriado.', para: '' },
]

function textosDe(camadas: PageLayer[]) {
  return camadas.filter((c) => c.type === 'text')
}

async function despromover(confirmar: boolean) {
  console.log('── (a) páginas-modelo que não servem de base ──')
  const paginas = await db.page.findMany({
    where: { isTemplate: true, Template: { projectId: PROJECT_ID } },
    select: {
      id: true, name: true, layers: true, tags: true, createdAt: true,
      Template: { select: { id: true, name: true, tags: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const alvo: Array<{ id: string; motivo: string }> = []
  for (const p of paginas) {
    const doLote = (p.Template.tags ?? []).includes(MARCA_DO_LOTE)
    const { camadas, legivel } = lerCamadas(p.layers)
    const textos = textosDe(camadas)
    const dinamicos = textos.filter((t) => t.isDynamic === true).length
    const rotulo = `${p.id} "${p.name}" ← T${p.Template.id} "${p.Template.name}" (${p.createdAt.toISOString().slice(0, 10)})`

    if (p.id === PAGINA_LEGADA) {
      alvo.push({ id: p.id, motivo: 'página legada apontada no teste de 01/09' })
      console.log(`  ✗ ${rotulo}\n      textos: ${textos.length}, dinâmicos: ${dinamicos}, legível: ${legivel} → DESPROMOVER (legada)`)
      continue
    }
    if (doLote) {
      console.log(`  · ${rotulo} — do lote do gerador; fica`)
      continue
    }
    if (!legivel) {
      console.log(`  ? ${rotulo} — camadas ILEGÍVEIS; revisar à mão, não mexo`)
      continue
    }
    if (textos.length === 0) {
      console.log(`  ? ${rotulo} — sem camada de texto; revisar à mão, não mexo`)
      continue
    }
    if (dinamicos === 0) {
      alvo.push({ id: p.id, motivo: `${textos.length} texto(s), nenhum dinâmico` })
      console.log(`  ✗ ${rotulo}\n      textos: ${textos.length}, dinâmicos: 0 → DESPROMOVER`)
      continue
    }
    console.log(`  · ${rotulo} — ${dinamicos}/${textos.length} textos dinâmicos; fica`)
  }

  if (alvo.length === 0) {
    console.log('  nada a despromover.')
    return
  }
  if (confirmar) {
    const r = await db.page.updateMany({ where: { id: { in: alvo.map((a) => a.id) } }, data: { isTemplate: false } })
    console.log(`  → ${r.count} página(s) despromovida(s) (isTemplate: false). Nada foi apagado.`)
  } else {
    console.log(`  → ${alvo.length} página(s) seriam despromovidas (dry-run).`)
  }
}

async function corrigirHappyHour(confirmar: boolean) {
  console.log('\n── (b) copy de fábrica do Happy Hour ──')
  const template = await db.template.findFirst({
    where: { projectId: PROJECT_ID, name: { contains: 'Happy Hour (3 layouts)' }, tags: { has: MARCA_DO_LOTE } },
    select: { id: true, name: true, Page: { select: { id: true, name: true, layers: true }, orderBy: { order: 'asc' } } },
  })
  if (!template) {
    console.log('  template "Happy Hour (3 layouts)" do lote não encontrado — nada a fazer (já regenerado?).')
    return
  }
  console.log(`  T${template.id} "${template.name}" — ${template.Page.length} página(s)`)

  const alteradas: string[] = []
  for (const p of template.Page) {
    const { camadas, legivel } = lerCamadas(p.layers)
    if (!legivel) {
      console.log(`  ? ${p.id} "${p.name}" — camadas ilegíveis; não mexo`)
      continue
    }
    let mudou = false
    for (const c of camadas) {
      if (c.type !== 'text' || typeof c.content !== 'string') continue
      const antes = c.content
      let depois = antes
      for (const t of TROCAS) depois = depois.split(t.de).join(t.para)
      if (depois !== antes) {
        console.log(`  ${p.id} "${p.name}" · ${c.id}\n      antes:  "${antes}"\n      depois: "${depois}"`)
        c.content = depois
        mudou = true
      }
    }
    if (!mudou) {
      console.log(`  · ${p.id} "${p.name}" — nada a trocar`)
      continue
    }
    alteradas.push(p.id)
    if (confirmar) {
      // Preserva a codificação com que a página foi gravada (string JSON no
      // lote; array nativo em outros caminhos) — ver page-layers.ts.
      const layers = typeof p.layers === 'string' ? JSON.stringify(camadas) : (camadas as unknown as object)
      await db.page.update({ where: { id: p.id }, data: { layers: layers as never } })
    }
  }

  if (alteradas.length === 0) return
  if (confirmar) {
    const r = await invalidateScheduledRenders(db, { pageIds: alteradas })
    console.log(`  → ${alteradas.length} página(s) gravada(s); ${r.invalidados} post(s) devolvidos à fila de render` +
      (r.congelados.length ? `; CONGELADOS (já no publicador, arte antiga vai ao ar): ${r.congelados.join(', ')}` : ''))
  } else {
    console.log(`  → ${alteradas.length} página(s) seriam gravadas + invalidateScheduledRenders (dry-run).`)
  }
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  console.log(confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (só leitura; use --confirmar para gravar) ===')
  await despromover(confirmar)
  await corrigirHappyHour(confirmar)
  console.log('\n── (c) halo ──')
  console.log('  Os modelos do lote ainda carregam VÉU. Regenerar com halo é decisão de quem roda:')
  console.log('    npx tsx scripts/criar-templates-por-tema.ts --projeto 2 --desfazer --confirmar')
  console.log('    npx tsx scripts/criar-templates-por-tema.ts --projeto 2 --confirmar')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
