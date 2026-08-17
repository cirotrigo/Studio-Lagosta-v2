/**
 * Dá TAG DE TEMA aos modelos que só tinham tag de DIA (16/08/2026).
 *
 * Por que existe: nenhum dos 20 modelos estava literalmente sem tag, mas 8
 * tinham só o dia da semana. Isso não serve para a busca por tema —
 * `prepareCreative` (`src/lib/creatives/arte-rapida.ts`) casa o tema pedido
 * contra `Page.tags` + `Template.tags` e FALHA quando nada bate. O dia já é
 * resolvido por outro caminho (`casaComDia`, que lê o NOME da página e do
 * template), então a tag de dia era redundante e o modelo ficava inalcançável
 * por assunto: pedir "faz o story de almoço executivo" não achava nenhum
 * deles.
 *
 * As tags NÃO são inferidas por heurística: cada uma foi lida da copy real da
 * página e está declarada aqui, uma a uma, junto do trecho que a justifica.
 * Precedente: `scripts/corrigir-crivo-importado.ts`.
 *
 *   npx tsx scripts/taguear-modelos-sem-tema.ts              # dry-run
 *   npx tsx scripts/taguear-modelos-sem-tema.ts --confirmar  # grava
 *   npx tsx scripts/taguear-modelos-sem-tema.ts --desfazer   # remove só o que este script pôs
 */
import { db } from '@/lib/db'

/** ACRESCENTA — nunca substitui. A tag de dia existente é preservada: quem
 *  remove tag é decisão de curadoria humana, não de script. */
type Curadoria = {
  pageId: string
  cliente: string
  pagina: string
  /** O que a arte diz — a evidência que sustenta as tags. */
  copy: string
  acrescentar: string[]
}

const CURADORIA: Curadoria[] = [
  {
    pageId: 'cmj3mmwv00001jo04em8k2muy',
    cliente: 'O Quintal Parrilla',
    pagina: 'Pag.01',
    copy: '"Pasteis Doces" / "sobremesa exclusiva" / "No almoço executivo" / "11h às 16h"',
    acrescentar: ['almoco-executivo', 'sobremesa'],
  },
  {
    pageId: 'cmksfi9ti000rkz04vcjwyatu',
    cliente: 'By Rock',
    pagina: 'Página 8',
    copy: '"Sabor No volume máximo" / "Ribs barbecue"',
    acrescentar: ['ribs', 'barbecue'],
  },
  {
    pageId: 'cmjcbziqj0001ji04s45as0vy',
    cliente: 'By Rock',
    pagina: 'Pag.02',
    copy: '"ALMOÇO"',
    acrescentar: ['almoco'],
  },
  {
    pageId: 'cmgwjaokz0005swmlw4oonoff',
    cliente: 'By Rock',
    pagina: 'Pag.01',
    copy: '"ALMOço" / "executivo" / "segunda a sexta | 11h às 16h"',
    acrescentar: ['almoco-executivo'],
  },
  {
    pageId: 'cmjda49730001kz04nbk0ohmw',
    cliente: 'By Rock',
    pagina: 'Pag.06',
    copy: '"happy" / "hour" / "todo dia"',
    acrescentar: ['happy-hour'],
  },
  {
    pageId: 'cmhz1mkkt0001lg04btppiwqp',
    cliente: 'By Rock',
    pagina: 'Pag.09',
    copy: '"Seu almoço" / "de domingo" / "Chame no direct que te mando o cardápio"',
    acrescentar: ['almoco'],
  },
  {
    pageId: 'cmlpbexrv003nl8040zd0kyuj',
    cliente: 'TERO',
    pagina: 'Pag.08',
    copy: '"Nhoque ao mar" / "Clássicos tero"',
    acrescentar: ['prato-do-dia', 'classicos'],
  },
  {
    pageId: 'cml59ykr10005if04qvbsbgra',
    cliente: 'Wine Vix',
    pagina: 'Página 1',
    copy: '"Promoção de exclusiva" (copy genérica — tag conservadora)',
    acrescentar: ['promocao'],
  },
]

/** Mesma normalização da rota de tags e do TagInput. */
function normalizar(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const desfazer = process.argv.includes('--desfazer')
  console.log(desfazer ? '=== DESFAZER ===' : confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (use --confirmar para gravar) ===')

  let mudados = 0
  for (const item of CURADORIA) {
    const page = await db.page.findUnique({
      where: { id: item.pageId },
      select: { id: true, name: true, tags: true, isTemplate: true },
    })
    if (!page) {
      console.log(`\n!! ${item.cliente} · "${item.pagina}" — página não existe mais (${item.pageId}); pulando.`)
      continue
    }
    if (!page.isTemplate) {
      console.log(`\n!! ${item.cliente} · "${item.pagina}" — não é mais modelo; pulando (curadoria mudou depois deste script).`)
      continue
    }

    const atuais = page.tags ?? []
    const novas = item.acrescentar.map(normalizar).filter(Boolean)
    const alvo = desfazer
      ? atuais.filter((t) => !novas.includes(normalizar(t)))
      : Array.from(new Set([...atuais, ...novas]))

    const igual = alvo.length === atuais.length && alvo.every((t, i) => t === atuais[i])
    console.log(`\n${item.cliente} · "${page.name}"`)
    console.log(`   copy: ${item.copy}`)
    console.log(`   antes:  [${atuais.join(', ') || '—'}]`)
    console.log(`   depois: [${alvo.join(', ') || '—'}]${igual ? '  (sem mudança)' : ''}`)

    if (igual || !(confirmar || desfazer)) continue
    await db.page.update({ where: { id: page.id }, data: { tags: alvo } })
    mudados++
  }

  console.log(
    `\n${confirmar || desfazer ? `${mudados} modelo(s) atualizado(s).` : 'Nada foi gravado (dry-run).'}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
